ALTER TABLE "card_access_log" ADD COLUMN "service_id" uuid;--> statement-breakpoint
ALTER TABLE "cards" ADD COLUMN "returned_question_enc" text;--> statement-breakpoint
ALTER TABLE "card_access_log" ADD CONSTRAINT "card_access_log_service_id_services_id_fk" FOREIGN KEY ("service_id") REFERENCES "public"."services"("id") ON DELETE set null ON UPDATE no action;