import {
  pgTable,
  uuid,
  varchar,
  timestamp,
} from "drizzle-orm/pg-core";
import { relations } from "drizzle-orm";

import tenants from "../tenants.js";
import offices from "../offices.js";
import users from "../users.js";
import cases from "../caseMangment/cases.js";
import caseDocuments from "./caseDocuments.js";

const documentFolders = pgTable("document_folders", {
  id: uuid("id").defaultRandom().primaryKey(),

  tenantId: uuid("tenant_id").references(() => tenants.id),

  officeId: uuid("office_id").references(() => offices.id),

  caseId: uuid("case_id").references(() => cases.id),

  parentId: uuid("parent_id"),

  name: varchar("name", { length: 255 }).notNull(),

  createdBy: uuid("created_by").references(() => users.id),

  createdAt: timestamp("created_at").defaultNow().notNull(),
});

export default documentFolders;

export const documentFolderRelation = relations(
  documentFolders,
  ({ one, many }) => ({
    tenant: one(tenants, {
      fields: [documentFolders.tenantId],
      references: [tenants.id],
    }),

    office: one(offices, {
      fields: [documentFolders.officeId],
      references: [offices.id],
    }),

    case: one(cases, {
      fields: [documentFolders.caseId],
      references: [cases.id],
    }),

    parent: one(documentFolders, {
      fields: [documentFolders.parentId],
      references: [documentFolders.id],
      relationName: "folder_parent",
    }),

    children: many(documentFolders, {
      relationName: "folder_parent",
    }),

    creator: one(users, {
      fields: [documentFolders.createdBy],
      references: [users.id],
    }),

    documents: many(caseDocuments),
  })
);
