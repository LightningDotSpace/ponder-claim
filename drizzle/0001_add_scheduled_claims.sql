CREATE TABLE IF NOT EXISTS "offchain"."scheduled_claims" (
	"id" text PRIMARY KEY NOT NULL,
	"chain_id" integer NOT NULL,
	"claim_address" text NOT NULL,
	"preimage" text NOT NULL,
	"preimage_hash" text NOT NULL
);
