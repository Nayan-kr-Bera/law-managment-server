import { Router } from "express";
import bareActController from "../controller/bareAct.controller.js";

const router = Router();

/* =========================================================================
   PUBLIC / ADVOCATE / CLIENT BARE ACTS & INDIAN CONSTITUTION APIS
   ========================================================================= */

// 1. Categories & Analytics
router.get("/categories", bareActController.getCategories);
router.get("/stats", bareActController.getStats);
router.get("/comparisons/criminal-laws", bareActController.getCriminalLawComparisons);

// 2. Ultra-fast Instant Cross-Act Section Lookup
router.get("/quick-lookup", bareActController.quickLookup);

// 3. Bare Acts Directory (Filter by category, jurisdiction, state, year, keywords)
router.get("/", bareActController.listActs);

// 4. IndiaCode Live Direct Integration (Search 10,000+ Acts, Preview & 1-Click Import)
router.get("/indiacode/search", bareActController.searchIndiaCode);
router.get("/indiacode/preview/:actSlug", bareActController.previewIndiaCodeAct);
router.post("/indiacode/import", bareActController.importFromIndiaCode);

// 5. Single Bare Act Details & Table of Contents (with auto-cache from IndiaCode)
router.get("/:slugOrId", bareActController.getActBySlugOrId);
router.delete("/:id", bareActController.deleteAct);

// 5. Sections within an Act
router.get("/:actSlugOrId/sections", bareActController.getActSections);

// 6. Section Detail with Full Statutory Text, Explanations, Judgments & Cross-References
router.get("/:actSlugOrId/sections/:sectionSlugOrNumber", bareActController.getSectionDetail);
router.get("/:actSlugOrId/sections/:sectionSlugOrNumber/judgments", bareActController.getSectionJudgments);

export default router;
