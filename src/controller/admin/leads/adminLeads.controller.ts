import { count, eq, ne, and, isNull, sql, desc, or, gte, lte } from "drizzle-orm";
import { NextFunction, Request, Response } from "express";

import db from "../../../db/index.js";
import {
  cases,
  caseClients,
  clients,
  courts,
  caseTypes,
  hearings,
  tenants,
} from "../../../db/schema/index.js";

import ResponseHandler from "../../../utils/responseHandler.js";
import CustomErrorHandler from "../../../utils/customErrorHandler.js";

type OpportunityType =
  | "all"
  | "litigation_funding"
  | "mediation_adr"
  | "senior_counsel"
  | "asset_tracing";

interface LeadClassification {
  models: Array<{
    type: "litigation_funding" | "mediation_adr" | "senior_counsel" | "asset_tracing";
    title: string;
    rationale: string;
    actionablePitch: string;
    estimatedRevenuePotential: string;
    badgeColor: string;
  }>;
  primaryOpportunity: "litigation_funding" | "mediation_adr" | "senior_counsel" | "asset_tracing";
}

function extractAmountFromText(text?: string | null): number {
  if (!text) return 0;
  const match = text.match(/(?:₹|rs\.?|inr)\s*([\d,]+(?:\.\d+)?)/i);
  if (match && match[1]) {
    const clean = match[1].replace(/,/g, "");
    const parsed = parseFloat(clean);
    if (!isNaN(parsed) && parsed > 0) return parsed;
  }
  return 0;
}

