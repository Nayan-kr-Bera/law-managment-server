import db from "../index.js";
import { roles } from "../schema/index.js";

export default async function seedRoles() {
  await db
    .insert(roles)
    .values([
      {
        name: "Super Admin",
        slug: "super_admin",
        isSystemRole:true,
      },
      {
        name: "System Administrator",
        slug: "tenant_admin",
        isSystemRole:true,
      },
    ])
    .onConflictDoNothing();

  console.log("✅ Roles Seeded");
}