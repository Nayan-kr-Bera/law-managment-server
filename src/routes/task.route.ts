import { Router } from "express";
import auth from "../middleware/auth.js";
import taskController from "../controller/task/task.controller.js";
import officeGuard from "../middleware/officeGuard.js";

const router = Router();

// Create Task
router.post("/", auth, officeGuard, taskController.createTask);

// Get All Tasks
router.get("/", auth, officeGuard, taskController.getTasks);

router.get("/calendar", auth, officeGuard, taskController.getCalendarTasks);
router.get("/timeline/chamber", auth, officeGuard, taskController.getChamberTaskTimeline);
router.get("/:taskId/timeline", auth, officeGuard, taskController.getTaskTimeline);

// Get Task By ID
router.get("/:taskId", auth, officeGuard, taskController.getTaskById);

// Update Task
router.put("/:taskId", auth, officeGuard, taskController.updateTask);
router.patch(
  "/:taskId/status",
  auth,
  officeGuard,
  taskController.updateTaskStatus,
);

// Delete Task
router.delete("/:taskId", auth, officeGuard, taskController.deleteTask);
export default router;
