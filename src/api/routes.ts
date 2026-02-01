import { db } from "ponder:api";
import { lockups } from "ponder:schema";
import { Context, Hono } from "hono";
import { eq } from "ponder";
import { ethers, formatEther } from "ethers";
import { CoinSwapABI } from "../../abis/CoinSwap";
import { ERC20SwapABI } from "../../abis/ERC20Swap";
import { getSigner, prefix0x } from "../utils/evm";
import { SwapType } from "../../constants";
import { isValidAddress, isValidPreimage, isValidPreimageHash } from "../utils/validations";
import { getPreimageStore } from "../utils/preimageStore";
import { transactionQueue } from "../utils/transactionQueue";
import { CONTRACT_ADDRESSES } from "../../constants";

// Helper to create composite lockup ID
const createLockupId = (chainId: number, preimageHash: string) =>
  `${chainId}:${preimageHash}`;

const routes = new Hono();

/**
 * Wait for a lockup to be marked as claimed in the database.
 * Used to handle race conditions where Auto-Claim finished but Claim Event not yet indexed.
 * Default is: 5x2 seconds
 */
async function waitForClaimedLockup(
  lockupId: string,
  maxAttempts = 5,
  delayMs = 2000
): Promise<{ txHash: string; swapType: string | null } | null> {
  for (let attempt = 0; attempt < maxAttempts; attempt++) {
    await new Promise(resolve => setTimeout(resolve, delayMs));

    const lockup = await db.select().from(lockups)
      .where(eq(lockups.id, lockupId))
      .limit(1);

    if (lockup[0]?.claimed && lockup[0]?.claimTxHash) {
      return {
        txHash: lockup[0].claimTxHash,
        swapType: lockup[0].swapType,
      };
    }
  }
  return null;
}

routes.get("/check-preimagehash", async (c: Context) => {
  const preimageHash = c.req.query("preimageHash");
  const chainIdParam = c.req.query("chainId");

  if (!preimageHash) {
    return c.json({ error: "Preimage hash is required" }, 400);
  }

  // Validate preimageHash format
  if (!isValidPreimageHash(preimageHash)) {
    return c.json({ error: "Invalid preimageHash format. Must be 32 bytes (64 hex characters), optionally with 0x prefix" }, 400);
  }

  const normalizedHash = prefix0x(preimageHash);

  // If chainId is provided, look up specific lockup
  if (chainIdParam) {
    const chainId = parseInt(chainIdParam, 10);
    if (isNaN(chainId)) {
      return c.json({ error: "Invalid chainId" }, 400);
    }

    const lockupId = createLockupId(chainId, normalizedHash);
    const lockup = await db.select().from(lockups).where(eq(lockups.id, lockupId)).limit(1);

    if (!lockup.length) {
      return c.json({ error: "Lockup not found" }, 404);
    }

    const data = lockup[0]!;
    return c.json({
      lockup: {
        ...data,
        amount: data.amount?.toString(),
        timelock: data.timelock?.toString()
      }
    });
  }

  // Without chainId, search by preimageHash and return all matches
  const allLockups = await db.select().from(lockups).where(eq(lockups.preimageHash, normalizedHash));

  if (!allLockups.length) {
    return c.json({ error: "Lockup not found" }, 404);
  }

  return c.json({
    lockups: allLockups.map(data => ({
      ...data,
      amount: data.amount?.toString(),
      timelock: data.timelock?.toString()
    }))
  });
});

