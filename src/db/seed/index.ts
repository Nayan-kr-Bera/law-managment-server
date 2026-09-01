import seedPermissions from "./permissions.seed.js";
import seedRolePermissions from "./rolePermissions.seed.js";
import seedRoles from "./roles.seed.js";
import seedSubscriptionPlans from "./subscripstionPlanSeed.js";
import seedSuperAdmin from "./superAdmin.seed.js";
import seedSystemAlerts from "./systemAlerts.seed.js";
import seedTags from "./tags.seed.js";

async function runSeeders() {
  try {
    await seedRoles();
    await seedPermissions();
    await seedRolePermissions();
    await seedSuperAdmin();
    await seedTags()
    await seedSystemAlerts();
    await seedSubscriptionPlans();


    console.log('🌱 Database seeded successfully');

    process.exit(0);
  } catch (error) {
    console.error('❌ Seeder failed:', error);
    process.exit(1);
  }
}

runSeeders();
