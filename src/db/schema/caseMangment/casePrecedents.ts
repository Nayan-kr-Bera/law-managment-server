import { relations } from "drizzle-orm";
import {
  boolean,
  index,
  pgTable,
  text,
  timestamp,
  uuid,
  varchar,
} from "drizzle-orm/pg-core";
import tenants from "../tenants.js";
import users from "../users.js";
import cases from "./cases.js";
import courtJudgments from "../bareActs/courtJudgments.js";

export const casePrecedents = pgTable(
  "case_precedents",
  {
    id: uuid("id").defaultRandom().primaryKey(),

    tenantId: uuid("tenant_id")
      .notNull()
      .references(() => tenants.id, { onDelete: "cascade" }),

    caseId: uuid("case_id")
      .notNull()
      .references(() => cases.id, { onDelete: "cascade" }),

    judgmentId: uuid("judgment_id").references(() => courtJudgments.id, {
      onDelete: "set null",
    }),

    // Citation and Case Information
    title: varchar("title", { length: 500 }).notNull(),
    citation: varchar("citation", { length: 255 }), // e.g. "(2014) 8 SCC 273"
    neutralCitation: varchar("neutral_citation", { length: 150 }), // e.g. "2014 INSC 445"
    equivalentCitations: text("equivalent_citations"), // e.g. "AIR 2014 SC 2756"
    court: varchar("court", { length: 255 }),
    bench: text("bench"),
    actSection: text("act_section"),
    ratioDecidendi: text("ratio_decidendi"),
    url: text("url"),

    // Advocate Practice metadata
    relevanceTag: varchar("relevance_tag", { length: 100 }).default("Precedent"), // e.g., "Bail Grounds", "Section 41A Notice", "Interim Injunction", "Arbitration Precedent", "Quashing S. 482"
    notes: text("notes"), // Advocate's custom litigation strategy memo e.g. "Para 11 strictly prohibits mechanical arrest"
    pinnedInPleadings: boolean("pinned_in_pleadings").default(false).notNull(), // Flag for AI Drafter inclusion in bail/writ petitions

    createdBy: uuid("created_by").references(() => users.id, {
      onDelete: "set null",
    }),

    createdAt: timestamp("created_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .defaultNow()
      .$onUpdate(() => new Date()),
  },
  (table) => [
    index("case_precedents_case_id_idx").on(table.caseId),
    index("case_precedents_neutral_citation_idx").on(table.neutralCitation),
    index("case_precedents_tenant_id_idx").on(table.tenantId),
  ]
);

export const casePrecedentsRelations = relations(casePrecedents, ({ one }) => ({
  tenant: one(tenants, {
    fields: [casePrecedents.tenantId],
    references: [tenants.id],
  }),
  case: one(cases, {
    fields: [casePrecedents.caseId],
    references: [cases.id],
    relationName: "casePrecedents",
  }),
  judgment: one(courtJudgments, {
    fields: [casePrecedents.judgmentId],
    references: [courtJudgments.id],
  }),
  creator: one(users, {
    fields: [casePrecedents.createdBy],
    references: [users.id],
  }),
}));

export default casePrecedents;
