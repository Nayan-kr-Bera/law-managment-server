import crypto from "crypto";
import { and, asc, eq, inArray, or, sql } from "drizzle-orm";
import { NextFunction, Request, Response } from "express";
import { OAuth2Client } from "google-auth-library";
import slugify from "slugify";
import { z } from "zod";

import { IUserJwtPayload } from "../../@types/payload.types.js";
import { config } from "../../config/index.js";
import db from "../../db/index.js";
import {
  mobileSessions,
  offices,
  permissions,
  refreshTokens,
  rolePermissions,
  roles,
  subscriptionPlans,
  tenants,
  tenantSubscriptions,
  user,
  userPermissions,
  userRoles,
  userScopeOffices,
  userScopes,
} from "../../db/schema/index.js";
import CustomErrorHandler from "../../utils/customErrorHandler.js";
import JwtService from "../../utils/jwtServices.js";
import ResponseHandler from "../../utils/responseHandler.js";

const ACCESS_EXPIRES = "15m";
const REFRESH_EXPIRES = "7d";
const MOBILE_SESSION_TTL_MS = 30 * 24 * 60 * 60 * 1000;
const MAX_DEVICES_PER_USER = 5;

const oauthClient = new OAuth2Client();

const webGoogleSchema = z.object({
  idToken: z.string().trim().min(10).optional(),
  accessToken: z.string().trim().min(10).optional(),
});

const mobileGoogleSchema = webGoogleSchema.extend({
  deviceId: z.string().trim().min(8).max(128),
  deviceName: z.string().trim().max(255).optional(),
  platform: z.string().trim().max(32).optional(),
});

interface VerifiedGoogleIdentity {
  googleId: string;
  email: string;
  name: string;
  picture: string | null;
}

const hashToken = (token: string) =>
  crypto.createHash("sha256").update(token).digest("hex");

const generateMobileRefreshToken = (sessionId: string) =>
  `${sessionId}.${crypto.randomBytes(48).toString("base64url")}`;

const getClientIp = (req: Request) => {
  const fwd = req.headers["x-forwarded-for"];
  const ip =
    (Array.isArray(fwd) ? fwd[0] : fwd?.split(",")[0]) || req.ip || "";
  return String(ip).trim().slice(0, 64);
};

const getUserAgent = (req: Request) =>
  String(req.headers["user-agent"] || "").slice(0, 512);

async function verifyGoogleCredentials(params: {
  idToken?: string;
  accessToken?: string;
}): Promise<VerifiedGoogleIdentity> {
  const { idToken, accessToken } = params;

  if (idToken) {
    const verifyOptions: { idToken: string; audience?: string | string[] } = {
      idToken,
    };
    if (config.GOOGLE_CLIENT_IDS.length > 0) {
      verifyOptions.audience = config.GOOGLE_CLIENT_IDS;
    }

    const ticket = await oauthClient.verifyIdToken(verifyOptions);
    const payload = ticket.getPayload();

    if (!payload || !payload.sub || !payload.email) {
      throw CustomErrorHandler.unAuthorized("Invalid Google token payload");
    }

    if (!payload.email_verified) {
      throw CustomErrorHandler.unAuthorized(
        "Your Google email address is not verified by Google",
      );
    }

    return {
      googleId: payload.sub,
      email: payload.email.trim().toLowerCase(),
      name:
        payload.name?.trim() ||
        payload.email.split("@")[0]?.replace(/[._-]+/g, " ") ||
        "Chamber Advocate",
      picture: payload.picture || null,
    };
  }

  if (accessToken) {
    const resp = await fetch("https://www.googleapis.com/oauth2/v3/userinfo", {
      headers: { Authorization: `Bearer ${accessToken}` },
    });

    if (!resp.ok) {
      throw CustomErrorHandler.unAuthorized(
        "Invalid or expired Google access token",
      );
    }

    const info = (await resp.json()) as {
      sub?: string;
      email?: string;
      email_verified?: boolean;
      name?: string;
      picture?: string;
    };

    if (!info.sub || !info.email) {
      throw CustomErrorHandler.unAuthorized("Unable to read Google profile");
    }

    if (!info.email_verified) {
      throw CustomErrorHandler.unAuthorized(
        "Your Google email address is not verified by Google",
      );
    }

    return {
      googleId: info.sub,
      email: info.email.trim().toLowerCase(),
      name:
        info.name?.trim() ||
        info.email.split("@")[0]?.replace(/[._-]+/g, " ") ||
        "Chamber Advocate",
      picture: info.picture || null,
    };
  }

  throw CustomErrorHandler.badRequest(
    "Google idToken or accessToken is required",
  );
}

