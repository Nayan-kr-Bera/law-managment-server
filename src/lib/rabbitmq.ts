import amqp, { Channel, ChannelModel } from "amqplib";
import { config } from "../config/index.js";

let connection: ChannelModel | null = null;
let channel: Channel | null = null;
let isConnecting = false;
let isShuttingDown = false;
let reconnectTimer: NodeJS.Timeout | null = null;
let reconnectDelayMs = 5000;
let reconnectAttemptCount = 0;
let lastErrorMessage: string | null = null;

const MAX_RECONNECT_DELAY_MS = 30000;
export const REMINDER_EMAIL_QUEUE = "reminder_email_queue";

export type RabbitMQStatus = "connected" | "connecting" | "reconnecting" | "disconnected";

interface RegisteredConsumer {
  queue: string;
  handler: (data: unknown) => Promise<void>;
  isSubscribed?: boolean;
}

const registeredConsumers: Map<string, (data: unknown) => Promise<void>> = new Map();

export function getRabbitMQHealth(): {
  status: RabbitMQStatus;
  attemptCount: number;
  isHealthy: boolean;
  activeConsumers: number;
  lastError: string | null;
} {
  const isHealthy = Boolean(channel && connection && !isShuttingDown);
  const status: RabbitMQStatus = isHealthy
    ? "connected"
    : isConnecting
      ? "connecting"
      : reconnectTimer
        ? "reconnecting"
        : "disconnected";

  return {
    status,
    attemptCount: reconnectAttemptCount,
    isHealthy,
    activeConsumers: registeredConsumers.size,
    lastError: lastErrorMessage,
  };
}

async function subscribeQueue(
  ch: Channel,
  queue: string,
  handler: (data: unknown) => Promise<void>
): Promise<void> {
  await ch.assertQueue(queue, { durable: true });
  ch.prefetch(5);

  console.log(`📡 [RabbitMQ Consumer] Worker active & listening on queue: "${queue}"`);

  await ch.consume(
    queue,
    async (msg) => {
      if (!msg) return;
      try {
        const content: unknown = JSON.parse(msg.content.toString());
        console.log(`📥 [RabbitMQ Consumer] Received job from "${queue}" [DeliveryTag: ${msg.fields.deliveryTag}]`);
        await handler(content);
        ch.ack(msg);
        console.log(`✔️ [RabbitMQ Consumer] Job acknowledged (ACK) [DeliveryTag: ${msg.fields.deliveryTag}]`);
      } catch (err) {
        console.error(`❌ [RabbitMQ Consumer] Job execution error on queue "${queue}":`, err);
        ch.nack(msg, false, false);
      }
    },
    { noAck: false }
  );
}

/**
 * Connect to RabbitMQ broker and initialize channel.
 * Thread-safe with singleton connection and automatic recovery on drops.
 */
