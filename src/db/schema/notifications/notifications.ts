import {
  pgTable,
  uuid,
  varchar,
  text,
  timestamp,
} from "drizzle-orm/pg-core";
import { relations } from "drizzle-orm";


import {
  notificationStatusEnum,
  notificationTypeEnum,
} from "../enum.js";
import tenants from "../tenants.js";
import offices from "../offices.js";
import users from "../users.js";

const notifications = pgTable("notifications", {
  id: uuid("id").defaultRandom().primaryKey(),

  tenantId: uuid("tenant_id").references(() => tenants.id),

  officeId: uuid("office_id").references(() => offices.id),

  userId: uuid("user_id").references(() => users.id),

  title: varchar("title", { length: 255 }).notNull(),

  body: text("body").notNull(),

  type: notificationTypeEnum
  ("type").notNull(),

  status: notificationStatusEnum("status")
    .notNull()
    .default("pending"),

  createdAt: timestamp("created_at").defaultNow().notNull(),
});

export default notifications;

export const notificationRelation = relations(
  notifications,
  ({ one }) => ({
    tenant: one(tenants, {
      fields: [notifications.tenantId],
      references: [tenants.id],
    }),

    office: one(offices, {
      fields: [notifications.officeId],
      references: [offices.id],
    }),

    user: one(users, {
      fields: [notifications.userId],
      references: [users.id],
    }),
  })
);
