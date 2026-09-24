import { Request, Response, NextFunction } from "express";
import { and, eq, inArray, sql, desc } from "drizzle-orm";
import db from "../../db/index.js";
import {
  aiDrafts,
  cases,
  caseDocuments,
  courts,
  policeStations,
  underSections,
  tenantSubscriptions,
  subscriptionPaymentHistory,
} from "../../db/schema/index.js";
import CustomErrorHandler from "../../utils/customErrorHandler.js";
import ResponseHandler from "../../utils/responseHandler.js";
import aiDrafterService from "../../services/aiDrafter.service.js";
import razorpayService from "../../services/razorpay.service.js";
import { AI_CREDIT_PACKS } from "../../constants/aiCreditPacks.js";
import { config } from "../../config/index.js";

const aiDraftController = {
  // 1. GENERATE DRAFT
  async generateDraft(req: Request, res: Response, next: NextFunction) {
    try {
      const tenantId = req.user?.tenantId;
      const userId = req.user?.userId;
      const officeId = (req as any).officeId || null;

      if (!tenantId || !userId) {
        return next(CustomErrorHandler.unAuthorized("User authentication details missing"));
      }

      const {
        caseId,
        documentType,
        language = "English",
        facts,
        referenceDocumentIds = [],
        additionalInstructions,
      } = req.body;

      if (!documentType || !documentType.trim()) {
        return next(CustomErrorHandler.badRequest("Document type is required"));
      }

      if (!facts || !facts.trim()) {
        return next(CustomErrorHandler.badRequest("Facts & instructions are required"));
      }

      // Load Case Context if selected
      let caseDetails = null;
      if (caseId) {
        const [caseRecord] = await db
          .select({
            id: cases.id,
            title: cases.title,
            caseNumber: cases.caseNumber,
            courtName: courts.name,
            policeStation: policeStations.name,
            underSectionName: underSections.actName,
            sectionNumber: underSections.section,
          })
          .from(cases)
          .leftJoin(courts, eq(cases.courtId, courts.id))
          .leftJoin(policeStations, eq(cases.policeStationId, policeStations.id))
          .leftJoin(underSections, eq(cases.underSectionId, underSections.id))
          .where(and(eq(cases.id, caseId), eq(cases.tenantId, tenantId)));

        if (caseRecord) {
          caseDetails = {
            caseNumber: caseRecord.caseNumber,
            title: caseRecord.title,
            courtName: caseRecord.courtName,
            policeStation: caseRecord.policeStation,
            underSections: caseRecord.underSectionName
              ? `${caseRecord.underSectionName} (Section ${caseRecord.sectionNumber || "N/A"})`
              : null,
            clientName: null,
            oppositeParty: null,
          };
        }
      }

      // Load Reference Documents OCR Text if selected
      let referenceDocumentsText: string[] = [];
      if (Array.isArray(referenceDocumentIds) && referenceDocumentIds.length > 0) {
        const docs = await db
          .select({
            id: caseDocuments.id,
            originalName: caseDocuments.originalName,
            fileName: caseDocuments.fileName,
            ocrText: caseDocuments.ocrText,
          })
          .from(caseDocuments)
          .where(
            and(
              inArray(caseDocuments.id, referenceDocumentIds),
              eq(caseDocuments.tenantId, tenantId),
            ),
          );

        referenceDocumentsText = docs
          .map((d) => {
            const title = d.originalName || d.fileName;
            const text = d.ocrText?.trim();
            if (text) {
              return `[Document: ${title}]\n${text}`;
            }
            return `[Document: ${title}] (No OCR text available)`;
          })
          .filter(Boolean);
      }

      // Call AI Service
      const draftResult = await aiDrafterService.generateDraft({
        caseDetails,
        documentType,
        language,
        facts,
        referenceDocumentsText,
        additionalInstructions,
      });

      // Deduct quota
      const quota = req.aiDraftQuota;
      if (quota && !quota.isInternal) {
        const remainingMonthly = Math.max(0, quota.monthlyLimit - quota.currentUsed);
        if (remainingMonthly > 0) {
          // Use from monthly quota
          await db
            .update(tenantSubscriptions)
            .set({
              aiDraftsUsedThisMonth: sql`${tenantSubscriptions.aiDraftsUsedThisMonth} + 1`,
            })
            .where(eq(tenantSubscriptions.id, quota.subscriptionId));
        } else if (quota.addonCredits > 0) {
          // Use from add-on credit pack
          await db
            .update(tenantSubscriptions)
            .set({
              aiDraftAddonCredits: sql`GREATEST(0, ${tenantSubscriptions.aiDraftAddonCredits} - 1)`,
            })
            .where(eq(tenantSubscriptions.id, quota.subscriptionId));
        }
      }

      // Save generated draft to DB
      const [savedDraft] = await db
        .insert(aiDrafts)
        .values({
          tenantId,
          officeId: officeId || null,
          caseId: caseId || null,
          createdBy: userId,
          documentType,
          title: caseDetails?.title ? `${documentType} - ${caseDetails.title}` : documentType,
          language,
          prompt: facts,
          generatedContent: draftResult.content,
        })
        .returning();

      return res.status(200).send(
        ResponseHandler(200, "Draft generated successfully", {
          id: savedDraft?.id,
          content: draftResult.content,
          documentType,
          language,
          modelUsed: draftResult.modelUsed,
          isAiGenerated: draftResult.isAiGenerated,
          createdAt: savedDraft?.createdAt,
        }),
      );
    } catch (err: any) {
      console.error("[aiDraftController.generateDraft] Error:", err);
      return next(CustomErrorHandler.serverError(err?.message || "Failed to generate draft"));
    }
  },

  // 2. GET QUOTA & PRICING PACKS
  async getQuota(req: Request, res: Response, next: NextFunction) {
    try {
      const tenantId = req.user?.tenantId;
      if (!tenantId) {
        return next(CustomErrorHandler.unAuthorized("Tenant ID missing"));
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

      const isInternal = subscription?.plan?.code === "internal";
      const monthlyLimit = isInternal ? 999999 : (subscription?.plan?.monthlyAiDrafts ?? 0);
      const usedThisMonth = subscription?.aiDraftsUsedThisMonth ?? 0;
      const addonCredits = subscription?.aiDraftAddonCredits ?? 0;
      const remainingMonthly = Math.max(0, monthlyLimit - usedThisMonth);
      const totalRemaining = isInternal ? 999999 : remainingMonthly + addonCredits;

      return res.status(200).send(
        ResponseHandler(200, "AI draft quota retrieved successfully", {
          planCode: subscription?.plan?.code || "none",
          planName: subscription?.plan?.name || "No Plan",
          monthlyLimit,
          usedThisMonth,
          remainingMonthly,
          addonCredits,
          totalRemaining,
          isInternal,
          resetDate: subscription?.aiDraftCycleResetDate || subscription?.nextBillingDate || null,
          creditPacks: Object.values(AI_CREDIT_PACKS),
        }),
      );
    } catch (err) {
      console.error("[aiDraftController.getQuota] Error:", err);
      return next(CustomErrorHandler.serverError("Failed to fetch AI draft quota"));
    }
  },

  // 3. CREATE RAZORPAY ORDER FOR ADD-ON DRAFTS
  async createCreditOrder(req: Request, res: Response, next: NextFunction) {
    try {
      const tenantId = req.user?.tenantId;
      const userEmail = req.user?.email;

      if (!tenantId) {
        return next(CustomErrorHandler.unAuthorized("Tenant ID missing"));
      }

      const { packId } = req.body;
      const pack = AI_CREDIT_PACKS[packId];
      if (!pack) {
        return next(
          CustomErrorHandler.badRequest(
            "Invalid pack selected. Valid options: pack_15, pack_60, pack_180, pack_600",
          ),
        );
      }

      const amountInPaise = Math.round(pack.totalPrice * 100);

      const order = await razorpayService.createOrder({
        amount: amountInPaise,
        currency: "INR",
        receipt: `ai_cr_${Date.now().toString().slice(-8)}`,
        notes: {
          tenantId,
          packId: pack.id,
          drafts: pack.drafts.toString(),
          userEmail: userEmail || "",
          type: "ai_draft_addon",
        },
      });

      return res.status(200).send(
        ResponseHandler(200, "Payment order created successfully", {
          orderId: order.id,
          amount: pack.totalPrice,
          currency: "INR",
          keyId: config.RAZORPAY_KEY_ID,
          pack,
        }),
      );
    } catch (err: any) {
      console.error("[aiDraftController.createCreditOrder] Error:", err);
      return next(CustomErrorHandler.serverError("Failed to initiate credit payment"));
    }
  },

  // 4. VERIFY RAZORPAY PAYMENT FOR ADD-ON CREDITS
  async verifyCreditPayment(req: Request, res: Response, next: NextFunction) {
    try {
      const tenantId = req.user?.tenantId;
      if (!tenantId) {
        return next(CustomErrorHandler.unAuthorized("Tenant ID missing"));
      }

      const { razorpay_order_id, razorpay_payment_id, razorpay_signature, packId } = req.body;

      if (!razorpay_order_id || !razorpay_payment_id || !razorpay_signature || !packId) {
        return next(CustomErrorHandler.badRequest("Missing required payment verification fields"));
      }

      const pack = AI_CREDIT_PACKS[packId];
      if (!pack) {
        return next(CustomErrorHandler.badRequest("Invalid credit pack ID"));
      }

      const isValid = razorpayService.verifyPayment({
        razorpayOrderId: razorpay_order_id,
        razorpayPaymentId: razorpay_payment_id,
        razorpaySignature: razorpay_signature,
      });

      if (!isValid) {
        return next(CustomErrorHandler.badRequest("Invalid payment signature verification"));
      }

      // Add credits to tenant subscription
      await db
        .update(tenantSubscriptions)
        .set({
          aiDraftAddonCredits: sql`${tenantSubscriptions.aiDraftAddonCredits} + ${pack.drafts}`,
        })
        .where(eq(tenantSubscriptions.tenantId, tenantId));

      // Record in subscriptionPaymentHistory
      const invoiceNumber = `INV-AI-${Date.now().toString().slice(-8)}`;
      await db.insert(subscriptionPaymentHistory).values({
        tenantId,
        invoiceNumber,
        planId: null,
        planName: `AI Draft Addon: ${pack.name} (${pack.drafts} Drafts)`,
        amount: pack.totalPrice.toString(),
        currency: "INR",
        status: "paid",
        paymentMethod: "razorpay",
        receiptUrl: null,
        transactionDate: new Date(),
      });

      return res.status(200).send(
        ResponseHandler(200, `Successfully purchased ${pack.drafts} AI Draft credits!`, {
          creditsAdded: pack.drafts,
          invoiceNumber,
        }),
      );
    } catch (err: any) {
      console.error("[aiDraftController.verifyCreditPayment] Error:", err);
      return next(CustomErrorHandler.serverError("Payment verification failed"));
    }
  },

  // 5. GET DRAFT HISTORY
  async getDraftHistory(req: Request, res: Response, next: NextFunction) {
    try {
      const tenantId = req.user?.tenantId;
      if (!tenantId) {
        return next(CustomErrorHandler.unAuthorized("Tenant ID missing"));
      }

      const history = await db
        .select({
          id: aiDrafts.id,
          title: aiDrafts.title,
          documentType: aiDrafts.documentType,
          language: aiDrafts.language,
          createdAt: aiDrafts.createdAt,
          generatedContent: aiDrafts.generatedContent,
          caseId: aiDrafts.caseId,
        })
        .from(aiDrafts)
        .where(eq(aiDrafts.tenantId, tenantId))
        .orderBy(desc(aiDrafts.createdAt))
        .limit(20);

      return res.status(200).send(
        ResponseHandler(200, "Draft history retrieved successfully", history),
      );
    } catch (err) {
      console.error("[aiDraftController.getDraftHistory] Error:", err);
      return next(CustomErrorHandler.serverError("Failed to fetch draft history"));
    }
  },
};

export default aiDraftController;
