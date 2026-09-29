import { and, asc, desc, eq, ilike, inArray, or, sql, count, SQL } from "drizzle-orm";
import db from "../db/index.js";
import {
  bareActs,
  bareActChapters,
  bareActSections,
  bareActSchedules,
} from "../db/schema/index.js";
import {
  bareActCategoryEnum,
  bareActJurisdictionEnum,
  bareActSourceEnum,
  bareActStatusEnum,
  sectionTypeEnum,
  bailableStatusEnum,
  cognizableStatusEnum,
} from "../db/schema/enum.js";
import { AppError } from "../middleware/errorHandler.js";
import slugify from "slugify";
import {
  BulkImportBareActInput,
  CreateBareActInput,
  CreateChapterInput,
  CreateScheduleInput,
  CreateSectionInput,
  UpdateBareActInput,
  UpdateChapterInput,
  UpdateScheduleInput,
  UpdateSectionInput,
} from "../validators/bareAct.validator.js";
import seedBareActs from "../db/seed/bareActs.seed.js";
import indiaCodeService from "./indiaCode.service.js";

export class BareActService {
  /* =========================================================================
     CLIENT / ADVOCATE FACING QUERIES
     ========================================================================= */

  /**
   * List Bare Acts with high-performance search and filtering
   */
  async listActs(query: {
    q?: string;
    category?: string;
    jurisdiction?: string;
    state?: string;
    status?: string;
    source?: string;
    year?: number;
    isFeatured?: boolean;
    page?: number;
    limit?: number;
    sortBy?: "title" | "year" | "totalSections" | "createdAt";
    sortOrder?: "asc" | "desc";
  }) {
    const page = Math.max(1, Number(query.page) || 1);
    const limit = Math.min(100, Math.max(1, Number(query.limit) || 20));
    const offset = (page - 1) * limit;

    const conditions: SQL[] = [];

    // Search query across title, short code, act number, description, keywords
    if (query.q && query.q.trim()) {
      const searchTerm = `%${query.q.trim()}%`;
      conditions.push(
        or(
          ilike(bareActs.title, searchTerm),
          ilike(bareActs.shortCode, searchTerm),
          ilike(bareActs.actNumber, searchTerm),
          ilike(bareActs.description, searchTerm),
          ilike(bareActs.longTitle, searchTerm),
          sql`${bareActs.keywords}::text ILIKE ${searchTerm}`
        )!
      );
    }

    if (query.category) {
      conditions.push(eq(bareActs.category, query.category as (typeof bareActCategoryEnum.enumValues)[number]));
    }

    if (query.jurisdiction) {
      conditions.push(eq(bareActs.jurisdiction, query.jurisdiction as (typeof bareActJurisdictionEnum.enumValues)[number]));
    }

    if (query.state) {
      conditions.push(ilike(bareActs.stateJurisdiction, `%${query.state}%`));
    }

    if (query.status) {
      conditions.push(eq(bareActs.status, query.status as (typeof bareActStatusEnum.enumValues)[number]));
    }

    if (query.source) {
      conditions.push(eq(bareActs.source, query.source as (typeof bareActSourceEnum.enumValues)[number]));
    }

    if (query.year) {
      conditions.push(eq(bareActs.actYear, Number(query.year)));
    }

    if (query.isFeatured !== undefined) {
      conditions.push(eq(bareActs.isFeatured, Boolean(query.isFeatured)));
    }

    const whereClause = conditions.length > 0 ? and(...conditions) : undefined;

    // Sorting
    let orderByClause;
    const isAsc = query.sortOrder === "asc";
    switch (query.sortBy) {
      case "title":
        orderByClause = isAsc ? asc(bareActs.title) : desc(bareActs.title);
        break;
      case "year":
        orderByClause = isAsc ? asc(bareActs.actYear) : desc(bareActs.actYear);
        break;
      case "totalSections":
        orderByClause = isAsc ? asc(bareActs.totalSections) : desc(bareActs.totalSections);
        break;
      default:
        orderByClause = isAsc ? asc(bareActs.createdAt) : desc(bareActs.createdAt);
        break;
    }

    const [acts, [{ totalCount }]] = await Promise.all([
      db
        .select()
        .from(bareActs)
        .where(whereClause)
        .orderBy(orderByClause)
        .limit(limit)
        .offset(offset),
      db
        .select({ totalCount: count() })
        .from(bareActs)
        .where(whereClause),
    ]);

    return {
      data: acts,
      pagination: {
        page,
        limit,
        total: Number(totalCount),
        totalPages: Math.ceil(Number(totalCount) / limit),
      },
    };
  }

