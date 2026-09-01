import { relations } from "drizzle-orm";
import { pgTable, primaryKey, timestamp, uuid } from "drizzle-orm/pg-core";

import userScopes from "../userScope.js";
import permissions from "./permission.js";
import users from "../users.js";

const userPermissions = pgTable(
  "user_permissions",
  {
    scopeId: uuid("scope_id")
      .notNull()
      .references(() => userScopes.id, { onDelete: "cascade" }),

    permissionId: uuid("permission_id")
      .notNull()
      .references(() => permissions.id, { onDelete: "cascade" }),

    grantedBy: uuid("granted_by").references(() => users.id, {
      onDelete: "set null",
    }),

    createdAt: timestamp("created_at").defaultNow().notNull(),
  },
  (table) => ({
    pk: primaryKey({
      columns: [table.scopeId, table.permissionId],
    }),
  }),
);

export default userPermissions;

export const userPermissionRelations = relations(
  userPermissions,
  ({ one }) => ({
    scope: one(userScopes, {
      fields: [userPermissions.scopeId],
      references: [userScopes.id],
    }),

    permission: one(permissions, {
      fields: [userPermissions.permissionId],
      references: [permissions.id],
    }),

    grantedByUser: one(users, {
      fields: [userPermissions.grantedBy],
      references: [users.id],
      relationName: "grantedPermissions",
    }),
  }),
);