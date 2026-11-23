CREATE TABLE "ai_calls" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"church_id" uuid NOT NULL,
	"purpose" text NOT NULL,
	"model" text NOT NULL,
	"e2ee" boolean NOT NULL,
	"attestation" jsonb,
	"tokens_in" integer,
	"tokens_out" integer,
	"cost_usd" numeric(10, 6),
	"ok" boolean NOT NULL,
	"at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "assignments" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"service_id" uuid NOT NULL,
	"child_id" uuid NOT NULL,
	"buddy_id" uuid NOT NULL,
	"status" text NOT NULL,
	"reasons" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"pco_plan_person_id" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "card_access_log" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"card_id" uuid NOT NULL,
	"viewer_id" uuid,
	"role" text NOT NULL,
	"reason" text NOT NULL,
	"opened_at" timestamp with time zone DEFAULT now() NOT NULL,
	"closed_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "cards" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"church_id" uuid NOT NULL,
	"child_id" uuid NOT NULL,
	"status" text NOT NULL,
	"lang" text NOT NULL,
	"support_level" text,
	"items_enc" text NOT NULL,
	"team_notes_enc" text,
	"returned_question" text,
	"tags" text[] DEFAULT '{}'::text[] NOT NULL,
	"version" integer DEFAULT 1 NOT NULL,
	"parent_approved_at" timestamp with time zone,
	"director_ack_at" timestamp with time zone,
	"retain_until" timestamp with time zone,
	CONSTRAINT "cards_child_id_unique" UNIQUE("child_id")
);
--> statement-breakpoint
CREATE TABLE "checkins" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"service_id" uuid NOT NULL,
	"child_id" uuid NOT NULL,
	"source" text NOT NULL,
	"pco_check_in_id" text,
	"security_code" text,
	"checked_in_at" timestamp with time zone NOT NULL,
	"checked_out_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "churches" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"name" text NOT NULL,
	"slug" text NOT NULL,
	"tz" text DEFAULT 'America/Chicago' NOT NULL,
	"mode" text NOT NULL,
	"pco_org_id" text,
	"wrapped_dek" text NOT NULL,
	"expires_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "churches_slug_unique" UNIQUE("slug")
);
--> statement-breakpoint
CREATE TABLE "household_links" (
	"parent_id" uuid NOT NULL,
	"child_id" uuid NOT NULL,
	CONSTRAINT "household_links_parent_id_child_id_pk" PRIMARY KEY("parent_id","child_id")
);
--> statement-breakpoint
CREATE TABLE "lessons" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"church_id" uuid NOT NULL,
	"service_date" timestamp with time zone NOT NULL,
	"source_text" text NOT NULL,
	"title" text NOT NULL,
	"big_idea_quote" text,
	"verse_ref" text,
	"verse_text" text,
	"steps" jsonb DEFAULT '[]'::jsonb NOT NULL
);
--> statement-breakpoint
CREATE TABLE "moments" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"service_id" uuid NOT NULL,
	"child_id" uuid NOT NULL,
	"buddy_id" uuid,
	"step_key" text,
	"kind" text NOT NULL,
	"helped_item_ids" text[] DEFAULT '{}'::text[] NOT NULL,
	"note_enc" text,
	"at" timestamp with time zone NOT NULL
);
--> statement-breakpoint
CREATE TABLE "parent_notes" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"service_id" uuid NOT NULL,
	"child_id" uuid NOT NULL,
	"lang" text NOT NULL,
	"draft_enc" text NOT NULL,
	"evidence" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"status" text NOT NULL,
	"approved_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "people" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"church_id" uuid NOT NULL,
	"role" text NOT NULL,
	"first_name" text NOT NULL,
	"last_initial" text,
	"lang" text DEFAULT 'en' NOT NULL,
	"gender" text,
	"pco_person_id" text,
	"grade" text,
	"inclusion_training_at" timestamp with time zone,
	"background_expires_at" timestamp with time zone,
	"skills" text[] DEFAULT '{}'::text[] NOT NULL,
	"langs" text[] DEFAULT '{}'::text[] NOT NULL
);
--> statement-breakpoint
CREATE TABLE "services" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"church_id" uuid NOT NULL,
	"label" text NOT NULL,
	"starts_at" timestamp with time zone NOT NULL,
	"ends_at" timestamp with time zone NOT NULL,
	"room" text,
	"pco_event_id" text,
	"pco_service_type_id" text,
	"pco_plan_id" text
);
--> statement-breakpoint
ALTER TABLE "ai_calls" ADD CONSTRAINT "ai_calls_church_id_churches_id_fk" FOREIGN KEY ("church_id") REFERENCES "public"."churches"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "assignments" ADD CONSTRAINT "assignments_service_id_services_id_fk" FOREIGN KEY ("service_id") REFERENCES "public"."services"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "assignments" ADD CONSTRAINT "assignments_child_id_people_id_fk" FOREIGN KEY ("child_id") REFERENCES "public"."people"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "assignments" ADD CONSTRAINT "assignments_buddy_id_people_id_fk" FOREIGN KEY ("buddy_id") REFERENCES "public"."people"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "card_access_log" ADD CONSTRAINT "card_access_log_card_id_cards_id_fk" FOREIGN KEY ("card_id") REFERENCES "public"."cards"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "card_access_log" ADD CONSTRAINT "card_access_log_viewer_id_people_id_fk" FOREIGN KEY ("viewer_id") REFERENCES "public"."people"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "cards" ADD CONSTRAINT "cards_church_id_churches_id_fk" FOREIGN KEY ("church_id") REFERENCES "public"."churches"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "cards" ADD CONSTRAINT "cards_child_id_people_id_fk" FOREIGN KEY ("child_id") REFERENCES "public"."people"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "checkins" ADD CONSTRAINT "checkins_service_id_services_id_fk" FOREIGN KEY ("service_id") REFERENCES "public"."services"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "checkins" ADD CONSTRAINT "checkins_child_id_people_id_fk" FOREIGN KEY ("child_id") REFERENCES "public"."people"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "household_links" ADD CONSTRAINT "household_links_parent_id_people_id_fk" FOREIGN KEY ("parent_id") REFERENCES "public"."people"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "household_links" ADD CONSTRAINT "household_links_child_id_people_id_fk" FOREIGN KEY ("child_id") REFERENCES "public"."people"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "lessons" ADD CONSTRAINT "lessons_church_id_churches_id_fk" FOREIGN KEY ("church_id") REFERENCES "public"."churches"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "moments" ADD CONSTRAINT "moments_service_id_services_id_fk" FOREIGN KEY ("service_id") REFERENCES "public"."services"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "moments" ADD CONSTRAINT "moments_child_id_people_id_fk" FOREIGN KEY ("child_id") REFERENCES "public"."people"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "moments" ADD CONSTRAINT "moments_buddy_id_people_id_fk" FOREIGN KEY ("buddy_id") REFERENCES "public"."people"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "parent_notes" ADD CONSTRAINT "parent_notes_service_id_services_id_fk" FOREIGN KEY ("service_id") REFERENCES "public"."services"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "parent_notes" ADD CONSTRAINT "parent_notes_child_id_people_id_fk" FOREIGN KEY ("child_id") REFERENCES "public"."people"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "people" ADD CONSTRAINT "people_church_id_churches_id_fk" FOREIGN KEY ("church_id") REFERENCES "public"."churches"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "services" ADD CONSTRAINT "services_church_id_churches_id_fk" FOREIGN KEY ("church_id") REFERENCES "public"."churches"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "assignments_service_child_idx" ON "assignments" USING btree ("service_id","child_id");--> statement-breakpoint
CREATE INDEX "people_church_idx" ON "people" USING btree ("church_id");--> statement-breakpoint
CREATE INDEX "services_church_idx" ON "services" USING btree ("church_id");