import { Router } from "express";
import auth from "../middleware/auth.js";
import caseActionController from "../controller/case/caseAction.controller.js";
import officeGuard from "../middleware/officeGuard.js";
import { permissionGuard } from "../middleware/permission.js";

const router = Router();

// Create a link between two cases
router.post("/", auth, permissionGuard("case.update"), caseActionController.addCaseLink);

router.patch("/bulk-action", auth, permissionGuard("case.update"), caseActionController.bulkCaseAction);

// Client notifications (email + portal)
router.post("/preview-client-notifications", auth, permissionGuard("case.read"), caseActionController.previewClientNotifications);
router.post("/notify-clients", auth, permissionGuard("case.update"), caseActionController.notifyClients);
// Update link notes
router.patch("/:id", auth, permissionGuard("case.update"), caseActionController.updateCaseLink);

// Remove case link
router.delete("/:id", auth, permissionGuard("case.update"), caseActionController.removeCaseLink);

router.patch("/:caseId/company", auth, permissionGuard("case.update"), caseActionController.updateCaseCompany);

router.delete("/:caseId/company", auth, permissionGuard("case.update"), caseActionController.removeCaseCompany);
router.get("/:caseId/links", auth, officeGuard, permissionGuard("case.read"), caseActionController.getCaseLinks);
router.patch(
  "/:caseId/empanelment",
  auth,
  permissionGuard("case.update"),
  caseActionController.updateCaseEmpanelment,
);

router.delete(
  "/:caseId/empanelment",
  auth,
  permissionGuard("case.update"),
  caseActionController.removeCaseEmpanelment,
);

router.post("/:caseId/tags", auth, permissionGuard("case.update"), caseActionController.addCaseTag);

router.delete("/:caseId/tags/:tagId", auth, permissionGuard("case.update"), caseActionController.removeCaseTag);

router.post("/:caseId/clients", auth, permissionGuard("case.update"), caseActionController.addCaseClient);

router.delete(
  "/:caseId/clients/:clientId",
  auth,
  permissionGuard("case.update"),
  caseActionController.removeCaseClient,
);
// Update case basic information
router.put("/:id", auth, permissionGuard("case.update"), caseActionController.updateCase);
export default router;
