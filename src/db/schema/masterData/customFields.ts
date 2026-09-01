import {
  pgTable,
  uuid,
  varchar,
  integer,
  boolean,
  timestamp,
} from "drizzle-orm/pg-core";
import { relations } from "drizzle-orm";

import tenants from "../tenants.js";
import offices from "../offices.js";
import users from "../users.js";
import customFieldOptions from "./customFieldOptions.js";
import caseCustomFieldValues from "../caseMangment/caseCustomFieldValues.js";

const customFields = pgTable("custom_fields", {
  id: uuid("id").defaultRandom().primaryKey(),

  tenantId: uuid("tenant_id").references(() => tenants.id),

  officeId: uuid("office_id").references(() => offices.id),

  label: varchar("label", { length: 255 }).notNull(),

  fieldKey: varchar("field_key", { length: 100 }).notNull(),

  fieldType: varchar("field_type", { length: 50 }).notNull(),

  isRequired: boolean("is_required").default(false).notNull(),

  sortOrder: integer("sort_order").default(0).notNull(),

  createdBy: uuid("created_by"),

  createdAt: timestamp("created_at").defaultNow().notNull(),
});

export default customFields;

export const customFieldRelation = relations(
  customFields,
  ({ one, many }) => ({
    tenant: one(tenants, {
      fields: [customFields.tenantId],
      references: [tenants.id],
    }),

    office: one(offices, {
      fields: [customFields.officeId],
      references: [offices.id],
    }),

    creator: one(users, {
      fields: [customFields.createdBy],
      references: [users.id],
    }),

    options: many(customFieldOptions),

    values: many(caseCustomFieldValues),
  })
);
