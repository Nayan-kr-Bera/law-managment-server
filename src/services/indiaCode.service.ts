import { and, count, eq, ilike, or } from "drizzle-orm";
import slugify from "slugify";
import db from "../db/index.js";
import {
  bareActs,
  bareActChapters,
  bareActSections,
  bareActSchedules,
} from "../db/schema/index.js";
import { bareActCategoryEnum } from "../db/schema/enum.js";
import { AppError } from "../middleware/errorHandler.js";

/**
 * ============================================================================
 * Official IndiaCode (indiacode.nic.in) Architecture & Resilience Strategy
 * ============================================================================
 * 1. The official Government of India repository (https://www.indiacode.nic.in),
 *    maintained by the Ministry of Law and Justice / NIC, is hosted on DSpace
 *    (an open-source digital archiving system using /handle/123456789/... links)
 *    and does NOT provide a public open REST API.
 * 2. Community wrappers (e.g. https://indiacode.ecourtsindia.com/api/v1) have
 *    been decommissioned (HTTP 410 Gone).
 * 3. Architecture & Pipeline:
 *    - Tier 1: Local PostgreSQL database (`bare_acts` & `bare_act_sections`).
 *              Fast, offline, zero-latency.
 *    - Tier 2: Live Statutory Central Acts Directory (848+ Parliament enactments).
 *    - Tier 3: External IndiaCode API wrapper (if configured and accessible).
 *              Wrapped in short timeouts and graceful fall-through so 410/network
 *              errors never break user workflows.
 *    - Cache-Aside Dynamic Auto-Persist: First time an enactment or provision is
 *      requested, it is fetched live and immediately saved into PostgreSQL.
 *      All subsequent queries are served 100% from PostgreSQL.
 * ============================================================================
 */
const INDIA_CODE_BASE_URL = process.env.INDIA_CODE_API_URL || "https://indiacode.ecourtsindia.com/api/v1";

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

export interface IIndiaCodeSearchProvisionHit {
  kind: "section" | "rule" | "act" | "listed" | "judgment" | "rates";
  ref: string;
  title: string;
  act?: string | null;
  snippet?: string | null;
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

export interface IRawIndiaCodeSectionResponse {
  order?: string | number;
  order_arabic?: string | number;
  rules?: Array<{ rule?: string | number; heading?: string }>;
  heading?: string;
  title?: string;
  text?: string;
  html?: string;
  act_title?: string;
  rule?: string | number;
  [key: string]: unknown;
}

export interface ICentralActIndexItem {
  id: string;
  slug: string;
  href: string;
  short_title: string;
  title: string;
  act_number?: string;
  act_year?: number;
  ministry?: string;
  section_count?: number;
  aliases: string[];
}

export interface ILiveParsedAct {
  overview: IIndiaCodeActOverview;
  sections: Array<{
    number: string;
    heading: string;
    text: string;
  }>;
}

class IndiaCodeService {
  private static centralActsCache: { timestamp: number; acts: ICentralActIndexItem[] } | null = null;
  private static parsedActDetailsCache = new Map<string, { timestamp: number; data: ILiveParsedAct }>();
  private static externalApiDisabled: boolean =
    INDIA_CODE_BASE_URL.includes("indiacode.ecourtsindia.com") ||
    process.env.DISABLE_EXTERNAL_INDIACODE === "true";

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
    "llp": "the-limited-liability-partnership-act-2008",
    "limited-liability-partnership": "the-limited-liability-partnership-act-2008",
    "companies-act": "the-companies-act-2013",
    "bns": "the-bharatiya-nyaya-sanhita-2023",
    "bnss": "the-bharatiya-nagarik-suraksha-sanhita-2023",
    "bsa": "the-bharatiya-sakshya-adhiniyam-2023",
    "cpc": "the-code-of-civil-procedure-1908",
    "crpc": "the-code-of-criminal-procedure-1973",
    "ipc": "the-indian-penal-code",
    "contract-act": "the-indian-contract-act-1872",
    "ni-act": "the-negotiable-instruments-act-1881",
    "arbitration-act": "the-arbitration-and-conciliation-act-1996",
    "the-arbitration-and-conciliation-act-1996": "arbitration-act",
    "the-bharatiya-nyaya-sanhita-2023": "bns",
    "the-bharatiya-nagarik-suraksha-sanhita-2023": "bnss",
    "the-bharatiya-sakshya-adhiniyam-2023": "bsa",
    "insolvency-bankruptcy-code-2016": "the-insolvency-and-bankruptcy-code-2016",
    "insolvency-and-bankruptcy-code": "the-insolvency-and-bankruptcy-code-2016",
    "insolvency-and-bankruptcy": "the-insolvency-and-bankruptcy-code-2016",
    "competition-act": "the-competition-act-2002",
    "indian-partnership-act": "the-indian-partnership-act-1932",
    "indian-partnership": "the-indian-partnership-act-1932",
    "arbitration-and-conciliation": "the-arbitration-and-conciliation-act-1996",
    "arbitration-and-conciliation-act": "the-arbitration-and-conciliation-act-1996",
    "bharatiya-nyaya-sanhita": "the-bharatiya-nyaya-sanhita-2023",
  };

