import express from "express";
import auth from "../middleware/auth.js";
import notificationController from "../controller/notification.controller.js";

const router = express.Router();

// SSE stream for real-time live notifications
router.get("/stream", auth, notificationController.streamNotifications);

// GET all notifications for the authenticated user (office-scoped or firm-wide)
router.get("/", auth, notificationController.getNotifications);

// MARK all notifications as read
router.patch("/read-all", auth, notificationController.markAllAsRead);

// MARK single notification as read
router.patch("/:id/read", auth, notificationController.markAsRead);

// DELETE notification
router.delete("/:id", auth, notificationController.deleteNotification);

export default router;
