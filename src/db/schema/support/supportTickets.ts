import {
  pgTable,
  uuid,
  varchar,
  timestamp,
} from "drizzle-orm/pg-core";
import { relations } from "drizzle-orm";

import tenants from "../tenants.js";
import offices from "../offices.js";
import clients from "../clients/clients.js";
import clientUsers from "../clients/clientUsers.js";
import cases from "../caseMangment/cases.js";
import supportTicketMessages from "./supportTicketMessages.js";

const supportTickets = pgTable("support_tickets", {
  id: uuid("id").defaultRandom().primaryKey(),

  tenantId: uuid("tenant_id").references(() => tenants.id),

  officeId: uuid("office_id").references(() => offices.id),

  clientId: uuid("client_id").references(() => clients.id),

  clientUserId: uuid("client_user_id").references(() => clientUsers.id),

  caseId: uuid("case_id").references(() => cases.id),

  ticketNumber: varchar("ticket_number", { length: 50 }).notNull(),

  subject: varchar("subject", { length: 255 }).notNull(),

  category: varchar("category", { length: 50 }).default("general").notNull(),

  priority: varchar("priority", { length: 50 }).default("medium").notNull(),

  status: varchar("status", { length: 50 }).default("open").notNull(),

  createdAt: timestamp("created_at").defaultNow().notNull(),

  updatedAt: timestamp("updated_at").defaultNow().notNull(),
});

export default supportTickets;

export const supportTicketRelations = relations(
  supportTickets,
  ({ one, many }) => ({
    tenant: one(tenants, {
      fields: [supportTickets.tenantId],
      references: [tenants.id],
    }),

    office: one(offices, {
      fields: [supportTickets.officeId],
      references: [offices.id],
    }),

    client: one(clients, {
      fields: [supportTickets.clientId],
      references: [clients.id],
    }),

    clientUser: one(clientUsers, {
      fields: [supportTickets.clientUserId],
      references: [clientUsers.id],
    }),

    case: one(cases, {
      fields: [supportTickets.caseId],
      references: [cases.id],
    }),

    messages: many(supportTicketMessages),
  }),
);
