import { NextFunction, Request, Response } from "express";
import { AppError } from "./errorHandler.js";

export const permissionGuard =
  (...requiredPermissions: string[]) =>
    (req: Request, res: Response, next: NextFunction) => {
      if (!req.user) {
        return next(new AppError("Unauthorized", 401));
      }

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

export const adminPermissionGuard =
  (...requiredPermissions: string[]) =>
    (req: Request, res: Response, next: NextFunction) => {
      const adminUser = req.adminUser;

      if (!adminUser) {
        return next(new AppError("Unauthorized: Admin credentials required", 401));
      }

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
