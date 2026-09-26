import { and, count, desc, eq, inArray, isNull, or, SQL } from "drizzle-orm";
import { Request, Response, NextFunction } from "express";

import db from "../db/index.js";
import {
  notifications,
  offices,
  userScopeOffices,
  userScopes,
} from "../db/schema/index.js";
import CustomErrorHandler from "../utils/customErrorHandler.js";
import ResponseHandler from "../utils/responseHandler.js";
import { notificationEvents } from "../services/notification.service.js";

const notificationController = {
  // GET USER NOTIFICATIONS (User-Isolated)
  async getNotifications(req: Request, res: Response, next: NextFunction) {
    try {
      const tenantId = req.user?.tenantId;
      const userId = req.user?.userId;

      if (!tenantId || !userId) {
        return next(CustomErrorHandler.unAuthorized("User context missing"));
      }

      const page = parseInt(req.query.page as string) || 1;
      const limit = parseInt(req.query.limit as string) || 30;
      const offset = (page - 1) * limit;
      const filterOfficeId = (req.query.officeId as string) || null;
      const statusFilter = req.query.status as string; // 'unread' | 'read' | 'all'
      const typeFilter = req.query.type as string; // 'hearing' | 'task' | 'appointment' | 'invoice' | 'system'

      // Construct visibility filter: strictly user-scoped
      const visibilityConditions: SQL[] = [
        eq(notifications.tenantId, tenantId),
        or(eq(notifications.userId, userId), isNull(notifications.userId))!,
      ];

      if (filterOfficeId) {
        visibilityConditions.push(
          or(eq(notifications.officeId, filterOfficeId), isNull(notifications.officeId))!
        );
      }

      if (statusFilter === "unread") {
        visibilityConditions.push(eq(notifications.status, "pending"));
      } else if (statusFilter === "read") {
        visibilityConditions.push(eq(notifications.status, "read"));
      }

      if (typeFilter && typeFilter !== "all") {
        visibilityConditions.push(eq(notifications.type, typeFilter as any));
      }

      const finalWhere = and(...visibilityConditions);

      // Fetch notifications joined with Office name
      const notifsQuery = await db
        .select({
          id: notifications.id,
          tenantId: notifications.tenantId,
          officeId: notifications.officeId,
          officeName: offices.name,
          userId: notifications.userId,
          title: notifications.title,
          body: notifications.body,
          type: notifications.type,
          status: notifications.status,
          createdAt: notifications.createdAt,
        })
        .from(notifications)
        .leftJoin(offices, eq(notifications.officeId, offices.id))
        .where(finalWhere)
        .orderBy(desc(notifications.createdAt))
        .limit(limit)
        .offset(offset);

      // Calculate unread count strictly for this user
      const unreadWhere = and(
        eq(notifications.tenantId, tenantId),
        eq(notifications.status, "pending"),
        or(eq(notifications.userId, userId), isNull(notifications.userId))!
      );

      const [unreadCountResult] = await db
        .select({ count: count() })
        .from(notifications)
        .where(unreadWhere);

      const [totalCountResult] = await db
        .select({ count: count() })
        .from(notifications)
        .where(finalWhere);

      const unreadCount = Number(unreadCountResult?.count || 0);
      const total = Number(totalCountResult?.count || 0);

      return res.status(200).json(
        ResponseHandler(200, "Notifications fetched successfully", {
          notifications: notifsQuery,
          unreadCount,
          pagination: {
            page,
            limit,
            total,
            totalPages: Math.ceil(total / limit) || 1,
          },
        })
      );
    } catch (error) {
      console.error("Get notifications error:", error);
      return next(CustomErrorHandler.serverError());
    }
  },

  // MARK NOTIFICATION AS READ (User-Isolated)
  async markAsRead(req: Request, res: Response, next: NextFunction) {
    try {
      const { id } = req.params;
      const tenantId = req.user?.tenantId;
      const userId = req.user?.userId;

      if (!tenantId || !userId) {
        return next(CustomErrorHandler.unAuthorized());
      }

      const [updated] = await db
        .update(notifications)
        .set({ status: "read" })
        .where(
          and(
            eq(notifications.id, id),
            eq(notifications.tenantId, tenantId),
            or(eq(notifications.userId, userId), isNull(notifications.userId))!
          )
        )
        .returning();

      if (!updated) {
        return next(CustomErrorHandler.notFound("Notification not found"));
      }

      return res.status(200).json(
        ResponseHandler(200, "Notification marked as read", {
          notification: updated,
        })
      );
    } catch (error) {
      console.error("Mark notification read error:", error);
      return next(CustomErrorHandler.serverError());
    }
  },

  // MARK ALL NOTIFICATIONS AS READ (User-Isolated)
  async markAllAsRead(req: Request, res: Response, next: NextFunction) {
    try {
      const tenantId = req.user?.tenantId;
      const userId = req.user?.userId;

      if (!tenantId || !userId) {
        return next(CustomErrorHandler.unAuthorized());
      }

      // Mark only this user's pending notifications as read
      await db
        .update(notifications)
        .set({ status: "read" })
        .where(
          and(
            eq(notifications.tenantId, tenantId),
            eq(notifications.status, "pending"),
            or(eq(notifications.userId, userId), isNull(notifications.userId))!
          )
        );

      return res.status(200).json(
        ResponseHandler(200, "All notifications marked as read")
      );
    } catch (error) {
      console.error("Mark all notifications read error:", error);
      return next(CustomErrorHandler.serverError());
    }
  },

  // DELETE SINGLE NOTIFICATION (User-Isolated)
  async deleteNotification(req: Request, res: Response, next: NextFunction) {
    try {
      const { id } = req.params;
      const tenantId = req.user?.tenantId;
      const userId = req.user?.userId;

      if (!tenantId || !userId) {
        return next(CustomErrorHandler.unAuthorized());
      }

      const [deleted] = await db
        .delete(notifications)
        .where(
          and(
            eq(notifications.id, id),
            eq(notifications.tenantId, tenantId),
            or(eq(notifications.userId, userId), isNull(notifications.userId))!
          )
        )
        .returning();

      if (!deleted) {
        return next(CustomErrorHandler.notFound("Notification not found"));
      }

      return res.status(200).json(
        ResponseHandler(200, "Notification deleted successfully")
      );
    } catch (error) {
      console.error("Delete notification error:", error);
      return next(CustomErrorHandler.serverError());
    }
  },

  // CLEAR ALL READ NOTIFICATIONS (User-Isolated)
  async clearReadNotifications(req: Request, res: Response, next: NextFunction) {
    try {
      const tenantId = req.user?.tenantId;
      const userId = req.user?.userId;

      if (!tenantId || !userId) {
        return next(CustomErrorHandler.unAuthorized());
      }

      await db
        .delete(notifications)
        .where(
          and(
            eq(notifications.tenantId, tenantId),
            eq(notifications.status, "read"),
            or(eq(notifications.userId, userId), isNull(notifications.userId))!
          )
        );

      return res.status(200).json(
        ResponseHandler(200, "All read notifications cleared successfully")
      );
    } catch (error) {
      console.error("Clear read notifications error:", error);
      return next(CustomErrorHandler.serverError());
    }
  },

  // SERVER-SENT EVENTS (SSE) STREAM (User-Isolated)
  async streamNotifications(req: Request, res: Response, next: NextFunction) {
    try {
      const tenantId = req.user?.tenantId;
      const userId = req.user?.userId;

      if (!tenantId || !userId) {
        return next(CustomErrorHandler.unAuthorized("User context missing"));
      }

      // Setup SSE Headers
      res.setHeader("Content-Type", "text/event-stream");
      res.setHeader("Cache-Control", "no-cache, no-transform");
      res.setHeader("Connection", "keep-alive");
      res.setHeader("X-Accel-Buffering", "no");
      res.flushHeaders();

      // Send initial connection event
      res.write(`event: connected\ndata: ${JSON.stringify({ status: "connected", time: new Date().toISOString() })}\n\n`);

      // Event listener callback: strictly push events targeted to this user
      const onNotification = (notif: typeof notifications.$inferSelect) => {
        try {
          if (notif.tenantId !== tenantId) return;

          // Push if explicitly targeted to this user or global unassigned
          if (notif.userId === userId || notif.userId === null) {
            res.write(`event: notification\ndata: ${JSON.stringify(notif)}\n\n`);
          }
        } catch (err) {
          console.error("Error sending SSE notification frame:", err);
        }
      };

      notificationEvents.on("notification:new", onNotification);

      // Keep connection alive with heartbeat every 25s
      const heartbeatInterval = setInterval(() => {
        try {
          res.write(`: heartbeat\n\n`);
        } catch {
          clearInterval(heartbeatInterval);
        }
      }, 25000);

      // Clean up when client disconnects
      req.on("close", () => {
        clearInterval(heartbeatInterval);
        notificationEvents.off("notification:new", onNotification);
        res.end();
      });
    } catch (error) {
      console.error("SSE stream error:", error);
      return next(CustomErrorHandler.serverError());
    }
  },
};

export default notificationController;