function classifyCaseOpportunities(
  caseRow: {
    caseValue: number;
    title: string;
    stage: string | null;
    priority: string | null;
    caseTypeName?: string | null;
    courtName?: string | null;
    courtType?: string | null;
    durationDays: number;
    hearingsCount: number;
    caseNumber?: string | null;
    judgeName?: string | null;
    remarks?: string | null;
    firstParty?: string | null;
    oppositeParty?: string | null;
  }
): LeadClassification {
  const models: LeadClassification["models"] = [];
  const textCorpus = `${caseRow.title || ""} ${caseRow.caseNumber || ""} ${caseRow.caseTypeName || ""} ${caseRow.stage || ""} ${caseRow.courtName || ""} ${caseRow.courtType || ""} ${caseRow.judgeName || ""} ${caseRow.remarks || ""} ${caseRow.firstParty || ""} ${caseRow.oppositeParty || ""}`.toLowerCase();

  const effectiveValue =
    caseRow.caseValue > 0
      ? caseRow.caseValue
      : extractAmountFromText(caseRow.remarks) || 750000;

  // Model A: Litigation Funding & Legal Fee Financing
  // Triggers: Substantial case value (>= 5 Lakhs) or prolonged duration (> 1 yr)
  if (effectiveValue >= 500000 || (effectiveValue > 0 && caseRow.durationDays > 365)) {
    models.push({
      type: "litigation_funding",
      title: "Third-Party Litigation Funding & Fee Financing",
      rationale: `Dispute value of ₹${effectiveValue.toLocaleString("en-IN")} active for ${(caseRow.durationDays / 365).toFixed(1)} years. Litigant is facing legal fee fatigue.`,
      actionablePitch: "Offer Legal Fee EMI facility or non-recourse funding against future settlement / decree.",
      estimatedRevenuePotential: "2% - 5% origination fee on disbursed credit line",
      badgeColor: "emerald",
    });
  }

  // Model B: Institutional Private Mediation & ADR (Mediation Act 2023)
  // Triggers: Civil, Commercial, Property, Matrimonial, Partition, 138/settlement, or General delay > 1 yr
  const isMediationFit =
    textCorpus.includes("civil") ||
    textCorpus.includes("commercial") ||
    textCorpus.includes("property") ||
    textCorpus.includes("family") ||
    textCorpus.includes("matrimonial") ||
    textCorpus.includes("partition") ||
    textCorpus.includes("contract") ||
    textCorpus.includes("consumer") ||
    textCorpus.includes("cheque") ||
    textCorpus.includes("138") ||
    caseRow.durationDays > 365;

  if (isMediationFit) {
    models.push({
      type: "mediation_adr",
      title: "Institutional Private Mediation & ADR",
      rationale: `Case active for ${Math.round(caseRow.durationDays / 30)} months. Parties likely seeking a rapid exit without court delays.`,
      actionablePitch: "Propose 60-day structured mediation settlement out-of-court under the Mediation Act, 2023.",
      estimatedRevenuePotential: "₹25,000 - ₹1,50,000 fixed mediation docket fee",
      badgeColor: "amber",
    });
  }

  // Model C: Second Opinion & Senior Counsel Briefing Desk
  // Triggers: High adjournments count (>= 5 hearings) or High Court / Supreme Court bench or high stakes
  const isAppellateCourt =
    (caseRow.courtType || "").toLowerCase().includes("high") ||
    (caseRow.courtType || "").toLowerCase().includes("supreme") ||
    textCorpus.includes("appeal") ||
    textCorpus.includes("writ");

  if (caseRow.hearingsCount >= 5 || isAppellateCourt || effectiveValue >= 500000 || caseRow.durationDays > 365) {
    models.push({
      type: "senior_counsel",
      title: "Second Opinion & Senior Counsel Briefing Desk",
      rationale: `${caseRow.hearingsCount || 1} hearings held. Case navigating procedural trial hurdles or high commercial stakes.`,
      actionablePitch: "Connect litigant with designated Senior Advocate / Domain Specialist for tactical co-counsel briefing.",
      estimatedRevenuePotential: "10% - 20% platform referral fee on senior counsel retainer briefs",
      badgeColor: "purple",
    });
  }

  // Model D: Auxiliary Legal Services (Asset Tracing, ROC Forensics, Recovery)
  // Triggers: 138 NI Act, Summary Suits, Execution Petitions, Money Recovery, Cheque Bounce, Dishonour
  const isRecoveryFit =
    textCorpus.includes("138") ||
    textCorpus.includes("ni act") ||
    textCorpus.includes("cheque") ||
    textCorpus.includes("dishonour") ||
    textCorpus.includes("recovery") ||
    textCorpus.includes("execution") ||
    textCorpus.includes("decree") ||
    textCorpus.includes("debt") ||
    textCorpus.includes("arbitration") ||
    textCorpus.includes("funds insufficient");

  if (isRecoveryFit || (effectiveValue >= 1000000 && caseRow.durationDays > 400)) {
    models.push({
      type: "asset_tracing",
      title: "Auxiliary Asset Tracing & MCA Forensics",
      rationale: "Recovery / execution matter. High probability of hidden assets, shell companies, or unexecuted warrants.",
      actionablePitch: "Provide forensic asset search docket, company director asset audit, and MCA filings tracing.",
      estimatedRevenuePotential: "₹15,000 - ₹75,000 per asset-intelligence docket",
      badgeColor: "sky",
    });
  }

  // Default fallback if no specific trigger fired
  if (models.length === 0) {
    models.push({
      type: "mediation_adr",
      title: "Private Mediation & ADR",
      rationale: `Case active for ${Math.round(caseRow.durationDays / 30)} months. Litigants exhausted by litigation delays.`,
      actionablePitch: "Propose structured mediation conference.",
      estimatedRevenuePotential: "₹25,000 - ₹50,000 per session",
      badgeColor: "amber",
    });
  }

  // Assign primary opportunity
  let primaryOpportunity: LeadClassification["primaryOpportunity"] = "mediation_adr";
  if (models.some((m) => m.type === "litigation_funding")) {
    primaryOpportunity = "litigation_funding";
  } else if (models.some((m) => m.type === "asset_tracing") && isRecoveryFit) {
    primaryOpportunity = "asset_tracing";
  } else if (models.some((m) => m.type === "senior_counsel") && isAppellateCourt) {
    primaryOpportunity = "senior_counsel";
  } else {
    primaryOpportunity = models[0].type;
  }

  return { models, primaryOpportunity };
}

