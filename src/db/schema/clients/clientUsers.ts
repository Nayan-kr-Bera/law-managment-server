import {
  pgTable,
  uuid,
  varchar,
  timestamp,
} from "drizzle-orm/pg-core";
import { relations } from "drizzle-orm";

import clients from "./clients.js";
import { clientUserStatusEnum } from "../enum.js";

const clientUsers = pgTable("client_users", {
  id: uuid("id").defaultRandom().primaryKey(),

  clientId: uuid("client_id").references(() => clients.id),

  email: varchar("email", { length: 255 }).notNull().unique(),

  passwordHash: varchar("password_hash", {
    length: 255,
  }).notNull(),

  status: clientUserStatusEnum("status")
    .notNull()
    .default("active"),

  lastLoginAt: timestamp("last_login_at"),

  createdAt: timestamp("created_at").defaultNow().notNull(),
});

export default clientUsers;

export const clientUserRelation = relations(clientUsers, ({ one }) => ({
  client: one(clients, {
    fields: [clientUsers.clientId],
    references: [clients.id],
  }),
}));