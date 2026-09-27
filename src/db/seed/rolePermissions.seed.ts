import { eq } from "drizzle-orm";
import db from "../index.js";
import { permissions, rolePermissions, roles } from "../schema/index.js";

export default async function seedRolePermissions() {
  const [superAdminRole] = await db
    .select()
    .from(roles)
    .where(eq(roles.slug, "super_admin"));

  const [platformAdminRole] = await db
    .select()
    .from(roles)
    .where(eq(roles.slug, "admin"));

  const [tenantAdminRole] = await db
    .select()
    .from(roles)
    .where(eq(roles.slug, "tenant_admin"));

  if (!superAdminRole || !tenantAdminRole) {
    throw new Error("Required roles not found");
  }

  const allPermissions = await db.select().from(permissions);

  const permissionMap = new Map(
    allPermissions.map((permission) => [permission.code, permission.id]),
  );

  // 1. Super Admin gets EVERYTHING unconditionally
  const superAdminPermissions = allPermissions.map((permission) => ({
    roleId: superAdminRole.id,
    permissionId: permission.id,
  }));

  // 2. Platform Admin gets all Admin Portal permissions (isAdminPortal: true)
  const adminPortalPermissionsList = allPermissions
    .filter((p) => p.isAdminPortal)
    .map((permission) => ({
      roleId: platformAdminRole?.id || superAdminRole.id,
      permissionId: permission.id,
    }));

  // 3. Tenant Admin permissions (strictly isAdminPortal: false)
  const TENANT_ADMIN_PERMISSIONS = allPermissions
    .filter((p) => !p.isAdminPortal)
    .map((p) => p.code);

  const tenantAdminPermissions = TENANT_ADMIN_PERMISSIONS.map((code) => {
    const permissionId = permissionMap.get(code);
    if (!permissionId) {
      throw new Error(`Permission ${code} not found in database`);
    }
    return {
      roleId: tenantAdminRole.id,
      permissionId,
    };
  });

  const allRolePermissions = [
    ...superAdminPermissions,
    ...(platformAdminRole ? adminPortalPermissionsList : []),
    ...tenantAdminPermissions,
  ];

  await db
    .insert(rolePermissions)
    .values(allRolePermissions)
    .onConflictDoNothing();

  console.log("✅ Role permissions seeded (Super Admin, Platform Admin, Tenant Admin)");
}
