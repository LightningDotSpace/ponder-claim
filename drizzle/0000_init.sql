CREATE SCHEMA IF NOT EXISTS "offchain";
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "offchain"."test_notes" (
	"id" text PRIMARY KEY NOT NULL,
	"title" text NOT NULL,
	"body" text,
	"metadata" json,
	"created_at" timestamp DEFAULT now() NOT NULL
);