  /**
   * Fetch and cache the live directory of 848+ Central Acts of India
   */
  public async fetchLiveCentralActs(): Promise<ICentralActIndexItem[]> {
    const CACHE_TTL_MS = 3 * 60 * 60 * 1000; // 3 hours cache
    if (
      IndiaCodeService.centralActsCache &&
      Date.now() - IndiaCodeService.centralActsCache.timestamp < CACHE_TTL_MS &&
      IndiaCodeService.centralActsCache.acts.length > 0
    ) {
      return IndiaCodeService.centralActsCache.acts;
    }

    try {
      console.log("[IndiaCodeService] 🏛️ Fetching live statutory directory of Central Acts from Parliament repository...");
      const resp = await fetch("https://legislations.in/acts", {
        signal: AbortSignal.timeout(12000),
      });
      if (!resp.ok) {
        console.warn(`[IndiaCodeService] ⚠️ Failed to fetch central acts directory: HTTP ${resp.status}`);
        return IndiaCodeService.centralActsCache?.acts || [];
      }

      const html = await resp.text();
      const liMatches = html.match(/<li class="act-item"[\s\S]*?<\/li>/gi) || [];
      const parsedActs: ICentralActIndexItem[] = [];

      for (const li of liMatches) {
        const titleMatch = li.match(/<a class="act-item-title" href="([^"]*)">([^<]*)<\/a>/i);
        if (!titleMatch) continue;
        const href = titleMatch[1];
        const title = titleMatch[2]
          .replace(/&quot;|&#34;/g, '"')
          .replace(/&#39;|&apos;/g, "'")
          .replace(/&amp;/g, "&")
          .replace(/&lt;/g, "<")
          .replace(/&gt;/g, ">")
          .replace(/&nbsp;/g, " ")
          .trim();

        const yearMatch = li.match(/data-year="([^"]*)"/i);
        const year = yearMatch ? parseInt(yearMatch[1], 10) : undefined;

        const minMatch = li.match(/data-ministry="([^"]*)"/i);
        const ministry = minMatch ? minMatch[1].trim() : undefined;

        const aliasMatch = li.match(/data-aliases="([^"]*)"/i);
        const aliases = aliasMatch ? aliasMatch[1].trim().split(/\s+/).filter(Boolean) : [];

        const metaMatch = li.match(/<span>Act\s+([^<]+)<\/span>/i);
        const actNumber = metaMatch ? metaMatch[1].trim() : undefined;

        const secMatch = li.match(/<span>(\d+)\s+sections?<\/span>/i);
        const sectionCount = secMatch ? parseInt(secMatch[1], 10) : 0;

        const slug = href.split("/").filter(Boolean).pop() || "";

        parsedActs.push({
          id: slug,
          slug,
          href,
          short_title: title,
          title,
          act_number: actNumber,
          act_year: year,
          ministry,
          section_count: sectionCount,
          aliases,
        });
      }

      if (parsedActs.length > 0) {
        IndiaCodeService.centralActsCache = {
          timestamp: Date.now(),
          acts: parsedActs,
        };
        console.log(`[IndiaCodeService] ✅ Loaded and cached ${parsedActs.length} Central Acts in memory.`);
      }

