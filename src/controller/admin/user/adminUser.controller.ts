import bcrypt from "bcrypt";
import slugify from "slugify";
import { and, eq, inArray } from "drizzle-orm";
import { NextFunction, Request, Response } from "express";

import db from "../../../db/index.js";
import {
  offices,
  permissions,
  roles,
  tenants,
  user,
  userPermissions,
  userRoles,
  userScopeOffices,
  userScopes,
} from "../../../db/schema/index.js";
import { PERMISSIONS } from "../../../constants/permission.js";

import CustomErrorHandler from "../../../utils/customErrorHandler.js";
import ResponseHandler from "../../../utils/responseHandler.js";
import { sendAdminWelcomeEmail } from "../../../services/adminWelcomeEmail.service.js";

// Ensure system tenant and head office exist
async function getOrCreateSystemTenant() {
  let systemTenant = await db.query.tenants.findFirst({
    where: eq(tenants.slug, "system"),
  });

  if (!systemTenant) {
    const [created] = await db
      .insert(tenants)
      .values({
        name: "System Management",
        slug: "system",
        timezone: "Asia/Kolkata",
        status: "active",
      })
      .returning();
    systemTenant = created;
  }

  let headOffice = await db.query.offices.findFirst({
    where: and(
      eq(offices.tenantId, systemTenant.id),
      eq(offices.isHeadOffice, true)
    ),
  });

  if (!headOffice) {
    const [createdOffice] = await db
      .insert(offices)
      .values({
        tenantId: systemTenant.id,
        name: "Principal HQ",
        isHeadOffice: true,
      })
      .returning();
    headOffice = createdOffice;
  }

  return { systemTenant, headOffice };
}

// Ensure admin portal permissions are in DB
async function ensureAdminPermissionsInDb() {
  const adminDefs = PERMISSIONS.filter((p) => p.isAdminPortal);
  for (const def of adminDefs) {
    const exists = await db.query.permissions.findFirst({
      where: eq(permissions.code, def.code),
    });
    if (!exists) {
      await db.insert(permissions).values({
        code: def.code,
        description: def.description,
        isAdminPortal: true,
      });
    }
  }
}

