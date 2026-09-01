import { and, count, desc, eq, ilike, or } from "drizzle-orm";
import { NextFunction, Request, Response } from "express";

import db from "../../db/index.js";
import {
  offices,
  userScopeOffices,
  userScopes,
} from "../../db/schema/index.js";
import CustomErrorHandler from "../../utils/customErrorHandler.js";

const officeController = {
  async createOffice(req: Request, res: Response, next: NextFunction) {
    try {
      const {
        name,
        code,
        email,
        phone,
        address,
        city,
        state,
        country,
        postalCode,
        timezone,
        isHeadOffice,
      } = req.body;

      const { tenantId, userId } = req.user;

      const existing = await db.query.offices.findFirst({
        where: and(eq(offices.tenantId, tenantId), eq(offices.name, name)),
      });

      if (existing) {
        return res.status(400).json({
          success: false,
          message: "Office already exists.",
        });
      }

      const [office] = await db
        .insert(offices)
        .values({
          tenantId,
          name,
          code,
          email,
          phone,
          address,
          city,
          country,
          state,
          postalCode,
          timezone,
          isHeadOffice,
          createdBy: userId,
        })
        .returning();

      return res.status(201).json({
        success: true,
        message: "Office created successfully.",
        data: office,
      });
    } catch (error) {
      next(error);
    }
  },
  async createOfficeForUserSelf(
    req: Request,
    res: Response,
    next: NextFunction,
  ) {
    try {
      const {
        name,
        code,
        email,
        phone,
        address,
        city,
        state,
        country,
        postalCode,
        timezone,
        isHeadOffice,
      } = req.body;

      const { tenantId, userId } = req.user;

      const existing = await db.query.offices.findFirst({
        where: and(eq(offices.tenantId, tenantId), eq(offices.name, name)),
      });

      if (existing) {
        throw CustomErrorHandler.conflict("Office already exists.");
      }

      const result = await db.transaction(async (tx) => {
        // 1. Find user's scope for this tenant
        const scope = await tx.query.userScopes.findFirst({
          where: and(
            eq(userScopes.userId, userId),
            eq(userScopes.tenantId, tenantId),
          ),
        });

        if (!scope) {
          throw CustomErrorHandler.notFound("User Scope Not Found");
        }

        // 2. Create office
        const [office] = await tx
          .insert(offices)
          .values({
            tenantId,
            name,
            code,
            email,
            phone,
            address,
            city,
            country,
            state,
            postalCode,
            timezone,
            isHeadOffice,
            createdBy: userId,
          })
          .returning();

        // 3. Give creator's scope access to the new office
        await tx.insert(userScopeOffices).values({
          userScopeId: scope.id,
          officeId: office.id,
          createdBy: userId,
        });
        return office;
      });

      return res.status(201).json({
        success: true,
        message: "Office created successfully.",
        data: result,
      });
    } catch (error) {
      next(error);
    }
  },
  async getOfficesNames(req: Request, res: Response, next: NextFunction) {
    try {
      const tenantId = req.user.tenantId;
      if (!tenantId) {
        return res.status(400).json({
          success: false,
          message: "Tenant ID is required.",
        });
      }
      const data = await db.query.offices.findMany({
        where: eq(offices.tenantId, tenantId),
        columns: {
          id: true,
          name: true,
        },
      });
      return res.json({
        success: true,
        data,
      });
    } catch (error) {
      next(error);
    }
  },
  async getOffices(req: Request, res: Response, next: NextFunction) {
    try {
      const tenantId = req.user.tenantId;

      const page = Number(req.query.page) || 1;
      const limit = Number(req.query.limit) || 10;
      const search = (req.query.search as string)?.trim();

      const where = and(
        eq(offices.tenantId, tenantId),
        search
          ? or(
              ilike(offices.name, `%${search}%`),
              ilike(offices.code, `%${search}%`),
              ilike(offices.city, `%${search}%`),
              ilike(offices.phone, `%${search}%`),
              ilike(offices.email, `%${search}%`),
            )
          : undefined,
      );

      const [data, [{ total }]] = await Promise.all([
        db.query.offices.findMany({
          where,
          limit,
          offset: (page - 1) * limit,
          orderBy: [desc(offices.createdAt)],
        }),

        db
          .select({
            total: count(),
          })
          .from(offices)
          .where(where),
      ]);

      return res.json({
        success: true,
        data,
        pagination: {
          page,
          limit,
          total,
          totalPages: Math.ceil(total / limit),
          hasNextPage: page * limit < total,
          hasPreviousPage: page > 1,
        },
      });
    } catch (error) {
      next(error);
    }
  },

  async getOffice(req: Request, res: Response, next: NextFunction) {
    try {
      const { id } = req.params;
      const tenantId = req.user.tenantId;

      const office = await db.query.offices.findFirst({
        where: and(eq(offices.id, id), eq(offices.tenantId, tenantId)),
      });

      if (!office) {
        return res.status(404).json({
          success: false,
          message: "Office not found.",
        });
      }

      return res.json({
        success: true,
        data: office,
      });
    } catch (error) {
      next(error);
    }
  },

  async updateOffice(req: Request, res: Response, next: NextFunction) {
    try {
      const { id } = req.params;
      const { tenantId, userId } = req.user;

      const office = await db.query.offices.findFirst({
        where: and(eq(offices.id, id), eq(offices.tenantId, tenantId)),
      });

      if (!office) {
        return res.status(404).json({
          success: false,
          message: "Office not found.",
        });
      }

      const {
        name,
        code,
        email,
        phone,
        address,
        city,
        state,
        country,
        postalCode,
        timezone,
        isHeadOffice,
        isActive,
      } = req.body;

      const [updated] = await db
        .update(offices)
        .set({
          name,
          code,
          email,
          phone,
          address,
          city,
          state,
          country,
          postalCode,
          timezone,
          isHeadOffice,
          isActive,
          updatedBy: userId,
          updatedAt: new Date(),
        })
        .where(eq(offices.id, id))
        .returning();

      return res.json({
        success: true,
        message: "Office updated successfully.",
        data: updated,
      });
    } catch (error) {
      next(error);
    }
  },

  async deleteOffice(req: Request, res: Response, next: NextFunction) {
    try {
      const { id } = req.params;
      const { tenantId } = req.user;

      const office = await db.query.offices.findFirst({
        where: and(eq(offices.id, id), eq(offices.tenantId, tenantId)),
      });

      if (!office) {
        return res.status(404).json({
          success: false,
          message: "Office not found.",
        });
      }

      await db.delete(offices).where(eq(offices.id, id));

      return res.json({
        success: true,
        message: "Office deleted successfully.",
      });
    } catch (error) {
      next(error);
    }
  },
};

export default officeController;
