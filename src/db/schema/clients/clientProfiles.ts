import {
  pgTable,
  uuid,
  varchar,
  text,
  timestamp,
  unique,
} from "drizzle-orm/pg-core";
import { relations } from "drizzle-orm";

import clients from "./clients.js";
import tenants from "../tenants.js";
import offices from "../offices.js";
import users from "../users.js";
import caseClients from "../caseMangment/caseClients.js";
import invoices from "../finance/invoices.js";
import clientLedger from "./clientLedger.js";

/**
 * client_profiles — per-tenant-office engagement record.
 *
 * One client identity (clients table) can have multiple profiles,
 * one per law firm (tenant) + office they are registered with.
 *
 * When a second law firm adds the same email as a client, the system:
 *  1. Finds the existing identity in `clients`
 *  2. Skips creating a new identity in `clients`
 *  3. Only inserts a new row here with the new tenantId + officeId
 */
const clientProfiles = pgTable(
  "client_profiles",
  {
    id: uuid("id").defaultRandom().primaryKey(),

    /** Reference to the global client identity */
    identityId: uuid("identity_id")
      .notNull()
      .references(() => clients.id, { onDelete: "cascade" }),

    /** Which law firm (tenant) this profile belongs to */
    tenantId: uuid("tenant_id")
      .notNull()
      .references(() => tenants.id, { onDelete: "cascade" }),

    /** Which office within the tenant — optional */
    officeId: uuid("office_id").references(() => offices.id, {
      onDelete: "set null",
    }),

    /**
     * Firm-specific overrides — the law firm may store a different
     * company name or notes than the global identity.
     */
    companyName: varchar("company_name", { length: 255 }),

    notes: text("notes"),

    /** active | inactive — the firm can deactivate a client profile */
    status: varchar("status", { length: 50 }).notNull().default("active"),

    createdBy: uuid("created_by").references(() => users.id, {
      onDelete: "set null",
    }),

    createdAt: timestamp("created_at").defaultNow().notNull(),

    updatedAt: timestamp("updated_at").defaultNow().notNull(),
  },
  (t) => ({
    /**
     * A client identity can only have ONE profile per (tenant + office).
     * This prevents duplicate profiles for the same firm + office.
     */
    uniqueEngagement: unique("uq_client_profiles_identity_tenant_office").on(
      t.identityId,
      t.tenantId,
      t.officeId
    ),
  })
);

export default clientProfiles;

export const clientProfileRelation = relations(
  clientProfiles,
  ({ one, many }) => ({
    /** The global client identity */
    identity: one(clients, {
      fields: [clientProfiles.identityId],
      references: [clients.id],
    }),

    tenant: one(tenants, {
      fields: [clientProfiles.tenantId],
      references: [tenants.id],
    }),

    office: one(offices, {
      fields: [clientProfiles.officeId],
      references: [offices.id],
    }),

    createdByUser: one(users, {
      fields: [clientProfiles.createdBy],
      references: [users.id],
    }),
  })
);