async function resolveOrProvisionGoogleUser(identity: VerifiedGoogleIdentity) {
  const existingUser = await db.query.user.findFirst({
    where: or(
      eq(user.googleId, identity.googleId),
      sql`LOWER(${user.email}) = ${identity.email}`,
    ),
  });

  if (existingUser) {
    const scope = await db.query.userScopes.findFirst({
      where: and(
        eq(userScopes.userId, existingUser.id),
        eq(userScopes.isDefault, true),
      ),
    });

    if (!scope || !scope.tenantId) {
      throw CustomErrorHandler.notFound(
        "No active law firm workspace found for this account",
      );
    }

    const tenant = await db.query.tenants.findFirst({
      where: eq(tenants.id, scope.tenantId),
    });

    if (tenant?.slug === "system") {
      throw CustomErrorHandler.unAuthorized(
        "Platform Administrator accounts must log in via the Admin Console.",
      );
    }

    if (
      existingUser.googleId &&
      existingUser.googleId !== identity.googleId
    ) {
      throw CustomErrorHandler.unAuthorized(
        "This email is already linked to a different Google account.",
      );
    }

    const nextAuthProvider = existingUser.password ? "both" : "google";

    const [updatedUser] = await db
      .update(user)
      .set({
        googleId: identity.googleId,
        isEmailVerified: true,
        authProvider: nextAuthProvider,
        avatar: existingUser.avatar || identity.picture || null,
        lastLoginAt: new Date(),
        updatedAt: new Date(),
      })
      .where(eq(user.id, existingUser.id))
      .returning();

    return { clientUser: updatedUser, scope, isNewRegistration: false };
  }

  // Auto-Register brand new Chamber Workspace + 14-day Free Trial + Head Office + tenant_admin
  const provisioned = await db.transaction(async (tx) => {
    const baseSlug =
      slugify(identity.name, { lower: true, strict: true }) || "chamber";
    let slug = baseSlug;
    let count = 1;

    while (
      await tx.query.tenants.findFirst({
        where: eq(tenants.slug, slug),
      })
    ) {
      slug = `${baseSlug}-${count++}`;
    }

    const [createdTenant] = await tx
      .insert(tenants)
      .values({
        name: identity.name,
        slug,
        timezone: "Asia/Kolkata",
        status: "active",
      })
      .returning();

    const freeTrialPlan = await tx.query.subscriptionPlans.findFirst({
      where: and(
        eq(subscriptionPlans.code, "free_trial"),
        eq(subscriptionPlans.isActive, true),
        eq(subscriptionPlans.isInternal, false),
      ),
    });

    if (!freeTrialPlan) {
      throw CustomErrorHandler.serverError(
        "Free trial subscription plan ('free_trial') not found or inactive. Please contact system administrator.",
      );
    }

    const trialStartDate = new Date();
    const trialEndDate = new Date(trialStartDate);
    trialEndDate.setDate(trialEndDate.getDate() + 14);

    await tx.insert(tenantSubscriptions).values({
      tenantId: createdTenant.id,
      planId: freeTrialPlan.id,
      status: "trial",
      billingCycle: "monthly",
      amount: "0.00",
      currency: freeTrialPlan.currency,
      startDate: trialStartDate.toISOString().split("T")[0],
      nextBillingDate: trialEndDate.toISOString().split("T")[0],
      autoRenew: false,
    });

    const [createdOffice] = await tx
      .insert(offices)
      .values({
        tenantId: createdTenant.id,
        name: "Head Office",
        isHeadOffice: true,
      })
      .returning();

    const [createdUser] = await tx
      .insert(user)
      .values({
        name: identity.name,
        email: identity.email,
        password: null,
        googleId: identity.googleId,
        authProvider: "google",
        avatar: identity.picture || null,
        isEmailVerified: true,
      })
      .returning();

    const [createdScope] = await tx
      .insert(userScopes)
      .values({
        userId: createdUser.id,
        tenantId: createdTenant.id,
        isDefault: true,
      })
      .returning();

    await tx.insert(userScopeOffices).values({
      userScopeId: createdScope.id,
      officeId: createdOffice.id,
    });

    const adminRole = await tx.query.roles.findFirst({
      where: eq(roles.slug, "tenant_admin"),
    });

    if (!adminRole) {
      throw CustomErrorHandler.serverError("Tenant Admin role not found.");
    }

    await tx.insert(userRoles).values({
      scopeId: createdScope.id,
      roleId: adminRole.id,
    });

    return {
      clientUser: createdUser,
      scope: createdScope,
      isNewRegistration: true,
    };
  });

  return provisioned;
}

