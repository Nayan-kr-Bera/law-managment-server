import {
  pgTable,
  uuid,
  varchar,
  integer,
  decimal,
} from "drizzle-orm/pg-core";
import { relations } from "drizzle-orm";

import invoices from "./invoices.js";

const invoiceItems = pgTable("invoice_items", {
  id: uuid("id").defaultRandom().primaryKey(),

  invoiceId: uuid("invoice_id").references(() => invoices.id),

  description: varchar("description", { length: 500 }).notNull(),

  quantity: integer("quantity").notNull(),

  price: decimal("price", {
    precision: 12,
    scale: 2,
  }).notNull(),
});

export default invoiceItems;

export const invoiceItemRelation = relations(invoiceItems, ({ one }) => ({
  invoice: one(invoices, {
    fields: [invoiceItems.invoiceId],
    references: [invoices.id],
  }),
}));