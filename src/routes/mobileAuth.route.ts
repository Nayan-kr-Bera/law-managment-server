import express from "express";
import mobileAuthController from "../controller/auth/mobileAuth.controller.js";
import auth from "../middleware/auth.js";

const router = express.Router();

// Device-bound auth for the chamber mobile app. The web portal keeps using /api/auth/*.
router.post("/login", mobileAuthController.login);
router.post("/refresh-token", mobileAuthController.refresh);
router.post("/logout", mobileAuthController.logout);

// Logged-in devices management
router.get("/sessions", auth, mobileAuthController.listSessions);
router.delete("/sessions/:id", auth, mobileAuthController.revokeSession);

export default router;

