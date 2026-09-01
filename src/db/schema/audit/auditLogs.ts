import {
  pgTable,
  uuid,
  varchar,
  timestamp,
} from "drizzle-orm/pg-core";
import { relations } from "drizzle-orm";
import offices from "../offices.js";
import tenants from "../tenants.js";
import users from "../users.js";

const auditLogs = pgTable("audit_logs", {
  id: uuid("id").defaultRandom().primaryKey(),

  tenantId: uuid("tenant_id").references(() => tenants.id),

  officeId: uuid("office_id").references(() => offices.id),

  userId: uuid("user_id").references(() => users.id),

  entity: varchar("entity", { length: 100 }).notNull(),

  entityId: uuid("entity_id").notNull(),

  action: varchar("action", { length: 100 }).notNull(),

  ipAddress: varchar("ip_address", { length: 100 }),

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
