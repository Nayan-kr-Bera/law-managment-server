import { and, eq, isNull } from "drizzle-orm";
import { Request, Response, NextFunction } from "express";

import db from "../../db/index.js";
import { caseDocuments, documentFolders } from "../../db/schema/index.js";

import CustomErrorHandler from "../../utils/customErrorHandler.js";
import ResponseHandler from "../../utils/responseHandler.js";

const documentFolderController = {
  async createFolder(
    req: Request,
    res: Response,
    next: NextFunction,
  ) {
    try {
      const tenantId = req.user?.tenantId;
      const userId = req.user?.userId;
      const officeId = req.officeId;

      if (!tenantId) {
        return next(
          CustomErrorHandler.unAuthorized(
            "Tenant information is missing",
          ),
        );
      }

      if (!userId) {
        return next(
          CustomErrorHandler.unAuthorized(
            "User information is missing",
          ),
        );
      }

      const {
        name,
        caseId,
        parentId,
      } = req.body;

      if (!name) {
        return next(
          CustomErrorHandler.badRequest(
            "Folder name is required",
          ),
        );
      }

      if (parentId) {
        const [parentFolder] = await db
          .select({
            id: documentFolders.id,
          })
          .from(documentFolders)
          .where(
            and(
              eq(documentFolders.id, parentId),
              eq(documentFolders.tenantId, tenantId),
            ),
          );

        if (!parentFolder) {
          return next(
            CustomErrorHandler.notFound(
              "Parent folder not found",
            ),
          );
        }
      }

      const [folder] = await db
        .insert(documentFolders)
        .values({
          tenantId,
          officeId: officeId || null,
          caseId: caseId || null,
          parentId: parentId || null,
          name,
          createdBy: userId,
        })
        .returning();

      return res
        .status(201)
        .send(
          ResponseHandler(
            201,
            "Folder created successfully",
            folder,
          ),
        );
    } catch (error) {
      console.error(
        "Create document folder error:",
        error,
      );

      return next(
        CustomErrorHandler.serverError(),
      );
    }
  },

  async getFolders(
    req: Request,
    res: Response,
    next: NextFunction,
  ) {
    try {
      const tenantId = req.user?.tenantId;

      if (!tenantId) {
        return next(
          CustomErrorHandler.unAuthorized(
            "Tenant information is missing",
          ),
        );
      }

      const {
        caseId,
        officeId,
        parentId,
      } = req.query;

      const conditions = [
        eq(documentFolders.tenantId, tenantId),
      ];

      if (caseId) {
        conditions.push(
          eq(
            documentFolders.caseId,
            caseId as string,
          ),
        );
      }

      if (officeId) {
        conditions.push(
          eq(
            documentFolders.officeId,
            officeId as string,
          ),
        );
      }

      if (parentId === "root") {
        conditions.push(
          isNull(documentFolders.parentId),
        );
      } else if (parentId) {
        conditions.push(
          eq(
            documentFolders.parentId,
            parentId as string,
          ),
        );
      }

      const folders = await db
        .select()
        .from(documentFolders)
        .where(and(...conditions));

      return res
        .status(200)
        .send(
          ResponseHandler(
            200,
            "Folders fetched successfully",
            folders,
          ),
        );
    } catch (error) {
      console.error(
        "Get document folders error:",
        error,
      );

      return next(
        CustomErrorHandler.serverError(),
      );
    }
  },

  async getFolderById(
    req: Request,
    res: Response,
    next: NextFunction,
  ) {
    try {
      const tenantId = req.user?.tenantId;
      const { id } = req.params;

      if (!tenantId) {
        return next(
          CustomErrorHandler.unAuthorized(
            "Tenant information is missing",
          ),
        );
      }

      const [folder] = await db
        .select()
        .from(documentFolders)
        .where(
          and(
            eq(documentFolders.id, id),
            eq(documentFolders.tenantId, tenantId),
          ),
        );

      if (!folder) {
        return next(
          CustomErrorHandler.notFound(
            "Folder not found",
          ),
        );
      }

      return res
        .status(200)
        .send(
          ResponseHandler(
            200,
            "Folder fetched successfully",
            folder,
          ),
        );
    } catch (error) {
      console.error(
        "Get document folder error:",
        error,
      );

      return next(
        CustomErrorHandler.serverError(),
      );
    }
  },

  async updateFolder(
    req: Request,
    res: Response,
    next: NextFunction,
  ) {
    try {
      const tenantId = req.user?.tenantId;
      const { id } = req.params;

      if (!tenantId) {
        return next(
          CustomErrorHandler.unAuthorized(
            "Tenant information is missing",
          ),
        );
      }

      const {
        name,
        parentId,
      } = req.body;

      const [existingFolder] = await db
        .select()
        .from(documentFolders)
        .where(
          and(
            eq(documentFolders.id, id),
            eq(documentFolders.tenantId, tenantId),
          ),
        );

      if (!existingFolder) {
        return next(
          CustomErrorHandler.notFound(
            "Folder not found",
          ),
        );
      }

      if (parentId) {
        if (parentId === id) {
          return next(
            CustomErrorHandler.badRequest(
              "Folder cannot be its own parent",
            ),
          );
        }

        const [parentFolder] = await db
          .select({
            id: documentFolders.id,
          })
          .from(documentFolders)
          .where(
            and(
              eq(documentFolders.id, parentId),
              eq(documentFolders.tenantId, tenantId),
            ),
          );

        if (!parentFolder) {
          return next(
            CustomErrorHandler.notFound(
              "Parent folder not found",
            ),
          );
        }
      }

      const [updatedFolder] = await db
        .update(documentFolders)
        .set({
          ...(name !== undefined && { name }),
          ...(parentId !== undefined && {
            parentId: parentId || null,
          }),
        })
        .where(
          and(
            eq(documentFolders.id, id),
            eq(documentFolders.tenantId, tenantId),
          ),
        )
        .returning();

      return res
        .status(200)
        .send(
          ResponseHandler(
            200,
            "Folder updated successfully",
            updatedFolder,
          ),
        );
    } catch (error) {
      console.error(
        "Update document folder error:",
        error,
      );

      return next(
        CustomErrorHandler.serverError(),
      );
    }
  },

  async deleteFolder(
    req: Request,
    res: Response,
    next: NextFunction,
  ) {
    try {
      const tenantId = req.user?.tenantId;
      const { id } = req.params;

      if (!tenantId) {
        return next(
          CustomErrorHandler.unAuthorized(
            "Tenant information is missing",
          ),
        );
      }

      const [folder] = await db
        .select({
          id: documentFolders.id,
        })
        .from(documentFolders)
        .where(
          and(
            eq(documentFolders.id, id),
            eq(documentFolders.tenantId, tenantId),
          ),
        );

      if (!folder) {
        return next(
          CustomErrorHandler.notFound(
            "Folder not found",
          ),
        );
      }

      await db
        .update(caseDocuments)
        .set({
          folderId: null,
        })
        .where(
          and(
            eq(caseDocuments.folderId, id),
            eq(caseDocuments.tenantId, tenantId),
          ),
        );

      await db
        .update(documentFolders)
        .set({
          parentId: null,
        })
        .where(
          and(
            eq(documentFolders.parentId, id),
            eq(documentFolders.tenantId, tenantId),
          ),
        );

      await db
        .delete(documentFolders)
        .where(
          and(
            eq(documentFolders.id, id),
            eq(documentFolders.tenantId, tenantId),
          ),
        );

      return res
        .status(200)
        .send(
          ResponseHandler(
            200,
            "Folder deleted successfully",
            null,
          ),
        );
    } catch (error) {
      console.error(
        "Delete document folder error:",
        error,
      );

      return next(
        CustomErrorHandler.serverError(),
      );
    }
  },
};

export default documentFolderController;