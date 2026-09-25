import {
  pgTable,
  uuid,
  varchar,
  text,
  timestamp,
} from "drizzle-orm/pg-core";
import { relations } from "drizzle-orm";

import tenants from "../tenants.js";
import offices from "../offices.js";
import tasks from "./tasks.js";
import users from "../users.js";

const taskTimelines = pgTable("task_timelines", {
  id: uuid("id").defaultRandom().primaryKey(),

  tenantId: uuid("tenant_id").references(() => tenants.id),

  officeId: uuid("office_id").references(() => offices.id),

  taskId: uuid("task_id")
    .references(() => tasks.id, { onDelete: "cascade" })
    .notNull(),

  userId: uuid("user_id").references(() => users.id), // Who performed the action

  action: varchar("action", {
    length: 50,
  }).notNull(), // "created" | "assigned" | "reassigned" | "status_changed" | "due_date_changed" | "priority_changed" | "comment_added"

  fromAssigneeId: uuid("from_assignee_id").references(() => users.id),

  toAssigneeId: uuid("to_assignee_id").references(() => users.id),

  fromStatus: varchar("from_status", { length: 50 }),

  toStatus: varchar("to_status", { length: 50 }),

  title: varchar("title", {
    length: 255,
  }).notNull(),

  description: text("description"),

  createdAt: timestamp("created_at", {
    withTimezone: true,
  })
    .defaultNow()
    .notNull(),
});

export default taskTimelines;

export const taskTimelineRelation = relations(taskTimelines, ({ one }) => ({
  tenant: one(tenants, {
    fields: [taskTimelines.tenantId],
    references: [tenants.id],
  }),

  office: one(offices, {
    fields: [taskTimelines.officeId],
    references: [offices.id],
  }),

  task: one(tasks, {
    fields: [taskTimelines.taskId],
    references: [tasks.id],
  }),

  performer: one(users, {
    fields: [taskTimelines.userId],
    references: [users.id],
    relationName: "task_timeline_performer",
  }),

  fromAssignee: one(users, {
    fields: [taskTimelines.fromAssigneeId],
    references: [users.id],
    relationName: "task_timeline_from_assignee",
  }),

  toAssignee: one(users, {
    fields: [taskTimelines.toAssigneeId],
    references: [users.id],
    relationName: "task_timeline_to_assignee",
  }),
}));
