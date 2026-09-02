import { NextFunction, Request, Response } from "express";
import jwt from "jsonwebtoken";
import db from "../db/index.js";
import clients from "../db/schema/clients/clients.js";
import clientProfiles from "../db/schema/clients/clientProfiles.js";
import { eq } from "drizzle-orm";
import JwtService from "../utils/jwtServices.js";
import { AppError } from "./errorHandler.js";
import { IClientJwtPayload } from "../@types/payload.types.js";

const clientAuth = async (
  req: Request,
  res: Response,
  next: NextFunction,
) => {
  try {
    const authHeader = req.headers.authorization;

    if (!authHeader || !authHeader.startsWith("Bearer ")) {
      throw new AppError("Unauthorized Client", 401);
    }

    const token = authHeader.split(" ")[1];
    const decoded = JwtService.verifyClient(token);

    if (!decoded || (!decoded.clientUserId && !decoded.clientId)) {
      throw new AppError("Invalid client token payload", 401);
    }

    // Reject pre-auth tokens on protected routes
    if (decoded.requiresProfileSelection) {
      throw new AppError(
        "Profile selection required. Please call /auth/select-profile first.",
        403,
      );
    }

    // Verify the client record still exists
    const targetClientId = decoded.clientId || decoded.clientUserId;
    if (targetClientId) {
      const existingClient = await db.query.clients.findFirst({
        where: eq(clients.id, targetClientId),
      });

      if (!existingClient) {
        throw new AppError("Client account not found", 401);
      }
    }

    // Verify the selected profile is still active
    if (decoded.profileId) {
      const profile = await db.query.clientProfiles.findFirst({
        where: eq(clientProfiles.id, decoded.profileId),
      });

      if (!profile) {
        throw new AppError("Client firm profile not found", 401);
      }

      if (profile.status !== "active") {
        throw new AppError(
          "Your access to this law firm has been deactivated. Please contact the firm.",
          403,
        );
      }

      // Ensure profile belongs to the identity in the token
      if (profile.identityId !== decoded.clientId) {
        throw new AppError("Token profile mismatch", 401);
      }
    }

    req.clientUser = decoded;

    // Forward tenant/office from token or request headers (sent by client portal)
    const headerTenantId = req.headers["x-tenant-id"] as string | undefined;
    const headerOfficeId = req.headers["x-office-id"] as string | undefined;

    req.tenantId = headerTenantId || decoded.tenantId;
    req.officeId = headerOfficeId || decoded.officeId;

    next();
  } catch (err) {
    if (
      err instanceof jwt.TokenExpiredError ||
      err instanceof jwt.JsonWebTokenError
    ) {
      return next(new AppError("Unauthorized Client Token", 401));
    }

    return next(err);
  }
};

export default clientAuth;
