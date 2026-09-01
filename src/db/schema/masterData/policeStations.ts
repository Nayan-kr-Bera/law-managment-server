import { relations } from "drizzle-orm";
import { pgTable, uuid, varchar } from "drizzle-orm/pg-core";
import cases from "../caseMangment/cases.js";
import tenants from "../tenants.js";

const policeStations = pgTable("police_stations", {
  id: uuid("id").defaultRandom().primaryKey(),

  tenantId: uuid("tenant_id").references(() => tenants.id),

  name: varchar("name", { length: 255 }).notNull(),
  slug: varchar("slug", { length: 255 }).notNull(),
  district: varchar("district", { length: 100 }),

  state: varchar("state", { length: 100 }),
});

export default policeStations;

export const policeStationRelation = relations(
  policeStations,
  ({ one, many }) => ({
    tenant: one(tenants, {
      fields: [policeStations.tenantId],
      references: [tenants.id],
    }),

    cases: many(cases),
  }),
);
