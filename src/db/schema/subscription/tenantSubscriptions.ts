import {
  boolean,
  decimal,
  date,
  integer,
  pgTable,
  timestamp,
  uuid,
  varchar,
  unique,
} from "drizzle-orm/pg-core";

import { relations } from "drizzle-orm";

import tenants from "../tenants.js";
import subscriptionPlans from "./subscriptionPlans.js";

import { subscriptionStatusEnum, billingCycleEnum } from "../enum.js";

const tenantSubscriptions = pgTable(
  "tenant_subscriptions",
  {
    id: uuid("id").defaultRandom().primaryKey(),

    // TENANT

    tenantId: uuid("tenant_id")
      .notNull()
      .references(() => tenants.id),

    // CURRENT PLAN

    planId: uuid("plan_id")
      .notNull()
      .references(() => subscriptionPlans.id),

    status: subscriptionStatusEnum("status").notNull().default("active"),

    billingCycle: billingCycleEnum("billing_cycle").notNull().default("annual"),

    amount: decimal("amount", {
      precision: 10,
      scale: 2,
    }).notNull(),

    currency: varchar("currency", {
      length: 3,
    })
      .notNull()
      .default("INR"),

    // BILLING DATES

    startDate: date("start_date").notNull(),

    nextBillingDate: date("next_billing_date").notNull(),

    // AUTO RENEWAL

    autoRenew: boolean("auto_renew").notNull().default(true),

    // OCR MONTHLY USAGE (Page based)

    ocrPagesUsedThisMonth: integer("ocr_pages_used_this_month")
      .notNull()
      .default(0),

    ocrCycleResetDate: date("ocr_cycle_reset_date"),

    // AI DRAFTER USAGE & CREDITS
    aiDraftsUsedThisMonth: integer("ai_drafts_used_this_month")
      .notNull()
      .default(0),

    aiDraftAddonCredits: integer("ai_draft_addon_credits")
      .notNull()
      .default(0),

    aiDraftCycleResetDate: date("ai_draft_cycle_reset_date"),

    // PENDING PLAN CHANGE
    //
    // Example:
    //
    // Current:
    // Solo ₹799
    //
    // Pending:
    // Professional ₹1499
    //
    // The pending plan becomes active on
    // nextBillingDate.

    pendingPlanId: uuid("pending_plan_id").references(
      () => subscriptionPlans.id,
    ),

    pendingBillingCycle: billingCycleEnum("pending_billing_cycle"),

    pendingAmount: decimal("pending_amount", {
      precision: 10,
      scale: 2,
    }),

    // PAYMENT METHOD

    paymentMethodBrand: varchar("payment_method_brand", {
      length: 100,
    }),

    paymentMethodLast4: varchar("payment_method_last4", {
      length: 4,
    }),

    paymentMethodExpiry: varchar("payment_method_expiry", {
      length: 7,
    }),

    // TIMESTAMPS

    createdAt: timestamp("created_at").defaultNow().notNull(),

    updatedAt: timestamp("updated_at").defaultNow().notNull(),
  },

  (table) => ({
    uniqueTenantSubscription: unique().on(table.tenantId),
  }),
);

export default tenantSubscriptions;

export const tenantSubscriptionRelation = relations(
  tenantSubscriptions,
  ({ one }) => ({
    tenant: one(tenants, {
      fields: [tenantSubscriptions.tenantId],
      references: [tenants.id],
    }),

    plan: one(subscriptionPlans, {
      fields: [tenantSubscriptions.planId],
      references: [subscriptionPlans.id],
    }),

    pendingPlan: one(subscriptionPlans, {
      fields: [tenantSubscriptions.pendingPlanId],
      references: [subscriptionPlans.id],
    }),
  }),
);