routes.post("/register-preimage", async (c: Context) => {
  const { preimageHash, preimage, swapId, customerAddress, targetChainId } = await c.req.json();

  if (!preimageHash || !preimage) {
    return c.json({ error: "preimageHash and preimage required" }, 400);
  }

  // Validate preimageHash format (32 bytes = 64 hex chars)
  if (!isValidPreimageHash(preimageHash)) {
    return c.json({ error: "Invalid preimageHash format. Must be 32 bytes (64 hex characters), optionally with 0x prefix" }, 400);
  }

  // Validate preimage format (32 bytes = 64 hex chars)
  if (!isValidPreimage(preimage)) {
    return c.json({ error: "Invalid preimage format. Must be 32 bytes (64 hex characters), optionally with 0x prefix" }, 400);
  }

  // For outflow swaps: customerAddress and targetChainId required
  if (targetChainId && !customerAddress) {
    return c.json({ error: "customerAddress required when targetChainId is specified" }, 400);
  }

  // Validate customerAddress format if provided (0x + 40 hex chars)
  if (customerAddress && !isValidAddress(customerAddress)) {
    return c.json({ error: "Invalid customerAddress format. Must be 0x followed by 40 hex characters" }, 400);
  }

  // Validate targetChainId if provided
  if (targetChainId && !CONTRACT_ADDRESSES[targetChainId]) {
    return c.json({ error: `Unsupported targetChainId: ${targetChainId}` }, 400);
  }

  try {
    const store = getPreimageStore();
    store.register(
      prefix0x(preimageHash),
      prefix0x(preimage),
      swapId,
      customerAddress,
      targetChainId
    );
    return c.json({ success: true });
  } catch (error) {
    console.error("Failed to register preimage:", error);
    return c.json({
      error: "Failed to register preimage",
      details: error instanceof Error ? error.message : String(error),
    }, 500);
  }
});

routes.post("/help-me-claim", async (c: Context) => {
  const { preimageHash, preimage, chainId: requestedChainId } = await c.req.json();

  if (!preimageHash) {
    return c.json({ error: "preimageHash is required" }, 400);
  }

  // Validate preimageHash format
  if (!isValidPreimageHash(preimageHash)) {
    return c.json({ error: "Invalid preimageHash format. Must be 32 bytes (64 hex characters), optionally with 0x prefix" }, 400);
  }

  // Validate preimage is provided and has correct format
  if (!preimage) {
    return c.json({ error: "preimage is required" }, 400);
  }

  if (!isValidPreimage(preimage)) {
    return c.json({ error: "Invalid preimage format. Must be 32 bytes (64 hex characters), optionally with 0x prefix" }, 400);
  }

  const normalizedHash = prefix0x(preimageHash);

  // Find the lockup - either by specific chainId or search all
  let lockupData;
  let lockupId: string;

  if (requestedChainId) {
    lockupId = createLockupId(requestedChainId, normalizedHash);
    const lockup = await db.select().from(lockups).where(eq(lockups.id, lockupId)).limit(1);
    lockupData = lockup[0];

    // No lockup found for this specific chain - return 404 immediately
    if (!lockupData) {
      return c.json({ error: "Lockup not found" }, 404);
    }

    // When chainId is explicit: return existing txHash if already claimed (idempotent)
    if (lockupData.claimed && lockupData.claimTxHash) {
      return c.json({
        success: true,
        txHash: lockupData.claimTxHash,
        swapType: lockupData.swapType,
        chainId: lockupData.chainId,
      });
    }
  } else {
    // Search by preimageHash across all chains
    const allLockups = await db.select().from(lockups).where(eq(lockups.preimageHash, normalizedHash));

    if (!allLockups.length) {
      return c.json({ error: "Lockup not found" }, 404);
    }

    // Find an unclaimed, unrefunded lockup - NO FALLBACK to avoid returning wrong chain's data
    lockupData = allLockups.find(l => !l.claimed && !l.refunded);

    if (!lockupData) {
      // All lockups are either claimed or refunded - provide specific error
      const refundedLockup = allLockups.find(l => l.refunded);
      if (refundedLockup) {
        return c.json({ error: "Swap was refunded", chainId: refundedLockup.chainId }, 409);
      }
      // Must be claimed (no other state possible since we filtered !claimed && !refunded)
      return c.json({
        error: "All lockups already claimed. Please provide chainId to get specific claim details.",
        claimedChainIds: allLockups.filter(l => l.claimed).map(l => l.chainId)
      }, 409);
    }

    lockupId = lockupData.id;
  }

  // Refunded - cannot claim
  if (lockupData.refunded) {
    return c.json({ error: "Swap was refunded" }, 409);
  }

  const { amount, claimAddress, refundAddress, timelock, swapType, tokenAddress, chainId } = lockupData;

  if (!chainId) {
    return c.json({ error: "Missing chainId in lockup data" }, 500);
  }

  const contracts = CONTRACT_ADDRESSES[chainId];
  if (!contracts) {
    return c.json({ error: `Unsupported chainId: ${chainId}` }, 400);
  }

  try {
    const result = await transactionQueue.enqueue(chainId, async () => {
      const signer = getSigner(chainId);

      if (swapType === SwapType.ERC20 || tokenAddress) {
        const erc20Swap = new ethers.Contract(contracts.erc20Swap, ERC20SwapABI, signer);

        const tx = await erc20Swap.getFunction("claim(bytes32,uint256,address,address,address,uint256)")(
          prefix0x(preimage),
          amount,
          tokenAddress,
          claimAddress,
          refundAddress,
          timelock
        );

        const receipt = await tx.wait();
        return { txHash: receipt.hash as string, swapType: SwapType.ERC20 };
      } else if (contracts.coinSwap) {
        const coinSwap = new ethers.Contract(contracts.coinSwap, CoinSwapABI, signer);

        const tx = await coinSwap.getFunction("claim(bytes32,uint256,address,address,uint256)")(
          prefix0x(preimage),
          amount,
          claimAddress,
          refundAddress,
          timelock
        );

        const receipt = await tx.wait();
        return { txHash: receipt.hash as string, swapType: SwapType.NATIVE };
      } else {
        throw new Error(`No CoinSwap contract for chainId ${chainId}`);
      }
    });

    return c.json({
      success: true,
      txHash: result.txHash,
      swapType: result.swapType,
      chainId,
    });
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);

    // Check if already claimed (race condition: Auto-Claim finished but Claim Event not yet processed)
    if (errorMessage.includes("no tokens locked") || errorMessage.includes("no Ether locked")) {
      const claimedLockup = await waitForClaimedLockup(lockupId!);
      if (claimedLockup) {
        return c.json({
          success: true,
          txHash: claimedLockup.txHash,
          swapType: claimedLockup.swapType,
          chainId,
        });
      }
    }

    console.error("Claim failed:", error);
    return c.json({
      error: "Claim transaction failed",
      details: errorMessage
    }, 500);
  }
});

