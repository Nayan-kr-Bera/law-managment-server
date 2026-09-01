import { NextFunction, Request, Response } from "express";
import { eq } from "drizzle-orm";
import { refreshSchema } from "../../validators/auth/refreshtokan.validetor.js";
import refreshTokens from "../../db/schema/refreshToken.js";
import db from "../../db/index.js";
import ResponseHandler from "../../utils/responseHandler.js";


const logoutController = {
  async logout(req: Request, res: Response, next: NextFunction) {
    const parsed = refreshSchema.safeParse(req.body);
    if (!parsed.success) {
      return next(parsed.error);
    }
    try {
      await db
        .delete(refreshTokens)
        .where(eq(refreshTokens.token, parsed.data.refresh_token));
      return res.status(200).send(ResponseHandler(200, "Logout successfull"));
    } catch (err) {
      return next(new Error("Something went wrong in the database"));
    }
  },
};

export default logoutController;
