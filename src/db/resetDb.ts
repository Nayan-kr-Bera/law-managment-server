import postgres from "postgres";
import { config } from "../config/index.js";

async function resetDatabase() {
  if (process.env.NODE_ENV !== "development") {
    throw new Error("Database reset is only allowed in development mode");
  }

  const sql = postgres(config.DB_URL || "", { max: 1 });

  try {
    await sql.unsafe(`
      DO $$
      DECLARE
        table_list text;
      BEGIN
        SELECT string_agg(format('%I.%I', schemaname, tablename), ', ')
        INTO table_list
        FROM pg_tables
        WHERE schemaname = 'public';

        IF table_list IS NOT NULL THEN
          EXECUTE 'TRUNCATE TABLE ' || table_list || ' RESTART IDENTITY CASCADE';
        END IF;
      END $$;
    `);

    console.log("Database reset successfully");
  } finally {
    await sql.end();
  }
}

resetDatabase().catch((error: unknown) => {
  console.error("Database reset failed", error);
  process.exitCode = 1;
});

export default resetDatabase;