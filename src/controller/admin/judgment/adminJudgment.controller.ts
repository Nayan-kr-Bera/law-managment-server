import { type NextFunction, type Request, type Response } from "express";
import db from "../../../db/index.js";
import { courtJudgments } from "../../../db/schema/index.js";
import { and, desc, eq, ilike, or, sql } from "drizzle-orm";
import ResponseHandler from "../../../utils/responseHandler.js";
import CustomErrorHandler from "../../../utils/customErrorHandler.js";

export const adminJudgmentController = {
  /**
   * 1. List judgments with search, court filters & pagination
   * GET /api/admin/judgments
   */
  async getJudgments(req: Request, res: Response, next: NextFunction) {
    try {
      const {
        q,
        courtLevel,
        year,
        isFeatured,
        page = "1",
        limit = "20",
      } = req.query as Record<string, string | undefined>;

      const pageNum = Math.max(1, parseInt(page, 10) || 1);
      const limitNum = Math.min(100, Math.max(1, parseInt(limit, 10) || 20));
      const offset = (pageNum - 1) * limitNum;

      const conditions = [];

      if (q && q.trim()) {
        const queryPattern = `%${q.trim()}%`;
        conditions.push(
          or(
            ilike(courtJudgments.title, queryPattern),
            ilike(courtJudgments.citation, queryPattern),
            ilike(courtJudgments.actSection, queryPattern),
            ilike(courtJudgments.court, queryPattern),
            ilike(courtJudgments.summary, queryPattern)
          )
        );
      }

      if (courtLevel && courtLevel !== "all") {
        conditions.push(eq(courtJudgments.courtLevel, courtLevel));
      }

      if (year) {
        conditions.push(eq(courtJudgments.year, parseInt(year, 10)));
      }

      if (isFeatured !== undefined) {
        conditions.push(eq(courtJudgments.isFeatured, isFeatured === "true"));
      }

      const whereClause = conditions.length > 0 ? and(...conditions) : undefined;

      const [judgmentsList, totalCountResult] = await Promise.all([
        db
          .select()
          .from(courtJudgments)
          .where(whereClause)
          .orderBy(desc(courtJudgments.year), desc(courtJudgments.createdAt))
          .limit(limitNum)
          .offset(offset),
        db
          .select({ count: sql<number>`count(*)::int` })
          .from(courtJudgments)
          .where(whereClause),
      ]);

      const total = totalCountResult[0]?.count || 0;

      return res.status(200).json(
        ResponseHandler(200, "Judgments retrieved successfully", {
          data: judgmentsList,
          pagination: {
            page: pageNum,
            limit: limitNum,
            total,
            totalPages: Math.ceil(total / limitNum),
          },
        })
      );
    } catch (err) {
      console.error("[adminJudgmentController.getJudgments] Error:", err);
      return next(err);
    }
  },

  /**
   * 2. Create / Upload a new judgment
   * POST /api/admin/judgments
   */
  async createJudgment(req: Request, res: Response, next: NextFunction) {
    try {
      const {
        title,
        citation,
        court,
        courtLevel = "supreme_court",
        date,
        year,
        bench,
        petitioner,
        respondent,
        actSection,
        ratioDecidendi,
        summary,
        fullText,
        cnr,
        url,
        isFeatured = false,
      } = req.body;

      if (!title || !court) {
        return next(CustomErrorHandler.badRequest("Title and Court are required."));
      }

      const adminUserId = req.adminUser?.userId || req.user?.userId;

      const [newJudgment] = await db
        .insert(courtJudgments)
        .values({
          title,
          citation: citation || null,
          court,
          courtLevel,
          date: date || null,
          year: year ? parseInt(year, 10) : null,
          bench: bench || null,
          petitioner: petitioner || null,
          respondent: respondent || null,
          actSection: actSection || null,
          ratioDecidendi: ratioDecidendi || null,
          summary: summary || null,
          fullText: fullText || null,
          cnr: cnr || null,
          url: url || null,
          isFeatured: Boolean(isFeatured),
          uploadedByAdminId: adminUserId || null,
        })
        .returning();

      return res
        .status(201)
        .json(ResponseHandler(201, "Judgment added to central legal library", newJudgment));
    } catch (err) {
      console.error("[adminJudgmentController.createJudgment] Error:", err);
      return next(err);
    }
  },

  /**
   * 3. Update an existing judgment
   * PUT /api/admin/judgments/:id
   */
  async updateJudgment(req: Request, res: Response, next: NextFunction) {
    try {
      const { id } = req.params;
      if (!id) {
        return next(CustomErrorHandler.badRequest("Judgment ID is required"));
      }

      const existing = await db.query.courtJudgments.findFirst({
        where: eq(courtJudgments.id, id),
      });

      if (!existing) {
        return next(CustomErrorHandler.notFound("Judgment not found"));
      }

      const {
        title,
        citation,
        court,
        courtLevel,
        date,
        year,
        bench,
        petitioner,
        respondent,
        actSection,
        ratioDecidendi,
        summary,
        fullText,
        cnr,
        url,
        isFeatured,
      } = req.body;

      const [updated] = await db
        .update(courtJudgments)
        .set({
          ...(title !== undefined && { title }),
          ...(citation !== undefined && { citation }),
          ...(court !== undefined && { court }),
          ...(courtLevel !== undefined && { courtLevel }),
          ...(date !== undefined && { date }),
          ...(year !== undefined && { year: year ? parseInt(year, 10) : null }),
          ...(bench !== undefined && { bench }),
          ...(petitioner !== undefined && { petitioner }),
          ...(respondent !== undefined && { respondent }),
          ...(actSection !== undefined && { actSection }),
          ...(ratioDecidendi !== undefined && { ratioDecidendi }),
          ...(summary !== undefined && { summary }),
          ...(fullText !== undefined && { fullText }),
          ...(cnr !== undefined && { cnr }),
          ...(url !== undefined && { url }),
          ...(isFeatured !== undefined && { isFeatured: Boolean(isFeatured) }),
        })
        .where(eq(courtJudgments.id, id))
        .returning();

      return res
        .status(200)
        .json(ResponseHandler(200, "Judgment updated successfully", updated));
    } catch (err) {
      console.error("[adminJudgmentController.updateJudgment] Error:", err);
      return next(err);
    }
  },

  /**
   * 4. Delete judgment
   * DELETE /api/admin/judgments/:id
   */
  async deleteJudgment(req: Request, res: Response, next: NextFunction) {
    try {
      const { id } = req.params;
      if (!id) {
        return next(CustomErrorHandler.badRequest("Judgment ID is required"));
      }

      const [deleted] = await db
        .delete(courtJudgments)
        .where(eq(courtJudgments.id, id))
        .returning();

      if (!deleted) {
        return next(CustomErrorHandler.notFound("Judgment not found"));
      }

      return res
        .status(200)
        .json(ResponseHandler(200, "Judgment deleted from central library", { id }));
    } catch (err) {
      console.error("[adminJudgmentController.deleteJudgment] Error:", err);
      return next(err);
    }
  },

  /**
   * 5. Seed Core Landmark Judgments dynamically from live eCourts / IndiaCode API
   * (Zero hardcoded data: calls the live eCourts API across major key legal acts)
   * POST /api/admin/judgments/seed-landmark
   */
  async seedLandmarkJudgments(req: Request, res: Response, next: NextFunction) {
    try {
      const defaultActs = [
        "the-constitution-of-india",
        "the-indian-penal-code",
        "the-code-of-criminal-procedure-1973",
        "the-code-of-civil-procedure-1908",
        "the-indian-evidence-act-1872",
        "the-negotiable-instruments-act-1881",
        "the-arbitration-and-conciliation-act-1996",
      ];

      const actsToFetch: string[] = Array.isArray(req.body?.acts) && req.body.acts.length > 0
        ? req.body.acts
        : defaultActs;

      let totalFetched = 0;
      let insertedCount = 0;
      const actResults: { act: string; fetched: number; inserted: number }[] = [];

      for (const actSlug of actsToFetch) {
        try {
          const targetUrl = `https://indiacode.ecourtsindia.com/api/v1/judgments?act=${encodeURIComponent(actSlug)}`;
          const resp = await fetch(targetUrl, { redirect: "follow" });
          if (!resp.ok) {
            console.warn(`[seedLandmarkJudgments] Failed to fetch for act ${actSlug}: status ${resp.status}`);
            continue;
          }

          const json = (await resp.json()) as { judgments?: Record<string, unknown>[] };
          const rawJudgments = Array.isArray(json.judgments) ? json.judgments : [];
          totalFetched += rawJudgments.length;

          let actInserted = 0;
          for (const raw of rawJudgments) {
            const parsed = parseEcourtsJudgmentItem(raw, actSlug);
            if (!parsed) continue;

            const existing = await db.query.courtJudgments.findFirst({
              where: parsed.cnr
                ? or(eq(courtJudgments.title, parsed.title), eq(courtJudgments.cnr, parsed.cnr))
                : eq(courtJudgments.title, parsed.title),
            });

            if (!existing) {
              await db.insert(courtJudgments).values({
                ...parsed,
                uploadedByAdminId: (req as Request & { user?: { id?: string } }).user?.id || null,
              });
              insertedCount++;
              actInserted++;
            }
          }

          actResults.push({ act: actSlug, fetched: rawJudgments.length, inserted: actInserted });
        } catch (actErr) {
          console.error(`[seedLandmarkJudgments] Error fetching ${actSlug}:`, actErr);
        }
      }

      return res.status(200).json(
        ResponseHandler(
          200,
          `Successfully seeded ${insertedCount} live judgments from eCourts API across ${actResults.length} acts (${totalFetched} total retrieved).`,
          {
            insertedCount,
            totalFetched,
            actResults,
          }
        )
      );
    } catch (err) {
      console.error("[adminJudgmentController.seedLandmarkJudgments] Error:", err);
      return next(err);
    }
  },

  /**
   * 6. Ingest from Live eCourts / IndiaCode Judgment API
   * POST /api/admin/judgments/import-ecourts
   */
  async importFromEcourts(req: Request, res: Response, next: NextFunction) {
    try {
      const { actSlug, sectionNumber } = req.body as { actSlug: string; sectionNumber?: string };

      if (!actSlug) {
        return next(CustomErrorHandler.badRequest("actSlug is required (e.g. 'the-indian-penal-code' or 'the-code-of-criminal-procedure-1973')"));
      }

      const cleanSection = (sectionNumber || "").replace(/[^0-9A-Za-z]/g, "").trim();
      const targetUrl = `https://indiacode.ecourtsindia.com/api/v1/judgments?act=${encodeURIComponent(actSlug)}${cleanSection ? `&section=${encodeURIComponent(cleanSection)}` : ""}`;

      const resp = await fetch(targetUrl, { redirect: "follow" });
      if (!resp.ok) {
        throw new Error(`eCourts judgment API returned status ${resp.status}`);
      }

      const json = (await resp.json()) as { judgments?: Record<string, unknown>[] };
      const rawJudgments = Array.isArray(json.judgments) ? json.judgments : [];

      let imported = 0;
      for (const j of rawJudgments) {
        const parsed = parseEcourtsJudgmentItem(j, actSlug, cleanSection);
        if (!parsed) continue;

        const existing = await db.query.courtJudgments.findFirst({
          where: parsed.cnr
            ? or(eq(courtJudgments.title, parsed.title), eq(courtJudgments.cnr, parsed.cnr))
            : eq(courtJudgments.title, parsed.title),
        });

        if (!existing) {
          await db.insert(courtJudgments).values({
            ...parsed,
            uploadedByAdminId: (req as Request & { user?: { id?: string } }).user?.id || null,
          });
          imported++;
        }
      }

      return res.status(200).json(
        ResponseHandler(200, `Successfully ingested ${imported} judgments from eCourts (${rawJudgments.length} retrieved from API)`, {
          importedCount: imported,
          totalApiCount: rawJudgments.length,
          apiUrl: targetUrl,
        })
      );
    } catch (err: unknown) {
      console.error("[adminJudgmentController.importFromEcourts] Error:", err);
      const msg = err instanceof Error ? err.message : "Failed to import from eCourts";
      return next(CustomErrorHandler.serverError(msg));
    }
  },
};

