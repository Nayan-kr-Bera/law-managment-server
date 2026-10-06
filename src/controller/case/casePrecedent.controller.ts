import { and, desc, eq } from "drizzle-orm";
import { type NextFunction, type Request, type Response } from "express";
import db from "../../db/index.js";
import { casePrecedents, cases } from "../../db/schema/index.js";
import CustomErrorHandler from "../../utils/customErrorHandler.js";
import ResponseHandler from "../../utils/responseHandler.js";

export const casePrecedentController = {
  /**
   * 1. GET /api/case-precedents/case/:caseId
   * Fetch all judicial precedents and neutral citations attached to a case
   */
  async getCasePrecedents(req: Request, res: Response, next: NextFunction) {
    try {
      const tenantId = req.user?.tenantId;
      if (!tenantId) {
        return next(CustomErrorHandler.unAuthorized("Tenant authentication required"));
      }

      const { caseId } = req.params;
      if (!caseId) {
        return next(CustomErrorHandler.badRequest("Case ID is required"));
      }

      const list = await db
        .select()
        .from(casePrecedents)
        .where(
          and(
            eq(casePrecedents.tenantId, tenantId),
            eq(casePrecedents.caseId, caseId)
          )
        )
        .orderBy(desc(casePrecedents.createdAt));

      return res.status(200).json(
        ResponseHandler(200, "Case precedents retrieved successfully", list)
      );
    } catch (err) {
      console.error("[casePrecedentController.getCasePrecedents] Error:", err);
      return next(CustomErrorHandler.serverError("Failed to fetch case precedents"));
    }
  },

  /**
   * 2. POST /api/case-precedents
   * Attach a court judgment or neutral citation to a client case
   */
  async attachPrecedent(req: Request, res: Response, next: NextFunction) {
    try {
      const tenantId = req.user?.tenantId;
      const userId = req.user?.userId;
      if (!tenantId) {
        return next(CustomErrorHandler.unAuthorized("Tenant authentication required"));
      }

      const {
        caseId,
        judgmentId,
        title,
        citation,
        neutralCitation,
        equivalentCitations,
        court,
        bench,
        actSection,
        ratioDecidendi,
        url,
        relevanceTag = "Precedent",
        notes,
        pinnedInPleadings = false,
      } = req.body as {
        caseId: string;
        judgmentId?: string;
        title: string;
        citation?: string;
        neutralCitation?: string;
        equivalentCitations?: string;
        court?: string;
        bench?: string;
        actSection?: string;
        ratioDecidendi?: string;
        url?: string;
        relevanceTag?: string;
        notes?: string;
        pinnedInPleadings?: boolean;
      };

      if (!caseId || !title) {
        return next(CustomErrorHandler.badRequest("Case ID and Judgment Title are required"));
      }

      // Verify case belongs to tenant
      const caseExists = await db.query.cases.findFirst({
        where: and(eq(cases.id, caseId), eq(cases.tenantId, tenantId)),
      });

      if (!caseExists) {
        return next(CustomErrorHandler.notFound("Target case matter not found"));
      }

      const [inserted] = await db
        .insert(casePrecedents)
        .values({
          tenantId,
          caseId,
          judgmentId: judgmentId || null,
          title: title.trim(),
          citation: citation?.trim() || null,
          neutralCitation: neutralCitation?.trim() || null,
          equivalentCitations: equivalentCitations?.trim() || null,
          court: court?.trim() || null,
          bench: bench?.trim() || null,
          actSection: actSection?.trim() || null,
          ratioDecidendi: ratioDecidendi?.trim() || null,
          url: url?.trim() || null,
          relevanceTag: relevanceTag.trim(),
          notes: notes?.trim() || null,
          pinnedInPleadings: Boolean(pinnedInPleadings),
          createdBy: userId || null,
        })
        .returning();

      return res.status(201).json(
        ResponseHandler(201, "Precedent successfully attached to case file", {
          data: inserted,
        })
      );
    } catch (err) {
      console.error("[casePrecedentController.attachPrecedent] Error:", err);
      return next(CustomErrorHandler.serverError("Failed to attach precedent to case"));
    }
  },

  /**
   * 3. PATCH /api/case-precedents/:id
   * Update advocate's notes or relevance tag for an attached precedent
   */
  async updatePrecedent(req: Request, res: Response, next: NextFunction) {
    try {
      const tenantId = req.user?.tenantId;
      const { id } = req.params;

      if (!tenantId) {
        return next(CustomErrorHandler.unAuthorized("Tenant authentication required"));
      }
      if (!id) {
        return next(CustomErrorHandler.badRequest("Precedent ID is required"));
      }

      const { notes, relevanceTag, pinnedInPleadings } = req.body as {
        notes?: string;
        relevanceTag?: string;
        pinnedInPleadings?: boolean;
      };

      const updateData: Record<string, unknown> = {};
      if (notes !== undefined) updateData.notes = notes.trim();
      if (relevanceTag !== undefined) updateData.relevanceTag = relevanceTag.trim();
      if (pinnedInPleadings !== undefined) updateData.pinnedInPleadings = Boolean(pinnedInPleadings);

      const [updated] = await db
        .update(casePrecedents)
        .set(updateData)
        .where(
          and(
            eq(casePrecedents.id, id),
            eq(casePrecedents.tenantId, tenantId)
          )
        )
        .returning();

      if (!updated) {
        return next(CustomErrorHandler.notFound("Precedent record not found"));
      }

      return res.status(200).json(
        ResponseHandler(200, "Precedent updated successfully", {
          data: updated,
        })
      );
    } catch (err) {
      console.error("[casePrecedentController.updatePrecedent] Error:", err);
      return next(CustomErrorHandler.serverError("Failed to update precedent"));
    }
  },

  /**
   * 4. DELETE /api/case-precedents/:id
   * Remove an attached precedent from a case file
   */
  async removePrecedent(req: Request, res: Response, next: NextFunction) {
    try {
      const tenantId = req.user?.tenantId;
      const { id } = req.params;

      if (!tenantId) {
        return next(CustomErrorHandler.unAuthorized("Tenant authentication required"));
      }
      if (!id) {
        return next(CustomErrorHandler.badRequest("Precedent ID is required"));
      }

      const [deleted] = await db
        .delete(casePrecedents)
        .where(
          and(
            eq(casePrecedents.id, id),
            eq(casePrecedents.tenantId, tenantId)
          )
        )
        .returning();

      if (!deleted) {
        return next(CustomErrorHandler.notFound("Precedent record not found"));
      }

      return res.status(200).json(
        ResponseHandler(200, "Precedent removed from case file", {
          id,
        })
      );
    } catch (err) {
      console.error("[casePrecedentController.removePrecedent] Error:", err);
      return next(CustomErrorHandler.serverError("Failed to remove precedent"));
    }
  },
};

export default casePrecedentController;
