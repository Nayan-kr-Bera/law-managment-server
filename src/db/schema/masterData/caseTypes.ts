import { relations } from "drizzle-orm";
import {
  boolean,
  pgTable,
  timestamp,
  uuid,
  varchar,
} from "drizzle-orm/pg-core";
import cases from "../caseMangment/cases.js";
import tenants from "../tenants.js";

const caseTypes = pgTable("case_types", {
  id: uuid("id").defaultRandom().primaryKey(),

  tenantId: uuid("tenant_id").references(() => tenants.id).notNull(),

  name: varchar("name", { length: 255 }).notNull(),
  slug: varchar("slug", { length: 255 }).notNull(), 
  description: varchar("description", { length: 500 }),

  isActive: boolean("is_active").default(true).notNull(),

  createdAt: timestamp("created_at").defaultNow().notNull(),
});

export default caseTypes;

export const caseTypeRelation = relations(caseTypes, ({ one, many }) => ({
  tenant: one(tenants, {
    fields: [caseTypes.tenantId],
    references: [tenants.id],
  }),

  cases: many(cases),
}));
