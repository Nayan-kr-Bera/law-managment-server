import { PERMISSIONS } from "../../constants/permission.js";
import db from "../index.js";
import { permissions } from "../schema/index.js";

async function seedPermissions() {
  const permissionList = Object.values(PERMISSIONS).map((perm) => ({
    code: perm.code,
    description: perm.description,
  }));

  await db.insert(permissions).values(permissionList).onConflictDoNothing();

  console.log('✅ Permissions seeded');
}

export default seedPermissions;
