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
  // GET USER NOTIFICATIONS
  async getNotifications(req: Request, res: Response, next: NextFunction) {
    try {
      const tenantId = req.user?.tenantId;
      const userId = req.user?.userId;

      if (!tenantId || !userId) {
        return next(CustomErrorHandler.unAuthorized("User context missing"));
      }

      const page = parseInt(req.query.page as string) || 1;
      const limit = parseInt(req.query.limit as string) || 20;
      const offset = (page - 1) * limit;
      const filterOfficeId = (req.query.officeId as string) || req.officeId || null;
      const statusFilter = req.query.status as string; // 'unread' | 'read' | 'all'
      const typeFilter = req.query.type as string; // 'hearing' | 'task' | 'appointment' | 'invoice' | 'system'

      // Check if user is SuperAdmin or Tenant Admin
      const isSuperAdmin = Boolean(req.user?.isSuperAdmin);
      const isTenantAdmin =
        isSuperAdmin ||
        Boolean(
          req.user?.permissions?.includes("tenant.update") ||
          req.user?.permissions?.includes("tenant.read")
        );

      // Find user's assigned offices from userScopeOffices
      const userAssignedOfficeRecords = await db
        .select({ officeId: userScopeOffices.officeId })
        .from(userScopeOffices)
        .innerJoin(userScopes, eq(userScopeOffices.userScopeId, userScopes.id))
        .where(eq(userScopes.userId, userId));

      const assignedOfficeIds = userAssignedOfficeRecords.map((r: { officeId: string }) => r.officeId);

      // Construct visibility filter
      const visibilityConditions: SQL[] = [];

      if (isTenantAdmin) {
        // Tenant Admin sees all notifications within tenant
        visibilityConditions.push(eq(notifications.tenantId, tenantId));
        if (filterOfficeId) {
          visibilityConditions.push(eq(notifications.officeId, filterOfficeId));
        }
      } else {
        // Regular lawyer / user visibility:
        // 1. Direct notification to this user
        // 2. Office-level broadcast to assigned offices only
        // 3. Firm-wide broadcast (no officeId, no userId)
        const userOrOfficeConditions: SQL[] = [eq(notifications.userId, userId)];

        if (assignedOfficeIds.length > 0) {
          if (filterOfficeId && assignedOfficeIds.includes(filterOfficeId)) {
            userOrOfficeConditions.push(
              and(eq(notifications.officeId, filterOfficeId), isNull(notifications.userId))!
            );
          } else if (!filterOfficeId) {
            userOrOfficeConditions.push(
              and(inArray(notifications.officeId, assignedOfficeIds), isNull(notifications.userId))!
            );
          }
        }

        // Global firm announcements
        userOrOfficeConditions.push(
          and(isNull(notifications.officeId), isNull(notifications.userId))!
        );

        visibilityConditions.push(
          eq(notifications.tenantId, tenantId),
          or(...userOrOfficeConditions)!
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

      // Calculate total unread count for the user
      const unreadWhereConditions: SQL[] = [
        eq(notifications.tenantId, tenantId),
        eq(notifications.status, "pending"),
      ];

      if (!isTenantAdmin) {
        const unreadUserConditions: SQL[] = [eq(notifications.userId, userId)];
        if (assignedOfficeIds.length > 0) {
          unreadUserConditions.push(
            and(inArray(notifications.officeId, assignedOfficeIds), isNull(notifications.userId))!
          );
        }
        unreadUserConditions.push(
          and(isNull(notifications.officeId), isNull(notifications.userId))!
        );
        unreadWhereConditions.push(or(...unreadUserConditions)!);
      }

      const [unreadCountResult] = await db
        .select({ count: count() })
        .from(notifications)
        .where(and(...unreadWhereConditions));

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

  // MARK NOTIFICATION AS READ
  async markAsRead(req: Request, res: Response, next: NextFunction) {
    try {
      const { id } = req.params;
      const tenantId = req.user?.tenantId;

      if (!tenantId) {
        return next(CustomErrorHandler.unAuthorized());
      }

      const [updated] = await db
        .update(notifications)
        .set({ status: "read" })
        .where(and(eq(notifications.id, id), eq(notifications.tenantId, tenantId)))
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

  // MARK ALL NOTIFICATIONS AS READ
  async markAllAsRead(req: Request, res: Response, next: NextFunction) {
    try {
      const tenantId = req.user?.tenantId;
      const userId = req.user?.userId;

      if (!tenantId || !userId) {
        return next(CustomErrorHandler.unAuthorized());
      }

      // Mark user-specific and tenant unread notifications as read
      await db
        .update(notifications)
        .set({ status: "read" })
        .where(
          and(
            eq(notifications.tenantId, tenantId),
            eq(notifications.status, "pending"),
            or(
              eq(notifications.userId, userId),
              isNull(notifications.userId)
            )
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

  // DELETE NOTIFICATION
  async deleteNotification(req: Request, res: Response, next: NextFunction) {
    try {
      const { id } = req.params;
      const tenantId = req.user?.tenantId;

      if (!tenantId) {
        return next(CustomErrorHandler.unAuthorized());
      }

      const [deleted] = await db
        .delete(notifications)
        .where(and(eq(notifications.id, id), eq(notifications.tenantId, tenantId)))
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

  // SERVER-SENT EVENTS (SSE) STREAM
  async streamNotifications(req: Request, res: Response, next: NextFunction) {
    try {
      const tenantId = req.user?.tenantId;
      const userId = req.user?.userId;

      if (!tenantId || !userId) {
        return next(CustomErrorHandler.unAuthorized("User context missing"));
      }

      const isSuperAdmin = Boolean(req.user?.isSuperAdmin);
      const isTenantAdmin =
        isSuperAdmin ||
        Boolean(
          req.user?.permissions?.includes("tenant.update") ||
          req.user?.permissions?.includes("tenant.read")
        );

      // Find user's assigned offices
      const userAssignedOfficeRecords = await db
        .select({ officeId: userScopeOffices.officeId })
        .from(userScopeOffices)
        .innerJoin(userScopes, eq(userScopeOffices.userScopeId, userScopes.id))
        .where(eq(userScopes.userId, userId));

      const assignedOfficeIds = userAssignedOfficeRecords.map((r: { officeId: string }) => r.officeId);

      // Setup SSE Headers
      res.setHeader("Content-Type", "text/event-stream");
      res.setHeader("Cache-Control", "no-cache, no-transform");
      res.setHeader("Connection", "keep-alive");
      res.setHeader("X-Accel-Buffering", "no");
      res.flushHeaders();

      // Send initial connection event
      res.write(`event: connected\ndata: ${JSON.stringify({ status: "connected", time: new Date().toISOString() })}\n\n`);

      // Event listener callback
      const onNotification = (notif: typeof notifications.$inferSelect) => {
        try {
          // Must belong to the same tenant
          if (notif.tenantId !== tenantId) return;

          // Check if user is recipient or has visibility
          if (isTenantAdmin) {
            // Tenant admins receive all tenant notifications
            res.write(`event: notification\ndata: ${JSON.stringify(notif)}\n\n`);
          } else {
            // Explicit user match OR unassigned/office notification matching user's office scope
            const isDirectRecipient = notif.userId === userId;
            const isBroadcastToOffice = !notif.userId && (!notif.officeId || assignedOfficeIds.includes(notif.officeId));

            if (isDirectRecipient || isBroadcastToOffice) {
              res.write(`event: notification\ndata: ${JSON.stringify(notif)}\n\n`);
            }
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
