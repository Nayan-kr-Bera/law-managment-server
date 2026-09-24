import { Router } from "express";
import auth from "../middleware/auth.js";
import officeGuard from "../middleware/officeGuard.js";
import subscriptionMiddleware from "../middleware/subscriptionMiddleware.js";
import { upload } from "../middleware/upload.js";
import subscriptionLimitMiddleware from "../middleware/subscriptionLimitMiddleware.js";
import { permissionGuard } from "../middleware/permission.js";
import caseDocumentController from "../controller/documents/documents.controller.js";

const router = Router();

// Upload document
router.post(
  "/",
  auth,
  officeGuard,
  subscriptionMiddleware,
  upload.single("file"),
  subscriptionLimitMiddleware.checkStorageLimit,
  caseDocumentController.uploadDocument,
);
router.get(
  "/explorer",
  auth,
  officeGuard,
  caseDocumentController.getGeneralDocuments,
);

router.get(
  "/case/:caseId/explorer",
  auth,
  officeGuard,
  caseDocumentController.getCaseDocuments,
);

// OCR quota & usage info (Permission required)
router.get(
  "/ocr/quota",
  auth,
  officeGuard,
  permissionGuard("document.ocr"),
  caseDocumentController.getOcrQuota,
);

// OCR search across indexed document text in PostgreSQL (Permission required)
router.get(
  "/ocr/search",
  auth,
  officeGuard,
  permissionGuard("document.ocr"),
  caseDocumentController.searchOcr,
);

// Trigger on-demand OCR text extraction & indexing (Permission required)
router.post(
  "/:id/ocr",
  auth,
  officeGuard,
  permissionGuard("document.ocr"),
  caseDocumentController.triggerOcr,
);

// Delete document
router.delete("/:id", auth, officeGuard, caseDocumentController.deleteDocument);

export default router;
