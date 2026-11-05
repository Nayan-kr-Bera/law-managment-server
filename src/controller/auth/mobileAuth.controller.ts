import bcrypt from "bcrypt";
import crypto from "crypto";
import { and, asc, eq, inArray } from "drizzle-orm";
import { NextFunction, Request, Response } from "express";
import { z } from "zod";

import db from "../../db/index.js";
import {
  mobileSessions,
  offices,
  permissions,
  rolePermissions,
  roles,
  user,
  userPermissions,
  userRoles,
  userScopeOffices,
  userScopes,
} from "../../db/schema/index.js";

import ResponseHandler from "../../utils/responseHandler.js";
import CustomErrorHandler from "../../utils/customErrorHandler.js";
import JwtService from "../../utils/jwtServices.js";
import { IUserJwtPayload } from "../../@types/payload.types.js";
import emailOtpService from "../../services/emailOtp.service.js";

const ACCESS_EXPIRES = "15m";
const SESSION_TTL_MS = 30 * 24 * 60 * 60 * 1000;
const MAX_DEVICES_PER_USER = 5;
const ROTATION_GRACE_MS = 60 * 1000;

const deviceSchema = z.object({
  deviceId: z.string().trim().min(8).max(128),
  deviceName: z.string().trim().max(255).optional(),
  platform: z.string().trim().max(32).optional(),
});

const loginSchema = deviceSchema.extend({
  email: z.string().trim().min(1),
  password: z.string().min(1),
});

const refreshSchema = z.object({
  refresh_token: z.string().min(10),
  deviceId: z.string().trim().min(8).max(128),
});

const hashToken = (token: string) =>
  crypto.createHash("sha256").update(token).digest("hex");

const safeEqual = (a: string, b: string) => {
  const ba = Buffer.from(a);
  const bb = Buffer.from(b);
  return ba.length === bb.length && crypto.timingSafeEqual(ba, bb);
};

const generateRefreshToken = (sessionId: string) =>
  `${sessionId}.${crypto.randomBytes(48).toString("base64url")}`;

const getClientIp = (req: Request) => {
  const fwd = req.headers["x-forwarded-for"];
  const ip = (Array.isArray(fwd) ? fwd[0] : fwd?.split(",")[0]) || req.ip || "";
  return String(ip).trim().slice(0, 64);
};