  /**
   * Get single Bare Act by slug or ID with Table of Contents (Chapters & Sections summary)
   */
  async getActBySlugOrId(slugOrId: string) {
    const isUuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(
      slugOrId
    );

    let act = await db.query.bareActs.findFirst({
      where: isUuid ? eq(bareActs.id, slugOrId) : eq(bareActs.slug, slugOrId),
      with: {
        chapters: {
          orderBy: [asc(bareActChapters.orderIndex), asc(bareActChapters.createdAt)],
          with: {
            sections: {
              columns: {
                id: true,
                sectionType: true,
                sectionNumber: true,
                sectionNumeric: true,
                title: true,
                slug: true,
                punishment: true,
                bailableStatus: true,
                cognizableStatus: true,
                compoundableStatus: true,
                orderIndex: true,
              },
              orderBy: [asc(bareActSections.orderIndex), asc(bareActSections.sectionNumeric)],
            },
          },
        },
        schedules: {
          orderBy: [asc(bareActSchedules.orderIndex)],
        },
      },
    });

    if (!act && !isUuid) {
      try {
        await indiaCodeService.importActWithSections(slugOrId, { maxSections: 15, batchSize: 5 });
        act = await db.query.bareActs.findFirst({
          where: eq(bareActs.slug, slugOrId),
          with: {
            chapters: {
              orderBy: [asc(bareActChapters.orderIndex), asc(bareActChapters.createdAt)],
              with: {
                sections: {
                  columns: {
                    id: true,
                    sectionType: true,
                    sectionNumber: true,
                    sectionNumeric: true,
                    title: true,
                    slug: true,
                    punishment: true,
                    bailableStatus: true,
                    cognizableStatus: true,
                    compoundableStatus: true,
                    orderIndex: true,
                  },
                  orderBy: [asc(bareActSections.orderIndex), asc(bareActSections.sectionNumeric)],
                },
              },
            },
            schedules: {
              orderBy: [asc(bareActSchedules.orderIndex)],
            },
          },
        });
      } catch (err) {
        // Fallback to error below
      }
    }

    if (!act) {
      throw new AppError("Bare Act not found", 404);
    }

    // Also get sections that don't belong to any chapter
    const unchapteredSections = await db
      .select({
        id: bareActSections.id,
        sectionType: bareActSections.sectionType,
        sectionNumber: bareActSections.sectionNumber,
        sectionNumeric: bareActSections.sectionNumeric,
        title: bareActSections.title,
        slug: bareActSections.slug,
        punishment: bareActSections.punishment,
        bailableStatus: bareActSections.bailableStatus,
        cognizableStatus: bareActSections.cognizableStatus,
        compoundableStatus: bareActSections.compoundableStatus,
        orderIndex: bareActSections.orderIndex,
      })
      .from(bareActSections)
      .where(and(eq(bareActSections.actId, act.id), sql`${bareActSections.chapterId} IS NULL`))
      .orderBy(asc(bareActSections.orderIndex), asc(bareActSections.sectionNumeric));

    return {
      ...act,
      unchapteredSections,
    };
  }

  /**
   * Get sections of an act with pagination and search
   */
  async getActSections(
    actSlugOrId: string,
    query: {
      q?: string;
      chapterId?: string;
      sectionType?: string;
      bailableStatus?: string;
      cognizableStatus?: string;
      page?: number;
      limit?: number;
    }
  ) {
    const act = await this.resolveActId(actSlugOrId);

    const page = Math.max(1, Number(query.page) || 1);
    const limit = Math.min(100, Math.max(1, Number(query.limit) || 30));
    const offset = (page - 1) * limit;

    const conditions: SQL[] = [eq(bareActSections.actId, act.id)];

    if (query.q && query.q.trim()) {
      const searchTerm = `%${query.q.trim()}%`;
      const searchConditions: SQL[] = [
        ilike(bareActSections.sectionNumber, searchTerm),
        ilike(bareActSections.title, searchTerm),
        ilike(bareActSections.content, searchTerm),
        sql`${bareActSections.keywords}::text ILIKE ${searchTerm}`,
      ];

      searchConditions.push(ilike(bareActSections.punishment, searchTerm));

      conditions.push(or(...searchConditions)!);
    }

    if (query.chapterId) {
      conditions.push(eq(bareActSections.chapterId, query.chapterId));
    }

    if (query.sectionType) {
      conditions.push(eq(bareActSections.sectionType, query.sectionType as (typeof sectionTypeEnum.enumValues)[number]));
    }

    if (query.bailableStatus) {
      conditions.push(eq(bareActSections.bailableStatus, query.bailableStatus as (typeof bailableStatusEnum.enumValues)[number]));
    }

    if (query.cognizableStatus) {
      conditions.push(eq(bareActSections.cognizableStatus, query.cognizableStatus as (typeof cognizableStatusEnum.enumValues)[number]));
    }

    const whereClause = and(...conditions);


    const [sections, [{ totalCount }]] = await Promise.all([
      db
        .select()
        .from(bareActSections)
        .where(whereClause)
        .orderBy(asc(bareActSections.orderIndex), asc(bareActSections.sectionNumeric))
        .limit(limit)
        .offset(offset),
      db
        .select({ totalCount: count() })
        .from(bareActSections)
        .where(whereClause),
    ]);

    return {
      act: {
        id: act.id,
        title: act.title,
        shortCode: act.shortCode,
        slug: act.slug,
        category: act.category,
      },
      data: sections,
      pagination: {
        page,
        limit,
        total: Number(totalCount),
        totalPages: Math.ceil(Number(totalCount) / limit),
      },
    };
  }

