import { db } from "ponder:api";
import { lockups } from "ponder:schema";
import { Context, Hono } from "hono";
import { eq } from "ponder";
import { ethers, formatEther } from "ethers";
import { CoinSwapABI } from "../../abis/CoinSwap";
import { ERC20SwapABI } from "../../abis/ERC20Swap";
import { getSigner, prefix0x } from "../utils/evm";
import { SwapType } from "../utils/constants";
import { getPreimageStore } from "../utils/preimageStore";
import { transactionQueue } from "../utils/transactionQueue";

const contractAddresses = {
  testnet: {
    CoinSwapAbi: "0xd02731fD8c5FDD53B613A699234FAd5EE8851B65",
    ERC20SwapCitrea: "0xf2e019a371e5Fd32dB2fC564Ad9eAE9E433133cc",
  },
  mainnet: {
    CoinSwapAbi: "0xfd92f846fe6e7d08d28d6a88676bb875e5d906ab",
    ERC20SwapCitrea: "0x7397f25f230f7d5a83c18e1b68b32511bf35f860",
  },
};

const routes = new Hono();

/**
 * Wait for a lockup to be marked as claimed in the database.
 * Used to handle race conditions where Auto-Claim finished but Claim Event not yet indexed.
 * Default is: 5x2 seconds
 */
async function waitForClaimedLockup(
  preimageHash: string,
  maxAttempts = 5,
  delayMs = 2000
): Promise<{ txHash: string; swapType: string | null } | null> {
  for (let attempt = 0; attempt < maxAttempts; attempt++) {
    await new Promise(resolve => setTimeout(resolve, delayMs));

    const lockup = await db.select().from(lockups)
      .where(eq(lockups.preimageHash, preimageHash))
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
  if (!preimageHash) {
    return c.json({ error: "Preimage hash is required" }, 400);
  }

  const lockup = await db.select().from(lockups).where(eq(lockups.preimageHash, prefix0x(preimageHash))).limit(1);

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
});

routes.post("/register-preimage", async (c: Context) => {
  const { preimageHash, preimage, swapId } = await c.req.json();

  if (!preimageHash || !preimage) {
    return c.json({ error: "preimageHash and preimage required" }, 400);
  }

  try {
    const store = getPreimageStore();
    store.register(prefix0x(preimageHash), prefix0x(preimage), swapId);
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
  const { preimageHash, preimage } = await c.req.json();

  const lockup = await db.select().from(lockups).where(
    eq(lockups.preimageHash, preimageHash)
  ).limit(1);

  if (!lockup.length) {
    return c.json({ error: "Lockup not found" }, 404);
  }

  const lockupData = lockup[0]!;

  // Already claimed - return existing txHash
  if (lockupData.claimed && lockupData.claimTxHash) {
    return c.json({
      success: true,
      txHash: lockupData.claimTxHash,
      swapType: lockupData.swapType,
    });
  }

  // Refunded - cannot claim
  if (lockupData.refunded) {
    return c.json({ error: "Swap was refunded" }, 409);
  }
  const amount = lockupData.amount;
  const claimAddress = lockupData.claimAddress;
  const refundAddress = lockupData.refundAddress;
  const timelock = lockupData.timelock;
  const swapType = lockupData.swapType;
  const tokenAddress = lockupData.tokenAddress;
  const chainId = lockupData.chainId;
  if (chainId !== 5115 && chainId !== 4114) {
    return c.json({ error: `Unsupported chainId: ${chainId}` }, 400);
  }
  const chainName = chainId === 5115 ? "testnet" : "mainnet";

  try {
    const txHash = await transactionQueue.enqueue(async () => {
      const signer = getSigner();

      if (swapType === SwapType.ERC20) {
        const erc20SwapAddress = contractAddresses[chainName].ERC20SwapCitrea;
        const erc20Swap = new ethers.Contract(erc20SwapAddress, ERC20SwapABI, signer);

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
      } else {
        const coinSwapAddress = contractAddresses[chainName].CoinSwapAbi;
        const coinSwap = new ethers.Contract(coinSwapAddress, CoinSwapABI, signer);

        const tx = await coinSwap.getFunction("claim(bytes32,uint256,address,address,uint256)")(
          prefix0x(preimage),
          amount,
          claimAddress,
          refundAddress,
          timelock
        );

        const receipt = await tx.wait();
        return { txHash: receipt.hash as string, swapType: SwapType.NATIVE };
      }
    });

    return c.json({
      success: true,
      txHash: txHash.txHash,
      swapType: txHash.swapType,
    });
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);

    // Check if already claimed (race condition: Auto-Claim finished but Claim Event not yet processed)
    if (errorMessage.includes("no tokens locked") || errorMessage.includes("no Ether locked")) {
      const claimedLockup = await waitForClaimedLockup(preimageHash);
      if (claimedLockup) {
        return c.json({
          success: true,
          txHash: claimedLockup.txHash,
          swapType: claimedLockup.swapType,
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
  const signer = getSigner();
  const address = await signer.getAddress();
  const balance = await signer.provider?.getBalance(address);

  return c.json({ address, balance: formatEther(balance?.toString() || "0n") });
});

export default routes;
