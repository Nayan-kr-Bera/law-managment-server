import { relations } from "drizzle-orm";
import {
  integer,
  pgTable,
  text,
  timestamp,
  uuid,
  varchar,
} from "drizzle-orm/pg-core";
import supportTickets from "./supportTickets.js";
import tenants from "../tenants.js";
import users from "../users.js";

const supportCallLogs = pgTable("support_call_logs", {
  id: uuid("id").defaultRandom().primaryKey(),

  ticketId: uuid("ticket_id")
    .references(() => supportTickets.id, { onDelete: "cascade" })
    .notNull(),

  tenantId: uuid("tenant_id").references(() => tenants.id),

  agentId: uuid("agent_id")
    .references(() => users.id)
    .notNull(),

  callType: varchar("call_type", { length: 20 }).default("outbound").notNull(), // "inbound" | "outbound"

  durationMinutes: integer("duration_minutes").default(0).notNull(),

  callerNumber: varchar("caller_number", { length: 50 }),

  outcome: varchar("outcome", { length: 50 }).default("resolved_on_call").notNull(), // "resolved_on_call" | "followup_required" | "escalated" | "voicemail" | "busy"

  notes: text("notes").notNull(),

  createdAt: timestamp("created_at").defaultNow().notNull(),

  updatedAt: timestamp("updated_at").defaultNow().notNull(),
});

export default supportCallLogs;

export const supportCallLogRelations = relations(supportCallLogs, ({ one }) => ({
  ticket: one(supportTickets, {
    fields: [supportCallLogs.ticketId],
    references: [supportTickets.id],
  }),

  tenant: one(tenants, {
    fields: [supportCallLogs.tenantId],
    references: [tenants.id],
  }),

  agent: one(users, {
    fields: [supportCallLogs.agentId],
    references: [users.id],
  }),
}));