  /**
   * Get single section with full text, provisos, cross-references, explanations, landmark cases
   */
  async getSectionDetail(actSlugOrId: string, sectionSlugOrNumberOrId: string) {
    const act = await this.resolveActId(actSlugOrId);

    const isUuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(
      sectionSlugOrNumberOrId
    );

    const section = await db.query.bareActSections.findFirst({
      where: and(
        eq(bareActSections.actId, act.id),
        isUuid
          ? eq(bareActSections.id, sectionSlugOrNumberOrId)
          : or(
              eq(bareActSections.slug, sectionSlugOrNumberOrId),
              ilike(bareActSections.sectionNumber, sectionSlugOrNumberOrId.replace(/-/g, " "))
            )
      ),
      with: {
        chapter: true,
      },
    });

    let activeSection:
      | (typeof bareActSections.$inferSelect & { chapter?: typeof bareActChapters.$inferSelect | null })
      | undefined = section;
    if (!activeSection) {
      try {
        activeSection = await indiaCodeService.getOrFetchSection(act.slug, sectionSlugOrNumberOrId);
      } catch {
        throw new AppError("Bare Act Section not found", 404);
      }
    }

    // Get previous and next sections for smooth reading navigation
    const [prevSection, nextSection] = await Promise.all([
      db
        .select({
          id: bareActSections.id,
          sectionNumber: bareActSections.sectionNumber,
          title: bareActSections.title,
          slug: bareActSections.slug,
        })
        .from(bareActSections)
        .where(
          and(
            eq(bareActSections.actId, act.id),
            sql`(${bareActSections.orderIndex} < ${activeSection.orderIndex} OR (${bareActSections.orderIndex} = ${activeSection.orderIndex} AND ${bareActSections.sectionNumeric} < ${activeSection.sectionNumeric}))`
          )
        )
        .orderBy(desc(bareActSections.orderIndex), desc(bareActSections.sectionNumeric))
        .limit(1)
        .then((res) => res[0] || null),
      db
        .select({
          id: bareActSections.id,
          sectionNumber: bareActSections.sectionNumber,
          title: bareActSections.title,
          slug: bareActSections.slug,
        })
        .from(bareActSections)
        .where(
          and(
            eq(bareActSections.actId, act.id),
            sql`(${bareActSections.orderIndex} > ${activeSection.orderIndex} OR (${bareActSections.orderIndex} = ${activeSection.orderIndex} AND ${bareActSections.sectionNumeric} > ${activeSection.sectionNumeric}))`
          )
        )
        .orderBy(asc(bareActSections.orderIndex), asc(bareActSections.sectionNumeric))
        .limit(1)
        .then((res) => res[0] || null),
    ]);

    return {
      section: activeSection,
      act: {
        id: act.id,
        title: act.title,
        shortCode: act.shortCode,
        slug: act.slug,
        category: act.category,
        replacesAct: act.replacesAct,
        repealedBy: act.repealedBy,
      },
      navigation: {
        previous: prevSection,
        next: nextSection,
      },
    };
  }

