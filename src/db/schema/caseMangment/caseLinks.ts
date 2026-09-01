import { relations } from "drizzle-orm";
import {
  pgTable,
  uuid,
  timestamp,
  unique,
  text,
} from "drizzle-orm/pg-core";

import tenants from "../tenants.js";
import users from "../users.js";
import cases from "./cases.js";

const caseLinks = pgTable(
  "case_links",
  {
    id: uuid("id").defaultRandom().primaryKey(),

    tenantId: uuid("tenant_id")
      .notNull()
      .references(() => tenants.id, { onDelete: "cascade" }),

    caseId: uuid("case_id")
      .notNull()
      .references(() => cases.id, { onDelete: "cascade" }),

    linkedCaseId: uuid("linked_case_id")
      .notNull()
      .references(() => cases.id, { onDelete: "cascade" }),

    // Optional reason/context for the relationship
    notes: text("notes"),

    createdBy: uuid("created_by")
      .notNull()
      .references(() => users.id),

    createdAt: timestamp("created_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
  },
  (table) => ({
    uniqueCaseLink: unique().on(
      table.caseId,
      table.linkedCaseId,
    ),
  }),
);

export const caseLinksRelations = relations(
  caseLinks,
  ({ one }) => ({
    tenant: one(tenants, {
      fields: [caseLinks.tenantId],
      references: [tenants.id],
    }),

    case: one(cases, {
      fields: [caseLinks.caseId],
      references: [cases.id],
      relationName: "caseLinks",
    }),

    linkedCase: one(cases, {
      fields: [caseLinks.linkedCaseId],
      references: [cases.id],
      relationName: "linkedCaseLinks",
    }),

    createdByUser: one(users, {
      fields: [caseLinks.createdBy],
      references: [users.id],
    }),
  }),
);

export default caseLinks;