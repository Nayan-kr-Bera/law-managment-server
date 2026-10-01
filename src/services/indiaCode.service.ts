import { and, eq } from "drizzle-orm";
import db from "../db/index.js";
import {
  bareActs,
  bareActChapters,
  bareActSections,
  bareActSchedules,
} from "../db/schema/index.js";
import { bareActCategoryEnum } from "../db/schema/enum.js";
import { AppError } from "../middleware/errorHandler.js";

const INDIA_CODE_BASE_URL = "https://indiacode.ecourtsindia.com/api/v1";

export interface IIndiaCodeSearchResult {
  id: string;
  slug?: string;
  short_title: string;
  title?: string;
  act_number?: string;
  actNumber?: string;
  act_year?: number;
  actYear?: number;
  ministry?: string;
  jurisdiction?: string;
  unit?: string;
  section_count?: number;
  totalSections?: number;
  in_force?: boolean;
  url?: string;
}

export interface IIndiaCodeActOverview {
  act: {
    id: string;
    short_title: string;
    long_title?: string;
    act_number?: string;
    act_year?: number;
    enact_date?: string;
    enforcement_date?: string;
    ministry?: string;
    jurisdiction?: string;
    unit?: string;
    section_count?: number;
    in_force?: boolean;
    url?: string;
  };
  count: number;
  sections?: Array<{
    number: string;
    heading: string;
    words?: number;
    indexable?: boolean;
    url?: string;
  }>;
  schedules?: Array<{
    ord?: number;
    title: string;
    words?: number;
    url?: string;
  }>;
  amendments?: Array<{
    title: string;
    year?: number;
    act_number?: string;
  }>;
}

export interface IIndiaCodeSectionDetail {
  act: {
    id: string;
    short_title: string;
    unit?: string;
    act_year?: number;
  };
  section?: {
    number: string;
    heading: string;
    text?: string;
    html?: string;
    words?: number;
  };
  classification?: Array<{
    offence?: string;
    punishment?: string;
    cognizable?: string;
    bailable?: string;
    triable_by?: string;
  }>;
  judgments?: Array<{
    title: string;
    citation: string;
    court?: string;
    court_name?: string;
    date?: string;
    precedential_value?: string;
    ratio_decidendi?: string;
    applied_to_this_section?: string;
    url?: string;
  }>;
}

class IndiaCodeService {
  /**
   * Common slug aliases to map informal or legacy slugs to live eCourts IndiaCode IDs
   */
  public static readonly SLUG_ALIASES: Record<string, string> = {
    "prevention-of-corruption-act-1988": "pc-act",
    "prevention-of-corruption-act": "pc-act",
    "prevention-of-corruption": "pc-act",
    "specific-relief-act-1963": "specific-relief-act",
    "limitation-act-1963": "limitation-act",
    "sarfaesi-act-2002": "securitisation-reconstruction-financial-assets-enforcement-security-interest-act",
    "sarfaesi-act": "securitisation-reconstruction-financial-assets-enforcement-security-interest-act",
    "sarfaesi": "securitisation-reconstruction-financial-assets-enforcement-security-interest-act",
    "recovery-of-debts-due-to-banks-act": "recovery-debts-bankruptcy-act-1993",
    "transfer-of-property-act-1882": "tp-act",
    "transfer-of-property-act": "tp-act",
    "transfer-of-property": "tp-act",
    "pocso": "pocso-act",
    "protection-of-children-from-sexual-offences-act": "pocso-act",
  };

