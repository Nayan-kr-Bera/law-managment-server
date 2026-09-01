import {
  pgTable,
  uuid,
  varchar,
  integer,
  timestamp,
  json,
} from "drizzle-orm/pg-core";
import { relations } from "drizzle-orm";

import notificationTemplates from "./notificationTemplates.js";
import tenants from "../tenants.js";
import offices from "../offices.js";
import cases from "../caseMangment/cases.js";
import clients from "../clients/clients.js";
import notificationLogs from "./notificationLogs.js";


const notificationQueue = pgTable("notification_queue", {
  id: uuid("id").defaultRandom().primaryKey(),

  tenantId: uuid("tenant_id").references(() => tenants.id),

  officeId: uuid("office_id").references(() => offices.id),

  caseId: uuid("case_id").references(() => cases.id),

  clientId: uuid("client_id").references(() => clients.id),

  templateId: uuid("template_id").references(() => notificationTemplates.id),

  channel: varchar("channel", {
    length: 50,
  }).notNull(),

  recipient: varchar("recipient", {
    length: 255,
  }).notNull(),

  payload: json("payload"),

  status: varchar("status", {
    length: 50,
  }).notNull(),

  retryCount: integer("retry_count").default(0).notNull(),

  scheduledAt: timestamp("scheduled_at"),

  sentAt: timestamp("sent_at"),
});

export default notificationQueue;

export const notificationQueueRelation = relations(
  notificationQueue,
  ({ one, many }) => ({
    tenant: one(tenants, {
      fields: [notificationQueue.tenantId],
      references: [tenants.id],
    }),

    office: one(offices, {
      fields: [notificationQueue.officeId],
      references: [offices.id],
    }),

    case: one(cases, {
      fields: [notificationQueue.caseId],
      references: [cases.id],
    }),

    client: one(clients, {
      fields: [notificationQueue.clientId],
      references: [clients.id],
    }),

    template: one(notificationTemplates, {
      fields: [notificationQueue.templateId],
      references: [notificationTemplates.id],
    }),

    logs: many(notificationLogs),
  })
);
