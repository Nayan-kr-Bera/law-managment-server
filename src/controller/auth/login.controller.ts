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
  async userlogin(req: Request, res: Response, next: NextFunction) {
    try {
      const { email, password } = req.body;

      if (!email || !password) {
        return next(
          CustomErrorHandler.wrongCredentials(
            "Please enter email and password",
          ),
        );
      }

      // Find User
      const adminUser = await db.query.user.findFirst({
        where: eq(user.email, email),
      });

      if (!adminUser) {
        return next(
          CustomErrorHandler.wrongCredentials("Email or password is incorrect"),
        );
      }

      // Verify Password
      const isMatch = await bcrypt.compare(password, adminUser.password);

      if (!isMatch) {
        return next(
          CustomErrorHandler.wrongCredentials("Email or password is incorrect"),
        );
      }

      if (!adminUser.isEmailVerified) {
        await emailOtpService({ id: adminUser.id, email: adminUser.email });
        return res.status(403).json(
          ResponseHandler(403, "Email verification required", {
            requireVerification: true,
            email: adminUser.email,
          }),
        );
      }

      // Get Default Scope
      const scope = await db.query.userScopes.findFirst({
        where: and(
          eq(userScopes.userId, adminUser.id),
          eq(userScopes.isDefault, true),
        ),
      });

      if (!scope) {
        return next(CustomErrorHandler.notFound("No default tenant found"));
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

      // Get Role Names
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

      const isSuperAdmin = roleData.some((role) => role.slug === "super_admin");
      
      // Get Role Permissions
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

      // Get User Permissions
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

      // Merge Permissions
      const permissionCodes = [
        ...new Set([
          ...rolePermissionData.map((p) => p.code),
          ...userPermissionData.map((p) => p.code),
        ]),
      ];

      //Payload
      const payload: IUserJwtPayload = {
        userId: adminUser.id,
        tenantId: scope.tenantId!,
        scopeId: scope.id,
        email: adminUser.email,
        roleIds,
        permissions: permissionCodes,
        isSuperAdmin,
      };

      // Generate Tokens
      const access_token = JwtService.sign(payload, "10s");

      const refresh_token = JwtService.sign(
        {
          userId: adminUser.id,
          tenantId: scope.tenantId,
          scopeId: scope.id,
        },
        REFRESH_EXPIRES,
        config.REFRESH_SECRET,
      );

      // Save Refresh Token
      const existingToken = await db.query.refreshTokens.findFirst({
        where: eq(refreshTokens.userId, adminUser.id),
      });

      if (existingToken) {
        await db
          .update(refreshTokens)
          .set({
            token: refresh_token,
            expiresAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000),
          })
          .where(eq(refreshTokens.userId, adminUser.id));
      } else {
        await db.insert(refreshTokens).values({
          userId: adminUser.id,
          token: refresh_token,
          expiresAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000),
        });
      }

      // Response
      return res.status(200).json(
        ResponseHandler(200, "Login successful", {
          user: {
            id: adminUser.id,
            name: adminUser.name,
            email: adminUser.email,
            email_verified: adminUser.isEmailVerified,
            phone_verified: adminUser.isPhoneVerified,
            isSuperAdmin,
          },
          roles: roleData,
          permissions: permissionCodes,
          scope: {
            ...scope,
            offices: scopeOffices,
          },
          access_token,
          refresh_token,
        }),
      );
    } catch (error) {
      console.error(error);
      return next(CustomErrorHandler.serverError());
    }
  },
};

export default loginController;
