import { and, count, eq, isNull, sql, ilike, inArray } from "drizzle-orm";
import { Request, Response, NextFunction } from "express";

import db from "../../db/index.js";
import {
  caseDocuments,
  documentFolders,
  tenants,
  clients,
  cases,
  caseClients,
  tenantSubscriptions,
} from "../../db/schema/index.js";

import CustomErrorHandler from "../../utils/customErrorHandler.js";
import ResponseHandler from "../../utils/responseHandler.js";

import {
  deleteCloudinaryDocumentFile,
  uploadFileToCloudinary,
} from "../../services/cloudinary.service.js";
import ocrService from "../../services/ocr.service.js";
import ocrQueueService from "../../services/ocrQueue.service.js";

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
      const userId = req.user?.userId || req.user?.id;
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

      // Pre-check monthly OCR page limit from subscription
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
      const monthlyLimit = isInternal
        ? 999999
        : subscription?.plan?.monthlyOcrPages ?? 0;
      const currentUsed = subscription?.ocrPagesUsedThisMonth ?? 0;

      if (!isInternal && monthlyLimit <= 0) {
        return next(
          CustomErrorHandler.forbidden(
            "Your current subscription plan does not include OCR brief indexing. Upgrade to Professional (500 pages/mo) or Law Firm (1,500 pages/mo).",
          ),
        );
      }

      if (!isInternal && currentUsed >= monthlyLimit) {
        return next(
          CustomErrorHandler.forbidden(
            `Monthly OCR page limit reached (${currentUsed}/${monthlyLimit} pages used). Please wait for next billing cycle or upgrade your plan.`,
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
            monthlyLimit,
            currentUsed,
            queueStatus: ocrQueueService.getStatus(),
          },
        ),
      );
    } catch (error) {
      console.error("Trigger OCR error:", error);
      return next(CustomErrorHandler.serverError());
    }
  },

  // GET TENANT OCR QUOTA & USAGE
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
      const monthlyLimit = isInternal
        ? 999999
        : subscription?.plan?.monthlyOcrPages ?? 0;
      const pagesUsed = subscription?.ocrPagesUsedThisMonth ?? 0;
      const remainingPages = Math.max(0, monthlyLimit - pagesUsed);

      return res.status(200).send(
        ResponseHandler(200, "OCR quota retrieved successfully", {
          planCode: subscription?.plan?.code || "none",
          planName: subscription?.plan?.name || "No Plan",
          monthlyLimit,
          pagesUsed,
          remainingPages,
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

      const filters: any[] = [
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
};

export default caseDocumentController;
