import express from "express";
import auth from "../middleware/auth.js";
import caseController from "../controller/case/case.controller.js";
import caseImportController from "../controller/case/caseImport.controller.js";
import officeGuard from "../middleware/officeGuard.js";
import { upload } from "../middleware/upload.js";
const router = express.Router();

router.get("/", auth, officeGuard, caseController.getCases);
router.post("/", auth, officeGuard, caseController.createCase);
router.post(
  "/import-excel",
  auth,
  officeGuard,
  upload.single("file"),
  caseImportController.importExcelCases,
);
router.get(
  "/status-counts",
  auth,
  officeGuard,
  caseController.getCaseStatusStats,
);
router.get(
  "/date-stats/filed",
  auth,
  officeGuard,
  caseController.getCasesFiledStats,
);
router.get(
  "/court-type-cases",
  auth,
  officeGuard,
  caseController.getCasesPerCourtType,
);
router.get(
  "/monthly-court-stats",
  auth,
  officeGuard,
  caseController.getMonthlyCourtStats,
);
router.get(
  "/date-stats/decided",
  auth,
  officeGuard,
  caseController.getCasesDecidedStats,
);
router.get(
  "/recent/assigned",
  auth,
  officeGuard,
  caseController.getRecentAssignedCases,
);
router.get(
  "/purpose-age-stats",
  auth,
  officeGuard,
  caseController.getCasesByPurposeAndAge,
);
router.get("/forfrom", auth, officeGuard, caseController.getCasesForFrom);
router.get("/:id/edit", auth, officeGuard, caseController.getCaseForUpdate);
router.get("/:id", auth, officeGuard, caseController.getCaseById);
export default router;
