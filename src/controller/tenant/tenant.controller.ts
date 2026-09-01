import { Request, Response, NextFunction } from "express";
import { eq } from "drizzle-orm";

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
      const { userId } = req.user;

      if (!userId) {
        return next(CustomErrorHandler.badRequest("User id is required"));
      }

      // FIND DEFAULT USER SCOPE
      const scope = await db.query.userScopes.findFirst({
        where: eq(userScopes.userId, userId),
      });

      if (!scope) {
        return next(
          CustomErrorHandler.notFound("No tenant found for this user"),
        );
      }

      // CHECK TENANT ID
      if (!scope.tenantId) {
        return next(
          CustomErrorHandler.notFound(
            "No tenant is associated with this user scope",
          ),
        );
      }

      // FIND TENANT
      const tenant = await db.query.tenants.findFirst({
        where: eq(tenants.id, scope.tenantId),
      });

      if (!tenant) {
        return next(CustomErrorHandler.notFound("Tenant not found"));
      }

      // RESPONSE
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
  // CREATE TENANT
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

  // GET ALL TENANTS
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

  // GET TENANT BY ID
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

  // UPDATE TENANT
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

      /**
       * Upload new logo if provided
       */
      if (req.file) {
        /**
         * Delete old logo if it exists
         */
        if (existingTenant.logo) {
          await deleteFileFromCloudinary(existingTenant.logo, "image");
        }

        /**
         * Upload new logo to Cloudinary
         */
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
          ...(slug !== undefined && { slug }),
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

          // Only update logo when a new file was uploaded
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

  // DELETE TENANT
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

      // Delete tenant logo from Cloudinary
      if (existingTenant.logo) {
        await deleteFileFromCloudinary(existingTenant.logo, "image");
      }

      // Delete tenant from database
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
