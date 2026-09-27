import { sql } from "drizzle-orm";
import { PERMISSIONS } from "../../constants/permission.js";
import db from "../index.js";
import { permissions } from "../schema/index.js";

async function seedPermissions() {
  const permissionList = PERMISSIONS.map((perm) => ({
    code: perm.code,
    description: perm.description,
    isAdminPortal: perm.isAdminPortal ?? false,
  }));

  if (permissionList.length > 0) {
    await db
      .insert(permissions)
      .values(permissionList)
      .onConflictDoUpdate({
        target: permissions.code,
        set: {
          description: sql`excluded.description`,
          isAdminPortal: sql`excluded.is_admin_portal`,
        },
      });
  }

  console.log("✅ Permissions seeded with Admin Portal categorization");
}

export default seedPermissions;
