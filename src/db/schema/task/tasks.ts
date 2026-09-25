import {
  pgTable,
  uuid,
  varchar,
  text,
  date,
  timestamp,
} from "drizzle-orm/pg-core";

import { relations } from "drizzle-orm";

import { taskPriorityEnum, taskStatusEnum } from "../enum.js";

import tenants from "../tenants.js";
import offices from "../offices.js";
import cases from "../caseMangment/cases.js";
import users from "../users.js";
import taskComments from "./taskComments.js";
import taskTimelines from "./taskTimelines.js";

const tasks = pgTable("tasks", {
  id: uuid("id").defaultRandom().primaryKey(),

  tenantId: uuid("tenant_id").references(() => tenants.id),

  officeId: uuid("office_id").references(() => offices.id),

  caseId: uuid("case_id").references(() => cases.id),

  assignedTo: uuid("assigned_to").references(() => users.id),

  title: varchar("title", {
    length: 255,
  }).notNull(),

  description: text("description"),

  dueDate: date("due_date"),

  priority: taskPriorityEnum("priority").notNull().default("medium"),

  status: taskStatusEnum("status").notNull().default("todo"),

  createdBy: uuid("created_by").references(() => users.id),

  updatedBy: uuid("updated_by").references(() => users.id),

  createdAt: timestamp("created_at", {
    withTimezone: true,
  })
    .defaultNow()
    .notNull(),

  updatedAt: timestamp("updated_at", {
    withTimezone: true,
  })
    .defaultNow()
    .notNull(),
});

export default tasks;

export const taskRelation = relations(tasks, ({ one, many }) => ({
  tenant: one(tenants, {
    fields: [tasks.tenantId],
    references: [tenants.id],
  }),

  office: one(offices, {
    fields: [tasks.officeId],
    references: [offices.id],
  }),

  case: one(cases, {
    fields: [tasks.caseId],
    references: [cases.id],
  }),

  assignee: one(users, {
    fields: [tasks.assignedTo],
    references: [users.id],
  }),

  creator: one(users, {
    fields: [tasks.createdBy],
    references: [users.id],
    relationName: "task_creator",
  }),

  updater: one(users, {
    fields: [tasks.updatedBy],
    references: [users.id],
    relationName: "task_updater",
  }),

  comments: many(taskComments),
  timelines: many(taskTimelines),
}));