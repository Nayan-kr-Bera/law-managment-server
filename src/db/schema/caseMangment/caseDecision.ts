import {
  date,
  pgTable,
  text,
  timestamp,
  uuid,
  varchar,
} from "drizzle-orm/pg-core";
import { relations } from "drizzle-orm";

import cases from "./cases.js";
import users from "../users.js";

const caseDecisions = pgTable("case_decisions", {
  id: uuid("id").defaultRandom().primaryKey(),

  caseId: uuid("case_id")
    .notNull()
    .references(() => cases.id),

  decisionDate: date("decision_date").notNull(),

  natureOfDisposal: varchar("nature_of_disposal", {
    length: 100,
  }).notNull(),

  judgmentSummary: text("judgment_summary"),

  createdBy: uuid("created_by").references(() => users.id),

  createdAt: timestamp("created_at").defaultNow().notNull(),

  updatedAt: timestamp("updated_at").defaultNow().notNull(),
});

export default caseDecisions;

export const caseDecisionRelations = relations(
  caseDecisions,
  ({ one }) => ({
    case: one(cases, {
      fields: [caseDecisions.caseId],
      references: [cases.id],
    }),

    createdByUser: one(users, {
      fields: [caseDecisions.createdBy],
      references: [users.id],
    }),
  }),
);