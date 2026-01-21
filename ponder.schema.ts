import { onchainTable } from "ponder";

export const lockups = onchainTable("lockups", (t) => ({
  preimageHash: t.text().primaryKey(),
  amount: t.bigint(),
  claimAddress: t.text(),
  refundAddress: t.text(),
  timelock: t.bigint(),
  tokenAddress: t.text(),
  swapType: t.text(), //
  claimed: t.boolean().default(false),
  refunded: t.boolean().default(false),
  claimTxHash: t.text(),
  refundTxHash: t.text(),
  preimage: t.text(),
}));