  /**
   * Ultra-fast Advocate Instant Search / Quick Section Lookup
   * e.g. "302", "cheating", "Article 21", "anticipatory bail", "Order 39", "138", "BNSS 482"
   */
  async quickLookup(query: { q: string; limit?: number }) {
    if (!query.q || !query.q.trim()) {
      return { data: [] };
    }

    const searchTerm = query.q.trim();
    const likeTerm = `%${searchTerm}%`;
    const limit = Math.min(50, Math.max(1, Number(query.limit) || 15));

    // Search across sections with act join
    const results = await db
      .select({
        sectionId: bareActSections.id,
        sectionNumber: bareActSections.sectionNumber,
        sectionTitle: bareActSections.title,
        sectionSlug: bareActSections.slug,
        sectionType: bareActSections.sectionType,
        punishment: bareActSections.punishment,
        bailableStatus: bareActSections.bailableStatus,
        cognizableStatus: bareActSections.cognizableStatus,
        compoundableStatus: bareActSections.compoundableStatus,
        crossReferences: bareActSections.crossReferences,
        actId: bareActs.id,
        actTitle: bareActs.title,
        actShortCode: bareActs.shortCode,
        actSlug: bareActs.slug,
        actCategory: bareActs.category,
        actYear: bareActs.actYear,
      })
      .from(bareActSections)
      .innerJoin(bareActs, eq(bareActSections.actId, bareActs.id))
      .where(
        or(
          ilike(bareActSections.sectionNumber, likeTerm),
          ilike(bareActSections.title, likeTerm),
          ilike(bareActSections.content, likeTerm),
          ilike(bareActs.title, likeTerm),
          ilike(bareActs.shortCode, likeTerm),
          sql`${bareActSections.keywords}::text ILIKE ${likeTerm}`,
          sql`${bareActSections.crossReferences}::text ILIKE ${likeTerm}`
        )
      )
      .limit(limit);

    return {
      query: searchTerm,
      count: results.length,
      data: results,
    };
  }

  /**
   * Categories with Act counts & metadata
   */
  async getCategories() {
    const counts = await db
      .select({
        category: bareActs.category,
        count: count(),
      })
      .from(bareActs)
      .groupBy(bareActs.category);

    const categoryDefinitions = [
      {
        id: "constitutional",
        label: "Constitutional Law",
        description: "The Constitution of India, Fundamental Rights, Writs & Constitutional Amendments",
        icon: "Shield",
      },
      {
        id: "criminal",
        label: "Criminal Laws & BNS / BNSS / BSA",
        description: "Bharatiya Nyaya Sanhita, BNSS, BSA, IPC, CrPC, POCSO, NDPS & Special Criminal Acts",
        icon: "Gavel",
      },
      {
        id: "civil_procedure",
        label: "Civil Procedure & Specific Relief",
        description: "Code of Civil Procedure, Limitation Act, Specific Relief, Commercial Courts",
        icon: "Scale",
      },
      {
        id: "corporate_commercial",
        label: "Corporate, Commercial & Insolvency",
        description: "Companies Act, IBC 2016, SEBI, Indian Contract Act, Partnership & LLP",
        icon: "Building2",
      },
      {
        id: "banking_finance",
        label: "Banking, Finance & Cheque Bounce",
        description: "Negotiable Instruments Act (Sec 138), SARFAESI, PMLA, FEMA, RBI regulations",
        icon: "Landmark",
      },
      {
        id: "family_personal",
        label: "Family, Marriage & Succession",
        description: "Hindu Marriage Act, Special Marriage, Guardians & Wards, Domestic Violence",
        icon: "Users",
      },
      {
        id: "property_realestate",
        label: "Property, RERA & Real Estate",
        description: "Transfer of Property Act, Registration Act, Easements, RERA 2016",
        icon: "Home",
      },
      {
        id: "labour_employment",
        label: "Labour, Wages & Industrial Relations",
        description: "New Labour Codes (Wages, Industrial Relations, Social Security), POSH Act",
        icon: "Briefcase",
      },
      {
        id: "taxation",
        label: "Direct & Indirect Taxation",
        description: "Income Tax Act 1961, Central GST Act 2017, Customs Act",
        icon: "Receipt",
      },
      {
        id: "cyber_ipr",
        label: "Cyber, Data Privacy & IPR",
        description: "Information Technology Act, DPDP 2023, Trademarks, Patents, Copyright",
        icon: "Lock",
      },
      {
        id: "arbitration_adr",
        label: "Arbitration, Conciliation & ADR",
        description: "Arbitration & Conciliation Act 1996, Mediation Act 2023",
        icon: "Handshake",
      },
      {
        id: "consumer_environment",
        label: "Consumer Protection & Environment",
        description: "Consumer Protection Act 2019, NGT Act, Environment Protection Act",
        icon: "Leaf",
      },
      {
        id: "motor_accidents",
        label: "Motor Vehicles & Insurance",
        description: "Motor Vehicles Act 1988 (MACT), Insurance Act",
        icon: "Car",
      },
      {
        id: "general_special",
        label: "General & Special Statutes",
        description: "Statutory interpretation, General Clauses Act, Special Central & State enactments",
        icon: "BookOpen",
      },
    ];

    const countMap = new Map(counts.map((c) => [c.category, Number(c.count)]));

    return categoryDefinitions.map((cat) => ({
      ...cat,
      actCount: countMap.get(cat.id as (typeof bareActCategoryEnum.enumValues)[number]) || 0,
    }));
  }

