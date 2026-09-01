import { Request, Response, NextFunction } from "express";
import { and, asc, eq, or, isNull, gt } from "drizzle-orm";
import CustomErrorHandler from "../utils/customErrorHandler.js";
import systemAlerts from "../db/schema/systemAlerts.js";
import db from "../db/index.js";

const SystemAlertController = {
  async createSystemAlert(req: Request, res: Response, next: NextFunction) {
    try {
      const { title, message, link, type, isActive, expiresAt } = req.body;

      const userId = req.user.userId;

      if (!title?.trim()) {
        return next(CustomErrorHandler.badRequest("Title is required"));
      }

      if (!message?.trim()) {
        return next(CustomErrorHandler.badRequest("Message is required"));
      }

      const [alert] = await db
        .insert(systemAlerts)
        .values({
          title: title.trim(),
          message: message.trim(),

          link: link?.trim() || null,

          type: type ?? "info",

          isActive: isActive ?? true,

          expiresAt: expiresAt ? new Date(expiresAt) : null,

          createdBy: userId,
          updatedBy: userId,
        })
        .returning();

      return res.status(201).json({
        success: true,
        message: "System alert created successfully",
        data: alert,
      });
    } catch (error) {
      next(error);
    }
  },

  async getSystemAlerts(req: Request, res: Response, next: NextFunction) {
    try {
      const now = new Date();

      const alerts = await db
        .select()
        .from(systemAlerts)
        .where(
          and(
            eq(systemAlerts.isActive, true),

            // Not expired
            or(isNull(systemAlerts.expiresAt), gt(systemAlerts.expiresAt, now)),
          ),
        )
        .orderBy(asc(systemAlerts.createdAt));

      return res.status(200).json({
        success: true,
        message: "System alerts fetched successfully",
        data: alerts,
        total: alerts.length,
      });
    } catch (error) {
      next(error);
    }
  },

  async updateSystemAlert(req: Request, res: Response, next: NextFunction) {
    try {
      const { id } = req.params;

      const { title, message, link, type, isActive, expiresAt } = req.body;

      const userId = req.user.userId;

      if (!id) {
        return next(
          CustomErrorHandler.badRequest("System alert ID is required"),
        );
      }

      // Check alert exists
      const [existingAlert] = await db
        .select({
          id: systemAlerts.id,
        })
        .from(systemAlerts)
        .where(eq(systemAlerts.id, id))
        .limit(1);

      if (!existingAlert) {
        return next(CustomErrorHandler.notFound("System alert not found"));
      }

      const [updatedAlert] = await db
        .update(systemAlerts)
        .set({
          ...(title !== undefined && {
            title: title.trim(),
          }),

          ...(message !== undefined && {
            message: message.trim(),
          }),

          ...(link !== undefined && {
            link: link?.trim() || null,
          }),

          ...(type !== undefined && {
            type,
          }),

          ...(isActive !== undefined && {
            isActive,
          }),

          ...(expiresAt !== undefined && {
            expiresAt: expiresAt ? new Date(expiresAt) : null,
          }),

          updatedBy: userId,
          updatedAt: new Date(),
        })
        .where(eq(systemAlerts.id, id))
        .returning();

      return res.status(200).json({
        success: true,
        message: "System alert updated successfully",
        data: updatedAlert,
      });
    } catch (error) {
      next(error);
    }
  },
};

export default SystemAlertController;
