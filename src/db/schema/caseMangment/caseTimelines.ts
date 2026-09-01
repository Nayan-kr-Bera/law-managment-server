import {
  pgTable,
  uuid,
  varchar,
  text,
  timestamp,
} from "drizzle-orm/pg-core";
import { relations } from "drizzle-orm";

import cases from "./cases.js";
import users from "../users.js";

const caseTimelines = pgTable("case_timelines", {
  id: uuid("id").defaultRandom().primaryKey(),

  caseId: uuid("case_id").references(() => cases.id),

  userId: uuid("user_id").references(() => users.id),

  activityType: varchar("activity_type", {
    length: 100,
  }).notNull(),

  title: varchar("title", {
    length: 255,
  }).notNull(),

  description: text("description"),

  createdAt: timestamp("created_at").defaultNow().notNull(),
});

export default caseTimelines;

export const caseTimelineRelation = relations(
  caseTimelines,
  ({ one }) => ({
    case: one(cases, {
      fields: [caseTimelines.caseId],
      references: [cases.id],
    }),

    user: one(users, {
      fields: [caseTimelines.userId],
      references: [users.id],
    }),
  })
);