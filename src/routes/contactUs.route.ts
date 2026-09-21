import { Router } from "express";
import contactUsController from "../controller/contactUs.controller.js";

const router = Router();

// Public submission endpoint
router.post("/", contactUsController.submitContact);

// Admin endpoints (ready for future admin panel)
router.get("/", contactUsController.getAllMessages);
router.get("/:id", contactUsController.getMessageById);
router.patch("/:id/status", contactUsController.updateStatus);

export default router;
