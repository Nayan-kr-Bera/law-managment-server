import { and, eq, ne } from "drizzle-orm";
import { NextFunction, Request, Response } from "express";
import db from "../../db/index.js";
import { cases, empanelments } from "../../db/schema/index.js";
import ResponseHandler from "../../utils/responseHandler.js";
import CustomErrorHandler from "../../utils/customErrorHandler.js";
import slugify from "slugify";
const empanelmentsController = {
  async getempanelments(req: Request, res: Response, next: NextFunction) {
    const id = req.user.tenantId;
    try {
      const empanelmentsdata = await db.query.empanelments.findMany({
        where: eq(empanelments.tenantId, id),
        columns: {
          id: true,
          name: true,
          description: true,
          isActive: true,
        },
      });

      return res
        .status(200)
        .send(
          ResponseHandler(
            200,
            "empanelments fetched successfully",
            empanelmentsdata,
          ),
        );
    } catch (error) {
      console.error(error);
      return next(CustomErrorHandler.serverError());
    }
  },
  async createempanelments(req: Request, res: Response, next: NextFunction) {
    try {
      const { name, description, isActive } = req.body;
      const tenantId = req.user.tenantId;
      const slug = slugify(name, {
        lower: true,
        strict: true,
        trim: true,
      });
      if (!name) {
        return next(
          CustomErrorHandler.badRequest("empanelments name is required"),
        );
      }

      // Check duplicate name
      const existingempanelments = await db.query.empanelments.findFirst({
        where: eq(empanelments.slug, slug),
      });

      if (existingempanelments) {
        return next(
          CustomErrorHandler.badRequest("empanelments already exists"),
        );
      }

      await db.insert(empanelments).values({
        name,
        slug,
        tenantId,
        isActive,
        description,
      });

      return res
        .status(201)
        .send(ResponseHandler(201, "empanelments created successfully"));
    } catch (error) {
      console.log(error);
      return next(CustomErrorHandler.serverError());
    }
  },
  async updateempanelments(req: Request, res: Response, next: NextFunction) {
    try {
      const { id } = req.params;
      const tenantId = req.user.tenantId;
      const { name, description, isActive } = req.body;
      const slug = slugify(name, {
        lower: true,
        strict: true,
        trim: true,
      });

      if (!id) {
        return next(
          CustomErrorHandler.badRequest("empanelments id is required"),
        );
      }

      const empanelmentsdata = await db.query.empanelments.findFirst({
        where: and(
          eq(empanelments.id, id),
          eq(empanelments.tenantId, tenantId),
        ),
      });

      if (!empanelmentsdata) {
        return next(CustomErrorHandler.notFound("empanelments not found"));
      }
      if (slug && slug !== empanelmentsdata.slug) {
        const duplicateName = await db.query.empanelments.findFirst({
          where: and(
            eq(empanelments.slug, slug),
            eq(empanelments.tenantId, tenantId),
            ne(empanelments.id, id),
          ),
        });
        if (duplicateName) {
          return next(
            CustomErrorHandler.badRequest("empanelments name already exists"),
          );
        }
      }
      await db
        .update(empanelments)
        .set({
          name,
          isActive,
          slug,
          description,
        })
        .where(eq(empanelments.id, id));

      return res
        .status(200)
        .send(ResponseHandler(200, "empanelments updated successfully"));
    } catch (error) {
      console.error(error);
      return next(CustomErrorHandler.serverError());
    }
  },
  async deleteempanelments(req: Request, res: Response, next: NextFunction) {
    try {
      const { id } = req.params;
      const tenantId = req.user.tenantId;

      if (!id) {
        return next(
          CustomErrorHandler.badRequest("empanelments id is required"),
        );
      }

      // Check empanelments exists
      const empanelmentsdata = await db.query.empanelments.findFirst({
        where: and(
          eq(empanelments.id, id),
          eq(empanelments.tenantId, tenantId),
        ),
      });

      if (!empanelmentsdata) {
        return next(CustomErrorHandler.notFound("empanelments not found"));
      }

      // Check if any case is using this empanelments
      const assignedCase = await db.query.cases.findFirst({
        where: and(eq(cases.empanelmentId, id), eq(cases.tenantId, tenantId)),
      });

      if (assignedCase) {
        return next(
          CustomErrorHandler.badRequest(
            "empanelments is assigned to one or more cases. Remove or update those cases first.",
          ),
        );
      }

      await db
        .delete(empanelments)
        .where(
          and(eq(empanelments.id, id), eq(empanelments.tenantId, tenantId)),
        );

      return res
        .status(200)
        .send(ResponseHandler(200, "empanelments deleted successfully"));
    } catch (error) {
      console.error(error);
      return next(CustomErrorHandler.serverError());
    }
  },
};

export default empanelmentsController;
