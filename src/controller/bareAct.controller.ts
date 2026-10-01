import { NextFunction, Request, Response } from "express";
import bareActService from "../services/bareAct.service.js";
import { indiaCodeService } from "../services/indiaCode.service.js";
import ResponseHandler from "../utils/responseHandler.js";

export const bareActController = {
  // 1. List Bare Acts with filter/search
  async listActs(req: Request, res: Response, next: NextFunction) {
    try {
      const {
        q,
        category,
        jurisdiction,
        state,
        status,
        source,
        year,
        isFeatured,
        page,
        limit,
        sortBy,
        sortOrder,
      } = req.query;

      const result = await bareActService.listActs({
        q: q as string,
        category: category as string,
        jurisdiction: jurisdiction as string,
        state: state as string,
        status: status as string,
        source: source as string,
        year: year ? Number(year) : undefined,
        isFeatured: isFeatured !== undefined ? isFeatured === "true" : undefined,
        page: page ? Number(page) : undefined,
        limit: limit ? Number(limit) : undefined,
        sortBy: sortBy as "title" | "year" | "totalSections" | "createdAt" | undefined,
        sortOrder: sortOrder as "asc" | "desc" | undefined,
      });

      return res
        .status(200)
        .json(ResponseHandler(200, "Bare acts fetched successfully", result));
    } catch (error) {
      return next(error);
    }
  },

  // 2. Get Single Bare Act Details by slug or ID
  async getActBySlugOrId(req: Request, res: Response, next: NextFunction) {
    try {
      const { slugOrId } = req.params;
      const act = await bareActService.getActBySlugOrId(slugOrId);
      return res
        .status(200)
        .json(ResponseHandler(200, "Bare act details fetched successfully", act));
    } catch (error) {
      return next(error);
    }
  },

  // 3. Get Sections of an Act
  async getActSections(req: Request, res: Response, next: NextFunction) {
    try {
      const { actSlugOrId } = req.params;
      const { q, chapterId, sectionType, bailableStatus, cognizableStatus, page, limit } =
        req.query;

      const result = await bareActService.getActSections(actSlugOrId, {
        q: q as string,
        chapterId: chapterId as string,
        sectionType: sectionType as string,
        bailableStatus: bailableStatus as string,
        cognizableStatus: cognizableStatus as string,
        page: page ? Number(page) : undefined,
        limit: limit ? Number(limit) : undefined,
      });

      return res
        .status(200)
        .json(ResponseHandler(200, "Sections fetched successfully", result));
    } catch (error) {
      return next(error);
    }
  },

  // 4. Get Single Section details with statutory text, explanations, judgments & cross-refs
  async getSectionDetail(req: Request, res: Response, next: NextFunction) {
    try {
      const { actSlugOrId, sectionSlugOrNumber } = req.params;
      const result = await bareActService.getSectionDetail(
        actSlugOrId,
        sectionSlugOrNumber
      );
      return res
        .status(200)
        .json(ResponseHandler(200, "Section details fetched successfully", result));
    } catch (error) {
      return next(error);
    }
  },

  // 4b. Get Enriched Judgments with CNR, Ratio Decidendi & PDF URL
  async getSectionJudgments(req: Request, res: Response, next: NextFunction) {
    try {
      const { actSlugOrId, sectionSlugOrNumber } = req.params;
      const result = await bareActService.getSectionJudgments(
        actSlugOrId,
        sectionSlugOrNumber
      );
      return res
        .status(200)
        .json(ResponseHandler(200, "Section judgments fetched successfully", result));
    } catch (error) {
      return next(error);
    }
  },

  // 5. Instant Quick Section Lookup across all Bare Acts
  async quickLookup(req: Request, res: Response, next: NextFunction) {
    try {
      const { q, limit } = req.query;
      const result = await bareActService.quickLookup({
        q: (q as string) || "",
        limit: limit ? Number(limit) : undefined,
      });
      return res
        .status(200)
        .json(ResponseHandler(200, "Quick lookup results fetched successfully", result));
    } catch (error) {
      return next(error);
    }
  },

  // 6. Get Categories with Act counts & legal domain descriptions
  async getCategories(req: Request, res: Response, next: NextFunction) {
    try {
      const result = await bareActService.getCategories();
      return res
        .status(200)
        .json(ResponseHandler(200, "Bare act categories fetched successfully", result));
    } catch (error) {
      return next(error);
    }
  },

  // 7. Global stats
  async getStats(req: Request, res: Response, next: NextFunction) {
    try {
      const result = await bareActService.getStats();
      return res
        .status(200)
        .json(ResponseHandler(200, "Bare act stats fetched successfully", result));
    } catch (error) {
      return next(error);
    }
  },

  // 8. Criminal Law Comparisons (IPC vs BNS, CrPC vs BNSS, IEA vs BSA)
  async getCriminalLawComparisons(req: Request, res: Response, next: NextFunction) {
    try {
      const result = await bareActService.getCriminalLawComparisons();
      return res
        .status(200)
        .json(
          ResponseHandler(
            200,
            "Criminal law comparison table fetched successfully",
            result
          )
        );
    } catch (error) {
      return next(error);
    }
  },

  // 9. Search IndiaCode Live (over 10,000+ Acts)
  async searchIndiaCode(req: Request, res: Response, next: NextFunction) {
    try {
      const { q, jurisdiction, ministry, year, limit, offset } = req.query;
      const result = await indiaCodeService.searchActs(q as string, {
        jurisdiction: jurisdiction as string,
        ministry: ministry as string,
        year: year ? Number(year) : undefined,
        limit: limit ? Number(limit) : 20,
        offset: offset ? Number(offset) : 0,
      });
      return res
        .status(200)
        .json(ResponseHandler(200, "IndiaCode Acts fetched successfully", result));
    } catch (error) {
      return next(error);
    }
  },

  // 10. Preview IndiaCode Act
  async previewIndiaCodeAct(req: Request, res: Response, next: NextFunction) {
    try {
      const { actSlug } = req.params;
      const cleanSlug = (actSlug || "").trim();
      const result = (await indiaCodeService.getActOverview(cleanSlug)) as unknown as Record<string, unknown> & {
        act?: Record<string, unknown>;
        count?: number;
        sections?: Record<string, unknown>[];
      };

      const normalizedOverview = {
        ...result,
        id: result.act?.id || cleanSlug,
        slug: result.act?.id || cleanSlug,
        title: result.act?.short_title || result.act?.id || cleanSlug,
        short_title: result.act?.short_title || result.act?.id || cleanSlug,
        actNumber: result.act?.act_number || null,
        act_number: result.act?.act_number || null,
        actYear: result.act?.act_year || null,
        act_year: result.act?.act_year || null,
        longTitle: result.act?.long_title || null,
        long_title: result.act?.long_title || null,
        ministry: result.act?.ministry || null,
        jurisdiction: result.act?.jurisdiction || "Central",
        totalSections: result.act?.section_count || result.count || result.sections?.length || 0,
        sections: (result.sections || []).map((sec) => ({
          ...sec,
          number: sec.number,
          sectionNumber: sec.number,
          title: sec.heading || sec.title || `Section ${sec.number}`,
          heading: sec.heading || sec.title || `Section ${sec.number}`,
        })),
      };

      return res
        .status(200)
        .json(ResponseHandler(200, "IndiaCode Act overview fetched successfully", normalizedOverview));
    } catch (error) {
      return next(error);
    }
  },

  // 11. 1-Click Import Act from IndiaCode
  async importFromIndiaCode(req: Request, res: Response, next: NextFunction) {
    try {
      const { actSlug, slug, id, category, maxSections, batchSize } = req.body;
      const targetSlug = (actSlug || slug || id || "").toString().trim();
      if (!targetSlug) {
        return res.status(400).json(ResponseHandler(400, "actSlug is required"));
      }

      const adminUserId = req.adminUser?.userId || req.user?.userId;

      const result = await indiaCodeService.importActWithSections(targetSlug, {
        category,
        maxSections: maxSections ? Number(maxSections) : undefined,
        batchSize: batchSize ? Number(batchSize) : 5,
        uploadedByAdminId: adminUserId,
      });

      return res
        .status(201)
        .json(ResponseHandler(201, `Act '${result.title}' imported from IndiaCode successfully!`, result));
    } catch (error) {
      return next(error);
    }
  },

  // 12. Delete Bare Act
  async deleteAct(req: Request, res: Response, next: NextFunction) {
    try {
      const { id } = req.params;
      const result = await bareActService.deleteAct(id);
      return res.status(200).json(ResponseHandler(200, result.message));
    } catch (error) {
      return next(error);
    }
  },
};

export default bareActController;
