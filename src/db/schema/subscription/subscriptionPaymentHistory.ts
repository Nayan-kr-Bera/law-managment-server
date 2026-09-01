import {
  decimal,
  pgTable,
  timestamp,
  uuid,
  varchar,
} from "drizzle-orm/pg-core";

import { relations } from "drizzle-orm";

import tenants from "../tenants.js";
import subscriptionPlans from "./subscriptionPlans.js";

import { billingCycleEnum, subscriptionPaymentStatusEnum } from "../enum.js";

const subscriptionPaymentHistory = pgTable("subscription_payment_history", {
  id: uuid("id").defaultRandom().primaryKey(),

  tenantId: uuid("tenant_id")
    .notNull()
    .references(() => tenants.id),

  invoiceNumber: varchar("invoice_number", {
    length: 30,
  })
    .notNull()
    .unique(),

  planId: uuid("plan_id").references(() => subscriptionPlans.id),

  planName: varchar("plan_name", {
    length: 100,
  }),

  amount: decimal("amount", {
    precision: 10,
    scale: 2,
  }).notNull(),

  currency: varchar("currency", {
    length: 3,
  })
    .notNull()
    .default("INR"),

  status: subscriptionPaymentStatusEnum("status").notNull().default("paid"),

  billingCycle: billingCycleEnum("billing_cycle"),

  paymentMethod: varchar("payment_method", {
    length: 100,
  }),

  receiptUrl: varchar("receipt_url", {
    length: 500,
  }),

  transactionDate: timestamp("transaction_date").defaultNow().notNull(),

  createdAt: timestamp("created_at").defaultNow().notNull(),
});

export default subscriptionPaymentHistory;

export const subscriptionPaymentHistoryRelation = relations(
  subscriptionPaymentHistory,
  ({ one }) => ({
    tenant: one(tenants, {
      fields: [subscriptionPaymentHistory.tenantId],
      references: [tenants.id],
    }),

    plan: one(subscriptionPlans, {
      fields: [subscriptionPaymentHistory.planId],
      references: [subscriptionPlans.id],
    }),
  }),
);
