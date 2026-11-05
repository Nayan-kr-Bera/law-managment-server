import {
  pgTable,
  uuid,
  varchar,
  timestamp,
  integer,
  jsonb,
  index,
} from "drizzle-orm/pg-core";
import tenants from "../tenants.js";
import users from "../users.js";

export interface IJudgmentSessionMessage {
  role: "user" | "assistant";
  content: string;
  timestamp: number;
}

export const judgmentAiSessions = pgTable(
  "judgment_ai_sessions",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    tenantId: uuid("tenant_id")
      .references(() => tenants.id, { onDelete: "cascade" })
      .notNull(),
    judgmentKey: varchar("judgment_key", { length: 255 }).notNull(),
    title: varchar("title", { length: 500 }).notNull(),
    citation: varchar("citation", { length: 255 }),
    court: varchar("court", { length: 255 }),
    messages: jsonb("messages")
      .$type<IJudgmentSessionMessage[]>()
      .default([])
      .notNull(),
    questionsUsed: integer("questions_used").default(0).notNull(),
    createdBy: uuid("created_by").references(() => users.id, {
      onDelete: "set null",
    }),
    savedAt: timestamp("saved_at").defaultNow().notNull(),
    expiresAt: timestamp("expires_at").notNull(),
    updatedAt: timestamp("updated_at").defaultNow().notNull(),
  },
  (table) => [
    index("judgment_ai_sessions_tenant_key_idx").on(
      table.tenantId,
      table.judgmentKey,
    ),
    index("judgment_ai_sessions_expires_at_idx").on(table.expiresAt),
  ],
);

export default judgmentAiSessions;

