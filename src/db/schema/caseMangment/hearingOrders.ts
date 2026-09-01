import {
  pgTable,
  uuid,
  text,
  date,
} from "drizzle-orm/pg-core";
import { relations } from "drizzle-orm";

import hearings from "./hearings.js";
import caseDocuments from "../documents/caseDocuments.js";

const hearingOrders = pgTable("hearing_orders", {
  id: uuid("id").defaultRandom().primaryKey(),

  hearingId: uuid("hearing_id").references(() => hearings.id),

  orderDate: date("order_date"),

  summary: text("summary"),

  documentId: uuid("document_id"),
});

export default hearingOrders;

export const hearingOrderRelation = relations(
  hearingOrders,
  ({ one }) => ({
    hearing: one(hearings, {
      fields: [hearingOrders.hearingId],
      references: [hearings.id],
    }),

    document: one(caseDocuments, {
      fields: [hearingOrders.documentId],
      references: [caseDocuments.id],
    }),
  })
);