  /**
   * Search IndiaCode API for Acts by title, ministry, or jurisdiction
   */
  async searchActs(
    query: string,
    options?: {
      jurisdiction?: string;
      ministry?: string;
      year?: number;
      limit?: number;
      offset?: number;
    }
  ) {
    const params = new URLSearchParams();
    if (query) params.append("q", query);
    if (options?.jurisdiction) params.append("jurisdiction", options.jurisdiction);
    if (options?.ministry) params.append("ministry", options.ministry);
    if (options?.year) params.append("year", String(options.year));
    params.append("limit", String(options?.limit || 20));
    params.append("offset", String(options?.offset || 0));

    const url = `${INDIA_CODE_BASE_URL}/acts?${params.toString()}`;
    const response = await fetch(url);
    if (!response.ok) {
      throw new AppError(`IndiaCode API error: ${response.statusText}`, response.status);
    }

    const data = (await response.json()) as {
      acts?: Array<Record<string, unknown>>;
      total?: number;
      next?: string | null;
    };
    const rawActs = data.acts || [];

    // Normalize acts so both eCourts standard keys and frontend client keys are always present
    const acts: IIndiaCodeSearchResult[] = rawActs.map((a) => {
      const actId = String(a.id || a.slug || "");
      const actTitle = String(a.short_title || a.title || "Statutory Act");
      const actNum = a.act_number ? String(a.act_number) : (a.actNumber ? String(a.actNumber) : undefined);
      const actYr = typeof a.act_year === "number" ? a.act_year : (typeof a.actYear === "number" ? a.actYear : undefined);
      const secCount = Number(a.section_count ?? a.totalSections ?? 0);
      return {
        id: actId,
        slug: actId,
        short_title: actTitle,
        title: actTitle,
        act_number: actNum,
        actNumber: actNum,
        act_year: actYr,
        actYear: actYr,
        section_count: secCount,
        totalSections: secCount,
        jurisdiction: a.jurisdiction ? String(a.jurisdiction) : "Central",
        ministry: a.ministry ? String(a.ministry) : undefined,
        url: a.url ? String(a.url) : "",
      };
    });

    return {
      total: typeof data.total === "number" ? data.total : acts.length,
      count: acts.length,
      limit: Number(options?.limit || 20),
      offset: Number(options?.offset || 0),
      next: data.next || null,
      acts,
    };
  }

  /**
   * Get an Act's overview, all section headings, and schedules
   */
  async getActOverview(actSlug: string): Promise<IIndiaCodeActOverview> {
    if (!actSlug || typeof actSlug !== "string") {
      throw new AppError("A valid actSlug is required", 400);
    }
    let cleanSlug = actSlug.toLowerCase().trim();
    if (IndiaCodeService.SLUG_ALIASES[cleanSlug]) {
      cleanSlug = IndiaCodeService.SLUG_ALIASES[cleanSlug];
    }
    let url = `${INDIA_CODE_BASE_URL}/acts/${cleanSlug}`;
    let response = await fetch(url);

    // Fallback: If 404, try searching for the slug as words in case an un-aliased name was passed
    if (!response.ok && response.status === 404) {
      const queryTerm = cleanSlug.replace(/[-_]/g, " ");
      try {
        const searchRes = await this.searchActs(queryTerm, { limit: 1 });
        if (searchRes.acts && searchRes.acts.length > 0 && searchRes.acts[0].id) {
          cleanSlug = searchRes.acts[0].id;
          url = `${INDIA_CODE_BASE_URL}/acts/${cleanSlug}`;
          response = await fetch(url);
        }
      } catch {
        // Fall through to standard 404 handler
      }
    }

    if (!response.ok) {
      if (response.status === 404) {
        throw new AppError(`Act '${actSlug}' not found on IndiaCode API`, 404);
      }
      throw new AppError(`IndiaCode API error: ${response.statusText}`, response.status);
    }

    return (await response.json()) as IIndiaCodeActOverview;
  }

