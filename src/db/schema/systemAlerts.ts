import {
  boolean,
  pgTable,
  text,
  timestamp,
  uuid,
  varchar,
} from "drizzle-orm/pg-core";
import users from "./users.js";

const systemAlerts = pgTable("system_alerts", {
  id: uuid("id").defaultRandom().primaryKey(),

  // Alert title
  title: varchar("title", {
    length: 255,
  }).notNull(),

  // Alert message/content
  message: text("message").notNull(),

  // Optional link
  link: varchar("link", {
    length: 500,
  }),

  // Example:
  // info
  // warning
  // success
  // error
  type: varchar("type", {
    length: 50,
  })
    .notNull()
    .default("info"),

  // Whether alert should be shown
  isActive: boolean("is_active")
    .notNull()
    .default(true),

  // Optional expiration
  expiresAt: timestamp("expires_at", {
    withTimezone: true,
  }),

  // Audit fields
  createdBy: uuid("created_by").references(() => users.id),

  updatedBy: uuid("updated_by").references(() => users.id),

  createdAt: timestamp("created_at", {
    withTimezone: true,
  })
    .defaultNow()
    .notNull(),

  updatedAt: timestamp("updated_at", {
    withTimezone: true,
  })
    .defaultNow()
    .notNull(),
});

export default systemAlerts;