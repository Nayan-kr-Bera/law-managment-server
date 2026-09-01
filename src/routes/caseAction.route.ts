import { Router } from "express";
import auth from "../middleware/auth.js";
import caseActionController from "../controller/case/caseAction.controller.js";
import officeGuard from "../middleware/officeGuard.js";

const router = Router();

// Create a link between two cases
router.post("/", auth, caseActionController.addCaseLink);

router.patch("/bulk-action", auth, caseActionController.bulkCaseAction);
// Update link notes
router.patch("/:id", auth, caseActionController.updateCaseLink);

// Remove case link
router.delete("/:id", auth, caseActionController.removeCaseLink);

router.patch("/:caseId/company", auth, caseActionController.updateCaseCompany);

router.delete("/:caseId/company", auth, caseActionController.removeCaseCompany);
router.get("/:caseId/links", auth,officeGuard, caseActionController.getCaseLinks);
router.patch(
  "/:caseId/empanelment",
  auth,
  caseActionController.updateCaseEmpanelment,
);

router.delete(
  "/:caseId/empanelment",
  auth,
  caseActionController.removeCaseEmpanelment,
);

router.post("/:caseId/tags", auth, caseActionController.addCaseTag);

router.delete("/:caseId/tags/:tagId", auth, caseActionController.removeCaseTag);

router.post("/:caseId/clients", auth, caseActionController.addCaseClient);

router.delete(
  "/:caseId/clients/:clientId",
  auth,
  caseActionController.removeCaseClient,
);
// Update case basic information
router.put("/:id", auth, caseActionController.updateCase);
export default router;
