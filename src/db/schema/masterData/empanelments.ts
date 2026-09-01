import { relations } from "drizzle-orm";
import {
  boolean,
  pgTable,
  text,
  uuid,
  varchar,
} from "drizzle-orm/pg-core";
import cases from "../caseMangment/cases.js";
import tenants from "../tenants.js";


const empanelments = pgTable("empanelments", {
  id: uuid("id").defaultRandom().primaryKey(),

  tenantId: uuid("tenant_id").references(() => tenants.id),

  name: varchar("name", { length: 255 }).notNull(),
  slug: varchar("slug", { length: 255 }).notNull(),
  description: text("description"),

  isActive: boolean("is_active").default(true).notNull(),
});

export default empanelments;

export const empanelmentRelation = relations(
  empanelments,
  ({ one, many }) => ({
    tenant: one(tenants, {
      fields: [empanelments.tenantId],
      references: [tenants.id],
    }),

    cases: many(cases),
  })
);
