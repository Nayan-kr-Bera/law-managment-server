import {
  pgTable,
  uuid,
  varchar,
  text,
  timestamp,
} from "drizzle-orm/pg-core";
import { relations } from "drizzle-orm";
import cases from "../caseMangment/cases.js";


const courtSyncs = pgTable("court_syncs", {
  id: uuid("id").defaultRandom().primaryKey(),

  caseId: uuid("case_id").references(() => cases.id),

  provider: varchar("provider", {
    length: 100,
  }).notNull(),

  syncStatus: varchar("sync_status", {
    length: 100,
  }).notNull(),

  lastSyncedAt: timestamp("last_synced_at"),

  lastError: text("last_error"),
});

export default courtSyncs;

export const courtSyncRelation = relations(courtSyncs, ({ one }) => ({
  case: one(cases, {
    fields: [courtSyncs.caseId],
    references: [cases.id],
  }),
}));