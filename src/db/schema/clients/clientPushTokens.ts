import {
  pgTable,
  uuid,
  varchar,
  timestamp,
} from "drizzle-orm/pg-core";
import { relations } from "drizzle-orm";
import clients from "./clients.js";

const clientPushTokens = pgTable("client_push_tokens", {
  id: uuid("id").defaultRandom().primaryKey(),

  clientId: uuid("client_id")
    .notNull()
    .references(() => clients.id, { onDelete: "cascade" }),

  pushToken: varchar("push_token", { length: 255 }).notNull().unique(),

  deviceType: varchar("device_type", { length: 50 }).default("android"),

  createdAt: timestamp("created_at").defaultNow().notNull(),

  updatedAt: timestamp("updated_at").defaultNow().notNull(),
});

export default clientPushTokens;

export const clientPushTokensRelation = relations(
  clientPushTokens,
  ({ one }) => ({
    client: one(clients, {
      fields: [clientPushTokens.clientId],
      references: [clients.id],
    }),
  })
);
