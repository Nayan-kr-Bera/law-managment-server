import { eq } from "drizzle-orm";
import db from "../db/index.js";
import clientPushTokens from "../db/schema/clients/clientPushTokens.js";

export interface ExpoPushMessage {
  to: string | string[];
  sound?: "default" | null;
  title: string;
  body: string;
  data?: Record<string, unknown>;
  priority?: "default" | "normal" | "high";
  channelId?: string;
}

/**
 * Sends a push notification to Expo's Push API servers (which route to FCM on Android and APNs on iOS).
 * 100% Free, no credit card or paid account required.
 */
export const sendExpoPushNotification = async (message: ExpoPushMessage) => {
  try {
    const rawTokens = Array.isArray(message.to) ? message.to : [message.to];
    const validTokens = rawTokens.filter(
      (t): t is string =>
        typeof t === "string" &&
        (t.startsWith("ExponentPushToken[") || t.startsWith("ExpoPushToken["))
    );

    if (validTokens.length === 0) {
      return null;
    }

    const payload = validTokens.map((token) => ({
      to: token,
      sound: message.sound ?? "default",
      title: message.title,
      body: message.body,
      data: message.data || {},
      priority: message.priority || "high",
      channelId: "default",
    }));

    const response = await fetch("https://exp.host/--/api/v2/push/send", {
      method: "POST",
      headers: {
        Accept: "application/json",
        "Accept-Encoding": "gzip, deflate",
        "Content-Type": "application/json",
      },
      body: JSON.stringify(payload),
    });

    const result = await response.json();
    console.log("📱 [Expo Push] Sent push notification:", JSON.stringify(result));
    return result;
  } catch (error) {
    console.error("❌ [Expo Push] Error sending push notification:", error);
    return null;
  }
};

/**
 * Looks up all registered Expo push tokens for a client and delivers the push banner to their device(s).
 */
export const sendExpoPushToClient = async (
  clientId: string,
  payload: { title: string; body: string; data?: Record<string, unknown> }
) => {
  try {
    if (!clientId) return null;

    const deviceRecords = await db
      .select({ pushToken: clientPushTokens.pushToken })
      .from(clientPushTokens)
      .where(eq(clientPushTokens.clientId, clientId));

    if (deviceRecords.length === 0) return null;

    const tokens = deviceRecords.map((d) => d.pushToken).filter(Boolean);

    return await sendExpoPushNotification({
      to: tokens,
      title: payload.title,
      body: payload.body,
      data: payload.data,
      sound: "default",
      priority: "high",
    });
  } catch (error) {
    console.error(`❌ [Expo Push] Failed to push to client ${clientId}:`, error);
    return null;
  }
};
