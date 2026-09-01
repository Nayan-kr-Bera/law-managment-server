import {
  pgTable,
  uuid,
  text,
} from "drizzle-orm/pg-core";
import { relations } from "drizzle-orm";

import customFields from "../masterData/customFields.js";
import cases from "./cases.js";

const caseCustomFieldValues = pgTable("case_custom_field_values", {
  id: uuid("id").defaultRandom().primaryKey(),

  caseId: uuid("case_id").references(() => cases.id),

  fieldId: uuid("field_id").references(() => customFields.id),

  value: text("value"),
});

export default caseCustomFieldValues;

export const caseCustomFieldValueRelation = relations(
  caseCustomFieldValues,
  ({ one }) => ({
    case: one(cases, {
      fields: [caseCustomFieldValues.caseId],
      references: [cases.id],
    }),

    field: one(customFields, {
      fields: [caseCustomFieldValues.fieldId],
      references: [customFields.id],
    }),
  })
);