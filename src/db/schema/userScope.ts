import { relations } from "drizzle-orm";
import { boolean, pgTable, timestamp, uuid } from "drizzle-orm/pg-core";

import tenants from "./tenants.js";
import users from "./users.js";
import userScopeOffices from "./userscopeoffices.js";
import userRoles from "./rolePermission/userRoles.js";
import userPermissions from "./rolePermission/userPermission.js";

const userScopes = pgTable("user_scopes", {
  id: uuid("id").defaultRandom().primaryKey(),

  userId: uuid("user_id").references(() => users.id),

  tenantId: uuid("tenant_id").references(() => tenants.id),

  isDefault: boolean("is_default").default(false).notNull(),

  createdBy: uuid("created_by"),

  createdAt: timestamp("created_at").defaultNow().notNull(),
});

export default userScopes;
export const userScopeRelation = relations(userScopes, ({ one, many }) => ({
  user: one(users, {
    fields: [userScopes.userId],
    references: [users.id],
  }),

  tenant: one(tenants, {
    fields: [userScopes.tenantId],
    references: [tenants.id],
  }),

  offices: many(userScopeOffices),

  roles: many(userRoles),

  permissions: many(userPermissions),

  creator: one(users, {
    fields: [userScopes.createdBy],
    references: [users.id],
    relationName: "user_scope_creator",
  }),
}));
