import { pgTable, uuid, varchar, text, timestamp } from "drizzle-orm/pg-core";
import { relations } from "drizzle-orm";
import offices from "../offices.js";
import tenants from "../tenants.js";
import users from "../users.js";
import caseClients from "../caseMangment/caseClients.js";
import invoices from "../finance/invoices.js";
import clientLedger from "./clientLedger.js";

const clients = pgTable("clients", {
  id: uuid("id").defaultRandom().primaryKey(),

  tenantId: uuid("tenant_id").references(() => tenants.id),

  officeId: uuid("office_id").references(() => offices.id),

  companyName: varchar("company_name", { length: 255 }),

  firstName: varchar("first_name", { length: 255 }).notNull(),

  lastName: varchar("last_name", { length: 255 }),

  email: varchar("email", { length: 255 }),

  phone: varchar("phone", { length: 20 }),

  address: varchar("address", { length: 500 }),

  city: varchar("city", { length: 100 }),

  state: varchar("state", { length: 100 }),

  country: varchar("country", { length: 100 }),

  notes: text("notes"),

  createdBy: uuid("created_by"),

  createdAt: timestamp("created_at").defaultNow().notNull(),
});

export default clients;

export const clientRelation = relations(clients, ({ one, many }) => ({
  tenant: one(tenants, {
    fields: [clients.tenantId],
    references: [tenants.id],
  }),

  office: one(offices, {
    fields: [clients.officeId],
    references: [offices.id],
  }),

  creator: one(users, {
    fields: [clients.createdBy],
    references: [users.id],
  }),
  cases: many(caseClients),
  invoices: many(invoices),
  ledgerEntries: many(clientLedger),
}));
