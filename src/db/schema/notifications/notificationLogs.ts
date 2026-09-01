import {
  pgTable,
  uuid,
  varchar,
  text,
  timestamp,
} from "drizzle-orm/pg-core";
import { relations } from "drizzle-orm";

import notificationQueue from "./notificationQueue.js";

const notificationLogs = pgTable("notification_logs", {
  id: uuid("id").defaultRandom().primaryKey(),

  queueId: uuid("queue_id").references(() => notificationQueue.id),

  provider: varchar("provider", {
    length: 100,
  }),

  response: text("response"),

  status: varchar("status", {
    length: 50,
  }).notNull(),

  createdAt: timestamp("created_at").defaultNow().notNull(),
});

export default notificationLogs;

export const notificationLogRelation = relations(
  notificationLogs,
  ({ one }) => ({
    queue: one(notificationQueue, {
      fields: [notificationLogs.queueId],
      references: [notificationQueue.id],
    }),
  })
);