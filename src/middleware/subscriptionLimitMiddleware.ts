import { count, eq } from "drizzle-orm";
import { NextFunction, Request, Response } from "express";

import db from "../db/index.js";

import users from "../db/schema/users.js";
import offices from "../db/schema/offices.js";
import tenants from "../db/schema/tenants.js";
import userScopes from "../db/schema/userScope.js";

import CustomErrorHandler from "../utils/customErrorHandler.js";

const BYTES_PER_GB = 1024 * 1024 * 1024;

const subscriptionLimitMiddleware = {
  // ============================================================
  // USER LIMIT
  // ============================================================

  async checkUserLimit(req: Request, res: Response, next: NextFunction) {
    try {
      if (req.user?.isSuperAdmin) {
        return next();
      }

      const tenantId = req.user?.tenantId;

      if (!tenantId) {
        return next(
          CustomErrorHandler.badRequest("Tenant information is missing"),
        );
      }

      if (!req.subscription) {
        return next(
          CustomErrorHandler.forbidden("Active subscription required"),
        );
      }

      if (req.subscription.planCode === "internal") {
        return next();
      }

      const result = await db
        .select({
          count: count(),
        })
        .from(users)
        .innerJoin(userScopes, eq(userScopes.userId, users.id))
        .where(eq(userScopes.tenantId, tenantId));

      const currentUsers = Number(result[0]?.count ?? 0);

      if (currentUsers >= req.subscription.maxUsers) {
        return next(
          CustomErrorHandler.forbidden(
            `User limit reached. Your ${req.subscription.planName} plan allows maximum ${req.subscription.maxUsers} users.`,
          ),
        );
      }

      return next();
    } catch (error) {
      console.error("User subscription limit error:", error);

      return next(CustomErrorHandler.serverError());
    }
  },

  // ============================================================
  // OFFICE LIMIT
  // ============================================================

  async checkOfficeLimit(req: Request, res: Response, next: NextFunction) {
    try {
      if (req.user?.isSuperAdmin) {
        return next();
      }

      const tenantId = req.user?.tenantId;

      if (!tenantId) {
        return next(
          CustomErrorHandler.badRequest("Tenant information is missing"),
        );
      }

      if (!req.subscription) {
        return next(
          CustomErrorHandler.forbidden("Active subscription required"),
        );
      }

      if (req.subscription.planCode === "internal") {
        return next();
      }

      const result = await db
        .select({
          count: count(),
        })
        .from(offices)
        .where(eq(offices.tenantId, tenantId));

      const currentOffices = Number(result[0]?.count ?? 0);

      if (currentOffices >= req.subscription.maxOffices) {
        return next(
          CustomErrorHandler.forbidden(
            `Office limit reached. Your ${req.subscription.planName} plan allows maximum ${req.subscription.maxOffices} offices.`,
          ),
        );
      }

      return next();
    } catch (error) {
      console.error("Office subscription limit error:", error);

      return next(CustomErrorHandler.serverError());
    }
  },

  // ============================================================
  // STORAGE LIMIT
  // ============================================================

  async checkStorageLimit(req: Request, res: Response, next: NextFunction) {
    try {
      // Super admin bypass
      if (req.user?.isSuperAdmin) {
        return next();
      }

      const tenantId = req.user?.tenantId;

      if (!tenantId) {
        return next(
          CustomErrorHandler.badRequest("Tenant information is missing"),
        );
      }

      // Subscription must already be attached
      // by your subscription middleware
      if (!req.subscription) {
        return next(
          CustomErrorHandler.forbidden("Active subscription required"),
        );
      }

      // Internal plan = unlimited
      if (req.subscription.planCode === "internal") {
        return next();
      }

      // Multer must execute before this middleware
      if (!req.file) {
        return next(
          CustomErrorHandler.badRequest("File is required"),
        );
      }

      const tenant = await db.query.tenants.findFirst({
        where: eq(tenants.id, tenantId),
        columns: {
          storageUsedBytes: true,
        },
      });

      if (!tenant) {
        return next(
          CustomErrorHandler.notFound("Tenant not found"),
        );
      }

      const currentStorageBytes = Number(
        tenant.storageUsedBytes ?? 0,
      );

      const fileSize = req.file.size;

      const maxStorageBytes =
        req.subscription.maxStorageGb * BYTES_PER_GB;

      const newStorageBytes =
        currentStorageBytes + fileSize;

      if (newStorageBytes > maxStorageBytes) {
        const currentStorageGb =
          currentStorageBytes / BYTES_PER_GB;

        const fileSizeMb =
          fileSize / (1024 * 1024);

        return next(
          CustomErrorHandler.forbidden(
            `Storage limit reached. Your ${req.subscription.planName} plan allows ${req.subscription.maxStorageGb} GB. Current usage is ${currentStorageGb.toFixed(2)} GB and this file is ${fileSizeMb.toFixed(2)} MB.`,
          ),
        );
      }

      return next();
    } catch (error) {
      console.error(
        "Storage subscription limit error:",
        error,
      );

      return next(
        CustomErrorHandler.serverError(),
      );
    }
  },
};

export default subscriptionLimitMiddleware;