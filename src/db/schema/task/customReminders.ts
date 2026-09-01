import {
  pgTable,
  uuid,
  text,
  varchar,
  boolean,
  timestamp,
} from "drizzle-orm/pg-core";
import { relations } from "drizzle-orm";

import tenants from "../tenants.js";
import offices from "../offices.js";
import users from "../users.js";
import clients from "../clients/clients.js";
import cases from "../caseMangment/cases.js";

const customReminders = pgTable("custom_reminders", {
  id: uuid("id").defaultRandom().primaryKey(),

  tenantId: uuid("tenant_id").references(() => tenants.id),

  officeId: uuid("office_id").references(() => offices.id),

  createdBy: uuid("created_by").references(() => users.id),

  reminder: text("reminder").notNull(),

  frequency: varchar("frequency", { length: 50 }).notNull(), // Once | Daily | Weekly | Fortnightly

  startDate: varchar("start_date", { length: 20 }).notNull(),

  endDate: varchar("end_date", { length: 20 }),

  time: varchar("time", { length: 10 }),

  dayOfWeek: varchar("day_of_week", { length: 20 }),

  email: varchar("email", { length: 500 }), // comma-separated

  contact: varchar("contact", { length: 500 }), // comma-separated (for future whatsapp)

  clientId: uuid("client_id").references(() => clients.id),

  caseId: uuid("case_id").references(() => cases.id),

  isActive: boolean("is_active").default(true).notNull(),

  lastSentAt: timestamp("last_sent_at"),

  nextRunAt: timestamp("next_run_at"),

  createdAt: timestamp("created_at").defaultNow().notNull(),
});

export default customReminders;

export const customReminderRelation = relations(
  customReminders,
  ({ one }) => ({
    tenant: one(tenants, {
      fields: [customReminders.tenantId],
      references: [tenants.id],
    }),

    office: one(offices, {
      fields: [customReminders.officeId],
      references: [offices.id],
    }),

    creator: one(users, {
      fields: [customReminders.createdBy],
      references: [users.id],
    }),

    client: one(clients, {
      fields: [customReminders.clientId],
      references: [clients.id],
    }),

    case: one(cases, {
      fields: [customReminders.caseId],
      references: [cases.id],
    }),
  })
);
