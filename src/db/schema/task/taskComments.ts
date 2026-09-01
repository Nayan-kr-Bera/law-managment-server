import { relations } from "drizzle-orm";
import { pgTable, text, timestamp, uuid } from "drizzle-orm/pg-core";

import users from "../users.js";
import tasks from "./tasks.js";

const taskComments = pgTable("task_comments", {
  id: uuid("id").defaultRandom().primaryKey(),

  taskId: uuid("task_id")
    .notNull()
    .references(() => tasks.id, {
      onDelete: "cascade",
    }),

  userId: uuid("user_id")
    .notNull()
    .references(() => users.id),

  comment: text("comment").notNull(),

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

export default taskComments;

export const taskCommentRelations = relations(taskComments, ({ one }) => ({
  task: one(tasks, {
    fields: [taskComments.taskId],
    references: [tasks.id],
  }),

  user: one(users, {
    fields: [taskComments.userId],
    references: [users.id],
  }),
}));
