import { db } from "ponder:api";
import { lockups } from "ponder:schema";
import { Context, Hono } from "hono";
import { eq } from "ponder";
import { ethers } from "ethers";
import { CoinSwapABI } from "../../abis/CoinSwap";
import { ERC20SwapABI } from "../../abis/ERC20Swap";
import { getSigner, prefix0x } from "../utils/evm";
import { SwapType } from "../../constants";
import { isValidPreimageHash } from "../utils/validations";
import { transactionQueue } from "../utils/transactionQueue";
import { getTxDiagnostics } from "../utils/txDiagnostics";
import { signBroadcastAndWait } from "../utils/broadcastTx";
import { CONTRACT_ADDRESSES } from "../../constants";

const createLockupId = (chainId: number, preimageHash: string) =>
  `${chainId}:${preimageHash}`;

const TX_WAIT_TIMEOUT_MS = 40_000;

/**
 * Wait for a lockup to be marked as refunded in the database.
 * Handles race conditions where the refund tx landed but the event hasn't been indexed yet.
 */
async function waitForRefundedLockup(
  lockupId: string,
  maxAttempts = 5,
  delayMs = 2000
): Promise<{ txHash: string; swapType: string | null } | null> {
  for (let attempt = 0; attempt < maxAttempts; attempt++) {
    await new Promise(resolve => setTimeout(resolve, delayMs));

    const lockup = await db.select().from(lockups)
      .where(eq(lockups.id, lockupId))
      .limit(1);

    if (lockup[0]?.refunded && lockup[0]?.refundTxHash) {
      return {
        txHash: lockup[0].refundTxHash,
        swapType: lockup[0].swapType,
      };
    }
  }
  return null;
}

const refundRoutes = new Hono();

refundRoutes.post("/help-me-refund", async (c: Context) => {
  const { preimageHash, chainId } = await c.req.json();

  if (!preimageHash) {
    return c.json({ error: "preimageHash is required" }, 400);
  }

  if (!chainId) {
    return c.json({ error: "chainId is required" }, 400);
  }

  if (!isValidPreimageHash(preimageHash)) {
    return c.json({ error: "Invalid preimageHash format. Must be 32 bytes (64 hex characters), optionally with 0x prefix" }, 400);
  }

  const normalizedHash = prefix0x(preimageHash);
  const lockupId = createLockupId(chainId, normalizedHash);
  const lockup = await db.select().from(lockups).where(eq(lockups.id, lockupId)).limit(1);
  const lockupData = lockup[0];

  if (!lockupData) {
    return c.json({ error: "Lockup not found" }, 404);
  }

  if (lockupData.refunded && lockupData.refundTxHash) {
    return c.json({
      success: true,
      txHash: lockupData.refundTxHash,
      swapType: lockupData.swapType,
      chainId,
    });
  }

  if (lockupData.claimed) {
    return c.json({ error: "Swap was already claimed" }, 409);
  }

  const { amount, claimAddress, refundAddress, timelock, swapType, tokenAddress } = lockupData;

  // Timelock is a block height — refund only succeeds once the chain surpasses it
  if (timelock) {
    const signer = getSigner(chainId);
    const currentBlock = await signer.provider!.getBlockNumber();
    if (currentBlock < Number(timelock)) {
      return c.json({
        error: "Timelock has not expired yet",
        timelock: timelock.toString(),
        currentBlock,
        blocksRemaining: Number(timelock) - currentBlock,
      }, 400);
    }
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

        const unsignedTx = await erc20Swap.getFunction("refund(bytes32,uint256,address,address,address,uint256)")
          .populateTransaction(normalizedHash, amount, tokenAddress, claimAddress, refundAddress, timelock);

        const receipt = await signBroadcastAndWait(signer, chainId, unsignedTx, 1, TX_WAIT_TIMEOUT_MS);
        return { txHash: receipt.hash as string, swapType: SwapType.ERC20 };
      } else if (contracts.coinSwap) {
        const coinSwap = new ethers.Contract(contracts.coinSwap, CoinSwapABI, signer);

        const unsignedTx = await coinSwap.getFunction("refund(bytes32,uint256,address,address,uint256)")
          .populateTransaction(normalizedHash, amount, claimAddress, refundAddress, timelock);

        const receipt = await signBroadcastAndWait(signer, chainId, unsignedTx, 1, TX_WAIT_TIMEOUT_MS);
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
    const diagnostics = getTxDiagnostics(error);
    const errorMessage = error instanceof Error ? error.message : String(error);
    console.error("Refund failed with diagnostics:", { chainId, lockupId, diagnostics });

    if (errorMessage.includes("no tokens locked") || errorMessage.includes("no Ether locked")) {
      const refundedLockup = await waitForRefundedLockup(lockupId!);
      if (refundedLockup) {
        return c.json({
          success: true,
          txHash: refundedLockup.txHash,
          swapType: refundedLockup.swapType,
          chainId,
        });
      }
    }

    console.error("Refund failed:", error);
    return c.json({
      error: "Refund transaction failed",
      details: errorMessage,
      category: diagnostics.category,
      code: diagnostics.code,
      replacementTxHash: diagnostics.replacementTxHash,
      cancelled: diagnostics.cancelled,
    }, 500);
  }
});

export default refundRoutes;
