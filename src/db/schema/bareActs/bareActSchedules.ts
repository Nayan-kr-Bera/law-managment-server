import { relations } from "drizzle-orm";
import {
  integer,
  jsonb,
  pgTable,
  text,
  timestamp,
  uuid,
  varchar,
} from "drizzle-orm/pg-core";
import bareActs from "./bareActs.js";

const bareActSchedules = pgTable("bare_act_schedules", {
  id: uuid("id").defaultRandom().primaryKey(),

  actId: uuid("act_id")
    .references(() => bareActs.id, { onDelete: "cascade" })
    .notNull(),

  scheduleNumber: varchar("schedule_number", { length: 100 }).notNull(), // e.g. "First Schedule", "Seventh Schedule"
  title: varchar("title", { length: 255 }).notNull(),
  content: text("content"),
  tableData: jsonb("table_data").$type<Record<string, unknown>[]>().default([]),
  orderIndex: integer("order_index").default(0).notNull(),

  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at")
    .defaultNow()
    .$onUpdate(() => new Date()),
});

export default bareActSchedules;

export const bareActSchedulesRelations = relations(bareActSchedules, ({ one }) => ({
  act: one(bareActs, {
    fields: [bareActSchedules.actId],
    references: [bareActs.id],
  }),
}));
