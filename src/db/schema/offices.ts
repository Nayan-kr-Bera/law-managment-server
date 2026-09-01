import {
  boolean,
  pgTable,
  text,
  timestamp,
  uuid,
  varchar,
} from "drizzle-orm/pg-core";
import { relations } from "drizzle-orm";

import tenants from "./tenants.js";
import users from "./users.js";
import userScopeOffices from "./userscopeoffices.js";

const offices = pgTable("offices", {
  id: uuid("id").defaultRandom().primaryKey(),

  tenantId: uuid("tenant_id").references(() => tenants.id),

  name: varchar("name", { length: 255 }).notNull(),

  code: varchar("code", { length: 100 }),

  email: varchar("email", { length: 255 }),

  phone: varchar("phone", { length: 20 }),

  address: text("address"),

  city: varchar("city", { length: 100 }),

  state: varchar("state", { length: 100 }),

  country: varchar("country", { length: 100 }),

  postalCode: varchar("postal_code", { length: 20 }),

  timezone: varchar("timezone", { length: 100 }),

  isHeadOffice: boolean("is_head_office").default(false).notNull(),

  isActive: boolean("is_active").default(true).notNull(),

  createdBy: uuid("created_by"),

  updatedBy: uuid("updated_by"),

  createdAt: timestamp("created_at").defaultNow().notNull(),

  updatedAt: timestamp("updated_at").defaultNow().notNull(),
});

export default offices;

export const officeRelation = relations(offices, ({ one, many }) => ({
  tenant: one(tenants, {
    fields: [offices.tenantId],
    references: [tenants.id],
  }),

  creator: one(users, {
    fields: [offices.createdBy],
    references: [users.id],
    relationName: "office_creator",
  }),
  userScopeOffices: many(userScopeOffices),
  updater: one(users, {
    fields: [offices.updatedBy],
    references: [users.id],
    relationName: "office_updater",
  }),
}));
