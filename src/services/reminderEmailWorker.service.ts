import { eq } from "drizzle-orm";
import nodemailer from "nodemailer";
import { config } from "../config/index.js";
import { consumeFromQueue, REMINDER_EMAIL_QUEUE } from "../lib/rabbitmq.js";
import db from "../db/index.js";
import { notificationLogs, notificationQueue } from "../db/schema/index.js";
import {
  buildMiLawEmailHtml,
  escapeHtml,
  getMiLawLogoAttachments,
} from "./emailBrandLayout.js";

const port = Number(process.env.SMTP_PORT) || 2525;
const isSecure = port === 465 || process.env.SMTP_SRC === "true";

const transporter = nodemailer.createTransport({
  host: process.env.SMTP_HOST || "mail.smtp2go.com",
  port,
  secure: isSecure,
  ...(isSecure ? {} : { requireTLS: true }),
  auth: {
    user: process.env.SMTP_USER || process.env.SMTP_MAIL,
    pass: process.env.SMTP_PASSWORD || process.env.SMTP_PASS,
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
  firmName?: string | null;
}

export async function sendReminderEmail(
  job: ReminderEmailJob,
): Promise<boolean> {
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
    firmName,
  } = job;

  if (!recipients || recipients.length === 0) {
    console.warn(`No email recipients specified for reminder ${job.reminderId}`);
    return false;
  }

  const dashboardUrl =
    config.ORIGIN_CLIENT || config.ORIGIN_FRONTEND || "http://localhost:5173";

  const formattedHearingDate = hearingDate
    ? new Date(hearingDate).toLocaleDateString("en-IN", {
        weekday: "long",
        day: "2-digit",
        month: "short",
        year: "numeric",
      })
    : null;

  const isUrgent = daysRemaining !== undefined && daysRemaining <= 1;

  const urgencyText =
    daysRemaining === 0
      ? "Hearing is TODAY"
      : daysRemaining === 1
        ? "Hearing is TOMORROW"
        : daysRemaining !== undefined
          ? `Upcoming in ${daysRemaining} Days`
          : frequency || "Scheduled Reminder";

  const badgeStyle = isUrgent
    ? "background-color:#fef2f2;color:#dc2626;border:1px solid #fecaca;"
    : "background-color:#fffbeb;color:#d97706;border:1px solid #fde68a;";

  const badgeHtml = `<span style="display:inline-block;${badgeStyle}font-size:11px;font-weight:700;padding:4px 12px;border-radius:20px;text-transform:uppercase;letter-spacing:0.6px;">⏰ ${escapeHtml(urgencyText)}</span>`;

  const hasCaseMetadata = Boolean(
    caseNo || clientName || stage || courtNo || formattedHearingDate,
  );

  const caseTableHtml = hasCaseMetadata
    ? `
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#f8fafc;border:1px solid #e2e8f0;border-radius:10px;margin-bottom:24px;">
      <tr>
        <td style="padding:18px 20px;">
          <p style="margin:0 0 12px;font-size:11px;font-weight:700;text-transform:uppercase;letter-spacing:0.8px;color:#64748b;">
            Court Cause-List &amp; Matter Particulars
          </p>
          <table role="presentation" width="100%" cellpadding="0" cellspacing="0">
            ${
              formattedHearingDate
                ? `<tr>
                    <td style="padding:7px 0;color:#64748b;font-size:13px;width:140px;border-bottom:1px solid #f1f5f9;">Hearing Date</td>
                    <td style="padding:7px 0;color:${isUrgent ? "#dc2626" : "#0f172a"};font-size:14px;font-weight:800;border-bottom:1px solid #f1f5f9;">${escapeHtml(formattedHearingDate)} (${escapeHtml(urgencyText)})</td>
                  </tr>`
                : ""
            }
            ${
              caseNo
                ? `<tr>
                    <td style="padding:7px 0;color:#64748b;font-size:13px;border-bottom:1px solid #f1f5f9;">Case Number</td>
                    <td style="padding:7px 0;color:#0f172a;font-size:13px;font-weight:700;font-family:monospace;border-bottom:1px solid #f1f5f9;">${escapeHtml(caseNo)}</td>
                  </tr>`
                : ""
            }
            ${
              clientName
                ? `<tr>
                    <td style="padding:7px 0;color:#64748b;font-size:13px;border-bottom:1px solid #f1f5f9;">Client / Party</td>
                    <td style="padding:7px 0;color:#0f172a;font-size:13px;font-weight:600;border-bottom:1px solid #f1f5f9;">${escapeHtml(clientName)}</td>
                  </tr>`
                : ""
            }
            ${
              stage
                ? `<tr>
                    <td style="padding:7px 0;color:#64748b;font-size:13px;border-bottom:1px solid #f1f5f9;">Stage / Fixed For</td>
                    <td style="padding:7px 0;color:#4f46e5;font-size:13px;font-weight:700;border-bottom:1px solid #f1f5f9;">${escapeHtml(stage)}</td>
                  </tr>`
                : ""
            }
            ${
              courtNo
                ? `<tr>
                    <td style="padding:7px 0;color:#64748b;font-size:13px;">Court / Room No.</td>
                    <td style="padding:7px 0;color:#0f172a;font-size:13px;font-weight:600;">${escapeHtml(courtNo)}</td>
                  </tr>`
                : ""
            }
          </table>
        </td>
      </tr>
    </table>`
    : "";

  const bodyHtml = `
    <p style="margin:0 0 16px;color:#475569;font-size:14px;line-height:1.6;">
      This is an automated legal docket reminder from your <strong>MI Law Chamber Workspace</strong>. Please review the matter details and schedule below:
    </p>

    <!-- Reminder Note Callout -->
    <div style="background:${isUrgent ? "#fef2f2" : "#fffbeb"};border-left:4px solid ${isUrgent ? "#dc2626" : "#f59e0b"};padding:14px 18px;border-radius:8px;margin-bottom:22px;">
      <p style="margin:0 0 4px;font-size:11px;font-weight:700;text-transform:uppercase;letter-spacing:0.8px;color:${isUrgent ? "#b91c1c" : "#b45309"};">
        Reminder Note (${escapeHtml(frequency || "Scheduled Alert")})
      </p>
      <p style="margin:0;color:#0f172a;font-size:14px;font-weight:600;line-height:1.6;">
        ${escapeHtml(reminderText)}
      </p>
    </div>

    ${caseTableHtml}

    <!-- Action Buttons -->
    <div style="text-align:center;margin:26px 0 8px;">
      <a href="${escapeHtml(dashboardUrl)}" style="display:inline-block;background-color:#0f172a;color:#ffffff;text-decoration:none;padding:12px 26px;border-radius:8px;font-size:14px;font-weight:600;margin:4px 6px;">
        Open Case Docket &rarr;
      </a>
      ${
        googleCalendarUrl
          ? `<a href="${escapeHtml(googleCalendarUrl)}" target="_blank" rel="noopener noreferrer" style="display:inline-block;background-color:#ffffff;color:#0f172a;text-decoration:none;padding:11px 22px;border-radius:8px;font-size:14px;font-weight:600;border:1px solid #cbd5e1;margin:4px 6px;">
              📅 Add to Google Calendar
            </a>`
          : ""
      }
    </div>
  `;

  const subject = isHearingReminder
    ? `[Hearing Reminder] ${caseNo ? `Case ${caseNo}: ` : ""}${
        daysRemaining === 0
          ? "TODAY"
          : daysRemaining === 1
            ? "Tomorrow"
            : `${daysRemaining} Days Away`
      }`
    : `[Reminder] ${caseNo ? `Case ${caseNo}: ` : ""}${reminderText.slice(0, 50)}`;

  const htmlBody = buildMiLawEmailHtml({
    documentTitle: subject,
    brandSubtitle: firmName || "Court Cause-List & Hearing Desk",
    badgeHtml,
    heading: isHearingReminder
      ? "Upcoming Court Hearing Reminder"
      : "Scheduled Chamber Reminder",
    subheading: caseNo
      ? `Case #${escapeHtml(caseNo)}${clientName ? ` • ${escapeHtml(clientName)}` : ""}`
      : "Automated Legal Docket Alert",
    bodyHtml,
    footerReason: `Automated ${escapeHtml(frequency || "Scheduled")} Alert from MI Law`,
    firmName,
  });

  let successCount = 0;

  for (const recipient of recipients) {
    const cleanRecipient = recipient.trim();
    if (!cleanRecipient) continue;

    try {
      const [queueItem] = await db
        .insert(notificationQueue)
        .values({
          tenantId: tenantId || null,
          officeId: officeId || null,
          channel: "email",
          recipient: cleanRecipient,
          payload: {
            reminderId: job.reminderId,
            subject,
            body: reminderText,
            googleCalendarUrl,
          },
          status: "pending",
        })
        .returning();

      const info = await transporter.sendMail({
        from: `"${firmName || config.APP_NAME || "MI Law Docket Alerts"}" <${config.SMTP_MAIL}>`,
        to: cleanRecipient,
        subject,
        html: htmlBody,
        attachments: getMiLawLogoAttachments(),
      });

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

      console.log(
        `✉️ [Email Worker] Email delivered successfully to: ${cleanRecipient} (Subject: "${subject}")`,
      );
      successCount++;
    } catch (err) {
      console.error(
        `❌ [Email Worker] Failed to deliver email to ${cleanRecipient}:`,
        err,
      );
    }
  }

  return successCount > 0;
}

export function startReminderWorker(): void {
  console.log(
    `⚙️ [Email Worker] Initializing RabbitMQ reminder email consumer...`,
  );
  void consumeFromQueue<ReminderEmailJob>(
    REMINDER_EMAIL_QUEUE,
    async (job: ReminderEmailJob) => {
      console.log(
        `\n📨 [Email Worker Task] Processing reminder job [ID: ${job.reminderId}] for ${job.recipients?.length || 0} recipient(s) (Case: ${job.caseNo || "N/A"})`,
      );
      await sendReminderEmail(job);
    },
  );
}

export const startReminderEmailWorker = startReminderWorker;