  /**
   * Get a single provision (section/article) with complete statutory text, classification, and judgments
   */
  async getSection(actSlug: string, sectionNumber: string): Promise<IIndiaCodeSectionDetail> {
    if (!actSlug || !sectionNumber) {
      throw new AppError("Both actSlug and sectionNumber are required", 400);
    }
    let cleanSlug = actSlug.toLowerCase().trim();
    if (IndiaCodeService.SLUG_ALIASES[cleanSlug]) {
      cleanSlug = IndiaCodeService.SLUG_ALIASES[cleanSlug];
    }
    const cleanNumber = sectionNumber.trim();
    const url = `${INDIA_CODE_BASE_URL}/${cleanSlug}/section/${encodeURIComponent(cleanNumber)}`;

    let response = await fetch(url, { redirect: "follow" });
    if (!response.ok && response.status === 404) {
      // Check if overview points to a resolved canonical slug
      try {
        const overview = await this.getActOverview(actSlug);
        if (overview.act?.id && overview.act.id !== cleanSlug) {
          cleanSlug = overview.act.id;
          const retryUrl = `${INDIA_CODE_BASE_URL}/${cleanSlug}/section/${encodeURIComponent(cleanNumber)}`;
          response = await fetch(retryUrl, { redirect: "follow" });
        }
      } catch {
        // Continue
      }
    }

    if (!response.ok) {
      if (response.status === 404) {
        throw new AppError(`Section '${sectionNumber}' of Act '${actSlug}' not found on IndiaCode`, 404);
      }
      throw new AppError(`IndiaCode API error: ${response.statusText}`, response.status);
    }

    return (await response.json()) as IIndiaCodeSectionDetail;
  }

  /**
   * Helper to derive a clean shortCode from title / slug
   */
  private deriveShortCode(title: string, slug: string): string {
    const cleanTitle = title.replace(/^the\s+/i, "").replace(/,\s*\d{4}.*$/, "").trim();
    const words = cleanTitle.split(/\s+/).filter(Boolean);
    if (words.length === 1) return words[0].toUpperCase().slice(0, 10);
    const acronym = words.map((w) => w[0]).join("").toUpperCase();
    return acronym.slice(0, 15);
  }

  /**
   * Helper to deduce category enum from title and description
   */
  private deduceCategory(
    title: string,
    longTitle?: string
  ): (typeof bareActCategoryEnum.enumValues)[number] {
    const combined = `${title} ${longTitle || ""}`.toLowerCase();
    if (combined.includes("penal") || combined.includes("criminal") || combined.includes("sanhita") || combined.includes("offence") || combined.includes("police")) {
      return "criminal";
    }
    if (combined.includes("company") || combined.includes("corporate") || combined.includes("commercial") || combined.includes("partnership") || combined.includes("goods") || combined.includes("competition")) {
      return "corporate_commercial";
    }
    if (combined.includes("bank") || combined.includes("negotiable") || combined.includes("sebi") || combined.includes("securities") || combined.includes("foreign exchange") || combined.includes("insolvency") || combined.includes("debts recovery")) {
      return "banking_finance";
    }
    if (combined.includes("constitution") || combined.includes("civil procedure") || combined.includes("limitation") || combined.includes("specific relief") || combined.includes("court") || combined.includes("advocate")) {
      return "civil_procedure";
    }
    if (combined.includes("property") || combined.includes("real estate") || combined.includes("rera") || combined.includes("transfer of property") || combined.includes("tenancy") || combined.includes("rent")) {
      return "property_realestate";
    }
    if (combined.includes("labour") || combined.includes("employment") || combined.includes("industrial") || combined.includes("wages") || combined.includes("factory") || combined.includes("posh") || combined.includes("workplace")) {
      return "labour_employment";
    }
    if (combined.includes("marriage") || combined.includes("divorce") || combined.includes("succession") || combined.includes("domestic violence") || combined.includes("guardian") || combined.includes("family")) {
      return "family_personal";
    }
    if (combined.includes("tax") || combined.includes("gst") || combined.includes("customs") || combined.includes("excise") || combined.includes("stamp")) {
      return "taxation";
    }
    if (combined.includes("information technology") || combined.includes("data protection") || combined.includes("cyber") || combined.includes("copyright") || combined.includes("patent") || combined.includes("trademark")) {
      return "cyber_ipr";
    }
    if (combined.includes("consumer") || combined.includes("environment") || combined.includes("pollution") || combined.includes("forest") || combined.includes("wildlife")) {
      return "consumer_environment";
    }
    if (combined.includes("motor vehicles") || combined.includes("traffic") || combined.includes("accident")) {
      return "motor_accidents";
    }
    if (combined.includes("arbitration") || combined.includes("conciliation") || combined.includes("mediation")) {
      return "arbitration_adr";
    }
    return "general_special";
  }

