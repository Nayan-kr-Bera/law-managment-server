import { Request, Response, NextFunction } from "express";
import { and, eq, inArray } from "drizzle-orm";
import db from "../db/index.js";
import { tenantSubscriptions } from "../db/schema/index.js";
import CustomErrorHandler from "../utils/customErrorHandler.js";

declare global {
  namespace Express {
    interface Request {
      aiDraftQuota?: {
        monthlyLimit: number;
        currentUsed: number;
        addonCredits: number;
        isInternal: boolean;
        subscriptionId: string;
      };
    }
  }
}

export const aiDraftGuard = async (
  req: Request,
  res: Response,
  next: NextFunction,
) => {
  try {
    const tenantId = req.user?.tenantId;
    if (!tenantId) {
      return next(CustomErrorHandler.unAuthorized("Tenant ID missing in request"));
    }

    const subscription = await db.query.tenantSubscriptions.findFirst({
      where: and(
        eq(tenantSubscriptions.tenantId, tenantId),
        inArray(tenantSubscriptions.status, ["active", "trial"]),
      ),
      with: {
        plan: true,
      },
    });

    if (!subscription) {
      return next(
        CustomErrorHandler.forbidden(
          "An active subscription is required to use AI Document Drafter.",
        ),
      );
    }

    const isInternal = subscription?.plan?.code === "internal";
    const monthlyLimit = isInternal ? 999999 : (subscription.plan?.monthlyAiDrafts ?? 0);
    let currentUsed = subscription.aiDraftsUsedThisMonth ?? 0;
    const addonCredits = subscription.aiDraftAddonCredits ?? 0;

    // Check monthly billing reset
    if (subscription.aiDraftCycleResetDate) {
      const resetDate = new Date(subscription.aiDraftCycleResetDate);
      const now = new Date();
      if (now >= resetDate) {
        const nextReset = new Date(now);
        nextReset.setMonth(nextReset.getMonth() + 1);

        await db
          .update(tenantSubscriptions)
          .set({
            aiDraftsUsedThisMonth: 0,
            aiDraftCycleResetDate: nextReset.toISOString().split("T")[0] as any,
          })
          .where(eq(tenantSubscriptions.id, subscription.id));

        currentUsed = 0;
      }
    }

    const remainingMonthly = Math.max(0, monthlyLimit - currentUsed);
    const totalRemaining = isInternal ? 999999 : remainingMonthly + addonCredits;

    if (!isInternal && totalRemaining <= 0) {
      return next(
        CustomErrorHandler.forbidden(
          `You have exhausted your AI Draft quota (${currentUsed}/${monthlyLimit} used, 0 add-on credits). Purchase an add-on pack or upgrade your plan to continue drafting.`,
        ),
      );
    }

    req.aiDraftQuota = {
      monthlyLimit,
      currentUsed,
      addonCredits,
      isInternal,
      subscriptionId: subscription.id,
    };

    return next();
  } catch (err) {
    console.error("[aiDraftGuard] Error verifying AI Draft quota:", err);
    return next(CustomErrorHandler.serverError("Failed to verify AI drafting quota"));
  }
};

export default aiDraftGuard;
