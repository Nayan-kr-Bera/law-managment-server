import { Request, Response, NextFunction } from "express";
import { and, eq, ne } from "drizzle-orm";
import slugify from "slugify";

import db from "../../db/index.js";
import tenants from "../../db/schema/tenants.js";
import CustomErrorHandler from "../../utils/customErrorHandler.js";
import {
  deleteFileFromCloudinary,
  uploadFileToCloudinary,
} from "../../services/cloudinary.service.js";
import userScopes from "../../db/schema/userScope.js";
import ResponseHandler from "../../utils/responseHandler.js";

const tenantController = {
  async getTenantByUserId(req: Request, res: Response, next: NextFunction) {
    try {
      const { userId, tenantId: userTenantId } = req.user;

      if (!userId) {
        return next(CustomErrorHandler.badRequest("User id is required"));
      }

      let tenantIdToFetch = userTenantId;

      if (!tenantIdToFetch) {
        const scope =
          (await db.query.userScopes.findFirst({
            where: and(
              eq(userScopes.userId, userId),
              eq(userScopes.isDefault, true),
            ),
          })) ||
          (await db.query.userScopes.findFirst({
            where: eq(userScopes.userId, userId),
          }));

        if (!scope || !scope.tenantId) {
          return next(
            CustomErrorHandler.notFound("No tenant found for this user"),
          );
        }
        tenantIdToFetch = scope.tenantId;
      }

      const tenant = await db.query.tenants.findFirst({
        where: eq(tenants.id, tenantIdToFetch),
      });

      if (!tenant) {
        return next(CustomErrorHandler.notFound("Tenant not found"));
      }

      return res
        .status(200)
        .send(
          ResponseHandler(200, "Tenant details fetched successfully", tenant),
        );
    } catch (error) {
      console.error("GET TENANT BY USER ID ERROR:", error);

      return next(CustomErrorHandler.serverError());
    }
  },
  async createTenant(req: Request, res: Response, next: NextFunction) {
    try {
      const {
        name,
        slug,
        logo,
        gst,
        organisationEmail,
        organisationPhone,
        timezone,
        status,
      } = req.body;

      const [tenant] = await db
        .insert(tenants)
        .values({
          name,
          slug,
          logo,
          gst,
          organisationEmail,
          organisationPhone,
          timezone,
          status,
        })
        .returning();

      return res.status(201).json({
        success: true,
        message: "Tenant created successfully",
        data: tenant,
      });
    } catch (error) {
      next(error);
    }
  },

  async getTenants(req: Request, res: Response, next: NextFunction) {
    try {
      const tenantList = await db.select().from(tenants);

      return res.status(200).json({
        success: true,
        message: "Tenants fetched successfully",
        data: tenantList,
      });
    } catch (error) {
      next(error);
    }
  },

  async getTenantDetails(req: Request, res: Response, next: NextFunction) {
    try {
      const id = req.user.tenantId;

      const [tenant] = await db
        .select()
        .from(tenants)
        .where(eq(tenants.id, id));

      if (!tenant) {
        return next(CustomErrorHandler.notFound("Tenant not found"));
      }

      return res.status(200).json({
        success: true,
        message: "Tenant fetched successfully",
        data: tenant,
      });
    } catch (error) {
      next(error);
    }
  },

  async updateTenant(req: Request, res: Response, next: NextFunction) {
    try {
      const { id } = req.params;

      const {
        name,
        slug,
        gst,
        organisationEmail,
        organisationPhone,
        timezone,
        subscriptionPlan,
        status,
      } = req.body;

      const [existingTenant] = await db
        .select({
          id: tenants.id,
          logo: tenants.logo,
        })
        .from(tenants)
        .where(eq(tenants.id, id));

      if (!existingTenant) {
        return next(CustomErrorHandler.notFound("Tenant not found"));
      }

      let logoUrl: string | undefined;

      let resolvedSlug: string | undefined = slug;
      if (name && (!resolvedSlug || resolvedSlug.trim() === "")) {
        resolvedSlug = slugify(name, { lower: true, strict: true });
      } else if (resolvedSlug) {
        resolvedSlug = slugify(resolvedSlug, { lower: true, strict: true });
      }

      if (resolvedSlug) {
        const baseSlug = resolvedSlug;
        let finalSlug = baseSlug;
        let count = 1;
        while (
          await db.query.tenants.findFirst({
            where: and(eq(tenants.slug, finalSlug), ne(tenants.id, id)),
          })
        ) {
          finalSlug = `${baseSlug}-${count++}`;
        }
        resolvedSlug = finalSlug;
      }

      if (req.file) {
        if (existingTenant.logo) {
          await deleteFileFromCloudinary(existingTenant.logo, "image");
        }

        const uploadedFile = await uploadFileToCloudinary({
          buffer: req.file.buffer,
          originalName: req.file.originalname,
          mimetype: req.file.mimetype,
          folder: "mi_law_practice",
        });

        logoUrl = uploadedFile.secureUrl;
      }

      const [updatedTenant] = await db
        .update(tenants)
        .set({
          ...(name !== undefined && { name }),
          ...(resolvedSlug !== undefined && { slug: resolvedSlug }),
          ...(gst !== undefined && { gst }),
          ...(organisationEmail !== undefined && {
            organisationEmail,
          }),
          ...(organisationPhone !== undefined && {
            organisationPhone,
          }),
          ...(timezone !== undefined && { timezone }),
          ...(subscriptionPlan !== undefined && {
            subscriptionPlan,
          }),
          ...(status !== undefined && { status }),

          ...(logoUrl !== undefined && {
            logo: logoUrl,
          }),

          updatedAt: new Date(),
        })
        .where(eq(tenants.id, id))
        .returning();

      return res.status(200).json({
        success: true,
        message: "Tenant updated successfully",
        data: updatedTenant,
      });
    } catch (error) {
      next(error);
    }
  },

  async deleteTenant(req: Request, res: Response, next: NextFunction) {
    try {
      const { id } = req.params;

      const [existingTenant] = await db
        .select()
        .from(tenants)
        .where(eq(tenants.id, id));

      if (!existingTenant) {
        return next(CustomErrorHandler.notFound("Tenant not found"));
      }

      if (existingTenant.logo) {
        await deleteFileFromCloudinary(existingTenant.logo, "image");
      }

      await db.delete(tenants).where(eq(tenants.id, id));

      return res.status(200).json({
        success: true,
        message: "Tenant deleted successfully",
      });
    } catch (error) {
      console.error("DELETE TENANT ERROR:", error);

      return next(error);
    }
  },
};

export default tenantController;
