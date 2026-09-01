import {
  pgTable,
  uuid,
  varchar,
  text,
} from "drizzle-orm/pg-core";
import { relations } from "drizzle-orm";
import offices from "../offices.js";
import tenants from "../tenants.js";
import notificationQueue from "./notificationQueue.js";



const notificationTemplates = pgTable("notification_templates", {
  id: uuid("id").defaultRandom().primaryKey(),

  tenantId: uuid("tenant_id").references(() => tenants.id),

  officeId: uuid("office_id").references(() => offices.id),

  type: varchar("type", {
    length: 100,
  }).notNull(),

  name: varchar("name", {
    length: 255,
  }).notNull(),

  subject: varchar("subject", {
    length: 255,
  }),

  body: text("body").notNull(),
});

export default notificationTemplates;

export const notificationTemplateRelation = relations(
  notificationTemplates,
  ({ one, many }) => ({
    tenant: one(tenants, {
      fields: [notificationTemplates.tenantId],
      references: [tenants.id],
    }),

    office: one(offices, {
      fields: [notificationTemplates.officeId],
      references: [offices.id],
    }),

    queues: many(notificationQueue),
  })
);
