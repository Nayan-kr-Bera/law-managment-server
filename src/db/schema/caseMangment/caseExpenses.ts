import {
  pgTable,
  uuid,
  varchar,
  text,
  decimal,
  date,
  timestamp,
} from "drizzle-orm/pg-core";
import { relations } from "drizzle-orm";

import tenants from "../tenants.js";
import offices from "../offices.js";
import users from "../users.js";
import caseDocuments from "../documents/caseDocuments.js";
import cases from "./cases.js";

const caseExpenses = pgTable("case_expenses", {
  id: uuid("id").defaultRandom().primaryKey(),

  tenantId: uuid("tenant_id").references(() => tenants.id),

  officeId: uuid("office_id").references(() => offices.id),

  caseId: uuid("case_id").references(() => cases.id),

  paidBy: uuid("paid_by"),

  expenseType: varchar("expense_type", {
    length: 100,
  }).notNull(),

  description: text("description"),

  amount: decimal("amount", {
    precision: 12,
    scale: 2,
  }).notNull(),

  paymentMethod: varchar("payment_method", {
    length: 100,
  }),

  expenseDate: date("expense_date").notNull(),

  receiptDocumentId: uuid("receipt_document_id"),

  createdBy: uuid("created_by"),

  createdAt: timestamp("created_at")
    .defaultNow()
    .notNull(),
});

export default caseExpenses;

export const caseExpenseRelation = relations(
  caseExpenses,
  ({ one }) => ({
    tenant: one(tenants, {
      fields: [caseExpenses.tenantId],
      references: [tenants.id],
    }),

    office: one(offices, {
      fields: [caseExpenses.officeId],
      references: [offices.id],
    }),

    case: one(cases, {
      fields: [caseExpenses.caseId],
      references: [cases.id],
    }),

    paidByUser: one(users, {
      fields: [caseExpenses.paidBy],
      references: [users.id],
      relationName: "case_expense_paid_by",
    }),

    receiptDocument: one(caseDocuments, {
      fields: [caseExpenses.receiptDocumentId],
      references: [caseDocuments.id],
    }),

    createdByUser: one(users, {
      fields: [caseExpenses.createdBy],
      references: [users.id],
      relationName: "case_expense_created_by",
    }),
  })
);
