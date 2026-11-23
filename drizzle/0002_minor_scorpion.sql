ALTER TABLE "card_access_log" DROP CONSTRAINT "card_access_log_card_id_cards_id_fk";
--> statement-breakpoint
ALTER TABLE "card_access_log" ALTER COLUMN "card_id" DROP NOT NULL;--> statement-breakpoint
ALTER TABLE "card_access_log" ADD COLUMN "child_id" uuid;--> statement-breakpoint
ALTER TABLE "card_access_log" ADD CONSTRAINT "card_access_log_child_id_people_id_fk" FOREIGN KEY ("child_id") REFERENCES "public"."people"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "card_access_log" ADD CONSTRAINT "card_access_log_card_id_cards_id_fk" FOREIGN KEY ("card_id") REFERENCES "public"."cards"("id") ON DELETE set null ON UPDATE no action;