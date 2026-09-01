import { eq } from "drizzle-orm";
import { Request, NextFunction, Response } from "express";
import CustomErrorHandler from "../../utils/customErrorHandler.js";
import emailOtp from "../../db/schema/emailOtp.js";
import db from "../../db/index.js";
import ResponseHandler from "../../utils/responseHandler.js";
import users from "../../db/schema/users.js";
import emailOtpService from "../../services/emailOtp.service.js";

const emailVerificationController = {
  async verifyOtp(req: Request, res: Response, next: NextFunction) {
    try {
      const { email, otp } = req.body;

      if (!email || !otp) {
        return next(
          CustomErrorHandler.badRequest("Email and OTP are required"),
        );
      }

      const user = await db.query.user.findFirst({
        where: eq(users.email, email),
      });

      if (!user) {
        return next(CustomErrorHandler.notFound("User not found"));
      }

      const id = user.id;
      const isExist = await db.query.emailOtp.findFirst({
        where: eq(emailOtp.userId, id),
      });
      if (!isExist) {
        return res
          .status(401)
          .json({ msg: "Please login or register the account" });
      }
      const expires = Number(isExist.expiresAt);

      if (expires < Date.now()) {
        await db.delete(emailOtp).where(eq(emailOtp.userId, id));
        return res
          .status(401)
          .json({ msg: "Generated OTP is expired, resend now" });
      }

      if (isExist.otp !== otp) {
        return res.status(400).send(ResponseHandler(400, "Invalid OTP"));
      }

      const updatedUser = await db
        .update(users)
        .set({ isEmailVerified: true })
        .where(eq(users.id, id))
        .returning({
          email_verified: users.isEmailVerified,
        });

      await db.delete(emailOtp).where(eq(emailOtp.id, isExist.id));

      return res.status(201).send(
        ResponseHandler(201, "Email verified successfuly", {
          email_verified: updatedUser[0]?.email_verified,
        }),
      );
    } catch (error) {
      console.log(error);
      return next(error);
    }
  },

  async resetPassword(req: Request, res: Response, next: NextFunction) {
    try {
      const { email } = req.body;
      if (!email) {
        return next(CustomErrorHandler.notFound("Email not found"));
      }
      const userRes = await db.query.user.findFirst({
        where: eq(users.email, email),
      });
      if (!userRes) {
        return next(CustomErrorHandler.notFound("User not found"));
      }

      await db.delete(emailOtp).where(eq(emailOtp.userId, userRes.id));

      await emailOtpService({ id: userRes.id, email: userRes.email });

      return res
        .status(201)
        .send(ResponseHandler(201, "Verification OTP sent on your email"));
    } catch (error) {
      return next(error);
    }
  },

  async sendVerificationOtp(req: Request, res: Response, next: NextFunction) {
    const { email } = req.body;
    if (!email) {
      return next(CustomErrorHandler.badRequest("Email is required"));
    }
    const user = await db.query.user.findFirst({
      where: eq(users.email, email),
    });

    if (!user) {
      return next(CustomErrorHandler.notFound("User not found"));
    }

    if (user.isEmailVerified) {
      return next(CustomErrorHandler.badRequest("Email is already verified"));
    }

    await db.delete(emailOtp).where(eq(emailOtp.userId, user.id));

    await emailOtpService({
      id: user.id,
      email: user.email,
    });

    return res.send(ResponseHandler(200, "Verification OTP sent successfully"));
  },
};

export default emailVerificationController;
