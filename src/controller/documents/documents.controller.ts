import { and, eq, isNull, sql } from "drizzle-orm";
import { Request, Response, NextFunction } from "express";

import db from "../../db/index.js";
import {
  caseDocuments,
  documentFolders,
  tenants,
  clients,
  cases,
} from "../../db/schema/index.js";

import CustomErrorHandler from "../../utils/customErrorHandler.js";
import ResponseHandler from "../../utils/responseHandler.js";

import {
  deleteCloudinaryDocumentFile,
  uploadFileToCloudinary,
} from "../../services/cloudinary.service.js";

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

      // If client user context, resolve tenantId & officeId from client profile
      if (!tenantId && req.clientUser?.clientId) {
        const clientRecord = await db.query.clients.findFirst({
          where: eq(clients.id, req.clientUser.clientId),
          columns: { tenantId: true, officeId: true },
        });

        if (clientRecord) {
          tenantId = clientRecord.tenantId;
          officeId = officeId || clientRecord.officeId;
        }
      }

      // Fallback: derive tenantId & officeId from target Case record if provided
      if (!tenantId && caseId) {
        const caseRecord = await db.query.cases.findFirst({
          where: eq(cases.id, caseId),
          columns: { tenantId: true, officeId: true },
        });
        if (caseRecord) {
          tenantId = caseRecord.tenantId;
          officeId = officeId || caseRecord.officeId;
        }
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
      const { folderId } = req.query;

      if (!tenantId) {
        return next(
          CustomErrorHandler.unAuthorized("Tenant information is missing"),
        );
      }

      if (!caseId) {
        return next(CustomErrorHandler.badRequest("Case ID is required"));
      }

      const docWhereFilters = [
        eq(caseDocuments.tenantId, tenantId),
        eq(caseDocuments.caseId, caseId),
      ];

      // Filter by folderId only if explicitly requested
      if (folderId) {
        docWhereFilters.push(eq(caseDocuments.folderId, folderId as string));
      }

      // GET DOCUMENTS
      const documents = await db
        .select()
        .from(caseDocuments)
        .where(and(...docWhereFilters));

      // GET FOLDERS
      const folders = await db
        .select()
        .from(documentFolders)
        .where(
          and(
            eq(documentFolders.tenantId, tenantId),
            eq(documentFolders.caseId, caseId),
          ),
        );

      // RESPONSE
      return res.status(200).send(
        ResponseHandler(200, "Case documents fetched successfully", {
          caseId,
          folderId: folderId || null,
          folders,
          documents,
        }),
      );
    } catch (error) {
      console.error("Get case documents error:", error);

      return next(CustomErrorHandler.serverError());
    }
  },
};

export default caseDocumentController;
