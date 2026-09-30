import { NextFunction, Request, Response } from "express";
import bareActService from "../../../services/bareAct.service.js";
import indiaCodeService from "../../../services/indiaCode.service.js";
import {
  bulkImportBareActSchema,
  createBareActSchema,
  createChapterSchema,
  createSectionSchema,
  updateBareActSchema,
  updateChapterSchema,
  updateSectionSchema,
  assignSectionsToChapterSchema,
  unassignSectionsSchema,
} from "../../../validators/bareAct.validator.js";
import ResponseHandler from "../../../utils/responseHandler.js";

export const adminBareActController = {
  // 1. Get All Acts (Admin View)
  async getActs(req: Request, res: Response, next: NextFunction) {
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
        .json(ResponseHandler(200, "Acts fetched for admin console", result));
    } catch (error) {
      return next(error);
    }
  },

  // 2. Get Single Act Details (Admin View)
  async getActById(req: Request, res: Response, next: NextFunction) {
    try {
      const { id } = req.params;
      const act = await bareActService.getActBySlugOrId(id);
      return res
        .status(200)
        .json(ResponseHandler(200, "Act details fetched successfully", act));
    } catch (error) {
      return next(error);
    }
  },

  // 3. Create Bare Act (Admin Upload / Manual Entry)
  async createAct(req: Request, res: Response, next: NextFunction) {
    try {
      const validated = createBareActSchema.parse(req.body);
      const adminUserId = req.adminUser?.userId || req.user?.userId;

      const created = await bareActService.createAct(validated, adminUserId);
      return res
        .status(201)
        .json(ResponseHandler(201, "Bare act created successfully", created));
    } catch (error) {
      return next(error);
    }
  },

  // 4. Update Bare Act
  async updateAct(req: Request, res: Response, next: NextFunction) {
    try {
      const { id } = req.params;
      const validated = updateBareActSchema.parse(req.body);
      const updated = await bareActService.updateAct(id, validated);
      return res
        .status(200)
        .json(ResponseHandler(200, "Bare act updated successfully", updated));
    } catch (error) {
      return next(error);
    }
  },

  // 5. Delete Bare Act
  async deleteAct(req: Request, res: Response, next: NextFunction) {
    try {
      const { id } = req.params;
      const result = await bareActService.deleteAct(id);
      return res.status(200).json(ResponseHandler(200, result.message));
    } catch (error) {
      return next(error);
    }
  },

  // 6. Create Chapter
  async createChapter(req: Request, res: Response, next: NextFunction) {
    try {
      const id = req.params.id as string;
      const validated = createChapterSchema.parse(req.body);
      const chapter = await bareActService.createChapter(id, validated);
      return res
        .status(201)
        .json(ResponseHandler(201, "Chapter added successfully", chapter));
    } catch (error) {
      return next(error);
    }
  },

  // 7. Update Chapter
  async updateChapter(req: Request, res: Response, next: NextFunction) {
    try {
      const chapterId = req.params.chapterId as string;
      const validated = updateChapterSchema.parse(req.body);
      const updated = await bareActService.updateChapter(chapterId, validated);
      return res
        .status(200)
        .json(ResponseHandler(200, "Chapter updated successfully", updated));
    } catch (error) {
      return next(error);
    }
  },

  // 8. Delete Chapter
  async deleteChapter(req: Request, res: Response, next: NextFunction) {
    try {
      const chapterId = req.params.chapterId as string;
      const result = await bareActService.deleteChapter(chapterId);
      return res.status(200).json(ResponseHandler(200, result.message));
    } catch (error) {
      return next(error);
    }
  },

  // 8a. Assign Sections to Chapter (By list of IDs or by section range e.g. 1-10)
  async assignSections(req: Request, res: Response, next: NextFunction) {
    try {
      const chapterId = req.params.chapterId as string;
      const validated = assignSectionsToChapterSchema.parse(req.body);
      const result = await bareActService.assignSectionsToChapter(chapterId, validated);
      return res.status(200).json(ResponseHandler(200, result.message, result));
    } catch (error) {
      return next(error);
    }
  },

  // 8b. Unassign Sections from Chapter
  async unassignSections(req: Request, res: Response, next: NextFunction) {
    try {
      const validated = unassignSectionsSchema.parse(req.body);
      const result = await bareActService.unassignSections(validated.sectionIds);
      return res.status(200).json(ResponseHandler(200, result.message, result));
    } catch (error) {
      return next(error);
    }
  },

  // 9. Create Section
  async createSection(req: Request, res: Response, next: NextFunction) {
    try {
      const id = req.params.id as string;
      const validated = createSectionSchema.parse(req.body);
      const section = await bareActService.createSection(id, validated);
      return res
        .status(201)
        .json(ResponseHandler(201, "Section created successfully", section));
    } catch (error) {
      return next(error);
    }
  },

  // 10. Update Section
  async updateSection(req: Request, res: Response, next: NextFunction) {
    try {
      const sectionId = req.params.sectionId as string;
      const validated = updateSectionSchema.parse(req.body);
      const updated = await bareActService.updateSection(sectionId, validated);
      return res
        .status(200)
        .json(ResponseHandler(200, "Section updated successfully", updated));
    } catch (error) {
      return next(error);
    }
  },

  // 11. Delete Section
  async deleteSection(req: Request, res: Response, next: NextFunction) {
    try {
      const sectionId = req.params.sectionId as string;
      const result = await bareActService.deleteSection(sectionId);
      return res.status(200).json(ResponseHandler(200, result.message));
    } catch (error) {
      return next(error);
    }
  },

  // 12. Bulk Import Act with Chapters and Sections
  async bulkImportAct(req: Request, res: Response, next: NextFunction) {
    try {
      const validated = bulkImportBareActSchema.parse(req.body);
      const adminUserId = req.adminUser?.userId || req.user?.userId;
      const result = await bareActService.bulkImportAct(validated, adminUserId);
      return res
        .status(201)
        .json(ResponseHandler(201, "Bare act bulk imported successfully", result));
    } catch (error) {
      return next(error);
    }
  },

  // 13. Re-seed System Default Indian Bare Acts Library
  async seedLibrary(req: Request, res: Response, next: NextFunction) {
    try {
      const result = await bareActService.reseedLibrary();
      return res.status(200).json(ResponseHandler(200, result.message));
    } catch (error) {
      return next(error);
    }
  },

  // 14. Search IndiaCode API Live
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

  // 15. Preview Act from IndiaCode
  async previewIndiaCodeAct(req: Request, res: Response, next: NextFunction) {
    try {
      const { actSlug } = req.params;
      const result = await indiaCodeService.getActOverview(actSlug);
      return res
        .status(200)
        .json(ResponseHandler(200, "IndiaCode Act overview fetched successfully", result));
    } catch (error) {
      return next(error);
    }
  },

  // 16. Admin 1-Click Import from IndiaCode to Database
  async importFromIndiaCode(req: Request, res: Response, next: NextFunction) {
    try {
      const { actSlug, category, maxSections, batchSize } = req.body;
      if (!actSlug) {
        return res.status(400).json(ResponseHandler(400, "actSlug is required"));
      }

      const adminUserId = req.adminUser?.userId || req.user?.userId;
      const result = await indiaCodeService.importActWithSections(actSlug, {
        category,
        maxSections: maxSections ? Number(maxSections) : undefined,
        batchSize: batchSize ? Number(batchSize) : 5,
        uploadedByAdminId: adminUserId,
      });

      return res
        .status(201)
        .json(ResponseHandler(201, `Act '${result.title}' successfully imported from IndiaCode into database!`, result));
    } catch (error) {
      return next(error);
    }
  },
};

export default adminBareActController;
