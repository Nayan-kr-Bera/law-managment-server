-- Creates the device-bound session table for the chamber mobile app.
-- Run once on the database (or use `npm run push`, which syncs the Drizzle schema).
CREATE TABLE IF NOT EXISTS "mobile_sessions" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "user_id" uuid NOT NULL,
  "tenant_id" uuid,
  "scope_id" uuid,
  "device_id" varchar(128) NOT NULL,
  "device_name" varchar(255),
  "platform" varchar(32),
  "token_hash" varchar(128) NOT NULL,
  "prev_token_hash" varchar(128),
  "prev_valid_until" timestamp,
  "last_ip" varchar(64),
  "user_agent" varchar(512),
  "last_used_at" timestamp DEFAULT now(),
  "expires_at" timestamp NOT NULL,
  "revoked_at" timestamp,
  "created_at" timestamp DEFAULT now(),
  CONSTRAINT "mobile_sessions_user_id_users_id_fk"
    FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action
);

CREATE UNIQUE INDEX IF NOT EXISTS "mobile_sessions_user_device_uq"
  ON "mobile_sessions" USING btree ("user_id", "device_id");
CREATE INDEX IF NOT EXISTS "mobile_sessions_user_idx"
  ON "mobile_sessions" USING btree ("user_id");

