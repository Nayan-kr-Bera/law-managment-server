import {
  pgTable,
  uuid,
  varchar,
  decimal,
  timestamp,
} from "drizzle-orm/pg-core";
import { relations } from "drizzle-orm";

import invoices from "./invoices.js";
import clientLedger from "../clients/clientLedger.js";

const payments = pgTable("payments", {
  id: uuid("id").defaultRandom().primaryKey(),

  invoiceId: uuid("invoice_id").references(() => invoices.id),

  amount: decimal("amount", {
    precision: 12,
    scale: 2,
  }).notNull(),

  paymentMethod: varchar("payment_method", {
    length: 100,
  }).notNull(),

  paidAt: timestamp("paid_at").defaultNow().notNull(),
});

export default payments;

export const paymentRelation = relations(payments, ({ one, many }) => ({
  invoice: one(invoices, {
    fields: [payments.invoiceId],
    references: [invoices.id],
  }),
  ledgerEntries: many(clientLedger),
}));
