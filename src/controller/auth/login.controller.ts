import bcrypt from "bcrypt";
import { and, eq, inArray } from "drizzle-orm";
import { NextFunction, Request, Response } from "express";

import db from "../../db/index.js";
import {
  offices,
  permissions,
  refreshTokens,
  rolePermissions,
  roles,
  tenants,
  user,
  userPermissions,
  userRoles,
  userScopeOffices,
  userScopes,
} from "../../db/schema/index.js";

import { config } from "../../config/index.js";
import ResponseHandler from "../../utils/responseHandler.js";
import CustomErrorHandler from "../../utils/customErrorHandler.js";
import JwtService from "../../utils/jwtServices.js";
import { IUserJwtPayload } from "../../@types/payload.types.js";
import emailOtpService from "../../services/emailOtp.service.js";

const REFRESH_EXPIRES = "7d";

const loginController = {
  // =========================================================================
  // TENANT CLIENT LOGIN (Law Firm Partners, Advocates, Staff, Clients)
  // =========================================================================
  async userlogin(req: Request, res: Response, next: NextFunction) {
    try {
      const { email, password } = req.body;

      if (!email || !password) {
        return next(
          CustomErrorHandler.wrongCredentials("Please enter email and password")
        );
      }

      // Find User
      const clientUser = await db.query.user.findFirst({
        where: eq(user.email, email),
      });

      if (!clientUser) {
        return next(
          CustomErrorHandler.wrongCredentials("Email or password is incorrect")
        );
      }

      // Verify Password
      const isMatch = await bcrypt.compare(password, clientUser.password);

      if (!isMatch) {
        return next(
          CustomErrorHandler.wrongCredentials("Email or password is incorrect")
        );
      }

      if (!clientUser.isEmailVerified) {
        await emailOtpService({ id: clientUser.id, email: clientUser.email });
        return res.status(403).json(
          ResponseHandler(403, "Email verification required", {
            requireVerification: true,
            email: clientUser.email,
          })
        );
      }

      // Get Default Tenant Scope
      const scope = await db.query.userScopes.findFirst({
        where: and(
          eq(userScopes.userId, clientUser.id),
          eq(userScopes.isDefault, true)
        ),
      });

      if (!scope) {
        return next(CustomErrorHandler.notFound("No active law firm workspace found for this account"));
      }

      const scopeOffices = await db
        .select({
          id: offices.id,
          name: offices.name,
          isHeadOffice: offices.isHeadOffice,
        })
        .from(userScopeOffices)
        .innerJoin(offices, eq(userScopeOffices.officeId, offices.id))
        .where(eq(userScopeOffices.userScopeId, scope.id));

      // Get User Roles
      const assignedRoles = await db.query.userRoles.findMany({
        where: eq(userRoles.scopeId, scope.id),
      });

      const roleIds = assignedRoles.map((r) => r.roleId);

      // Get Role Names & Types
      const roleData =
        roleIds.length > 0
          ? await db
              .select({
                id: roles.id,
                name: roles.name,
                slug: roles.slug,
                isSystemRole: roles.isSystemRole,
                tenantId: roles.tenantId,
              })
              .from(roles)
              .where(inArray(roles.id, roleIds))
          : [];

      // Check if user belongs to system tenant
      const tenant = await db.query.tenants.findFirst({
        where: eq(tenants.id, scope.tenantId!),
      });

      const isSystemTenant = tenant?.slug === "system";
      const isSuperAdmin = roleData.some((r) => r.slug === "super_admin");

      // Block ALL platform-level administration accounts (scoped to internal system tenant) from logging into tenant portal
      if (isSystemTenant) {
        return next(
          CustomErrorHandler.unAuthorized(
            "Platform Administrator accounts must log in via the Admin Console."
          )
        );
      }

      // Get Role Permissions (Only tenant permissions)
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

      // Get User Permissions
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

      // Merge Tenant Permissions (Filter out admin portal permissions)
      let permissionCodes = [
        ...new Set([
          ...rolePermissionData.filter((p) => !p.isAdminPortal).map((p) => p.code),
          ...userPermissionData.filter((p) => !p.isAdminPortal).map((p) => p.code),
        ]),
      ];

      // Check if user has the seeded tenant_admin role
      const isTenantAdmin = roleData.some((r) => r.slug === "tenant_admin");

      // If tenant admin, grant all tenant client permissions unconditionally
      if (isTenantAdmin) {
        const allTenantPerms = await db
          .select({ code: permissions.code })
          .from(permissions)
          .where(eq(permissions.isAdminPortal, false));
        const allCodes = allTenantPerms.map((p) => p.code);
        permissionCodes = [...new Set([...permissionCodes, ...allCodes])];
      }

      // Dedicated Tenant JWT Payload
      const payload: IUserJwtPayload = {
        userId: clientUser.id,
        tenantId: scope.tenantId!,
        scopeId: scope.id,
        email: clientUser.email,
        roleIds,
        permissions: permissionCodes,
        portal: "tenant",
      };

      // Generate Tokens
      const access_token = JwtService.sign(payload, "15m");

      const refresh_token = JwtService.sign(
        {
          userId: clientUser.id,
          tenantId: scope.tenantId,
          scopeId: scope.id,
          portal: "tenant",
        },
        REFRESH_EXPIRES,
        config.REFRESH_SECRET
      );

      // Save Refresh Token
      const existingToken = await db.query.refreshTokens.findFirst({
        where: eq(refreshTokens.userId, clientUser.id),
      });

      if (existingToken) {
        await db
          .update(refreshTokens)
          .set({
            token: refresh_token,
            expiresAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000),
          })
          .where(eq(refreshTokens.userId, clientUser.id));
      } else {
        await db.insert(refreshTokens).values({
          userId: clientUser.id,
          token: refresh_token,
          expiresAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000),
        });
      }

      return res.status(200).json(
        ResponseHandler(200, "Login successful", {
          user: {
            id: clientUser.id,
            name: clientUser.name,
            email: clientUser.email,
            email_verified: clientUser.isEmailVerified,
            phone_verified: clientUser.isPhoneVerified,
            isTenantAdmin,
          },
          roles: roleData,
          permissions: permissionCodes,
          isTenantAdmin,
          scope: {
            ...scope,
            offices: scopeOffices,
          },
          access_token,
          refresh_token,
        })
      );
    } catch (error) {
      console.error(error);
      return next(CustomErrorHandler.serverError());
    }
  },
};

export default loginController;
