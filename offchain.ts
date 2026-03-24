import { integer, json, pgSchema, text, timestamp } from "drizzle-orm/pg-core";

export const offchainSchema = pgSchema("offchain");

export const testNotes = offchainSchema.table("test_notes", {
  id: text("id").primaryKey(),
  title: text("title").notNull(),
  body: text("body"),
  metadata: json("metadata"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

export const scheduledClaims = offchainSchema.table("scheduled_claims", {
  id: text("id").primaryKey(),
  chainId: integer("chain_id").notNull(),
  claimAddress: text("claim_address").notNull(),
  preimage: text("preimage").notNull(),
  preimageHash: text("preimage_hash").notNull(),
});
