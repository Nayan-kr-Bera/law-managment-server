import { Request, Response, NextFunction } from "express";
import { and, desc, eq } from "drizzle-orm";
import db from "../../db/index.js";
import { taskComments, tasks, user } from "../../db/schema/index.js";
import CustomErrorHandler from "../../utils/customErrorHandler.js";

const taskCommentController = {

  // GET COMMENTS FOR TASK
  async getComments(req: Request, res: Response, next: NextFunction) {
    try {
      const { taskId } = req.params;
      const tenantId = req.user.tenantId;

      // Check task belongs to current tenant
      const [task] = await db
        .select({
          id: tasks.id,
        })
        .from(tasks)
        .where(and(eq(tasks.id, taskId), eq(tasks.tenantId, tenantId)))
        .limit(1);

      if (!task) {
        return next(CustomErrorHandler.notFound("Task not found"));
      }

      const comments = await db
        .select({
          id: taskComments.id,
          taskId: taskComments.taskId,
          comment: taskComments.comment,
          createdAt: taskComments.createdAt,
          updatedAt: taskComments.updatedAt,

          userId: user.id,
          userName: user.name,
        })
        .from(taskComments)
        .innerJoin(user, eq(taskComments.userId, user.id))
        .where(eq(taskComments.taskId, taskId))
        .orderBy(desc(taskComments.createdAt));

      return res.status(200).json({
        success: true,
        message: "Task comments fetched successfully",
        data: comments,
      });
    } catch (error) {
      next(error);
    }
  },

  // CREATE COMMENT
  async createComment(req: Request, res: Response, next: NextFunction) {
    try {
      const { taskId, comment } = req.body;

      const tenantId = req.user.tenantId;
      const userId = req.user.userId;

      if (!taskId) {
        return next(CustomErrorHandler.badRequest("Task ID is required"));
      }

      if (!comment || !comment.trim()) {
        return next(CustomErrorHandler.badRequest("Comment is required"));
      }

      // Check task belongs to current tenant
      const [task] = await db
        .select({
          id: tasks.id,
        })
        .from(tasks)
        .where(and(eq(tasks.id, taskId), eq(tasks.tenantId, tenantId)))
        .limit(1);

      if (!task) {
        return next(CustomErrorHandler.notFound("Task not found"));
      }

      const [taskComment] = await db
        .insert(taskComments)
        .values({
          taskId,
          userId,
          comment: comment.trim(),
        })
        .returning();

      return res.status(201).json({
        success: true,
        message: "Comment added successfully",
        data: taskComment,
      });
    } catch (error) {
      next(error);
    }
  },

  // DELETE COMMENT
  async deleteComment(req: Request, res: Response, next: NextFunction) {
    try {
      const { id } = req.params;

      const tenantId = req.user.tenantId;

      // Make sure comment belongs to a task
      // inside the current tenant
      const [comment] = await db
        .select({
          id: taskComments.id,
        })
        .from(taskComments)
        .innerJoin(tasks, eq(taskComments.taskId, tasks.id))
        .where(and(eq(taskComments.id, id), eq(tasks.tenantId, tenantId)))
        .limit(1);

      if (!comment) {
        return next(CustomErrorHandler.notFound("Comment not found"));
      }

      await db.delete(taskComments).where(eq(taskComments.id, id));

      return res.status(200).json({
        success: true,
        message: "Comment deleted successfully",
      });
    } catch (error) {
      next(error);
    }
  },
};

export default taskCommentController;
