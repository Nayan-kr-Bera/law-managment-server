import { relations } from "drizzle-orm";
import { pgTable, primaryKey, uuid } from "drizzle-orm/pg-core";
import roles from "./roles.js";
import permissions from "./permission.js";

const rolePermission = pgTable(
  "role_permissions",
  {
    roleId: uuid("role_id")
      .notNull()
      .references(() => roles.id, { onDelete: "cascade" }),

    permissionId: uuid("permission_id")
      .notNull()
      .references(() => permissions.id, { onDelete: "cascade" }),
  },
  (table) => ({
    pk: primaryKey({
      columns: [table.roleId, table.permissionId],
    }),
  })
);

export default rolePermission;

export const rolePermissionRelations = relations(
  rolePermission,
  ({ one }) => ({
    role: one(roles, {
      fields: [rolePermission.roleId],
      references: [roles.id],
    }),

    permission: one(permissions, {
      fields: [rolePermission.permissionId],
      references: [permissions.id],
    }),
  })
);