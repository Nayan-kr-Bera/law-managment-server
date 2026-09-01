import { Router } from "express";
import auth from "../middleware/auth.js";
import taskController from "../controller/task/task.controller.js";
import officeGuard from "../middleware/officeGuard.js";

const router = Router();

// Create Task
router.post("/", auth, officeGuard, taskController.createTask);

// Get All Tasks
router.get("/", auth, taskController.getTasks);

router.get("/calendar", auth, officeGuard, taskController.getCalendarTasks);

// Get Task By ID
router.get("/:taskId", auth, taskController.getTaskById);

// Update Task
router.put("/:taskId", auth, taskController.updateTask);
router.patch(
  "/:taskId/status",
  auth,
  officeGuard,
  taskController.updateTaskStatus,
);

// Delete Task
router.delete("/:taskId", auth, taskController.deleteTask);
export default router;
