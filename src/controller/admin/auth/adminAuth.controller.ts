import bcrypt from "bcrypt";
import { and, eq, inArray } from "drizzle-orm";
import { NextFunction, Request, Response } from "express";

import db from "../../../db/index.js";
import {
  permissions,
  refreshTokens,
  rolePermissions,
  roles,
  user,
  userPermissions,
  userRoles,
  userScopes,
} from "../../../db/schema/index.js";

import { config } from "../../../config/index.js";
import ResponseHandler from "../../../utils/responseHandler.js";
import CustomErrorHandler from "../../../utils/customErrorHandler.js";
import JwtService from "../../../utils/jwtServices.js";
import { IAdminJwtPayload } from "../../../@types/payload.types.js";

const REFRESH_EXPIRES = "7d";

const adminAuthController = {
  async login(req: Request, res: Response, next: NextFunction) {
    try {
      const { email, password } = req.body;

      if (!email || !password) {
        return next(
          CustomErrorHandler.wrongCredentials("Please enter email and password")
        );
      }

      const adminUser = await db.query.user.findFirst({
        where: eq(user.email, email.trim().toLowerCase()),
      });

      if (!adminUser) {
        return next(
          CustomErrorHandler.wrongCredentials("Invalid admin credentials")
        );
      }

      const isMatch = await bcrypt.compare(password, adminUser.password);
      if (!isMatch) {
        return next(
          CustomErrorHandler.wrongCredentials("Invalid admin credentials")
        );
      }

      if (!adminUser.isEmailVerified) {
        return next(
          CustomErrorHandler.unAuthorized("Admin email address is not verified")
        );
      }

      const scope = await db.query.userScopes.findFirst({
        where: and(
          eq(userScopes.userId, adminUser.id),
          eq(userScopes.isDefault, true)
        ),
      });

      const assignedRoles = scope
        ? await db.query.userRoles.findMany({
            where: eq(userRoles.scopeId, scope.id),
          })
        : [];

      const roleIds = assignedRoles.map((r) => r.roleId);

      const roleData =
        roleIds.length > 0
          ? await db
              .select({
                id: roles.id,
                name: roles.name,
                slug: roles.slug,
              })
              .from(roles)
              .where(inArray(roles.id, roleIds))
          : [];

      const isSuperAdmin = roleData.some((r) => r.slug === "super_admin");
      const isPlatformAdmin =
        isSuperAdmin || roleData.some((r) => r.slug === "admin");

      const singleRole: string = isSuperAdmin
        ? "super_admin"
        : isPlatformAdmin
        ? "admin"
        : roleData[0]?.slug || roleData[0]?.name || "admin";

      const rolePermissionData =
        roleIds.length > 0
          ? await db
              .select({
                code: permissions.code,
                isAdminPortal: permissions.isAdminPortal,
              })
              .from(rolePermissions)
              .innerJoin(
                permissions,
                eq(rolePermissions.permissionId, permissions.id)
              )
              .where(inArray(rolePermissions.roleId, roleIds))
          : [];

      const userPermissionData = scope
        ? await db
            .select({
              code: permissions.code,
              isAdminPortal: permissions.isAdminPortal,
            })
            .from(userPermissions)
            .innerJoin(
              permissions,
              eq(userPermissions.permissionId, permissions.id)
            )
            .where(eq(userPermissions.scopeId, scope.id))
        : [];

      let adminPermissions: string[] = [];

      if (isSuperAdmin) {
        const allAdminPortalPerms = await db
          .select({ code: permissions.code })
          .from(permissions);
        adminPermissions = allAdminPortalPerms.map((p) => p.code);
      } else {
        adminPermissions = [
          ...new Set([
            ...rolePermissionData
              .filter((p) => p.isAdminPortal)
              .map((p) => p.code),
            ...userPermissionData
              .filter((p) => p.isAdminPortal)
              .map((p) => p.code),
          ]),
        ];
      }

      if (!isSuperAdmin && !isPlatformAdmin && adminPermissions.length === 0) {
        return next(
          CustomErrorHandler.unAuthorized(
            "Access Denied: Only authorized Platform Administrators can access the Admin Console."
          )
        );
      }

      const payload: IAdminJwtPayload = {
        userId: adminUser.id,
        adminId: adminUser.id,
        email: adminUser.email,
        role: singleRole,
        roleId: roleIds[0],
        permissions: adminPermissions,
        isSuperAdmin,
        portal: "admin",
      };

      const access_token = JwtService.sign(payload, "1d");

      const refresh_token = JwtService.sign(
        {
          userId: adminUser.id,
          portal: "admin",
        },
        REFRESH_EXPIRES,
        config.REFRESH_SECRET
      );

      await db.delete(refreshTokens).where(eq(refreshTokens.userId, adminUser.id));
      await db.insert(refreshTokens).values({
        userId: adminUser.id,
        token: refresh_token,
        expiresAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000),
      });

      return res.status(200).json(
        ResponseHandler(200, "Admin authentication successful", {
          user: {
            id: adminUser.id,
            name: adminUser.name,
            email: adminUser.email,
            email_verified: adminUser.isEmailVerified,
            phone_verified: adminUser.isPhoneVerified,
            avatar: adminUser.avatar || null,
            isSuperAdmin,
          },
          role: singleRole,
          roles: [singleRole],
          permissions: adminPermissions,
          access_token,
          refresh_token,
        })
      );
    } catch (error) {
      console.error("Admin login error:", error);
      return next(CustomErrorHandler.serverError());
    }
  },

  async refreshToken(req: Request, res: Response, next: NextFunction) {
    try {
      const { refresh_token } = req.body;

      if (!refresh_token) {
        return next(CustomErrorHandler.unAuthorized("Refresh token required"));
      }

      const tokenDoc = await db.query.refreshTokens.findFirst({
        where: eq(refreshTokens.token, refresh_token),
      });

      if (!tokenDoc) {
        return next(
          CustomErrorHandler.unAuthorized("Invalid admin refresh token")
        );
      }

      const decoded = JwtService.verify(
        refresh_token,
        config.REFRESH_SECRET
      ) as {
        userId: string;
        portal?: string;
      };

      const adminUser = await db.query.user.findFirst({
        where: eq(user.id, decoded.userId),
      });

      if (!adminUser) {
        return next(CustomErrorHandler.unAuthorized("Admin user not found"));
      }

      const scope = await db.query.userScopes.findFirst({
        where: and(
          eq(userScopes.userId, adminUser.id),
          eq(userScopes.isDefault, true)
        ),
      });

      const assignedRoles = scope
        ? await db.query.userRoles.findMany({
            where: eq(userRoles.scopeId, scope.id),
          })
        : [];

      const roleIds = assignedRoles.map((r) => r.roleId);

      const roleData =
        roleIds.length > 0
          ? await db
              .select({
                slug: roles.slug,
                name: roles.name,
              })
              .from(roles)
              .where(inArray(roles.id, roleIds))
          : [];

      const isSuperAdmin = roleData.some((role) => role.slug === "super_admin");
      const isPlatformAdmin =
        isSuperAdmin || roleData.some((role) => role.slug === "admin");

      const singleRole: string = isSuperAdmin
        ? "super_admin"
        : isPlatformAdmin
        ? "admin"
        : roleData[0]?.slug || roleData[0]?.name || "admin";

      let adminPermissions: string[] = [];
      if (isSuperAdmin) {
        const allPerms = await db
          .select({ code: permissions.code })
          .from(permissions);
        adminPermissions = allPerms.map((p) => p.code);
      } else {
        const perms =
          roleIds.length > 0
            ? await db
                .select({
                  code: permissions.code,
                  isAdminPortal: permissions.isAdminPortal,
                })
                .from(rolePermissions)
                .innerJoin(
                  permissions,
                  eq(rolePermissions.permissionId, permissions.id)
                )
                .where(inArray(rolePermissions.roleId, roleIds))
            : [];
        adminPermissions = perms
          .filter((p) => p.isAdminPortal)
          .map((p) => p.code);
      }

      const payload: IAdminJwtPayload = {
        userId: adminUser.id,
        adminId: adminUser.id,
        email: adminUser.email,
        role: singleRole,
        roleId: roleIds[0],
        permissions: adminPermissions,
        isSuperAdmin,
        portal: "admin",
      };

      const access_token = JwtService.sign(payload, "1d");
      const new_refresh_token = JwtService.sign(
        { userId: adminUser.id, portal: "admin" },
        REFRESH_EXPIRES,
        config.REFRESH_SECRET
      );

      await db
        .update(refreshTokens)
        .set({ token: new_refresh_token })
        .where(eq(refreshTokens.token, refresh_token));

      return res.status(200).send(
        ResponseHandler(200, "Token refreshed successfully", {
          access_token,
          refresh_token: new_refresh_token,
        })
      );
    } catch (error) {
      return next(error);
    }
  },

  async logout(req: Request, res: Response, next: NextFunction) {
    try {
      const adminId = req.user?.userId || req.adminUser?.userId;
      if (adminId) {
        await db
          .delete(refreshTokens)
          .where(eq(refreshTokens.userId, adminId));
      }

      return res.status(200).json(
        ResponseHandler(200, "Admin logged out successfully")
      );
    } catch (error) {
      return next(error);
    }
  },

  async getProfile(req: Request, res: Response, next: NextFunction) {
    try {
      const adminId = req.user?.userId || req.adminUser?.userId;
      if (!adminId) {
        return next(CustomErrorHandler.unAuthorized("Admin context missing"));
      }

      const adminUser = await db.query.user.findFirst({
        where: eq(user.id, adminId),
      });

      if (!adminUser) {
        return next(CustomErrorHandler.notFound("Admin user not found"));
      }

      return res.status(200).json(
        ResponseHandler(200, "Admin profile fetched successfully", {
          user: {
            id: adminUser.id,
            name: adminUser.name,
            email: adminUser.email,
            phone: adminUser.phone,
            avatar: adminUser.avatar,
            email_verified: adminUser.isEmailVerified,
            phone_verified: adminUser.isPhoneVerified,
            isSuperAdmin: req.adminUser?.isSuperAdmin ?? false,
          },
          role: req.adminUser?.role || req.user?.role || "admin",
          roles: [req.adminUser?.role || req.user?.role || "admin"],
          permissions: req.adminUser?.permissions || req.user?.permissions || [],
        })
      );
    } catch (error) {
      return next(error);
    }
  },
};

export default adminAuthController;