  /**
   * Global Bare Acts Stats for Advocates & Dashboard
   */
  async getStats() {
    const [
      [{ totalActs }],
      [{ centralActs }],
      [{ stateActs }],
      [{ systemSeedActs }],
      [{ adminUploadActs }],
      [{ totalSections }],
      [{ totalChapters }],
    ] = await Promise.all([
      db.select({ totalActs: count() }).from(bareActs),
      db.select({ centralActs: count() }).from(bareActs).where(eq(bareActs.jurisdiction, "central")),
      db.select({ stateActs: count() }).from(bareActs).where(eq(bareActs.jurisdiction, "state")),
      db.select({ systemSeedActs: count() }).from(bareActs).where(eq(bareActs.source, "system_seed")),
      db.select({ adminUploadActs: count() }).from(bareActs).where(eq(bareActs.source, "admin_upload")),
      db.select({ totalSections: count() }).from(bareActSections),
      db.select({ totalChapters: count() }).from(bareActChapters),
    ]);

    return {
      totalActs: Number(totalActs),
      centralActs: Number(centralActs),
      stateActs: Number(stateActs),
      systemSeedActs: Number(systemSeedActs),
      adminUploadActs: Number(adminUploadActs),
      totalSections: Number(totalSections),
      totalChapters: Number(totalChapters),
    };
  }

  /**
   * Criminal Laws Quick Comparison (IPC vs BNS, CrPC vs BNSS, IEA vs BSA)
   */
  async getCriminalLawComparisons() {
    return [
      {
        subject: "Murder",
        oldLaw: "IPC Section 302",
        newLaw: "BNS Section 103",
        punishment: "Death or Imprisonment for Life, and Fine (Mob lynching sub-clause 2 added)",
        bailable: "Non-Bailable",
        cognizable: "Cognizable",
      },
      {
        subject: "Rape & Sexual Offences",
        oldLaw: "IPC Section 375 & 376",
        newLaw: "BNS Section 63 & 64",
        punishment: "Rigorous Imprisonment 10 years to Life, and Fine",
        bailable: "Non-Bailable",
        cognizable: "Cognizable",
      },
      {
        subject: "Sexual intercourse by deceitful means / False promise of marriage",
        oldLaw: "IPC Section 417 / 376(2)(n) (Judicial interpretation)",
        newLaw: "BNS Section 69",
        punishment: "Imprisonment up to 10 years and Fine",
        bailable: "Non-Bailable",
        cognizable: "Cognizable",
      },
      {
        subject: "Cruelty by Husband or Relatives (Dowry Harassment)",
        oldLaw: "IPC Section 498A",
        newLaw: "BNS Section 85 & 86",
        punishment: "Imprisonment up to 3 years and Fine",
        bailable: "Non-Bailable",
        cognizable: "Cognizable",
      },
      {
        subject: "Theft (with Community Service for First Offender < ₹5000)",
        oldLaw: "IPC Section 379",
        newLaw: "BNS Section 303",
        punishment: "Up to 3 years or fine (Community Service for petty first offence)",
        bailable: "Non-Bailable",
        cognizable: "Cognizable",
      },
      {
        subject: "Cheating and Dishonestly Inducing Delivery of Property (420)",
        oldLaw: "IPC Section 420",
        newLaw: "BNS Section 318(4)",
        punishment: "Imprisonment up to 7 years and Fine",
        bailable: "Non-Bailable",
        cognizable: "Cognizable",
      },
      {
        subject: "Criminal Breach of Trust",
        oldLaw: "IPC Section 406",
        newLaw: "BNS Section 316",
        punishment: "Imprisonment up to 5 years, or fine, or both",
        bailable: "Non-Bailable",
        cognizable: "Cognizable",
      },
      {
        subject: "First Information Report (FIR / Zero FIR / e-FIR)",
        oldLaw: "CrPC Section 154",
        newLaw: "BNSS Section 173",
        punishment: "Procedure for Zero FIR & Electronic FIR registration within 3 days",
        bailable: "N/A",
        cognizable: "N/A",
      },
      {
        subject: "Magistrate Statement / Confession Recording",
        oldLaw: "CrPC Section 164",
        newLaw: "BNSS Section 183",
        punishment: "Mandatory Audio-Video recording for sexual assault victim statements",
        bailable: "N/A",
        cognizable: "N/A",
      },
      {
        subject: "Regular Bail in Non-Bailable Offences",
        oldLaw: "CrPC Section 437",
        newLaw: "BNSS Section 480",
        punishment: "Magisterial bail procedure & maximum custody thresholds",
        bailable: "N/A",
        cognizable: "N/A",
      },
      {
        subject: "Anticipatory Bail (Pre-Arrest Bail)",
        oldLaw: "CrPC Section 438",
        newLaw: "BNSS Section 482",
        punishment: "Sessions Court / High Court pre-arrest bail directions",
        bailable: "N/A",
        cognizable: "N/A",
      },
      {
        subject: "Special Powers of High Court / Sessions Court on Bail",
        oldLaw: "CrPC Section 439",
        newLaw: "BNSS Section 483",
        punishment: "Superior Court regular bail jurisdiction",
        bailable: "N/A",
        cognizable: "N/A",
      },
      {
        subject: "Inherent Powers of High Court (Quashing of FIR & Proceedings)",
        oldLaw: "CrPC Section 482",
        newLaw: "BNSS Section 528",
        punishment: "High Court power to prevent abuse of process & secure ends of justice",
        bailable: "N/A",
        cognizable: "N/A",
      },
    ];
  }

