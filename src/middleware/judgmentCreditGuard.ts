import { type Request, type Response, type NextFunction } from "express";
import db from "../db/index.js";
import {
  tenantSubscriptions,
  judgmentAiSessions,
  type IJudgmentSessionMessage,
} from "../db/schema/index.js";
import { and, eq, gt, lte, sql } from "drizzle-orm";
import CustomErrorHandler from "../utils/customErrorHandler.js";
import {
  CREDITS_PER_JUDGMENT_REPORT,
  JUDGMENT_CREDIT_RATE_INR,
} from "../constants/judgmentCreditPacks.js";

export const MAX_FOLLOWUP_QUESTIONS_PER_SESSION = 15;
export const MAX_FOLLOWUP_PROMPT_CHARS = 2500;
export const SESSION_TTL_MS = 24 * 60 * 60 * 1000;

let tableInitialized = false;

export async function ensureJudgmentSessionsTable() {
  if (tableInitialized) return;
  try {
    await db.execute(sql`
      CREATE TABLE IF NOT EXISTS judgment_ai_sessions (
        id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        tenant_id uuid NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
        judgment_key varchar(255) NOT NULL,
        title varchar(500) NOT NULL,
        citation varchar(255),
        court varchar(255),
        messages jsonb NOT NULL DEFAULT '[]'::jsonb,
        questions_used integer NOT NULL DEFAULT 0,
        created_by uuid REFERENCES users(id) ON DELETE SET NULL,
        saved_at timestamp NOT NULL DEFAULT now(),
        expires_at timestamp NOT NULL,
        updated_at timestamp NOT NULL DEFAULT now()
      );
      CREATE INDEX IF NOT EXISTS judgment_ai_sessions_tenant_key_idx
        ON judgment_ai_sessions (tenant_id, judgment_key);
      CREATE INDEX IF NOT EXISTS judgment_ai_sessions_expires_at_idx
        ON judgment_ai_sessions (expires_at);
    `);
    tableInitialized = true;
  } catch (err) {
    console.warn("[ensureJudgmentSessionsTable] Notice:", err);
  }
}

export function resolveJudgmentKey(input: {
  judgmentId?: string;
  caseId?: string;
  metadata?: {
    id?: string;
    citation?: string;
    neutralCitation?: string;
    title?: string;
  };
}): string {
  const raw =
    input.judgmentId ||
    input.caseId ||
    input.metadata?.id ||
    input.metadata?.neutralCitation ||
    input.metadata?.citation ||
    input.metadata?.title ||
    "";
  return raw.trim().toLowerCase().replace(/\s+/g, "-").slice(0, 250);
}

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
      activeJudgmentSession?: {
        id: string;
        judgmentKey: string;
        title: string;
        citation: string | null;
        court: string | null;
        messages: IJudgmentSessionMessage[];
        questionsUsed: number;
        savedAt: Date;
        expiresAt: Date;
      } | null;
    }
  }
}

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

    await ensureJudgmentSessionsTable();

    db.delete(judgmentAiSessions)
      .where(lte(judgmentAiSessions.expiresAt, new Date()))
      .catch(() => {});

    const judgmentKey = resolveJudgmentKey(req.body || {});
    const forceRefresh = Boolean(req.body?.forceRefresh);

    if (judgmentKey && !forceRefresh) {
      const [existingSession] = await db
        .select()
        .from(judgmentAiSessions)
        .where(
          and(
            eq(judgmentAiSessions.tenantId, tenantId),
            eq(judgmentAiSessions.judgmentKey, judgmentKey),
            gt(judgmentAiSessions.expiresAt, new Date()),
          ),
        )
        .limit(1);

      if (existingSession) {
        req.activeJudgmentSession = existingSession;
      }
    }

    const subscription = await db.query.tenantSubscriptions.findFirst({
      where: eq(tenantSubscriptions.tenantId, tenantId),
      with: {
        plan: true,
      },
    });

    const isSubscriptionActiveOrTrial =
      subscription &&
      (subscription.status === "active" || subscription.status === "trial");
    const hasAddonCredits =
      (subscription?.aiDraftAddonCredits ?? 0) >= CREDITS_PER_JUDGMENT_REPORT;

    if (
      !subscription ||
      (!isSubscriptionActiveOrTrial &&
        !hasAddonCredits &&
        !req.activeJudgmentSession)
    ) {
      return next(
        CustomErrorHandler.forbidden(
          "An active subscription or free trial is required to use AI Judgment Co-Counsel.",
        ),
      );
    }

    const isInternal = subscription?.plan?.code === "internal";
    const isTrial =
      subscription?.status === "trial" ||
      subscription?.plan?.code === "free_trial";

    const rawMonthlyLimit = subscription.plan?.monthlyAiDrafts ?? 0;
    const monthlyLimit = isInternal
      ? 999999
      : isTrial && rawMonthlyLimit < CREDITS_PER_JUDGMENT_REPORT
        ? Math.max(
            CREDITS_PER_JUDGMENT_REPORT,
            rawMonthlyLimit * CREDITS_PER_JUDGMENT_REPORT,
          )
        : rawMonthlyLimit;

    let currentUsed = subscription.aiDraftsUsedThisMonth ?? 0;
    const addonCredits = subscription.aiDraftAddonCredits ?? 0;

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
    const totalRemaining = isInternal
      ? 999999
      : remainingMonthly + addonCredits;

    if (
      !req.activeJudgmentSession &&
      !isInternal &&
      totalRemaining < CREDITS_PER_JUDGMENT_REPORT
    ) {
      return next(
        CustomErrorHandler.forbidden(
          `Insufficient AI Credits. Generating a Judgment Briefing or Co-Counsel report requires ${CREDITS_PER_JUDGMENT_REPORT} credits (Your current balance is ${totalRemaining} credits). Please recharge credits to proceed (1 credit = ₹${JUDGMENT_CREDIT_RATE_INR}).`,
        ),
      );
    }

    if (
      req.activeJudgmentSession &&
      !isInternal &&
      req.activeJudgmentSession.questionsUsed >=
        MAX_FOLLOWUP_QUESTIONS_PER_SESSION
    ) {
      return next(
        CustomErrorHandler.forbidden(
          `You have reached the maximum of ${MAX_FOLLOWUP_QUESTIONS_PER_SESSION} follow-up questions included in this 24-hour Judgment Session. You may reset the session to start a new briefing (${CREDITS_PER_JUDGMENT_REPORT} credits).`,
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
    return next(
      CustomErrorHandler.serverError("Failed to verify AI credit quota"),
    );
  }
};

export async function deductJudgmentCredit(
  subscriptionId: string,
  currentUsed: number,
  monthlyLimit: number,
  isInternal: boolean,
  creditsToDeduct: number = CREDITS_PER_JUDGMENT_REPORT,
) {
  if (isInternal) return;

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