  /**
   * Helper to parse criminal classification fields into schema enums
   */
  public parseClassification(classifications?: IIndiaCodeSectionDetail["classification"]) {
    if (!classifications || classifications.length === 0) {
      return {
        bailableStatus: "not_applicable" as const,
        cognizableStatus: "not_applicable" as const,
        compoundableStatus: "not_applicable" as const,
        punishment: null,
        triableBy: null,
      };
    }

    const first = classifications[0];
    const bailableText = (first.bailable || "").toLowerCase();
    const cognizableText = (first.cognizable || "").toLowerCase();

    let bailableStatus: "bailable" | "non_bailable" | "not_applicable" = "not_applicable";
    if (bailableText.includes("non-bailable") || bailableText.includes("non bailable")) {
      bailableStatus = "non_bailable";
    } else if (bailableText.includes("bailable")) {
      bailableStatus = "bailable";
    }

    let cognizableStatus: "cognizable" | "non_cognizable" | "not_applicable" = "not_applicable";
    if (cognizableText.includes("non-cognizable") || cognizableText.includes("non cognizable")) {
      cognizableStatus = "non_cognizable";
    } else if (cognizableText.includes("cognizable")) {
      cognizableStatus = "cognizable";
    }

    return {
      bailableStatus,
      cognizableStatus,
      compoundableStatus: "not_applicable" as const,
      punishment: first.punishment || null,
      triableBy: first.triable_by || null,
    };
  }

  /**
   * Parse numeric value from provision string (e.g. "188" -> 188, "21A" -> 21.1)
   */
  private parseNumeric(numStr: string): number {
    const match = numStr.match(/^(\d+)([a-zA-Z])?/);
    if (!match) return 0;
    const base = parseInt(match[1], 10);
    if (!match[2]) return base;
    const letterCode = match[2].toUpperCase().charCodeAt(0) - 64; // A=1, B=2
    return base + letterCode * 0.1;
  }

  /**
   * Background Sync: Inserts Acts returned by IndiaCode / e-Courts search into the database
   */
  async syncActsToDatabase(acts: IIndiaCodeSearchResult[]) {
    if (!acts || acts.length === 0) return;

    for (const act of acts) {
      if (!act.id || !act.short_title) continue;
      try {
        const category = this.deduceCategory(act.short_title);
        const shortCode = this.deriveShortCode(act.short_title, act.id);

        const isState = Boolean(
          act.jurisdiction &&
            act.jurisdiction.toLowerCase() !== "central" &&
            act.jurisdiction.toLowerCase() !== "union"
        );
        const stateJurisdiction = isState ? act.jurisdiction : null;
        const jurisdiction: "state" | "central" = isState ? "state" : "central";

        await db
          .insert(bareActs)
          .values({
            title: act.short_title,
            shortCode,
            slug: act.id,
            longTitle: act.short_title,
            actNumber: act.act_number ? `Act No. ${act.act_number} of ${act.act_year || ""}`.trim() : null,
            actYear: act.act_year || new Date().getFullYear(),
            category,
            jurisdiction,
            stateJurisdiction,
            ministry: act.ministry || null,
            status: act.in_force ? "active" : "amended",
            source: "system_seed",
            isFeatured: false,
            totalSections: act.section_count || 0,
            totalChapters: 0,
            description: `Statute enacted by Parliament/State Legislature in ${act.act_year || ""}.`,
            keywords: [act.short_title.toLowerCase(), act.id, shortCode.toLowerCase()],
          })
          .onConflictDoNothing({ target: bareActs.slug });
      } catch (err: unknown) {
        console.error(`Failed to background sync act '${act.id}':`, err);
      }
    }
  }

