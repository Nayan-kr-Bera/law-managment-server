import { eq, ilike, or, and, count, inArray, SQL } from "drizzle-orm";
import { NextFunction, Request, Response } from "express";

import db from "../../../db/index.js";
import {
  tenants,
  userScopes,
  offices,
  tenantSubscriptions,
  subscriptionPlans,
  cases,
  clients,
  caseClients,
  clientProfiles,
  user,
  userScopeOffices,
  roles,
  userRoles,
  subscriptionPaymentHistory,
} from "../../../db/schema/index.js";

import CustomErrorHandler from "../../../utils/customErrorHandler.js";
import ResponseHandler from "../../../utils/responseHandler.js";
import {
  deleteFileFromCloudinary,
  uploadFileToCloudinary,
} from "../../../services/cloudinary.service.js";
import auditLogService from "../../../services/auditLog.service.js";

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
        conditions.push(eq(tenants.status, status as typeof tenants.$inferSelect.status));
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

          const [casesRes] = await db
            .select({ count: count() })
            .from(cases)
            .where(eq(cases.tenantId, t.id));

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
            casesCount: casesRes?.count || 0,
            activePlan: sub?.plan
              ? {
                  id: sub.plan.id,
                  name: sub.plan.name,
                  tier: sub.plan.code,
                  validUntil: sub.nextBillingDate
                    ? new Date(sub.nextBillingDate).toISOString()
                    : undefined,
                  status: sub.status,
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
              status: sub.status,
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

  // =========================================================================
  // GET TENANT BUSINESS HIERARCHY / ECOSYSTEM
  // =========================================================================
  async getTenantEcosystem(req: Request, res: Response, next: NextFunction) {
    try {
      const { tenantId } = req.query as { tenantId?: string };

      const allTenants = await db.query.tenants.findMany({
        where: tenantId ? eq(tenants.id, tenantId) : undefined,
        orderBy: (t, { desc }) => [desc(t.createdAt)],
      });

      const ecosystem = await Promise.all(
        allTenants.map(async (t) => {
          // 1. Cases in this firm
          const firmCases = await db.query.cases.findMany({
            where: eq(cases.tenantId, t.id),
            orderBy: (c, { desc }) => [desc(c.createdAt)],
          });

          // 2. Advocates / Users in this firm
          const userScopeList = await db.query.userScopes.findMany({
            where: eq(userScopes.tenantId, t.id),
            with: {
              user: true,
            },
          });

          const advocatesList = userScopeList.map((us) => ({
            id: us.user?.id || us.id,
            name: us.user?.name || "Advocate",
            email: us.user?.email || "—",
            phone: us.user?.phone || "—",
            role: "Advocate",
          }));

          // 3. Client links for this firm's cases
          // 3. Clients associated with this firm (both profiles and case links)
          const profiles = await db.query.clientProfiles.findMany({
            where: eq(clientProfiles.tenantId, t.id),
          });
          const profileClientIds = profiles.map((p) => p.identityId);

          const firmCaseIds = firmCases.map((c) => c.id);
          const links = firmCaseIds.length > 0
            ? await db.select().from(caseClients).where(inArray(caseClients.caseId, firmCaseIds))
            : [];

          const linkedClientIds = Array.from(new Set([...profileClientIds, ...links.map((l) => l.clientId)]));

          const clientsList = await Promise.all(
            linkedClientIds.map(async (cId) => {
              const clientRecord = await db.query.clients.findFirst({
                where: eq(clients.id, cId),
              });

              // Which cases belong to this client in this firm
              const clientCaseLinks = links.filter((l) => l.clientId === cId);
              const linkedCases = firmCases.filter((fc) =>
                clientCaseLinks.some((l) => l.caseId === fc.id)
              );

              return {
                id: cId,
                name: [clientRecord?.firstName, clientRecord?.lastName].filter(Boolean).join(" ") || clientRecord?.companyName || clientRecord?.email || "Client",
                email: clientRecord?.email || "—",
                phone: clientRecord?.phone || "—",
                casesCount: linkedCases.length,
                cases: linkedCases.map((lc) => ({
                  id: lc.id,
                  caseNumber: lc.caseNumber || "—",
                  title: lc.title || "Legal Matter",
                  status: lc.status || "active",
                })),
              };
            })
          );

          // 4. Offices for this firm
          const firmOffices = await db.query.offices.findMany({
            where: eq(offices.tenantId, t.id),
            orderBy: (o, { desc }) => [desc(o.isHeadOffice), desc(o.createdAt)],
          });

          const officesList = firmOffices.map((o) => ({
            id: o.id,
            name: o.name,
            code: o.code || undefined,
            email: o.email || undefined,
            phone: o.phone || undefined,
            address: o.address || undefined,
            city: o.city || undefined,
            state: o.state || undefined,
            country: o.country || undefined,
            isHeadOffice: Boolean(o.isHeadOffice),
            isActive: Boolean(o.isActive),
          }));

          // 5. Enriched Cases List
          const enrichedCases = firmCases.map((fc) => {
            const office = firmOffices.find((o) => o.id === fc.officeId);
            return {
              id: fc.id,
              caseNumber: fc.caseNumber || "—",
              cnrNumber: fc.cnrNumber || undefined,
              title: fc.title || "Legal Matter",
              description: fc.description || undefined,
              status: fc.status || "active",
              stage: fc.stage || undefined,
              priority: fc.priority || "medium",
              firstParty: fc.firstParty || undefined,
              oppositeParty: fc.oppositeParty || undefined,
              courtNumber: fc.courtNumber || undefined,
              judgeName: fc.judgeName || undefined,
              filingDate: fc.filingDate || undefined,
              nextHearingDate: fc.nextHearingDate || undefined,
              officeId: fc.officeId || undefined,
              officeName: office?.name || undefined,
            };
          });

          // Subscription plan
          const sub = await db.query.tenantSubscriptions.findFirst({
            where: eq(tenantSubscriptions.tenantId, t.id),
            with: {
              plan: true,
            },
          });

          return {
            tenantId: t.id,
            tenantName: t.name,
            slug: t.slug,
            status: t.status,
            ownerEmail: t.organisationEmail || "—",
            createdAt: t.createdAt ? new Date(t.createdAt).toISOString() : new Date().toISOString(),
            activePlan: sub?.plan?.name || "Standard Tier",
            planCode: sub?.plan?.code || "standard",
            casesCount: firmCases.length,
            advocatesCount: advocatesList.length,
            clientsCount: clientsList.length,
            officesCount: officesList.length,
            offices: officesList,
            advocates: advocatesList,
            clients: clientsList,
            cases: enrichedCases,
          };
        })
      );

      return res.status(200).json(
        ResponseHandler(200, "Tenant business hierarchy fetched successfully", ecosystem)
      );
    } catch (error) {
      console.error("Admin get tenant ecosystem error:", error);
      return next(CustomErrorHandler.serverError());
    }
  },

  // =========================================================================
  // GET ALL ORGANIZATIONS FOR A SPECIFIC USER
  // =========================================================================
  async getUserOrganizations(req: Request, res: Response, next: NextFunction) {
    try {
      const { userId } = req.params;

      if (!userId) {
        return next(CustomErrorHandler.badRequest("User ID is required"));
      }

      // Check user exists
      const targetUser = await db.query.user.findFirst({
        where: eq(user.id, userId),
      });

      if (!targetUser) {
        return next(CustomErrorHandler.notFound("User not found"));
      }

      // Get all scopes for this user
      const scopes = await db.query.userScopes.findMany({
        where: eq(userScopes.userId, userId),
        with: {
          tenant: true,
        },
      });

      const organizations = await Promise.all(
        scopes.map(async (scope) => {
          if (!scope.tenant) return null;

          const tenantRecord = scope.tenant;

          // Offices in this tenant
          const tenantOffices = await db.query.offices.findMany({
            where: eq(offices.tenantId, tenantRecord.id),
          });

          // Role in this scope
          const assignedRoles = await db
            .select({
              roleId: roles.id,
              name: roles.name,
              slug: roles.slug,
            })
            .from(userRoles)
            .innerJoin(roles, eq(userRoles.roleId, roles.id))
            .where(eq(userRoles.scopeId, scope.id));

          // Subscription
          const sub = await db.query.tenantSubscriptions.findFirst({
            where: eq(tenantSubscriptions.tenantId, tenantRecord.id),
            with: {
              plan: true,
            },
          });

          // Cases count
          const [casesRes] = await db
            .select({ count: count() })
            .from(cases)
            .where(eq(cases.tenantId, tenantRecord.id));

          return {
            scopeId: scope.id,
            tenantId: tenantRecord.id,
            tenantName: tenantRecord.name,
            slug: tenantRecord.slug,
            logo: tenantRecord.logo,
            status: tenantRecord.status || "active",
            timezone: tenantRecord.timezone || "Asia/Kolkata",
            isDefault: scope.isDefault,
            roleName: assignedRoles[0]?.name || "Managing Partner",
            roleSlug: assignedRoles[0]?.slug || "tenant_admin",
            casesCount: casesRes?.count || 0,
            officesCount: tenantOffices.length,
            offices: tenantOffices.map((o) => ({
              id: o.id,
              name: o.name,
              city: o.city || undefined,
              state: o.state || undefined,
              country: o.country || undefined,
              isHeadOffice: Boolean(o.isHeadOffice),
            })),
            subscription: sub?.plan
              ? {
                  id: sub.plan.id,
                  name: sub.plan.name,
                  code: sub.plan.code,
                  billingCycle: sub.billingCycle,
                  status: sub.status,
                  amount: sub.amount,
                  currency: sub.currency,
                  nextBillingDate: sub.nextBillingDate
                    ? new Date(sub.nextBillingDate).toISOString()
                    : undefined,
                }
              : null,
            createdAt: tenantRecord.createdAt
              ? new Date(tenantRecord.createdAt).toISOString()
              : new Date().toISOString(),
          };
        })
      );

      const validOrganizations = organizations.filter(Boolean);

      return res.status(200).json(
        ResponseHandler(200, "User organizations fetched successfully", {
          user: {
            id: targetUser.id,
            name: targetUser.name,
            email: targetUser.email,
            phone: targetUser.phone,
          },
          totalOrganizations: validOrganizations.length,
          organizations: validOrganizations,
        })
      );
    } catch (error) {
      console.error("Admin get user organizations error:", error);
      return next(CustomErrorHandler.serverError());
    }
  },

  // =========================================================================
  // GET MULTI-ORG CUSTOMERS LIST
  // =========================================================================
  async getMultiOrgCustomers(req: Request, res: Response, next: NextFunction) {
    try {
      const { search } = req.query as { search?: string };

      const allUsers = await db.query.user.findMany({
        orderBy: (u, { desc }) => [desc(u.createdAt)],
      });

      const customerSummaries = await Promise.all(
        allUsers.map(async (u) => {
          const scopes = await db.query.userScopes.findMany({
            where: eq(userScopes.userId, u.id),
            with: {
              tenant: true,
            },
          });

          // Filter out internal system tenant if present
          const validOrgs = scopes
            .filter((s): s is typeof s & { tenant: NonNullable<typeof s.tenant> } => Boolean(s.tenant && s.tenant.slug !== "system"))
            .map((s) => ({
              tenantId: s.tenant.id,
              name: s.tenant.name,
              slug: s.tenant.slug,
              status: s.tenant.status,
              isDefault: s.isDefault,
              createdAt: s.tenant.createdAt,
            }));

          return {
            id: u.id,
            name: u.name,
            email: u.email,
            phone: u.phone || "—",
            status: u.isEmailVerified ? "active" : "inactive",
            createdAt: u.createdAt ? new Date(u.createdAt).toISOString() : new Date().toISOString(),
            organizationsCount: validOrgs.length,
            organizations: validOrgs,
            isMultiOrg: validOrgs.length > 1,
          };
        })
      );

      let filtered = customerSummaries;
      if (search && search.trim() !== "") {
        const queryTerm = search.trim().toLowerCase();
        filtered = filtered.filter(
          (c) =>
            c.name.toLowerCase().includes(queryTerm) ||
            c.email.toLowerCase().includes(queryTerm) ||
            (c.phone && c.phone.includes(queryTerm)) ||
            c.organizations.some(
              (o) =>
                o.name.toLowerCase().includes(queryTerm) ||
                o.slug.toLowerCase().includes(queryTerm)
            )
        );
      }

      return res.status(200).json(
        ResponseHandler(200, "Customer organizations list fetched successfully", filtered)
      );
    } catch (error) {
      console.error("Admin get multi org customers error:", error);
      return next(CustomErrorHandler.serverError());
    }
  },

  // =========================================================================
  // PROVISION ORGANIZATION FOR EXISTING USER (Customer Add-on Provisioning)
  // =========================================================================
  async provisionOrganizationForUser(req: Request, res: Response, next: NextFunction) {
    try {
      const {
        userId,
        organizationName,
        slug,
        timezone,
        officeName,
        officeAddress,
        city,
        state,
        country,
        officePhone,
        officeEmail,
        planId,
        billingCycle = "monthly",
        extraFeePaid,
        currency = "INR",
        paymentMethod = "Manual Invoice / Bank Transfer",
        receiptRef,
        adminNotes,
      } = req.body;

      if (!userId) {
        return next(CustomErrorHandler.badRequest("Customer / User ID is required"));
      }

      if (!organizationName || organizationName.trim() === "") {
        return next(CustomErrorHandler.badRequest("Organization name is required"));
      }

      // 1. Verify user exists
      const targetUser = await db.query.user.findFirst({
        where: eq(user.id, userId),
      });

      if (!targetUser) {
        return next(CustomErrorHandler.notFound("Customer / User account not found"));
      }

      // 2. Generate slug and ensure uniqueness
      let baseSlug = (slug || organizationName)
        .toLowerCase()
        .trim()
        .replace(/[^a-z0-9]+/g, "-")
        .replace(/^-+|-+$/g, "");

      if (!baseSlug) {
        baseSlug = `firm-${Date.now().toString().slice(-6)}`;
      }

      let tenantSlug = baseSlug;
      const existingSlug = await db.query.tenants.findFirst({
        where: eq(tenants.slug, tenantSlug),
      });

      if (existingSlug) {
        tenantSlug = `${baseSlug}-${Math.floor(1000 + Math.random() * 9000)}`;
      }

      // 3. Normalize billing cycle for enum: "monthly" | "annual"
      const normalizedBillingCycle: "monthly" | "annual" =
        billingCycle === "yearly" || billingCycle === "annual" ? "annual" : "monthly";

      // 4. Execute atomic creation in transaction
      const transactionResult = await db.transaction(async (tx) => {
        // 4.1 Create tenant
        const [newTenant] = await tx
          .insert(tenants)
          .values({
            name: organizationName.trim(),
            slug: tenantSlug,
            organisationEmail: targetUser.email,
            timezone: timezone || "Asia/Kolkata",
            status: "active",
          })
          .returning();

        // 4.2 Create primary office
        const [newOffice] = await tx
          .insert(offices)
          .values({
            tenantId: newTenant.id,
            name: officeName?.trim() || "Head Office",
            address: officeAddress || null,
            city: city || null,
            state: state || null,
            country: country || "India",
            phone: officePhone || targetUser.phone || null,
            email: officeEmail || targetUser.email || null,
            isHeadOffice: true,
            isActive: true,
            createdBy: (req as any).user?.id || targetUser.id,
          })
          .returning();

        // 4.3 Check user's current scopes
        const existingScopes = await tx.query.userScopes.findMany({
          where: eq(userScopes.userId, targetUser.id),
        });

        const isDefault = existingScopes.length === 0;

        // 4.4 Create user scope linking customer to new tenant
        const [newScope] = await tx
          .insert(userScopes)
          .values({
            userId: targetUser.id,
            tenantId: newTenant.id,
            isDefault,
            createdBy: (req as any).user?.id || null,
          })
          .returning();

        // 4.5 Link user scope to head office
        await tx.insert(userScopeOffices).values({
          userScopeId: newScope.id,
          officeId: newOffice.id,
          createdBy: (req as any).user?.id || null,
        });

        // 4.6 Assign tenant_admin role to user for this workspace
        let adminRole = await tx.query.roles.findFirst({
          where: eq(roles.slug, "tenant_admin"),
        });

        if (!adminRole) {
          adminRole = await tx.query.roles.findFirst({
            where: eq(roles.slug, "admin"),
          });
        }

        if (!adminRole) {
          const [createdRole] = await tx
            .insert(roles)
            .values({
              name: "Managing Partner",
              slug: "tenant_admin",
              isSystemRole: true,
              description: "Full administrator access to tenant workspace",
            })
            .returning();
          adminRole = createdRole;
        }

        await tx.insert(userRoles).values({
          scopeId: newScope.id,
          roleId: adminRole.id,
        });

        // 4.7 Associate subscription plan if selected
        let attachedPlan = null;
        let subscriptionRecord = null;
        let paymentRecord = null;

        if (planId) {
          const plan = await tx.query.subscriptionPlans.findFirst({
            where: eq(subscriptionPlans.id, planId),
          });

          if (plan) {
            attachedPlan = plan;
            const startDate = new Date();
            const daysToAdd = normalizedBillingCycle === "annual" ? 365 : 30;
            const nextBilling = new Date(startDate.getTime() + daysToAdd * 24 * 60 * 60 * 1000);
            const standardPlanPrice =
              normalizedBillingCycle === "annual" ? plan.annualPrice : plan.monthlyPrice;
            const finalFee =
              extraFeePaid !== undefined && extraFeePaid !== ""
                ? Number(extraFeePaid)
                : Number(standardPlanPrice || 0);

            const [sub] = await tx
              .insert(tenantSubscriptions)
              .values({
                tenantId: newTenant.id,
                planId: plan.id,
                status: "active",
                billingCycle: normalizedBillingCycle,
                amount: String(finalFee),
                currency: currency || plan.currency || "INR",
                startDate: startDate.toISOString().split("T")[0],
                nextBillingDate: nextBilling.toISOString().split("T")[0],
                autoRenew: true,
              })
              .returning();
            subscriptionRecord = sub;

            // Generate payment record
            const invNum =
              receiptRef?.trim() ||
              `INV-ADDON-${Date.now().toString().slice(-6)}-${Math.floor(100 + Math.random() * 900)}`;

            const [payment] = await tx
              .insert(subscriptionPaymentHistory)
              .values({
                tenantId: newTenant.id,
                invoiceNumber: invNum,
                planId: plan.id,
                planName: `${plan.name} (Additional Workspace Add-on)`,
                amount: String(finalFee),
                currency: currency || "INR",
                status: "paid",
                billingCycle: normalizedBillingCycle,
                paymentMethod: paymentMethod || "manual_bank_transfer",
                receiptUrl: receiptRef || null,
                transactionDate: new Date(),
              })
              .returning();
            paymentRecord = payment;
          }
        } else if (extraFeePaid && Number(extraFeePaid) > 0) {
          const invNum =
            receiptRef?.trim() ||
            `INV-ADDON-${Date.now().toString().slice(-6)}-${Math.floor(100 + Math.random() * 900)}`;

          const [payment] = await tx
            .insert(subscriptionPaymentHistory)
            .values({
              tenantId: newTenant.id,
              invoiceNumber: invNum,
              planName: "Additional Workspace Provisioning Surcharge",
              amount: String(extraFeePaid),
              currency: currency || "INR",
              status: "paid",
              billingCycle: normalizedBillingCycle,
              paymentMethod: paymentMethod || "manual_bank_transfer",
              receiptUrl: receiptRef || null,
              transactionDate: new Date(),
            })
            .returning();
          paymentRecord = payment;
        }

        return {
          tenant: newTenant,
          office: newOffice,
          scope: newScope,
          role: adminRole,
          plan: attachedPlan,
          subscription: subscriptionRecord,
          payment: paymentRecord,
        };
      });

      // 5. Record audit log
      await auditLogService.record({
        tenantId: transactionResult.tenant.id,
        officeId: transactionResult.office.id,
        userId: (req as any).user?.id || null,
        entity: "Tenants",
        entityId: transactionResult.tenant.id,
        action: "PROVISION_CUSTOMER_ORGANIZATION",
        description: `Admin provisioned additional organization '${transactionResult.tenant.name}' (${transactionResult.tenant.slug}) for customer ${targetUser.name} (${targetUser.email}).`,
        ipAddress: req.ip || "127.0.0.1",
        details: {
          customerId: targetUser.id,
          customerName: targetUser.name,
          customerEmail: targetUser.email,
          tenantId: transactionResult.tenant.id,
          tenantSlug: transactionResult.tenant.slug,
          officeId: transactionResult.office.id,
          planName: transactionResult.plan?.name,
          extraFeePaid,
          receiptRef,
          adminNotes,
        },
      });

      return res.status(201).json(
        ResponseHandler(201, "Organization provisioned successfully for customer", {
          ...transactionResult,
          customer: {
            id: targetUser.id,
            name: targetUser.name,
            email: targetUser.email,
            phone: targetUser.phone,
          },
        })
      );
    } catch (error) {
      console.error("Admin provision organization for user error:", error);
      return next(CustomErrorHandler.serverError());
    }
  },
};

export default adminTenantController;
