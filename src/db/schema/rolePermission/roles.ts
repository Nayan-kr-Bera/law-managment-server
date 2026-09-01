import { relations } from "drizzle-orm";
import {
  boolean,
  pgTable,
  timestamp,
  uuid,
  varchar,
} from "drizzle-orm/pg-core";
import userRoles from "./userRoles.js";
import rolePermission from "./rolePermission.js";
import tenants from "../tenants.js";
import users from "../users.js";
const roles = pgTable("roles", {
  id: uuid("id").defaultRandom().primaryKey(),

  name: varchar("name", { length: 155 }).notNull(),

  slug: varchar("slug", { length: 155 }),

  description: varchar("description", { length: 255 }),

  isSystemRole: boolean("is_system_role").default(false).notNull(),

  tenantId: uuid("tenant_id").references(() => tenants.id, {
    onDelete: "cascade",
  }),

  createdBy: uuid("created_by").references(() => users.id, {
    onDelete: "set null",
  }),

  createdAt: timestamp("created_at").defaultNow().notNull(),

  updatedAt: timestamp("updated_at")
    .defaultNow()
    .$onUpdate(() => new Date()),
});

export default roles;

export const roleRelations = relations(roles, ({ many }) => ({
  userRoles: many(userRoles),
  rolePermissions: many(rolePermission),
}));
