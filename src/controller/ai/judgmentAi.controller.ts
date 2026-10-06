import { type Request, type Response, type NextFunction } from "express";
import aiProxyService, { type ChatMessage, type JudgmentMetadata } from "../../services/aiProxy.service.js";
import { deductJudgmentCredit } from "../../middleware/judgmentCreditGuard.js";
import db from "../../db/index.js";
import { courtJudgments, tenantSubscriptions, subscriptionPaymentHistory } from "../../db/schema/index.js";
import { and, desc, eq, ilike, or, sql } from "drizzle-orm";
import CustomErrorHandler from "../../utils/customErrorHandler.js";
import razorpayService from "../../services/razorpay.service.js";
import ResponseHandler from "../../utils/responseHandler.js";
import { config } from "../../config/index.js";
import {
  JUDGMENT_CREDIT_PACKS,
  JUDGMENT_CREDIT_RATE_INR,
  CREDITS_PER_JUDGMENT_REPORT,
  JUDGMENT_CREDIT_GST_PERCENT,
} from "../../constants/judgmentCreditPacks.js";

const judgmentAiController = {
  /**
   * GET /api/judgment-ai/quota
   * Returns current AI credits and usage for the logged-in advocate's tenant
   */
  async getQuota(req: Request, res: Response, next: NextFunction) {
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

      const isInternal = subscription?.plan?.code === "internal";
      const isTrial = subscription?.status === "trial" || subscription?.plan?.code === "free_trial";

      const rawMonthlyLimit = subscription?.plan?.monthlyAiDrafts ?? 0;
      const monthlyLimit = isInternal
        ? 999999
        : (isTrial && rawMonthlyLimit < CREDITS_PER_JUDGMENT_REPORT)
          ? Math.max(CREDITS_PER_JUDGMENT_REPORT, rawMonthlyLimit * CREDITS_PER_JUDGMENT_REPORT)
          : rawMonthlyLimit;

      let usedThisMonth = subscription?.aiDraftsUsedThisMonth ?? 0;
      let addonCredits = subscription?.aiDraftAddonCredits ?? 0;

      // Check monthly cycle reset
      if (subscription?.aiDraftCycleResetDate) {
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

          usedThisMonth = 0;
          addonCredits = 0;
        }
      }

      const remainingMonthly = Math.max(0, monthlyLimit - usedThisMonth);
      const totalAvailable = isInternal ? 999999 : remainingMonthly + addonCredits;

      return res.status(200).json({
        success: true,
        data: {
          totalAvailable,
          monthlyLimit,
          usedThisMonth,
          addonCredits,
          isInternal,
          planName: subscription?.plan?.name || "Free Trial",
          resetDate: subscription?.aiDraftCycleResetDate || subscription?.nextBillingDate || null,
          ratePerCredit: JUDGMENT_CREDIT_RATE_INR,
          creditsPerReport: CREDITS_PER_JUDGMENT_REPORT,
        },
      });
    } catch (err) {
      console.error("[judgmentAiController.getQuota] Error:", err);
      return next(CustomErrorHandler.serverError("Failed to fetch judgment AI quota"));
    }
  },

  /**
   * GET /api/judgment-ai/judgments
   * Returns paginated list of judgments from central library for the advocate portal
   */
  async getJudgments(req: Request, res: Response, next: NextFunction) {
    try {
      const {
        q,
        courtLevel,
        page = "1",
        limit = "12",
      } = req.query as Record<string, string | undefined>;

      const pageNum = Math.max(1, parseInt(page, 10) || 1);
      const limitNum = Math.min(100, Math.max(1, parseInt(limit, 10) || 12));
      const offset = (pageNum - 1) * limitNum;

      const conditions = [];

      if (q && q.trim()) {
        const pattern = `%${q.trim()}%`;
        conditions.push(
          or(
            ilike(courtJudgments.title, pattern),
            ilike(courtJudgments.neutralCitation, pattern),
            ilike(courtJudgments.citation, pattern),
            ilike(courtJudgments.equivalentCitations, pattern),
            ilike(courtJudgments.actSection, pattern),
            ilike(courtJudgments.court, pattern),
            ilike(courtJudgments.summary, pattern)
          )
        );
      }

      if (courtLevel && courtLevel !== "all") {
        conditions.push(eq(courtJudgments.courtLevel, courtLevel));
      }

      const whereClause = conditions.length > 0 ? and(...conditions) : undefined;

      const [list, totalCountResult] = await Promise.all([
        db
          .select()
          .from(courtJudgments)
          .where(whereClause)
          .orderBy(desc(courtJudgments.year), desc(courtJudgments.createdAt))
          .limit(limitNum)
          .offset(offset),
        db
          .select({ count: sql<number>`cast(count(*) as integer)` })
          .from(courtJudgments)
          .where(whereClause),
      ]);

      const total = totalCountResult[0]?.count || 0;
      const totalPages = Math.ceil(total / limitNum);

      return res.status(200).json({
        success: true,
        data: list,
        pagination: {
          page: pageNum,
          limit: limitNum,
          total,
          totalPages,
        },
      });
    } catch (err) {
      console.error("[judgmentAiController.getJudgments] Error:", err);
      return next(CustomErrorHandler.serverError("Failed to fetch court judgments"));
    }
  },

  /**
   * POST /api/judgment-ai/chat
   * Streams AI completion for judgment briefing or conversational Q&A.
   * Deducts 15 credits upon starting generation.
   */
  async streamChat(req: Request, res: Response, next: NextFunction) {
    try {
      const { metadata, judgmentText, history } = req.body as {
        metadata?: JudgmentMetadata;
        judgmentText?: string;
        history: ChatMessage[];
      };

      if (!history || !Array.isArray(history) || history.length === 0) {
        return next(CustomErrorHandler.badRequest("Chat history or query prompt is required."));
      }

      const quota = req.judgmentCreditQuota;
      if (!quota) {
        return next(CustomErrorHandler.forbidden("AI Credit quota check missing."));
      }

      // Configure Server-Sent Events (SSE) headers
      res.setHeader("Content-Type", "text/event-stream");
      res.setHeader("Cache-Control", "no-cache, no-transform");
      res.setHeader("Connection", "keep-alive");
      res.setHeader("X-Accel-Buffering", "no");
      res.flushHeaders?.();

      // Deduct 15 credits atomically per judgment report / chat
      const handleCompletion = async () => {
        try {
          await deductJudgmentCredit(
            quota.subscriptionId,
            quota.currentUsed,
            quota.monthlyLimit,
            quota.isInternal,
            CREDITS_PER_JUDGMENT_REPORT
          );
        } catch (creditErr) {
          console.error("[judgmentAiController] Error deducting credit:", creditErr);
        }
      };

      await aiProxyService.streamJudgmentChat({
        metadata,
        judgmentText,
        history,
        res,
        onComplete: handleCompletion,
      });
    } catch (err) {
      console.error("[judgmentAiController.streamChat] Error:", err);
      if (!res.headersSent) {
        return next(CustomErrorHandler.serverError("Failed to start judgment AI stream"));
      }
      res.end();
    }
  },

  /**
   * 4. GET /api/judgment-ai/credit-packs
   * Returns list of credit packs, rate per credit (₹1.15), and credits per report (15)
   */
  async getCreditPacks(req: Request, res: Response, next: NextFunction) {
    try {
      return res.status(200).json(
        ResponseHandler(200, "Credit packs retrieved successfully", {
          ratePerCredit: JUDGMENT_CREDIT_RATE_INR,
          creditsPerReport: CREDITS_PER_JUDGMENT_REPORT,
          gstPercent: JUDGMENT_CREDIT_GST_PERCENT,
          packs: Object.values(JUDGMENT_CREDIT_PACKS),
        })
      );
    } catch (err) {
      console.error("[judgmentAiController.getCreditPacks] Error:", err);
      return next(CustomErrorHandler.serverError("Failed to fetch credit packs"));
    }
  },

  /**
   * 5. POST /api/judgment-ai/create-credit-order
   * Creates a Razorpay order for purchasing Judgment AI credits (₹1.15 / credit + 18% GST)
   */
  async createCreditOrder(req: Request, res: Response, next: NextFunction) {
    try {
      const tenantId = req.user?.tenantId;
      const userEmail = req.user?.email;

      if (!tenantId) {
        return next(CustomErrorHandler.unAuthorized("Tenant ID missing"));
      }

      const { packId, customCredits } = req.body as { packId?: string; customCredits?: number };

      let creditsToBuy = 0;
      let packName = "Custom AI Credit Recharge";
      let basePrice = 0;
      let gstAmount = 0;
      let totalPrice = 0;

      if (packId && JUDGMENT_CREDIT_PACKS[packId]) {
        const pack = JUDGMENT_CREDIT_PACKS[packId];
        creditsToBuy = pack.credits;
        packName = pack.name;
        basePrice = pack.basePrice;
        gstAmount = pack.gstAmount;
        totalPrice = pack.totalPrice;
      } else if (customCredits && typeof customCredits === "number" && customCredits >= CREDITS_PER_JUDGMENT_REPORT) {
        creditsToBuy = Math.floor(customCredits);
        packName = `Custom Pack (${creditsToBuy} Credits / ~${Math.floor(creditsToBuy / CREDITS_PER_JUDGMENT_REPORT)} Reports)`;
        basePrice = Math.round(creditsToBuy * JUDGMENT_CREDIT_RATE_INR * 100) / 100;
        gstAmount = Math.round(basePrice * (JUDGMENT_CREDIT_GST_PERCENT / 100) * 100) / 100;
        totalPrice = Math.round((basePrice + gstAmount) * 100) / 100;
      } else {
        return next(
          CustomErrorHandler.badRequest(
            `Please select a valid pack or enter at least ${CREDITS_PER_JUDGMENT_REPORT} credits.`
          )
        );
      }

      const amountInPaise = Math.round(totalPrice * 100);

      const order = await razorpayService.createOrder({
        amount: amountInPaise,
        currency: "INR",
        receipt: `jai_${Date.now().toString().slice(-8)}`,
        notes: {
          tenantId,
          credits: creditsToBuy.toString(),
          packName,
          rate: JUDGMENT_CREDIT_RATE_INR.toString(),
          basePrice: basePrice.toFixed(2),
          gstRate: `${JUDGMENT_CREDIT_GST_PERCENT}%`,
          gstAmount: gstAmount.toFixed(2),
          totalPrice: totalPrice.toFixed(2),
          userEmail: userEmail || "",
          type: "judgment_ai_credits",
        },
      });

      return res.status(200).send(
        ResponseHandler(200, "Payment order created successfully", {
          orderId: order.id,
          basePrice,
          gstPercent: JUDGMENT_CREDIT_GST_PERCENT,
          gstAmount,
          amount: totalPrice,
          currency: "INR",
          keyId: config.RAZORPAY_KEY_ID,
          credits: creditsToBuy,
          reportsCount: Math.floor(creditsToBuy / CREDITS_PER_JUDGMENT_REPORT),
          packName,
        })
      );
    } catch (err: unknown) {
      console.error("[judgmentAiController.createCreditOrder] Error:", err);
      return next(CustomErrorHandler.serverError("Failed to initiate credit payment"));
    }
  },

  /**
   * 6. POST /api/judgment-ai/verify-credit-payment
   * Verifies Razorpay payment signature and adds credits to tenant's pool
   */
  async verifyCreditPayment(req: Request, res: Response, next: NextFunction) {
    try {
      const tenantId = req.user?.tenantId;
      if (!tenantId) {
        return next(CustomErrorHandler.unAuthorized("Tenant ID missing"));
      }

      const {
        razorpay_order_id,
        razorpay_payment_id,
        razorpay_signature,
        credits,
        amount,
      } = req.body as {
        razorpay_order_id: string;
        razorpay_payment_id: string;
        razorpay_signature: string;
        credits: number;
        amount: number;
      };

      if (!razorpay_order_id || !razorpay_payment_id || !razorpay_signature || !credits) {
        return next(CustomErrorHandler.badRequest("Missing required payment verification fields"));
      }

      const isValid = razorpayService.verifyPayment({
        razorpayOrderId: razorpay_order_id,
        razorpayPaymentId: razorpay_payment_id,
        razorpaySignature: razorpay_signature,
      });

      if (!isValid) {
        return next(CustomErrorHandler.badRequest("Invalid payment signature verification"));
      }

      // Add credits to tenant subscription pool
      await db
        .update(tenantSubscriptions)
        .set({
          aiDraftAddonCredits: sql`${tenantSubscriptions.aiDraftAddonCredits} + ${credits}`,
        })
        .where(eq(tenantSubscriptions.tenantId, tenantId));

      // Record in payment history
      const subtotal = Math.round(credits * JUDGMENT_CREDIT_RATE_INR * 100) / 100;
      const gstAmount = Math.round(subtotal * (JUDGMENT_CREDIT_GST_PERCENT / 100) * 100) / 100;
      const finalAmount = amount || Math.round((subtotal + gstAmount) * 100) / 100;
      const invoiceNumber = `INV-JAI-${Date.now().toString().slice(-8)}`;

      await db.insert(subscriptionPaymentHistory).values({
        tenantId,
        invoiceNumber,
        planId: null,
        planName: `Judgment AI Credits: ${credits} Credits (${Math.floor(credits / CREDITS_PER_JUDGMENT_REPORT)} Reports) [+18% GST]`,
        amount: finalAmount.toString(),
        currency: "INR",
        status: "paid",
        paymentMethod: "razorpay",
        receiptUrl: null,
        transactionDate: new Date(),
      });

      return res.status(200).send(
        ResponseHandler(200, `Successfully purchased ${credits} Judgment AI credits!`, {
          creditsAdded: credits,
          invoiceNumber,
        })
      );
    } catch (err: unknown) {
      console.error("[judgmentAiController.verifyCreditPayment] Error:", err);
      return next(CustomErrorHandler.serverError("Payment verification failed"));
    }
  },

  /**
   * 7. GET /api/judgment-ai/lookup
   * Fast Neutral Citation resolver and cross-reference matcher (ultra lightweight)
   */
  async lookupCitation(req: Request, res: Response, next: NextFunction) {
    try {
      const { q } = req.query as { q?: string };
      if (!q || !q.trim()) {
        return res.status(200).json(
          ResponseHandler(200, "Query required", { results: [] })
        );
      }

      const cleanQuery = q.trim();
      const pattern = `%${cleanQuery}%`;

      const results = await db
        .select({
          id: courtJudgments.id,
          title: courtJudgments.title,
          citation: courtJudgments.citation,
          neutralCitation: courtJudgments.neutralCitation,
          equivalentCitations: courtJudgments.equivalentCitations,
          court: courtJudgments.court,
          courtLevel: courtJudgments.courtLevel,
          date: courtJudgments.date,
          decisionDate: courtJudgments.decisionDate,
          year: courtJudgments.year,
          bench: courtJudgments.bench,
          benchStrength: courtJudgments.benchStrength,
          actSection: courtJudgments.actSection,
          ratioDecidendi: courtJudgments.ratioDecidendi,
          url: courtJudgments.url,
          isFeatured: courtJudgments.isFeatured,
        })
        .from(courtJudgments)
        .where(
          or(
            ilike(courtJudgments.neutralCitation, pattern),
            ilike(courtJudgments.citation, pattern),
            ilike(courtJudgments.equivalentCitations, pattern),
            ilike(courtJudgments.title, pattern)
          )
        )
        .orderBy(desc(courtJudgments.year))
        .limit(8);

      return res.status(200).json(
        ResponseHandler(200, "Citation lookup successful", {
          results,
          query: cleanQuery,
        })
      );
    } catch (err) {
      console.error("[judgmentAiController.lookupCitation] Error:", err);
      return next(CustomErrorHandler.serverError("Citation lookup failed"));
    }
  },
};

export default judgmentAiController;