export async function connectRabbitMQ(): Promise<Channel | null> {
  if (channel && connection) return channel;
  if (isShuttingDown) return null;

  if (isConnecting) {
    for (let i = 0; i < 20; i++) {
      await new Promise((res) => setTimeout(res, 200));
      if (channel) return channel;
    }
  }

  isConnecting = true;
  const isReconnecting = reconnectAttemptCount > 0;

  try {
    const rawUrl = config.RABBITMQ_URL || "amqp://guest:guest@localhost:5672";
    const maskedUrl = rawUrl.replace(/:[^:@]+@/, ":****@");

      if (isReconnecting) {
        console.log(`\n🔄 [RabbitMQ Health] Attempting reconnection (Attempt #${reconnectAttemptCount}) to broker at: ${maskedUrl}...`);
      } else {
        console.log(`🐰 [RabbitMQ] Connecting to broker at: ${maskedUrl}...`);
      }

      const conn: ChannelModel = await amqp.connect(rawUrl);
      const ch: Channel = await conn.createChannel();

      await ch.assertQueue(REMINDER_EMAIL_QUEUE, { durable: true });

      connection = conn;
      channel = ch;

        if (isReconnecting) {
          console.log(`✅ [RabbitMQ Health] Reconnected successfully after ${reconnectAttemptCount} attempt(s)! Connection fully restored.`);
          // Re-attach consumers only upon re-connection
          if (registeredConsumers.size > 0) {
            console.log(`📡 [RabbitMQ Health] Restoring ${registeredConsumers.size} background worker(s)...`);
            for (const [queue, handler] of registeredConsumers.entries()) {
              try {
                await subscribeQueue(ch, queue, handler);
              } catch (err) {
                console.error(`❌ [RabbitMQ Health] Failed to re-attach consumer for queue "${queue}":`, err);
              }
            }
          }
        } else {
          console.log(`✅ [RabbitMQ] Connected successfully! Queue "${REMINDER_EMAIL_QUEUE}" is ready.`);
        }

        reconnectDelayMs = 5000;
        reconnectAttemptCount = 0;
        lastErrorMessage = null;

        conn.on("error", (err: unknown) => {
          const errMsg = (err as Error)?.message || String(err);
          lastErrorMessage = errMsg;
          if (!isShuttingDown) {
            console.error(`\n❌ [RabbitMQ Health] Broker connection error: ${errMsg}`);
            console.warn(`ℹ️  [Server Health] Rest of the server (HTTP APIs, Express, Drizzle DB, Socket.IO) remains 100% operational.`);
            scheduleReconnect();
          }
        });

        conn.on("close", () => {
          if (!isShuttingDown) {
            console.warn(`\n⚠️  [RabbitMQ Health] Connection closed unexpectedly. Triggering automatic self-healing reconnect...`);
            console.warn(`ℹ️  [Server Health] Rest of the server (HTTP APIs, Express, Drizzle DB, Socket.IO) remains 100% operational.`);
            scheduleReconnect();
          }
        });

        return channel;
      } catch (error) {
        const errMessage = (error as Error)?.message || String(error);
        lastErrorMessage = errMessage;

          if (isReconnecting) {
            console.warn(`⚠️  [RabbitMQ Health] Reconnect attempt #${reconnectAttemptCount} failed (${errMessage}).`);
          } else {
            console.warn(
              `⚠️  [RabbitMQ] Initial connection failed (${errMessage}). Queue operations will run in offline fallback mode.`
            );
          }

          console.warn(`ℹ️  [Server Health] All other services (DB, Socket.IO, REST APIs) are unaffected and active.`);
          scheduleReconnect();
          return null;
        } finally {
          isConnecting = false;
        }
      }

      function cleanup(): void {
        try {
        channel?.close().catch(() => { });
      } catch { }
      try {
        connection?.close().catch(() => { });
      } catch { }
      channel = null;
      connection = null;
    }

    function scheduleReconnect(): void {
      cleanup();

      if (isShuttingDown || reconnectTimer) return;

      reconnectAttemptCount++;
      const waitSeconds = Math.round(reconnectDelayMs / 1000);

      console.log(
        `⏳ [RabbitMQ Health] Reconnection timer started: Attempt #${reconnectAttemptCount} scheduled in ${waitSeconds}s... (Exponential backoff max: ${Math.round(MAX_RECONNECT_DELAY_MS / 1000)}s)`
      );

      reconnectTimer = setTimeout(async () => {
        reconnectTimer = null;
        if (isShuttingDown) return;

        console.log(`⏱️  [RabbitMQ Health] Timer expired -> Triggering reconnection attempt #${reconnectAttemptCount}...`);
        const ch = await connectRabbitMQ();
        if (!ch) {
          reconnectDelayMs = Math.min(reconnectDelayMs * 1.5, MAX_RECONNECT_DELAY_MS);
        }
      }, reconnectDelayMs);
    }

    export async function publishToQueue(queue: string, data: object): Promise<boolean> {
      try {
        const ch = await connectRabbitMQ();
        if (!ch) {
          console.warn(`⚠️ [RabbitMQ Fallback] Broker offline. Queue "${queue}" falling back to offline handling.`);
          return false;
        }
        const message = Buffer.from(JSON.stringify(data));
        const sent = ch.sendToQueue(queue, message, { persistent: true });
        console.log(`📤 [RabbitMQ Producer] Published job to queue "${queue}":`, JSON.stringify(data).slice(0, 120) + "...");
        return sent;
      } catch (error) {
        console.error(`❌ [RabbitMQ Producer] Error publishing message to queue "${queue}":`, error);
        scheduleReconnect();
        return false;
      }
    }

    export async function consumeFromQueue<T>(
      queue: string,
      handler: (data: T) => Promise<void>
    ): Promise<void> {
      const handlerFn = handler as (data: unknown) => Promise<void>;
      registeredConsumers.set(queue, handlerFn);

      try {
        const ch = await connectRabbitMQ();
        if (!ch) {
          console.warn(`⚠️ [RabbitMQ Fallback] Broker offline. Consumer for "${queue}" queued for auto-start upon reconnection.`);
          return;
        }

        await subscribeQueue(ch, queue, handlerFn);
      } catch (error) {
        console.error(`❌ [RabbitMQ Consumer] Error consuming from queue "${queue}":`, error);
        scheduleReconnect();
      }
    }

    /**
     * Gracefully close RabbitMQ during server shutdown without emitting ECONNRESET errors.
     */
    export async function closeRabbitMQ(): Promise<void> {
      isShuttingDown = true;
      if (reconnectTimer) {
        clearTimeout(reconnectTimer);
        reconnectTimer = null;
      }
      try {
        if (channel) {
          await channel.close().catch(() => { });
        }
        if (connection) {
          await connection.close().catch(() => { });
        }
        console.log("🛑 [RabbitMQ] Connection closed gracefully during shutdown.");
      } catch {
        // Ignore close errors during process exit
      } finally {
        channel = null;
        connection = null;
      }
    }