      return parsedActs;
    } catch (err) {
      console.warn("[IndiaCodeService] ⚠️ Could not fetch live central acts registry:", err);
      return IndiaCodeService.centralActsCache?.acts || [];
    }
  }

  /**
   * Fetch and parse full live Act details & statutory provisions from open parliamentary enactments
   */
  public async fetchLiveActDetails(slugOrHref: string): Promise<ILiveParsedAct | null> {
    const clean = (slugOrHref || "").toLowerCase().trim();
    if (!clean) return null;

    const cached = IndiaCodeService.parsedActDetailsCache.get(clean);
    if (cached && Date.now() - cached.timestamp < 3 * 60 * 60 * 1000) {
      console.log(`[IndiaCodeService] ⚡ Serving cached live Act details for '${clean}'.`);
      return cached.data;
    }

    const liveActs = await this.fetchLiveCentralActs();
    let matched = liveActs.find((a) => {
      const s = a.slug.toLowerCase();
      const h = a.href.toLowerCase();
      return (
        s === clean ||
        h.endsWith(`/${clean}`) ||
        (a.aliases && a.aliases.some((al) => al.toLowerCase() === clean))
      );
    });

    if (!matched) {
      matched = liveActs.find((a) => {
        const s = a.slug.toLowerCase();
        return s.includes(clean) || clean.includes(s);
      });
    }

    if (!matched) {
      console.warn(`[IndiaCodeService] ⚠️ Act '${clean}' not found in 848+ Central Acts directory.`);
      return null;
    }

    try {
      console.log(`[IndiaCodeService] 📥 Fetching live enactment text: https://legislations.in${matched.href}...`);
      const resp = await fetch(`https://legislations.in${matched.href}`, {
        signal: AbortSignal.timeout(8000),
      });
      if (!resp.ok) {
        console.warn(`[IndiaCodeService] ⚠️ Failed to fetch enactment text: HTTP ${resp.status}`);
        return null;
      }

      const html = await resp.text();
      const longTitleMatch = html.match(/<p class="act-long-title"[^>]*>([\s\S]*?)<\/p>/i);
      const longTitle = longTitleMatch
        ? longTitleMatch[1]
            .replace(/<[^>]*>/g, "")
            .replace(/&quot;|&#34;/g, '"')
            .replace(/&#39;|&apos;/g, "'")
            .replace(/&amp;/g, "&")
            .trim()
        : matched.title;

      const secRegex = /<section class="act-section"[^>]*id="([^"]*)"[\s\S]*?<h3 class="act-section-heading">([\s\S]*?)<\/h3>([\s\S]*?)<\/section>/gi;
      const parsedSections: Array<{ number: string; heading: string; text: string }> = [];
      let m;

      while ((m = secRegex.exec(html)) !== null) {
        const secId = m[1];
        const headingRaw = m[2].replace(/<[^>]*>/g, "").trim();
        const bodyHtml = m[3];

        const numMatch = headingRaw.match(/^(\d+[a-zA-Z]?|[a-zA-Z]+)\.\s*(.*)$/);
        const num = numMatch ? numMatch[1] : secId.replace(/^sec-/i, "");
        const cleanHeading = numMatch ? numMatch[2].trim() : headingRaw;

        const cleanText = bodyHtml
          .replace(/<p[^>]*>/gi, "")
          .replace(/<\/p>/gi, "\n\n")
          .replace(/<br\s*\/?>/gi, "\n")
          .replace(/<[^>]*>/g, "")
          .replace(/&quot;|&#34;/g, '"')
          .replace(/&#39;|&apos;/g, "'")
          .replace(/&amp;/g, "&")
          .replace(/&lt;/g, "<")
          .replace(/&gt;/g, ">")
          .replace(/&nbsp;/g, " ")
          .trim();

        parsedSections.push({
          number: num,
          heading: cleanHeading || headingRaw,
          text: cleanText || `${cleanHeading} under ${matched.title}`,
        });
      }

      const overview: IIndiaCodeActOverview = {
        act: {
          id: matched.slug,
          short_title: matched.title,
          long_title: longTitle,
          act_number: matched.act_number,
          act_year: matched.act_year,
          ministry: matched.ministry,
          jurisdiction: "Central",
          section_count: parsedSections.length || matched.section_count,
          in_force: true,
          unit: "section",
        },
        count: parsedSections.length,
        sections: parsedSections.map((s) => ({
          number: s.number,
          heading: s.heading,
          words: s.text.split(/\s+/).length,
          indexable: true,
        })),
        schedules: [],
        amendments: [],
      };

      const result: ILiveParsedAct = {
        overview,
        sections: parsedSections,
      };

      IndiaCodeService.parsedActDetailsCache.set(matched.slug.toLowerCase(), {
        timestamp: Date.now(),
        data: result,
      });
      IndiaCodeService.parsedActDetailsCache.set(clean, {
        timestamp: Date.now(),
        data: result,
      });

      return result;
    } catch (err) {
      console.warn(`Failed to fetch live act details for ${matched.href}:`, err);
      return null;
    }
  }

  /**
   * Search Acts dynamically from Database and Live Central Acts Registry
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
    const limit = Math.min(100, Math.max(1, Number(options?.limit) || 20));
    const offset = Math.max(0, Number(options?.offset) || 0);
    const cleanQuery = (query || "").trim().toLowerCase();

    console.log(`[IndiaCodeService] 🔍 searchActs called: query="${query || ""}", jurisdiction="${options?.jurisdiction || "all"}", limit=${limit}, offset=${offset}`);

    // 1. Try external IndiaCode API if configured and accessible
    if (!IndiaCodeService.externalApiDisabled) {
      try {
        const params = new URLSearchParams();
        if (query) params.append("q", query);
        if (options?.jurisdiction) params.append("jurisdiction", options.jurisdiction);
        if (options?.ministry) params.append("ministry", options.ministry);
        if (options?.year) params.append("year", String(options.year));
        params.append("limit", String(limit));
        params.append("offset", String(offset));

        const url = `${INDIA_CODE_BASE_URL}/acts?${params.toString()}`;
        console.log(`[IndiaCodeService] 🌐 Probing external IndiaCode API: ${url}`);
        const response = await fetch(url, { signal: AbortSignal.timeout(1200) });
        if (response.ok) {
          const data = (await response.json()) as {
            acts?: Array<Record<string, unknown>>;
            total?: number;
            next?: string | null;
          };
          const rawActs = data.acts || [];
          const externalActs: IIndiaCodeSearchResult[] = rawActs.map((a) => {
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

          if (externalActs.length > 0) {
            console.log(`[IndiaCodeService] ✅ External API responded with ${externalActs.length} enactments.`);
            return {
              total: typeof data.total === "number" ? data.total : externalActs.length,
              count: externalActs.length,
              limit,
              offset,
              next: data.next || null,
              acts: externalActs,
            };
          }
        } else {
          console.log(`[IndiaCodeService] ℹ️ External API returned HTTP ${response.status} (${response.statusText}). Gracefully falling back to PostgreSQL + Live Central Acts Directory.`);
          if (response.status === 410 || response.status === 404) {
            IndiaCodeService.externalApiDisabled = true;
          }
        }
      } catch (err: unknown) {
        console.log(`[IndiaCodeService] ℹ️ External API unreachable (${(err as Error)?.message || err}). Falling back to PostgreSQL + Live Central Acts Directory.`);
        IndiaCodeService.externalApiDisabled = true;
      }
    }

    // 2. Query Database 'bare_acts' table
    const conditions = [];

    if (cleanQuery) {
      conditions.push(
        or(
          ilike(bareActs.title, `%${cleanQuery}%`),
          ilike(bareActs.slug, `%${cleanQuery}%`),
          ilike(bareActs.shortCode, `%${cleanQuery}%`),
          ilike(bareActs.description, `%${cleanQuery}%`),
          ilike(bareActs.actNumber, `%${cleanQuery}%`)
        )
      );
    }

    if (options?.jurisdiction) {
      const targetJur = options.jurisdiction.toLowerCase().trim();
      if (targetJur === "central") {
        conditions.push(eq(bareActs.jurisdiction, "central"));
      } else if (targetJur === "state") {
        conditions.push(eq(bareActs.jurisdiction, "state"));
      } else {
        conditions.push(
          or(
            eq(bareActs.jurisdiction, "state"),
            ilike(bareActs.stateJurisdiction, `%${targetJur}%`)
          )
        );
      }
    }

    if (options?.year) {
      conditions.push(eq(bareActs.actYear, options.year));
    }

    if (options?.ministry) {
      conditions.push(ilike(bareActs.ministry, `%${options.ministry.trim()}%`));
    }

    const whereClause = conditions.length > 0 ? and(...conditions) : undefined;

    const dbActs = await db
      .select()
      .from(bareActs)
      .where(whereClause)
      .orderBy(bareActs.title);

    // 3. Query Live Central Acts Directory (848+ Central Acts)
    const liveCentralActs = await this.fetchLiveCentralActs();
    let matchingLiveActs: IIndiaCodeSearchResult[] = [];

    if (options?.jurisdiction !== "state") {
      const terms = cleanQuery ? cleanQuery.split(/\s+/).filter(Boolean) : [];
      const mappedSlug =
        IndiaCodeService.SLUG_ALIASES[cleanQuery] ||
        IndiaCodeService.SLUG_ALIASES[cleanQuery.replace(/\s+/g, "-")] ||
        IndiaCodeService.SLUG_ALIASES[cleanQuery.replace(/\s+act.*$/i, "")] ||
        IndiaCodeService.SLUG_ALIASES[cleanQuery.replace(/\s+act.*$/i, "").replace(/\s+/g, "-")];

      const filteredLive = liveCentralActs.filter((a) => {
        if (options?.year && a.act_year !== options.year) return false;
        if (options?.ministry && !a.ministry?.toLowerCase().includes(options.ministry.toLowerCase())) return false;
        if (mappedSlug && (a.slug.toLowerCase() === mappedSlug.toLowerCase() || a.id.toLowerCase() === mappedSlug.toLowerCase())) {
          return true;
        }
        if (terms.length > 0) {
          const searchSpace = `${a.title} ${a.slug} ${a.act_number || ""} ${a.ministry || ""} ${(a.aliases || []).join(" ")}`.toLowerCase();
          return terms.every((t) => searchSpace.includes(t));
        }
        return true;
      });

      matchingLiveActs = filteredLive.map((a) => ({
        id: a.slug,
        slug: a.slug,
        short_title: a.title,
        title: a.title,
        act_number: a.act_number,
        actNumber: a.act_number,
        act_year: a.act_year,
        actYear: a.act_year,
        section_count: a.section_count || 0,
        totalSections: a.section_count || 0,
        jurisdiction: "Central",
        ministry: a.ministry,
        url: `https://legislations.in${a.href}`,
      }));
    }

    // 4. Merge results (DB acts take precedence, live central acts augment)
    const actMap = new Map<string, IIndiaCodeSearchResult>();
    for (const d of dbActs) {
      actMap.set(d.slug.toLowerCase(), {
        id: d.slug,
        slug: d.slug,
        short_title: d.title,
        title: d.title,
        act_number: d.actNumber || undefined,
        actNumber: d.actNumber || undefined,
        act_year: d.actYear || undefined,
        actYear: d.actYear || undefined,
        section_count: d.totalSections || 0,
        totalSections: d.totalSections || 0,
        jurisdiction: d.jurisdiction === "state" ? (d.stateJurisdiction || "State") : "Central",
        ministry: d.ministry || undefined,
        url: "",
      });
    }

    const isLiveActAlreadyInMap = (laSlug: string, laTitle: string): boolean => {
      const cleanKey = laSlug.toLowerCase();
      if (actMap.has(cleanKey)) return true;
      const mapped = IndiaCodeService.SLUG_ALIASES[cleanKey];
      if (mapped && actMap.has(mapped.toLowerCase())) return true;
      for (const [alias, canonical] of Object.entries(IndiaCodeService.SLUG_ALIASES)) {
        if (canonical.toLowerCase() === cleanKey && actMap.has(alias.toLowerCase())) return true;
        if (alias.toLowerCase() === cleanKey && actMap.has(canonical.toLowerCase())) return true;
      }
      const normTitle = (laTitle || "").toLowerCase().replace(/[^a-z0-9]/g, "");
      for (const existing of actMap.values()) {
        const existingNorm = (existing.title || "").toLowerCase().replace(/[^a-z0-9]/g, "");
        if (normTitle && existingNorm === normTitle) return true;
      }
      return false;
    };

    for (const la of matchingLiveActs) {
      const key = (la.slug || la.id || "").toLowerCase();
      if (key && !isLiveActAlreadyInMap(key, la.title || "")) {
        actMap.set(key, la);
      }
    }

    // Relevance-based sorting: exact or primary matches first
    const allActs = Array.from(actMap.values()).sort((a, b) => {
      if (!cleanQuery) return 0;
      const aTitle = (a.title || "").toLowerCase();
      const bTitle = (b.title || "").toLowerCase();
      const aSlug = (a.slug || "").toLowerCase();
      const bSlug = (b.slug || "").toLowerCase();

      const aExact = aTitle === cleanQuery || aSlug === cleanQuery;
      const bExact = bTitle === cleanQuery || bSlug === cleanQuery;
      if (aExact && !bExact) return -1;
      if (!aExact && bExact) return 1;

      const aStarts = aTitle.startsWith(cleanQuery) || aSlug.startsWith(cleanQuery);
      const bStarts = bTitle.startsWith(cleanQuery) || bSlug.startsWith(cleanQuery);
      if (aStarts && !bStarts) return -1;
      if (!aStarts && bStarts) return 1;

      const aIncludes = aTitle.includes(cleanQuery);
      const bIncludes = bTitle.includes(cleanQuery);
      if (aIncludes && !bIncludes) return -1;
      if (!aIncludes && bIncludes) return 1;

      return 0;
    });

    const total = allActs.length;
    const paginated = allActs.slice(offset, offset + limit);

    console.log(`[IndiaCodeService] 📊 searchActs completed: ${dbActs.length} from DB, ${matchingLiveActs.length} live matches. Returning ${paginated.length} of ${total} total acts.`);

    return {
      total,
      count: paginated.length,
      limit,
      offset,
      next: offset + limit < total ? String(offset + limit) : null,
      acts: paginated,
    };
  }

  /**
   * Universal Provision Search across Acts
   * Searches sections, articles, orders, rules dynamically from Database
   */
  async searchProvisions(
    query: string,
    options?: {
      limit?: number;
      offset?: number;
      kind?: string;
    }
  ): Promise<{
    total: number;
    count: number;
    limit: number;
    offset: number;
    next: string | null;
    results: IIndiaCodeSearchProvisionHit[];
  }> {
    const cleanQuery = (query || "").trim();
    if (!cleanQuery) {
      return { total: 0, count: 0, limit: 15, offset: 0, next: null, results: [] };
    }

    const limit = Math.min(50, Math.max(1, Number(options?.limit) || 15));
    const offset = Math.max(0, Number(options?.offset) || 0);

    // 1. Try external API
    try {
      const params = new URLSearchParams({
        q: cleanQuery,
        limit: String(limit),
        offset: String(offset),
        kind: options?.kind || "section,rule,act",
      });
      const url = `${INDIA_CODE_BASE_URL}/search?${params.toString()}`;
      const response = await fetch(url, { signal: AbortSignal.timeout(3000) });
      if (response.ok) {
        const data = (await response.json()) as {
          total: number;
          count: number;
          limit: number;
          offset: number;
          next: string | null;
          results: IIndiaCodeSearchProvisionHit[];
        };
        return {
          total: Number(data.total) || 0,
          count: data.results?.length || 0,
          limit,
          offset,
          next: data.next || null,
          results: data.results || [],
        };
      }
    } catch {
      // Fall through to database
    }

    // 2. Dynamic Database Search from 'bare_act_sections'
    const matchingDbSections = await db.query.bareActSections.findMany({
      where: or(
        ilike(bareActSections.title, `%${cleanQuery}%`),
        ilike(bareActSections.content, `%${cleanQuery}%`),
        ilike(bareActSections.sectionNumber, `%${cleanQuery}%`)
      ),
      limit,
      offset,
      with: {
        act: true,
      },
    });

    const results: IIndiaCodeSearchProvisionHit[] = matchingDbSections.map((sec) => ({
      kind: "section",
      ref: `${sec.act?.slug || "act"}/${sec.sectionNumber}`,
      title: `${sec.sectionNumber}: ${sec.title}`,
      act: sec.act?.title || "Statutory Act",
      snippet: sec.content.slice(0, 160) + (sec.content.length > 160 ? "..." : ""),
      url: "",
    }));

    return {
      total: results.length,
      count: results.length,
      limit,
      offset,
      next: null,
      results,
    };
  }

  /**
   * Get Code of Civil Procedure (CPC) Order overview and list of Rules
   */
  async getCPCOrder(order: string | number): Promise<{
    order?: string;
    order_arabic?: number;
    title?: string;
    rules?: Array<{ rule: string; heading: string; words?: number; url?: string }>;
  } | null> {
    const cleanOrd = String(order).trim().toLowerCase();
    const url = `${INDIA_CODE_BASE_URL}/cpc/order/${encodeURIComponent(cleanOrd)}`;
    try {
      const response = await fetch(url, { signal: AbortSignal.timeout(3000) });
      if (!response.ok) return null;
      return (await response.json()) as {
        order?: string;
        order_arabic?: number;
        title?: string;
        rules?: Array<{ rule: string; heading: string; words?: number; url?: string }>;
      };
    } catch {
      return null;
    }
  }

  /**
   * Auto-persist an externally fetched Act and its provisions into PostgreSQL
   * so subsequent reads are served entirely from the local Database.
   */
  public async autoPersistActToDatabase(liveAct: ILiveParsedAct): Promise<void> {
    const { overview, sections } = liveAct;
    const act = overview.act;
    if (!act || !act.id) return;

    console.log(`[IndiaCodeService] 💾 Auto-persisting enactment '${act.short_title}' (${act.id}) with ${sections.length} sections into PostgreSQL...`);

    try {
      const existing = await db.query.bareActs.findFirst({
        where: eq(bareActs.slug, act.id),
      });

      let actId = existing?.id;
      if (!existing) {
        const category = this.deduceCategory(act.short_title, act.long_title);
        const shortCode = this.deriveShortCode(act.short_title, act.id);
        const [inserted] = await db
          .insert(bareActs)
          .values({
            title: act.short_title,
            shortCode,
            slug: act.id,
            longTitle: act.long_title || act.short_title,
            actNumber: act.act_number || null,
            actYear: act.act_year || new Date().getFullYear(),
            category,
            jurisdiction: act.jurisdiction === "state" ? "state" : "central",
            ministry: act.ministry || null,
            status: "active",
            source: "system_seed",
            isFeatured: false,
            totalSections: sections.length || act.section_count || 0,
            totalChapters: 0,
            description: act.long_title || `Enactment: ${act.short_title}`,
            keywords: [act.short_title.toLowerCase(), act.id, shortCode.toLowerCase()],
          })
          .returning();
        actId = inserted.id;
      }

      if (!actId || sections.length === 0) return;

      const existingSecs = await db
        .select({ sectionNumber: bareActSections.sectionNumber })
        .from(bareActSections)
        .where(eq(bareActSections.actId, actId));

      const existingSet = new Set(existingSecs.map((s) => s.sectionNumber.toLowerCase().trim()));
      const newSecRecords: (typeof bareActSections.$inferInsert)[] = [];

      for (let i = 0; i < sections.length; i++) {
        const sec = sections[i];
        const secNumberStr = String(sec.number).trim();
        if (existingSet.has(secNumberStr.toLowerCase())) continue;

        const secNumeric = this.parseNumeric(secNumberStr);
        const secSlug = `${act.id}-section-${secNumberStr.toLowerCase()}`;

        newSecRecords.push({
          actId,
          sectionType: act.unit === "article" ? "article" : "section",
          sectionNumber: secNumberStr,
          sectionNumeric: secNumeric,
          title: sec.heading || `Section ${secNumberStr}`,
          slug: secSlug,
          content: sec.text || sec.heading || `Section ${secNumberStr} of ${act.short_title}`,
          bailableStatus: "not_applicable",
          cognizableStatus: "not_applicable",
          compoundableStatus: "not_applicable",
          orderIndex: i + 1,
          keywords: [secNumberStr.toLowerCase(), (sec.heading || "").toLowerCase(), act.id],
        });
      }

      if (newSecRecords.length > 0) {
        for (let i = 0; i < newSecRecords.length; i += 50) {
          const chunk = newSecRecords.slice(i, i + 50);
          await db.insert(bareActSections).values(chunk).onConflictDoNothing();
        }
      }
      console.log(`[IndiaCodeService] ✅ Successfully auto-persisted '${act.short_title}' to PostgreSQL (${newSecRecords.length} new provisions saved).`);
    } catch (err) {
      console.warn(`[IndiaCodeService] ⚠️ Auto-persist error for '${act.id}':`, err);
    }
  }

  /**
   * Get an Act's overview, all section headings, and schedules dynamically from Database
   */
  async getActOverview(actSlug: string): Promise<IIndiaCodeActOverview> {
    if (!actSlug || typeof actSlug !== "string") {
      throw new AppError("A valid actSlug is required", 400);
    }
    let cleanSlug = actSlug.toLowerCase().trim();
    if (IndiaCodeService.SLUG_ALIASES[cleanSlug]) {
      cleanSlug = IndiaCodeService.SLUG_ALIASES[cleanSlug];
    }

    console.log(`[IndiaCodeService] 📖 getActOverview requested for: "${actSlug}" (resolved: "${cleanSlug}")`);

    // 1. Try external IndiaCode API (with short timeout)
    try {
      const url = `${INDIA_CODE_BASE_URL}/acts/${cleanSlug}`;
      const response = await fetch(url, { signal: AbortSignal.timeout(3000) });
      if (response.ok) {
        console.log(`[IndiaCodeService] ✅ External API returned overview for '${cleanSlug}'.`);
        return (await response.json()) as IIndiaCodeActOverview;
      } else {
        console.log(`[IndiaCodeService] ℹ️ External API returned HTTP ${response.status} (${response.statusText}). Checking PostgreSQL database...`);
      }
    } catch {
      // External API unavailable / withdrawn -> proceed to database query
    }

    // 2. Query Database for this act and its provisions
    const isUuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(cleanSlug);
    const dbAct = await db.query.bareActs.findFirst({
      where: isUuid ? eq(bareActs.id, cleanSlug) : eq(bareActs.slug, cleanSlug),
      with: {
        sections: {
          orderBy: (sec, { asc }) => [asc(sec.orderIndex), asc(sec.sectionNumeric)],
        },
        schedules: {
          orderBy: (sch, { asc }) => [asc(sch.orderIndex)],
        },
      },
    });

    if (dbAct) {
      const sections = dbAct.sections || [];
      const schedules = dbAct.schedules || [];
      console.log(`[IndiaCodeService] 💾 Found '${dbAct.title}' in PostgreSQL database with ${sections.length} sections and ${schedules.length} schedules. Serving directly from DB.`);
      return {
        act: {
          id: dbAct.slug,
          short_title: dbAct.title,
          long_title: dbAct.longTitle || dbAct.description || dbAct.title,
          act_number: dbAct.actNumber || undefined,
          act_year: dbAct.actYear || undefined,
          enact_date: dbAct.enactmentDate || undefined,
          enforcement_date: dbAct.enforcementDate || undefined,
          ministry: dbAct.ministry || undefined,
          jurisdiction: dbAct.jurisdiction === "state" ? (dbAct.stateJurisdiction || "State") : "Central",
          section_count: dbAct.totalSections || sections.length,
          in_force: dbAct.status === "active",
          unit: sections[0]?.sectionType === "article" ? "article" : "section",
        },
        count: sections.length,
        sections: sections.map((s) => ({
          number: s.sectionNumber.replace(/^(Section|Article|Order|Rule)\s+/i, ""),
          heading: s.title || `Section ${s.sectionNumber}`,
          words: s.content ? s.content.split(/\s+/).length : undefined,
          indexable: true,
        })),
        schedules: schedules.map((sch) => ({
          ord: sch.orderIndex,
          title: sch.title || sch.scheduleNumber,
        })),
        amendments: [],
      };
    }

    // 3. Fallback to live statutory repository
    console.log(`[IndiaCodeService] 🏛️ Act '${cleanSlug}' not yet in database. Querying live parliamentary repository...`);
    const liveAct = await this.fetchLiveActDetails(cleanSlug);
    if (liveAct) {
      console.log(`[IndiaCodeService] 📥 Live enactment fetched: '${liveAct.overview.act.short_title}' (${liveAct.sections.length} sections). Auto-persisting to database...`);
      // Auto-persist into Database so subsequent reads are served directly from DB!
      this.autoPersistActToDatabase(liveAct).catch((err) => {
        console.warn(`[IndiaCodeService] ⚠️ Auto-persist failed for '${cleanSlug}':`, err);
      });
      return liveAct.overview;
    }

    throw new AppError(`Act '${actSlug}' not found in database or live statutory directory.`, 404);
  }

  /**
   * Get a single provision (section/article) with complete statutory text, classification, and judgments from Database
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
    console.log(`[IndiaCodeService] 📄 getSection requested: Act="${actSlug}", Provision="${cleanNumber}"`);

    // 1. Try external IndiaCode API (with short timeout)
    try {
      let url = `${INDIA_CODE_BASE_URL}/${cleanSlug}/section/${encodeURIComponent(cleanNumber)}`;
      if (cleanSlug === "cpc" && /order/i.test(cleanNumber)) {
        const orderRuleMatch = cleanNumber.match(/order[-_\s/]*(\d+|[a-z]+)(?:[-_\s/]*rule[-_\s/]*(\d+))?/i);
        if (orderRuleMatch) {
          const ord = orderRuleMatch[1];
          const rl = orderRuleMatch[2];
          url = rl
            ? `${INDIA_CODE_BASE_URL}/cpc/order/${ord}/rule/${rl}`
            : `${INDIA_CODE_BASE_URL}/cpc/order/${ord}`;
        }
      }

      const response = await fetch(url, { redirect: "follow", signal: AbortSignal.timeout(3000) });
      if (response.ok) {
        const rawData = (await response.json()) as IRawIndiaCodeSectionResponse;
        if (rawData.order && (rawData.heading || rawData.rules)) {
          const ruleText =
            rawData.text ||
            rawData.html ||
            (Array.isArray(rawData.rules)
              ? rawData.rules.map((r) => `${r.rule}. ${r.heading}`).join("\n\n")
              : "");
          return {
            act: {
              id: "cpc",
              short_title: (rawData.act_title as string) || "The Code of Civil Procedure, 1908",
              act_year: 1908,
              unit: "rule",
            },
            section: {
              number: rawData.rule
                ? `Order ${rawData.order_arabic || rawData.order} Rule ${rawData.rule}`
                : `Order ${rawData.order_arabic || rawData.order}`,
              heading: (rawData.heading || rawData.title || `Order ${rawData.order_arabic || rawData.order}`) as string,
              text: ruleText,
            },
            classification: [],
            judgments: [],
          };
        }
        return rawData as unknown as IIndiaCodeSectionDetail;
      }
    } catch {
      // Fall through to database
    }

    // 2. Query Database for the act and section
    const isUuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(cleanSlug);
    const dbAct = await db.query.bareActs.findFirst({
      where: isUuid ? eq(bareActs.id, cleanSlug) : eq(bareActs.slug, cleanSlug),
    });

    if (dbAct) {
      const pureNum = cleanNumber.replace(/^(section|article|order|rule)\s+/i, "").trim();
      const secRecord = await db.query.bareActSections.findFirst({
        where: and(
          eq(bareActSections.actId, dbAct.id),
          or(
            eq(bareActSections.sectionNumber, cleanNumber),
            eq(bareActSections.sectionNumber, `Section ${pureNum}`),
            eq(bareActSections.sectionNumber, `Article ${pureNum}`),
            eq(bareActSections.sectionNumber, pureNum),
            eq(bareActSections.slug, `${dbAct.slug}-section-${pureNum.toLowerCase()}`),
            eq(bareActSections.slug, cleanNumber.toLowerCase())
          )
        ),
      });

      if (secRecord) {
        console.log(`[IndiaCodeService] 💾 Served Section ${cleanNumber} of '${dbAct.title}' directly from PostgreSQL database.`);
        return {
          act: {
            id: dbAct.slug,
            short_title: dbAct.title,
            act_year: dbAct.actYear,
            unit: secRecord.sectionType || "section",
          },
          section: {
            number: secRecord.sectionNumber.replace(/^(Section|Article|Order|Rule)\s+/i, ""),
            heading: secRecord.title,
            text: secRecord.content,
          },
          classification:
            secRecord.punishment || secRecord.bailableStatus !== "not_applicable"
              ? [
                  {
                    punishment: secRecord.punishment || undefined,
                    bailable: secRecord.bailableStatus,
                    cognizable: secRecord.cognizableStatus,
                    triable_by: secRecord.triableBy || undefined,
                  },
                ]
              : [],
          judgments: (((secRecord.crossReferences as Record<string, unknown> | null)?.landmarkJudgments || []) as Array<{
            title: string;
            citation: string;
            summary?: string;
          }>).map((j) => ({
            title: j.title,
            citation: j.citation,
            ratio_decidendi: j.summary,
          })),
        };
      }
    }

    // 3. Fallback to live statutory repository
    console.log(`[IndiaCodeService] 🏛️ Section '${cleanNumber}' not in DB. Querying live statutory repository for '${cleanSlug}'...`);
    const liveAct = await this.fetchLiveActDetails(cleanSlug);
    if (liveAct) {
      // Auto-persist into Database so subsequent reads are served directly from DB!
      this.autoPersistActToDatabase(liveAct).catch((err) => {
        console.warn(`[IndiaCodeService] ⚠️ Auto-persist failed for '${cleanSlug}':`, err);
      });

      const pureNum = cleanNumber.replace(/^(section|article|order|rule)\s+/i, "").trim().toLowerCase();
      const sec = liveAct.sections.find(
        (s) =>
          s.number.toLowerCase() === pureNum ||
          s.number.toLowerCase() === cleanNumber.toLowerCase() ||
          s.number.replace(/\D/g, "") === pureNum.replace(/\D/g, "")
      );

      if (sec) {
        console.log(`[IndiaCodeService] 📥 Served Section ${sec.number} of '${liveAct.overview.act.short_title}' from live statutory repository.`);
        return {
          act: {
            id: liveAct.overview.act.id,
            short_title: liveAct.overview.act.short_title,
            act_year: liveAct.overview.act.act_year,
            unit: "section",
          },
          section: {
            number: sec.number,
            heading: sec.heading,
            text: sec.text,
          },
          classification: [],
          judgments: [],
        };
      }
    }

    throw new AppError(`Section '${sectionNumber}' of Act '${actSlug}' not found.`, 404);
  }

  /**
   * Helper to derive a clean shortCode from title / slug
   */
  public deriveShortCode(title: string, slug: string): string {
    const cleanTitle = title.replace(/^the\s+/i, "").replace(/,\s*\d{4}.*$/, "").trim();
    const words = cleanTitle.split(/\s+/).filter(Boolean);
    if (words.length === 1) return words[0].toUpperCase().slice(0, 10);
    const acronym = words.map((w) => w[0]).join("").toUpperCase();
    return acronym.slice(0, 15);
  }

  /**
   * Helper to deduce category enum from title and description
   */
  public deduceCategory(
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

    // Check if we have pre-parsed sections from live repository
    const cachedLive = IndiaCodeService.parsedActDetailsCache.get(act.id.toLowerCase());
    const liveSectionsMap = new Map<string, string>();
    if (cachedLive?.data?.sections) {
      for (const s of cachedLive.data.sections) {
        liveSectionsMap.set(s.number.toLowerCase(), s.text);
      }
    }

    const newOutlineRecords: (typeof bareActSections.$inferInsert)[] = [];
    for (let idx = 0; idx < sections.length; idx++) {
      const sec = sections[idx];
      const secNumberStr = `${act.unit === "article" ? "Article" : "Section"} ${sec.number}`;
      if (!existingSectionSet.has(secNumberStr.toLowerCase().trim())) {
        const secSlug = `${act.id}-section-${sec.number.toLowerCase()}`;
        const secNumeric = this.parseNumeric(sec.number);
        const fullContent =
          liveSectionsMap.get(sec.number.toLowerCase()) ||
          sec.heading ||
          `${secNumberStr} of ${act.short_title}.`;
        newOutlineRecords.push({
          actId,
          sectionType: act.unit === "article" ? "article" : "section",
          sectionNumber: secNumberStr,
          sectionNumeric: secNumeric,
          title: sec.heading || `Provision ${sec.number}`,
          slug: secSlug,
          content: fullContent,
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
    let cleanSlug = actSlug.toLowerCase().trim();
    if (IndiaCodeService.SLUG_ALIASES[cleanSlug]) {
      cleanSlug = IndiaCodeService.SLUG_ALIASES[cleanSlug];
    }
    const cleanNumber = sectionNumber
      .replace(new RegExp(`^${cleanSlug}[-_]section[-_]`, "i"), "")
      .replace(new RegExp(`^${cleanSlug}[-_]`, "i"), "")
      .replace(/^(section|article)[-_\s]+/i, "")
      .trim();

    // 1. Fetch from IndiaCode
    const detail = await this.getSection(cleanSlug, cleanNumber);
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

    const isOrderRule = act.unit === "rule" || /^order/i.test(section.number);
    const secNumberStr = isOrderRule
      ? (section.number.startsWith("Order") ? section.number : `Order ${section.number}`)
      : `${act.unit === "article" ? "Article" : "Section"} ${section.number}`;
    const secSlug = slugify(`${act.id}-${section.number}`, { lower: true, strict: true });
    const parsedClass = this.parseClassification(classification);
    const secNumeric = this.parseNumeric(section.number);

    // Check if section already exists in DB
    const existing = await db.query.bareActSections.findFirst({
      where: and(
        eq(bareActSections.actId, actRecord.id),
        or(
          eq(bareActSections.slug, secSlug),
          eq(bareActSections.sectionNumber, secNumberStr)
        )
      ),
    });
    if (existing) {
      return existing;
    }

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
        sectionType: isOrderRule ? "order_rule" : (act.unit === "article" ? "article" : "section"),
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
        orderIndex: Math.floor(secNumeric) || 1,
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
