import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import { config } from "../config/index.js";
import * as schemaTables from "./schema/index.js";
import * as schemaRelations from "./schema/relations.js";

const sql = postgres(config.DB_URL || "", { max: 1 });
const schema = { ...schemaTables, ...schemaRelations };
const db = drizzle(sql, { schema, logger: false });

export default db;