  /**
   * ADMIN ONE-CLICK IMPORT:
   * Imports an entire Act, all its sections, classifications, and judgments into Postgres.
   */
  async importActWithSections(
    actSlug: string,
    options?: {
      category?: string;
      maxSections?: number;
      batchSize?: number;
      uploadedByAdminId?: string;
    }
  ) {
    console.log(`📥 Starting 1-Click Import from IndiaCode for: ${actSlug}`);
    const overview = await this.getActOverview(actSlug);
    const { act, sections = [], schedules = [] } = overview;

    const category =
      (options?.category as (typeof bareActCategoryEnum.enumValues)[number] | undefined) ||
      this.deduceCategory(act.short_title, act.long_title);
    const shortCode = this.deriveShortCode(act.short_title, act.id);

    const isStateAct = Boolean(
      act.jurisdiction &&
        act.jurisdiction.toLowerCase() !== "central" &&
        act.jurisdiction.toLowerCase() !== "union"
    );
    const stateJurisdiction = isStateAct ? act.jurisdiction : null;
    const jurisdiction: "state" | "central" = isStateAct ? "state" : "central";

    // 1. Check or Upsert bareAct record
    let actRecord = await db.query.bareActs.findFirst({
      where: eq(bareActs.slug, act.id),
    });

    if (!actRecord) {
      const [inserted] = await db
        .insert(bareActs)
        .values({
          title: act.short_title,
          shortCode,
          slug: act.id,
          longTitle: act.long_title || act.short_title,
          actNumber: act.act_number ? `Act No. ${act.act_number} of ${act.act_year || ""}`.trim() : null,
          actYear: act.act_year || new Date().getFullYear(),
          category,
          jurisdiction,
          stateJurisdiction,
          ministry: act.ministry || null,
          status: act.in_force ? "active" : "amended",
          enactmentDate: act.enact_date || null,
          enforcementDate: act.enforcement_date || null,
          source: "admin_upload",
          uploadedByAdminId: options?.uploadedByAdminId || null,
          isFeatured: false,
          totalSections: act.section_count || sections.length,
          totalChapters: 0,
          description: act.long_title || `Statute enacted by Parliament of India in ${act.act_year}.`,
          keywords: [act.short_title.toLowerCase(), act.id, shortCode.toLowerCase()],
        })
        .returning();
      actRecord = inserted;
      console.log(`  ✅ Created Act in DB: ${actRecord.title} (ID: ${actRecord.id})`);
    } else {
      // Update metadata
      await db
        .update(bareActs)
        .set({
          title: act.short_title,
          longTitle: act.long_title || actRecord.longTitle,
          totalSections: act.section_count || sections.length,
        })
        .where(eq(bareActs.id, actRecord.id));
      console.log(`  🔄 Updated Act in DB: ${actRecord.title} (ID: ${actRecord.id})`);
    }

    const actId = actRecord.id;

    // 2. Import Schedules
    if (schedules && schedules.length > 0) {
      await db.delete(bareActSchedules).where(eq(bareActSchedules.actId, actId));
      for (const sch of schedules) {
        await db.insert(bareActSchedules).values({
          actId,
          scheduleNumber: `Schedule ${sch.ord || ""}`.trim(),
          title: sch.title || `Schedule ${sch.ord}`,
          content: sch.url ? `Available at: ${sch.url}` : "",
          orderIndex: sch.ord || 1,
        });
      }
      console.log(`  📋 Saved ${schedules.length} schedules.`);
    }

    // 3. Fast Outline Insertion for ALL sections in the Act (e.g. 282 sections)
    const existingSections = await db
      .select({
        id: bareActSections.id,
        sectionNumber: bareActSections.sectionNumber,
      })
      .from(bareActSections)
      .where(eq(bareActSections.actId, actId));

    const existingSectionSet = new Set(
      existingSections.map((s) => s.sectionNumber.toLowerCase().trim())
    );

    const newOutlineRecords: (typeof bareActSections.$inferInsert)[] = [];
    for (let idx = 0; idx < sections.length; idx++) {
      const sec = sections[idx];
      const secNumberStr = `${act.unit === "article" ? "Article" : "Section"} ${sec.number}`;
      if (!existingSectionSet.has(secNumberStr.toLowerCase().trim())) {
        const secSlug = `${act.id}-section-${sec.number.toLowerCase()}`;
        const secNumeric = this.parseNumeric(sec.number);
        newOutlineRecords.push({
          actId,
          sectionType: act.unit === "article" ? "article" : "section",
          sectionNumber: secNumberStr,
          sectionNumeric: secNumeric,
          title: sec.heading || `Provision ${sec.number}`,
          slug: secSlug,
          content: sec.heading || `${secNumberStr} of ${act.short_title}.`,
          bailableStatus: "not_applicable",
          cognizableStatus: "not_applicable",
          compoundableStatus: "not_applicable",
          orderIndex: idx + 1,
          keywords: [secNumberStr.toLowerCase(), sec.heading?.toLowerCase() || "", act.id],
        });
        existingSectionSet.add(secNumberStr.toLowerCase().trim());
      }
    }

    if (newOutlineRecords.length > 0) {
      console.log(`  📋 Fast outline-inserting ${newOutlineRecords.length} sections into DB...`);
      for (let i = 0; i < newOutlineRecords.length; i += 50) {
        const chunk = newOutlineRecords.slice(i, i + 50);
        await db.insert(bareActSections).values(chunk);
      }
    }

    const totalSectionsInDb = existingSections.length + newOutlineRecords.length;
    await db
      .update(bareActs)
      .set({
        totalSections: Math.max(act.section_count || 0, totalSectionsInDb),
      })
      .where(eq(bareActs.id, actId));

    // 4. Batch enrich detailed statutory text, classification, and judgments
    const sectionsToImport = options?.maxSections ? sections.slice(0, options.maxSections) : sections.slice(0, 20);
    console.log(`  ⚡ Enriching statutory text for ${sectionsToImport.length} sections from IndiaCode...`);

    const batchSize = Math.max(1, options?.batchSize || 5);
    let importedSectionsCount = 0;

    for (let i = 0; i < sectionsToImport.length; i += batchSize) {
      const chunk = sectionsToImport.slice(i, i + batchSize);
      await Promise.all(
        chunk.map(async (sec, idx) => {
          try {
            const secDetail = await this.getSection(act.id, sec.number);
            const { section, classification, judgments } = secDetail;
            if (!section) return;

            const secNumberStr = `${act.unit === "article" ? "Article" : "Section"} ${section.number}`;
            const secSlug = `${act.id}-section-${section.number.toLowerCase()}`;
            const parsedClass = this.parseClassification(classification);
            const secNumeric = this.parseNumeric(section.number);

            const landmarkJudgments = (judgments || []).map((j) => ({
              title: j.title,
              citation: j.citation,
              summary: j.applied_to_this_section || j.ratio_decidendi || undefined,
            }));

            // Check if section already exists
            const existingSec = await db.query.bareActSections.findFirst({
              where: and(eq(bareActSections.actId, actId), eq(bareActSections.sectionNumber, secNumberStr)),
            });

            if (!existingSec) {
              await db.insert(bareActSections).values({
                actId,
                sectionType: act.unit === "article" ? "article" : "section",
                sectionNumber: secNumberStr,
                sectionNumeric: secNumeric,
                title: section.heading || `Provision ${section.number}`,
                slug: secSlug,
                content: section.text || section.html || section.heading,
                punishment: parsedClass.punishment,
                bailableStatus: parsedClass.bailableStatus,
                cognizableStatus: parsedClass.cognizableStatus,
                compoundableStatus: parsedClass.compoundableStatus,
                triableBy: parsedClass.triableBy,
                orderIndex: i + idx + 1,
                keywords: [secNumberStr.toLowerCase(), section.heading?.toLowerCase() || "", act.id],
                crossReferences: {
                  landmarkJudgments: landmarkJudgments.length ? landmarkJudgments : undefined,
                },
              });
            } else {
              await db
                .update(bareActSections)
                .set({
                  title: section.heading || existingSec.title,
                  content: section.text || section.html || existingSec.content,
                  punishment: parsedClass.punishment || existingSec.punishment,
                  bailableStatus: parsedClass.bailableStatus || existingSec.bailableStatus,
                  cognizableStatus: parsedClass.cognizableStatus || existingSec.cognizableStatus,
                  triableBy: parsedClass.triableBy || existingSec.triableBy,
                  crossReferences: landmarkJudgments.length
                    ? { landmarkJudgments }
                    : existingSec.crossReferences,
                })
                .where(eq(bareActSections.id, existingSec.id));
            }
            importedSectionsCount++;
          } catch (err) {
            const message = err instanceof Error ? err.message : String(err);
            console.warn(`  ⚠️ Could not import section ${sec.number} of ${act.id}: ${message}`);
          }
        })
      );
    }

    console.log(`🎉 Successfully imported ${importedSectionsCount} sections for ${act.short_title}!`);

    return {
      actId: actRecord.id,
      title: actRecord.title,
      slug: actRecord.slug,
      shortCode: actRecord.shortCode,
      totalSectionsAvailable: sections.length,
      importedSectionsCount,
      schedulesCount: schedules.length,
    };
  }

