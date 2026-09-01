import { and, eq, ne } from "drizzle-orm";
import { NextFunction, Request, Response } from "express";
import db from "../../db/index.js";
import { cases, underSections } from "../../db/schema/index.js";
import ResponseHandler from "../../utils/responseHandler.js";
import CustomErrorHandler from "../../utils/customErrorHandler.js";
import slugify from "slugify";
const underSectionController = {
  async getunderSections(req: Request, res: Response, next: NextFunction) {
    const tenantId = req.user.tenantId;
    try {
      const underSectiondata = await db.query.underSections.findMany({
        where: eq(underSections.tenantId, tenantId),
        columns: {
          id: true,
          actName: true,
          description: true,
          section: true,
        },
      });

      return res
        .status(200)
        .send(
          ResponseHandler(
            200,
            "underSections fetched successfully",
            underSectiondata,
          ),
        );
    } catch (error) {
      console.error(error);
      return next(CustomErrorHandler.serverError());
    }
  },
  async createunderSection(req: Request, res: Response, next: NextFunction) {
    try {
      const { actName, section, description } = req.body;
      const tenantId = req.user.tenantId;
      const slug = slugify(actName, {
        lower: true,
        strict: true,
        trim: true,
      });

      if (!actName) {
        return next(
          CustomErrorHandler.badRequest("underSection actName is required"),
        );
      }

      // Check duplicate name
      const existingunderSection = await db.query.underSections.findFirst({
        where: eq(underSections.slug, slug),
      });

      if (existingunderSection) {
        return next(
          CustomErrorHandler.badRequest("underSection already exists"),
        );
      }

      await db.insert(underSections).values({
        actName,
        section,
        slug,
        tenantId,
        description,
      });

      return res
        .status(201)
        .send(ResponseHandler(201, "underSection created successfully"));
    } catch (error) {
      console.log(error);
      return next(CustomErrorHandler.serverError());
    }
  },
  async updateunderSection(req: Request, res: Response, next: NextFunction) {
    try {
      const { id } = req.params;
      const tenantId = req.user.tenantId;
      const { actName, section, description } = req.body;
      const slug = slugify(actName, {
        lower: true,
        strict: true,
        trim: true,
      });
      if (!id) {
        return next(
          CustomErrorHandler.badRequest("underSection id is required"),
        );
      }

      const underSection = await db.query.underSections.findFirst({
        where: and(
          eq(underSections.id, id),
          eq(underSections.tenantId, tenantId),
        ),
      });

      if (!underSection) {
        return next(CustomErrorHandler.notFound("underSection not found"));
      }
      if (slug && slug !== underSection.slug) {
        const duplicateName = await db.query.underSections.findFirst({
          where: and(
            eq(underSections.slug, slug),
            eq(underSections.tenantId, tenantId),
            ne(underSections.id, id),
          ),
        });

        if (duplicateName) {
          return next(
            CustomErrorHandler.badRequest(
              "underSection actName already exists",
            ),
          );
        }
      }
      await db
        .update(underSections)
        .set({
          actName,
          section,
          slug,
          description,
        })
        .where(eq(underSections.id, id));

      return res
        .status(200)
        .send(ResponseHandler(200, "underSection updated successfully"));
    } catch (error) {
      console.error(error);
      return next(CustomErrorHandler.serverError());
    }
  },
  async deleteunderSection(req: Request, res: Response, next: NextFunction) {
    try {
      const { id } = req.params;
      const tenantId = req.user.tenantId;

      if (!id) {
        return next(CustomErrorHandler.badRequest("Case Type id is required"));
      }

      // Check case type exists
      const underSection = await db.query.underSections.findFirst({
        where: and(
          eq(underSections.id, id),
          eq(underSections.tenantId, tenantId),
        ),
      });

      if (!underSection) {
        return next(CustomErrorHandler.notFound("Case Type not found"));
      }

      // Check if any case is using this case type
      const assignedCase = await db.query.cases.findFirst({
        where: and(eq(cases.underSectionId, id), eq(cases.tenantId, tenantId)),
      });

      if (assignedCase) {
        return next(
          CustomErrorHandler.badRequest(
            "Case Type is assigned to one or more cases. Remove or update those cases first.",
          ),
        );
      }

      await db
        .delete(underSections)
        .where(
          and(eq(underSections.id, id), eq(underSections.tenantId, tenantId)),
        );

      return res
        .status(200)
        .send(ResponseHandler(200, "Case Type deleted successfully"));
    } catch (error) {
      console.error(error);
      return next(CustomErrorHandler.serverError());
    }
  },
};

export default underSectionController;
