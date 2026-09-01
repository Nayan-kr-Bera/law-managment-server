import {
  pgTable,
  uuid,
  varchar,
  text,
  timestamp,
} from "drizzle-orm/pg-core";
import { relations } from "drizzle-orm";

import tenants from "../tenants.js";
import offices from "../offices.js";
import users from "../users.js";
import cases from "../caseMangment/cases.js";

const aiDrafts = pgTable("ai_drafts", {
  id: uuid("id").defaultRandom().primaryKey(),

  tenantId: uuid("tenant_id").references(() => tenants.id),

  officeId: uuid("office_id").references(() => offices.id),

  caseId: uuid("case_id").references(() => cases.id),

  createdBy: uuid("created_by").references(() => users.id),

  documentType: varchar("document_type", {
    length: 100,
  }).notNull(),

  prompt: text("prompt").notNull(),

  generatedContent: text("generated_content").notNull(),

  createdAt: timestamp("created_at").defaultNow().notNull(),
});

export default aiDrafts;

export const aiDraftRelation = relations(aiDrafts, ({ one }) => ({
  tenant: one(tenants, {
    fields: [aiDrafts.tenantId],
    references: [tenants.id],
  }),

  office: one(offices, {
    fields: [aiDrafts.officeId],
    references: [offices.id],
  }),

  case: one(cases, {
    fields: [aiDrafts.caseId],
    references: [cases.id],
  }),

  creator: one(users, {
    fields: [aiDrafts.createdBy],
    references: [users.id],
  }),
}));