const adminLeadsController = {
  /**
   * GET /api/admin/leads/stalled-cases
   * Fetches stalled cases (> 1 year pending) enriched with client contact information
   * and tagged for the 4 monetization business models.
   * Access: Super Admin OR users with "admin.leads.read" permission only.
   */
  async getStalledCaseLeads(req: Request, res: Response, next: NextFunction) {
    try {
      const page = Math.max(1, parseInt(req.query.page as string) || 1);
      const limit = Math.min(100, Math.max(1, parseInt(req.query.limit as string) || 20));
      const offset = (page - 1) * limit;

      const opportunityType = (req.query.opportunityType as OpportunityType) || "all";
      const durationFilter = (req.query.duration as string) || "1_year";
      const tenantId = req.query.tenantId as string;
      const search = (req.query.search as string)?.trim();
      const minCaseValue = parseFloat(req.query.minValue as string) || 0;

      const effectiveDateSql = sql`COALESCE(${cases.filingDate}, ${cases.registrationDate}, CASE WHEN ${cases.year} IS NOT NULL AND ${cases.year} >= 1990 AND ${cases.year} <= EXTRACT(YEAR FROM CURRENT_DATE) THEN make_date(${cases.year}, 1, 1) ELSE NULL END, ${cases.createdAt}::date)`;

      let durationCondition = sql`true`;
      if (durationFilter === "1_year") {
        durationCondition = sql`${effectiveDateSql} <= CURRENT_DATE - INTERVAL '1 year'`;
      } else if (durationFilter === "2_years") {
        durationCondition = sql`${effectiveDateSql} <= CURRENT_DATE - INTERVAL '2 years'`;
      } else if (durationFilter === "3_years") {
        durationCondition = sql`${effectiveDateSql} <= CURRENT_DATE - INTERVAL '3 years'`;
      } else if (durationFilter === "6_months") {
        durationCondition = sql`${effectiveDateSql} <= CURRENT_DATE - INTERVAL '6 months'`;
      }

      const stalledCondition = and(
        ne(cases.status, "disposed"),
        isNull(cases.deletedAt),
        ne(tenants.slug, "system"),
        durationCondition
      );

      // Fetch stalled cases with joins
      const query = db
        .select({
          caseId: cases.id,
          title: cases.title,
          caseNumber: cases.caseNumber,
          cnrNumber: cases.cnrNumber,
          courtNumber: cases.courtNumber,
          judgeName: cases.judgeName,
          firstParty: cases.firstParty,
          oppositeParty: cases.oppositeParty,
          stage: cases.stage,
          priority: cases.priority,
          status: cases.status,
          caseValue: cases.caseValue,
          filingDate: cases.filingDate,
          registrationDate: cases.registrationDate,
          nextHearingDate: cases.nextHearingDate,
          remarks: cases.remarks,
          createdAt: cases.createdAt,
          courtName: courts.name,
          courtType: courts.courtType,
          caseTypeName: caseTypes.name,
          tenantId: tenants.id,
          tenantName: tenants.name,
          tenantSlug: tenants.slug,
          tenantEmail: tenants.organisationEmail,
          tenantPhone: tenants.organisationPhone,
          effectiveStartDate: sql<string>`${effectiveDateSql}::text`,
          durationDays: sql<number>`GREATEST(1, CURRENT_DATE - ${effectiveDateSql})`,
        })
        .from(cases)
        .innerJoin(tenants, eq(cases.tenantId, tenants.id))
        .leftJoin(courts, eq(cases.courtId, courts.id))
        .leftJoin(caseTypes, eq(cases.caseTypeId, caseTypes.id))
        .where(
          and(
            stalledCondition,
            tenantId ? eq(cases.tenantId, tenantId) : undefined,
            minCaseValue > 0 ? sql`COALESCE(${cases.caseValue}, 750000) >= ${minCaseValue}` : undefined,
            search
              ? or(
                  sql`${cases.caseNumber} ILIKE ${`%${search}%`}`,
                  sql`${cases.title} ILIKE ${`%${search}%`}`,
                  sql`${cases.cnrNumber} ILIKE ${`%${search}%`}`,
                  sql`${cases.firstParty} ILIKE ${`%${search}%`}`,
                  sql`${cases.oppositeParty} ILIKE ${`%${search}%`}`
                )
              : undefined
          )
        )
        .orderBy(desc(sql`COALESCE(${cases.caseValue}, 0)`), desc(cases.createdAt));

      const rawCases = await query;

      if (rawCases.length === 0) {
        return res.status(200).json(
          ResponseHandler(200, "No stalled case leads found", {
            leads: [],
            pagination: {
              page,
              limit,
              totalItems: 0,
              totalPages: 0,
            },
          })
        );
      }

      // Fetch client contacts and hearing counts for these cases
      const caseIds = rawCases.map((c) => c.caseId);

      // Clients mapping
      const clientsData = await db
        .select({
          caseId: caseClients.caseId,
          clientId: clients.id,
          role: caseClients.role,
          firstName: clients.firstName,
          lastName: clients.lastName,
          companyName: clients.companyName,
          email: clients.email,
          phone: clients.phone,
          city: clients.city,
          state: clients.state,
          address: clients.address,
        })
        .from(caseClients)
        .innerJoin(clients, eq(caseClients.clientId, clients.id))
        .where(sql`${caseClients.caseId} IN ${caseIds}`);

      const clientsByCaseId = new Map<string, typeof clientsData>();
      for (const client of clientsData) {
        if (!clientsByCaseId.has(client.caseId)) {
          clientsByCaseId.set(client.caseId, []);
        }
        clientsByCaseId.get(client.caseId)!.push(client);
      }

      // Hearing counts mapping
      const hearingCountsData = await db
        .select({
          caseId: hearings.caseId,
          count: count(),
        })
        .from(hearings)
        .where(sql`${hearings.caseId} IN ${caseIds}`)
        .groupBy(hearings.caseId);

      const hearingCountMap = new Map<string, number>();
      for (const h of hearingCountsData) {
        if (h.caseId) hearingCountMap.set(h.caseId, Number(h.count));
      }

      // Build enriched leads with opportunity classification
      const enrichedLeads = rawCases.map((c) => {
        const hearingsCount = hearingCountMap.get(c.caseId) || 0;
        const caseValueNum =
          Number(c.caseValue || 0) || extractAmountFromText(c.remarks) || 750000;
        const durationDaysNum = Number(c.durationDays || 365);

        const classification = classifyCaseOpportunities({
          caseValue: caseValueNum,
          title: c.title,
          caseNumber: c.caseNumber,
          stage: c.stage,
          priority: c.priority,
          caseTypeName: c.caseTypeName,
          courtName: c.courtName,
          courtType: c.courtType,
          durationDays: durationDaysNum,
          hearingsCount,
          judgeName: c.judgeName,
          remarks: c.remarks,
          firstParty: c.firstParty,
          oppositeParty: c.oppositeParty,
        });

        const associatedClients = (clientsByCaseId.get(c.caseId) || []).map((cl) => ({
          id: cl.clientId,
          fullName: `${cl.firstName} ${cl.lastName || ""}`.trim(),
          companyName: cl.companyName,
          email: cl.email,
          phone: cl.phone,
          city: cl.city,
          state: cl.state,
          role: cl.role || "Client",
        }));

        const primaryClient = associatedClients[0] || null;

        const durationYears = (durationDaysNum / 365.25).toFixed(1);
        const durationMonths = Math.round(durationDaysNum / 30.4);

        return {
          caseId: c.caseId,
          title: c.title,
          caseNumber: c.caseNumber || "N/A",
          cnrNumber: c.cnrNumber || "N/A",
          courtName: c.courtName || "Unspecified Court",
          courtType: c.courtType || "District Court",
          courtNumber: c.courtNumber,
          judgeName: c.judgeName,
          caseTypeName: c.caseTypeName || "General Legal Matter",
          firstParty: c.firstParty || "Petitioner",
          oppositeParty: c.oppositeParty || "Respondent",
          stage: c.stage || "Pending Adjudication",
          priority: c.priority,
          status: c.status,
          caseValue: caseValueNum,
          filingDate: c.filingDate,
          effectiveStartDate: c.effectiveStartDate,
          durationDays: durationDaysNum,
          durationMonths,
          durationYears,
          hearingsCount,
          tenant: {
            id: c.tenantId,
            name: c.tenantName,
            slug: c.tenantSlug,
            email: c.tenantEmail,
            phone: c.tenantPhone,
          },
          primaryClient,
          allClients: associatedClients,
          opportunities: classification.models,
          primaryOpportunity: classification.primaryOpportunity,
        };
      });

      // Filter by requested opportunity type if specified
      let filteredLeads = enrichedLeads;
      if (opportunityType !== "all") {
        filteredLeads = enrichedLeads.filter((l) =>
          l.opportunities.some((o) => o.type === opportunityType)
        );
      }

      // Optional client search filter (if search was matching client name/phone)
      if (search) {
        const lowerSearch = search.toLowerCase();
        filteredLeads = filteredLeads.filter(
          (l) =>
            l.caseNumber.toLowerCase().includes(lowerSearch) ||
            l.title.toLowerCase().includes(lowerSearch) ||
            l.firstParty.toLowerCase().includes(lowerSearch) ||
            l.oppositeParty.toLowerCase().includes(lowerSearch) ||
            l.allClients.some(
              (cl) =>
                cl.fullName.toLowerCase().includes(lowerSearch) ||
                (cl.phone && cl.phone.includes(lowerSearch)) ||
                (cl.email && cl.email.toLowerCase().includes(lowerSearch)) ||
                (cl.companyName && cl.companyName.toLowerCase().includes(lowerSearch))
            )
        );
      }

      const totalItems = filteredLeads.length;
      const paginatedLeads = filteredLeads.slice(offset, offset + limit);

      return res.status(200).json(
        ResponseHandler(200, "Stalled case leads retrieved successfully", {
          leads: paginatedLeads,
          pagination: {
            page,
            limit,
            totalItems,
            totalPages: Math.ceil(totalItems / limit),
          },
        })
      );
    } catch (error) {
      next(error);
    }
  },

  /**
   * GET /api/admin/leads/stats
   * Provides executive pipeline statistics across the 4 business models.
   * Access: Super Admin OR users with "admin.leads.read" permission only.
   */
  async getLeadStats(req: Request, res: Response, next: NextFunction) {
    try {
      const tenantId = req.query.tenantId as string;

      const effectiveDateSql = sql`COALESCE(${cases.filingDate}, ${cases.registrationDate}, CASE WHEN ${cases.year} IS NOT NULL AND ${cases.year} >= 1990 AND ${cases.year} <= EXTRACT(YEAR FROM CURRENT_DATE) THEN make_date(${cases.year}, 1, 1) ELSE NULL END, ${cases.createdAt}::date)`;

      const stalledCondition = and(
        ne(cases.status, "disposed"),
        isNull(cases.deletedAt),
        ne(tenants.slug, "system")
      );

      const allStalled = await db
        .select({
          caseId: cases.id,
          title: cases.title,
          caseNumber: cases.caseNumber,
          stage: cases.stage,
          priority: cases.priority,
          caseValue: cases.caseValue,
          remarks: cases.remarks,
          judgeName: cases.judgeName,
          firstParty: cases.firstParty,
          oppositeParty: cases.oppositeParty,
          courtType: courts.courtType,
          courtName: courts.name,
          caseTypeName: caseTypes.name,
          durationDays: sql<number>`GREATEST(1, CURRENT_DATE - ${effectiveDateSql})`,
        })
        .from(cases)
        .innerJoin(tenants, eq(cases.tenantId, tenants.id))
        .leftJoin(courts, eq(cases.courtId, courts.id))
        .leftJoin(caseTypes, eq(cases.caseTypeId, caseTypes.id))
        .where(
          and(
            stalledCondition,
            tenantId ? eq(cases.tenantId, tenantId) : undefined
          )
        );

      let totalPipelineValue = 0;
      let litigationFundingCount = 0;
      let mediationCount = 0;
      let seniorCounselCount = 0;
      let assetTracingCount = 0;
      let totalDurationDays = 0;

      for (const c of allStalled) {
        const val = Number(c.caseValue || 0) || extractAmountFromText(c.remarks) || 750000;
        totalPipelineValue += val;
        totalDurationDays += Number(c.durationDays || 365);

        const classification = classifyCaseOpportunities({
          caseValue: val,
          title: c.title,
          caseNumber: c.caseNumber,
          stage: c.stage,
          priority: c.priority,
          caseTypeName: c.caseTypeName,
          courtName: c.courtName,
          courtType: c.courtType,
          durationDays: Number(c.durationDays || 365),
          hearingsCount: 1,
          judgeName: c.judgeName,
          remarks: c.remarks,
          firstParty: c.firstParty,
          oppositeParty: c.oppositeParty,
        });

        for (const opp of classification.models) {
          if (opp.type === "litigation_funding") litigationFundingCount++;
          if (opp.type === "mediation_adr") mediationCount++;
          if (opp.type === "senior_counsel") seniorCounselCount++;
          if (opp.type === "asset_tracing") assetTracingCount++;
        }
      }

      const totalStalledCases = allStalled.length;
      const averageDurationYears =
        totalStalledCases > 0
          ? ((totalDurationDays / totalStalledCases) / 365.25).toFixed(1)
          : "0";

      return res.status(200).json(
        ResponseHandler(200, "Leads pipeline statistics retrieved", {
          totalStalledCases,
          totalPipelineValue,
          averageDurationYears,
          modelsBreakdown: {
            litigationFunding: {
              count: litigationFundingCount,
              title: "Litigation Funding & Fee Financing",
              estimatedOriginationRate: "2% - 5%",
            },
            mediationAdr: {
              count: mediationCount,
              title: "Institutional Private Mediation (ODR)",
              targetTurnaround: "60 Days",
            },
            seniorCounsel: {
              count: seniorCounselCount,
              title: "Senior Counsel Briefing & Second Opinion",
              referralRate: "10% - 20%",
            },
            assetTracing: {
              count: assetTracingCount,
              title: "Auxiliary Recovery & Asset Tracing",
              reportFeeAvg: "₹25,000",
            },
          },
        })
      );
    } catch (error) {
      next(error);
    }
  },
};

export default adminLeadsController;
