import { count, eq } from "drizzle-orm";
import { NextFunction, Request, Response } from "express";

import db from "../../../db/index.js";
import {
  subscriptionPlans,
  tenantSubscriptions,
} from "../../../db/schema/index.js";

import CustomErrorHandler from "../../../utils/customErrorHandler.js";
import ResponseHandler from "../../../utils/responseHandler.js";

const adminPlanController = {
  // =========================================================================
  // GET ALL SUBSCRIPTION PLANS
  // =========================================================================
  async getSubscriptionPlans(req: Request, res: Response, next: NextFunction) {
    try {
      const plans = await db.query.subscriptionPlans.findMany({
        orderBy: (p, { asc }) => [asc(p.createdAt)],
      });

      const formattedPlans = await Promise.all(
        plans.map(async (p) => {
          const [subscribersRes] = await db
            .select({ count: count() })
            .from(tenantSubscriptions)
            .where(eq(tenantSubscriptions.planId, p.id));

          return {
            id: p.id,
            name: p.name,
            code: p.code,
            tagline: p.tagline || "",
            description: p.description || "",
            monthlyPrice: Number(p.monthlyPrice || 0),
            yearlyPrice: Number(p.annualPrice || 0),
            annualPrice: Number(p.annualPrice || 0),
            currency: p.currency || "INR",
            features: (p.features as string[]) || [],
            maxUsers: p.maxUsers,
            maxOffices: p.maxOffices,
            maxStorageGb: p.maxStorageGb,
            monthlyOcrCredits: p.monthlyOcrCredits ?? (p.monthlyOcrPages ? p.monthlyOcrPages * 10 : 0),
            monthlyOcrPages: p.monthlyOcrPages ?? Math.floor((p.monthlyOcrCredits ?? 0) / 10),
            monthlyAiDrafts: p.monthlyAiDrafts ?? 0,
            limits: {
              maxOffices: p.maxOffices || 1,
              maxAdvocates: p.maxUsers || 5,
              maxCases: 500,
              maxStorageGB: p.maxStorageGb || 10,
              monthlyOcrCredits: p.monthlyOcrCredits ?? (p.monthlyOcrPages ? p.monthlyOcrPages * 10 : 0),
              monthlyOcrPages: p.monthlyOcrPages ?? Math.floor((p.monthlyOcrCredits ?? 0) / 10),
              monthlyAiDrafts: p.monthlyAiDrafts ?? 0,
              aiDraftsPerMonth: p.monthlyAiDrafts ?? 0,
            },
            isActive: p.isActive ?? true,
            isPopular: p.isPopular ?? false,
            badge: p.badge || undefined,
            subscribersCount: subscribersRes?.count || 0,
            createdAt: p.createdAt ? new Date(p.createdAt).toISOString() : new Date().toISOString(),
          };
        })
      );

      return res.status(200).json(
        ResponseHandler(200, "Subscription plans fetched successfully", formattedPlans)
      );
    } catch (error) {
      console.error("Admin get plans error:", error);
      return next(CustomErrorHandler.serverError());
    }
  },

  // =========================================================================
  // GET PLAN BY ID
  // =========================================================================
  async getPlanById(req: Request, res: Response, next: NextFunction) {
    try {
      const { id } = req.params;

      const p = await db.query.subscriptionPlans.findFirst({
        where: eq(subscriptionPlans.id, id),
      });

      if (!p) {
        return next(CustomErrorHandler.notFound("Subscription plan not found"));
      }

      const [subscribersRes] = await db
        .select({ count: count() })
        .from(tenantSubscriptions)
        .where(eq(tenantSubscriptions.planId, p.id));

      const formattedPlan = {
        id: p.id,
        name: p.name,
        code: p.code,
        tagline: p.tagline || "",
        description: p.description || "",
        monthlyPrice: Number(p.monthlyPrice || 0),
        yearlyPrice: Number(p.annualPrice || 0),
        annualPrice: Number(p.annualPrice || 0),
        currency: p.currency || "INR",
        trialDays: 14,
        features: (p.features as string[]) || [],
        maxUsers: p.maxUsers,
        maxOffices: p.maxOffices,
        maxStorageGb: p.maxStorageGb,
        monthlyOcrCredits: p.monthlyOcrCredits ?? (p.monthlyOcrPages ? p.monthlyOcrPages * 10 : 0),
        monthlyOcrPages: p.monthlyOcrPages ?? Math.floor((p.monthlyOcrCredits ?? 0) / 10),
        monthlyAiDrafts: p.monthlyAiDrafts ?? 0,
        limits: {
          maxOffices: p.maxOffices || 1,
          maxAdvocates: p.maxUsers || 5,
          maxCases: 500,
          maxStorageGB: p.maxStorageGb || 10,
          monthlyOcrCredits: p.monthlyOcrCredits ?? (p.monthlyOcrPages ? p.monthlyOcrPages * 10 : 0),
          monthlyOcrPages: p.monthlyOcrPages ?? Math.floor((p.monthlyOcrCredits ?? 0) / 10),
          monthlyAiDrafts: p.monthlyAiDrafts ?? 0,
          aiDraftsPerMonth: p.monthlyAiDrafts ?? 0,
        },
        isActive: p.isActive ?? true,
        isPopular: p.isPopular ?? false,
        badge: p.badge || undefined,
        subscribersCount: subscribersRes?.count || 0,
        createdAt: p.createdAt ? new Date(p.createdAt).toISOString() : new Date().toISOString(),
      };

      return res.status(200).json(
        ResponseHandler(200, "Subscription plan details fetched successfully", formattedPlan)
      );
    } catch (error) {
      console.error("Admin get plan by ID error:", error);
      return next(CustomErrorHandler.serverError());
    }
  },

  // =========================================================================
  // CREATE SUBSCRIPTION PLAN
  // =========================================================================
  async createSubscriptionPlan(req: Request, res: Response, next: NextFunction) {
    try {
      const {
        name,
        code,
        tagline,
        description,
        monthlyPrice,
        yearlyPrice,
        annualPrice,
        currency,
        maxUsers,
        maxAdvocates,
        maxOffices,
        maxStorageGb,
        monthlyOcrPages,
        monthlyAiDrafts,
        features,
        badge,
        isPopular,
        isActive,
      } = req.body;

      if (!name) {
        return next(CustomErrorHandler.badRequest("Plan name is required"));
      }

      const planCode =
        code ||
        name.toLowerCase().replace(/[^a-z0-9]/g, "_").substring(0, 50);

      const mPrice = monthlyPrice !== undefined ? String(monthlyPrice) : "0";
      const aPrice =
        annualPrice !== undefined
          ? String(annualPrice)
          : yearlyPrice !== undefined
          ? String(yearlyPrice)
          : String(Number(mPrice) * 10);

      const [newPlan] = await db
        .insert(subscriptionPlans)
        .values({
          code: planCode,
          name,
          tagline: tagline || "",
          description: description || "",
          monthlyPrice: mPrice,
          annualPrice: aPrice,
          currency: currency || "INR",
          maxUsers: maxUsers !== undefined ? Number(maxUsers) : maxAdvocates !== undefined ? Number(maxAdvocates) : 5,
          maxOffices: maxOffices !== undefined ? Number(maxOffices) : 1,
          maxStorageGb: maxStorageGb !== undefined ? Number(maxStorageGb) : 10,
          monthlyOcrPages: monthlyOcrPages !== undefined ? Number(monthlyOcrPages) : 0,
          monthlyAiDrafts: monthlyAiDrafts !== undefined ? Number(monthlyAiDrafts) : 0,
          features: Array.isArray(features) ? features : [],
          badge: badge || null,
          isPopular: isPopular ?? false,
          isActive: isActive ?? true,
          isInternal: false,
        })
        .returning();

      return res.status(201).json(
        ResponseHandler(201, "Subscription plan created successfully", newPlan)
      );
    } catch (error) {
      console.error("Admin create plan error:", error);
      return next(CustomErrorHandler.serverError());
    }
  },

  // =========================================================================
  // UPDATE SUBSCRIPTION PLAN
  // =========================================================================
  async updateSubscriptionPlan(req: Request, res: Response, next: NextFunction) {
    try {
      const { id } = req.params;
      const {
        name,
        tagline,
        description,
        monthlyPrice,
        yearlyPrice,
        annualPrice,
        currency,
        maxUsers,
        maxAdvocates,
        maxOffices,
        maxStorageGb,
        maxStorageGB,
        monthlyOcrPages,
        monthlyAiDrafts,
        features,
        badge,
        isPopular,
        isActive,
      } = req.body;

      const existing = await db.query.subscriptionPlans.findFirst({
        where: eq(subscriptionPlans.id, id),
      });

      if (!existing) {
        return next(CustomErrorHandler.notFound("Subscription plan not found"));
      }

      const [updated] = await db
        .update(subscriptionPlans)
        .set({
          ...(name !== undefined && { name }),
          ...(tagline !== undefined && { tagline }),
          ...(description !== undefined && { description }),
          ...(monthlyPrice !== undefined && {
            monthlyPrice: String(monthlyPrice),
          }),
          ...(annualPrice !== undefined
            ? { annualPrice: String(annualPrice) }
            : yearlyPrice !== undefined
            ? { annualPrice: String(yearlyPrice) }
            : {}),
          ...(currency !== undefined && { currency }),
          ...(maxUsers !== undefined
            ? { maxUsers: Number(maxUsers) }
            : maxAdvocates !== undefined
            ? { maxUsers: Number(maxAdvocates) }
            : {}),
          ...(maxOffices !== undefined && { maxOffices: Number(maxOffices) }),
          ...(maxStorageGb !== undefined
            ? { maxStorageGb: Number(maxStorageGb) }
            : maxStorageGB !== undefined
            ? { maxStorageGb: Number(maxStorageGB) }
            : {}),
          ...(monthlyOcrPages !== undefined && {
            monthlyOcrPages: Number(monthlyOcrPages),
          }),
          ...(monthlyAiDrafts !== undefined && {
            monthlyAiDrafts: Number(monthlyAiDrafts),
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

      return res.status(200).json(
        ResponseHandler(200, "Subscription plan updated successfully", updated)
      );
    } catch (error) {
      console.error("Admin update plan error:", error);
      return next(CustomErrorHandler.serverError());
    }
  },

  // =========================================================================
  // DELETE SUBSCRIPTION PLAN
  // =========================================================================
  async deleteSubscriptionPlan(req: Request, res: Response, next: NextFunction) {
    try {
      const { id } = req.params;

      const existing = await db.query.subscriptionPlans.findFirst({
        where: eq(subscriptionPlans.id, id),
      });

      if (!existing) {
        return next(CustomErrorHandler.notFound("Subscription plan not found"));
      }

      await db
        .delete(subscriptionPlans)
        .where(eq(subscriptionPlans.id, id));

      return res.status(200).json(
        ResponseHandler(200, "Subscription plan deleted successfully")
      );
    } catch (error) {
      console.error("Admin delete plan error:", error);
      return next(CustomErrorHandler.serverError());
    }
  },
};

export default adminPlanController;
