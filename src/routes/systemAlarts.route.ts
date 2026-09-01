import express from "express";

import auth from "../middleware/auth.js";
import SystemAlertController from "../controller/systemAleart.controller.js";

const router = express.Router();

// Get active global system alerts
router.get("/", auth, SystemAlertController.getSystemAlerts);

// Create global system alert
router.post("/", auth, SystemAlertController.createSystemAlert);

// Update global system alert
router.patch("/:id", auth, SystemAlertController.updateSystemAlert);

export default router;
