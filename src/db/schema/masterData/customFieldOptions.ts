import {
  pgTable,
  uuid,
  varchar,
  integer,
} from "drizzle-orm/pg-core";
import { relations } from "drizzle-orm";

import customFields from "./customFields.js";

const customFieldOptions = pgTable("custom_field_options", {
  id: uuid("id").defaultRandom().primaryKey(),

  fieldId: uuid("field_id").references(() => customFields.id),

  label: varchar("label", { length: 255 }).notNull(),

  value: varchar("value", { length: 255 }).notNull(),

  sortOrder: integer("sort_order").default(0).notNull(),
});

export default customFieldOptions;

export const customFieldOptionRelation = relations(
  customFieldOptions,
  ({ one }) => ({
    field: one(customFields, {
      fields: [customFieldOptions.fieldId],
      references: [customFields.id],
    }),
  })
);