import { and, eq, ne } from "drizzle-orm";
import { NextFunction, Request, Response } from "express";
import db from "../../db/index.js";
import { cases, companies } from "../../db/schema/index.js";
import ResponseHandler from "../../utils/responseHandler.js";
import CustomErrorHandler from "../../utils/customErrorHandler.js";
import slugify from "slugify";
const companiesController = {
  async getcompanies(req: Request, res: Response, next: NextFunction) {
    const tenantId = req.user.tenantId;

    try {
      const companiedata = await db.query.companies.findMany({
        where: eq(companies.tenantId, tenantId),
        columns: {
          id: true,
          name: true,
          createdAt: true,
        },
      });

      return res
        .status(200)
        .send(
          ResponseHandler(200, "companies fetched successfully", companiedata),
        );
    } catch (error) {
      console.error(error);
      return next(CustomErrorHandler.serverError());
    }
  },
  async createcompanie(req: Request, res: Response, next: NextFunction) {
    try {
      const { name } = req.body;
      const tenantId = req.user.tenantId;
      const slug = slugify(name, {
        lower: true,
        strict: true,
        trim: true,
      });
      if (!name) {
        return next(CustomErrorHandler.badRequest("companie name is required"));
      }

      // Check duplicate name
      const existingcompanie = await db.query.companies.findFirst({
        where: eq(companies.slug, slug),
      });

      if (existingcompanie) {
        return next(CustomErrorHandler.badRequest("companie already exists"));
      }

      await db.insert(companies).values({
        name,
        slug,
        tenantId,
      });

      return res
        .status(201)
        .send(ResponseHandler(201, "companie created successfully"));
    } catch (error) {
      console.log(error);
      return next(CustomErrorHandler.serverError());
    }
  },
  async updatecompanie(req: Request, res: Response, next: NextFunction) {
    try {
      const { id } = req.params;
      const tenantId = req.user.tenantId;
      const { name } = req.body;
      const slug = slugify(name, {
        lower: true,
        strict: true,
        trim: true,
      });
      if (!id) {
        return next(CustomErrorHandler.badRequest("companie id is required"));
      }

      const companie = await db.query.companies.findFirst({
        where: and(eq(companies.id, id), eq(companies.tenantId, tenantId)),
      });

      if (!companie) {
        return next(CustomErrorHandler.notFound("companie not found"));
      }

      if (slug && slug !== companie.slug) {
        const duplicateName = await db.query.companies.findFirst({
          where: and(
            eq(companies.slug, slug),
            eq(companies.tenantId, tenantId),
            ne(companies.id, id),
          ),
        });

        if (duplicateName) {
          return next(
            CustomErrorHandler.badRequest("companie name already exists"),
          );
        }
      }
      await db
        .update(companies)
        .set({
          name,
          slug,
        })
        .where(eq(companies.id, id));

      return res
        .status(200)
        .send(ResponseHandler(200, "companie updated successfully"));
    } catch (error) {
      console.error(error);
      return next(CustomErrorHandler.serverError());
    }
  },
  async deletecompanie(req: Request, res: Response, next: NextFunction) {
    try {
      const { id } = req.params;
      const tenantId = req.user.tenantId;

      if (!id) {
        return next(CustomErrorHandler.badRequest("Case Type id is required"));
      }

      // Check case type exists
      const companie = await db.query.companies.findFirst({
        where: and(eq(companies.id, id), eq(companies.tenantId, tenantId)),
      });

      if (!companie) {
        return next(CustomErrorHandler.notFound("Case Type not found"));
      }

      // Check if any case is using this case type
      const assignedCase = await db.query.cases.findFirst({
        where: and(eq(cases.companyId, id), eq(cases.tenantId, tenantId)),
      });

      if (assignedCase) {
        return next(
          CustomErrorHandler.badRequest(
            "Case Type is assigned to one or more cases. Remove or update those cases first.",
          ),
        );
      }

      await db
        .delete(companies)
        .where(and(eq(companies.id, id), eq(companies.tenantId, tenantId)));

      return res
        .status(200)
        .send(ResponseHandler(200, "Case Type deleted successfully"));
    } catch (error) {
      console.error(error);
      return next(CustomErrorHandler.serverError());
    }
  },
};

export default companiesController;
