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

// OCR credit packs & pricing (₹2.00 / credit)
router.get(
  "/ocr/credit-packs",
  auth,
  officeGuard,
  caseDocumentController.getOcrCreditPacks,
);

// Create Razorpay payment order for OCR credit top-up
router.post(
  "/ocr/create-credit-order",
  auth,
  officeGuard,
  caseDocumentController.createOcrCreditOrder,
);

// Verify Razorpay payment and add OCR credits to pool
router.post(
  "/ocr/verify-credit-payment",
  auth,
  officeGuard,
  caseDocumentController.verifyOcrCreditPayment,
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

// Get document by ID (with OCR text & case context)
router.get("/:id", auth, officeGuard, caseDocumentController.getDocumentById);

// Delete document
router.delete("/:id", auth, officeGuard, caseDocumentController.deleteDocument);

// ========================================================
// DOCUMENT AI INTELLIGENCE (LEVEL 3, LEVEL 4, CO-COUNSEL CHAT)
// ========================================================
import documentIntelligenceController from "../controller/documents/documentIntelligence.controller.js";

// Level 2: Legal Named Entity Recognition (NER) (Included with OCR)
router.post(
  "/:id/intelligence/level2",
  auth,
  officeGuard,
  documentIntelligenceController.generateLevel2,
);

// Level 3: Deep Inconsistency Analysis & Chronology (1 AI Credit)
router.post(
  "/:id/intelligence/level3",
  auth,
  officeGuard,
  documentIntelligenceController.generateLevel3,
);

// Level 4: Case Knowledge Graph & Flow (1 AI Credit)
router.post(
  "/:id/intelligence/level4",
  auth,
  officeGuard,
  documentIntelligenceController.generateLevel4,
);

// Level 4: AI Co-Counsel Chat (1 AI Credit per query)
router.post(
  "/:id/intelligence/chat",
  auth,
  officeGuard,
  documentIntelligenceController.chat,
);

// Clear saved intelligence data in PostgreSQL
router.delete(
  "/:id/intelligence",
  auth,
  officeGuard,
  documentIntelligenceController.clearIntelligence,
);

export default router;
