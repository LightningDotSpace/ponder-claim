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
import { getInFlightTxHash, setInFlightTxHash, clearInFlight } from "../utils/inFlightGuard";
import { getTxDiagnostics } from "../utils/txDiagnostics";
import { signAndBroadcast } from "../utils/broadcastTx";
import { CONTRACT_ADDRESSES } from "../../constants";

// Helper to create composite lockup ID
const createLockupId = (chainId: number, preimageHash: string) =>
  `${chainId}:${preimageHash}`;

const TX_WAIT_TIMEOUT_MS = 40_000;

const routes = new Hono();


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
  const { preimageHash, preimage, chainId } = await c.req.json();

  if (!preimageHash) {
    return c.json({ error: "preimageHash is required" }, 400);
  }

  if (!isValidPreimageHash(preimageHash)) {
    return c.json({ error: "Invalid preimageHash format. Must be 32 bytes (64 hex characters), optionally with 0x prefix" }, 400);
  }

  if (!preimage) {
    return c.json({ error: "preimage is required" }, 400);
  }

  if (!isValidPreimage(preimage)) {
    return c.json({ error: "Invalid preimage format. Must be 32 bytes (64 hex characters), optionally with 0x prefix" }, 400);
  }

  if (!chainId) {
    return c.json({ error: "chainId is required" }, 400);
  }

  const normalizedHash = prefix0x(preimageHash);
  const lockupId = createLockupId(chainId, normalizedHash);
  const lockup = await db.select().from(lockups).where(eq(lockups.id, lockupId)).limit(1);
  const lockupData = lockup[0];

  if (!lockupData) {
    return c.json({ error: "Lockup not found" }, 404);
  }

  if (lockupData.claimed && lockupData.claimTxHash) {
    return c.json({
      success: true,
      txHash: lockupData.claimTxHash,
      swapType: lockupData.swapType,
      chainId,
    });
  }

  if (lockupData.refunded) {
    return c.json({ error: "Swap was refunded" }, 409);
  }

  const { amount, claimAddress, refundAddress, timelock, swapType, tokenAddress } = lockupData;

  const contracts = CONTRACT_ADDRESSES[chainId];
  if (!contracts) {
    return c.json({ error: `Unsupported chainId: ${chainId}` }, 400);
  }

  const signer = getSigner(chainId);

  const knownTxHash = getInFlightTxHash(normalizedHash, chainId);
  if (knownTxHash) {
    try {
      const receipt = await signer.provider!.waitForTransaction(knownTxHash, 1, TX_WAIT_TIMEOUT_MS);
      if (receipt && receipt.status === 1) {
        clearInFlight(normalizedHash, chainId);
        return c.json({ success: true, txHash: knownTxHash, swapType: swapType, chainId });
      }
    } catch (err) {
      console.error("Wait on in-flight claim tx failed:", err);
    }
  }

  try {
    const { txResponse, swapType: resolvedSwapType } = await transactionQueue.enqueue(chainId, async () => {
      if (swapType === SwapType.ERC20 || tokenAddress) {
        const erc20Swap = new ethers.Contract(contracts.erc20Swap, ERC20SwapABI, signer);

        const unsignedTx = await erc20Swap.getFunction("claim(bytes32,uint256,address,address,address,uint256)")
          .populateTransaction(prefix0x(preimage), amount, tokenAddress, claimAddress, refundAddress, timelock);

        const resp = await signAndBroadcast(signer, chainId, unsignedTx);
        return { txResponse: resp, swapType: SwapType.ERC20 };
      } else if (contracts.coinSwap) {
        const coinSwap = new ethers.Contract(contracts.coinSwap, CoinSwapABI, signer);

        const unsignedTx = await coinSwap.getFunction("claim(bytes32,uint256,address,address,uint256)")
          .populateTransaction(prefix0x(preimage), amount, claimAddress, refundAddress, timelock);

        const resp = await signAndBroadcast(signer, chainId, unsignedTx);
        return { txResponse: resp, swapType: SwapType.NATIVE };
      } else {
        throw new Error(`No CoinSwap contract for chainId ${chainId}`);
      }
    });

    setInFlightTxHash(normalizedHash, chainId, txResponse.hash);

    const receipt = await txResponse.wait(1, TX_WAIT_TIMEOUT_MS);
    if (!receipt) throw new Error("Transaction receipt is null");

    clearInFlight(normalizedHash, chainId);

    const result = { txHash: receipt.hash as string, swapType: resolvedSwapType };

    return c.json({
      success: true,
      txHash: result.txHash,
      swapType: result.swapType,
      chainId,
    });
  } catch (error) {
    const diagnostics = getTxDiagnostics(error);
    const errorMessage = error instanceof Error ? error.message : String(error);
    console.error("Claim failed with diagnostics:", { chainId, lockupId, diagnostics });

    if (errorMessage.includes("no tokens locked") || errorMessage.includes("no Ether locked")) {
      clearInFlight(normalizedHash, chainId);
      return c.json({ success: true, alreadyClaimed: true, chainId });
    }

    console.error("Claim failed:", error);
    return c.json({
      error: "Claim transaction failed",
      details: errorMessage,
      category: diagnostics.category,
      code: diagnostics.code,
      replacementTxHash: diagnostics.replacementTxHash,
      cancelled: diagnostics.cancelled,
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
