import bcrypt from "bcrypt";
import slugify from "slugify";
import { and, eq } from "drizzle-orm";

import db from "../index.js";
import {
  offices,
  roles,
  tenants,
  user,
  userRoles,
  userScopeOffices,
  userScopes,
} from "../schema/index.js";

async function seedSuperAdmin() {
  try {
    const email = "superadmin@gmail.com";
    const phone = "1234567890";

    const existing = await db.query.user.findFirst({
      where: eq(user.email, email),
    });

    if (existing) {
      console.log("⚠️ Super Admin already exists");
      return;
    }

    const hashedPassword = await bcrypt.hash("daddataygi@123", 10);

    await db.transaction(async (tx) => {
      // Create / Get System Tenant

      let tenant = await tx.query.tenants.findFirst({
        where: eq(tenants.slug, "system"),
      });

      if (!tenant) {
        const [createdTenant] = await tx
          .insert(tenants)
          .values({
            name: "System",
            slug: slugify("System", {
              lower: true,
              strict: true,
            }),
            timezone: "Asia/Kolkata",
            status: "active",
          })
          .returning();

        tenant = createdTenant;
      }

      // Create / Get Head Office

      let office = await tx.query.offices.findFirst({
        where: and(
          eq(offices.tenantId, tenant.id),
          eq(offices.isHeadOffice, true),
        ),
      });

      if (!office) {
        const [createdOffice] = await tx
          .insert(offices)
          .values({
            tenantId: tenant.id,
            name: "Head Office",
            isHeadOffice: true,
          })
          .returning();

        office = createdOffice;
      }

      // Create Super Admin User

      const [admin] = await tx
        .insert(user)
        .values({
          name: "Super Admin",
          email,
          phone,
          password: hashedPassword,
          isEmailVerified: true,
          isPhoneVerified: true,
        })
        .returning();

      // Create Scope

      const [scope] = await tx
        .insert(userScopes)
        .values({
          userId: admin.id,
          tenantId: tenant.id,
          isDefault: true,
        })
        .returning();

      // Scope -> Office

      await tx.insert(userScopeOffices).values({
        userScopeId: scope.id,
        officeId: office.id,
      });

      // Find Super Admin Role

      const superAdminRole = await tx.query.roles.findFirst({
        where: and(eq(roles.slug, "super_admin"), eq(roles.isSystemRole, true)),
      });

      if (!superAdminRole) {
        throw new Error("Super Admin role not found.");
      }

      // Assign Role

      await tx.insert(userRoles).values({
        scopeId: scope.id,
        roleId: superAdminRole.id,
      });

      console.log("✅ Super Admin created successfully");
      console.log("📧 Email:", email);
      console.log("🔑 Password: daddataygi@123");
    });
  } catch (error) {
    console.error("Seeder Error:", error);
  }
}

export default seedSuperAdmin;
