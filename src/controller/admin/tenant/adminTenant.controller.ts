import { eq, ne, ilike, or, and, count, inArray, SQL, asc, desc } from "drizzle-orm";
import { NextFunction, Request, Response } from "express";
import bcrypt from "bcrypt";
import slugify from "slugify";

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
  advocates,
  caseAdvocates,
  courts,
  caseTypes,
} from "../../../db/schema/index.js";

import CustomErrorHandler from "../../../utils/customErrorHandler.js";
import ResponseHandler from "../../../utils/responseHandler.js";
import {
  deleteFileFromCloudinary,
  uploadFileToCloudinary,
} from "../../../services/cloudinary.service.js";
import auditLogService from "../../../services/auditLog.service.js";
import { sendLawFirmWelcomeEmail } from "../../../services/lawFirmWelcomeEmail.service.js";

/**
 * Helper to fetch the actual Managing Partner / Firm Owner for a tenant workspace.
 * Resolves by priority:
 * 1. User with 'tenant_admin' role in this tenant workspace
 * 2. User with 'admin' role in this tenant workspace
 * 3. Founding user (earliest created user scope for this tenant)
 */
async function getTenantManagingPartner(
  tenantId: string,
  tenantName?: string | null,
  tenantEmail?: string | null
) {
  // 1. Look for user with 'tenant_admin' role in this tenant workspace
  const [adminRow] = await db
    .select({
      user: user,
      roleSlug: roles.slug,
      roleName: roles.name,
    })
    .from(userScopes)
    .innerJoin(user, eq(userScopes.userId, user.id))
    .innerJoin(userRoles, eq(userRoles.scopeId, userScopes.id))
    .innerJoin(roles, eq(userRoles.roleId, roles.id))
    .where(
      and(
        eq(userScopes.tenantId, tenantId),
        eq(roles.slug, "tenant_admin")
      )
    )
    .orderBy(asc(userScopes.createdAt))
    .limit(1);

  if (adminRow?.user) {
    return {
      realUser: adminRow.user,
      ownerName: adminRow.user.name,
      ownerEmail: adminRow.user.email,
      ownerPhone: adminRow.user.phone || undefined,
      ownerId: adminRow.user.id,
      roleSlug: adminRow.roleSlug,
      roleName: adminRow.roleName || "Managing Partner",
    };
  }

  // 2. Fallback: User with 'admin' role in this tenant workspace
  const [generalAdminRow] = await db
    .select({
      user: user,
      roleSlug: roles.slug,
      roleName: roles.name,
    })
    .from(userScopes)
    .innerJoin(user, eq(userScopes.userId, user.id))
    .innerJoin(userRoles, eq(userRoles.scopeId, userScopes.id))
    .innerJoin(roles, eq(userRoles.roleId, roles.id))
    .where(
      and(
        eq(userScopes.tenantId, tenantId),
        eq(roles.slug, "admin")
      )
    )
    .orderBy(asc(userScopes.createdAt))
    .limit(1);

  if (generalAdminRow?.user) {
    return {
      realUser: generalAdminRow.user,
      ownerName: generalAdminRow.user.name,
      ownerEmail: generalAdminRow.user.email,
      ownerPhone: generalAdminRow.user.phone || undefined,
      ownerId: generalAdminRow.user.id,
      roleSlug: generalAdminRow.roleSlug,
      roleName: generalAdminRow.roleName || "Administrator",
    };
  }

  // 3. Fallback: Chronologically first user created for this tenant (founding account)
  const initialScope = await db.query.userScopes.findFirst({
    where: eq(userScopes.tenantId, tenantId),
    with: {
      user: true,
    },
    orderBy: (s, { asc }) => [asc(s.createdAt)],
  });

  const realUser = initialScope?.user;
  return {
    realUser,
    ownerName: realUser?.name || (tenantName ? `${tenantName} Admin` : "Law Firm Admin"),
    ownerEmail: realUser?.email || tenantEmail || undefined,
    ownerPhone: realUser?.phone || undefined,
    ownerId: realUser?.id || undefined,
    roleSlug: "tenant_admin",
    roleName: "Managing Partner",
  };
}

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

      // Always exclude internal platform management tenant
      const conditions: SQL[] = [ne(tenants.slug, "system")];

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

      // Enhance with real owner details, usersCount, officesCount, and activePlan
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

          // Fetch the real primary / managing partner user for this tenant (priority: tenant_admin role)
          const partner = await getTenantManagingPartner(t.id, t.name, t.organisationEmail);

          return {
            id: t.id,
            name: t.name,
            slug: t.slug,
            logo: t.logo,
            timezone: t.timezone || "Asia/Kolkata",
            status: t.status || "active",
            createdAt: t.createdAt ? new Date(t.createdAt).toISOString() : new Date().toISOString(),
            updatedAt: t.updatedAt ? new Date(t.updatedAt).toISOString() : undefined,
            ownerName: partner.ownerName,
            ownerEmail: partner.ownerEmail,
            ownerPhone: partner.ownerPhone,
            ownerId: partner.ownerId,
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

      const [casesRes] = await db
        .select({ count: count() })
        .from(cases)
        .where(eq(cases.tenantId, tenant.id));

      const [activeCasesRes] = await db
        .select({ count: count() })
        .from(cases)
        .where(
          and(
            eq(cases.tenantId, tenant.id),
            eq(cases.isDecided, false),
            eq(cases.isAbandoned, false)
          )
        );

      const [disposedCasesRes] = await db
        .select({ count: count() })
        .from(cases)
        .where(
          and(
            eq(cases.tenantId, tenant.id),
            or(eq(cases.isDecided, true), eq(cases.status, "disposed"))
          )
        );

      const firmCasesValue = await db
        .select({ caseValue: cases.caseValue })
        .from(cases)
        .where(eq(cases.tenantId, tenant.id));

      const totalClaimValue = firmCasesValue.reduce(
        (acc, c) => acc + (Number(c.caseValue) || 0),
        0
      );

      const firmOffices = await db.query.offices.findMany({
        where: eq(offices.tenantId, tenant.id),
        orderBy: (o, { desc }) => [desc(o.isHeadOffice), desc(o.createdAt)],
      });

      // Fetch the real primary / managing partner user for this tenant (priority: tenant_admin role)
      const partner = await getTenantManagingPartner(tenant.id, tenant.name, tenant.organisationEmail);

      const formattedTenant = {
        id: tenant.id,
        name: tenant.name,
        slug: tenant.slug,
        logo: tenant.logo,
        gst: tenant.gst || undefined,
        organisationEmail: tenant.organisationEmail || undefined,
        organisationPhone: tenant.organisationPhone || undefined,
        timezone: tenant.timezone || "Asia/Kolkata",
        status: tenant.status || "active",
        storageUsedBytes: Number(tenant.storageUsedBytes) || 0,
        createdAt: tenant.createdAt ? new Date(tenant.createdAt).toISOString() : new Date().toISOString(),
        updatedAt: tenant.updatedAt ? new Date(tenant.updatedAt).toISOString() : undefined,
        ownerName: partner.ownerName,
        ownerEmail: partner.ownerEmail,
        ownerPhone: partner.ownerPhone,
        ownerId: partner.ownerId,
        ownerRole: partner.roleName || "Managing Partner",
        usersCount: usersRes?.count || 1,
        officesCount: officesRes?.count || 1,
        casesCount: casesRes?.count || 0,
        activeCasesCount: activeCasesRes?.count || 0,
        disposedCasesCount: disposedCasesRes?.count || 0,
        totalClaimValue,
        offices: firmOffices.map((o) => ({
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
        })),
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
  // GET TENANT ADVOCATES ROSTER
  // =========================================================================
  async getTenantAdvocates(req: Request, res: Response, next: NextFunction) {
    try {
      const { id } = req.params;

      const tenantRecord = await db.query.tenants.findFirst({
        where: eq(tenants.id, id),
      });

      if (!tenantRecord) {
        return next(CustomErrorHandler.notFound("Tenant not found"));
      }

      // Query all user scopes in this tenant
      const scopes = await db.query.userScopes.findMany({
        where: eq(userScopes.tenantId, id),
        with: {
          user: true,
        },
      });

      const advocatesList = await Promise.all(
        scopes.map(async (scope) => {
          if (!scope.user) return null;

          // Check advocate profile if exists
          const advProfile = await db.query.advocates.findFirst({
            where: eq(advocates.userId, scope.user.id),
          });

          // Check roles in this tenant scope
          const assignedRoles = await db
            .select({
              id: roles.id,
              name: roles.name,
              slug: roles.slug,
            })
            .from(userRoles)
            .innerJoin(roles, eq(userRoles.roleId, roles.id))
            .where(eq(userRoles.scopeId, scope.id));

          // If advocate profile exists, query their assigned cases for this firm
          let activeCasesCount = 0;
          let disposedCasesCount = 0;

          if (advProfile) {
            const assignedCaseLinks = await db
              .select({
                isDecided: cases.isDecided,
                isAbandoned: cases.isAbandoned,
                status: cases.status,
              })
              .from(caseAdvocates)
              .innerJoin(cases, eq(caseAdvocates.caseId, cases.id))
              .where(
                and(
                  eq(caseAdvocates.advocateId, advProfile.id),
                  eq(cases.tenantId, id)
                )
              );

            for (const c of assignedCaseLinks) {
              if (
                c.isDecided ||
                c.status === "disposed" ||
                c.isAbandoned ||
                c.status === "closed"
              ) {
                disposedCasesCount++;
              } else {
                activeCasesCount++;
              }
            }
          }

          const primaryRole = assignedRoles[0];

          return {
            id: scope.user.id,
            userId: scope.user.id,
            advocateId: advProfile?.id || null,
            name: scope.user.name,
            email: scope.user.email,
            phone: scope.user.phone || undefined,
            avatar: scope.user.avatar || undefined,
            designation:
              advProfile?.designation ||
              (primaryRole?.slug === "tenant_admin"
                ? "Managing Partner"
                : primaryRole?.name || "Advocate"),
            enrollmentNo: advProfile?.enrollmentNo || undefined,
            barCouncil: advProfile?.barCouncil || undefined,
            barCouncilNumber: advProfile?.barCouncil || advProfile?.enrollmentNo || undefined,
            practiceArea: advProfile?.practiceArea || undefined,
            practiceAreas: advProfile?.practiceArea ? [advProfile.practiceArea] : [],
            isLead: primaryRole?.slug === "tenant_admin",
            isOwner: primaryRole?.slug === "tenant_admin",
            role: primaryRole?.name || "Advocate",
            roleName: primaryRole?.name || "Advocate",
            roleSlug: primaryRole?.slug || "advocate",
            activeCasesCount,
            disposedCasesCount,
            totalCasesCount: activeCasesCount + disposedCasesCount,
            casesActive: activeCasesCount,
            casesDisposed: disposedCasesCount,
            casesTotal: activeCasesCount + disposedCasesCount,
            isDefault: scope.isDefault,
            joinedAt: scope.createdAt
              ? new Date(scope.createdAt).toISOString()
              : new Date().toISOString(),
          };
        })
      );

      // Sort: Managing partner first, then by active cases desc, then by name
      const sorted = (
        advocatesList.filter(Boolean) as NonNullable<
          (typeof advocatesList)[number]
        >[]
      ).sort((a, b) => {
        if (a.isLead && !b.isLead) return -1;
        if (!a.isLead && b.isLead) return 1;
        return b.activeCasesCount - a.activeCasesCount || a.name.localeCompare(b.name);
      });

      return res.status(200).json(
        ResponseHandler(200, "Firm advocates fetched successfully", sorted)
      );
    } catch (error) {
      console.error("Admin get tenant advocates error:", error);
      return next(CustomErrorHandler.serverError());
    }
  },

  // =========================================================================
  // GET TENANT CASES SUMMARY & STATUS PIPELINE
  // =========================================================================
  async getTenantCasesSummary(req: Request, res: Response, next: NextFunction) {
    try {
      const { id } = req.params;
      const { status, search } = req.query as { status?: string; search?: string };

      const tenantRecord = await db.query.tenants.findFirst({
        where: eq(tenants.id, id),
      });

      if (!tenantRecord) {
        return next(CustomErrorHandler.notFound("Tenant not found"));
      }

      // 1. Fetch all cases for this firm
      const firmCases = await db
        .select({
          id: cases.id,
          caseNumber: cases.caseNumber,
          cnrNumber: cases.cnrNumber,
          title: cases.title,
          stage: cases.stage,
          priority: cases.priority,
          status: cases.status,
          caseValue: cases.caseValue,
          isDecided: cases.isDecided,
          isAbandoned: cases.isAbandoned,
          firstParty: cases.firstParty,
          oppositeParty: cases.oppositeParty,
          judgeName: cases.judgeName,
          filingDate: cases.filingDate,
          registrationDate: cases.registrationDate,
          nextHearingDate: cases.nextHearingDate,
          createdAt: cases.createdAt,
          courtName: courts.name,
          caseTypeName: caseTypes.name,
        })
        .from(cases)
        .leftJoin(courts, eq(cases.courtId, courts.id))
        .leftJoin(caseTypes, eq(cases.caseTypeId, caseTypes.id))
        .where(eq(cases.tenantId, id))
        .orderBy(desc(cases.createdAt));

      // 2. Fetch assigned advocates for all firm cases
      const caseIds = firmCases.map((c) => c.id);
      const advocateAssignments =
        caseIds.length > 0
          ? await db
              .select({
                caseId: caseAdvocates.caseId,
                advocateId: caseAdvocates.advocateId,
                isPrimary: caseAdvocates.isPrimary,
                userId: user.id,
                userName: user.name,
                userEmail: user.email,
                avatar: user.avatar,
                designation: advocates.designation,
                barCouncil: advocates.barCouncil,
                enrollmentNo: advocates.enrollmentNo,
              })
              .from(caseAdvocates)
              .innerJoin(advocates, eq(caseAdvocates.advocateId, advocates.id))
              .innerJoin(user, eq(advocates.userId, user.id))
              .where(inArray(caseAdvocates.caseId, caseIds))
          : [];

      const advocatesByCase = new Map<string, typeof advocateAssignments>();
      for (const a of advocateAssignments) {
        if (!advocatesByCase.has(a.caseId)) {
          advocatesByCase.set(a.caseId, []);
        }
        advocatesByCase.get(a.caseId)!.push(a);
      }

      // 3. Compute status statistics pipeline
      const stats = {
        total: firmCases.length,
        totalCases: firmCases.length,
        activeCases: 0,
        disposedCases: 0,
        closedCases: 0,
        open: 0,
        in_progress: 0,
        pending: 0,
        stayed: 0,
        disposed: 0,
        closed: 0,
        totalClaimValue: 0,
        statusBreakdown: {
          open: 0,
          in_progress: 0,
          pending: 0,
          stayed: 0,
          disposed: 0,
          closed: 0,
        },
      };

      for (const c of firmCases) {
        if (c.caseValue) {
          stats.totalClaimValue += Number(c.caseValue) || 0;
        }

        if (c.isDecided || c.status === "disposed") {
          stats.disposed++;
          stats.disposedCases++;
          stats.statusBreakdown.disposed++;
        } else if (c.isAbandoned || c.status === "closed") {
          stats.closed++;
          stats.closedCases++;
          stats.statusBreakdown.closed++;
        } else if (c.status === "in_progress") {
          stats.in_progress++;
          stats.activeCases++;
          stats.statusBreakdown.in_progress++;
        } else if (c.status === "stayed") {
          stats.stayed++;
          stats.activeCases++;
          stats.statusBreakdown.stayed++;
        } else if (c.status === "pending") {
          stats.pending++;
          stats.activeCases++;
          stats.statusBreakdown.pending++;
        } else {
          stats.open++;
          stats.activeCases++;
          stats.statusBreakdown.open++;
        }
      }

      // 4. Filter cases by search or status if provided
      let filtered = firmCases;
      if (status && status !== "all") {
        if (status === "disposed") {
          filtered = filtered.filter((c) => c.isDecided || c.status === "disposed");
        } else if (status === "closed") {
          filtered = filtered.filter((c) => c.isAbandoned || c.status === "closed");
        } else {
          filtered = filtered.filter((c) => c.status === status);
        }
      }

      if (search && search.trim() !== "") {
        const q = search.trim().toLowerCase();
        filtered = filtered.filter((c) => {
          const assigned = advocatesByCase.get(c.id) || [];
          const matchesAdvocate = assigned.some(
            (a) =>
              (a.userName && a.userName.toLowerCase().includes(q)) ||
              (a.userEmail && a.userEmail.toLowerCase().includes(q))
          );
          return (
            (c.title && c.title.toLowerCase().includes(q)) ||
            (c.caseNumber && c.caseNumber.toLowerCase().includes(q)) ||
            (c.cnrNumber && c.cnrNumber.toLowerCase().includes(q)) ||
            (c.courtName && c.courtName.toLowerCase().includes(q)) ||
            matchesAdvocate
          );
        });
      }

      return res.status(200).json(
        ResponseHandler(200, "Firm cases summary fetched successfully", {
          stats,
          cases: filtered.map((c) => {
            const assigned = advocatesByCase.get(c.id) || [];
            const primaryAdvocate = assigned.find((a) => a.isPrimary) || assigned[0];
            return {
              ...c,
              court: c.courtName,
              caseType: c.caseTypeName,
              caseValue: c.caseValue ? Number(c.caseValue) : undefined,
              assignedLawyer: primaryAdvocate
                ? {
                    id: primaryAdvocate.userId,
                    advocateId: primaryAdvocate.advocateId,
                    name: primaryAdvocate.userName,
                    email: primaryAdvocate.userEmail,
                    isPrimary: primaryAdvocate.isPrimary,
                    designation: primaryAdvocate.designation,
                    barCouncilNumber:
                      primaryAdvocate.barCouncil || primaryAdvocate.enrollmentNo,
                  }
                : null,
              assignedAdvocates: assigned.map((a) => ({
                id: a.userId,
                advocateId: a.advocateId,
                name: a.userName,
                email: a.userEmail,
                isPrimary: a.isPrimary,
              })),
              createdAt: c.createdAt
                ? new Date(c.createdAt).toISOString()
                : new Date().toISOString(),
            };
          }),
        })
      );
    } catch (error) {
      console.error("Admin get tenant cases summary error:", error);
      return next(CustomErrorHandler.serverError());
    }
  },

  // =========================================================================
  // GET TENANT BILLING & SUBSCRIPTION
  // =========================================================================
  async getTenantBillingSubscription(req: Request, res: Response, next: NextFunction) {
    try {
      const { id } = req.params;

      const tenantRecord = await db.query.tenants.findFirst({
        where: eq(tenants.id, id),
      });

      if (!tenantRecord) {
        return next(CustomErrorHandler.notFound("Tenant not found"));
      }

      // Active Subscription
      const sub = await db.query.tenantSubscriptions.findFirst({
        where: eq(tenantSubscriptions.tenantId, id),
        with: {
          plan: true,
        },
      });

      // Always resolve actual plan limits from subscriptionPlans table
      let planRecord = sub?.plan;
      if (!planRecord && sub?.planId) {
        planRecord = await db.query.subscriptionPlans.findFirst({
          where: eq(subscriptionPlans.id, sub.planId),
        });
      }
      if (!planRecord) {
        planRecord = await db.query.subscriptionPlans.findFirst({
          where: eq(subscriptionPlans.code, "free_trial"),
        });
      }

      const planLimits = {
        maxUsers: planRecord?.maxUsers ?? 1,
        maxOffices: planRecord?.maxOffices ?? 1,
        maxStorageGb: planRecord?.maxStorageGb ?? 2,
        monthlyAiDrafts: planRecord?.monthlyAiDrafts ?? 4,
        monthlyOcrPages: planRecord?.monthlyOcrPages ?? 10,
        monthlyOcrCredits: planRecord?.monthlyOcrCredits ?? 100,
      };

      // Platform resource consumption
      const [usersRes] = await db
        .select({ count: count() })
        .from(userScopes)
        .where(eq(userScopes.tenantId, id));

      const [officesRes] = await db
        .select({ count: count() })
        .from(offices)
        .where(eq(offices.tenantId, id));

      // Payment History
      const payments = await db.query.subscriptionPaymentHistory.findMany({
        where: eq(subscriptionPaymentHistory.tenantId, id),
        orderBy: (p, { desc }) => [desc(p.transactionDate), desc(p.createdAt)],
      });

      // Total Spend
      const totalSpend = payments.reduce(
        (acc, p) => acc + (Number(p.amount) || 0),
        0
      );

      const usage = {
        users: {
          used: usersRes?.count || 1,
          current: usersRes?.count || 1,
          limit: planLimits.maxUsers,
        },
        offices: {
          used: officesRes?.count || 1,
          current: officesRes?.count || 1,
          limit: planLimits.maxOffices,
        },
        storage: {
          usedBytes: Number(tenantRecord.storageUsedBytes) || 0,
          currentBytes: Number(tenantRecord.storageUsedBytes) || 0,
          limitGb: planLimits.maxStorageGb,
        },
      };

      const subscriptionObj = sub
        ? {
            id: sub.id,
            planId: sub.planId,
            planName: planRecord?.name || "Free Trial",
            tier: planRecord?.code || "free_trial",
            planCode: planRecord?.code || "free_trial",
            status: sub.status,
            billingCycle: sub.billingCycle,
            amount: Number(sub.amount),
            price: Number(sub.amount),
            currency: sub.currency,
            startDate: sub.startDate
              ? new Date(sub.startDate).toISOString()
              : undefined,
            currentPeriodStart: sub.startDate
              ? new Date(sub.startDate).toISOString()
              : undefined,
            nextBillingDate: sub.nextBillingDate
              ? new Date(sub.nextBillingDate).toISOString()
              : undefined,
            currentPeriodEnd: sub.nextBillingDate
              ? new Date(sub.nextBillingDate).toISOString()
              : undefined,
            features: planRecord?.features || [],
            limits: planLimits,
          }
        : null;

      const paymentsList = payments.map((p) => ({
        id: p.id,
        invoiceNumber: p.invoiceNumber,
        planName: p.planName || "Subscription Renewal",
        amount: Number(p.amount),
        currency: p.currency,
        status: p.status,
        billingCycle: p.billingCycle,
        paymentMethod: p.paymentMethod || "Razorpay Online",
        receiptUrl: p.receiptUrl,
        invoiceUrl: p.receiptUrl,
        transactionDate: p.transactionDate
          ? new Date(p.transactionDate).toISOString()
          : new Date().toISOString(),
        createdAt: p.transactionDate
          ? new Date(p.transactionDate).toISOString()
          : new Date().toISOString(),
      }));

      return res.status(200).json(
        ResponseHandler(200, "Firm billing & subscription fetched successfully", {
          subscription: subscriptionObj,
          ongoingSubscription: subscriptionObj,
          usage,
          totalSpend,
          payments: paymentsList,
          paymentHistory: paymentsList,
        })
      );
    } catch (error) {
      console.error("Admin get tenant billing subscription error:", error);
      return next(CustomErrorHandler.serverError());
    }
  },

  // =========================================================================
  // ONBOARD LAW FIRM USER & PRACTICE (Admin Console)
  // =========================================================================
  async createTenant(req: Request, res: Response, next: NextFunction) {
    try {
      const {
        name,
        firmName,
        slug,
        ownerEmail,
        email,
        ownerName,
        userName,
        ownerPhone,
        phone,
        password,
        timezone,
        status,
        initialPlanId,
        planId,
        officeName,
        city,
      } = req.body;

      const effectiveFirmName = (firmName || name || "").trim();
      const effectiveOwnerName = (ownerName || userName || "").trim();
      const effectiveEmail = (ownerEmail || email || "").toLowerCase().trim();
      const effectivePhone = (ownerPhone || phone || "").trim() || null;
      const chosenPlanId = initialPlanId || planId;

      if (!effectiveFirmName && !effectiveOwnerName) {
        return next(CustomErrorHandler.badRequest("Law firm or managing partner name is required"));
      }

      const finalFirmName = effectiveFirmName || (effectiveOwnerName ? `${effectiveOwnerName}'s Practice` : "Law Firm Practice");
      const finalOwnerName = effectiveOwnerName || `${finalFirmName} Admin`;

      if (!effectiveEmail) {
        return next(CustomErrorHandler.badRequest("Managing partner email address is required"));
      }

      if (effectivePhone && effectivePhone.length > 30) {
        return next(CustomErrorHandler.badRequest("Phone number cannot exceed 30 characters"));
      }

      // Password generation or validation
      const rawPassword =
        password && password.trim().length >= 6
          ? password.trim()
          : `Lawyer@${Math.floor(100000 + Math.random() * 900000)}`;

      const hashedPassword = await bcrypt.hash(rawPassword, 10);

      // Generate unique tenant slug
      const rawSlug = slug || finalFirmName;
      let baseSlug = slugify(rawSlug, { lower: true, strict: true });
      if (!baseSlug) {
        baseSlug = `firm-${Date.now().toString().slice(-6)}`;
      }

      let tenantSlug = baseSlug;
      let slugCount = 1;
      while (await db.query.tenants.findFirst({ where: eq(tenants.slug, tenantSlug) })) {
        tenantSlug = `${baseSlug}-${slugCount++}`;
      }

      // Execute creation in atomic transaction
      const result = await db.transaction(async (tx) => {
        // 1. Check or create User
        let targetUser = await tx.query.user.findFirst({
          where: eq(user.email, effectiveEmail),
        });

        let isNewUser = false;
        if (!targetUser) {
          if (effectivePhone) {
            const existingPhone = await tx.query.user.findFirst({
              where: eq(user.phone, effectivePhone),
            });
            if (existingPhone) {
              throw CustomErrorHandler.badRequest("A user with this phone number already exists");
            }
          }

          const [createdUser] = await tx
            .insert(user)
            .values({
              name: finalOwnerName,
              email: effectiveEmail,
              phone: effectivePhone,
              password: hashedPassword,
              isEmailVerified: true,
              isPhoneVerified: true,
              status: "active",
            })
            .returning();
          targetUser = createdUser;
          isNewUser = true;
        }

        // 2. Create Tenant Practice
        const [newTenant] = await tx
          .insert(tenants)
          .values({
            name: finalFirmName,
            slug: tenantSlug,
            organisationEmail: effectiveEmail,
            timezone: timezone || "Asia/Kolkata",
            status: status || "active",
          })
          .returning();

        // 3. Create Head Office
        const [headOffice] = await tx
          .insert(offices)
          .values({
            tenantId: newTenant.id,
            name: officeName?.trim() || "Head Office",
            city: city?.trim() || null,
            email: effectiveEmail,
            phone: effectivePhone,
            isHeadOffice: true,
            isActive: true,
          })
          .returning();

        // 4. Create User Scope
        const existingScopes = await tx.query.userScopes.findMany({
          where: eq(userScopes.userId, targetUser.id),
        });
        const isDefault = existingScopes.length === 0;

        const [scope] = await tx
          .insert(userScopes)
          .values({
            userId: targetUser.id,
            tenantId: newTenant.id,
            isDefault,
          })
          .returning();

        // 5. Connect User Scope to Head Office
        await tx.insert(userScopeOffices).values({
          userScopeId: scope.id,
          officeId: headOffice.id,
        });

        // 6. Assign Tenant Admin Role
        let adminRole = await tx.query.roles.findFirst({
          where: eq(roles.slug, "tenant_admin"),
        });

        if (!adminRole) {
          adminRole = await tx.query.roles.findFirst({
            where: eq(roles.slug, "admin"),
          });
        }

        if (!adminRole) {
          const [newRole] = await tx
            .insert(roles)
            .values({
              name: "Managing Partner",
              slug: "tenant_admin",
              isSystemRole: true,
              description: "Managing partner and tenant administrator",
            })
            .returning();
          adminRole = newRole;
        }

        await tx.insert(userRoles).values({
          scopeId: scope.id,
          roleId: adminRole.id,
        });

        // 7. Associate Subscription Plan (Custom chosen or 14-day free trial default)
        let plan = null;
        if (chosenPlanId) {
          plan = await tx.query.subscriptionPlans.findFirst({
            where: eq(subscriptionPlans.id, chosenPlanId),
          });
        }

        if (!plan) {
          plan = await tx.query.subscriptionPlans.findFirst({
            where: and(
              eq(subscriptionPlans.code, "free_trial"),
              eq(subscriptionPlans.isActive, true)
            ),
          });
        }

        let subscription = null;
        if (plan) {
          const isTrial = plan.code === "free_trial" || Number(plan.monthlyPrice) === 0;
          const durationDays = isTrial ? 14 : 30;
          const startDate = new Date();
          const nextBilling = new Date(startDate.getTime() + durationDays * 24 * 60 * 60 * 1000);

          const [createdSub] = await tx
            .insert(tenantSubscriptions)
            .values({
              tenantId: newTenant.id,
              planId: plan.id,
              status: isTrial ? "trial" : "active",
              billingCycle: "monthly",
              amount: String(plan.monthlyPrice || "0.00"),
              currency: plan.currency || "INR",
              startDate: startDate.toISOString().split("T")[0],
              nextBillingDate: nextBilling.toISOString().split("T")[0],
              autoRenew: !isTrial,
            })
            .returning();
          subscription = createdSub;
        }

        return {
          tenant: newTenant,
          user: targetUser,
          isNewUser,
          rawPassword: isNewUser ? rawPassword : null,
          office: headOffice,
          plan,
          subscription,
        };
      });

      // Dispatch welcome email with credentials & password change advisory asynchronously
      sendLawFirmWelcomeEmail({
        lawyerName: result.user.name,
        lawyerEmail: result.user.email,
        password: result.rawPassword || undefined,
        firmName: result.tenant.name,
        workspaceSlug: result.tenant.slug,
        planName: result.plan?.name || "14-Day Free Trial",
      }).catch((emailErr) => {
        console.error("Async law firm welcome email send error:", emailErr);
      });

      return res.status(201).json(
        ResponseHandler(201, "Law firm user and practice registered successfully", {
          ...result.tenant,
          ownerName: result.user.name,
          ownerEmail: result.user.email,
          ownerPhone: result.user.phone,
          ownerId: result.user.id,
          isNewUser: result.isNewUser,
          temporaryPassword: result.rawPassword,
          credentials: {
            email: result.user.email,
            password: result.rawPassword,
            practiceName: result.tenant.name,
            workspaceUrl: `/${result.tenant.slug}`,
          },
        })
      );
    } catch (error) {
      console.error("Admin create tenant user error:", error);
      return next(error);
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

      // Exclude internal platform system tenant from business customer organizations
      const allTenants = await db.query.tenants.findMany({
        where: tenantId
          ? eq(tenants.id, tenantId)
          : ne(tenants.slug, "system"),
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

      const customerSummaries = (
        await Promise.all(
          allUsers.map(async (u) => {
            const scopes = await db.query.userScopes.findMany({
              where: eq(userScopes.userId, u.id),
              with: {
                tenant: true,
              },
            });

            // Retrieve roles assigned to the user across scopes
            const assignedRoles = await db
              .select({
                slug: roles.slug,
                name: roles.name,
                isSystemRole: roles.isSystemRole,
              })
              .from(userRoles)
              .innerJoin(roles, eq(userRoles.roleId, roles.id))
              .innerJoin(userScopes, eq(userRoles.scopeId, userScopes.id))
              .where(eq(userScopes.userId, u.id));

            const isSuperAdmin =
              u.email?.toLowerCase().includes("superadmin") ||
              assignedRoles.some((r) => r.slug === "super_admin");

            const isPlatformRole = assignedRoles.some(
              (r) =>
                Boolean(
                  r.slug &&
                    [
                      "super_admin",
                      "platform_admin",
                      "custom_admin",
                      "support_admin",
                      "compliance_admin",
                      "billing_admin",
                    ].includes(r.slug)
                )
            );

            const isOnlySystemTenant =
              scopes.length > 0 && scopes.every((s) => s.tenant?.slug === "system");

            // Filter out internal system tenant if present
            const validOrgs = scopes
              .filter(
                (s): s is typeof s & { tenant: NonNullable<typeof s.tenant> } =>
                  Boolean(s.tenant && s.tenant.slug !== "system")
              )
              .map((s) => ({
                tenantId: s.tenant.id,
                name: s.tenant.name,
                slug: s.tenant.slug,
                status: s.tenant.status,
                isDefault: s.isDefault,
                createdAt: s.tenant.createdAt,
              }));

            // Only accounts that are Firm Owners / Managing Partners (tenant_admin or admin) count as customer account owners
            const isCustomerOwner = assignedRoles.some(
              (r) => r.slug === "tenant_admin" || r.slug === "admin"
            );

            // Exclude platform-side staff / superadmin, accounts without business tenant, and non-owner tenant members (advocates, staff, clients)
            if (
              isSuperAdmin ||
              isPlatformRole ||
              isOnlySystemTenant ||
              validOrgs.length === 0 ||
              !isCustomerOwner
            ) {
              return null;
            }

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
        )
      ).filter((c): c is NonNullable<typeof c> => c !== null);

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

      // 1. Verify user exists and is a business profile customer
      const targetUser = await db.query.user.findFirst({
        where: eq(user.id, userId),
      });

      if (!targetUser) {
        return next(CustomErrorHandler.notFound("Customer / User account not found"));
      }

      // Ensure target user is not a platform admin/superadmin
      const userScopesList = await db.query.userScopes.findMany({
        where: eq(userScopes.userId, targetUser.id),
        with: { tenant: true },
      });

      const userRoleRecords = await db
        .select({ slug: roles.slug })
        .from(userRoles)
        .innerJoin(roles, eq(userRoles.roleId, roles.id))
        .innerJoin(userScopes, eq(userRoles.scopeId, userScopes.id))
        .where(eq(userScopes.userId, targetUser.id));

      const isPlatformUser =
        targetUser.email?.toLowerCase().includes("superadmin") ||
        userRoleRecords.some(
          (r) =>
            Boolean(
              r.slug &&
                [
                  "super_admin",
                  "platform_admin",
                  "custom_admin",
                  "support_admin",
                  "compliance_admin",
                  "billing_admin",
                ].includes(r.slug)
            )
        ) ||
        (userScopesList.length > 0 && userScopesList.every((s) => s.tenant?.slug === "system"));

      if (isPlatformUser) {
        return next(
          CustomErrorHandler.badRequest(
            "Organizations can only be provisioned for business profile customer accounts, not platform administrators."
          )
        );
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
            status: "trial",
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
            createdBy: (req as Request & { user?: { id?: string } }).user?.id || targetUser.id,
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
            createdBy: (req as Request & { user?: { id?: string } }).user?.id || null,
          })
          .returning();

        // 4.5 Link user scope to head office
        await tx.insert(userScopeOffices).values({
          userScopeId: newScope.id,
          officeId: newOffice.id,
          createdBy: (req as Request & { user?: { id?: string } }).user?.id || null,
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

        // 4.7 Associate 2-Day Free Trial for the new organization
        let attachedPlan = null;
        let subscriptionRecord = null;
        let paymentRecord = null;

        // Find trial plan or selected plan
        let plan = null;
        if (planId) {
          plan = await tx.query.subscriptionPlans.findFirst({
            where: eq(subscriptionPlans.id, planId),
          });
        }
        if (!plan) {
          plan = await tx.query.subscriptionPlans.findFirst({
            where: eq(subscriptionPlans.code, "free_trial"),
          });
        }
        if (!plan) {
          plan = await tx.query.subscriptionPlans.findFirst();
        }

        if (plan) {
          attachedPlan = plan;
          const startDate = new Date();
          const trialDays = 2; // Exactly 2 days free trial for new organization
          const trialEndsAt = new Date(startDate.getTime() + trialDays * 24 * 60 * 60 * 1000);

          const [sub] = await tx
            .insert(tenantSubscriptions)
            .values({
              tenantId: newTenant.id,
              planId: plan.id,
              status: "trial",
              billingCycle: normalizedBillingCycle,
              amount: "0.00",
              currency: plan.currency || "INR",
              startDate: startDate.toISOString().split("T")[0],
              nextBillingDate: trialEndsAt.toISOString().split("T")[0],
              autoRenew: false,
            })
            .returning();
          subscriptionRecord = sub;
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
        userId: (req as Request & { user?: { id?: string } }).user?.id || null,
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

  // =========================================================================
  // GET ALL USERS DIRECTORY (With Paginated Results & Linked Organizations)
  // =========================================================================
  async getUsersDirectory(req: Request, res: Response, next: NextFunction) {
    try {
      const page = Math.max(1, parseInt(req.query.page as string) || 1);
      const limit = Math.min(100, Math.max(1, parseInt(req.query.limit as string) || 10));
      const search = (req.query.search as string)?.trim().toLowerCase() || "";
      const roleFilter = (req.query.role as string)?.trim() || "";
      const statusFilter = (req.query.status as string)?.trim() || "";

      // 1. Fetch all users
      const allUsers = await db.query.user.findMany({
        orderBy: (u, { desc }) => [desc(u.createdAt)],
      });

      // 2. Enrich with scopes, organizations, and roles
      const enrichedUsers = await Promise.all(
        allUsers.map(async (u) => {
          const scopes = await db.query.userScopes.findMany({
            where: eq(userScopes.userId, u.id),
            with: {
              tenant: true,
            },
          });

          // Roles
          const assignedRoles = await db
            .select({
              slug: roles.slug,
              name: roles.name,
              isSystemRole: roles.isSystemRole,
            })
            .from(userRoles)
            .innerJoin(roles, eq(userRoles.roleId, roles.id))
            .innerJoin(userScopes, eq(userRoles.scopeId, userScopes.id))
            .where(eq(userScopes.userId, u.id));

          const isSuperAdmin =
            u.email?.toLowerCase().includes("superadmin") ||
            assignedRoles.some((r) => r.slug === "super_admin");
          const isTenantAdmin = assignedRoles.some((r) => r.slug === "tenant_admin");
          const isPlatformAdmin = assignedRoles.some((r) => r.slug === "admin");

          let roleSlug = "advocate";
          let primaryRole = "Advocate";

          if (isSuperAdmin) {
            roleSlug = "super_admin";
            primaryRole = "Super Admin";
          } else if (isTenantAdmin) {
            roleSlug = "tenant_admin";
            primaryRole = "Firm Owner";
          } else if (isPlatformAdmin) {
            roleSlug = "admin";
            primaryRole = "Platform Admin";
          } else if (assignedRoles.length > 0) {
            roleSlug = assignedRoles[0].slug || "advocate";
            primaryRole = assignedRoles[0].name;
          }

          // Valid business orgs
          const validOrgs = scopes
            .filter((s) => s.tenant && (isSuperAdmin || s.tenant.slug !== "system"))
            .map((s) => ({
              tenantId: s.tenant!.id,
              name: s.tenant!.name,
              slug: s.tenant!.slug,
              status: s.tenant!.status,
              isDefault: s.isDefault,
            }));

          return {
            id: u.id,
            name: u.name,
            email: u.email,
            phone: u.phone || "—",
            status: u.isEmailVerified ? "active" : "inactive",
            roleName: primaryRole,
            roleSlug,
            isSuperAdmin,
            organizations: validOrgs,
            organizationsCount: validOrgs.length,
            primaryOrganization: validOrgs.find((o) => o.isDefault)?.name || validOrgs[0]?.name || "Unassigned Firm",
            createdAt: u.createdAt ? new Date(u.createdAt).toISOString() : new Date().toISOString(),
            lastActiveAt: u.updatedAt ? new Date(u.updatedAt).toISOString() : undefined,
          };
        })
      );

      // 3. Filter
      let filtered = enrichedUsers;
      if (search) {
        filtered = filtered.filter(
          (u) =>
            u.name.toLowerCase().includes(search) ||
            u.email.toLowerCase().includes(search) ||
            (u.phone && u.phone.includes(search)) ||
            u.roleName.toLowerCase().includes(search) ||
            u.organizations.some(
              (o) =>
                o.name.toLowerCase().includes(search) ||
                o.slug.toLowerCase().includes(search)
            )
        );
      }

      if (roleFilter && roleFilter !== "all") {
        filtered = filtered.filter(
          (u) =>
            u.roleSlug === roleFilter ||
            u.roleName.toLowerCase().includes(roleFilter.toLowerCase())
        );
      }

      if (statusFilter && statusFilter !== "all") {
        filtered = filtered.filter((u) => u.status === statusFilter);
      }

      const total = filtered.length;
      const totalPages = Math.ceil(total / limit) || 1;
      const startIndex = (page - 1) * limit;
      const paginatedUsers = filtered.slice(startIndex, startIndex + limit);

      return res.status(200).json(
        ResponseHandler(200, "Users directory fetched successfully", {
          users: paginatedUsers,
          pagination: {
            page,
            limit,
            total,
            totalPages,
          },
        })
      );
    } catch (error) {
      console.error("Admin getUsersDirectory error:", error);
      return next(CustomErrorHandler.serverError());
    }
  },

  // =========================================================================
  // GET ALL CLIENTS DIRECTORY (With Paginated Results & Linked Organizations)
  // =========================================================================
  async getClientsDirectory(req: Request, res: Response, next: NextFunction) {
    try {
      const page = Math.max(1, parseInt(req.query.page as string) || 1);
      const limit = Math.min(100, Math.max(1, parseInt(req.query.limit as string) || 10));
      const search = (req.query.search as string)?.trim().toLowerCase() || "";
      const statusFilter = (req.query.status as string)?.trim() || "";

      // 1. Fetch all clients with their profiles (tenants & offices)
      const allClients = await db.query.clients.findMany({
        orderBy: (c, { desc }) => [desc(c.createdAt)],
        with: {
          profiles: {
            with: {
              tenant: true,
              office: true,
            },
          },
        },
      });

      // 2. Fetch case counts for each client from caseClients
      const clientSummaries = await Promise.all(
        allClients.map(async (c) => {
          const [caseCountRes] = await db
            .select({ count: count() })
            .from(caseClients)
            .where(eq(caseClients.clientId, c.id));

          const linkedOrgs = c.profiles
            .filter((p) => p.tenant)
            .map((p) => ({
              tenantId: p.tenantId,
              name: p.tenant.name,
              slug: p.tenant.slug,
              officeName: p.office?.name || "Main Office",
              status: p.status,
            }));

          const fullName = [c.firstName, c.lastName].filter(Boolean).join(" ") || "Unnamed Client";

          return {
            id: c.id,
            firstName: c.firstName,
            lastName: c.lastName || "",
            name: fullName,
            email: c.email || "—",
            phone: c.phone || "—",
            companyName: c.companyName || "Individual",
            city: c.city || "—",
            state: c.state || "—",
            country: c.country || "India",
            status: c.status || "active",
            hasPortalAccess: Boolean(c.passwordHash),
            lastLoginAt: c.lastLoginAt ? new Date(c.lastLoginAt).toISOString() : null,
            createdAt: c.createdAt ? new Date(c.createdAt).toISOString() : new Date().toISOString(),
            organizations: linkedOrgs,
            organizationsCount: linkedOrgs.length,
            casesCount: Number(caseCountRes?.count) || 0,
          };
        })
      );

      // 3. Filter
      let filtered = clientSummaries;
      if (search) {
        filtered = filtered.filter(
          (c) =>
            c.name.toLowerCase().includes(search) ||
            c.email.toLowerCase().includes(search) ||
            c.phone.includes(search) ||
            c.companyName.toLowerCase().includes(search) ||
            c.city.toLowerCase().includes(search) ||
            c.organizations.some(
              (o) =>
                o.name.toLowerCase().includes(search) ||
                o.slug.toLowerCase().includes(search)
            )
        );
      }

      if (statusFilter && statusFilter !== "all") {
        filtered = filtered.filter((c) => c.status === statusFilter);
      }

      const total = filtered.length;
      const totalPages = Math.ceil(total / limit) || 1;
      const startIndex = (page - 1) * limit;
      const paginatedClients = filtered.slice(startIndex, startIndex + limit);

      return res.status(200).json(
        ResponseHandler(200, "Clients directory fetched successfully", {
          clients: paginatedClients,
          pagination: {
            page,
            limit,
            total,
            totalPages,
          },
        })
      );
    } catch (error) {
      console.error("Admin getClientsDirectory error:", error);
      return next(CustomErrorHandler.serverError());
    }
  },
};

export default adminTenantController;
