import {
  pgTable,
  uuid,
  varchar,
  boolean,
  timestamp,
} from "drizzle-orm/pg-core";
import { relations } from "drizzle-orm";

import clients from "./clients.js";
import users from "../users.js";

const clientConsents = pgTable("client_consents", {
  id: uuid("id").defaultRandom().primaryKey(),

  clientId: uuid("client_id").references(() => clients.id),

  version: varchar("version", {
    length: 50,
  }).notNull(),

  consentGiven: boolean("consent_given").notNull(),

  ipAddress: varchar("ip_address", {
    length: 100,
  }),

  userAgent: varchar("user_agent", {
    length: 1000,
  }),

  consentedBy: uuid("consented_by"),

  consentedAt: timestamp("consented_at").defaultNow().notNull(),
});

export default clientConsents;

export const clientConsentRelation = relations(
  clientConsents,
  ({ one }) => ({
    client: one(clients, {
      fields: [clientConsents.clientId],
      references: [clients.id],
    }),

    consentedByUser: one(users, {
      fields: [clientConsents.consentedBy],
      references: [users.id],
    }),
  })
);