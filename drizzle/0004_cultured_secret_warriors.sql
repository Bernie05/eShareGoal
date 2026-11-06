CREATE TABLE "import_review" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"goal_id" uuid NOT NULL,
	"ref" text NOT NULL,
	"message_id" text,
	"amount" bigint NOT NULL,
	"day" date NOT NULL,
	"payer" text DEFAULT '' NOT NULL,
	"member_id" text,
	"job" text DEFAULT '' NOT NULL,
	"status" text DEFAULT 'pending' NOT NULL,
	"found_by" text,
	"found_at" timestamp with time zone DEFAULT now() NOT NULL,
	"decided_by" text,
	"decided_at" timestamp with time zone
);
--> statement-breakpoint
ALTER TABLE "import_review" ADD CONSTRAINT "import_review_goal_id_goal_id_fk" FOREIGN KEY ("goal_id") REFERENCES "public"."goal"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "import_review" ADD CONSTRAINT "import_review_member_id_user_id_fk" FOREIGN KEY ("member_id") REFERENCES "public"."user"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "import_review" ADD CONSTRAINT "import_review_found_by_user_id_fk" FOREIGN KEY ("found_by") REFERENCES "public"."user"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "import_review" ADD CONSTRAINT "import_review_decided_by_user_id_fk" FOREIGN KEY ("decided_by") REFERENCES "public"."user"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "import_review_goal_ref_unique" ON "import_review" USING btree ("goal_id","ref");--> statement-breakpoint
CREATE UNIQUE INDEX "import_review_goal_message_unique" ON "import_review" USING btree ("goal_id","message_id") WHERE "import_review"."message_id" is not null;