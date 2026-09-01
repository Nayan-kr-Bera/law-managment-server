import { Router } from "express";
import auth from "../middleware/auth.js";
import officeGuard from "../middleware/officeGuard.js";
import reminderController from "../controller/reminder/reminder.controller.js";

const router = Router();

// Create Reminder
router.post("/", auth, officeGuard, reminderController.createReminder);

// Get All Reminders
router.get("/", auth, officeGuard, reminderController.getReminders);

// Update Reminder
router.put("/:id", auth, officeGuard, reminderController.updateReminder);

// Delete Reminder
router.delete("/:id", auth, officeGuard, reminderController.deleteReminder);

export default router;