  /* =========================================================================
     ADMIN PORTAL MANAGEMENT APIS
     ========================================================================= */

  /**
   * Admin Create Bare Act
   */
  async createAct(data: CreateBareActInput, adminUserId: string) {
    const actSlug =
      data.slug ||
      slugify(data.title + "-" + data.actYear, { lower: true, strict: true });

    // Check duplicate slug
    const existing = await db.query.bareActs.findFirst({
      where: eq(bareActs.slug, actSlug),
    });

    if (existing) {
      throw new AppError("A Bare Act with this slug or title already exists", 400);
    }

    const [newAct] = await db
      .insert(bareActs)
      .values({
        title: data.title,
        shortCode: data.shortCode,
        slug: actSlug,
        longTitle: data.longTitle,
        actNumber: data.actNumber,
        actYear: data.actYear,
        category: data.category,
        jurisdiction: data.jurisdiction,
        stateJurisdiction: data.stateJurisdiction,
        ministry: data.ministry,
        status: data.status,
        enactmentDate: data.enactmentDate,
        enforcementDate: data.enforcementDate,
        source: "admin_upload",
        uploadedByAdminId: adminUserId,
        isFeatured: data.isFeatured ?? false,
        preamble: data.preamble,
        description: data.description,
        pdfUrl: data.pdfUrl || null,
        repealedBy: data.repealedBy,
        replacesAct: data.replacesAct,
        keywords: data.keywords || [],
      })
      .returning();

    return newAct;
  }

  /**
   * Admin Update Bare Act
   */
  async updateAct(actId: string, data: UpdateBareActInput) {
    const existing = await db.query.bareActs.findFirst({
      where: eq(bareActs.id, actId),
    });

    if (!existing) {
      throw new AppError("Bare Act not found", 404);
    }

    const [updated] = await db
      .update(bareActs)
      .set({
        ...data,
        updatedAt: new Date(),
      })
      .where(eq(bareActs.id, actId))
      .returning();

    return updated;
  }

  /**
   * Admin Delete Bare Act
   */
  async deleteAct(actId: string) {
    const existing = await db.query.bareActs.findFirst({
      where: eq(bareActs.id, actId),
    });

    if (!existing) {
      throw new AppError("Bare Act not found", 404);
    }

    await db.delete(bareActs).where(eq(bareActs.id, actId));
    return { success: true, message: "Bare Act deleted successfully" };
  }

  /**
   * Admin Create Chapter
   */
  async createChapter(actId: string, data: CreateChapterInput) {
    const act = await db.query.bareActs.findFirst({
      where: eq(bareActs.id, actId),
    });

    if (!act) {
      throw new AppError("Bare Act not found", 404);
    }

    const [chapter] = await db
      .insert(bareActChapters)
      .values({
        actId,
        partNumber: data.partNumber,
        partTitle: data.partTitle,
        chapterNumber: data.chapterNumber,
        title: data.title,
        description: data.description,
        startSection: data.startSection,
        endSection: data.endSection,
        orderIndex: data.orderIndex ?? 0,
      })
      .returning();

    // Increment act totalChapters count
    await db
      .update(bareActs)
      .set({
        totalChapters: sql`${bareActs.totalChapters} + 1`,
      })
      .where(eq(bareActs.id, actId));

    return chapter;
  }

  /**
   * Admin Update Chapter
   */
  async updateChapter(chapterId: string, data: UpdateChapterInput) {
    const existing = await db.query.bareActChapters.findFirst({
      where: eq(bareActChapters.id, chapterId),
    });

    if (!existing) {
      throw new AppError("Chapter not found", 404);
    }

    const [updated] = await db
      .update(bareActChapters)
      .set({
        ...data,
        updatedAt: new Date(),
      })
      .where(eq(bareActChapters.id, chapterId))
      .returning();

    return updated;
  }

