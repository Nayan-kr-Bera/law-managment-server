import { NextFunction, Request, Response } from "express";
import { AppError } from "./errorHandler.js";

export const permissionGuard =
  (...requiredPermissions: string[]) =>
  (req: Request, res: Response, next: NextFunction) => {
    console.log("[permissionGuard] Checking permissions:", {
      path: req.originalUrl || req.url,
      method: req.method,
      userId: req.user?.userId || req.user?.id,
      isSuperAdmin: req.user?.isSuperAdmin,
      requiredPermissions,
      userPermissions: req.user?.permissions,
    });

    if (!req.user) {
      console.warn("[permissionGuard] 401 Unauthorized: req.user is undefined");
      return next(new AppError("Unauthorized", 401));
    }

    if (req.user.isSuperAdmin) {
      console.log("[permissionGuard] Super admin bypass granted");
      return next();
    }

    const userPermissions = req.user?.permissions || [];

    const hasPermission = requiredPermissions.every((permission) =>
      userPermissions.includes(permission)
    );

    if (!hasPermission) {
      console.warn("[permissionGuard] 403 Forbidden! Missing permissions:", {
        required: requiredPermissions,
        userHas: userPermissions,
      });
      return next(new AppError("Forbidden", 403));
    }

    console.log("[permissionGuard] Permission check passed successfully");
    next();
  };