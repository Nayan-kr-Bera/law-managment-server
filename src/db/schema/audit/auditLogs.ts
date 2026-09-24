import {
  pgTable,
  uuid,
  varchar,
  text,
  jsonb,
  timestamp,
} from "drizzle-orm/pg-core";
import { relations } from "drizzle-orm";
import offices from "../offices.js";
import tenants from "../tenants.js";
import users from "../users.js";

const auditLogs = pgTable("audit_logs", {
  id: uuid("id").defaultRandom().primaryKey(),

  // Tenant and office references are intentionally nullable
  // so this table can serve both tenant/office audit logs and platform admin logs
  tenantId: uuid("tenant_id").references(() => tenants.id, {
    onDelete: "cascade",
  }),

  officeId: uuid("office_id").references(() => offices.id, {
    onDelete: "set null",
  }),

  userId: uuid("user_id").references(() => users.id, {
    onDelete: "set null",
  }),

  entity: varchar("entity", { length: 100 }).notNull(),

  entityId: uuid("entity_id"),

  action: varchar("action", { length: 100 }).notNull(),

  description: text("description"),

  ipAddress: varchar("ip_address", { length: 100 }),

  details: jsonb("details"),

  createdAt: timestamp("created_at").defaultNow().notNull(),
});

export default auditLogs;

export const auditLogRelation = relations(auditLogs, ({ one }) => ({
  tenant: one(tenants, {
    fields: [auditLogs.tenantId],
    references: [tenants.id],
  }),

  office: one(offices, {
    fields: [auditLogs.officeId],
    references: [offices.id],
  }),

  user: one(users, {
    fields: [auditLogs.userId],
    references: [users.id],
  }),
}));
