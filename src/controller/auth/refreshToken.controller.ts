import { NextFunction, Request, Response } from "express";
import { and, eq, inArray } from "drizzle-orm";
import db from "../../db/index.js";
import users from "../../db/schema/users.js";
import refreshTokens from "../../db/schema/refreshToken.js";
import {
  permissions,
  rolePermissions,
  roles,
  userPermissions,
  userRoles,
  userScopes,
} from "../../db/schema/index.js";
import JwtService from "../../utils/jwtServices.js";
import CustomErrorHandler from "../../utils/customErrorHandler.js";
import ResponseHandler from "../../utils/responseHandler.js";
import { IUserJwtPayload } from "../../@types/payload.types.js";
import { config } from "../../config/index.js";
import { refreshSchema } from "../../validators/auth/refreshtokan.validetor.js";

const ACCESS_EXPIRES = "15m";
const REFRESH_EXPIRES = "7d";

const refreshController = {
  async refresh(req: Request, res: Response, next: NextFunction) {
    try {
      const parsed = refreshSchema.safeParse(req.body);

      if (!parsed.success) {
        return next(parsed.error);
      }

      const { refresh_token } = parsed.data;

      const tokenDoc = await db.query.refreshTokens.findFirst({
        where: eq(refreshTokens.token, refresh_token),
      });

      if (!tokenDoc) {
        return next(CustomErrorHandler.unAuthorized("Invalid refresh token"));
      }

      if (tokenDoc.expiresAt && tokenDoc.expiresAt.getTime() < Date.now()) {
        await db
          .delete(refreshTokens)
          .where(eq(refreshTokens.token, refresh_token));
        return next(
          CustomErrorHandler.unAuthorized(
            "Session expired. Please sign in again.",
          ),
        );
      }

      const decoded = JwtService.verify(refresh_token, config.REFRESH_SECRET);
      const userId = decoded.userId;

      const user = await db.query.user.findFirst({
        where: eq(users.id, userId),
      });

      if (!user || !user.isEmailVerified) {
        await db
          .delete(refreshTokens)
          .where(eq(refreshTokens.token, refresh_token));
        return next(CustomErrorHandler.unAuthorized("User not found"));
      }

      let scope = decoded.scopeId
        ? await db.query.userScopes.findFirst({
            where: and(
              eq(userScopes.id, decoded.scopeId),
              eq(userScopes.userId, user.id),
            ),
          })
        : undefined;

      if (!scope) {
        scope = await db.query.userScopes.findFirst({
          where: and(
            eq(userScopes.userId, user.id),
            eq(userScopes.isDefault, true),
          ),
        });
      }

      if (!scope || !scope.tenantId) {
        return next(CustomErrorHandler.unAuthorized("No user scope found"));
      }

      const assignedRoles = await db.query.userRoles.findMany({
        where: eq(userRoles.scopeId, scope.id),
      });
      const roleIds = assignedRoles.map((r) => r.roleId);

      const roleData =
        roleIds.length > 0
          ? await db
              .select({ slug: roles.slug })
              .from(roles)
              .where(inArray(roles.id, roleIds))
          : [];

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
                eq(rolePermissions.permissionId, permissions.id),
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
          eq(userPermissions.permissionId, permissions.id),
        )
        .where(eq(userPermissions.scopeId, scope.id));

      let permissionCodes = [
        ...new Set([
          ...rolePermissionData
            .filter((p) => !p.isAdminPortal)
            .map((p) => p.code),
          ...userPermissionData
            .filter((p) => !p.isAdminPortal)
            .map((p) => p.code),
        ]),
      ];

      const isTenantAdmin = roleData.some((r) => r.slug === "tenant_admin");
      if (isTenantAdmin) {
        const allTenantPerms = await db
          .select({ code: permissions.code })
          .from(permissions)
          .where(eq(permissions.isAdminPortal, false));
        permissionCodes = [
          ...new Set([...permissionCodes, ...allTenantPerms.map((p) => p.code)]),
        ];
      }

      const accessPayload: IUserJwtPayload = {
        userId: user.id,
        tenantId: scope.tenantId,
        scopeId: scope.id,
        email: user.email,
        roleIds,
        permissions: permissionCodes,
        isTenantAdmin,
        portal: "tenant",
      };

      const access_token = JwtService.sign(accessPayload, ACCESS_EXPIRES);

      const new_refresh_token = JwtService.sign(
        {
          userId: user.id,
          tenantId: scope.tenantId,
          scopeId: scope.id,
          portal: "tenant",
        },
        REFRESH_EXPIRES,
        config.REFRESH_SECRET,
      );

      await db
        .update(refreshTokens)
        .set({
          token: new_refresh_token,
          expiresAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000),
        })
        .where(eq(refreshTokens.token, refresh_token));

      return res.status(200).send(
        ResponseHandler(200, "success", {
          access_token,
          refresh_token: new_refresh_token,
        }),
      );
    } catch (error) {
      return next(error);
    }
  },
};

export default refreshController;
