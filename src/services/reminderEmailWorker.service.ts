import { eq } from "drizzle-orm";
import nodemailer from "nodemailer";
import { config } from "../config/index.js";
import { consumeFromQueue, REMINDER_EMAIL_QUEUE } from "../lib/rabbitmq.js";
import db from "../db/index.js";
import { notificationLogs, notificationQueue } from "../db/schema/index.js";

const transporter = nodemailer.createTransport({
  host: config.SMTP_HOST,
  port: Number(config.SMTP_PORT),
  secure: config.SMTP_SRC === "true",
  auth: {
    user: config.SMTP_MAIL,
    pass: config.SMTP_PASS,
  },
});

export interface ReminderEmailJob {
  reminderId: string;
  tenantId: string;
  officeId: string;
  recipients: string[];
  reminderText: string;
  frequency: string;
  clientName?: string | null;
  caseNo?: string | null;
  stage?: string | null;
  courtNo?: string | null;
  hearingDate?: string | null;
  daysRemaining?: number;
  googleCalendarUrl?: string;
  isHearingReminder?: boolean;
}

export async function sendReminderEmail(job: ReminderEmailJob): Promise<boolean> {
  const {
    recipients,
    reminderText,
    frequency,
    clientName,
    caseNo,
    stage,
    courtNo,
    hearingDate,
    daysRemaining,
    googleCalendarUrl,
    isHearingReminder,
    tenantId,
    officeId,
  } = job;

  if (!recipients || recipients.length === 0) {
    console.warn(`No email recipients specified for reminder ${job.reminderId}`);
    return false;
  }

  const subject = isHearingReminder
    ? `[Hearing Reminder] ${caseNo ? `Case ${caseNo}: ` : ""}${daysRemaining === 0
      ? "TODAY"
      : daysRemaining === 1
        ? "Tomorrow"
        : `${daysRemaining} Days Away`
    }`
    : `[Reminder] ${caseNo ? `Case ${caseNo}: ` : ""}${reminderText.slice(0, 50)}`;

  const daysBadge =
    daysRemaining !== undefined
      ? daysRemaining === 0
        ? '<span style="background:#dc2626; color:#fff; padding:4px 10px; border-radius:12px; font-weight:bold; font-size:12px;">HEARING TODAY</span>'
        : daysRemaining === 1
          ? '<span style="background:#ea580c; color:#fff; padding:4px 10px; border-radius:12px; font-weight:bold; font-size:12px;">HEARING TOMORROW</span>'
          : `<span style="background:#2563eb; color:#fff; padding:4px 10px; border-radius:12px; font-weight:bold; font-size:12px;">${daysRemaining} DAYS REMAINING</span>`
      : "";

  const googleCalButtonHtml = googleCalendarUrl
    ? `
      <div style="text-align: center; margin: 24px 0;">
        <a href="${googleCalendarUrl}" target="_blank" style="display: inline-block; background-color: #1a73e8; color: #ffffff; font-weight: bold; font-size: 15px; text-decoration: none; padding: 12px 24px; border-radius: 6px; box-shadow: 0 2px 4px rgba(0,0,0,0.15);">
          📅 Add to Google Calendar
        </a>
      </div>
    `
    : "";

  const htmlBody = `
<!DOCTYPE html>
<html>
<head>
  <meta charset="UTF-8" />
  <title>Law Practice System Reminder</title>
</head>
<body style="font-family: Arial, sans-serif; background: #f5f6f8; margin: 0; padding: 20px; color: #333;">
  <table width="100%" max-width="600px" style="background: #ffffff; border-radius: 8px; border: 1px solid #e5e7eb; margin: 0 auto; padding: 24px;">
    <tr>
      <td style="background: #5b2d8e; color: #fff; padding: 16px 24px; border-radius: 6px 6px 0 0; text-align: center;">
        <h2 style="margin: 0; font-size: 20px;">Law Practice System — ${isHearingReminder ? "Case Hearing Reminder" : "Reminder Notification"
    }</h2>
      </td>
    </tr>
    <tr>
      <td style="padding: 24px 12px;">
        <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 12px;">
          <p style="font-size: 15px; line-height: 1.6; margin: 0;">Hello,</p>
          ${daysBadge}
        </div>
        <p style="font-size: 15px; line-height: 1.6;">This is an automated advance reminder for an upcoming case hearing:</p>

        <div style="background: #f8f6fb; border-left: 4px solid #5b2d8e; padding: 16px; margin: 20px 0; border-radius: 4px;">
          <p style="margin: 0 0 8px 0; font-size: 16px; font-weight: bold; color: #5b2d8e;">Reminder:</p>
          <p style="margin: 0; font-size: 15px; line-height: 1.5; color: #222;">${reminderText}</p>
        </div>

        <table width="100%" style="font-size: 14px; color: #555; margin-bottom: 20px; border-collapse: collapse;">
          ${caseNo ? `<tr><td width="35%" style="padding: 6px 0; border-bottom: 1px solid #f0f0f0;"><strong>Case Number:</strong></td><td style="padding: 6px 0; border-bottom: 1px solid #f0f0f0;">${caseNo}</td></tr>` : ""}
          ${hearingDate ? `<tr><td width="35%" style="padding: 6px 0; border-bottom: 1px solid #f0f0f0;"><strong>Hearing Date:</strong></td><td style="padding: 6px 0; border-bottom: 1px solid #f0f0f0;">${hearingDate}</td></tr>` : ""}
          ${stage ? `<tr><td width="35%" style="padding: 6px 0; border-bottom: 1px solid #f0f0f0;"><strong>Stage:</strong></td><td style="padding: 6px 0; border-bottom: 1px solid #f0f0f0;">${stage}</td></tr>` : ""}
          ${courtNo ? `<tr><td width="35%" style="padding: 6px 0; border-bottom: 1px solid #f0f0f0;"><strong>Court / Room:</strong></td><td style="padding: 6px 0; border-bottom: 1px solid #f0f0f0;">${courtNo}</td></tr>` : ""}
          ${clientName ? `<tr><td width="35%" style="padding: 6px 0; border-bottom: 1px solid #f0f0f0;"><strong>Client:</strong></td><td style="padding: 6px 0; border-bottom: 1px solid #f0f0f0;">${clientName}</td></tr>` : ""}
          <tr><td width="35%" style="padding: 6px 0;"><strong>Notification:</strong></td><td style="padding: 6px 0;">${frequency}</td></tr>
        </table>

        ${googleCalButtonHtml}

        <p style="font-size: 13px; color: #888; margin-top: 30px; border-top: 1px solid #eee; padding-top: 16px;">
          This email was sent automatically by your Law Practice Management System. Please do not reply directly.
        </p>
      </td>
    </tr>
  </table>
</body>
</html>
`;

  let successCount = 0;

  for (const recipient of recipients) {
    const cleanRecipient = recipient.trim();
    if (!cleanRecipient) continue;

    try {
      // 1. Insert into notificationQueue
      const [queueItem] = await db
        .insert(notificationQueue)
        .values({
          tenantId: tenantId || null,
          officeId: officeId || null,
          channel: "email",
          recipient: cleanRecipient,
          payload: { reminderId: job.reminderId, subject, body: reminderText, googleCalendarUrl },
          status: "pending",
        })
        .returning();

      // 2. Send email via Nodemailer
      const info = await transporter.sendMail({
        from: config.SMTP_MAIL,
        to: cleanRecipient,
        subject,
        html: htmlBody,
      });

      // 3. Log success
      if (queueItem) {
        await db
          .update(notificationQueue)
          .set({ status: "sent", sentAt: new Date() })
          .where(eq(notificationQueue.id, queueItem.id));

        await db.insert(notificationLogs).values({
          queueId: queueItem.id,
          provider: "nodemailer",
          response: info.response || "Sent successfully",
          status: "success",
        });
      }

      console.log(`✉️ Reminder email sent successfully to ${cleanRecipient}`);
      successCount++;
    } catch (err) {
      console.error(`Failed to send reminder email to ${cleanRecipient}:`, err);
    }
  }

  return successCount > 0;
}

export function startReminderWorker(): void {
  void consumeFromQueue<ReminderEmailJob>(REMINDER_EMAIL_QUEUE, async (job) => {
    console.log(`⚙️ Processing reminder email job for reminder ID: ${job.reminderId}`);
    await sendReminderEmail(job);
  });
}
