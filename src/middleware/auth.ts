import { NextFunction, Request, Response } from "express";
import { eq } from "drizzle-orm";
import jwt from "jsonwebtoken";
import db from "../db/index.js";
import users from "../db/schema/users.js";

import JwtService from "../utils/jwtServices.js";
import { AppError } from "./errorHandler.js";
import { IUserJwtPayload } from "../@types/payload.types.js";

const auth = async (
  req: Request,
  res: Response,
  next: NextFunction,
) => {
  try {
    const authHeader = req.headers.authorization;

    if (!authHeader || !authHeader.startsWith("Bearer ")) {
      throw new AppError("Unauthorized User", 401);
    }

    const token = authHeader.split(" ")[1];

    const decoded = JwtService.verify(token) as IUserJwtPayload;

    // Check user still exists
    const existingUser = await db.query.user.findFirst({
      where: eq(users.id, decoded.userId),
    });

    if (!existingUser) {
      throw new AppError("User not found", 401);
    }

    // Check email verification
    if (!existingUser.isEmailVerified) {
      throw new AppError("Email not verified", 403);
    }

    req.user = decoded;

    next();
  } catch (err) {
  if (
    err instanceof jwt.TokenExpiredError ||
    err instanceof jwt.JsonWebTokenError
  ) {
    return next(new AppError("Unauthorized", 401));
  }

  return next(err);
}
};

export default auth;