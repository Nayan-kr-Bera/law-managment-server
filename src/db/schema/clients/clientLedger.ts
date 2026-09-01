import {
    decimal,
    pgTable,
    timestamp,
    uuid,
    varchar
} from "drizzle-orm/pg-core";

import { relations } from "drizzle-orm";

import cases from "../caseMangment/cases.js";
import clients from "../clients/clients.js";
import invoices from "../finance/invoices.js";
import payments from "../finance/payments.js";
import tenants from "../tenants.js";

const clientLedger = pgTable("client_ledger", {
  id: uuid("id").defaultRandom().primaryKey(),

  tenantId: uuid("tenant_id")
    .notNull()
    .references(() => tenants.id),

  clientId: uuid("client_id")
    .notNull()
    .references(() => clients.id),

  caseId: uuid("case_id").references(() => cases.id),

  invoiceId: uuid("invoice_id").references(() => invoices.id),

  paymentId: uuid("payment_id").references(() => payments.id),

  transactionDate: timestamp("transaction_date").defaultNow().notNull(),

  description: varchar("description", {
    length: 500,
  }).notNull(),

  debit: decimal("debit", {
    precision: 12,
    scale: 2,
  })
    .notNull()
    .default("0"),

  credit: decimal("credit", {
    precision: 12,
    scale: 2,
  })
    .notNull()
    .default("0"),

  createdAt: timestamp("created_at").defaultNow().notNull(),
});

export default clientLedger;

export const clientLedgerRelation = relations(clientLedger, ({ one }) => ({
  tenant: one(tenants, {
    fields: [clientLedger.tenantId],
    references: [tenants.id],
  }),

  client: one(clients, {
    fields: [clientLedger.clientId],
    references: [clients.id],
  }),

  case: one(cases, {
    fields: [clientLedger.caseId],
    references: [cases.id],
  }),

  invoice: one(invoices, {
    fields: [clientLedger.invoiceId],
    references: [invoices.id],
  }),

  payment: one(payments, {
    fields: [clientLedger.paymentId],
    references: [payments.id],
  }),
}));
