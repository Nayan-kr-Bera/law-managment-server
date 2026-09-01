import { and, eq, ne } from "drizzle-orm";
import { NextFunction, Request, Response } from "express";
import db from "../../db/index.js";
import { cases, caseTypes } from "../../db/schema/index.js";
import ResponseHandler from "../../utils/responseHandler.js";
import CustomErrorHandler from "../../utils/customErrorHandler.js";
import slugify from "slugify";
const caseTypeController = {
  async getcaseTypes(req: Request, res: Response, next: NextFunction) {
    const id = req.user.tenantId;

    if (!id) {
      return next(CustomErrorHandler.badRequest("Tenant id is required"));
    }
    try {
      const caseTypedata = await db.query.caseTypes.findMany({
        where: eq(caseTypes.tenantId, id),
        columns: {
          id: true,
          name: true,
          description: true,
          createdAt: true,
          isActive: true,
        },
      });

      return res
        .status(200)
        .send(
          ResponseHandler(200, "caseTypes fetched successfully", caseTypedata),
        );
    } catch (error) {
      console.error(error);
      return next(CustomErrorHandler.serverError());
    }
  },
  async createcaseType(req: Request, res: Response, next: NextFunction) {
    try {
      const { name, description, isActive } = req.body;
      const slug = slugify(name, {
        lower: true,
        strict: true,
        trim: true,
      });
      const id = req.user.tenantId;
      if (!name) {
        return next(CustomErrorHandler.badRequest("caseType name is required"));
      }

      // Check duplicate name
      const existingcaseType = await db.query.caseTypes.findFirst({
        where: and(eq(caseTypes.tenantId, id), eq(caseTypes.slug, slug)),
      });

      if (existingcaseType) {
        return next(CustomErrorHandler.badRequest("caseType already exists"));
      }

      await db.insert(caseTypes).values({
        name: name.toLowerCase(),
        tenantId: id,
        slug,
        description,
        isActive,
      });

      return res
        .status(201)
        .send(ResponseHandler(201, "caseType created successfully"));
    } catch (error) {
      console.log(error);
      return next(CustomErrorHandler.serverError());
    }
  },
  async updatecaseType(req: Request, res: Response, next: NextFunction) {
    try {
      const { id } = req.params;
      const tenantId = req.user.tenantId;
      const { name, description, isActive } = req.body;
      const slug = name
        ? slugify(name, {
            lower: true,
            strict: true,
            trim: true,
          })
        : undefined;
      if (!id) {
        return next(CustomErrorHandler.badRequest("caseType id is required"));
      }

      const caseType = await db.query.caseTypes.findFirst({
        where: and(eq(caseTypes.id, id), eq(caseTypes.tenantId, tenantId)),
      });

      if (!caseType) {
        return next(CustomErrorHandler.notFound("caseType not found"));
      }

      if (slug && slug !== caseType.slug) {
        {
          const duplicateName = await db.query.caseTypes.findFirst({
            where: and(
              eq(caseTypes.slug, slug),
              eq(caseTypes.tenantId, tenantId),
              ne(caseTypes.id, id),
            ),
          });

          if (duplicateName) {
            return next(
              CustomErrorHandler.badRequest("caseType name already exists"),
            );
          }
        }
      }

      await db
        .update(caseTypes)
        .set({
          name,
          isActive,
          slug,
          description,
        })
        .where(eq(caseTypes.id, id));

      return res
        .status(200)
        .send(ResponseHandler(200, "caseType updated successfully"));
    } catch (error) {
      console.error(error);
      return next(CustomErrorHandler.serverError());
    }
  },
  async deleteCaseType(req: Request, res: Response, next: NextFunction) {
    try {
      const { id } = req.params;
      const tenantId = req.user.tenantId;

      if (!id) {
        return next(CustomErrorHandler.badRequest("Case Type id is required"));
      }

      // Check case type exists
      const caseType = await db.query.caseTypes.findFirst({
        where: and(eq(caseTypes.id, id), eq(caseTypes.tenantId, tenantId)),
      });

      if (!caseType) {
        return next(CustomErrorHandler.notFound("Case Type not found"));
      }

      // Check if any case is using this case type
      const assignedCase = await db.query.cases.findFirst({
        where: and(eq(cases.caseTypeId, id), eq(cases.tenantId, tenantId)),
      });

      if (assignedCase) {
        return next(
          CustomErrorHandler.badRequest(
            "Case Type is assigned to one or more cases. Remove or update those cases first.",
          ),
        );
      }

      await db
        .delete(caseTypes)
        .where(and(eq(caseTypes.id, id), eq(caseTypes.tenantId, tenantId)));

      return res
        .status(200)
        .send(ResponseHandler(200, "Case Type deleted successfully"));
    } catch (error) {
      console.error(error);
      return next(CustomErrorHandler.serverError());
    }
  },
};

export default caseTypeController;
