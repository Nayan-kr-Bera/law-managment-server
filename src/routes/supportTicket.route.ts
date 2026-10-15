import { Router } from "express";
import supportTicketController from "../controller/support/supportTicket.controller.js";
import adminSupportController from "../controller/admin/support/adminSupport.controller.js";
import auth from "../middleware/auth.js";

const router = Router();

router.get("/", auth, supportTicketController.getAdvocateTickets);
router.get("/:ticketId", auth, supportTicketController.getTicketById);
router.post("/", auth, supportTicketController.createTicket);
router.post("/:ticketId/reply", auth, supportTicketController.replyTicket);
router.patch("/:ticketId/status", auth, supportTicketController.updateTicketStatus);
router.post("/:ticketId/csat", auth, supportTicketController.submitCsatRating);
router.post("/ai-chat", auth, adminSupportController.handleAiSupportChat);

export default router;
