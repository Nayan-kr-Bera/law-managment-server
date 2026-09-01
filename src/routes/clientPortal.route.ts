import { Router } from "express";
import clientPortalController from "../controller/clientPortal/clientPortal.controller.js";
import clientAuth from "../middleware/clientAuth.js";
import { upload } from "../middleware/upload.js";
import caseDocumentController from "../controller/documents/documents.controller.js";

import supportTicketController from "../controller/support/supportTicket.controller.js";

const router = Router();

// Public Client Auth
router.post("/auth/login", clientPortalController.login);
router.post("/auth/register", clientPortalController.register);
router.post("/auth/refresh-token", clientPortalController.refreshToken);

// Protected Client Portal Routes
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
