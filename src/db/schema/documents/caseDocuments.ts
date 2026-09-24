import {
  pgTable,
  uuid,
  varchar,
  integer,
  boolean,
  timestamp,
  text,
} from "drizzle-orm/pg-core";
import { relations } from "drizzle-orm";

import tenants from "../tenants.js";
import offices from "../offices.js";

import documentFolders from "./documentFolders.js";
import users from "../users.js";
import hearingOrders from "../caseMangment/hearingOrders.js";
import cases from "../caseMangment/cases.js";
import caseExpenses from "../caseMangment/caseExpenses.js";

const caseDocuments = pgTable("case_documents", {
  id: uuid("id").defaultRandom().primaryKey(),

  tenantId: uuid("tenant_id").references(() => tenants.id),

  officeId: uuid("office_id").references(() => offices.id),

  caseId: uuid("case_id").references(() => cases.id),

  folderId: uuid("folder_id").references(() => documentFolders.id),

  uploadedBy: uuid("uploaded_by").references(() => users.id),

  fileName: varchar("file_name", {
    length: 255,
  }).notNull(),
  cloudinaryPublicId: varchar("cloudinary_public_id", {
    length: 500,
  }),

  cloudinaryResourceType: varchar("cloudinary_resource_type", {
    length: 50,
  }),
  originalName: varchar("original_name", {
    length: 255,
  }).notNull(),

  fileUrl: varchar("file_url", {
    length: 1000,
  }).notNull(),

  mimeType: varchar("mime_type", {
    length: 100,
  }),

  fileSize: integer("file_size"),

  version: integer("version").default(1).notNull(),

  isConfidential: boolean("is_confidential").default(false).notNull(),

  isPrivate: boolean("is_private").default(false).notNull(),

  pageCount: integer("page_count").default(1),

  ocrStatus: varchar("ocr_status", {
    length: 30,
  }).default("none").notNull(),

  ocrText: text("ocr_text"),

  ocrLanguage: varchar("ocr_language", {
    length: 50,
  }).default("eng+hin"),

  ocrProcessedAt: timestamp("ocr_processed_at"),

  ocrPagesProcessed: integer("ocr_pages_processed"),

  ocrWarning: varchar("ocr_warning", {
    length: 500,
  }),

  ocrError: varchar("ocr_error", {
    length: 500,
  }),

  createdAt: timestamp("created_at").defaultNow().notNull(),
});

export default caseDocuments;

export const caseDocumentRelation = relations(
  caseDocuments,
  ({ one, many }) => ({
    tenant: one(tenants, {
      fields: [caseDocuments.tenantId],
      references: [tenants.id],
    }),

    office: one(offices, {
      fields: [caseDocuments.officeId],
      references: [offices.id],
    }),

    case: one(cases, {
      fields: [caseDocuments.caseId],
      references: [cases.id],
    }),

    folder: one(documentFolders, {
      fields: [caseDocuments.folderId],
      references: [documentFolders.id],
    }),

    uploader: one(users, {
      fields: [caseDocuments.uploadedBy],
      references: [users.id],
    }),

    hearingOrders: many(hearingOrders),

    expenseReceipts: many(caseExpenses),
  }),
);
