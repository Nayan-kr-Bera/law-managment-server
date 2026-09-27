import { boolean, pgTable, uuid, varchar } from "drizzle-orm/pg-core";
import { relations } from "drizzle-orm";
import rolePermission from "./rolePermission.js";

const permissions = pgTable("permissions", {
  id: uuid("id").defaultRandom().primaryKey(),

  code: varchar("code", { length: 150 }).notNull().unique(),

  description: varchar("description", { length: 255 }),

  isAdminPortal: boolean("is_admin_portal").default(false).notNull(),
});

export default permissions;

export const permissionRelations = relations(permissions, ({ many }) => ({
  rolePermissions: many(rolePermission),
}));