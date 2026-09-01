import { and, eq, ne } from "drizzle-orm";
import { NextFunction, Request, Response } from "express";
import slugify from "slugify";
import db from "../../db/index.js";
import { cases, courts } from "../../db/schema/index.js";
import ResponseHandler from "../../utils/responseHandler.js";
import CustomErrorHandler from "../../utils/customErrorHandler.js";
export const COURT_TYPES = [
  "supreme_court",
  "high_court",
  "district_court",
  "sessions_court",
  "civil_court",
  "family_court",
  "commercial_court",
  "labour_court",
  "consumer_court",
  "tribunal",
  "other",
] as const;

export type CourtType = (typeof COURT_TYPES)[number];
const isValidCourtType = (value: unknown): value is CourtType => {
  return typeof value === "string" && COURT_TYPES.includes(value as CourtType);
};
const courtsController = {
  async getcourts(req: Request, res: Response, next: NextFunction) {
    const id = req.user.tenantId;

    try {
      const courtsdata = await db.query.courts.findMany({
        where: eq(courts.tenantId, id),
        columns: {
          id: true,
          name: true,
          courtType: true,
          state: true,
          district: true,
          isActive: true,
        },
      });

      return res
        .status(200)
        .send(ResponseHandler(200, "courts fetched successfully", courtsdata));
    } catch (error) {
      console.error(error);
      return next(CustomErrorHandler.serverError());
    }
  },
  async createcourts(req: Request, res: Response, next: NextFunction) {
    try {
      const { name, courtType, state, district, isActive } = req.body;
      const tenantId = req.user.tenantId;
      const slug = slugify(name, {
        lower: true,
        strict: true,
        trim: true,
      });
      if (!isValidCourtType(courtType)) {
        return next(CustomErrorHandler.badRequest("Invalid court type"));
      }
      if (!tenantId) {
        return next(CustomErrorHandler.badRequest("Tenant id is required"));
      }
      if (!name) {
        return next(CustomErrorHandler.badRequest("courts name is required"));
      }

      // Check duplicate name
      const existingcourts = await db.query.courts.findFirst({
        where: and(eq(courts.slug, slug), eq(courts.tenantId, tenantId)),
      });

      if (existingcourts) {
        return next(CustomErrorHandler.badRequest("courts already exists"));
      }

      await db.insert(courts).values({
        name: name.toLowerCase(),
        slug,
        tenantId,
        isActive,
        courtType,
        state: state.toLowerCase(),
        district: district.toLowerCase(),
      });

      return res
        .status(201)
        .send(ResponseHandler(201, "courts created successfully"));
    } catch (error) {
      console.log(error);
      return next(CustomErrorHandler.serverError());
    }
  },
  async updatecourts(req: Request, res: Response, next: NextFunction) {
    try {
      const { id } = req.params;
      const tenantId = req.user.tenantId;
      const { name, courtType, state, district, isActive } = req.body;
      const slug = slugify(name, {
        lower: true,
        strict: true,
        trim: true,
      });

      if (!id) {
        return next(CustomErrorHandler.badRequest("courts id is required"));
      }

      const courtdata = await db.query.courts.findFirst({
        where: and(eq(courts.id, id), eq(courts.tenantId, tenantId)),
      });

      if (!courtdata) {
        return next(CustomErrorHandler.notFound("courts not found"));
      }

      if (slug && slug !== courtdata.slug) {
        const duplicateName = await db.query.courts.findFirst({
          where: and(
            eq(courts.slug, slug),
            eq(courts.tenantId, tenantId),
            ne(courts.id, id),
          ),
        });

        if (duplicateName) {
          return next(
            CustomErrorHandler.badRequest("courts name already exists"),
          );
        }
      }

      await db
        .update(courts)
        .set({
          name,
          slug,
          isActive,
          courtType,
          state,
          district,
        })
        .where(eq(courts.id, id));

      return res
        .status(200)
        .send(ResponseHandler(200, "courts updated successfully"));
    } catch (error) {
      console.error(error);
      return next(CustomErrorHandler.serverError());
    }
  },
  async deletecourts(req: Request, res: Response, next: NextFunction) {
    try {
      const { id } = req.params;
      const tenantId = req.user.tenantId;

      if (!id) {
        return next(CustomErrorHandler.badRequest("court id is required"));
      }

      // Check court type exists
      const courtdata = await db.query.courts.findFirst({
        where: and(eq(courts.id, id), eq(courts.tenantId, tenantId)),
      });

      if (!courtdata) {
        return next(CustomErrorHandler.notFound("court not found"));
      }

      // Check if any case is using this court
      const assignedCase = await db.query.cases.findFirst({
        where: and(eq(cases.courtId, id), eq(cases.tenantId, tenantId)),
      });

      if (assignedCase) {
        return next(
          CustomErrorHandler.badRequest(
            "courts is assigned to one or more cases. Remove or update those cases first.",
          ),
        );
      }

      await db
        .delete(courts)
        .where(and(eq(courts.id, id), eq(courts.tenantId, tenantId)));

      return res
        .status(200)
        .send(ResponseHandler(200, "court deleted successfully"));
    } catch (error) {
      console.error(error);
      return next(CustomErrorHandler.serverError());
    }
  },
};
export default courtsController;
