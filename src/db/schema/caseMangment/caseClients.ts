import {
  pgTable,
  uuid,
  varchar,
  primaryKey,
} from "drizzle-orm/pg-core";
import { relations } from "drizzle-orm";

import clients from "../clients/clients.js";
import cases from "./cases.js";

const caseClients = pgTable(
  "case_clients",
  {
    caseId: uuid("case_id")
      .notNull()
      .references(() => cases.id),

    clientId: uuid("client_id")
      .notNull()
      .references(() => clients.id),

    role: varchar("role", {
      length: 100,
    }),
  },
  (table) => ({
    pk: primaryKey({
      columns: [table.caseId, table.clientId],
    }),
  })
);

export default caseClients;

export const caseClientRelation = relations(
  caseClients,
  ({ one }) => ({
    case: one(cases, {
      fields: [caseClients.caseId],
      references: [cases.id],
    }),

    client: one(clients, {
      fields: [caseClients.clientId],
      references: [clients.id],
    }),
  })
);