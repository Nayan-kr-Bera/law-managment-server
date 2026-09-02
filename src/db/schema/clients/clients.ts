import { pgTable, uuid, varchar, text, timestamp } from "drizzle-orm/pg-core";
import { relations } from "drizzle-orm";
import users from "../users.js";
import caseClients from "../caseMangment/caseClients.js";
import invoices from "../finance/invoices.js";
import clientLedger from "./clientLedger.js";
import clientProfiles from "./clientProfiles.js";
import { clientUserStatusEnum } from "../enum.js";

/**
 * clients — the GLOBAL identity record for a client.
 *
 * This table stores WHO the person is (name, email, phone).
 * It is NOT scoped to a tenant or office.
 *
 * For per-tenant-office membership, see: client_profiles table.
 *
 * One client identity can exist across multiple law firms (tenants)
 * and offices. When a second law firm adds the same email, only a
 * new client_profiles row is created — this row is reused.
 */
const clients = pgTable("clients", {
  id: uuid("id").defaultRandom().primaryKey(),

  // NOTE: tenantId and officeId have been moved to client_profiles.
  // Each law firm's relationship with this client identity lives there.

  companyName: varchar("company_name", { length: 255 }),

  firstName: varchar("first_name", { length: 255 }).notNull(),

  lastName: varchar("last_name", { length: 255 }),

  email: varchar("email", { length: 255 }).unique(),

  phone: varchar("phone", { length: 20 }),

  address: varchar("address", { length: 500 }),

  city: varchar("city", { length: 100 }),

  state: varchar("state", { length: 100 }),

  country: varchar("country", { length: 100 }),

  notes: text("notes"),

  passwordHash: varchar("password_hash", { length: 255 }),

  status: clientUserStatusEnum("status")
    .notNull()
    .default("active"),

  lastLoginAt: timestamp("last_login_at"),

  createdBy: uuid("created_by"),

  createdAt: timestamp("created_at").defaultNow().notNull(),
});

export default clients;

export const clientRelation = relations(clients, ({ one, many }) => ({
  creator: one(users, {
    fields: [clients.createdBy],
    references: [users.id],
  }),

  /** All per-tenant-office profiles for this identity */
  profiles: many(clientProfiles),

  cases: many(caseClients),
  invoices: many(invoices),
  ledgerEntries: many(clientLedger),
}));
