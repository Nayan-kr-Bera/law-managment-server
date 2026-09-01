import { Router } from "express";
import supportTicketController from "../controller/support/supportTicket.controller.js";
import auth from "../middleware/auth.js";

const router = Router();

router.get("/", auth, supportTicketController.getAdvocateTickets);
router.get("/:ticketId", auth, supportTicketController.getTicketById);
router.post("/", auth, supportTicketController.createTicket);
router.post("/:ticketId/reply", auth, supportTicketController.replyTicket);
router.patch("/:ticketId/status", auth, supportTicketController.updateTicketStatus);

export default router;
