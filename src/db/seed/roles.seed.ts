import db from "../index.js";
import { roles } from "../schema/index.js";

export default async function seedRoles() {
  await db
    .insert(roles)
    .values([
      {
        name: "Super Admin",
        slug: "super_admin",
        isSystemRole: true,
        description: "Master administrator with unrestricted global platform access",
      },
      {
        name: "Platform Admin",
        slug: "admin",
        isSystemRole: true,
        description: "Departmental platform administrator with assigned admin portal permissions",
      },
      {
        name: "System Administrator",
        slug: "tenant_admin",
        isSystemRole: true,
        description: "Managing Partner / Chamber owner administrator for tenant workspace",
      },
    ])
    .onConflictDoNothing();

  console.log("✅ System Roles Seeded (super_admin, admin, tenant_admin)");
}