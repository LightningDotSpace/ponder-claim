import { onchainTable, index, relations } from "ponder";

export const lockups = onchainTable("lockups", (t) => ({
  // Composite ID: chainId:preimageHash
  id: t.text().primaryKey(),
  preimageHash: t.text().notNull(),
  chainId: t.integer().notNull(),
  amount: t.bigint(),
  claimAddress: t.text(),
  refundAddress: t.text(),
  senderAddress: t.text().notNull(),
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

export const lockupsRelations = relations(lockups, ({ one }) => ({
  knownPreimage: one(knownPreimageHashes, {
    fields: [lockups.preimageHash],
    references: [knownPreimageHashes.preimageHash],
  }),
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

export const knownPreimageHashes = onchainTable("knownPreimageHashes", (t) => ({
  preimageHash: t.text().primaryKey(),
  preimage: t.text()
}));

export const knownPreimageHashesRelations = relations(knownPreimageHashes, ({ many }) => ({
  currentLockup: many(lockups),
  lockups: many(rawLockups),
  claims: many(rawClaims),
  refunds: many(rawRefunds),
}));

export const rawLockups = onchainTable("rawLockups", (t) => ({
  id: t.text().primaryKey(),
  preimageHash: t.text().notNull(),
  chainId: t.integer().notNull(),
  amount: t.bigint(),
  claimAddress: t.text(),
  refundAddress: t.text(),
  senderAddress: t.text().notNull(),
  timelock: t.bigint(),
  tokenAddress: t.text(),
  swapType: t.text(),
  txHash: t.text().notNull(),
  blockNumber: t.bigint().notNull(),
  timestamp: t.bigint().notNull(),
}));

export const rawLockupsRelations = relations(rawLockups, ({ one }) => ({
  knownPreimage: one(knownPreimageHashes, {
    fields: [rawLockups.preimageHash],
    references: [knownPreimageHashes.preimageHash],
  }),
}));

export const rawClaims = onchainTable("rawClaims", (t) => ({
  id: t.text().primaryKey(),
  preimageHash: t.text().notNull(),
  preimage: t.text().notNull(),
  chainId: t.integer().notNull(),
  swapType: t.text(),
  txHash: t.text().notNull(),
  blockNumber: t.bigint().notNull(),
  timestamp: t.bigint().notNull(),
}));

export const rawClaimsRelations = relations(rawClaims, ({ one }) => ({
  knownPreimage: one(knownPreimageHashes, {
    fields: [rawClaims.preimageHash],
    references: [knownPreimageHashes.preimageHash],
  }),
}));

export const rawRefunds = onchainTable("rawRefunds", (t) => ({
  id: t.text().primaryKey(),
  preimageHash: t.text().notNull(),
  chainId: t.integer().notNull(),
  swapType: t.text(),
  txHash: t.text().notNull(),
  blockNumber: t.bigint().notNull(),
  timestamp: t.bigint().notNull(),
}));

export const rawRefundsRelations = relations(rawRefunds, ({ one }) => ({
  knownPreimage: one(knownPreimageHashes, {
    fields: [rawRefunds.preimageHash],
    references: [knownPreimageHashes.preimageHash],
  }),
}));

