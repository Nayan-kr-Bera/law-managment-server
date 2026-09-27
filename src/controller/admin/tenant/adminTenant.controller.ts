import { eq, ilike, or, and, count, SQL } from "drizzle-orm";
import { NextFunction, Request, Response } from "express";

import db from "../../../db/index.js";
import {
  tenants,
  userScopes,
  offices,
  tenantSubscriptions,
  subscriptionPlans,
} from "../../../db/schema/index.js";

import CustomErrorHandler from "../../../utils/customErrorHandler.js";
import ResponseHandler from "../../../utils/responseHandler.js";
import {
  deleteFileFromCloudinary,
  uploadFileToCloudinary,
} from "../../../services/cloudinary.service.js";

const adminTenantController = {
  // =========================================================================
  // GET ALL TENANTS (Admin Console)
  // =========================================================================
  async getTenants(req: Request, res: Response, next: NextFunction) {
    try {
      const { search, status } = req.query as {
        search?: string;
        status?: string;
      };

      const conditions: SQL[] = [];

      if (status && status.trim() !== "" && status !== "all") {
        conditions.push(eq(tenants.status, status as any));
      }

      if (search && search.trim() !== "") {
        const queryTerm = `%${search.trim()}%`;
        const searchCond = or(
          ilike(tenants.name, queryTerm),
          ilike(tenants.slug, queryTerm),
          ilike(tenants.organisationEmail, queryTerm)
        );
        if (searchCond) {
          conditions.push(searchCond);
        }
      }

      const whereClause = conditions.length > 0 ? and(...conditions) : undefined;

      const tenantList = await db.query.tenants.findMany({
        where: whereClause,
        orderBy: (t, { desc }) => [desc(t.createdAt)],
      });

      // Enhance with usersCount, officesCount, and activePlan
      const enrichedTenants = await Promise.all(
        tenantList.map(async (t) => {
          const [usersRes] = await db
            .select({ count: count() })
            .from(userScopes)
            .where(eq(userScopes.tenantId, t.id));

          const [officesRes] = await db
            .select({ count: count() })
            .from(offices)
            .where(eq(offices.tenantId, t.id));

          const sub = await db.query.tenantSubscriptions.findFirst({
            where: eq(tenantSubscriptions.tenantId, t.id),
            with: {
              plan: true,
            },
          });

          return {
            id: t.id,
            name: t.name,
            slug: t.slug,
            logo: t.logo,
            timezone: t.timezone || "Asia/Kolkata",
            status: t.status || "active",
            createdAt: t.createdAt ? new Date(t.createdAt).toISOString() : new Date().toISOString(),
            updatedAt: t.updatedAt ? new Date(t.updatedAt).toISOString() : undefined,
            ownerName: t.name ? `${t.name} Admin` : "Law Firm Admin",
            ownerEmail: t.organisationEmail || undefined,
            usersCount: usersRes?.count || 1,
            officesCount: officesRes?.count || 1,
            activePlan: sub?.plan
              ? {
                  id: sub.plan.id,
                  name: sub.plan.name,
                  tier: sub.plan.code,
                  validUntil: sub.nextBillingDate
                    ? new Date(sub.nextBillingDate).toISOString()
                    : undefined,
                  status: sub.status as any,
                }
              : undefined,
          };
        })
      );

      return res.status(200).json(
        ResponseHandler(200, "Tenants fetched successfully", enrichedTenants)
      );
    } catch (error) {
      console.error("Admin get tenants error:", error);
      return next(CustomErrorHandler.serverError());
    }
  },

  // =========================================================================
  // GET TENANT BY ID
  // =========================================================================
  async getTenantById(req: Request, res: Response, next: NextFunction) {
    try {
      const { id } = req.params;

      if (!id) {
        return next(CustomErrorHandler.badRequest("Tenant ID is required"));
      }

      const tenant = await db.query.tenants.findFirst({
        where: eq(tenants.id, id),
      });

      if (!tenant) {
        return next(CustomErrorHandler.notFound("Tenant not found"));
      }

      const [usersRes] = await db
        .select({ count: count() })
        .from(userScopes)
        .where(eq(userScopes.tenantId, tenant.id));

      const [officesRes] = await db
        .select({ count: count() })
        .from(offices)
        .where(eq(offices.tenantId, tenant.id));

      const sub = await db.query.tenantSubscriptions.findFirst({
        where: eq(tenantSubscriptions.tenantId, tenant.id),
        with: {
          plan: true,
        },
      });

      const formattedTenant = {
        id: tenant.id,
        name: tenant.name,
        slug: tenant.slug,
        logo: tenant.logo,
        timezone: tenant.timezone || "Asia/Kolkata",
        status: tenant.status || "active",
        createdAt: tenant.createdAt ? new Date(tenant.createdAt).toISOString() : new Date().toISOString(),
        updatedAt: tenant.updatedAt ? new Date(tenant.updatedAt).toISOString() : undefined,
        ownerName: `${tenant.name} Owner`,
        ownerEmail: tenant.organisationEmail || undefined,
        usersCount: usersRes?.count || 1,
        officesCount: officesRes?.count || 1,
        activePlan: sub?.plan
          ? {
              id: sub.plan.id,
              name: sub.plan.name,
              tier: sub.plan.code,
              validUntil: sub.nextBillingDate
                ? new Date(sub.nextBillingDate).toISOString()
                : undefined,
              status: sub.status as any,
            }
          : undefined,
      };

      return res.status(200).json(
        ResponseHandler(200, "Tenant details fetched successfully", formattedTenant)
      );
    } catch (error) {
      console.error("Admin get tenant by ID error:", error);
      return next(CustomErrorHandler.serverError());
    }
  },

  // =========================================================================
  // CREATE TENANT
  // =========================================================================
  async createTenant(req: Request, res: Response, next: NextFunction) {
    try {
      const {
        name,
        slug,
        ownerEmail,
        ownerName,
        timezone,
        status,
        initialPlanId,
      } = req.body;

      if (!name) {
        return next(CustomErrorHandler.badRequest("Tenant name is required"));
      }

      const tenantSlug = slug || name.toLowerCase().replace(/[^a-z0-9]/g, "-");

      const [newTenant] = await db
        .insert(tenants)
        .values({
          name,
          slug: tenantSlug,
          organisationEmail: ownerEmail || null,
          timezone: timezone || "Asia/Kolkata",
          status: status || "active",
        })
        .returning();

      // If initial plan selected, associate subscription
      if (initialPlanId) {
        const plan = await db.query.subscriptionPlans.findFirst({
          where: eq(subscriptionPlans.id, initialPlanId),
        });

        if (plan) {
          const startDate = new Date();
          const nextBilling = new Date(startDate.getTime() + 30 * 24 * 60 * 60 * 1000);

          await db.insert(tenantSubscriptions).values({
            tenantId: newTenant.id,
            planId: plan.id,
            status: "active",
            billingCycle: "monthly",
            amount: String(plan.monthlyPrice || 0),
            currency: plan.currency || "INR",
            startDate: startDate.toISOString().split("T")[0],
            nextBillingDate: nextBilling.toISOString().split("T")[0],
            autoRenew: true,
          });
        }
      }

      return res.status(201).json(
        ResponseHandler(201, "Tenant created successfully", newTenant)
      );
    } catch (error) {
      console.error("Admin create tenant error:", error);
      return next(CustomErrorHandler.serverError());
    }
  },

  // =========================================================================
  // UPDATE TENANT
  // =========================================================================
  async updateTenant(req: Request, res: Response, next: NextFunction) {
    try {
      const { id } = req.params;
      const { name, slug, timezone, status, organisationEmail } = req.body;

      const existing = await db.query.tenants.findFirst({
        where: eq(tenants.id, id),
      });

      if (!existing) {
        return next(CustomErrorHandler.notFound("Tenant not found"));
      }

      let logoUrl: string | undefined;
      if (req.file) {
        if (existing.logo) {
          await deleteFileFromCloudinary(existing.logo, "image");
        }
        const uploaded = await uploadFileToCloudinary({
          buffer: req.file.buffer,
          originalName: req.file.originalname,
          mimetype: req.file.mimetype,
          folder: "law_management_tenants",
        });
        logoUrl = uploaded.secureUrl;
      }

      const [updated] = await db
        .update(tenants)
        .set({
          ...(name !== undefined && { name }),
          ...(slug !== undefined && { slug }),
          ...(timezone !== undefined && { timezone }),
          ...(status !== undefined && { status }),
          ...(organisationEmail !== undefined && { organisationEmail }),
          ...(logoUrl !== undefined && { logo: logoUrl }),
          updatedAt: new Date(),
        })
        .where(eq(tenants.id, id))
        .returning();

      return res.status(200).json(
        ResponseHandler(200, "Tenant updated successfully", updated)
      );
    } catch (error) {
      console.error("Admin update tenant error:", error);
      return next(CustomErrorHandler.serverError());
    }
  },

  // =========================================================================
  // DELETE TENANT
  // =========================================================================
  async deleteTenant(req: Request, res: Response, next: NextFunction) {
    try {
      const { id } = req.params;

      const existing = await db.query.tenants.findFirst({
        where: eq(tenants.id, id),
      });

      if (!existing) {
        return next(CustomErrorHandler.notFound("Tenant not found"));
      }

      if (existing.logo) {
        await deleteFileFromCloudinary(existing.logo, "image");
      }

      await db.delete(tenants).where(eq(tenants.id, id));

      return res.status(200).json(
        ResponseHandler(200, "Tenant deleted successfully")
      );
    } catch (error) {
      console.error("Admin delete tenant error:", error);
      return next(CustomErrorHandler.serverError());
    }
  },
};

export default adminTenantController;
