import { relations } from "drizzle-orm";
import { bigint, pgTable, timestamp, uuid, varchar } from "drizzle-orm/pg-core";
import companies from "./masterData/companies.js";
import offices from "./offices.js";
import subscriptionPaymentHistory from "./subscription/subscriptionPaymentHistory.js";
import tenantSubscriptions from "./subscription/tenantSubscriptions.js";
import userScopes from "./userScope.js";

const tenants = pgTable("tenants", {
  id: uuid("id").defaultRandom().primaryKey(),

  name: varchar("name", { length: 255 }).notNull(),

  slug: varchar("slug", { length: 255 }).notNull().unique(),

  logo: varchar("logo", { length: 255 }),
  gst: varchar("gst", { length: 255 }),
  organisationEmail: varchar("organisation_email", { length: 255 }),
  organisationPhone: varchar("organisation_phone", { length: 255 }),
  timezone: varchar("timezone", { length: 100 }).notNull(),

  status: varchar("status", {
    length: 50,
  }).notNull(),
  storageUsedBytes: bigint("storage_used_bytes", {
    mode: "number",
  })
    .notNull()
    .default(0),
  createdAt: timestamp("created_at").defaultNow().notNull(),

  updatedAt: timestamp("updated_at").defaultNow().notNull(),
});

export default tenants;

export const tenantRelation = relations(tenants, ({ one, many }) => ({
  offices: many(offices),

  companies: many(companies),

  userScopes: many(userScopes),
  subscription: one(tenantSubscriptions),

  subscriptionPaymentHistory: many(subscriptionPaymentHistory),
}));
