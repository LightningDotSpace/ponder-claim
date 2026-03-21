import { eq } from "ponder";
import { db, offchainDb } from "./db";
import { lockups } from "ponder:schema";
import { scheduledClaims } from "../../offchain";
import { prefix0x } from "../utils/evm";
import { getInFlightTxHash, setInFlightTxHash, clearInFlight } from "../utils/inFlightGuard";
import { sendClaimTx } from "../utils/sendClaimTx";

const POLL_INTERVAL_MS = 2_000;
const TX_CONFIRM_TIMEOUT_MS = 10_000;
const MAX_RETRIES = 8;
const RETRY_BASE_DELAY_MS = 5_000;
const RETRY_MAX_DELAY_MS = 60_000;

const inProgress = new Set<string>();
const retryState = new Map<string, { attempts: number; nextAttemptAt: number }>();
let intervalHandle: ReturnType<typeof setInterval> | null = null;

function clearRetry(id: string) {
  retryState.delete(id);
}

function shouldRetryNow(id: string, now: number) {
  const state = retryState.get(id);
  return !state || now >= state.nextAttemptAt;
}

function registerFailure(id: string) {
  const previous = retryState.get(id);
  const attempts = (previous?.attempts ?? 0) + 1;
  const delay = Math.min(RETRY_BASE_DELAY_MS * 2 ** (attempts - 1), RETRY_MAX_DELAY_MS);
  retryState.set(id, { attempts, nextAttemptAt: Date.now() + delay });
  return { attempts, delay };
}

function isPermanentError(msg: string) {
  const normalized = msg.toLowerCase();
  return (
    normalized.includes("unsupported chainid") ||
    normalized.includes("no coinswap contract") ||
    normalized.includes("missing required lockup data")
  );
}

async function processScheduledClaim(claim: typeof scheduledClaims.$inferSelect) {
  const { id, chainId, claimAddress, preimage, preimageHash } = claim;
  const normalizedPreimage = prefix0x(preimage);
  const normalizedHash = prefix0x(preimageHash);
  const normalizedLockupId = `${chainId}:${normalizedHash}`;

  const result = await db.select().from(lockups).where(eq(lockups.id, normalizedLockupId)).limit(1);
  const lockup = result[0];

  if (!lockup) return; // not indexed yet, try again next tick

  if (lockup.refunded || lockup.claimed) {
    console.log(`[scheduler] Lockup ${id} ${lockup.refunded ? "refunded" : "claimed"}, removing`);
    await offchainDb.delete(scheduledClaims).where(eq(scheduledClaims.id, id));
    clearRetry(id);
    return;
  }

  // Check if a tx is already in-flight for this claim
  const knownTxHash = getInFlightTxHash(normalizedHash, chainId);
  if (knownTxHash) {
    const signer = (await import("../utils/evm")).getSigner(chainId);
    try {
      const receipt = await signer.provider!.waitForTransaction(knownTxHash, 1, TX_CONFIRM_TIMEOUT_MS);
      if (receipt?.status === 1) {
        clearInFlight(normalizedHash, chainId);
        await offchainDb.delete(scheduledClaims).where(eq(scheduledClaims.id, id));
        clearRetry(id);
        console.log(`[scheduler] Confirmed ${id}, tx: ${knownTxHash}`);
      } else if (receipt?.status === 0) {
        clearInFlight(normalizedHash, chainId);
        const { attempts, delay } = registerFailure(id);
        if (attempts >= MAX_RETRIES) {
          await offchainDb.delete(scheduledClaims).where(eq(scheduledClaims.id, id));
          clearRetry(id);
          console.error(`[scheduler] Max retries reached after revert for ${id}, removing`);
          return;
        }
        console.warn(`[scheduler] Reverted tx for ${id}, retry ${attempts}/${MAX_RETRIES} in ${delay}ms`);
      }
    } catch {
      // still pending, will retry next tick
    }
    return;
  }

  const normalizedQueuedClaimAddress = claimAddress?.toLowerCase();
  const normalizedLockupClaimAddress = lockup.claimAddress?.toLowerCase();
  if (
    normalizedQueuedClaimAddress &&
    normalizedLockupClaimAddress &&
    normalizedQueuedClaimAddress !== normalizedLockupClaimAddress
  ) {
    await offchainDb.delete(scheduledClaims).where(eq(scheduledClaims.id, id));
    clearRetry(id);
    console.error(`[scheduler] Claim address mismatch for ${id}, removing pending claim`);
    return;
  }

  const resolvedClaimAddress = lockup.claimAddress ?? claimAddress;
  if (!resolvedClaimAddress || !lockup.refundAddress || lockup.amount === null || lockup.timelock === null) {
    await offchainDb.delete(scheduledClaims).where(eq(scheduledClaims.id, id));
    clearRetry(id);
    console.error(`[scheduler] Missing required lockup data for ${id}, removing`);
    return;
  }

  try {
    const { txHash } = await sendClaimTx({
      chainId,
      preimage: normalizedPreimage,
      claimAddress: resolvedClaimAddress,
      refundAddress: lockup.refundAddress,
      amount: lockup.amount,
      timelock: lockup.timelock,
      tokenAddress: lockup.tokenAddress,
      swapType: lockup.swapType,
    });
    setInFlightTxHash(normalizedHash, chainId, txHash);
    clearRetry(id);
    console.log(`[scheduler] Tx sent for ${id}: ${txHash}`);
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    if (msg.includes("no tokens locked") || msg.includes("no Ether locked")) {
      await offchainDb.delete(scheduledClaims).where(eq(scheduledClaims.id, id));
      clearRetry(id);
      console.log(`[scheduler] Already claimed on-chain, removing ${id}`);
      return;
    }

    const permanent = isPermanentError(msg);
    if (permanent) {
      await offchainDb.delete(scheduledClaims).where(eq(scheduledClaims.id, id));
      clearRetry(id);
      console.error(`[scheduler] Permanent failure for ${id}, removing: ${msg}`);
      return;
    }

    const { attempts, delay } = registerFailure(id);
    if (attempts >= MAX_RETRIES) {
      await offchainDb.delete(scheduledClaims).where(eq(scheduledClaims.id, id));
      clearRetry(id);
      console.error(`[scheduler] Max retries reached for ${id}, removing. Last error: ${msg}`);
      return;
    }
    console.error(`[scheduler] Tx failed for ${id}, retry ${attempts}/${MAX_RETRIES} in ${delay}ms: ${msg}`);
  }
}

async function tick() {
  const pending = await offchainDb.select().from(scheduledClaims);
  const now = Date.now();

  await Promise.allSettled(
    pending
      .filter((c) => !inProgress.has(c.id) && shouldRetryNow(c.id, now))
      .map(async (claim) => {
        inProgress.add(claim.id);
        try {
          await processScheduledClaim(claim);
        } finally {
          inProgress.delete(claim.id);
        }
      })
  );
}

export function startClaimScheduler() {
  if (intervalHandle) return;
  console.log(`[scheduler] Started (interval: ${POLL_INTERVAL_MS}ms)`);
  void tick().catch((err) => console.error("[scheduler] Initial tick error:", err));
  intervalHandle = setInterval(() => {
    tick().catch((err) => console.error("[scheduler] Tick error:", err));
  }, POLL_INTERVAL_MS);
}
