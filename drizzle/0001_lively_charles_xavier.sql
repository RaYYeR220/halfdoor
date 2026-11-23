ALTER TABLE "ai_calls" DROP CONSTRAINT "ai_calls_church_id_churches_id_fk";
--> statement-breakpoint
ALTER TABLE "ai_calls" ALTER COLUMN "church_id" DROP NOT NULL;--> statement-breakpoint
ALTER TABLE "ai_calls" ALTER COLUMN "ok" DROP NOT NULL;--> statement-breakpoint
ALTER TABLE "ai_calls" ADD COLUMN "attestation_mismatch" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "churches" ADD COLUMN "creator_hash" text;--> statement-breakpoint
ALTER TABLE "ai_calls" ADD CONSTRAINT "ai_calls_church_id_churches_id_fk" FOREIGN KEY ("church_id") REFERENCES "public"."churches"("id") ON DELETE set null ON UPDATE no action;