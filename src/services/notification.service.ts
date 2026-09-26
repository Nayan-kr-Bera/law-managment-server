import { EventEmitter } from "events";
import { and, eq } from "drizzle-orm";
import db from "../db/index.js";
import { notifications, userScopes, userScopeOffices } from "../db/schema/index.js";

export const notificationEvents = new EventEmitter();
notificationEvents.setMaxListeners(0); // Unlimited listeners for active SSE connections

export interface CreateNotificationParams {
  tenantId: string;
  officeId?: string | null;
  userId?: string | null;
  title: string;
  body: string;
  type: "system" | "case" | "hearing" | "task" | "appointment" | "invoice" | "payment" | "reminder";
}

/**
 * Creates notifications using User-Isolated Fan-Out (Approach A).
 * If a specific userId is provided, a single user-specific notification is created.
 * If no userId is provided (e.g. office broadcast), it creates a dedicated notification
 * record for every active member of that office/tenant so each user's read/delete actions
 * are completely isolated and never affect others.
 */
export const createNotification = async (params: CreateNotificationParams) => {
  try {
    if (!params.tenantId) return null;

    // 1. Direct user-targeted notification
    if (params.userId) {
      const [notif] = await db
        .insert(notifications)
        .values({
          tenantId: params.tenantId,
          officeId: params.officeId || null,
          userId: params.userId,
          title: params.title,
          body: params.body,
          type: params.type,
          status: "pending",
        })
        .returning();

      if (notif) {
        notificationEvents.emit("notification:new", notif);
      }

      return [notif];
    }

    // 2. Broadcast to Office or Tenant -> Fan-out to all active members
    let targetUserIds: string[] = [];

    if (params.officeId) {
      const userRecords = await db
        .select({ userId: userScopes.userId })
        .from(userScopeOffices)
        .innerJoin(userScopes, eq(userScopeOffices.userScopeId, userScopes.id))
        .where(
          and(
            eq(userScopes.tenantId, params.tenantId),
            eq(userScopeOffices.officeId, params.officeId)
          )
        );
      targetUserIds = [
        ...new Set(
          userRecords
            .map((u) => u.userId)
            .filter((id): id is string => typeof id === "string" && id.length > 0)
        ),
      ];
    } else {
      const userRecords = await db
        .select({ userId: userScopes.userId })
        .from(userScopes)
        .where(eq(userScopes.tenantId, params.tenantId));
      targetUserIds = [
        ...new Set(
          userRecords
            .map((u) => u.userId)
            .filter((id): id is string => typeof id === "string" && id.length > 0)
        ),
      ];
    }

    // Fallback if no target users found
    if (targetUserIds.length === 0) {
      const [singleNotif] = await db
        .insert(notifications)
        .values({
          tenantId: params.tenantId,
          officeId: params.officeId || null,
          userId: null,
          title: params.title,
          body: params.body,
          type: params.type,
          status: "pending",
        })
        .returning();

      if (singleNotif) {
        notificationEvents.emit("notification:new", singleNotif);
      }
      return [singleNotif];
    }

    // Fan-out: Insert individual records per user
    const insertPayload = targetUserIds.map((uid) => ({
      tenantId: params.tenantId,
      officeId: params.officeId || null,
      userId: uid,
      title: params.title,
      body: params.body,
      type: params.type,
      status: "pending" as const,
    }));

    const createdRecords = await db.insert(notifications).values(insertPayload).returning();

    for (const record of createdRecords) {
      notificationEvents.emit("notification:new", record);
    }

    return createdRecords;
  } catch (error) {
    console.error("Failed to create notification(s):", error);
    return null;
  }
};

export default {
  createNotification,
  notificationEvents,
};
