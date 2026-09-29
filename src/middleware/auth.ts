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
import { IUserJwtPayload } from "../@types/payload.types.js";

const auth = async (
  req: Request,
  res: Response,
  next: NextFunction,
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
      throw new AppError("Unauthorized User", 401);
    }

    const decoded = JwtService.verify(token) as IUserJwtPayload;

    // Check user still exists
    const existingUser = await db.query.user.findFirst({
      where: eq(users.id, decoded.userId),
    });

    if (!existingUser) {
      throw new AppError("User not found", 401);
    }

    // Check email verification
    if (!existingUser.isEmailVerified) {
      throw new AppError("Email not verified", 403);
    }

    // If token payload is missing permissions or isTenantAdmin, load them from DB
    if (!decoded.permissions || decoded.isTenantAdmin === undefined) {
      const scope = decoded.scopeId
        ? await db.query.userScopes.findFirst({
            where: eq(userScopes.id, decoded.scopeId),
          })
        : await db.query.userScopes.findFirst({
            where: eq(userScopes.userId, decoded.userId),
          });

      if (scope) {
        const userRoleData = await db
          .select({
            roleId: userRoles.roleId,
            slug: roles.slug,
          })
          .from(userRoles)
          .innerJoin(roles, eq(userRoles.roleId, roles.id))
          .where(eq(userRoles.scopeId, scope.id));

        const roleIds = userRoleData.map((r) => r.roleId);
        const isTenantAdmin = userRoleData.some((r) => r.slug === "tenant_admin");

        const rolePermissionData =
          roleIds.length > 0
            ? await db
                .select({
                  code: permissions.code,
                })
                .from(rolePermissions)
                .innerJoin(
                  permissions,
                  eq(rolePermissions.permissionId, permissions.id),
                )
                .where(inArray(rolePermissions.roleId, roleIds))
            : [];

        const userPermissionData = await db
          .select({
            code: permissions.code,
          })
          .from(userPermissions)
          .innerJoin(
            permissions,
            eq(userPermissions.permissionId, permissions.id),
          )
          .where(eq(userPermissions.scopeId, scope.id));

        let permissionCodes = [
          ...new Set([
            ...rolePermissionData.map((p) => p.code),
            ...userPermissionData.map((p) => p.code),
          ]),
        ];

        if (isTenantAdmin) {
          const allTenantPerms = await db
            .select({ code: permissions.code })
            .from(permissions)
            .where(eq(permissions.isAdminPortal, false));
          const allCodes = allTenantPerms.map((p) => p.code);
          permissionCodes = [...new Set([...permissionCodes, ...allCodes])];
        }

        decoded.permissions = permissionCodes;
        decoded.isTenantAdmin = isTenantAdmin;
        decoded.tenantId = decoded.tenantId || scope.tenantId!;
        decoded.scopeId = decoded.scopeId || scope.id;
      }
    }

    req.user = decoded;

    next();
  } catch (err) {
  if (
    err instanceof jwt.TokenExpiredError ||
    err instanceof jwt.JsonWebTokenError
  ) {
    return next(new AppError("Unauthorized", 401));
  }

  return next(err);
}
};

export default auth;