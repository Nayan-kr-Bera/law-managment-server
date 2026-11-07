import { Router } from "express";
import auth from "../middleware/auth.js";
import taskController from "../controller/task/task.controller.js";
import officeGuard from "../middleware/officeGuard.js";
import { permissionGuard } from "../middleware/permission.js";

const router = Router();

// Create Task
router.post("/", auth, officeGuard, permissionGuard("task.create"), taskController.createTask);

// Get All Tasks
router.get("/", auth, officeGuard, permissionGuard("task.read"), taskController.getTasks);

router.get("/calendar", auth, officeGuard, permissionGuard("task.read"), taskController.getCalendarTasks);
router.get("/timeline/chamber", auth, officeGuard, permissionGuard("task.read"), taskController.getChamberTaskTimeline);
router.get("/:taskId/timeline", auth, officeGuard, permissionGuard("task.read"), taskController.getTaskTimeline);

// Get Task By ID
router.get("/:taskId", auth, officeGuard, permissionGuard("task.read"), taskController.getTaskById);

// Update Task
router.put("/:taskId", auth, officeGuard, permissionGuard("task.update"), taskController.updateTask);
router.patch(
  "/:taskId/status",
  auth,
  officeGuard,
  permissionGuard("task.update"),
  taskController.updateTaskStatus,
);

// Delete Task
router.delete("/:taskId", auth, officeGuard, permissionGuard("task.delete"), taskController.deleteTask);
export default router;
