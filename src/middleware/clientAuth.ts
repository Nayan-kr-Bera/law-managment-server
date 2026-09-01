import { NextFunction, Request, Response } from "express";
import jwt from "jsonwebtoken";
import db from "../db/index.js";
import clientUsers from "../db/schema/clients/clientUsers.js";
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
    const decoded = JwtService.verify(token) as unknown as IClientJwtPayload;

    if (!decoded || (!decoded.clientUserId && !decoded.clientId)) {
      throw new AppError("Invalid client token payload", 401);
    }

    if (decoded.clientUserId) {
      const existingClientUser = await db.query.clientUsers.findFirst({
        where: eq(clientUsers.id, decoded.clientUserId),
        with: {
          client: true,
        },
      });

      if (!existingClientUser) {
        throw new AppError("Client account not found", 401);
      }
    }

    req.clientUser = decoded;

    const tenantHeader = req.headers["x-tenant-id"];
    const officeHeader = req.headers["x-office-id"];
    if (typeof tenantHeader === "string") req.tenantId = tenantHeader;
    if (typeof officeHeader === "string") req.officeId = officeHeader;

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
