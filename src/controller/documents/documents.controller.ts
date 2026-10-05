import { and, count, eq, ilike, inArray, isNull, sql, SQL } from "drizzle-orm";
import { NextFunction, Request, Response } from "express";

import db from "../../db/index.js";
import {
  caseClients,
  caseDocuments,
  cases,
  documentFolders,
  subscriptionPaymentHistory,
  tenants,
  tenantSubscriptions
} from "../../db/schema/index.js";

import CustomErrorHandler from "../../utils/customErrorHandler.js";
import ResponseHandler from "../../utils/responseHandler.js";

import { config } from "../../config/index.js";
import {
  OCR_CREDIT_GST_PERCENT,
  OCR_CREDIT_PACKS,
  OCR_CREDIT_RATE_INR,
  OCR_CREDITS_PER_PAGE,
} from "../../constants/ocrCreditPacks.js";
import {
  deleteCloudinaryDocumentFile,
  uploadFileToCloudinary,
} from "../../services/cloudinary.service.js";
import ocrQueueService from "../../services/ocrQueue.service.js";
import razorpayService from "../../services/razorpay.service.js";

const caseDocumentController = {
  // UPLOAD DOCUMENT

  async uploadDocument(req: Request, res: Response, next: NextFunction) {
    let uploadedFile: {
      publicId: string;
      resourceType: "image";
    } | null = null;

    try {
      let tenantId = req.user?.tenantId || null;
      let userId = req.user?.userId || null;
      let officeId = req.officeId || req.body.officeId || null;
      const { caseId, folderId, isConfidential, isPrivate } = req.body;

      // If client user context, verify client belongs to the case
      if (req.clientUser && caseId) {
        const clientAccess = await db.query.caseClients.findFirst({
          where: and(
            eq(caseClients.caseId, caseId),
            eq(caseClients.clientId, req.clientUser.clientId)
          ),
        });
        if (!clientAccess) {
          return next(
            CustomErrorHandler.unAuthorized(
              "Access denied: You are not assigned to this case"
            )
          );
        }
      }

      // Derive tenantId & officeId directly from target Case record if provided
      if (caseId) {
        const caseRecord = await db.query.cases.findFirst({
          where: eq(cases.id, caseId),
          columns: { tenantId: true, officeId: true },
        });
        if (caseRecord) {
          tenantId = caseRecord.tenantId;
          officeId = caseRecord.officeId;
        }
      }

      // If client user context and still no tenantId, resolve from JWT token payload
      if (!tenantId && req.clientUser?.tenantId) {
        tenantId = req.clientUser.tenantId;
        officeId = officeId || req.clientUser.officeId || null;
      }

      if (!tenantId) {
        return next(
          CustomErrorHandler.unAuthorized("Tenant information is missing"),
        );
      }

      if (!userId && !req.clientUser) {
        return next(
          CustomErrorHandler.unAuthorized("User information is missing"),
        );
      }

      // FILE

      const file = req.file;

      if (!file) {
        return next(CustomErrorHandler.badRequest("File is required"));
      }

      if (folderId) {
        const [folder] = await db
          .select({ id: documentFolders.id, caseId: documentFolders.caseId })
          .from(documentFolders)
          .where(
            and(
              eq(documentFolders.id, folderId),
              eq(documentFolders.tenantId, tenantId),
            ),
          );

        if (!folder) {
          return next(CustomErrorHandler.notFound("Document folder not found"));
        }

        if ((folder.caseId ?? null) !== (caseId || null)) {
          return next(
            CustomErrorHandler.badRequest(
              "Folder does not belong to the selected document scope",
            ),
          );
        }
      }

      // UPLOAD TO CLOUDINARY

      const cloudinaryResult = await uploadFileToCloudinary({
        buffer: file.buffer,
        originalName: file.originalname,
        mimetype: file.mimetype,
        folder: `tenants/${tenantId}/${caseId ? `cases/${caseId}` : "general"}`,
      });

      uploadedFile = {
        publicId: cloudinaryResult.publicId,
        resourceType: cloudinaryResult.resourceType,
      };

      // ACTUAL FILE SIZE

      const actualFileSize = cloudinaryResult.bytes;

      // UPDATE TENANT STORAGE
      //
      // Middleware already checked the limit.
      //
      // This update only records the actual Cloudinary
      // file size.
      //

      await db
        .update(tenants)
        .set({
          storageUsedBytes: sql`
            ${tenants.storageUsedBytes}
            + ${actualFileSize}
          `,
          updatedAt: new Date(),
        })
        .where(eq(tenants.id, tenantId));

      // SAVE DOCUMENT

      const [document] = await db
        .insert(caseDocuments)
        .values({
          tenantId,

          officeId: officeId || null,

          caseId: caseId || null,

          // Optional
          // null = document directly under case
          // UUID = document belongs to folder
          folderId: folderId || null,

          uploadedBy: userId || null,

          fileName: file.originalname,

          originalName: file.originalname,

          fileUrl: cloudinaryResult.secureUrl,

          mimeType: file.mimetype,

          fileSize: actualFileSize,

          cloudinaryPublicId: cloudinaryResult.publicId,

          cloudinaryResourceType: cloudinaryResult.resourceType,

          isConfidential: isConfidential === "true" || isConfidential === true,

          isPrivate: isPrivate === "true" || isPrivate === true,

          version: 1,
        })
        .returning();

      // RESPONSE

      return res
        .status(201)
        .send(ResponseHandler(201, "Document uploaded successfully", document));
    } catch (error) {
      console.error("Case document upload error:", error);

      // CLOUDINARY CLEANUP

      if (uploadedFile) {
        try {
          await deleteCloudinaryDocumentFile(uploadedFile.publicId);
        } catch (deleteError) {
          console.error("Failed to cleanup Cloudinary file:", deleteError);
        }
      }

      return next(CustomErrorHandler.serverError());
    }
  },

  async deleteDocument(req: Request, res: Response, next: NextFunction) {
    try {
      const { id } = req.params;

      const tenantId = req.user?.tenantId;

      if (!tenantId) {
        return next(
          CustomErrorHandler.unAuthorized("Tenant information is missing"),
        );
      }

      // FIND DOCUMENT

      const [document] = await db
        .select({
          id: caseDocuments.id,
          tenantId: caseDocuments.tenantId,
          fileSize: caseDocuments.fileSize,
          cloudinaryPublicId: caseDocuments.cloudinaryPublicId,
          cloudinaryResourceType: caseDocuments.cloudinaryResourceType,
        })
        .from(caseDocuments)
        .where(
          and(eq(caseDocuments.id, id), eq(caseDocuments.tenantId, tenantId)),
        );

      if (!document) {
        return next(CustomErrorHandler.notFound("Document not found"));
      }

      // DELETE FROM CLOUDINARY

      if (document.cloudinaryPublicId && document.cloudinaryResourceType) {
        await deleteCloudinaryDocumentFile(
          document.cloudinaryPublicId,
          document.cloudinaryResourceType as "image",
        );
      }

      // DECREASE TENANT STORAGE

      const fileSize = Number(document.fileSize ?? 0);

      if (fileSize > 0) {
        await db
          .update(tenants)
          .set({
            storageUsedBytes: sql`
            GREATEST(
              ${tenants.storageUsedBytes} - ${fileSize},
              0
            )
          `,
            updatedAt: new Date(),
          })
          .where(eq(tenants.id, tenantId));
      }

      // DELETE DATABASE RECORD

      const [deletedDocument] = await db
        .delete(caseDocuments)
        .where(
          and(eq(caseDocuments.id, id), eq(caseDocuments.tenantId, tenantId)),
        )
        .returning({
          id: caseDocuments.id,
        });

      if (!deletedDocument) {
        return next(CustomErrorHandler.notFound("Document not found"));
      }

      // RESPONSE

      return res
        .status(200)
        .send(
          ResponseHandler(
            200,
            "Document deleted successfully",
            deletedDocument,
          ),
        );
    } catch (error) {
      console.error("Delete document error:", error);

      return next(CustomErrorHandler.serverError());
    }
  },

  // GENERAL DOCUMENT EXPLORER
  async getGeneralDocuments(req: Request, res: Response, next: NextFunction) {
    try {
      const tenantId = req.user?.tenantId;

      if (!tenantId) {
        return next(
          CustomErrorHandler.unAuthorized("Tenant information is missing"),
        );
      }

      const { folderId } = req.query;

      // FOLDER CONDITION
      const folderCondition = folderId
        ? eq(documentFolders.parentId, folderId as string)
        : isNull(documentFolders.parentId);

      // GET FOLDERS
      const folders = await db
        .select()
        .from(documentFolders)
        .where(
          and(
            eq(documentFolders.tenantId, tenantId),

            // General folders only
            isNull(documentFolders.caseId),

            folderCondition,
          ),
        );

      // DOCUMENT CONDITION
      const documentCondition = folderId
        ? eq(caseDocuments.folderId, folderId as string)
        : isNull(caseDocuments.folderId);

      // GET DOCUMENTS

      const documents = await db
        .select()
        .from(caseDocuments)
        .where(
          and(
            eq(caseDocuments.tenantId, tenantId),

            // General documents only
            isNull(caseDocuments.caseId),

            documentCondition,
          ),
        );

      // RESPONSE
      return res.status(200).send(
        ResponseHandler(200, "General documents fetched successfully", {
          folderId: folderId || null,
          folders,
          documents,
        }),
      );
    } catch (error) {
      console.error("Get general documents error:", error);

      return next(CustomErrorHandler.serverError());
    }
  },

  // CASE DOCUMENT EXPLORER
  async getCaseDocuments(req: Request, res: Response, next: NextFunction) {
    try {
      const tenantId = req.user?.tenantId;
      const { caseId } = req.params;
      const { folderId, includeAll } = req.query;

      if (!tenantId) {
        return next(
          CustomErrorHandler.unAuthorized("Tenant information is missing"),
        );
      }

      if (!caseId) {
        return next(CustomErrorHandler.badRequest("Case ID is required"));
      }

      // TOTAL DOCUMENT COUNT FOR THE CASE
      const totalDocsResult = await db
        .select({ total: count() })
        .from(caseDocuments)
        .where(
          and(
            eq(caseDocuments.tenantId, tenantId),
            eq(caseDocuments.caseId, caseId),
          ),
        );

      const totalDocumentCount = Number(totalDocsResult[0]?.total || 0);

      // FOLDER CONDITION
      const folderCondition = folderId
        ? eq(documentFolders.parentId, folderId as string)
        : isNull(documentFolders.parentId);

      // GET FOLDERS
      const folders = await db
        .select()
        .from(documentFolders)
        .where(
          and(
            eq(documentFolders.tenantId, tenantId),
            eq(documentFolders.caseId, caseId),
            folderCondition,
          ),
        );

      // DOCUMENT CONDITION
      const documentCondition = includeAll === "true"
        ? undefined
        : folderId
          ? eq(caseDocuments.folderId, folderId as string)
          : isNull(caseDocuments.folderId);

      const docWhereFilters = [
        eq(caseDocuments.tenantId, tenantId),
        eq(caseDocuments.caseId, caseId),
      ];

      if (documentCondition) {
        docWhereFilters.push(documentCondition);
      }

      // GET DOCUMENTS
      const documents = await db
        .select()
        .from(caseDocuments)
        .where(and(...docWhereFilters));

      // RESPONSE
      return res.status(200).send(
        ResponseHandler(200, "Case documents fetched successfully", {
          caseId,
          folderId: folderId || null,
          totalDocumentCount,
          folders,
          documents,
        }),
      );
    } catch (error) {
      console.error("Get case documents error:", error);

      return next(CustomErrorHandler.serverError());
    }
  },

  // TRIGGER OCR EXTRACTION (Asynchronously queued, page quota verified)
  async triggerOcr(req: Request, res: Response, next: NextFunction) {
    try {
      const { id } = req.params;
      const tenantId = req.user?.tenantId;
      const userId = req.user?.userId;
      const userEmail = req.user?.email;
      const userName = req.user?.email ? req.user.email.split("@")[0] : "Advocate";
      const { language } = req.body || {};

      if (!tenantId) {
        return next(
          CustomErrorHandler.unAuthorized("Tenant information is missing"),
        );
      }

      const [document] = await db
        .select()
        .from(caseDocuments)
        .where(
          and(eq(caseDocuments.id, id), eq(caseDocuments.tenantId, tenantId)),
        );

      if (!document) {
        return next(CustomErrorHandler.notFound("Document not found"));
      }

      // Pre-check monthly and addon OCR credits from subscription
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
      const monthlyCreditLimit = isInternal
        ? 9999990
        : (subscription?.plan?.monthlyOcrCredits ?? ((subscription?.plan?.monthlyOcrPages ?? 0) * OCR_CREDITS_PER_PAGE));
      const monthlyPageLimit = Math.floor(monthlyCreditLimit / OCR_CREDITS_PER_PAGE);
      const currentCreditsUsed = subscription?.ocrCreditsUsedThisMonth ?? ((subscription?.ocrPagesUsedThisMonth ?? 0) * OCR_CREDITS_PER_PAGE);
      const currentPagesUsed = Math.floor(currentCreditsUsed / OCR_CREDITS_PER_PAGE);
      const remainingMonthlyCredits = isInternal
        ? 9999990
        : Math.max(0, monthlyCreditLimit - currentCreditsUsed);
      const addonCredits = subscription?.ocrAddonCredits ?? 0;
      const totalAvailableCredits = isInternal
        ? 9999990
        : remainingMonthlyCredits + addonCredits;

      if (!isInternal && totalAvailableCredits < OCR_CREDITS_PER_PAGE) {
        return next(
          CustomErrorHandler.forbidden(
            `Insufficient OCR credits (${totalAvailableCredits} credits available). Each page requires ${OCR_CREDITS_PER_PAGE} credits. Please top up OCR credits (₹${OCR_CREDIT_RATE_INR}/credit) or upgrade your plan.`,
          ),
        );
      }

      // Mark document as 'pending'
      await db
        .update(caseDocuments)
        .set({
          ocrStatus: "pending",
          ocrLanguage: language || document.ocrLanguage || "eng+hin",
          ocrError: null,
        })
        .where(eq(caseDocuments.id, id));

      // Push to isolated OCR Queue (Worker executes in background without slowing down the API)
      ocrQueueService.addJob({
        documentId: id,
        tenantId,
        userId: userId || "",
        userEmail: userEmail || null,
        userName,
        language: language || document.ocrLanguage || "eng+hin",
      });

      return res.status(202).send(
        ResponseHandler(
          202,
          `OCR extraction queued for processing. You will receive an email notification at ${userEmail || "your registered email"} once completed.`,
          {
            documentId: id,
            ocrStatus: "pending",
            monthlyLimit: monthlyPageLimit,
            monthlyCreditLimit,
            currentUsed: currentPagesUsed,
            currentCreditsUsed,
            totalAvailableCredits,
            queueStatus: ocrQueueService.getStatus(),
          },
        ),
      );
    } catch (error) {
      console.error("Trigger OCR error:", error);
      return next(CustomErrorHandler.serverError());
    }
  },

  // GET TENANT OCR QUOTA & USAGE (Credit basis: 10 credits / page)
  async getOcrQuota(req: Request, res: Response, next: NextFunction) {
    try {
      const tenantId = req.user?.tenantId;
      if (!tenantId) {
        return next(
          CustomErrorHandler.unAuthorized("Tenant information is missing"),
        );
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
      const monthlyCreditLimit = isInternal
        ? 9999990
        : (subscription?.plan?.monthlyOcrCredits ?? ((subscription?.plan?.monthlyOcrPages ?? 0) * OCR_CREDITS_PER_PAGE));
      const monthlyPageLimit = Math.floor(monthlyCreditLimit / OCR_CREDITS_PER_PAGE);
      let creditsUsed = subscription?.ocrCreditsUsedThisMonth ?? ((subscription?.ocrPagesUsedThisMonth ?? 0) * OCR_CREDITS_PER_PAGE);
      let addonCredits = subscription?.ocrAddonCredits ?? 0;

      // Check monthly cycle reset
      if (subscription?.ocrCycleResetDate) {
        const now = new Date();
        const resetDate = new Date(subscription.ocrCycleResetDate);
        if (now > resetDate) {
          creditsUsed = 0;
          addonCredits = 0;
          const nextReset = new Date(now.getTime() + 30 * 24 * 60 * 60 * 1000);
          await db
            .update(tenantSubscriptions)
            .set({
              ocrCreditsUsedThisMonth: 0,
              ocrPagesUsedThisMonth: 0,
              ocrAddonCredits: 0,
              ocrCycleResetDate: nextReset.toISOString().split("T")[0],
            })
            .where(eq(tenantSubscriptions.id, subscription.id));
        }
      }

      const pagesUsed = Math.floor(creditsUsed / OCR_CREDITS_PER_PAGE);
      const remainingMonthlyCredits = isInternal
        ? 9999990
        : Math.max(0, monthlyCreditLimit - creditsUsed);
      const totalAvailableCredits = isInternal
        ? 9999990
        : remainingMonthlyCredits + addonCredits;
      const remainingPages = isInternal
        ? 999999
        : Math.floor(totalAvailableCredits / OCR_CREDITS_PER_PAGE);

      return res.status(200).send(
        ResponseHandler(200, "OCR quota retrieved successfully", {
          planCode: subscription?.plan?.code || "none",
          planName: subscription?.plan?.name || "No Plan",
          monthlyLimit: monthlyPageLimit,
          monthlyPageLimit,
          monthlyCreditLimit,
          pagesUsed,
          creditsUsed,
          remainingMonthlyCredits,
          addonCredits,
          totalAvailableCredits,
          remainingPages,
          ratePerCredit: OCR_CREDIT_RATE_INR,
          creditsPerPage: OCR_CREDITS_PER_PAGE,
          resetDate:
            subscription?.ocrCycleResetDate ||
            subscription?.nextBillingDate ||
            null,
          queueStatus: ocrQueueService.getStatus(),
        }),
      );
    } catch (error) {
      console.error("Get OCR quota error:", error);
      return next(CustomErrorHandler.serverError());
    }
  },

  // GET OCR CREDIT PACKS & PRICING (₹2.00 / credit, 10 credits / page)
  async getOcrCreditPacks(req: Request, res: Response, next: NextFunction) {
    try {
      return res.status(200).json({
        success: true,
        data: {
          ratePerCredit: OCR_CREDIT_RATE_INR,
          creditsPerPage: OCR_CREDITS_PER_PAGE,
          gstPercent: OCR_CREDIT_GST_PERCENT,
          packs: Object.values(OCR_CREDIT_PACKS),
        },
      });
    } catch (err) {
      console.error("[caseDocumentController.getOcrCreditPacks] Error:", err);
      return next(CustomErrorHandler.serverError("Failed to fetch OCR credit packs"));
    }
  },

  // CREATE RAZORPAY PAYMENT ORDER FOR OCR CREDITS
  async createOcrCreditOrder(req: Request, res: Response, next: NextFunction) {
    try {
      const tenantId = req.user?.tenantId;
      const userEmail = req.user?.email;

      if (!tenantId) {
        return next(CustomErrorHandler.unAuthorized("Tenant authentication missing"));
      }

      const { packId, customCredits } = req.body;
      let credits = 0;
      let baseAmount = 0;
      let packName = "";

      if (packId && OCR_CREDIT_PACKS[packId]) {
        const pack = OCR_CREDIT_PACKS[packId];
        credits = pack.credits;
        baseAmount = pack.basePrice;
        packName = pack.name;
      } else if (customCredits && Number(customCredits) >= 10) {
        credits = Math.round(Number(customCredits));
        baseAmount = credits * OCR_CREDIT_RATE_INR;
        packName = `Custom Pack (${credits} Credits / ${Math.floor(credits / OCR_CREDITS_PER_PAGE)} Pages)`;
      } else {
        return next(
          CustomErrorHandler.badRequest(
            "Please select a valid OCR credit pack or specify at least 10 credits.",
          ),
        );
      }

      const gstAmount = Math.round(baseAmount * (OCR_CREDIT_GST_PERCENT / 100) * 100) / 100;
      const totalPayable = Math.round((baseAmount + gstAmount) * 100) / 100;
      const amountInPaise = Math.round(totalPayable * 100);

      const order = await razorpayService.createOrder({
        amount: amountInPaise,
        currency: "INR",
        receipt: `ocr_cr_${Date.now().toString().slice(-8)}`,
        notes: {
          tenantId,
          credits: credits.toString(),
          type: "ocr_credit_addon",
          userEmail: userEmail || "",
        },
      });

      return res.status(200).send(
        ResponseHandler(200, "OCR credit payment order created", {
          orderId: order.id,
          amount: totalPayable,
          currency: "INR",
          keyId: config.RAZORPAY_KEY_ID,
          credits,
          packName,
          baseAmount,
          gstAmount,
        }),
      );
    } catch (err: unknown) {
      console.error("[caseDocumentController.createOcrCreditOrder] Error:", err);
      return next(CustomErrorHandler.serverError("Failed to initiate credit payment order"));
    }
  },

  // VERIFY RAZORPAY PAYMENT FOR OCR CREDITS
  async verifyOcrCreditPayment(req: Request, res: Response, next: NextFunction) {
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
          ocrAddonCredits: sql`${tenantSubscriptions.ocrAddonCredits} + ${credits}`,
        })
        .where(eq(tenantSubscriptions.tenantId, tenantId));

      // Record in subscriptionPaymentHistory
      const subtotal = Math.round(credits * OCR_CREDIT_RATE_INR * 100) / 100;
      const gstAmount = Math.round(subtotal * (OCR_CREDIT_GST_PERCENT / 100) * 100) / 100;
      const finalAmount = amount || Math.round((subtotal + gstAmount) * 100) / 100;
      const pagesCount = Math.floor(credits / OCR_CREDITS_PER_PAGE);
      const invoiceNumber = `INV-OCR-${Date.now().toString().slice(-8)}`;

      await db.insert(subscriptionPaymentHistory).values({
        tenantId,
        invoiceNumber,
        planId: null,
        planName: `OCR Brief Addon: ${credits} Credits (${pagesCount} Pages) [+18% GST]`,
        amount: finalAmount.toString(),
        currency: "INR",
        status: "paid",
        paymentMethod: "razorpay",
        receiptUrl: null,
        transactionDate: new Date(),
      });

      return res.status(200).send(
        ResponseHandler(200, `Successfully purchased ${credits} OCR credits (${pagesCount} Pages)!`, {
          creditsAdded: credits,
          pagesAdded: pagesCount,
          invoiceNumber,
        }),
      );
    } catch (err: unknown) {
      console.error("[caseDocumentController.verifyOcrCreditPayment] Error:", err);
      return next(CustomErrorHandler.serverError("Payment verification failed"));
    }
  },

  // OCR FULL-TEXT SEARCH (Fast query on PostgreSQL indexed text)
  async searchOcr(req: Request, res: Response, next: NextFunction) {
    try {
      const tenantId = req.user?.tenantId;
      const { q, caseId } = req.query;

      if (!tenantId) {
        return next(
          CustomErrorHandler.unAuthorized("Tenant information is missing"),
        );
      }

      const searchQuery = ((q as string) || "").trim();
      if (!searchQuery) {
        return res.status(200).send(
          ResponseHandler(200, "No search query provided", {
            results: [],
            total: 0,
          }),
        );
      }

      const filters: SQL[] = [
        eq(caseDocuments.tenantId, tenantId),
        eq(caseDocuments.ocrStatus, "completed"),
        ilike(caseDocuments.ocrText, `%${searchQuery}%`),
      ];

      if (caseId) {
        filters.push(eq(caseDocuments.caseId, caseId as string));
      }

      const matchedDocs = await db
        .select({
          id: caseDocuments.id,
          fileName: caseDocuments.fileName,
          originalName: caseDocuments.originalName,
          fileUrl: caseDocuments.fileUrl,
          fileSize: caseDocuments.fileSize,
          mimeType: caseDocuments.mimeType,
          caseId: caseDocuments.caseId,
          folderId: caseDocuments.folderId,
          ocrStatus: caseDocuments.ocrStatus,
          ocrProcessedAt: caseDocuments.ocrProcessedAt,
          ocrLanguage: caseDocuments.ocrLanguage,
          ocrText: caseDocuments.ocrText,
        })
        .from(caseDocuments)
        .where(and(...filters))
        .limit(50);

      // Create highlight snippets around the search query
      const results = matchedDocs.map((doc) => {
        const text = doc.ocrText || "";
        const lowerText = text.toLowerCase();
        const lowerQ = searchQuery.toLowerCase();
        const matchIndex = lowerText.indexOf(lowerQ);

        let snippet = "";
        if (matchIndex !== -1) {
          const start = Math.max(0, matchIndex - 80);
          const end = Math.min(
            text.length,
            matchIndex + searchQuery.length + 80,
          );
          snippet =
            (start > 0 ? "..." : "") +
            text.slice(start, end).replace(/\s+/g, " ") +
            (end < text.length ? "..." : "");
        } else {
          snippet = text.slice(0, 160).replace(/\s+/g, " ") + "...";
        }

        return {
          id: doc.id,
          fileName: doc.fileName,
          originalName: doc.originalName,
          fileUrl: doc.fileUrl,
          fileSize: doc.fileSize,
          mimeType: doc.mimeType,
          caseId: doc.caseId,
          folderId: doc.folderId,
          ocrStatus: doc.ocrStatus,
          ocrProcessedAt: doc.ocrProcessedAt,
          snippet,
        };
      });

      return res.status(200).send(
        ResponseHandler(200, "OCR search completed", {
          query: searchQuery,
          total: results.length,
          results,
        }),
      );
    } catch (error) {
      console.error("Search OCR error:", error);
      return next(CustomErrorHandler.serverError());
    }
  },

  // GET DOCUMENT BY ID (with OCR text & Case context)
  async getDocumentById(req: Request, res: Response, next: NextFunction) {
    try {
      const tenantId = req.user?.tenantId || null;
      const { id } = req.params;

      if (!id) {
        return next(CustomErrorHandler.badRequest("Document ID is required"));
      }

      const doc = await db.query.caseDocuments.findFirst({
        where: and(
          eq(caseDocuments.id, id),
          tenantId ? eq(caseDocuments.tenantId, tenantId) : undefined,
        ),
        with: {
          case: {
            columns: {
              id: true,
              caseNumber: true,
              title: true,
              courtId: true,
            },
          },
        },
      });

      if (!doc) {
        return next(CustomErrorHandler.notFound("Document not found"));
      }

      return res.status(200).send(
        ResponseHandler(200, "Document fetched successfully", doc),
      );
    } catch (error) {
      console.error("Get document by ID error:", error);
      return next(CustomErrorHandler.serverError());
    }
  },
};

export default caseDocumentController;