const adminUserController = {
  // =========================================================================
  // GET ALL SYSTEM / PANEL USERS (Including Granted Permissions)
  // =========================================================================
  async getSystemUsers(req: Request, res: Response, next: NextFunction) {
    try {
      const { search, tenantId } = req.query as {
        search?: string;
        role?: string;
        tenantId?: string;
      };

      const usersList = await db.query.user.findMany({
        orderBy: (u, { desc }) => [desc(u.createdAt)],
      });

      const formattedUsers = await Promise.all(
        usersList.map(async (u) => {
          const scope = await db.query.userScopes.findFirst({
            where: and(
              eq(userScopes.userId, u.id),
              eq(userScopes.isDefault, true)
            ),
            with: {
              tenant: true,
            },
          });

          const assignedRoles = scope
            ? await db
                .select({
                  roleId: roles.id,
                  slug: roles.slug,
                  name: roles.name,
                })
                .from(userRoles)
                .innerJoin(roles, eq(userRoles.roleId, roles.id))
                .where(eq(userRoles.scopeId, scope.id))
            : [];

          const roleName = assignedRoles[0]?.name || assignedRoles[0]?.slug || "Advocate";
          const roleSlug = assignedRoles[0]?.slug || "";
          const isSuperAdmin = assignedRoles.some((r) => r.slug === "super_admin");
          const tenantSlug = scope?.tenant?.slug || "";
          const isPanelAdmin =
            isSuperAdmin ||
            tenantSlug === "system" ||
            roleSlug === "super_admin" ||
            roleSlug === "platform_admin";

          // Load user direct permissions
          let userPermCodes: string[] = [];
          if (isSuperAdmin) {
            userPermCodes = ["*"];
          } else if (scope) {
            const userPerms = await db
              .select({ code: permissions.code })
              .from(userPermissions)
              .innerJoin(permissions, eq(userPermissions.permissionId, permissions.id))
              .where(eq(userPermissions.scopeId, scope.id));
            userPermCodes = userPerms.map((p) => p.code);
          }

          return {
            id: u.id,
            name: u.name,
            email: u.email,
            phone: u.phone || undefined,
            status: u.isEmailVerified ? "active" : "inactive",
            roleName,
            roleSlug,
            isSuperAdmin,
            isPanelAdmin,
            permissions: userPermCodes,
            tenantName: scope?.tenant?.name || undefined,
            tenantId: scope?.tenantId || undefined,
            tenantSlug,
            lastActiveAt: u.updatedAt ? new Date(u.updatedAt).toISOString() : undefined,
            createdAt: u.createdAt ? new Date(u.createdAt).toISOString() : new Date().toISOString(),
          };
        })
      );

      let filteredUsers = formattedUsers;
      if (search && search.trim() !== "") {
        const queryTerm = search.trim().toLowerCase();
        filteredUsers = filteredUsers.filter(
          (u) =>
            u.name.toLowerCase().includes(queryTerm) ||
            u.email.toLowerCase().includes(queryTerm) ||
            (u.roleName && u.roleName.toLowerCase().includes(queryTerm))
        );
      }

      if (tenantId && tenantId.trim() !== "" && tenantId !== "all") {
        filteredUsers = filteredUsers.filter((u) => u.tenantId === tenantId);
      }

      return res.status(200).json(
        ResponseHandler(200, "System users fetched successfully", filteredUsers)
      );
    } catch (error) {
      console.error("Admin get users error:", error);
      return next(CustomErrorHandler.serverError());
    }
  },

  // =========================================================================
  // GET AVAILABLE ADMIN PERMISSIONS CATALOG (Grouped by module)
  // =========================================================================
  async getAvailablePermissions(req: Request, res: Response, next: NextFunction) {
    try {
      await ensureAdminPermissionsInDb();

      const adminPerms = PERMISSIONS.filter((p) => p.isAdminPortal);

      // Group by module prefix
      const grouped: Record<string, { code: string; description: string }[]> = {
        "Dashboard & Analytics": [],
        "Tenants & Law Firms": [],
        "Subscription Plans": [],
        "Subscriptions & Billing": [],
        "Panel Users & RBAC": [],
        "Support & Helpdesk": [],
        "Bare Acts Repository": [],
        "Security & Audit Trail": [],
        "Platform Settings": [],
      };

      adminPerms.forEach((p) => {
        if (p.code.startsWith("admin.dashboard")) {
          grouped["Dashboard & Analytics"].push({ code: p.code, description: p.description });
        } else if (p.code.startsWith("admin.tenants")) {
          grouped["Tenants & Law Firms"].push({ code: p.code, description: p.description });
        } else if (p.code.startsWith("admin.plans")) {
          grouped["Subscription Plans"].push({ code: p.code, description: p.description });
        } else if (p.code.startsWith("admin.subscriptions")) {
          grouped["Subscriptions & Billing"].push({ code: p.code, description: p.description });
        } else if (p.code.startsWith("admin.users")) {
          grouped["Panel Users & RBAC"].push({ code: p.code, description: p.description });
        } else if (p.code.startsWith("admin.support")) {
          grouped["Support & Helpdesk"].push({ code: p.code, description: p.description });
        } else if (p.code.startsWith("admin.bare_acts")) {
          grouped["Bare Acts Repository"].push({ code: p.code, description: p.description });
        } else if (p.code.startsWith("admin.audit")) {
          grouped["Security & Audit Trail"].push({ code: p.code, description: p.description });
        } else if (p.code.startsWith("admin.settings")) {
          grouped["Platform Settings"].push({ code: p.code, description: p.description });
        } else {
          grouped["Platform Settings"].push({ code: p.code, description: p.description });
        }
      });

      return res.status(200).json(
        ResponseHandler(200, "Admin permissions catalog fetched", {
          permissions: adminPerms,
          grouped,
        })
      );
    } catch (error) {
      console.error("Admin get permissions catalog error:", error);
      return next(CustomErrorHandler.serverError());
    }
  },

  // =========================================================================
  // CREATE ADMIN USER WITH PERMISSIONS (Super Admin action)
  // =========================================================================
  async createAdminUser(req: Request, res: Response, next: NextFunction) {
    try {
      const { name, email, phone, password, roleSlug, permissions: grantedCodes } = req.body;

      if (!name || !email || !password) {
        return next(CustomErrorHandler.badRequest("Name, email, and password are required"));
      }

      const trimmedEmail = email.toLowerCase().trim();
      const sanitizedPhone =
        phone && typeof phone === "string" && phone.trim().length > 0 ? phone.trim() : null;

      if (sanitizedPhone) {
        if (sanitizedPhone.length > 30) {
          return next(CustomErrorHandler.badRequest("Phone number cannot exceed 30 characters"));
        }

        const existingPhone = await db.query.user.findFirst({
          where: eq(user.phone, sanitizedPhone),
        });

        if (existingPhone) {
          return next(CustomErrorHandler.badRequest("A user with this phone number already exists"));
        }
      }

      // Check if user already exists
      const existingUser = await db.query.user.findFirst({
        where: eq(user.email, trimmedEmail),
      });

      if (existingUser) {
        return next(CustomErrorHandler.badRequest("User with this email already exists"));
      }

      await ensureAdminPermissionsInDb();
      const { systemTenant, headOffice } = await getOrCreateSystemTenant();

      const hashedPassword = await bcrypt.hash(password, 10);
      const isSuperAdminRequested = roleSlug === "super_admin";

      const createdUser = await db.transaction(async (tx) => {
        // 1. Insert User
        const [newUser] = await tx
          .insert(user)
          .values({
            name: name.trim(),
            email: trimmedEmail,
            phone: sanitizedPhone,
            password: hashedPassword,
            isEmailVerified: true,
            isPhoneVerified: true,
          })
          .returning();

        // 2. Insert User Scope
        const [scope] = await tx
          .insert(userScopes)
          .values({
            userId: newUser.id,
            tenantId: systemTenant.id,
            isDefault: true,
          })
          .returning();

        // 3. Insert User Scope Office
        await tx.insert(userScopeOffices).values({
          userScopeId: scope.id,
          officeId: headOffice.id,
        });

        // 4. Role Assignment
        let role = await tx.query.roles.findFirst({
          where: eq(roles.slug, roleSlug || "admin"),
        });

        if (!role) {
          const [newRole] = await tx
            .insert(roles)
            .values({
              name: isSuperAdminRequested
                ? "Super Administrator"
                : (roleSlug ? roleSlug.replace(/_/g, " ").toUpperCase() : "Platform Administrator"),
              slug: roleSlug || "admin",
              isSystemRole: true,
              tenantId: systemTenant.id,
            })
            .returning();
          role = newRole;
        }

        await tx.insert(userRoles).values({
          scopeId: scope.id,
          roleId: role.id,
        });

        // 5. User Permissions
        const currentAdminId = (req as Request & { user?: { id?: string } }).user?.id || null;
        if (!isSuperAdminRequested && Array.isArray(grantedCodes) && grantedCodes.length > 0) {
          const dbPerms = await tx.query.permissions.findMany({
            where: inArray(permissions.code, grantedCodes),
          });

          for (const perm of dbPerms) {
            await tx.insert(userPermissions).values({
              scopeId: scope.id,
              permissionId: perm.id,
              grantedBy: currentAdminId,
            });
          }
        }

        return {
          user: newUser,
          roleName: role.name,
          roleSlug: role.slug,
        };
      });

      // Dispatch welcome email with credentials & role
      sendAdminWelcomeEmail({
        adminName: createdUser.user.name,
        adminEmail: createdUser.user.email,
        password,
        roleName: createdUser.roleName,
        roleSlug: createdUser.roleSlug || undefined,
        grantedPermissions: Array.isArray(grantedCodes) ? grantedCodes : [],
      }).catch((mailErr) => {
        console.error("Non-blocking welcome email error:", mailErr);
      });

      return res.status(201).json(
        ResponseHandler(201, "Admin user created successfully with assigned permissions", {
          id: createdUser.user.id,
          name: createdUser.user.name,
          email: createdUser.user.email,
          role: createdUser.roleName,
        })
      );
    } catch (error: unknown) {
      console.error("Admin create user error:", error);
      const err = error as { code?: string; message?: string };
      if (err?.code === "23505") {
        return next(CustomErrorHandler.badRequest("A user with this email or phone number already exists"));
      }
      if (err?.code === "22001") {
        return next(CustomErrorHandler.badRequest("One of the provided fields exceeds the maximum allowed length"));
      }
      return next(CustomErrorHandler.serverError(err?.message || "Failed to create administrator"));
    }
  },

  // =========================================================================
  // UPDATE ADMIN USER PERMISSIONS & ROLE (Super Admin action)
  // =========================================================================
  async updateAdminPermissions(req: Request, res: Response, next: NextFunction) {
    try {
      const { userId } = req.params;
      const { roleSlug, permissions: grantedCodes } = req.body;

      const targetUser = await db.query.user.findFirst({
        where: eq(user.id, userId),
      });

      if (!targetUser) {
        return next(CustomErrorHandler.notFound("Admin user not found"));
      }

      const scope = await db.query.userScopes.findFirst({
        where: and(
          eq(userScopes.userId, userId),
          eq(userScopes.isDefault, true)
        ),
      });

      if (!scope) {
        return next(CustomErrorHandler.badRequest("User does not have an active platform scope"));
      }

      await ensureAdminPermissionsInDb();
      const currentAdminId = (req as Request & { user?: { id?: string } }).user?.id || null;
      const isSuperAdminRequested = roleSlug === "super_admin";

      await db.transaction(async (tx) => {
        // 1. Update role if requested
        if (roleSlug) {
          let role = await tx.query.roles.findFirst({
            where: eq(roles.slug, roleSlug),
          });

          if (!role) {
            const [newRole] = await tx
              .insert(roles)
              .values({
                name: roleSlug.replace(/_/g, " ").toUpperCase(),
                slug: roleSlug,
                isSystemRole: isSuperAdminRequested,
              })
              .returning();
            role = newRole;
          }

          // Clear old userRoles and reassign
          await tx.delete(userRoles).where(eq(userRoles.scopeId, scope.id));
          await tx.insert(userRoles).values({
            scopeId: scope.id,
            roleId: role.id,
          });
        }

        // 2. Clear old permissions
        await tx.delete(userPermissions).where(eq(userPermissions.scopeId, scope.id));

        // 3. Insert new permissions if not super admin
        if (!isSuperAdminRequested && Array.isArray(grantedCodes) && grantedCodes.length > 0) {
          const dbPerms = await tx.query.permissions.findMany({
            where: inArray(permissions.code, grantedCodes),
          });

          for (const perm of dbPerms) {
            await tx.insert(userPermissions).values({
              scopeId: scope.id,
              permissionId: perm.id,
              grantedBy: currentAdminId,
            });
          }
        }
      });

      return res.status(200).json(
        ResponseHandler(200, "Admin permissions updated successfully")
      );
    } catch (error) {
      console.error("Admin update permissions error:", error);
      return next(CustomErrorHandler.serverError());
    }
  },

  // =========================================================================
  // TOGGLE USER STATUS
  // =========================================================================
  async toggleUserStatus(req: Request, res: Response, next: NextFunction) {
    try {
      const { userId } = req.params;
      const { status } = req.body;

      const existingUser = await db.query.user.findFirst({
        where: eq(user.id, userId),
      });

      if (!existingUser) {
        return next(CustomErrorHandler.notFound("User not found"));
      }

      await db
        .update(user)
        .set({
          isEmailVerified: status === "active",
          updatedAt: new Date(),
        })
        .where(eq(user.id, userId));

      return res.status(200).json(
        ResponseHandler(200, `User status updated to ${status}`)
      );
    } catch (error) {
      console.error("Admin toggle user status error:", error);
      return next(CustomErrorHandler.serverError());
    }
  },
};

export default adminUserController;
