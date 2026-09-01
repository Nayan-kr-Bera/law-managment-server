import {
  pgTable,
  uuid,
  boolean,
  primaryKey,
} from "drizzle-orm/pg-core";
import { relations } from "drizzle-orm";

import cases from "./cases.js";
import advocates from "../advocates/advocates.js";

const caseAdvocates = pgTable(
  "case_advocates",
  {
    caseId: uuid("case_id")
      .notNull()
      .references(() => cases.id),

    advocateId: uuid("advocate_id")
      .notNull()
      .references(() => advocates.id),

    isPrimary: boolean("is_primary")
      .default(false)
      .notNull(),
  },
  (table) => ({
    pk: primaryKey({
      columns: [table.caseId, table.advocateId],
    }),
  })
);

export default caseAdvocates;

export const caseAdvocateRelation = relations(
  caseAdvocates,
  ({ one }) => ({
    case: one(cases, {
      fields: [caseAdvocates.caseId],
      references: [cases.id],
    }),

    advocate: one(advocates, {
      fields: [caseAdvocates.advocateId],
      references: [advocates.id],
    }),
  })
);