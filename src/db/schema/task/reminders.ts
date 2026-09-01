import {
  pgTable,
  uuid,
  timestamp,
  boolean,
} from "drizzle-orm/pg-core";
import { relations } from "drizzle-orm";

import appointments from "./appointments.js";
import { reminderTypeEnum } from "../enum.js";

const reminders = pgTable("reminders", {
  id: uuid("id").defaultRandom().primaryKey(),

  appointmentId: uuid("appointment_id").references(() => appointments.id),

  reminderAt: timestamp("reminder_at").notNull(),

  type: reminderTypeEnum("type").notNull(),

  sent: boolean("sent").default(false).notNull(),
});

export default reminders;

export const reminderRelation = relations(reminders, ({ one }) => ({
  appointment: one(appointments, {
    fields: [reminders.appointmentId],
    references: [appointments.id],
  }),
}));