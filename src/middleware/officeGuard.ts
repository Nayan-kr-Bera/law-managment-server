import { and, eq } from "drizzle-orm";
import { NextFunction, Request, Response } from "express";

import db from "../db/index.js";
import userScopeOffices from "../db/schema/userscopeoffices.js";
import userScopes from "../db/schema/userScope.js";
import offices from "../db/schema/offices.js";
import { AppError } from "./errorHandler.js";

const officeGuard = async (
  req: Request,
  res: Response,
  next: NextFunction,
) => {
  try {
    if (!req.user) {
      return next(new AppError("Unauthorized", 401));
    }

    const officeId = req.headers["x-office-id"];

    if (!officeId || typeof officeId !== "string") {
      return next(new AppError("Office ID is required", 400));
    }

    const tenantId = req.user.tenantId;
    const userId = req.user.userId;

    if (!tenantId) {
      return next(new AppError("Tenant context is missing", 400));
    }

    /**
     * Verify:
     *
     * 1. Office belongs to the requested tenant
     * 2. User has a scope for that tenant
     * 3. That scope has access to this office
     */
    const access = await db
      .select({
        officeId: offices.id,
        tenantId: offices.tenantId,
        userScopeId: userScopes.id,
      })
      .from(userScopeOffices)
      .innerJoin(
        userScopes,
        eq(userScopeOffices.userScopeId, userScopes.id),
      )
      .innerJoin(
        offices,
        eq(userScopeOffices.officeId, offices.id),
      )
      .where(
        and(
          eq(userScopes.userId, userId),
          eq(userScopes.tenantId, tenantId),
          eq(userScopeOffices.officeId, officeId),
          eq(offices.tenantId, tenantId),
          eq(offices.isActive, true),
        ),
      )
      .limit(1);

    if (access.length === 0) {
      return next(
        new AppError(
          "You do not have access to this office",
          403,
        ),
      );
    }

    /**
     * Store the verified office context
     * so controllers don't have to read x-office-id again.
     */
    req.officeId = access[0].officeId;

    next();
  } catch (error) {
    return next(error);
  }
};

export default officeGuard;