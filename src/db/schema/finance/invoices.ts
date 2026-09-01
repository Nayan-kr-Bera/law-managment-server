import {
  pgTable,
  uuid,
  varchar,
  decimal,
  timestamp,
} from "drizzle-orm/pg-core";
import { relations } from "drizzle-orm";


import { invoiceStatusEnum } from "../enum.js";
import tenants from "../tenants.js";
import offices from "../offices.js";
import clients from "../clients/clients.js";
import cases from "../caseMangment/cases.js";
import invoiceItems from "./invoiceItems.js";
import payments from "./payments.js";
import clientLedger from "../clients/clientLedger.js";

const invoices = pgTable("invoices", {
  id: uuid("id").defaultRandom().primaryKey(),

  tenantId: uuid("tenant_id").references(() => tenants.id),

  officeId: uuid("office_id").references(() => offices.id),

  clientId: uuid("client_id").references(() => clients.id),

  caseId: uuid("case_id").references(() => cases.id),

  invoiceNo: varchar("invoice_no", { length: 100 }).notNull(),

  total: decimal("total", {
    precision: 12,
    scale: 2,
  }).notNull(),

  status: invoiceStatusEnum("status").notNull().default("draft"),

  createdAt: timestamp("created_at").defaultNow().notNull(),
});

export default invoices;

export const invoiceRelation = relations(invoices, ({ one, many }) => ({
  tenant: one(tenants, {
    fields: [invoices.tenantId],
    references: [tenants.id],
  }),

  office: one(offices, {
    fields: [invoices.officeId],
    references: [offices.id],
  }),

  client: one(clients, {
    fields: [invoices.clientId],
    references: [clients.id],
  }),

  case: one(cases, {
    fields: [invoices.caseId],
    references: [cases.id],
  }),

  items: many(invoiceItems),

  payments: many(payments),
  ledgerEntries: many(clientLedger),
}));
