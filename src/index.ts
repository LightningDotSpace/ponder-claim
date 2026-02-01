import { ponder } from "ponder:registry";
import { lockups } from "../ponder.schema";
import { SwapType } from "../constants";
import { executeAutoClaim } from "./utils/autoClaim";
import { getPreimageStore } from "./utils/preimageStore";

// Helper for Composite ID
const createLockupId = (chainId: number, preimageHash: string) =>
  `${chainId}:${preimageHash}`;

interface LockupData {
  id: string;
  preimageHash: string;
  amount: bigint;
  claimAddress: string;
  refundAddress: string;
  timelock: bigint;
  swapType: string;
  chainId: number;
  tokenAddress: string | null;
  claimed: boolean;
  refunded: boolean;
}

/**
 * Handles auto-claim logic for lockup events.
 * CRITICAL: Marks preimage as 'in_progress' BEFORE starting the claim to prevent race conditions.
 */
async function handleAutoClaimForLockup(lockupData: LockupData): Promise<void> {
  const store = getPreimageStore();
  const registered = store.get(lockupData.preimageHash);

  if (!registered) return;

  // Check if this is an outflow swap (targetChainId is NOT NULL in DB)
  const isOutflowSwap = registered.targetChainId !== null;

  if (isOutflowSwap) {
    // Outflow swap: Validate chain and address match
    const chainMatches = registered.targetChainId === lockupData.chainId;
    const addressMatches = registered.customerAddress?.toLowerCase() === lockupData.claimAddress.toLowerCase();

    if (!chainMatches) {
      console.log(`[${lockupData.chainId}] Auto-claim skipped for ${lockupData.preimageHash}: chain mismatch (expected: ${registered.targetChainId}, got: ${lockupData.chainId})`);
      return;
    }

    if (!addressMatches) {
      console.log(`[${lockupData.chainId}] Auto-claim skipped for ${lockupData.preimageHash}: address mismatch (expected: ${registered.customerAddress}, got: ${lockupData.claimAddress})`);
      return;
    }
  }
  // Inflow swaps (targetChainId === null): Always proceed with claim (legacy behavior)

  // CRITICAL: Atomically mark as 'in_progress' BEFORE starting the claim.
  // This prevents race conditions where multiple lockup events (or duplicate events)
  // try to claim the same preimage simultaneously ON THE SAME CHAIN.
  // Different chains can claim independently (e.g., user claims on Citrea, Boltz claims on Ethereum).
  const acquired = store.markInProgress(lockupData.preimageHash, lockupData.chainId);
  if (!acquired) {
    console.log(`[${lockupData.chainId}] Auto-claim skipped for ${lockupData.preimageHash}: already in progress or completed on this chain`);
    return;
  }

  try {
    const result = await executeAutoClaim(registered.preimage, lockupData, lockupData.chainId);

    if (result.success) {
      console.log(`[${lockupData.chainId}] Auto-claim successful for ${lockupData.preimageHash}: ${result.txHash}`);
      store.markCompleted(lockupData.preimageHash, lockupData.chainId);
    } else if (result.error?.includes("no Ether locked") || result.error?.includes("no tokens locked")) {
      console.log(`[${lockupData.chainId}] Auto-claim skipped for ${lockupData.preimageHash}: already claimed`);
      store.markCompleted(lockupData.preimageHash, lockupData.chainId);
    } else {
      console.error(`[${lockupData.chainId}] Auto-claim failed for ${lockupData.preimageHash}: ${result.error}`);
      // Mark as failed (resets to pending) so it can be retried on this chain
      store.markFailed(lockupData.preimageHash, lockupData.chainId);
    }
  } catch (err) {
    console.error(`[${lockupData.chainId}] Auto-claim error:`, err);
    store.markFailed(lockupData.preimageHash, lockupData.chainId);
  }
}

// ===== CITREA: CoinSwap (cBTC) =====
ponder.on("CoinSwapCitrea:Lockup", async ({ event, context }) => {
  const id = createLockupId(context.chain.id, event.args.preimageHash);

  const lockupData: LockupData = {
    id,
    preimageHash: event.args.preimageHash,
    amount: event.args.amount,
    claimAddress: event.args.claimAddress,
    refundAddress: event.args.refundAddress,
    timelock: event.args.timelock,
    swapType: SwapType.NATIVE,
    chainId: context.chain.id,
    tokenAddress: null,
    claimed: false,
    refunded: false,
  };

  await context.db.insert(lockups).values(lockupData).onConflictDoNothing();
});

