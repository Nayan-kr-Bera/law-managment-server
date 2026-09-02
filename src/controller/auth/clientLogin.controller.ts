import { Request, Response, NextFunction } from "express";
import bcrypt from "bcrypt";
import db from "../../db/index.js";
import { eq, and } from "drizzle-orm";
import { clients, clientProfiles } from "../../db/schema/index.js";
import JwtService from "../../utils/jwtServices.js";
import { IClientJwtPayload } from "../../@types/payload.types.js";
import { config } from "../../index.js";

/**
 * Builds a fully-scoped JWT token for a client who has selected
 * (or auto-selected) a specific firm profile.
 */
function buildScopedToken(
  identityId: string,
  email: string,
  profile: { id: string; tenantId: string; officeId: string | null }
) {
  const payload: IClientJwtPayload = {
    clientUserId: identityId,
    clientId: identityId,
    email,
    profileId: profile.id,
    tenantId: profile.tenantId,
    officeId: profile.officeId ?? undefined,
    requiresProfileSelection: false,
  };
  const accessToken = JwtService.sign(payload, "7d", config.ACCESS_SECRET);
  return { accessToken, payload };
}

const clientAuthController = {
  /**
   * POST /client-portal/auth/login
   *
   * Flow:
   *  1. Find client by email (UNIQUE) → verify password
   *  2. Load all client_profiles for this identity
   *  3a. 0 profiles → error (firm must add the client first)
   *  3b. 1 profile → issue full scoped token, auto-select
   *  3c. N profiles → issue a short pre-auth token + return profile list
   *                   → client picks a firm → calls /auth/select-profile
   */
  async login(req: Request, res: Response, next: NextFunction) {
    try {
      const { email, password } = req.body;

      if (!email || !password) {
        return res.status(400).json({
          success: false,
          message: "Email and password are required",
        });
      }

      // Step 1: find client (login credential & identity combined — email is UNIQUE)
      const client = await db.query.clients.findFirst({
        where: eq(clients.email, email),
      });

      if (!client) {
        return res.status(401).json({
          success: false,
          message: "No account found for this email. Please contact your law firm.",
        });
      }

      if (!client.passwordHash) {
        return res.status(401).json({
          success: false,
          message: "Portal login has not been set up for this account. Please contact your law firm.",
        });
      }

      // Step 2: verify password
      const valid = await bcrypt.compare(password, client.passwordHash);
      if (!valid) {
        return res.status(401).json({
          success: false,
          message: "Incorrect password.",
        });
      }

      // Record last login
      await db
        .update(clients)
        .set({ lastLoginAt: new Date() })
        .where(eq(clients.id, client.id));

      const identity = client;

      // Step 3: load all profiles (firm memberships) for this identity
      const profiles = await db.query.clientProfiles.findMany({
        where: eq(clientProfiles.identityId, identity.id),
        with: {
          tenant: true,
          office: true,
        },
      });

      const baseUser = {
        id: identity.id,
        email: identity.email,
        firstName: identity.firstName,
        lastName: identity.lastName ?? "",
        companyName: identity.companyName ?? "",
        phone: identity.phone ?? "",
      };

      // Step 3a: no profiles — firm has not added this client yet
      if (profiles.length === 0) {
        return res.status(403).json({
          success: false,
          message:
            "Your account exists but has not been linked to any law firm yet. Please contact your law firm to add you as a client.",
        });
      }

      // Format profiles, offices, and tenants
      const formattedProfiles = profiles.map((p) => ({
        profileId: p.id,
        tenantId: p.tenantId,
        firmName: p.tenant?.name ?? "Law Firm",
        officeId: p.officeId,
        officeName: p.office?.name ?? "Main Office",
        status: p.status,
      }));

      const officeOptions = profiles.map((p) => ({
        id: p.officeId || p.id,
        name: p.office?.name
          ? `${p.office.name} (${p.tenant?.name || "Law Firm"})`
          : `${p.tenant?.name || "Main Office"}`,
        tenantId: p.tenantId,
        officeId: p.officeId,
        profileId: p.id,
        firmName: p.tenant?.name || "Law Firm",
      }));

      const tenantOptions = Array.from(
        new Map(
          profiles.map((p) => [
            p.tenantId,
            { id: p.tenantId, name: p.tenant?.name || "Law Firm" },
          ])
        ).values()
      );

      // Auto-select first active profile as default scope
      const activeProfile = profiles.find((p) => p.status === "active") || profiles[0];
      const { accessToken } = buildScopedToken(
        identity.id,
        identity.email ?? email,
        activeProfile
      );

      return res.json({
        success: true,
        requiresProfileSelection: false,
        token: accessToken,
        accessToken,
        tenantId: activeProfile.tenantId,
        officeId: activeProfile.officeId,
        user: {
          ...baseUser,
          profileId: activeProfile.id,
          tenantId: activeProfile.tenantId,
          officeId: activeProfile.officeId,
          firmName: activeProfile.tenant?.name ?? "",
          officeName: activeProfile.office?.name ?? "",
        },
        profiles: formattedProfiles,
        offices: officeOptions,
        tenants: tenantOptions,
      });
    } catch (err) {
      next(err);
    }
  },

  /**
   * POST /client-portal/auth/select-profile
   *
   * Called when the client has multiple firm profiles and picks one.
   * Accepts a preAuthToken + profileId → returns a full scoped token.
   */
  async selectProfile(req: Request, res: Response, next: NextFunction) {
    try {
      const { preAuthToken, profileId } = req.body;

      if (!preAuthToken || !profileId) {
        return res.status(400).json({
          success: false,
          message: "preAuthToken and profileId are required",
        });
      }

      // Verify the pre-auth token
      let decoded: IClientJwtPayload;
      try {
        decoded = JwtService.verifyClient(preAuthToken, config.ACCESS_SECRET);
      } catch {
        return res.status(401).json({
          success: false,
          message: "Invalid or expired pre-auth token. Please log in again.",
        });
      }

      if (!decoded.requiresProfileSelection) {
        return res.status(400).json({
          success: false,
          message: "This token does not require profile selection.",
        });
      }

      // Verify the requested profile belongs to this identity
      const profile = await db.query.clientProfiles.findFirst({
        where: eq(clientProfiles.id, profileId),
        with: { tenant: true, office: true },
      });

      if (!profile || profile.identityId !== decoded.clientId) {
        return res.status(403).json({
          success: false,
          message: "Profile not found or does not belong to your account.",
        });
      }

      if (profile.status !== "active") {
        return res.status(403).json({
          success: false,
          message: "This firm profile is inactive. Please contact the law firm.",
        });
      }

      // Load identity for user object
      const identity = await db.query.clients.findFirst({
        where: eq(clients.id, decoded.clientId),
      });

      const { accessToken } = buildScopedToken(
        decoded.clientId,
        decoded.email,
        profile
      );

      return res.json({
        success: true,
        requiresProfileSelection: false,
        accessToken,
        user: {
          id: identity?.id ?? decoded.clientId,
          email: identity?.email ?? decoded.email,
          firstName: identity?.firstName ?? "",
          lastName: identity?.lastName ?? "",
          companyName: profile.companyName ?? identity?.companyName ?? "",
          phone: identity?.phone ?? "",
          profileId: profile.id,
          tenantId: profile.tenantId,
          officeId: profile.officeId,
          firmName: profile.tenant?.name ?? "",
          officeName: profile.office?.name ?? "",
        },
      });
    } catch (err) {
      next(err);
    }
  },

  /**
   * GET /client-portal/profiles
   *
   * Fetches all active firm and branch office engagements for the logged-in client.
   */
  async getProfiles(req: Request, res: Response, next: NextFunction) {
    try {
      const clientId = req.clientUser?.clientId;
      if (!clientId) {
        return res.status(401).json({ success: false, message: "Unauthorized" });
      }

      const profiles = await db.query.clientProfiles.findMany({
        where: eq(clientProfiles.identityId, clientId),
        with: { tenant: true, office: true },
      });

      const formattedProfiles = profiles.map((p) => ({
        profileId: p.id,
        tenantId: p.tenantId,
        firmName: p.tenant?.name ?? "Law Firm",
        officeId: p.officeId,
        officeName: p.office?.name ?? "Main Office",
        status: p.status,
      }));

      const officeOptions = profiles.map((p) => ({
        id: p.officeId || p.id,
        name: p.office?.name
          ? `${p.office.name} (${p.tenant?.name || "Law Firm"})`
          : `${p.tenant?.name || "Main Office"}`,
        tenantId: p.tenantId,
        officeId: p.officeId,
        profileId: p.id,
        firmName: p.tenant?.name || "Law Firm",
      }));

      const tenantOptions = Array.from(
        new Map(
          profiles.map((p) => [
            p.tenantId,
            { id: p.tenantId, name: p.tenant?.name || "Law Firm" },
          ])
        ).values()
      );

      return res.json({
        success: true,
        profiles: formattedProfiles,
        offices: officeOptions,
        tenants: tenantOptions,
      });
    } catch (err) {
      next(err);
    }
  },

  /**
   * POST /client-portal/auth/switch-profile
   *
   * Switches the active law firm profile / office engagement and returns a new scoped token.
   */
  async switchProfile(req: Request, res: Response, next: NextFunction) {
    try {
      const clientId = req.clientUser?.clientId;
      const { profileId, officeId, tenantId } = req.body;

      if (!clientId) {
        return res.status(401).json({ success: false, message: "Unauthorized" });
      }

      let profile = null;
      if (profileId) {
        profile = await db.query.clientProfiles.findFirst({
          where: and(
            eq(clientProfiles.id, profileId),
            eq(clientProfiles.identityId, clientId)
          ),
          with: { tenant: true, office: true },
        });
      } else if (tenantId) {
        profile = await db.query.clientProfiles.findFirst({
          where: and(
            eq(clientProfiles.identityId, clientId),
            eq(clientProfiles.tenantId, tenantId),
            officeId ? eq(clientProfiles.officeId, officeId) : undefined
          ),
          with: { tenant: true, office: true },
        });
      }

      if (!profile) {
        return res.status(404).json({
          success: false,
          message: "Profile / office engagement not found for this client.",
        });
      }

      if (profile.status !== "active") {
        return res.status(403).json({
          success: false,
          message: "This firm profile is inactive. Please contact the law firm.",
        });
      }

      const identity = await db.query.clients.findFirst({
        where: eq(clients.id, clientId),
      });

      const { accessToken } = buildScopedToken(
        clientId,
        identity?.email ?? req.clientUser?.email ?? "",
        profile
      );

      return res.json({
        success: true,
        accessToken,
        token: accessToken,
        tenantId: profile.tenantId,
        officeId: profile.officeId,
        user: {
          id: clientId,
          email: identity?.email ?? req.clientUser?.email,
          firstName: identity?.firstName ?? "",
          lastName: identity?.lastName ?? "",
          companyName: profile.companyName ?? identity?.companyName ?? "",
          phone: identity?.phone ?? "",
          profileId: profile.id,
          tenantId: profile.tenantId,
          officeId: profile.officeId,
          firmName: profile.tenant?.name ?? "",
          officeName: profile.office?.name ?? "",
        },
      });
    } catch (err) {
      next(err);
    }
  },
};

export default clientAuthController;
