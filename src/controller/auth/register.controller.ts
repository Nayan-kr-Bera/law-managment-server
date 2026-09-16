import bcrypt from "bcrypt";
import { and, eq } from "drizzle-orm";
import { NextFunction, Request, Response } from "express";
import { config } from "../../config/index.js";
import db from "../../db/index.js";
import slugify from "slugify";

import {
  offices,
  roles,
  tenants,
  userRoles,
  userScopeOffices,
  userScopes,
  subscriptionPlans,
  tenantSubscriptions,
} from "../../db/schema/index.js";

import users from "../../db/schema/users.js";

import emailOtpService from "../../services/emailOtp.service.js";
import ResponseHandler from "../../utils/responseHandler.js";
import CustomErrorHandler from "../../utils/customErrorHandler.js";
import { registerSchema } from "../../validators/auth/register.validatior.js";

const registerController = {
  async userRegister(req: Request, res: Response, next: NextFunction) {
    try {
      // 1. VALIDATE REQUEST

      const parsed = registerSchema.safeParse(req.body);

      if (!parsed.success) {
        return next(parsed.error);
      }

      const { name, email, password, phone } = parsed.data;

      // 2. CHECK EXISTING USER (EMAIL & PHONE)

      const existEmail = await db.query.user.findFirst({
        where: eq(users.email, email),
      });

      if (existEmail) {
        return next(
          CustomErrorHandler.alreadyExist(
            "This email address has already been used",
          ),
        );
      }

      if (phone) {
        const existPhone = await db.query.user.findFirst({
          where: eq(users.phone, phone),
        });

        if (existPhone) {
          return next(
            CustomErrorHandler.alreadyExist(
              "This phone number has already been used",
            ),
          );
        }
      }

      // 3. HASH PASSWORD

      const hashedPassword = await bcrypt.hash(password, Number(config.SALT));

      // 4. CREATE EVERYTHING IN ONE TRANSACTION

      const result = await db.transaction(async (tx) => {
        // 4.1 CREATE TENANT

        const baseSlug = slugify(name, {
          lower: true,
          strict: true,
        });

        let slug = baseSlug;
        let count = 1;

        while (
          await tx.query.tenants.findFirst({
            where: eq(tenants.slug, slug),
          })
        ) {
          slug = `${baseSlug}-${count++}`;
        }

        const [tenant] = await tx
          .insert(tenants)
          .values({
            name,
            slug,
            timezone: "Asia/Kolkata",
            status: "active",
          })
          .returning();

        // 4.2 FIND FREE TRIAL PLAN

        const freeTrialPlan = await tx.query.subscriptionPlans.findFirst({
          where: and(
            eq(subscriptionPlans.code, "free_trial"),
            eq(subscriptionPlans.isActive, true),
            eq(subscriptionPlans.isInternal, true),
          ),
        });

        if (!freeTrialPlan) {
          throw CustomErrorHandler.serverError(
            "Free trial subscription plan not found.",
          );
        }

        // 4.3 CREATE FREE TRIAL SUBSCRIPTION

        const trialStartDate = new Date();

        const trialEndDate = new Date(trialStartDate);

        // 14 DAYS FREE TRIAL
        trialEndDate.setDate(trialEndDate.getDate() + 14);

        const [subscription] = await tx
          .insert(tenantSubscriptions)
          .values({
            tenantId: tenant.id,

            planId: freeTrialPlan.id,

            status: "trial",

            billingCycle: "monthly",

            amount: "0.00",

            currency: freeTrialPlan.currency,

            startDate: trialStartDate.toISOString().split("T")[0],

            nextBillingDate: trialEndDate.toISOString().split("T")[0],

            autoRenew: false,
          })
          .returning();

        // 4.4 CREATE HEAD OFFICE

        const [office] = await tx
          .insert(offices)
          .values({
            tenantId: tenant.id,
            name: "Head Office",
            isHeadOffice: true,
          })
          .returning();

        // 4.5 CREATE USER

        const [user] = await tx
          .insert(users)
          .values({
            name,
            phone,
            email,
            password: hashedPassword,
          })
          .returning();

        // 4.6 CREATE DEFAULT USER SCOPE

        const [scope] = await tx
          .insert(userScopes)
          .values({
            userId: user.id,
            tenantId: tenant.id,
            isDefault: true,
          })
          .returning();

        // 4.7 CONNECT SCOPE → OFFICE

        await tx.insert(userScopeOffices).values({
          userScopeId: scope.id,
          officeId: office.id,
        });

        // 4.8 FIND TENANT ADMIN ROLE

        const adminRole = await tx.query.roles.findFirst({
          where: eq(roles.slug, "tenant_admin"),
        });

        if (!adminRole) {
          throw CustomErrorHandler.serverError("Tenant Admin role not found.");
        }

        // 4.9 ASSIGN TENANT ADMIN ROLE

        await tx.insert(userRoles).values({
          scopeId: scope.id,
          roleId: adminRole.id,
        });

        // RETURN TRANSACTION RESULT

        return {
          user,
          tenant,
          scope,
          subscription,
          plan: freeTrialPlan,
        };
      });

      // 5. SEND EMAIL OTP

      await emailOtpService({
        id: result.user.id,
        email: result.user.email,
      });

      // 6. RESPONSE

      return res.status(201).send(
        ResponseHandler(201, "Registration successful", {
          id: result.user.id,

          name: result.user.name,

          email: result.user.email,

          tenantId: result.tenant.id,

          tenantName: result.tenant.name,

          email_verified: false,

          phone_verified: false,

          subscription: {
            id: result.subscription.id,

            status: result.subscription.status,

            plan: {
              id: result.plan.id,
              code: result.plan.code,
              name: result.plan.name,
            },

            startDate: result.subscription.startDate,

            nextBillingDate: result.subscription.nextBillingDate,
          },
        }),
      );
    } catch (error: unknown) {
      console.error("USER REGISTRATION ERROR:", error);

      const errObj = error as {
        code?: string;
        constraint?: string;
        detail?: string;
        cause?: { code?: string; constraint_name?: string; detail?: string };
      };

      const pgCode = errObj?.code || errObj?.cause?.code;
      const constraint = errObj?.constraint || errObj?.cause?.constraint_name;
      const detail = errObj?.detail || errObj?.cause?.detail || "";

      if (pgCode === "23505") {
        if (constraint === "users_phone_unique" || detail.includes("phone")) {
          return next(
            CustomErrorHandler.alreadyExist(
              "This phone number has already been used",
            ),
          );
        }
        if (constraint === "users_email_unique" || detail.includes("email")) {
          return next(
            CustomErrorHandler.alreadyExist(
              "This email address has already been used",
            ),
          );
        }
      }

      return next(error);
    }
  },
};

export default registerController;
