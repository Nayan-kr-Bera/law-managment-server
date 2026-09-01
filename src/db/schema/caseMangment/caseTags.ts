import {
  pgTable,
  uuid,
  primaryKey,
} from "drizzle-orm/pg-core";
import { relations } from "drizzle-orm";

import cases from "./cases.js";
import tags from "../masterData/tags.js";

const caseTags = pgTable(
  "case_tags",
  {
    caseId: uuid("case_id").notNull().references(() => cases.id),
    tagId: uuid("tag_id").notNull().references(() => tags.id),
  },
  (table) => ({
    pk: primaryKey({
      columns: [table.caseId, table.tagId],
    }),
  })
);

export default caseTags;

export const caseTagRelation = relations(caseTags, ({ one }) => ({
  case: one(cases, {
    fields: [caseTags.caseId],
    references: [cases.id],
  }),

  tag: one(tags, {
    fields: [caseTags.tagId],
    references: [tags.id],
  }),
}));