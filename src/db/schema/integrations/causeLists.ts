import {
  pgTable,
  uuid,
  varchar,
  date,
  timestamp,
} from "drizzle-orm/pg-core";
import { relations } from "drizzle-orm";

import tenants from "../tenants.js";
import offices from "../offices.js";
import users from "../users.js";
import courts from "../masterData/courts.js";

const causeLists = pgTable("cause_lists", {
  id: uuid("id").defaultRandom().primaryKey(),
  tenantId: uuid("tenant_id").references(() => tenants.id),
  officeId: uuid("office_id").references(() => offices.id),
  courtId: uuid("court_id").references(() => courts.id),
  date: date("date").notNull(),
  pdfUrl: varchar("pdf_url", {
    length: 1000,
  }),
  excelUrl: varchar("excel_url", {
    length: 1000,
  }),
  generatedBy: uuid("generated_by"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

export default causeLists;

export const causeListRelation = relations(causeLists, ({ one }) => ({
  tenant: one(tenants, {
    fields: [causeLists.tenantId],
    references: [tenants.id],
  }),

  office: one(offices, {
    fields: [causeLists.officeId],
    references: [offices.id],
  }),

  court: one(courts, {
    fields: [causeLists.courtId],
    references: [courts.id],
  }),

  generator: one(users, {
    fields: [causeLists.generatedBy],
    references: [users.id],
  }),
}));
