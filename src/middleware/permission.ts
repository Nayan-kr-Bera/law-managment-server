import { NextFunction, Request, Response } from "express";
import { AppError } from "./errorHandler.js";

export const permissionGuard =
  (...requiredPermissions: string[]) =>
  (req: Request, res: Response, next: NextFunction) => {
    if (!req.user) {
      return next(new AppError("Unauthorized", 401));
    }

    if (req.user.isSuperAdmin) {
      return next();
    }

    const userPermissions = req.user?.permissions || [];

    const hasPermission = requiredPermissions.every((permission) =>
      userPermissions.includes(permission)
    );

    if (!hasPermission) {
      return next(new AppError("Forbidden", 403));
    }

    next();
  };