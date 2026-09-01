import { Request, Response, NextFunction } from "express";
import db from "../../db/index.js";
import ResponseHandler from "../../utils/responseHandler.js";
import CustomErrorHandler from "../../utils/customErrorHandler.js";

const permissionController = {
  async getPermission(req: Request, res: Response, next: NextFunction) {
    try {
      const permissions = await db.query.permissions.findMany({
        columns: {
          code: true,
          description: true,
        },
      });
      return res
        .status(200)
        .send(ResponseHandler(200, "Roles fetched successfully", permissions));
    } catch (error) {
      console.log(error);
      return next(CustomErrorHandler.serverError());
    }
  },
};
export default permissionController;
