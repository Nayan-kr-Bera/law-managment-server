import { and, eq, inArray } from "drizzle-orm";
import { NextFunction, Request, Response } from "express";

import db from "../db/index.js";
import { tenantSubscriptions } from "../db/schema/index.js";

import ResponseHandler from "../utils/responseHandler.js";
import CustomErrorHandler from "../utils/customErrorHandler.js";

const subscriptionMiddleware = async (
  req: Request,
  res: Response,
  next: NextFunction,
) => {
  try {
    // ============================================================
    // SUPER ADMIN BYPASS
    // ============================================================

    if (req.user?.isSuperAdmin) {
      console.log("[subscriptionMiddleware] Super admin bypass granted");
      return next();
    }

    // ============================================================
    // GET TENANT FROM AUTHENTICATED USER
    // ============================================================

    const tenantId = req.user?.tenantId;

    if (!tenantId) {
      console.warn("[subscriptionMiddleware] 401 Unauthorized: req.user.tenantId is missing");
      return next(
        CustomErrorHandler.unAuthorized("Tenant information is missing"),
      );
    }

    console.log("[subscriptionMiddleware] Checking subscription for tenantId:", tenantId);

    // ============================================================
    // FIND ACTIVE SUBSCRIPTION
    // ============================================================

    const subscription = await db.query.tenantSubscriptions.findFirst({
      where: and(
        eq(tenantSubscriptions.tenantId, tenantId),
        inArray(tenantSubscriptions.status, ["active", "trial"]),
      ),
      with: {
        plan: true,
      },
    });

    // ============================================================
    // NO SUBSCRIPTION
    // ============================================================

    if (!subscription) {
      console.warn("[subscriptionMiddleware] 403 Forbidden: No active/trial subscription found for tenantId:", tenantId);
      return res.status(403).send(
        ResponseHandler(
          403,
          "No active subscription found. Please subscribe to a plan.",
        ),
      );
    }

    console.log("[subscriptionMiddleware] Subscription found:", {
      planName: subscription.plan?.name,
      planCode: subscription.plan?.code,
      status: subscription.status,
      nextBillingDate: subscription.nextBillingDate,
    });

    // ============================================================
    // INTERNAL PLAN
    // code === "internal" NEVER EXPIRES
    // ============================================================

    const isInternalPlan = subscription.plan.code === "internal";

    // ============================================================
    // CHECK EXPIRY
    //
    // Internal plan -> skip expiry
    // Free trial   -> expires normally
    // Paid plans   -> expires normally
    // ============================================================

    if (!isInternalPlan) {
      const today = new Date();
      const nextBillingDate = new Date(subscription.nextBillingDate);

      if (nextBillingDate < today) {
        console.warn("[subscriptionMiddleware] 403 Forbidden: Subscription expired on", nextBillingDate);
        return res.status(403).send(
          ResponseHandler(
            403,
            "Your subscription has expired. Please renew your subscription.",
          ),
        );
      }
    }

    // ============================================================
    // ATTACH SUBSCRIPTION TO REQUEST
    // ============================================================

    req.subscription = {
      tenantId,

      planId: subscription.plan.id,
      planName: subscription.plan.name,
      planCode: subscription.plan.code,
      status: subscription.status,

      billingCycle: subscription.billingCycle,

      maxUsers: subscription.plan.maxUsers,
      maxOffices: subscription.plan.maxOffices,
      maxStorageGb: subscription.plan.maxStorageGb,

      features: subscription.plan.features,

      nextBillingDate: subscription.nextBillingDate,
      autoRenew: subscription.autoRenew,
    };

    // ============================================================
    // CONTINUE
    // ============================================================

    return next();
  } catch (error) {
    console.error("Subscription middleware error:", error);

    return next(CustomErrorHandler.serverError());
  }
};

export default subscriptionMiddleware;