/**
 * Helper to clean and parse a raw judgment object from the eCourts / IndiaCode API
 */
function parseEcourtsJudgmentItem(
  j: Record<string, unknown>,
  actSlug: string,
  sectionNumber?: string
) {
  const title = (String(j.title || "")).trim();
  if (!title) return null;

  // Split parties if " v. " or " vs. " or " versus " is present
  let petitioner: string | null = null;
  let respondent: string | null = null;
  const vParts = title.split(/\s+(?:v\.|vs\.|v\/s|versus)\s+/i);
  if (vParts.length >= 2) {
    petitioner = vParts[0].trim();
    respondent = vParts.slice(1).join(" v. ").trim();
  } else {
    petitioner = title;
  }

  // Court name & court level
  const courtVal = j.court_name || (j.court === "SC" ? "Supreme Court of India" : j.court) || "Supreme Court of India";
  const rawCourt = String(courtVal).trim();
  const lowerCourt = rawCourt.toLowerCase();
  let courtLevel: "supreme_court" | "high_court" | "tribunal" = "supreme_court";
  if (lowerCourt.includes("high")) {
    courtLevel = "high_court";
  } else if (lowerCourt.includes("tribunal") || lowerCourt.includes("ngt") || lowerCourt.includes("cat")) {
    courtLevel = "tribunal";
  }

  // Date and Year
  const dateStr = j.date ? String(j.date).trim() : null;
  let year: number | null = null;
  if (dateStr && /^\d{4}/.test(dateStr)) {
    year = parseInt(dateStr.slice(0, 4), 10);
  } else if (j.citation) {
    const matchYear = String(j.citation).match(/\b(19\d\d|20\d\d)\b/);
    if (matchYear) year = parseInt(matchYear[1], 10);
  }

  // Bench extraction from citation e.g. "(Judge 1 & Judge 2 JJ.)"
  let bench: string | null = null;
  if (j.citation) {
    const benchMatch = String(j.citation).match(/\(([^)]+JJ?\.?)\)/i);
    if (benchMatch) {
      bench = benchMatch[1].trim();
    }
  }

  // Format Act name cleanly from slug (e.g. the-constitution-of-india -> Constitution of India)
  const formattedAct = actSlug
    .replace(/^the-/, "")
    .split("-")
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
    .join(" ");

  const actSection = j.applied_to_this_section
    ? `${formattedAct}, Section ${j.applied_to_this_section}`
    : sectionNumber
    ? `${formattedAct}, Section ${sectionNumber}`
    : formattedAct;

  const isFeatured = Boolean(
    j.court_marking === "reportable" ||
    (j.precedential_value && String(j.precedential_value).toLowerCase().includes("binding"))
  );

  const urlStr: string | null = j.url
    ? String(j.url).trim()
    : j.cnr
    ? `https://ecourtsindia.com/cnr/${j.cnr}`
    : null;

  // Extract or detect Neutral Citation vs Traditional Citation
  let neutralCitation: string | null = null;
  let equivalentCitations: string | null = null;

  if (j.neutral_citation) {
    neutralCitation = String(j.neutral_citation).trim();
  } else if (j.neutralCitation) {
    neutralCitation = String(j.neutralCitation).trim();
  }

  const rawCit = j.citation ? String(j.citation).trim() : "";
  const ncMatch = rawCit.match(/\b(\d{4}\s+(?:INSC|[A-Z]{2,5}HC|[A-Z]{3,4})\s+\d+)\b/i);
  if (ncMatch && !neutralCitation) {
    neutralCitation = ncMatch[1].toUpperCase();
  }

  if (j.equivalent_citations) {
    equivalentCitations = String(j.equivalent_citations).trim();
  } else if (rawCit && neutralCitation && rawCit !== neutralCitation) {
    equivalentCitations = rawCit;
  }

  // Bench strength estimation
  let benchStrength: number | null = null;
  if (bench) {
    const judges = bench.split(/,|&|and/i).filter((s) => s.trim().length > 0);
    benchStrength = judges.length > 0 ? judges.length : null;
  }

  // Standardize decision date YYYY-MM-DD if possible
  let decisionDate: string | null = null;
  if (dateStr) {
    const d = new Date(dateStr);
    if (!isNaN(d.getTime())) {
      decisionDate = d.toISOString().split("T")[0];
    }
  }

  return {
    title,
    citation: rawCit || neutralCitation || null,
    neutralCitation: neutralCitation || null,
    equivalentCitations: equivalentCitations || null,
    court: rawCourt,
    courtLevel,
    date: dateStr,
    decisionDate,
    year,
    bench,
    benchStrength,
    petitioner,
    respondent,
    actSection,
    ratioDecidendi: j.ratio_decidendi ? String(j.ratio_decidendi).trim() : null,
    summary: j.ratio_decidendi ? String(j.ratio_decidendi).trim() : (j.order ? String(j.order).trim() : null),
    fullText: j.order ? String(j.order).trim() : (j.ratio_decidendi ? String(j.ratio_decidendi).trim() : null),
    cnr: j.cnr ? String(j.cnr).trim() : null,
    url: urlStr,
    isFeatured,
  };
}

export default adminJudgmentController;
