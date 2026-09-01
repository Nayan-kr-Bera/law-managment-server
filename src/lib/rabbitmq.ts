import amqp, { Channel, ChannelModel } from "amqplib";
import { config } from "../config/index.js";

let connection: ChannelModel | null = null;
let channel: Channel | null = null;

export const REMINDER_EMAIL_QUEUE = "reminder_email_queue";

export async function connectRabbitMQ(): Promise<Channel | null> {
  if (channel) return channel;

  try {
    const url = config.RABBITMQ_URL || "amqp://guest:guest@localhost:5672";
    const conn: ChannelModel = await amqp.connect(url);
    connection = conn;
    const ch: Channel = await conn.createChannel();
    channel = ch;

    await ch.assertQueue(REMINDER_EMAIL_QUEUE, { durable: true });

    console.log("🐰 Connected to RabbitMQ successfully");

    conn.on("error", (err: unknown) => {
      console.error("RabbitMQ connection error:", err);
      channel = null;
      connection = null;
    });

    conn.on("close", () => {
      console.log("RabbitMQ connection closed");
      channel = null;
      connection = null;
    });

    return channel;
  } catch (error) {
    console.warn(
      "⚠️ RabbitMQ connection failed. Queue operations will be skipped or degraded:",
      (error as Error).message
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
      console.warn(`[RabbitMQ fallback] RabbitMQ offline. Queue payload skipped for ${queue}`);
      return false;
    }
    const message = Buffer.from(JSON.stringify(data));
    ch.sendToQueue(queue, message, { persistent: true });
    return true;
  } catch (error) {
    console.error(`Error publishing message to queue ${queue}:`, error);
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
      console.warn(`[RabbitMQ fallback] RabbitMQ offline. Consumer for ${queue} not started.`);
      return;
    }

    await ch.assertQueue(queue, { durable: true });
    ch.prefetch(5);

    console.log(`📡 Registered worker consumer for queue: ${queue}`);

    ch.consume(
      queue,
      async (msg) => {
        if (!msg) return;
        try {
          const content: T = JSON.parse(msg.content.toString());
          await handler(content);
          ch.ack(msg);
        } catch (err) {
          console.error(`Error processing message from ${queue}:`, err);
          ch.nack(msg, false, false);
        }
      },
      { noAck: false }
    );
  } catch (error) {
    console.error(`Error consuming from queue ${queue}:`, error);
  }
}
