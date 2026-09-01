import { and, eq, ne } from "drizzle-orm";
import { NextFunction, Request, Response } from "express";
import db from "../../db/index.js";
import { cases, policeStations } from "../../db/schema/index.js";
import ResponseHandler from "../../utils/responseHandler.js";
import CustomErrorHandler from "../../utils/customErrorHandler.js";
import slugify from "slugify";
const policeStationController = {
  async getpoliceStations(req: Request, res: Response, next: NextFunction) {
    const id = req.user.tenantId;
    try {
      const policeStationdata = await db.query.policeStations.findMany({
        where: eq(policeStations.tenantId, id),
        columns: {
          id: true,
          name: true,
          district: true,
          state: true,
        },
      });

      return res
        .status(200)
        .send(
          ResponseHandler(
            200,
            "policeStations fetched successfully",
            policeStationdata,
          ),
        );
    } catch (error) {
      console.error(error);
      return next(CustomErrorHandler.serverError());
    }
  },
  async createpoliceStation(req: Request, res: Response, next: NextFunction) {
    try {
      const { name, district, state } = req.body;
      const tenantId = req.user.tenantId;
      const slug = slugify(name, {
        lower: true,
        strict: true,
        trim: true,
      });
      if (!name) {
        return next(
          CustomErrorHandler.badRequest("policeStation name is required"),
        );
      }

      // Check duplicate name
      const existingpoliceStation = await db.query.policeStations.findFirst({
        where: eq(policeStations.name, name),
      });

      if (existingpoliceStation) {
        return next(
          CustomErrorHandler.badRequest("policeStation already exists"),
        );
      }

      await db.insert(policeStations).values({
        name,
        tenantId,
        slug,
        district,
        state,
      });

      return res
        .status(201)
        .send(ResponseHandler(201, "policeStation created successfully"));
    } catch (error) {
      console.log(error);
      return next(CustomErrorHandler.serverError());
    }
  },
  async updatepoliceStation(req: Request, res: Response, next: NextFunction) {
    try {
      const { id } = req.params;
      const tenantId = req.user.tenantId;
      const { name, district, state } = req.body;
      const slug = slugify(name, {
        lower: true,
        strict: true,
        trim: true,
      });

      if (!id) {
        return next(
          CustomErrorHandler.badRequest("policeStation id is required"),
        );
      }

      const policeStation = await db.query.policeStations.findFirst({
        where: and(
          eq(policeStations.id, id),
          eq(policeStations.tenantId, tenantId),
        ),
      });

      if (!policeStation) {
        return next(CustomErrorHandler.notFound("policeStation not found"));
      }
      if (slug && slug !== policeStation.slug) {
        const duplicateName = await db.query.policeStations.findFirst({
          where: and(
            eq(policeStations.slug, slug),
            eq(policeStations.tenantId, tenantId),
            ne(policeStations.id, id),
          ),
        });

        if (duplicateName) {
          return next(
            CustomErrorHandler.badRequest("policeStation name already exists"),
          );
        }
      }
      await db
        .update(policeStations)
        .set({
          name,
          district,
          slug,
          state,
        })
        .where(eq(policeStations.id, id));

      return res
        .status(200)
        .send(ResponseHandler(200, "policeStation updated successfully"));
    } catch (error) {
      console.error(error);
      return next(CustomErrorHandler.serverError());
    }
  },
  async deletepoliceStation(req: Request, res: Response, next: NextFunction) {
    try {
      const { id } = req.params;
      const tenantId = req.user.tenantId;

      if (!id) {
        return next(CustomErrorHandler.badRequest("Case Type id is required"));
      }

      // Check case type exists
      const policeStation = await db.query.policeStations.findFirst({
        where: and(
          eq(policeStations.id, id),
          eq(policeStations.tenantId, tenantId),
        ),
      });

      if (!policeStation) {
        return next(CustomErrorHandler.notFound("Case Type not found"));
      }

      // Check if any case is using this case type
      const assignedCase = await db.query.cases.findFirst({
        where: and(eq(cases.policeStationId, id), eq(cases.tenantId, tenantId)),
      });

      if (assignedCase) {
        return next(
          CustomErrorHandler.badRequest(
            "Case Type is assigned to one or more cases. Remove or update those cases first.",
          ),
        );
      }

      await db
        .delete(policeStations)
        .where(
          and(eq(policeStations.id, id), eq(policeStations.tenantId, tenantId)),
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

export default policeStationController;
