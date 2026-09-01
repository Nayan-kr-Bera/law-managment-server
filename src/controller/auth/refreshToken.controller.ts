import { NextFunction, Request, Response } from "express";
import { eq } from "drizzle-orm";
import db from "../../db/index.js";
import users from "../../db/schema/users.js";
import refreshTokens from "../../db/schema/refreshToken.js";
import JwtService from "../../utils/jwtServices.js";
import CustomErrorHandler from "../../utils/customErrorHandler.js";
import ResponseHandler from "../../utils/responseHandler.js";

import { config } from "../../config/index.js";
import { refreshSchema } from "../../validators/auth/refreshtokan.validetor.js";
import userScopes from "../../db/schema/userScope.js";

const refreshController = {
  async refresh(req: Request, res: Response, next: NextFunction) {
    try {
      const parsed = refreshSchema.safeParse(req.body);

      if (!parsed.success) {
        return next(parsed.error);
      }

      const { refresh_token } = parsed.data;

      // console.log("refresh_token", refresh_token);

      const tokenDoc = await db.query.refreshTokens.findFirst({
        where: eq(refreshTokens.token, refresh_token),
      });

      // console.log("DB:", tokenDoc?.token);

      if (!tokenDoc) {
        return next(CustomErrorHandler.unAuthorized("Invalid refresh token"));
      }

      const decoded = JwtService.verify(refresh_token, config.REFRESH_SECRET);

      const userId = decoded.userId;

      const user = await db.query.user.findFirst({
        where: eq(users.id, userId),
      });

      if (!user) {
        return next(CustomErrorHandler.unAuthorized("User not found"));
      }

      // Default Scope
      const scope = await db.query.userScopes.findFirst({
        where: eq(userScopes.userId, user.id),
      });

      if (!scope) {
        return next(CustomErrorHandler.unAuthorized("No user scope found"));
      }

      const payload = {
        userId: user.id,
        tenantId: scope.tenantId!,
        scopeId: scope.id,
        email: user.email,
      };

      const access_token = JwtService.sign(payload);

      const new_refresh_token = JwtService.sign(
        payload,
        "1y",
        config.REFRESH_SECRET,
      );

      await db
        .update(refreshTokens)
        .set({
          token: new_refresh_token,
        })
        .where(eq(refreshTokens.token, refresh_token));

      return res.status(200).send(
        ResponseHandler(200, "success", {
          access_token,
          refresh_token: new_refresh_token,
        }),
      );
    } catch (error) {
      return next(error);
    }
  },
};

export default refreshController;