routes.get("/wallet", async (c: Context) => {
  const chainIdParam = c.req.query("chainId");

  // Default to Citrea mainnet if no chainId provided
  const chainId = chainIdParam ? parseInt(chainIdParam, 10) : 4114;

  if (isNaN(chainId) || !CONTRACT_ADDRESSES[chainId]) {
    return c.json({ error: `Unsupported chainId: ${chainIdParam}` }, 400);
  }

  try {
    const signer = getSigner(chainId);
    const address = await signer.getAddress();
    const balance = await signer.provider?.getBalance(address);

    return c.json({
      address,
      balance: formatEther(balance?.toString() || "0"),
      chainId,
    });
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    return c.json({
      error: "Failed to get wallet info",
      details: errorMessage
    }, 500);
  }
});

// New endpoint: Get wallet balances across all chains
routes.get("/wallet/all", async (c: Context) => {
  const results: Record<number, { address: string; balance: string; error?: string }> = {};

  for (const chainId of Object.keys(CONTRACT_ADDRESSES).map(Number)) {
    try {
      const signer = getSigner(chainId);
      const address = await signer.getAddress();
      const balance = await signer.provider?.getBalance(address);
      results[chainId] = {
        address,
        balance: formatEther(balance?.toString() || "0"),
      };
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      results[chainId] = {
        address: "",
        balance: "0",
        error: errorMessage,
      };
    }
  }

  return c.json({ wallets: results });
});

export default routes;
