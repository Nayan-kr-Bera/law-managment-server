import { relations } from "drizzle-orm";
import { pgTable, primaryKey, timestamp, uuid } from "drizzle-orm/pg-core";

import roles from "./roles.js";
import userScopes from "../userScope.js";

const userRoles = pgTable(
  "user_roles",
  {
    scopeId: uuid("scope_id")
      .notNull()
      .references(() => userScopes.id, { onDelete: "cascade" }),

    roleId: uuid("role_id")
      .notNull()
      .references(() => roles.id, { onDelete: "cascade" }),

    assignedAt: timestamp("assigned_at").defaultNow().notNull(),
  },
  (table) => ({
    pk: primaryKey({
      columns: [table.scopeId, table.roleId],
    }),
  }),
);

export default userRoles;

export const userRoleRelations = relations(userRoles, ({ one }) => ({
  scope: one(userScopes, {
    fields: [userRoles.scopeId],
    references: [userScopes.id],
  }),

  role: one(roles, {
    fields: [userRoles.roleId],
    references: [roles.id],
  }),
}));