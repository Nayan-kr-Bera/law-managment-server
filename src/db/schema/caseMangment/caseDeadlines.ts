import {
  pgTable,
  uuid,
  varchar,
  text,
  date,
  timestamp,
} from "drizzle-orm/pg-core";
import { relations } from "drizzle-orm";

import users from "../users.js";
import cases from "./cases.js";
import { casePriorityEnum, caseStatusEnum } from "../enum.js";


const caseDeadlines = pgTable("case_deadlines", {
  id: uuid("id").defaultRandom().primaryKey(),

  caseId: uuid("case_id").references(() => cases.id),

  title: varchar("title", {
    length: 255,
  }).notNull(),

  description: text("description"),

  dueDate: date("due_date").notNull(),

  priority: casePriorityEnum("priority").notNull(),

  status: caseStatusEnum("status").notNull(),

  assignedTo: uuid("assigned_to"),

  completedAt: timestamp("completed_at"),

  createdBy: uuid("created_by"),

  createdAt: timestamp("created_at")
    .defaultNow()
    .notNull(),
});

export default caseDeadlines;

export const caseDeadlineRelation = relations(
  caseDeadlines,
  ({ one }) => ({
    case: one(cases, {
      fields: [caseDeadlines.caseId],
      references: [cases.id],
    }),

    assignedUser: one(users, {
      fields: [caseDeadlines.assignedTo],
      references: [users.id],
      relationName: "case_deadline_assigned_to",
    }),

    createdByUser: one(users, {
      fields: [caseDeadlines.createdBy],
      references: [users.id],
      relationName: "case_deadline_created_by",
    }),
  })
);