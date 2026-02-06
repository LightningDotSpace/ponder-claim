import { ponder } from "ponder:registry";
import { lockups, volumeStat } from "../ponder.schema";
import { SwapType } from "../constants";
import { SKIP_TX_HASHES } from "../constants";
import { TEMPORAL_FRAMES, getIdByTemporalFrame, getTimestampByTemporalFrame } from "./utils/timestamps";

// Helper for Composite ID
const createLockupId = (chainId: number, preimageHash: string) =>
  `${chainId}:${preimageHash}`;

const updateVolumeStat = async ({
  context,
  timestamp,
  tokenAddress,
  amount,
  chainId,
}: {
  context: any;
  timestamp: bigint;
  tokenAddress: string;
  amount: bigint;
  chainId: number;
}) => {
  await Promise.all(
    TEMPORAL_FRAMES.map((type) => {
      const bucketTimestamp = getTimestampByTemporalFrame(type, timestamp);
      return context.db
        .insert(volumeStat)
        .values({
          id: getIdByTemporalFrame(chainId, tokenAddress, type, timestamp),
          chainId,
          tokenAddress,
          timestamp: bucketTimestamp,
          txCount: 1,
          volume: amount,
          type,
        })
        .onConflictDoUpdate((row: any) => ({
          txCount: row.txCount + 1,
          volume: row.volume + amount,
        }));
    })
  );
};

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
  lockupTxHash: string;
}

// ===== CITREA: CoinSwap (cBTC) =====
ponder.on("CoinSwapCitrea:Lockup", async ({ event, context }) => {
  if (SKIP_TX_HASHES.includes(event.transaction.hash)) {
    return;
  }

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
    lockupTxHash: event.transaction.hash,
  };

  await context.db.insert(lockups).values(lockupData).onConflictDoNothing();

  await updateVolumeStat({
    context,
    timestamp: event.block.timestamp,
    tokenAddress: "native",
    amount: event.args.amount,
    chainId: context.chain.id,
  });
});

ponder.on("CoinSwapCitrea:Claim", async ({ event, context }) => {
  if (SKIP_TX_HASHES.includes(event.transaction.hash)) {
    return;
  }
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
      lockupTxHash: event.transaction.hash,
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
    lockupTxHash: event.transaction.hash,
  };

  await context.db.insert(lockups).values(lockupData).onConflictDoNothing();

  await updateVolumeStat({
    context,
    timestamp: event.block.timestamp,
    tokenAddress: event.args.tokenAddress.toLowerCase(),
    amount: event.args.amount,
    chainId: context.chain.id,
  });
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
    lockupTxHash: event.transaction.hash,
  };

  await context.db.insert(lockups).values(lockupData).onConflictDoNothing();

  await updateVolumeStat({
    context,
    timestamp: event.block.timestamp,
    tokenAddress: event.args.tokenAddress.toLowerCase(),
    amount: event.args.amount,
    chainId: context.chain.id,
  });
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
    lockupTxHash: event.transaction.hash,
  };

  await context.db.insert(lockups).values(lockupData).onConflictDoNothing();

  await updateVolumeStat({
    context,
    timestamp: event.block.timestamp,
    tokenAddress: event.args.tokenAddress.toLowerCase(),
    amount: event.args.amount,
    chainId: context.chain.id,
  });
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
