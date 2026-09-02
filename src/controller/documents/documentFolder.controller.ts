import { and, eq, isNull } from "drizzle-orm";
import { Request, Response, NextFunction } from "express";

import db from "../../db/index.js";
import { caseDocuments, documentFolders } from "../../db/schema/index.js";

import CustomErrorHandler from "../../utils/customErrorHandler.js";
import ResponseHandler from "../../utils/responseHandler.js";

const documentFolderController = {
    
  // CREATE FOLDER
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

      // CHECK PARENT FOLDER

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

      // CREATE
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

  // GET FOLDERS
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

      // CASE FILTER

      if (caseId) {
        conditions.push(
          eq(
            documentFolders.caseId,
            caseId as string,
          ),
        );
      }

      // OFFICE FILTER

      if (officeId) {
        conditions.push(
          eq(
            documentFolders.officeId,
            officeId as string,
          ),
        );
      }

      // PARENT FILTER
      //
      // parentId = folder UUID
      //             → children of that folder
      //
      // parentId = "root"
      //             → top-level folders
      //

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

  // GET FOLDER BY ID
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

  // UPDATE FOLDER
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

      // FIND FOLDER

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

      // CHECK PARENT

      if (parentId) {
        // Folder cannot be its own parent
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

      // UPDATE

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

  // DELETE FOLDER
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

      // FIND FOLDER

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

      // 1. REASSIGN ALL DOCUMENTS IN THIS FOLDER TO ROOT LEVEL (folderId = null)
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

      // 2. REASSIGN ANY SUBFOLDERS TO ROOT LEVEL (parentId = null)
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

      // 3. DELETE FOLDER
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