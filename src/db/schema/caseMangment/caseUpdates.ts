import {
  pgTable,
  uuid,
  varchar,
  timestamp,
  json,
} from "drizzle-orm/pg-core";
import { relations } from "drizzle-orm";

import cases from "./cases.js";

const caseUpdates = pgTable("case_updates", {
  id: uuid("id").defaultRandom().primaryKey(),

  caseId: uuid("case_id").references(() => cases.id),

  source: varchar("source", { length: 100 }),

  updateType: varchar("update_type", { length: 100 }),

  payload: json("payload"),

  createdAt: timestamp("created_at").defaultNow().notNull(),
});

export default caseUpdates;

export const caseUpdateRelation = relations(
  caseUpdates,
  ({ one }) => ({
    case: one(cases, {
      fields: [caseUpdates.caseId],
      references: [cases.id],
    }),
  })
);