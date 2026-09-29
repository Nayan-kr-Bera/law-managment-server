import { NextFunction, Request, Response } from "express";
import { AppError } from "./errorHandler.js";

/**
 * Tenant Client Portal Permission Guard
 * Used for law firm client routes (/api/cases, /api/documents, etc.)
 */
export const permissionGuard =
  (...requiredPermissions: string[]) =>
    (req: Request, res: Response, next: NextFunction) => {
      if (!req.user) {
        return next(new AppError("Unauthorized", 401));
      }

      // Tenant Admin has complete authority over the law firm workspace
      if (req.user.isTenantAdmin) {
        return next();
      }

      const userPermissions = req.user?.permissions || [];
      const hasPermission = requiredPermissions.every((permission) =>
        userPermissions.includes(permission)
      );

      if (!hasPermission) {
        return next(new AppError("Forbidden: Insufficient chamber permissions", 403));
      }

      next();
    };

/**
 * Admin Console Permission Guard
 * Used for platform admin routes (/api/admin/*)
 */
export const adminPermissionGuard =
  (...requiredPermissions: string[]) =>
    (req: Request, res: Response, next: NextFunction) => {
      const adminUser = req.adminUser;

      if (!adminUser) {
        return next(new AppError("Unauthorized: Admin credentials required", 401));
      }

      // Super Admin has unrestricted access to the entire Admin Console
      if (adminUser.isSuperAdmin) {
        return next();
      }

      const adminPermissions = adminUser.permissions || [];
      const hasPermission = requiredPermissions.every((permission) =>
        adminPermissions.includes(permission)
      );

      if (!hasPermission) {
        return next(new AppError("Forbidden: Insufficient administrative privileges", 403));
      }

      next();
    };