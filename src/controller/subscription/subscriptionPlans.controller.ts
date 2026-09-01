import { eq } from "drizzle-orm";
import { NextFunction, Request, Response } from "express";
import db from "../../db/index.js";
import { subscriptionPlans } from "../../db/schema/index.js";
import ResponseHandler from "../../utils/responseHandler.js";
import CustomErrorHandler from "../../utils/customErrorHandler.js";

const subscriptionPlanController = {
  // GET ALL PLANS
  async getPlans(req: Request, res: Response, next: NextFunction) {
    try {
      const plans = await db.query.subscriptionPlans.findMany({
        where: eq(subscriptionPlans.isInternal, false),

        orderBy: (subscriptionPlans, { asc }) => [
          asc(subscriptionPlans.createdAt),
        ],
      });

      return res
        .status(200)
        .send(
          ResponseHandler(
            200,
            "Subscription plans fetched successfully",
            plans,
          ),
        );
    } catch (error) {
      console.error(error);
      return next(CustomErrorHandler.serverError());
    }
  },

  // GET PLAN BY ID
  async getPlanById(req: Request, res: Response, next: NextFunction) {
    try {
      const { id } = req.params;

      if (!id) {
        return next(CustomErrorHandler.badRequest("Plan id is required"));
      }

      const plan = await db.query.subscriptionPlans.findFirst({
        where: eq(subscriptionPlans.id, id),
      });

      if (!plan) {
        return next(CustomErrorHandler.notFound("Subscription plan not found"));
      }

      return res
        .status(200)
        .send(
          ResponseHandler(200, "Subscription plan fetched successfully", plan),
        );
    } catch (error) {
      console.error(error);
      return next(CustomErrorHandler.serverError());
    }
  },

  // CREATE PLAN
  async createPlan(req: Request, res: Response, next: NextFunction) {
    try {
      const {
        code,
        name,
        tagline,
        description,
        monthlyPrice,
        annualPrice,
        currency,
        maxUsers,
        maxOffices,
        maxStorageGb,
        features,
        badge,
        isPopular,
        isActive,
        isInternal,
      } = req.body;

      // VALIDATION
      if (!code) {
        return next(CustomErrorHandler.badRequest("Plan code is required"));
      }

      if (!name) {
        return next(CustomErrorHandler.badRequest("Plan name is required"));
      }

      if (monthlyPrice === undefined) {
        return next(CustomErrorHandler.badRequest("Monthly price is required"));
      }

      if (annualPrice === undefined) {
        return next(CustomErrorHandler.badRequest("Annual price is required"));
      }

      if (maxUsers === undefined) {
        return next(CustomErrorHandler.badRequest("Maximum users is required"));
      }

      if (maxOffices === undefined) {
        return next(
          CustomErrorHandler.badRequest("Maximum offices is required"),
        );
      }

      if (maxStorageGb === undefined) {
        return next(
          CustomErrorHandler.badRequest("Maximum storage is required"),
        );
      }

      // CHECK DUPLICATE CODE
      const existingPlan = await db.query.subscriptionPlans.findFirst({
        where: eq(subscriptionPlans.code, code),
      });

      if (existingPlan) {
        return next(
          CustomErrorHandler.badRequest(
            "Subscription plan code already exists",
          ),
        );
      }

      // CREATE PLAN
      const [plan] = await db
        .insert(subscriptionPlans)
        .values({
          code: String(code).trim().toLowerCase(),

          name,

          tagline,

          description,

          monthlyPrice: String(monthlyPrice),

          annualPrice: String(annualPrice),

          currency: currency || "INR",

          maxUsers: Number(maxUsers),

          maxOffices: Number(maxOffices),

          maxStorageGb: Number(maxStorageGb),

          features: Array.isArray(features) ? features : [],

          badge,

          isPopular: isPopular ?? false,

          isActive: isActive ?? true,

          isInternal: isInternal ?? false,
        })
        .returning();

      // RESPONSE
      return res
        .status(201)
        .send(
          ResponseHandler(201, "Subscription plan created successfully", plan),
        );
    } catch (error) {
      console.error("CREATE SUBSCRIPTION PLAN ERROR:", error);

      return next(CustomErrorHandler.serverError());
    }
  },

  // UPDATE PLAN
  async updatePlan(req: Request, res: Response, next: NextFunction) {
    try {
      const { id } = req.params;

      if (!id) {
        return next(CustomErrorHandler.badRequest("Plan id is required"));
      }

      const existingPlan = await db.query.subscriptionPlans.findFirst({
        where: eq(subscriptionPlans.id, id),
      });

      if (!existingPlan) {
        return next(CustomErrorHandler.notFound("Subscription plan not found"));
      }

      const {
        name,
        tagline,
        description,
        monthlyPrice,
        annualPrice,
        currency,
        maxUsers,
        maxOffices,
        maxStorageGb,
        features,
        badge,
        isPopular,
        isActive,
      } = req.body;

      const [plan] = await db
        .update(subscriptionPlans)
        .set({
          ...(name !== undefined && { name }),
          ...(tagline !== undefined && { tagline }),
          ...(description !== undefined && { description }),
          ...(monthlyPrice !== undefined && {
            monthlyPrice: String(monthlyPrice),
          }),
          ...(annualPrice !== undefined && {
            annualPrice: String(annualPrice),
          }),
          ...(currency !== undefined && { currency }),
          ...(maxUsers !== undefined && {
            maxUsers: Number(maxUsers),
          }),
          ...(maxOffices !== undefined && {
            maxOffices: Number(maxOffices),
          }),
          ...(maxStorageGb !== undefined && {
            maxStorageGb: Number(maxStorageGb),
          }),
          ...(features !== undefined && {
            features: Array.isArray(features) ? features : [],
          }),
          ...(badge !== undefined && { badge }),
          ...(isPopular !== undefined && { isPopular }),
          ...(isActive !== undefined && { isActive }),
        })
        .where(eq(subscriptionPlans.id, id))
        .returning();

      return res
        .status(200)
        .send(
          ResponseHandler(200, "Subscription plan updated successfully", plan),
        );
    } catch (error) {
      console.error(error);
      return next(CustomErrorHandler.serverError());
    }
  },

  // DELETE PLAN
  async deletePlan(req: Request, res: Response, next: NextFunction) {
    try {
      const { id } = req.params;

      if (!id) {
        return next(CustomErrorHandler.badRequest("Plan id is required"));
      }

      const existingPlan = await db.query.subscriptionPlans.findFirst({
        where: eq(subscriptionPlans.id, id),
      });

      if (!existingPlan) {
        return next(CustomErrorHandler.notFound("Subscription plan not found"));
      }

      await db.delete(subscriptionPlans).where(eq(subscriptionPlans.id, id));

      return res
        .status(200)
        .send(ResponseHandler(200, "Subscription plan deleted successfully"));
    } catch (error) {
      console.error(error);
      return next(CustomErrorHandler.serverError());
    }
  },
};

export default subscriptionPlanController;
