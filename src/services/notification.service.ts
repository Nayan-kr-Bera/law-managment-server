import { EventEmitter } from "events";
import db from "../db/index.js";
import { notifications } from "../db/schema/index.js";

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

export const createNotification = async (params: CreateNotificationParams) => {
  try {
    const [notif] = await db
      .insert(notifications)
      .values({
        tenantId: params.tenantId,
        officeId: params.officeId || null,
        userId: params.userId || null,
        title: params.title,
        body: params.body,
        type: params.type,
        status: "pending",
      })
      .returning();

    if (notif) {
      notificationEvents.emit("notification:new", notif);
    }

    return notif;
  } catch (error) {
    console.error("Failed to create notification:", error);
    return null;
  }
};

export default {
  createNotification,
  notificationEvents,
};

