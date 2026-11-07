import { Router } from "express";
import auth from "../middleware/auth.js";
import officeGuard from "../middleware/officeGuard.js";
import { permissionGuard } from "../middleware/permission.js";
import reminderController from "../controller/reminder/reminder.controller.js";

const router = Router();

// Create Reminder
router.post("/", auth, officeGuard, permissionGuard("reminder.create"), reminderController.createReminder);

// Get All Reminders
router.get("/", auth, officeGuard, permissionGuard("reminder.read"), reminderController.getReminders);

// Update Reminder
router.put("/:id", auth, officeGuard, permissionGuard("reminder.update"), reminderController.updateReminder);

// Delete Reminder
router.delete("/:id", auth, officeGuard, permissionGuard("reminder.delete"), reminderController.deleteReminder);

export default router;
