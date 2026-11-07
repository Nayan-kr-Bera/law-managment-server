import express from "express";
import auth from "../middleware/auth.js";
import caseController from "../controller/case/case.controller.js";
import caseImportController from "../controller/case/caseImport.controller.js";
import officeGuard from "../middleware/officeGuard.js";
import { permissionGuard } from "../middleware/permission.js";
import { upload } from "../middleware/upload.js";
const router = express.Router();

router.get("/", auth, officeGuard, permissionGuard("case.read"), caseController.getCases);
router.post("/", auth, officeGuard, permissionGuard("case.create"), caseController.createCase);
router.post(
  "/import-excel",
  auth,
  officeGuard,
  permissionGuard("case.create"),
  upload.single("file"),
  caseImportController.importExcelCases,
);
router.get(
  "/status-counts",
  auth,
  officeGuard,
  permissionGuard("case.read"),
  caseController.getCaseStatusStats,
);
router.get(
  "/date-stats/filed",
  auth,
  officeGuard,
  permissionGuard("case.read"),
  caseController.getCasesFiledStats,
);
router.get(
  "/court-type-cases",
  auth,
  officeGuard,
  permissionGuard("case.read"),
  caseController.getCasesPerCourtType,
);
router.get(
  "/monthly-court-stats",
  auth,
  officeGuard,
  permissionGuard("case.read"),
  caseController.getMonthlyCourtStats,
);
router.get(
  "/date-stats/decided",
  auth,
  officeGuard,
  permissionGuard("case.read"),
  caseController.getCasesDecidedStats,
);
router.get(
  "/recent/assigned",
  auth,
  officeGuard,
  permissionGuard("case.read"),
  caseController.getRecentAssignedCases,
);
router.get(
  "/purpose-age-stats",
  auth,
  officeGuard,
  permissionGuard("case.read"),
  caseController.getCasesByPurposeAndAge,
);
router.get("/forfrom", auth, officeGuard, permissionGuard("case.read"), caseController.getCasesForFrom);
router.get("/next-file-no", auth, officeGuard, permissionGuard("case.read"), caseController.getNextFileNumber);
router.get("/:id/edit", auth, officeGuard, permissionGuard("case.read"), caseController.getCaseForUpdate);
router.get("/:caseId/remarks", auth, officeGuard, permissionGuard("case.read"), caseController.getCaseRemarks);
router.post("/:caseId/remarks", auth, officeGuard, permissionGuard("case.update"), caseController.addCaseRemark);
router.get("/:id", auth, officeGuard, permissionGuard("case.read"), caseController.getCaseById);
export default router;
