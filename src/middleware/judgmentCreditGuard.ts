import { type Request, type Response, type NextFunction } from "express";
import db from "../db/index.js";
import { tenantSubscriptions } from "../db/schema/index.js";
import { eq, sql } from "drizzle-orm";
import CustomErrorHandler from "../utils/customErrorHandler.js";
import { CREDITS_PER_JUDGMENT_REPORT, JUDGMENT_CREDIT_RATE_INR } from "../constants/judgmentCreditPacks.js";

declare global {
  namespace Express {
    interface Request {
      judgmentCreditQuota?: {
        monthlyLimit: number;
        currentUsed: number;
        addonCredits: number;
        isInternal: boolean;
        subscriptionId: string;
      };
    }
  }
}

/**
 * Middleware: Guards Judgment AI endpoints.
 * Checks tenant subscription, ensures sufficient credits (monthly or add-on),
 * and prepares quota for atomic deduction.
 */
export const judgmentCreditGuard = async (
  req: Request,
  res: Response,
  next: NextFunction,
) => {
  try {
    const tenantId = req.user?.tenantId;

    if (!tenantId) {
      return next(CustomErrorHandler.unAuthorized("Authentication required"));
    }

    const subscription = await db.query.tenantSubscriptions.findFirst({
      where: eq(tenantSubscriptions.tenantId, tenantId),
      with: {
        plan: true,
      },
    });

    const isSubscriptionActiveOrTrial =
      subscription && (subscription.status === "active" || subscription.status === "trial");
    const hasAddonCredits = (subscription?.aiDraftAddonCredits ?? 0) >= CREDITS_PER_JUDGMENT_REPORT;

    if (!subscription || (!isSubscriptionActiveOrTrial && !hasAddonCredits)) {
      return next(
        CustomErrorHandler.forbidden(
          "An active subscription or free trial is required to use AI Judgment Co-Counsel.",
        ),
      );
    }

    const isInternal = subscription?.plan?.code === "internal";
    const isTrial = subscription?.status === "trial" || subscription?.plan?.code === "free_trial";

    // If trial plan has lower draft count (e.g. 4 drafts in old 1-credit system), scale to 15 credits/report
    const rawMonthlyLimit = subscription.plan?.monthlyAiDrafts ?? 0;
    const monthlyLimit = isInternal
      ? 999999
      : (isTrial && rawMonthlyLimit < CREDITS_PER_JUDGMENT_REPORT)
        ? Math.max(CREDITS_PER_JUDGMENT_REPORT, rawMonthlyLimit * CREDITS_PER_JUDGMENT_REPORT)
        : rawMonthlyLimit;

    let currentUsed = subscription.aiDraftsUsedThisMonth ?? 0;
    const addonCredits = subscription.aiDraftAddonCredits ?? 0;

    // Check monthly billing cycle reset
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
            aiDraftAddonCredits: 0,
            aiDraftCycleResetDate: nextReset.toISOString().split("T")[0],
          })
          .where(eq(tenantSubscriptions.id, subscription.id));

        currentUsed = 0;
      }
    }

    const remainingMonthly = Math.max(0, monthlyLimit - currentUsed);
    const totalRemaining = isInternal ? 999999 : remainingMonthly + addonCredits;

    if (!isInternal && totalRemaining < CREDITS_PER_JUDGMENT_REPORT) {
      return next(
        CustomErrorHandler.forbidden(
          `Insufficient AI Credits. Generating a Judgment Briefing or Co-Counsel report requires ${CREDITS_PER_JUDGMENT_REPORT} credits (Your current balance is ${totalRemaining} credits). Please recharge credits to proceed (1 credit = ₹${JUDGMENT_CREDIT_RATE_INR}).`,
        ),
      );
    }

    req.judgmentCreditQuota = {
      monthlyLimit,
      currentUsed,
      addonCredits,
      isInternal,
      subscriptionId: subscription.id,
    };

    return next();
  } catch (err) {
    console.error("[judgmentCreditGuard] Error verifying AI credit quota:", err);
    return next(CustomErrorHandler.serverError("Failed to verify AI credit quota"));
  }
};

/**
 * Deducts credits (default 15 credits per report) from the tenant's subscription pool atomically.
 */
export async function deductJudgmentCredit(
  subscriptionId: string,
  currentUsed: number,
  monthlyLimit: number,
  isInternal: boolean,
  creditsToDeduct: number = CREDITS_PER_JUDGMENT_REPORT,
) {
  if (isInternal) return; // Unlimited for internal admin accounts

  const remainingMonthly = Math.max(0, monthlyLimit - currentUsed);
  if (remainingMonthly >= creditsToDeduct) {
    await db
      .update(tenantSubscriptions)
      .set({
        aiDraftsUsedThisMonth: sql`${tenantSubscriptions.aiDraftsUsedThisMonth} + ${creditsToDeduct}`,
      })
      .where(eq(tenantSubscriptions.id, subscriptionId));
  } else {
    const fromMonthly = remainingMonthly;
    const fromAddon = creditsToDeduct - fromMonthly;

    await db
      .update(tenantSubscriptions)
      .set({
        aiDraftsUsedThisMonth: sql`${tenantSubscriptions.aiDraftsUsedThisMonth} + ${fromMonthly}`,
        aiDraftAddonCredits: sql`GREATEST(0, ${tenantSubscriptions.aiDraftAddonCredits} - ${fromAddon})`,
      })
      .where(eq(tenantSubscriptions.id, subscriptionId));
  }
}

export default judgmentCreditGuard;
