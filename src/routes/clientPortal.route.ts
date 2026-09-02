import { Router } from "express";
import clientAuthController from "../controller/auth/clientLogin.controller.js";
import clientPortalController from "../controller/clientPortal/clientPortal.controller.js";
import clientAuth from "../middleware/clientAuth.js";
import { upload } from "../middleware/upload.js";
import caseDocumentController from "../controller/documents/documents.controller.js";
import supportTicketController from "../controller/support/supportTicket.controller.js";

const router = Router();

// ─── Public Client Auth ────────────────────────────────────────────────────────

/** Step 1: Login with email + password */
router.post("/auth/login", clientAuthController.login);

/**
 * Step 2 (only when multiple firm profiles):
 * Client picks a firm → receives a full scoped token.
 */
router.post("/auth/select-profile", clientAuthController.selectProfile);

/** Switch active firm / office profile */
router.post("/auth/switch-profile", clientAuth, clientAuthController.switchProfile);

/** Get all available profiles & offices for the client */
router.get("/profiles", clientAuth, clientAuthController.getProfiles);

/** Refresh portal token */
router.post("/auth/refresh-token", clientPortalController.refreshToken);

// NOTE: self-registration is intentionally not supported.
// Clients are always added by a law firm first (via admin panel).

// ─── Protected Client Portal Routes ──────────────────────────────────────────

router.get("/cases", clientAuth, clientPortalController.getCases);
router.get("/cases/:caseId", clientAuth, clientPortalController.getCaseById);
router.post("/cases/:caseId/remarks", clientAuth, clientPortalController.addCaseRemark);

router.get("/documents", clientAuth, clientPortalController.getDocuments);
router.post(
  "/documents",
  clientAuth,
  upload.single("file"),
  caseDocumentController.uploadDocument,
);

router.get("/billing/invoices", clientAuth, clientPortalController.getInvoices);
router.post("/billing/invoices/:invoiceId/pay", clientAuth, clientPortalController.payInvoice);

router.get("/support/tickets", clientAuth, supportTicketController.getClientTickets);
router.post("/support/tickets", clientAuth, supportTicketController.createTicket);
router.post("/support/tickets/:ticketId/reply", clientAuth, supportTicketController.replyTicket);

export default router;
