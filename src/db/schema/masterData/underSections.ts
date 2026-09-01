import { relations } from "drizzle-orm";
import { pgTable, text, uuid, varchar } from "drizzle-orm/pg-core";
import cases from "../caseMangment/cases.js";
import tenants from "../tenants.js";

const underSections = pgTable("under_sections", {
  id: uuid("id").defaultRandom().primaryKey(),

  tenantId: uuid("tenant_id").references(() => tenants.id),

  actName: varchar("act_name", { length: 255 }).notNull(),
  slug: varchar("slug", { length: 255 }).notNull(),
  section: varchar("section", { length: 100 }).notNull(),

  description: text("description"),
});

export default underSections;

export const underSectionRelation = relations(
  underSections,
  ({ one, many }) => ({
    tenant: one(tenants, {
      fields: [underSections.tenantId],
      references: [tenants.id],
    }),
    cases: many(cases),
  }),
);
