import { Request, Response, NextFunction } from "express";
import { eq } from "drizzle-orm";
import db from "../../db/index.js";
import { permissions } from "../../db/schema/index.js";
import ResponseHandler from "../../utils/responseHandler.js";
import CustomErrorHandler from "../../utils/customErrorHandler.js";

const permissionController = {
  async getPermission(req: Request, res: Response, next: NextFunction) {
    try {
      const isAdminPortalQuery = req.query.isAdminPortal === "true" || req.query.portal === "admin";

      const permissionList = await db.query.permissions.findMany({
        where: eq(permissions.isAdminPortal, isAdminPortalQuery),
        columns: {
          code: true,
          description: true,
          isAdminPortal: true,
        },
      });

      return res
        .status(200)
        .send(ResponseHandler(200, "Permissions fetched successfully", permissionList));
    } catch (error) {
      console.log(error);
      return next(CustomErrorHandler.serverError());
    }
  },
};

export default permissionController;
