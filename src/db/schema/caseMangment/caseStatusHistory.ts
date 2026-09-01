import {
  pgTable,
  uuid,
  varchar,
  timestamp,
} from "drizzle-orm/pg-core";
import { relations } from "drizzle-orm";

import users from "../users.js";
import cases from "./cases.js";

const caseStatusHistory = pgTable("case_status_history", {
  id: uuid("id").defaultRandom().primaryKey(),

  caseId: uuid("case_id").references(() => cases.id),

  oldStatus: varchar("old_status", {
    length: 100,
  }),

  newStatus: varchar("new_status", {
    length: 100,
  }).notNull(),

  changedBy: uuid("changed_by"),

  changedAt: timestamp("changed_at").defaultNow().notNull(),
});

export default caseStatusHistory;

export const caseStatusHistoryRelation = relations(
  caseStatusHistory,
  ({ one }) => ({
    case: one(cases, {
      fields: [caseStatusHistory.caseId],
      references: [cases.id],
    }),

    changedByUser: one(users, {
      fields: [caseStatusHistory.changedBy],
      references: [users.id],
      relationName: "case_status_changed_by",
    }),
  })
);