  /**
   * Admin Delete Chapter
   */
  async deleteChapter(chapterId: string) {
    const existing = await db.query.bareActChapters.findFirst({
      where: eq(bareActChapters.id, chapterId),
    });

    if (!existing) {
      throw new AppError("Chapter not found", 404);
    }

    await db.delete(bareActChapters).where(eq(bareActChapters.id, chapterId));

    await db
      .update(bareActs)
      .set({
        totalChapters: sql`GREATEST(0, ${bareActs.totalChapters} - 1)`,
      })
      .where(eq(bareActs.id, existing.actId));

    return { success: true, message: "Chapter deleted successfully" };
  }

  /**
   * Admin Create Section
   */
  async createSection(actId: string, data: CreateSectionInput) {
    const act = await db.query.bareActs.findFirst({
      where: eq(bareActs.id, actId),
    });

    if (!act) {
      throw new AppError("Bare Act not found", 404);
    }

    const secSlug =
      data.slug ||
      `${slugify(data.sectionNumber, { lower: true, strict: true })}-${slugify(data.title, { lower: true, strict: true })}`.slice(0, 250);

    const [section] = await db
      .insert(bareActSections)
      .values({
        actId,
        chapterId: data.chapterId,
        sectionType: data.sectionType,
        sectionNumber: data.sectionNumber,
        sectionNumeric: data.sectionNumeric ?? 0,
        title: data.title,
        slug: secSlug,
        content: data.content,
        subSections: data.subSections || [],
        provisos: data.provisos || [],
        explanations: data.explanations || [],
        illustrations: data.illustrations || [],
        footnotes: data.footnotes || [],
        punishment: data.punishment,
        bailableStatus: data.bailableStatus,
        cognizableStatus: data.cognizableStatus,
        compoundableStatus: data.compoundableStatus,
        triableBy: data.triableBy,
        keywords: data.keywords || [],
        crossReferences: data.crossReferences || {},
        orderIndex: data.orderIndex ?? 0,
      })
      .returning();

    // Increment totalSections
    await db
      .update(bareActs)
      .set({
        totalSections: sql`${bareActs.totalSections} + 1`,
      })
      .where(eq(bareActs.id, actId));

    return section;
  }

  /**
   * Admin Update Section
   */
  async updateSection(sectionId: string, data: UpdateSectionInput) {
    const existing = await db.query.bareActSections.findFirst({
      where: eq(bareActSections.id, sectionId),
    });

    if (!existing) {
      throw new AppError("Section not found", 404);
    }

    const [updated] = await db
      .update(bareActSections)
      .set({
        ...data,
        updatedAt: new Date(),
      })
      .where(eq(bareActSections.id, sectionId))
      .returning();

    return updated;
  }

  /**
   * Admin Delete Section
   */
  async deleteSection(sectionId: string) {
    const existing = await db.query.bareActSections.findFirst({
      where: eq(bareActSections.id, sectionId),
    });

    if (!existing) {
      throw new AppError("Section not found", 404);
    }

    await db.delete(bareActSections).where(eq(bareActSections.id, sectionId));

    await db
      .update(bareActs)
      .set({
        totalSections: sql`GREATEST(0, ${bareActs.totalSections} - 1)`,
      })
      .where(eq(bareActs.id, existing.actId));

    return { success: true, message: "Section deleted successfully" };
  }