  /**
   * ON-DEMAND FALLBACK (HYBRID CACHE):
   * When an advocate or user requests a section that doesn't exist locally,
   * fetches from IndiaCode, caches it to DB, and returns it.
   */
  async getOrFetchSection(actSlug: string, sectionNumber: string) {
    const cleanNumber = sectionNumber.replace(/^section\s+/i, "").replace(/^article\s+/i, "").trim();

    // 1. Fetch from IndiaCode
    const detail = await this.getSection(actSlug, cleanNumber);
    const { act, section, classification, judgments } = detail;
    if (!section) {
      throw new AppError(`Section ${sectionNumber} not found on IndiaCode.`, 404);
    }

    // 2. Ensure Act exists in DB
    let actRecord = await db.query.bareActs.findFirst({
      where: eq(bareActs.slug, act.id),
    });

    if (!actRecord) {
      const category = this.deduceCategory(act.short_title);
      const [newAct] = await db
        .insert(bareActs)
        .values({
          title: act.short_title,
          shortCode: this.deriveShortCode(act.short_title, act.id),
          slug: act.id,
          longTitle: act.short_title,
          actYear: act.act_year || new Date().getFullYear(),
          category,
          jurisdiction: "central",
          status: "active",
          source: "admin_upload",
          totalSections: 1,
        })
        .returning();
      actRecord = newAct;
    }

    const secNumberStr = `${act.unit === "article" ? "Article" : "Section"} ${section.number}`;
    const secSlug = `${act.id}-section-${section.number.toLowerCase()}`;
    const parsedClass = this.parseClassification(classification);
    const secNumeric = this.parseNumeric(section.number);

    const landmarkJudgments = (judgments || []).map((j) => ({
      title: j.title,
      citation: j.citation,
      summary: j.applied_to_this_section || j.ratio_decidendi || undefined,
    }));

    // 3. Cache section into DB
    let [savedSection] = await db
      .insert(bareActSections)
      .values({
        actId: actRecord.id,
        sectionType: act.unit === "article" ? "article" : "section",
        sectionNumber: secNumberStr,
        sectionNumeric: secNumeric,
        title: section.heading || `Provision ${section.number}`,
        slug: secSlug,
        content: section.text || section.html || section.heading,
        punishment: parsedClass.punishment,
        bailableStatus: parsedClass.bailableStatus,
        cognizableStatus: parsedClass.cognizableStatus,
        compoundableStatus: parsedClass.compoundableStatus,
        triableBy: parsedClass.triableBy,
        orderIndex: secNumeric,
        keywords: [secNumberStr.toLowerCase(), section.heading?.toLowerCase() || "", act.id],
        crossReferences: {
          landmarkJudgments: landmarkJudgments.length ? landmarkJudgments : undefined,
        },
      })
      .returning();

    return savedSection;
  }
}

export const indiaCodeService = new IndiaCodeService();
export default indiaCodeService;