const getUserAgent = (req: Request) =>
  String(req.headers["user-agent"] || "").slice(0, 512);

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
          .select({ code: permissions.code, isAdminPortal: permissions.isAdminPortal })
          .from(rolePermissions)
          .innerJoin(permissions, eq(rolePermissions.permissionId, permissions.id))
          .where(inArray(rolePermissions.roleId, roleIds))
      : [];

  const userPermissionData = await db
    .select({ code: permissions.code, isAdminPortal: permissions.isAdminPortal })
    .from(userPermissions)
    .innerJoin(permissions, eq(userPermissions.permissionId, permissions.id))
    .where(eq(userPermissions.scopeId, scopeId));

  let permissionCodes = [
    ...new Set([
      ...rolePermissionData.filter((p) => !p.isAdminPortal).map((p) => p.code),
      ...userPermissionData.filter((p) => !p.isAdminPortal).map((p) => p.code),
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

function signAccessToken(args: {
  userId: string;
  tenantId: string;
  scopeId: string;
  email: string;
  roleIds: string[];
  permissions: string[];
  sid: string;
}) {
  const payload: IUserJwtPayload = {
    userId: args.userId,
    tenantId: args.tenantId,
    scopeId: args.scopeId,
    email: args.email,
    roleIds: args.roleIds,
    permissions: args.permissions,
    portal: "tenant",
    sid: args.sid,
  };
  return JwtService.sign(payload, ACCESS_EXPIRES);
}

const mobileAuthController = {
  async login(req: Request, res: Response, next: NextFunction) {
    try {
      const parsed = loginSchema.safeParse(req.body);
      if (!parsed.success) {
        return next(
          CustomErrorHandler.wrongCredentials(
            "Please enter email, password and a valid device id",
          ),
        );
      }
      const { email, password, deviceId, deviceName, platform } = parsed.data;

      const clientUser = await db.query.user.findFirst({
        where: eq(user.email, email),
      });
      if (!clientUser) {
        return next(CustomErrorHandler.wrongCredentials("Email or password is incorrect"));
      }

      const isMatch = await bcrypt.compare(password, clientUser.password);
      if (!isMatch) {
        return next(CustomErrorHandler.wrongCredentials("Email or password is incorrect"));
      }

      if (!clientUser.isEmailVerified) {
        await emailOtpService({
          id: clientUser.id,
          email: clientUser.email,
          userName: clientUser.name,
          purpose: "account sign-in verification",
        });
        return res.status(403).json(
          ResponseHandler(403, "Email verification required", {
            requireVerification: true,
            email: clientUser.email,
          }),
        );
      }

      const scope = await db.query.userScopes.findFirst({
        where: and(eq(userScopes.userId, clientUser.id), eq(userScopes.isDefault, true)),
      });
      if (!scope) {
        return next(
          CustomErrorHandler.notFound("No active law firm workspace found for this account"),
        );
      }

      const access = await resolveScopeAccess(scope.id);

      const now = Date.now();
      const existing = await db.query.mobileSessions.findFirst({
        where: and(
          eq(mobileSessions.userId, clientUser.id),
          eq(mobileSessions.deviceId, deviceId),
        ),
      });

      let sessionId = existing?.id;
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

      const refresh_token = generateRefreshToken(sessionId);
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
        expiresAt: new Date(now + SESSION_TTL_MS),
        revokedAt: null,
      };

      if (existing) {
        await db
          .update(mobileSessions)
          .set(sessionValues)
          .where(eq(mobileSessions.id, existing.id));
      } else {
        await db.insert(mobileSessions).values({ id: sessionId, ...sessionValues });
      }

      const access_token = signAccessToken({
        userId: clientUser.id,
        tenantId: scope.tenantId!,
        scopeId: scope.id,
        email: clientUser.email,
        roleIds: access.roleIds,
        permissions: access.permissionCodes,
        sid: sessionId,
      });

      return res.status(200).json(
        ResponseHandler(200, "Login successful", {
          user: {
            id: clientUser.id,
            name: clientUser.name,
            email: clientUser.email,
            phone: clientUser.phone || null,
            email_verified: clientUser.isEmailVerified,
            phone_verified: clientUser.isPhoneVerified,
            avatar: clientUser.avatar || null,
            isTenantAdmin: access.isTenantAdmin,
          },
          roles: access.roleData,
          permissions: access.permissionCodes,
          isTenantAdmin: access.isTenantAdmin,
          scope: { ...scope, offices: access.scopeOffices },
          sessionId,
          access_token,
          refresh_token,
        }),
      );
    } catch (error) {
      console.error(error);
      return next(CustomErrorHandler.serverError());
    }
  },

  async refresh(req: Request, res: Response, next: NextFunction) {
    try {
      const parsed = refreshSchema.safeParse(req.body);
      if (!parsed.success) {
        return next(CustomErrorHandler.unAuthorized("Invalid refresh request"));
      }
      const { refresh_token, deviceId } = parsed.data;

      const sessionId = refresh_token.split(".")[0];
      if (!/^[0-9a-f-]{36}$/i.test(sessionId)) {
        return next(CustomErrorHandler.unAuthorized("Invalid refresh token"));
      }

      const session = await db.query.mobileSessions.findFirst({
        where: eq(mobileSessions.id, sessionId),
      });

      if (!session || session.revokedAt || session.deviceId !== deviceId) {
        return next(CustomErrorHandler.unAuthorized("Session is no longer valid"));
      }

      const now = Date.now();
      if (session.expiresAt.getTime() < now) {
        return next(CustomErrorHandler.unAuthorized("Session expired. Please sign in again."));
      }

      const presentedHash = hashToken(refresh_token);
      const matchesCurrent = safeEqual(presentedHash, session.tokenHash);
      const matchesPrevious =
        !!session.prevTokenHash && safeEqual(presentedHash, session.prevTokenHash);
      const inGrace =
        matchesPrevious &&
        !!session.prevValidUntil &&
        session.prevValidUntil.getTime() >= now;

      if (!matchesCurrent && !inGrace) {
        await db.delete(mobileSessions).where(eq(mobileSessions.id, session.id));
        return next(CustomErrorHandler.unAuthorized("Session is no longer valid"));
      }

      const clientUser = await db.query.user.findFirst({
        where: eq(user.id, session.userId),
      });
      if (!clientUser || !clientUser.isEmailVerified) {
        await db.delete(mobileSessions).where(eq(mobileSessions.id, session.id));
        return next(CustomErrorHandler.unAuthorized("User not found"));
      }

      let scope = session.scopeId
        ? await db.query.userScopes.findFirst({
            where: and(
              eq(userScopes.id, session.scopeId),
              eq(userScopes.userId, session.userId),
            ),
          })
        : undefined;
      if (!scope) {
        scope = await db.query.userScopes.findFirst({
          where: and(eq(userScopes.userId, session.userId), eq(userScopes.isDefault, true)),
        });
      }
      if (!scope) {
        return next(CustomErrorHandler.unAuthorized("No user scope found"));
      }

      const access = await resolveScopeAccess(scope.id);

      const new_refresh_token = generateRefreshToken(session.id);
      await db
        .update(mobileSessions)
        .set({
          tokenHash: hashToken(new_refresh_token),
          prevTokenHash: presentedHash,
          prevValidUntil: new Date(now + ROTATION_GRACE_MS),
          scopeId: scope.id,
          tenantId: scope.tenantId,
          lastIp: getClientIp(req),
          userAgent: getUserAgent(req),
          lastUsedAt: new Date(now),
          expiresAt: new Date(now + SESSION_TTL_MS),
        })
        .where(eq(mobileSessions.id, session.id));

      const access_token = signAccessToken({
        userId: clientUser.id,
        tenantId: scope.tenantId!,
        scopeId: scope.id,
        email: clientUser.email,
        roleIds: access.roleIds,
        permissions: access.permissionCodes,
        sid: session.id,
      });

      return res.status(200).json(
        ResponseHandler(200, "success", {
          access_token,
          refresh_token: new_refresh_token,
        }),
      );
    } catch (error) {
      console.error(error);
      return next(CustomErrorHandler.serverError());
    }
  },

  async logout(req: Request, res: Response, next: NextFunction) {
    try {
      const parsed = refreshSchema.safeParse(req.body);
      if (parsed.success) {
        const sessionId = parsed.data.refresh_token.split(".")[0];
        if (/^[0-9a-f-]{36}$/i.test(sessionId)) {
          const session = await db.query.mobileSessions.findFirst({
            where: eq(mobileSessions.id, sessionId),
          });
          if (
            session &&
            session.deviceId === parsed.data.deviceId &&
            (safeEqual(hashToken(parsed.data.refresh_token), session.tokenHash) ||
              (!!session.prevTokenHash &&
                safeEqual(hashToken(parsed.data.refresh_token), session.prevTokenHash)))
          ) {
            await db.delete(mobileSessions).where(eq(mobileSessions.id, session.id));
          }
        }
      }
      return res.status(200).json(ResponseHandler(200, "Logout successful"));
    } catch (error) {
      console.error(error);
      return next(CustomErrorHandler.serverError());
    }
  },

  async listSessions(req: Request, res: Response, next: NextFunction) {
    try {
      const userId = req.user?.userId;
      if (!userId) return next(CustomErrorHandler.unAuthorized());

      const rows = await db
        .select({
          id: mobileSessions.id,
          deviceName: mobileSessions.deviceName,
          platform: mobileSessions.platform,
          lastIp: mobileSessions.lastIp,
          lastUsedAt: mobileSessions.lastUsedAt,
          createdAt: mobileSessions.createdAt,
        })
        .from(mobileSessions)
        .where(eq(mobileSessions.userId, userId))
        .orderBy(asc(mobileSessions.createdAt));

      const currentSid = (req.user as IUserJwtPayload).sid;
      return res.status(200).json(
        ResponseHandler(200, "Sessions fetched", {
          sessions: rows.map((r) => ({ ...r, isCurrent: r.id === currentSid })),
        } as object),
      );
    } catch (error) {
      console.error(error);
      return next(CustomErrorHandler.serverError());
    }
  },

  async revokeSession(req: Request, res: Response, next: NextFunction) {
    try {
      const userId = req.user?.userId;
      if (!userId) return next(CustomErrorHandler.unAuthorized());

      const id = String(req.params.id);
      await db
        .delete(mobileSessions)
        .where(and(eq(mobileSessions.id, id), eq(mobileSessions.userId, userId)));

      return res.status(200).json(ResponseHandler(200, "Device signed out"));
    } catch (error) {
      console.error(error);
      return next(CustomErrorHandler.serverError());
    }
  },
};

export default mobileAuthController;