  /**
   * Admin Bulk Import of entire Act, Chapters, and Sections
   */
  async bulkImportAct(data: BulkImportBareActInput, adminUserId: string) {
    const actSlug =
      data.act.slug ||
      slugify(data.act.title + "-" + data.act.actYear, { lower: true, strict: true });

    // 1. Create or update act
    let act = await db.query.bareActs.findFirst({
      where: eq(bareActs.slug, actSlug),
    });

    let actId: string;

    if (!act) {
      const [newAct] = await db
        .insert(bareActs)
        .values({
          title: data.act.title,
          shortCode: data.act.shortCode,
          slug: actSlug,
          longTitle: data.act.longTitle,
          actNumber: data.act.actNumber,
          actYear: data.act.actYear,
          category: data.act.category,
          jurisdiction: data.act.jurisdiction,
          stateJurisdiction: data.act.stateJurisdiction,
          ministry: data.act.ministry,
          status: data.act.status,
          enactmentDate: data.act.enactmentDate,
          enforcementDate: data.act.enforcementDate,
          source: "admin_upload",
          uploadedByAdminId: adminUserId,
          isFeatured: data.act.isFeatured ?? false,
          preamble: data.act.preamble,
          description: data.act.description,
          pdfUrl: data.act.pdfUrl || null,
          repealedBy: data.act.repealedBy,
          replacesAct: data.act.replacesAct,
          keywords: data.act.keywords || [],
        })
        .returning();

      actId = newAct.id;
    } else {
      actId = act.id;
    }

    let insertedChapterCount = 0;
    let insertedSectionCount = 0;

    // 2. Process Chapters & Nested Sections
    if (data.chapters && data.chapters.length > 0) {
      for (const chap of data.chapters) {
        const { sections, ...chapData } = chap;

        const [newChap] = await db
          .insert(bareActChapters)
          .values({
            actId,
            partNumber: chapData.partNumber,
            partTitle: chapData.partTitle,
            chapterNumber: chapData.chapterNumber,
            title: chapData.title,
            description: chapData.description,
            startSection: chapData.startSection,
            endSection: chapData.endSection,
            orderIndex: chapData.orderIndex ?? 0,
          })
          .returning();

        insertedChapterCount++;

        if (sections && sections.length > 0) {
          for (const sec of sections) {
            const secSlug =
              sec.slug ||
              `${slugify(sec.sectionNumber, { lower: true, strict: true })}-${slugify(sec.title, { lower: true, strict: true })}`.slice(0, 250);

            await db.insert(bareActSections).values({
              actId,
              chapterId: newChap.id,
              sectionType: sec.sectionType,
              sectionNumber: sec.sectionNumber,
              sectionNumeric: sec.sectionNumeric ?? 0,
              title: sec.title,
              slug: secSlug,
              content: sec.content,
              subSections: sec.subSections || [],
              provisos: sec.provisos || [],
              explanations: sec.explanations || [],
              illustrations: sec.illustrations || [],
              footnotes: sec.footnotes || [],
              punishment: sec.punishment,
              bailableStatus: sec.bailableStatus,
              cognizableStatus: sec.cognizableStatus,
              compoundableStatus: sec.compoundableStatus,
              triableBy: sec.triableBy,
              keywords: sec.keywords || [],
              crossReferences: sec.crossReferences || {},
              orderIndex: sec.orderIndex ?? 0,
            });

            insertedSectionCount++;
          }
        }
      }
    }

    // 3. Process direct root sections if any
    if (data.sections && data.sections.length > 0) {
      for (const sec of data.sections) {
        const secSlug =
          sec.slug ||
          `${slugify(sec.sectionNumber, { lower: true, strict: true })}-${slugify(sec.title, { lower: true, strict: true })}`.slice(0, 250);

        await db.insert(bareActSections).values({
          actId,
          chapterId: sec.chapterId,
          sectionType: sec.sectionType,
          sectionNumber: sec.sectionNumber,
          sectionNumeric: sec.sectionNumeric ?? 0,
          title: sec.title,
          slug: secSlug,
          content: sec.content,
          subSections: sec.subSections || [],
          provisos: sec.provisos || [],
          explanations: sec.explanations || [],
          illustrations: sec.illustrations || [],
          footnotes: sec.footnotes || [],
          punishment: sec.punishment,
          bailableStatus: sec.bailableStatus,
          cognizableStatus: sec.cognizableStatus,
          compoundableStatus: sec.compoundableStatus,
          triableBy: sec.triableBy,
          keywords: sec.keywords || [],
          crossReferences: sec.crossReferences || {},
          orderIndex: sec.orderIndex ?? 0,
        });

        insertedSectionCount++;
      }
    }

    // 4. Update Act summary counts
    await db
      .update(bareActs)
      .set({
        totalChapters: sql`${bareActs.totalChapters} + ${insertedChapterCount}`,
        totalSections: sql`${bareActs.totalSections} + ${insertedSectionCount}`,
      })
      .where(eq(bareActs.id, actId));

    return {
      actId,
      slug: actSlug,
      insertedChapters: insertedChapterCount,
      insertedSections: insertedSectionCount,
    };
  }

  /**
   * Re-seed System Default Bare Acts Library
   */
  async reseedLibrary() {
    await seedBareActs();
    return { success: true, message: "Indian Bare Acts library seeded successfully" };
  }

  /* =========================================================================
     PRIVATE HELPERS
     ========================================================================= */

  private async resolveActId(slugOrId: string) {
    const isUuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(
      slugOrId
    );

    let act = await db.query.bareActs.findFirst({
      where: isUuid ? eq(bareActs.id, slugOrId) : eq(bareActs.slug, slugOrId),
    });

    if (!act && !isUuid) {
      try {
        await indiaCodeService.importActWithSections(slugOrId, { maxSections: 10, batchSize: 5 });
        act = await db.query.bareActs.findFirst({
          where: eq(bareActs.slug, slugOrId),
        });
      } catch (err) {
        // Fallback to error below
      }
    }

    if (!act) {
      throw new AppError("Bare Act not found", 404);
    }

    return act;
  }
}

export const bareActService = new BareActService();
export default bareActService;
