import { relations } from "drizzle-orm";

import {
  boolean,
  decimal,
  integer,
  jsonb,
  pgTable,
  timestamp,
  uuid,
  varchar,
} from "drizzle-orm/pg-core";

import tenantSubscriptions from "./tenantSubscriptions.js";
import subscriptionPaymentHistory from "./subscriptionPaymentHistory.js";

const subscriptionPlans = pgTable("subscription_plans", {
  id: uuid("id").defaultRandom().primaryKey(),

  name: varchar("name", { length: 100 }).notNull(),

  tagline: varchar("tagline", { length: 255 }),

  description: varchar("description", { length: 1000 }),

  monthlyPrice: decimal("monthly_price", {
    precision: 10,
    scale: 2,
  }).notNull(),

  annualPrice: decimal("annual_price", {
    precision: 10,
    scale: 2,
  }).notNull(),

  currency: varchar("currency", {
    length: 3,
  })
    .notNull()
    .default("INR"),

  maxUsers: integer("max_users").notNull(),

  maxOffices: integer("max_offices").notNull(),

  maxStorageGb: integer("max_storage_gb").notNull(),

  monthlyOcrPages: integer("monthly_ocr_pages").notNull().default(0),

  monthlyAiDrafts: integer("monthly_ai_drafts").notNull().default(0),

  features: jsonb("features").$type<string[]>().notNull().default([]),
  code: varchar("code", {
    length: 50,
  })
    .notNull()
    .unique(),
  badge: varchar("badge", { length: 50 }),

  isPopular: boolean("is_popular").notNull().default(false),

  isActive: boolean("is_active").notNull().default(true),
  isInternal: boolean("is_internal").notNull().default(false),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

export default subscriptionPlans;

export const subscriptionPlanRelations = relations(
  subscriptionPlans,
  ({ many }) => ({
    tenantSubscriptions: many(tenantSubscriptions),

    paymentHistory: many(subscriptionPaymentHistory),
  }),
);