async function resolveScopeAccess(scopeId: string) {
  const scopeOffices = await db
    .select({
      id: offices.id,
      name: offices.name,
      isHeadOffice: offices.isHeadOffice,
    })
    .from(userScopeOffices)
    .innerJoin(offices, eq(userScopeOffices.officeId, offices.id))
    .where(eq(userScopeOffices.userScopeId, scopeId));

  const assignedRoles = await db.query.userRoles.findMany({
    where: eq(userRoles.scopeId, scopeId),
  });
  const roleIds = assignedRoles.map((r) => r.roleId);

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
    .innerJoin(permissions, eq(userPermissions.permissionId, permissions.id))
    .where(eq(userPermissions.scopeId, scopeId));

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

  return { scopeOffices, roleData, roleIds, permissionCodes, isTenantAdmin };
}

const googleAuthController = {
  async webGoogleLogin(req: Request, res: Response, next: NextFunction) {
    try {
      const parsed = webGoogleSchema.safeParse(req.body);
      if (!parsed.success || (!parsed.data.idToken && !parsed.data.accessToken)) {
        return next(
          CustomErrorHandler.badRequest("Valid Google credential is required"),
        );
      }

      const identity = await verifyGoogleCredentials(parsed.data);
      const { clientUser, scope, isNewRegistration } =
        await resolveOrProvisionGoogleUser(identity);

      const access = await resolveScopeAccess(scope.id);

      const payload: IUserJwtPayload = {
        userId: clientUser.id,
        tenantId: scope.tenantId!,
        scopeId: scope.id,
        email: clientUser.email,
        roleIds: access.roleIds,
        permissions: access.permissionCodes,
        isTenantAdmin: access.isTenantAdmin,
        portal: "tenant",
      };

      const access_token = JwtService.sign(payload, ACCESS_EXPIRES);
      const refresh_token = JwtService.sign(
        {
          userId: clientUser.id,
          tenantId: scope.tenantId,
          scopeId: scope.id,
          portal: "tenant",
        },
        REFRESH_EXPIRES,
        config.REFRESH_SECRET,
      );

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
        ResponseHandler(
          200,
          isNewRegistration
            ? "Chamber registered & signed in with Google"
            : "Signed in with Google",
          {
            user: {
              id: clientUser.id,
              name: clientUser.name,
              email: clientUser.email,
              phone: clientUser.phone || null,
              email_verified: clientUser.isEmailVerified,
              phone_verified: clientUser.isPhoneVerified,
              avatar: clientUser.avatar || null,
              isTenantAdmin: access.isTenantAdmin,
              hasPassword: Boolean(clientUser.password),
              authProvider: clientUser.authProvider,
            },
            roles: access.roleData,
            permissions: access.permissionCodes,
            isTenantAdmin: access.isTenantAdmin,
            isNewRegistration,
            scope: {
              ...scope,
              offices: access.scopeOffices,
            },
            access_token,
            refresh_token,
          },
        ),
      );
    } catch (error) {
      console.error("Google web login error:", error);
      return next(error);
    }
  },

  async mobileGoogleLogin(req: Request, res: Response, next: NextFunction) {
    try {
      const parsed = mobileGoogleSchema.safeParse(req.body);
      if (
        !parsed.success ||
        (!parsed.data.idToken && !parsed.data.accessToken)
      ) {
        return next(
          CustomErrorHandler.badRequest(
            "Valid Google credential and device ID are required",
          ),
        );
      }

      const { idToken, accessToken, deviceId, deviceName, platform } =
        parsed.data;

      const identity = await verifyGoogleCredentials({ idToken, accessToken });
      const { clientUser, scope, isNewRegistration } =
        await resolveOrProvisionGoogleUser(identity);

      const access = await resolveScopeAccess(scope.id);

      const now = Date.now();
      const existingSession = await db.query.mobileSessions.findFirst({
        where: and(
          eq(mobileSessions.userId, clientUser.id),
          eq(mobileSessions.deviceId, deviceId),
        ),
      });

      let sessionId = existingSession?.id;
      if (!sessionId) {
        const active = await db
          .select({ id: mobileSessions.id })
          .from(mobileSessions)
          .where(eq(mobileSessions.userId, clientUser.id))
          .orderBy(asc(mobileSessions.lastUsedAt));
        const overflow = active.length - (MAX_DEVICES_PER_USER - 1);
        if (overflow > 0) {
          await db
            .delete(mobileSessions)
            .where(
              inArray(
                mobileSessions.id,
                active.slice(0, overflow).map((s) => s.id),
              ),
            );
        }
        sessionId = crypto.randomUUID();
      }

      const refresh_token = generateMobileRefreshToken(sessionId);
      const sessionValues = {
        userId: clientUser.id,
        tenantId: scope.tenantId,
        scopeId: scope.id,
        deviceId,
        deviceName: deviceName || null,
        platform: platform || null,
        tokenHash: hashToken(refresh_token),
        prevTokenHash: null,
        prevValidUntil: null,
        lastIp: getClientIp(req),
        userAgent: getUserAgent(req),
        lastUsedAt: new Date(now),
        expiresAt: new Date(now + MOBILE_SESSION_TTL_MS),
        revokedAt: null,
      };

      if (existingSession) {
        await db
          .update(mobileSessions)
          .set(sessionValues)
          .where(eq(mobileSessions.id, existingSession.id));
      } else {
        await db
          .insert(mobileSessions)
          .values({ id: sessionId, ...sessionValues });
      }

      const payload: IUserJwtPayload = {
        userId: clientUser.id,
        tenantId: scope.tenantId!,
        scopeId: scope.id,
        email: clientUser.email,
        roleIds: access.roleIds,
        permissions: access.permissionCodes,
        isTenantAdmin: access.isTenantAdmin,
        portal: "tenant",
        sid: sessionId,
      };

      const access_token = JwtService.sign(payload, ACCESS_EXPIRES);

      return res.status(200).json(
        ResponseHandler(
          200,
          isNewRegistration
            ? "Chamber registered & signed in with Google"
            : "Signed in with Google",
          {
            user: {
              id: clientUser.id,
              name: clientUser.name,
              email: clientUser.email,
              phone: clientUser.phone || null,
              email_verified: clientUser.isEmailVerified,
              phone_verified: clientUser.isPhoneVerified,
              avatar: clientUser.avatar || null,
              isTenantAdmin: access.isTenantAdmin,
              hasPassword: Boolean(clientUser.password),
              authProvider: clientUser.authProvider,
            },
            roles: access.roleData,
            permissions: access.permissionCodes,
            isTenantAdmin: access.isTenantAdmin,
            isNewRegistration,
            scope: { ...scope, offices: access.scopeOffices },
            sessionId,
            access_token,
            refresh_token,
          },
        ),
      );
    } catch (error) {
      console.error("Google mobile login error:", error);
      return next(error);
    }
  },
};

export default googleAuthController;
