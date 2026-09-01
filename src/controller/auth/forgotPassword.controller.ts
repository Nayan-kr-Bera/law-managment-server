import bcrypt from "bcrypt";
import { NextFunction, Request, Response } from "express";
import { and, eq } from "drizzle-orm";
import users from "../../db/schema/users.js";
import {
  changePasswordSchema,
  UpdatePasswordSchema,
} from "../../validators/auth/password.validator.js";
import db from "../../db/index.js";
import ResponseHandler from "../../utils/responseHandler.js";
import emailOtp from "../../db/schema/emailOtp.js";
import { config } from "../../config/index.js";
import { validate } from "../../utils/validate.js";

const forgotPasswordController = {
  async changePassword(req: Request, res: Response, next: NextFunction) {
    const parsed = validate(changePasswordSchema, req.body);
    if (!parsed.success) {
      return res.status(400).send(ResponseHandler(400, parsed.message));
    }

    const { email, otp, password } = parsed.data;

    try {
      const userRes = await db.query.user.findFirst({
        where: eq(users.email, email),
      });
      if (!userRes) {
        return res.status(404).send(ResponseHandler(404, "User not found"));
      }

      const otpEntry = await db.query.emailOtp.findFirst({
        where: and(eq(emailOtp.userId, userRes.id), eq(emailOtp.otp, otp)),
      });

      if (!otpEntry) {
        return res.status(400).send(ResponseHandler(400, "Invalid OTP"));
      }

      if (Number(otpEntry.expiresAt) < Date.now()) {
        await db.delete(emailOtp).where(eq(emailOtp.userId, userRes.id));
        return res
          .status(401)
          .send(ResponseHandler(401, "Generated OTP is expired, resend now"));
      }
      // Hash the new password
      const hashedPassword = await bcrypt.hash(password, Number(config.SALT));

      await db.transaction(async (tx) => {
        await tx
          .update(users)
          .set({ password: hashedPassword })
          .where(eq(users.id, userRes.id));

        await tx.delete(emailOtp).where(eq(emailOtp.userId, userRes.id));
      });

      return res
        .status(200)
        .send(ResponseHandler(200, "Password updated successfully"));
    } catch (error) {
      next(error);
    }
  },

  async updatePassword(req: Request, res: Response, next: NextFunction) {
    const parsed = UpdatePasswordSchema.safeParse(req.body);
    if (!parsed.success) {
      return next(parsed.error);
    }
    const userId = req.user.userId;
    if (!userId) {
      return res.status(404).send(ResponseHandler(404, "User Id not found"));
    }
    const { current_password, password } = req.body;
    try {
      // Find the user by email
      const userRes = await db.query.user.findFirst({
        where: eq(users.id, userId),
      });
      if (!userRes) {
        return res.status(404).send(ResponseHandler(404, "User not found"));
      }

      // Check if the current password is correct
      const isMatch = await bcrypt.compare(
        current_password,
        userRes?.password!,
      );
      if (!isMatch) {
        return res
          .status(200)
          .send(ResponseHandler(200, "Incorrect current password"));
      }

      // Hash the new password

      const hashedPassword = await bcrypt.hash(password, Number(config.SALT));

      // Update the user's password

      await db
        .update(users)
        .set({ password: hashedPassword })
        .where(eq(users.id, userId));

      return res.status(200).send(ResponseHandler(200, "success"));
    } catch (error) {
      next(error);
    }
  },
};

export default forgotPasswordController;
