import { NextFunction, Request, Response } from "express";
import { eq, inArray } from "drizzle-orm";
import jwt from "jsonwebtoken";
import db from "../db/index.js";
import users from "../db/schema/users.js";
import {
  userScopes,
  userRoles,
  roles,
  rolePermissions,
  userPermissions,
  permissions,
} from "../db/schema/index.js";
import JwtService from "../utils/jwtServices.js";
import { AppError } from "./errorHandler.js";
import { IAdminJwtPayload, IUserJwtPayload } from "../@types/payload.types.js";

export const adminAuth = async (
  req: Request,
  res: Response,
  next: NextFunction
) => {
  try {
    const authHeader = req.headers.authorization;
    let token: string | undefined;

    if (authHeader && authHeader.startsWith("Bearer ")) {
      token = authHeader.split(" ")[1];
    } else if (typeof req.query.token === "string" && req.query.token) {
      token = req.query.token;
    }

    if (!token) {
      throw new AppError("Unauthorized: Admin credentials required", 401);
    }

    const decoded = JwtService.verify(token) as IAdminJwtPayload;

    if (decoded.portal !== "admin") {
      throw new AppError("Unauthorized: Admin portal access only", 403);
    }

    // Verify user exists in database
    const existingUser = await db.query.user.findFirst({
      where: eq(users.id, decoded.userId),
    });

    if (!existingUser) {
      throw new AppError("Admin user not found", 401);
    }

    if (!existingUser.isEmailVerified) {
      throw new AppError("Admin email not verified", 403);
    }

    // Refresh role & permissions if needed
    if (!decoded.permissions || decoded.isSuperAdmin === undefined || !decoded.role) {
      const scope = await db.query.userScopes.findFirst({
        where: eq(userScopes.userId, decoded.userId),
      });

      if (scope) {
        const userRoleData = await db
          .select({
            roleId: userRoles.roleId,
            slug: roles.slug,
            name: roles.name,
          })
          .from(userRoles)
          .innerJoin(roles, eq(userRoles.roleId, roles.id))
          .where(eq(userRoles.scopeId, scope.id));

        const roleIds = userRoleData.map((r) => r.roleId);
        const isSuperAdmin = userRoleData.some((r) => r.slug === "super_admin");
        const singleRole = isSuperAdmin
          ? "super_admin"
          : userRoleData[0]?.slug || userRoleData[0]?.name || "admin";

        let adminPermissions: string[] = [];

        if (isSuperAdmin) {
          const allPerms = await db.select({ code: permissions.code }).from(permissions);
          adminPermissions = allPerms.map((p) => p.code);
        } else {
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

          const userPermissionData = await db
            .select({
              code: permissions.code,
              isAdminPortal: permissions.isAdminPortal,
            })
            .from(userPermissions)
            .innerJoin(
              permissions,
              eq(userPermissions.permissionId, permissions.id)
            )
            .where(eq(userPermissions.scopeId, scope.id));

          adminPermissions = [
            ...new Set([
              ...rolePermissionData.filter((p) => p.isAdminPortal).map((p) => p.code),
              ...userPermissionData.filter((p) => p.isAdminPortal).map((p) => p.code),
            ]),
          ];
        }

        decoded.role = singleRole;
        decoded.permissions = adminPermissions;
        decoded.isSuperAdmin = isSuperAdmin;
        decoded.isAdminPortalUser = true;
      }
    }

    // Super Admins or Users with Admin Portal permissions are allowed
    if (!decoded.isSuperAdmin && (!decoded.permissions || decoded.permissions.length === 0)) {
      throw new AppError(
        "Access Denied: You do not have permission to access the Admin Console.",
        403
      );
    }

    req.user = decoded as unknown as IUserJwtPayload;
    req.adminUser = decoded;
    next();
  } catch (err) {
    if (
      err instanceof jwt.TokenExpiredError ||
      err instanceof jwt.JsonWebTokenError
    ) {
      return next(new AppError("Unauthorized: Invalid or expired admin token", 401));
    }
    return next(err);
  }
};

export default adminAuth;
