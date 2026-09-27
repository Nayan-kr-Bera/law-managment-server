import amqp, { Channel, ChannelModel } from "amqplib";
import { config } from "../config/index.js";

let connection: ChannelModel | null = null;
let channel: Channel | null = null;

export const REMINDER_EMAIL_QUEUE = "reminder_email_queue";

export async function connectRabbitMQ(): Promise<Channel | null> {
  if (channel) return channel;

  try {
    const url = config.RABBITMQ_URL || "amqp://guest:guest@localhost:5672";
    console.log(`🐰 [RabbitMQ] Connecting to broker at: ${url.replace(/:[^:@]+@/, ":****@")}...`);
    const conn: ChannelModel = await amqp.connect(url);
    connection = conn;
    const ch: Channel = await conn.createChannel();
    channel = ch;

    await ch.assertQueue(REMINDER_EMAIL_QUEUE, { durable: true });

    console.log(`✅ [RabbitMQ] Connected successfully! Queue "${REMINDER_EMAIL_QUEUE}" is ready.`);

    conn.on("error", (err: unknown) => {
      console.error("❌ [RabbitMQ] Connection error:", err);
      channel = null;
      connection = null;
    });

    conn.on("close", () => {
      console.warn("⚠️ [RabbitMQ] Connection closed");
      channel = null;
      connection = null;
    });

    return channel;
  } catch (error) {
    console.warn(
      `⚠️ [RabbitMQ] Connection failed (${(error as Error).message}). Queue operations will run in offline fallback mode.`
    );
    channel = null;
    connection = null;
    return null;
  }
}

export async function publishToQueue(queue: string, data: object): Promise<boolean> {
  try {
    const ch = await connectRabbitMQ();
    if (!ch) {
      console.warn(`⚠️ [RabbitMQ Fallback] RabbitMQ offline. Message skipped for queue: "${queue}"`);
      return false;
    }
    const message = Buffer.from(JSON.stringify(data));
    const sent = ch.sendToQueue(queue, message, { persistent: true });
    console.log(`📤 [RabbitMQ Producer] Published job to queue "${queue}":`, JSON.stringify(data).slice(0, 120) + "...");
    return sent;
  } catch (error) {
    console.error(`❌ [RabbitMQ Producer] Error publishing message to queue "${queue}":`, error);
    return false;
  }
}

export async function consumeFromQueue<T>(
  queue: string,
  handler: (data: T) => Promise<void>
): Promise<void> {
  try {
    const ch = await connectRabbitMQ();
    if (!ch) {
      console.warn(`⚠️ [RabbitMQ Fallback] RabbitMQ offline. Consumer for "${queue}" not started.`);
      return;
    }

    await ch.assertQueue(queue, { durable: true });
    ch.prefetch(5);

    console.log(`📡 [RabbitMQ Consumer] Worker listening on queue: "${queue}"`);

    ch.consume(
      queue,
      async (msg) => {
        if (!msg) return;
        try {
          const content: T = JSON.parse(msg.content.toString());
          console.log(`📥 [RabbitMQ Consumer] Received message from "${queue}" [DeliveryTag: ${msg.fields.deliveryTag}]`);
          await handler(content);
          ch.ack(msg);
          console.log(`✔️ [RabbitMQ Consumer] Message acknowledged (ACK) for tag ${msg.fields.deliveryTag}`);
        } catch (err) {
          console.error(`❌ [RabbitMQ Consumer] Error processing message from "${queue}":`, err);
          ch.nack(msg, false, false);
        }
      },
      { noAck: false }
    );
  } catch (error) {
    console.error(`❌ [RabbitMQ Consumer] Error consuming from queue "${queue}":`, error);
  }
}
