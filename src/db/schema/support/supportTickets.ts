import {
  boolean,
  integer,
  pgTable,
  text,
  timestamp,
  uuid,
  varchar,
} from "drizzle-orm/pg-core";
import { relations } from "drizzle-orm";

import tenants from "../tenants.js";
import offices from "../offices.js";
import clients from "../clients/clients.js";
import cases from "../caseMangment/cases.js";
import users from "../users.js";
import supportTicketMessages from "./supportTicketMessages.js";
import supportCallLogs from "./supportCallLogs.js";

const supportTickets = pgTable("support_tickets", {
  id: uuid("id").defaultRandom().primaryKey(),

  tenantId: uuid("tenant_id").references(() => tenants.id),

  officeId: uuid("office_id").references(() => offices.id),

  clientId: uuid("client_id").references(() => clients.id),

  clientUserId: uuid("client_user_id").references(() => clients.id),

  caseId: uuid("case_id").references(() => cases.id),

  ticketNumber: varchar("ticket_number", { length: 50 }).notNull(),

  subject: varchar("subject", { length: 255 }).notNull(),

  category: varchar("category", { length: 50 }).default("general").notNull(),

  priority: varchar("priority", { length: 50 }).default("medium").notNull(),

  status: varchar("status", { length: 50 }).default("open").notNull(),

  // Assigned Agent & Assignment Time
  assignedToUserId: uuid("assigned_to_user_id").references(() => users.id),

  assignedAt: timestamp("assigned_at"),

  // SLA & Resolution Performance Timestamps
  firstResponseAt: timestamp("first_response_at"),

  resolvedAt: timestamp("resolved_at"),

  // Customer Satisfaction (CSAT) Rating & Feedback
  csatRating: integer("csat_rating"), // 1 - 5 stars

  csatFeedback: text("csat_feedback"),

  csatRatedAt: timestamp("csat_rated_at"),

  // AI Assistant & Escalation Tracking
  isAiHandled: boolean("is_ai_handled").default(false),

  aiResolutionStatus: varchar("ai_resolution_status", { length: 50 }), // 'resolved_by_ai' | 'escalated' | 'direct_human'

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

    clientUser: one(clients, {
      fields: [supportTickets.clientUserId],
      references: [clients.id],
    }),

    case: one(cases, {
      fields: [supportTickets.caseId],
      references: [cases.id],
    }),

    assignedToUser: one(users, {
      fields: [supportTickets.assignedToUserId],
      references: [users.id],
    }),

    messages: many(supportTicketMessages),

    callLogs: many(supportCallLogs),
  }),
);