ponder.on("CoinSwapCitrea:Claim", async ({ event, context }) => {
  const id = createLockupId(context.chain.id, event.args.preimageHash);
  await context.db
    .update(lockups, { id })
    .set({
      claimed: true,
      claimTxHash: event.transaction.hash,
      preimage: event.args.preimage,
    });
});

ponder.on("CoinSwapCitrea:Refund", async ({ event, context }) => {
  const id = createLockupId(context.chain.id, event.args.preimageHash);
  await context.db
    .update(lockups, { id })
    .set({
      refunded: true,
      refundTxHash: event.transaction.hash,
    });
});

// ===== CITREA: ERC20Swap (JUSD) =====
ponder.on("ERC20SwapCitrea:Lockup", async ({ event, context }) => {
  const id = createLockupId(context.chain.id, event.args.preimageHash);

  const lockupData: LockupData = {
    id,
    preimageHash: event.args.preimageHash,
    amount: event.args.amount,
    claimAddress: event.args.claimAddress,
    refundAddress: event.args.refundAddress,
    timelock: event.args.timelock,
    tokenAddress: event.args.tokenAddress,
    swapType: SwapType.ERC20,
    chainId: context.chain.id,
    claimed: false,
    refunded: false,
  };

  await context.db.insert(lockups).values(lockupData).onConflictDoNothing();
});

ponder.on("ERC20SwapCitrea:Claim", async ({ event, context }) => {
  const id = createLockupId(context.chain.id, event.args.preimageHash);
  await context.db
    .update(lockups, { id })
    .set({
      claimed: true,
      claimTxHash: event.transaction.hash,
      preimage: event.args.preimage,
    });
});

ponder.on("ERC20SwapCitrea:Refund", async ({ event, context }) => {
  const id = createLockupId(context.chain.id, event.args.preimageHash);
  await context.db
    .update(lockups, { id })
    .set({
      refunded: true,
      refundTxHash: event.transaction.hash,
    });
});

// ===== POLYGON: ERC20Swap (USDT) =====
ponder.on("ERC20SwapPolygon:Lockup", async ({ event, context }) => {
  const id = createLockupId(context.chain.id, event.args.preimageHash);

  const lockupData: LockupData = {
    id,
    preimageHash: event.args.preimageHash,
    amount: event.args.amount,
    claimAddress: event.args.claimAddress,
    refundAddress: event.args.refundAddress,
    timelock: event.args.timelock,
    tokenAddress: event.args.tokenAddress,
    swapType: SwapType.ERC20,
    chainId: context.chain.id,
    claimed: false,
    refunded: false,
  };

  await context.db.insert(lockups).values(lockupData).onConflictDoNothing();
});

ponder.on("ERC20SwapPolygon:Claim", async ({ event, context }) => {
  const id = createLockupId(context.chain.id, event.args.preimageHash);
  await context.db
    .update(lockups, { id })
    .set({
      claimed: true,
      claimTxHash: event.transaction.hash,
      preimage: event.args.preimage,
    });
});

ponder.on("ERC20SwapPolygon:Refund", async ({ event, context }) => {
  const id = createLockupId(context.chain.id, event.args.preimageHash);
  await context.db
    .update(lockups, { id })
    .set({
      refunded: true,
      refundTxHash: event.transaction.hash,
    });
});

// ===== ETHEREUM: ERC20Swap (USDT/USDC) =====
ponder.on("ERC20SwapEthereum:Lockup", async ({ event, context }) => {
  const id = createLockupId(context.chain.id, event.args.preimageHash);

  const lockupData: LockupData = {
    id,
    preimageHash: event.args.preimageHash,
    amount: event.args.amount,
    claimAddress: event.args.claimAddress,
    refundAddress: event.args.refundAddress,
    timelock: event.args.timelock,
    tokenAddress: event.args.tokenAddress,
    swapType: SwapType.ERC20,
    chainId: context.chain.id,
    claimed: false,
    refunded: false,
  };

  await context.db.insert(lockups).values(lockupData).onConflictDoNothing();
});

ponder.on("ERC20SwapEthereum:Claim", async ({ event, context }) => {
  const id = createLockupId(context.chain.id, event.args.preimageHash);
  await context.db
    .update(lockups, { id })
    .set({
      claimed: true,
      claimTxHash: event.transaction.hash,
      preimage: event.args.preimage,
    });
});

ponder.on("ERC20SwapEthereum:Refund", async ({ event, context }) => {
  const id = createLockupId(context.chain.id, event.args.preimageHash);
  await context.db
    .update(lockups, { id })
    .set({
      refunded: true,
      refundTxHash: event.transaction.hash,
    });
});
