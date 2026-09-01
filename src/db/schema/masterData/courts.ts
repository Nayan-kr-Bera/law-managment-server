import { relations } from "drizzle-orm";
import {
  boolean,
  pgTable,
  uuid,
  varchar,
} from "drizzle-orm/pg-core";
import cases from "../caseMangment/cases.js";
import tenants from "../tenants.js";

const courts = pgTable("courts", {
  id: uuid("id").defaultRandom().primaryKey(),

  tenantId: uuid("tenant_id").references(() => tenants.id),

  name: varchar("name", { length: 255 }).notNull(),
  slug: varchar("slug", { length: 255 }).notNull(),
  courtType: varchar("court_type", { length: 100 }),

  state: varchar("state", { length: 100 }),
 
  district: varchar("district", { length: 100 }),

  isActive: boolean("is_active").default(true).notNull(),
});

export default courts;

export const courtRelation = relations(courts, ({ one, many }) => ({
  tenant: one(tenants, {
    fields: [courts.tenantId],
    references: [tenants.id],
  }),


  cases: many(cases),
}));
