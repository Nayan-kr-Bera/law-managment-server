import { sql } from "drizzle-orm";
import db from "./index.js";

export async function ensureAuthSchema(): Promise<void> {
  try {
    await db.execute(
      sql.raw("ALTER TABLE users ALTER COLUMN password DROP NOT NULL")
    );
    await db.execute(
      sql.raw(
        "ALTER TABLE users ADD COLUMN IF NOT EXISTS google_id varchar(255) UNIQUE"
      )
    );
    await db.execute(
      sql.raw(
        "ALTER TABLE users ADD COLUMN IF NOT EXISTS auth_provider varchar(30) NOT NULL DEFAULT 'local'"
      )
    );
  } catch (err) {
    console.warn("[ensureAuthSchema] Non-fatal schema check warning:", err);
  }
}
