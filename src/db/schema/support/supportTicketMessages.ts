import {
  pgTable,
  uuid,
  varchar,
  text,
  timestamp,
} from "drizzle-orm/pg-core";
import { relations } from "drizzle-orm";

import supportTickets from "./supportTickets.js";

const supportTicketMessages = pgTable("support_ticket_messages", {
  id: uuid("id").defaultRandom().primaryKey(),

  ticketId: uuid("ticket_id")
    .references(() => supportTickets.id, { onDelete: "cascade" })
    .notNull(),

  senderType: varchar("sender_type", { length: 20 }).notNull(), // "client" | "staff" | "advocate"

  senderId: uuid("sender_id"),

  senderName: varchar("sender_name", { length: 255 }).notNull(),

  message: text("message").notNull(),

  createdAt: timestamp("created_at").defaultNow().notNull(),
});

export default supportTicketMessages;

export const supportTicketMessageRelations = relations(
  supportTicketMessages,
  ({ one }) => ({
    ticket: one(supportTickets, {
      fields: [supportTicketMessages.ticketId],
      references: [supportTickets.id],
    }),
  }),
);
