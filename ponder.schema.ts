import { onchainTable, index } from "ponder";

export const lockups = onchainTable("lockups", (t) => ({
  // Composite ID: chainId:preimageHash
  id: t.text().primaryKey(),
  preimageHash: t.text().notNull(),
  chainId: t.integer().notNull(),
  amount: t.bigint(),
  claimAddress: t.text(),
  refundAddress: t.text(),
  timelock: t.bigint(),
  tokenAddress: t.text(),
  swapType: t.text(),
  claimed: t.boolean().default(false),
  refunded: t.boolean().default(false),
  claimTxHash: t.text(),
  refundTxHash: t.text(),
  lockupTxHash: t.text(),
  preimage: t.text(),
}), (table) => ({
  preimageHashIdx: index().on(table.preimageHash),
}));

export const volumeStat = onchainTable("volumeStat", (t) => ({
  id: t.text().primaryKey(),
  chainId: t.integer().notNull(),
  tokenAddress: t.text().notNull(),
  timestamp: t.bigint().notNull(),
  txCount: t.integer().notNull(),
  volume: t.bigint().notNull(),
  type: t.text().notNull(),
}));
