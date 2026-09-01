import { relations } from "drizzle-orm";
import {
  boolean,
  pgTable,
  text,
  timestamp,
  uuid,
  varchar,
} from "drizzle-orm/pg-core";

import cases from "../caseMangment/cases.js";
import clients from "../clients/clients.js";
import { appointmentModeEnum, appointmentStatusEnum } from "../enum.js";
import offices from "../offices.js";
import tenants from "../tenants.js";
import users from "../users.js";
import reminders from "./reminders.js";

const appointments = pgTable("appointments", {
  id: uuid("id").defaultRandom().primaryKey(),

  tenantId: uuid("tenant_id")
    .references(() => tenants.id)
    .notNull(),

  officeId: uuid("office_id").references(() => offices.id),

  clientId: uuid("client_id").references(() => clients.id),

  caseId: uuid("case_id").references(() => cases.id),

  assignedTo: uuid("assigned_to").references(() => users.id),

  // Date + Time are stored together
  date: timestamp("date").notNull(),

  mode: appointmentModeEnum("mode").notNull(),

  purpose: varchar("purpose", { length: 255 }).notNull(),

  location: text("location"),

  sendEmail: boolean("send_email").default(false).notNull(),
  
  status: appointmentStatusEnum("status").default("scheduled").notNull(),

  sendWhatsApp: boolean("send_whatsapp").default(false).notNull(),

  createdAt: timestamp("created_at").defaultNow().notNull(),

  updatedAt: timestamp("updated_at").defaultNow().notNull(),
});

export default appointments;

export const appointmentRelation = relations(appointments, ({ one, many }) => ({
  tenant: one(tenants, {
    fields: [appointments.tenantId],
    references: [tenants.id],
  }),

  office: one(offices, {
    fields: [appointments.officeId],
    references: [offices.id],
  }),

  client: one(clients, {
    fields: [appointments.clientId],
    references: [clients.id],
  }),

  case: one(cases, {
    fields: [appointments.caseId],
    references: [cases.id],
  }),

  assignee: one(users, {
    fields: [appointments.assignedTo],
    references: [users.id],
  }),

  reminders: many(reminders),
}));
