import { Router } from "express";
import auth from "../middleware/auth.js";
import taskCommentController from "../controller/task/taskComment.controller.js";

const router = Router();

router.get("/:taskId", auth, taskCommentController.getComments);

router.post("/", auth, taskCommentController.createComment);

router.delete("/:id", auth, taskCommentController.deleteComment);

export default router;
