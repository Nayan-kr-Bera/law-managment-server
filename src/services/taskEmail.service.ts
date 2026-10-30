import nodemailer from "nodemailer";
import { config } from "../config/index.js";
import {
  buildMiLawEmailHtml,
  escapeHtml,
  getMiLawLogoAttachments,
} from "./emailBrandLayout.js";

interface TaskAssignmentEmailParams {
  recipientName: string;
  recipientEmail: string;
  taskTitle: string;
  taskDescription?: string | null;
  assignedByName: string;
  dueDate?: string | null;
  priority: string;
  caseTitle?: string | null;
  caseNumber?: string | null;
  courtName?: string | null;
  isReassigned?: boolean;
  firmName?: string | null;
}

export interface TaskDeadlineReminderEmailParams {
  recipientName: string;
  recipientEmail: string;
  recipientRole: "Assignee" | "Creator";
  taskTitle: string;
  dueDate: string;
  priority: string;
  assigneeName?: string | null;
  creatorName?: string | null;
  caseTitle?: string | null;
  caseNumber?: string | null;
  firmName?: string | null;
}

const createTransporter = () => {
  const port = Number(config.SMTP_PORT) || 587;
  const secure = config.SMTP_SRC === "true" || port === 465;

  return nodemailer.createTransport({
    host: config.SMTP_HOST,
    port,
    secure,
    auth: {
      user: config.SMTP_MAIL,
      pass: config.SMTP_PASS,
    },
  });
};

const getPriorityBadgeHtml = (priority?: string) => {
  const p = (priority || "medium").toLowerCase();
  if (p === "high" || p === "urgent" || p === "critical") {
    return `<span style="display:inline-block;padding:3px 10px;background:#fef2f2;color:#dc2626;border:1px solid #fecaca;border-radius:999px;font-size:12px;font-weight:700;text-transform:uppercase;">● ${escapeHtml(priority || "High")} Priority</span>`;
  }
  if (p === "low") {
    return `<span style="display:inline-block;padding:3px 10px;background:#f0fdf4;color:#15803d;border:1px solid #bbf7d0;border-radius:999px;font-size:12px;font-weight:700;text-transform:uppercase;">● Low Priority</span>`;
  }
  return `<span style="display:inline-block;padding:3px 10px;background:#fffbeb;color:#d97706;border:1px solid #fde68a;border-radius:999px;font-size:12px;font-weight:700;text-transform:uppercase;">● ${escapeHtml(priority || "Medium")} Priority</span>`;
};

const formatDueDate = (dueDate?: string | null) => {
  if (!dueDate) return "Open / No Fixed Limitation Date";
  const parsed = new Date(dueDate);
  if (isNaN(parsed.getTime())) return dueDate;
  return parsed.toLocaleDateString("en-IN", {
    weekday: "short",
    day: "2-digit",
    month: "short",
    year: "numeric",
  });
};

export const sendTaskAssignmentEmail = async (
  params: TaskAssignmentEmailParams,
): Promise<{ success: boolean }> => {
  try {
    if (!params.recipientEmail) return { success: false };

    const transporter = createTransporter();
    const dashboardUrl = `${(config.ORIGIN_CLIENT || config.ORIGIN_FRONTEND || "http://localhost:5173").replace(/\/$/, "")}/tasks`;
    const formattedDue = formatDueDate(params.dueDate);

    const badgeHtml = params.isReassigned
      ? `<span style="display:inline-block;background-color:#fffbeb;color:#d97706;font-size:11px;font-weight:700;padding:4px 12px;border-radius:20px;text-transform:uppercase;letter-spacing:0.6px;border:1px solid #fde68a;">Task Reassigned to You</span>`
      : `<span style="display:inline-block;background-color:#eef2ff;color:#4f46e5;font-size:11px;font-weight:700;padding:4px 12px;border-radius:20px;text-transform:uppercase;letter-spacing:0.6px;border:1px solid #c7d2fe;">New Task Assigned</span>`;

    const bodyHtml = `
      <p style="margin:0 0 12px;color:#0f172a;font-size:15px;">
        Hello <strong>${escapeHtml(params.recipientName)}</strong>,
      </p>
      <p style="margin:0 0 24px;color:#475569;font-size:14px;line-height:1.6;">
        <strong>${escapeHtml(params.assignedByName)}</strong> has ${
          params.isReassigned
            ? "reassigned a legal task to you"
            : "assigned a new legal task to your desk"
        }. Please review the task particulars and limitation date below.
      </p>

      <!-- Task Card -->
      <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#f8fafc;border:1px solid #e2e8f0;border-radius:10px;margin-bottom:24px;">
        <tr>
          <td style="padding:18px 20px;">
            <p style="margin:0 0 12px;font-size:11px;font-weight:700;text-transform:uppercase;letter-spacing:0.8px;color:#64748b;">
              Task Brief &amp; Schedule
            </p>
            <table role="presentation" width="100%" cellpadding="0" cellspacing="0">
              <tr>
                <td style="padding:7px 0;color:#64748b;font-size:13px;width:140px;border-bottom:1px solid #f1f5f9;">Task Title</td>
                <td style="padding:7px 0;color:#0f172a;font-size:14px;font-weight:700;border-bottom:1px solid #f1f5f9;">${escapeHtml(params.taskTitle)}</td>
              </tr>
              ${
                params.taskDescription
                  ? `<tr>
                      <td style="padding:7px 0;color:#64748b;font-size:13px;border-bottom:1px solid #f1f5f9;">Instructions</td>
                      <td style="padding:7px 0;color:#334155;font-size:13px;border-bottom:1px solid #f1f5f9;">${escapeHtml(params.taskDescription)}</td>
                    </tr>`
                  : ""
              }
              <tr>
                <td style="padding:7px 0;color:#64748b;font-size:13px;border-bottom:1px solid #f1f5f9;">Priority Level</td>
                <td style="padding:7px 0;border-bottom:1px solid #f1f5f9;">${getPriorityBadgeHtml(params.priority)}</td>
              </tr>
              <tr>
                <td style="padding:7px 0;color:#64748b;font-size:13px;border-bottom:1px solid #f1f5f9;">Due / Limitation</td>
                <td style="padding:7px 0;color:#0f172a;font-size:13px;font-weight:700;border-bottom:1px solid #f1f5f9;">${escapeHtml(formattedDue)}</td>
              </tr>
              <tr>
                <td style="padding:7px 0;color:#64748b;font-size:13px;${params.caseTitle || params.caseNumber || params.courtName ? "border-bottom:1px solid #f1f5f9;" : ""}">Assigned By</td>
                <td style="padding:7px 0;color:#0f172a;font-size:13px;font-weight:600;${params.caseTitle || params.caseNumber || params.courtName ? "border-bottom:1px solid #f1f5f9;" : ""}">${escapeHtml(params.assignedByName)}</td>
              </tr>
              ${
                params.caseTitle || params.caseNumber
                  ? `<tr>
                      <td style="padding:7px 0;color:#64748b;font-size:13px;${params.courtName ? "border-bottom:1px solid #f1f5f9;" : ""}">Linked Matter</td>
                      <td style="padding:7px 0;color:#4f46e5;font-size:13px;font-weight:700;${params.courtName ? "border-bottom:1px solid #f1f5f9;" : ""}">${escapeHtml([params.caseNumber, params.caseTitle].filter(Boolean).join(" — "))}</td>
                    </tr>`
                  : ""
              }
              ${
                params.courtName
                  ? `<tr>
                      <td style="padding:7px 0;color:#64748b;font-size:13px;">Court / Forum</td>
                      <td style="padding:7px 0;color:#0f172a;font-size:13px;font-weight:600;">${escapeHtml(params.courtName)}</td>
                    </tr>`
                  : ""
              }
            </table>
          </td>
        </tr>
      </table>

      <!-- CTA Button -->
      <div style="text-align:center;margin:28px 0 8px;">
        <a href="${escapeHtml(dashboardUrl)}" style="display:inline-block;background-color:#0f172a;color:#ffffff;text-decoration:none;padding:13px 32px;border-radius:8px;font-size:14px;font-weight:600;">
          Open Task Board &rarr;
        </a>
      </div>
    `;

    const subjectPrefix = params.isReassigned
      ? "Task Reassigned"
      : "New Task Assigned";

    const html = buildMiLawEmailHtml({
      documentTitle: `${subjectPrefix}: ${params.taskTitle}`,
      brandSubtitle: params.firmName || "Chamber Task & Workflow Desk",
      badgeHtml,
      heading: params.isReassigned
        ? "Task Reassigned to Your Desk"
        : "New Legal Task Assigned",
      subheading: escapeHtml(params.taskTitle),
      bodyHtml,
      footerReason: "Automated Chamber Workflow Notification from MI Law",
      firmName: params.firmName,
    });

    await transporter.sendMail({
      from: `"${params.firmName || config.APP_NAME || "MI Law Workflow"}" <${config.SMTP_MAIL}>`,
      to: params.recipientEmail,
      subject: `${subjectPrefix}: ${params.taskTitle}${params.caseNumber ? ` [${params.caseNumber}]` : ""}`,
      html,
      attachments: getMiLawLogoAttachments(),
    });

    return { success: true };
  } catch (error) {
    console.error("Failed to send task assignment email:", error);
    return { success: false };
  }
};

export const sendTaskDeadlineReminderEmail = async (
  params: TaskDeadlineReminderEmailParams,
): Promise<{ success: boolean }> => {
  try {
    if (!params.recipientEmail) return { success: false };

    const transporter = createTransporter();
    const dashboardUrl = `${(config.ORIGIN_CLIENT || config.ORIGIN_FRONTEND || "http://localhost:5173").replace(/\/$/, "")}/tasks`;
    const formattedDue = formatDueDate(params.dueDate);

    const badgeHtml = `<span style="display:inline-block;background-color:#fef2f2;color:#dc2626;font-size:11px;font-weight:700;padding:4px 12px;border-radius:20px;text-transform:uppercase;letter-spacing:0.6px;border:1px solid #fecaca;">⏰ Due Tomorrow • 24h Alert</span>`;

    const roleExplanation =
      params.recipientRole === "Assignee"
        ? `This is a 24-hour advance reminder that a task assigned to you is <strong>due tomorrow (${escapeHtml(formattedDue)})</strong>.`
        : `This is a 24-hour supervisory reminder that a task created by you (assigned to <strong>${escapeHtml(params.assigneeName || "Unassigned")}</strong>) is <strong>due tomorrow (${escapeHtml(formattedDue)})</strong>.`;

    const bodyHtml = `
      <p style="margin:0 0 12px;color:#0f172a;font-size:15px;">
        Hello <strong>${escapeHtml(params.recipientName)}</strong>,
      </p>
      <p style="margin:0 0 24px;color:#475569;font-size:14px;line-height:1.6;">
        ${roleExplanation}
      </p>

      <!-- Deadline Summary Card -->
      <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#fef2f2;border:1px solid #fecaca;border-radius:10px;margin-bottom:24px;">
        <tr>
          <td style="padding:18px 20px;">
            <p style="margin:0 0 12px;font-size:11px;font-weight:700;text-transform:uppercase;letter-spacing:0.8px;color:#b91c1c;">
              Upcoming Task Limitation Details
            </p>
            <table role="presentation" width="100%" cellpadding="0" cellspacing="0">
              <tr>
                <td style="padding:7px 0;color:#7f1d1d;font-size:13px;width:140px;border-bottom:1px solid #fee2e2;">Task Title</td>
                <td style="padding:7px 0;color:#0f172a;font-size:14px;font-weight:700;border-bottom:1px solid #fee2e2;">${escapeHtml(params.taskTitle)}</td>
              </tr>
              <tr>
                <td style="padding:7px 0;color:#7f1d1d;font-size:13px;border-bottom:1px solid #fee2e2;">Due Date</td>
                <td style="padding:7px 0;color:#dc2626;font-size:13px;font-weight:800;border-bottom:1px solid #fee2e2;">${escapeHtml(formattedDue)} (Due Tomorrow)</td>
              </tr>
              <tr>
                <td style="padding:7px 0;color:#7f1d1d;font-size:13px;border-bottom:1px solid #fee2e2;">Priority Level</td>
                <td style="padding:7px 0;border-bottom:1px solid #fee2e2;">${getPriorityBadgeHtml(params.priority)}</td>
              </tr>
              <tr>
                <td style="padding:7px 0;color:#7f1d1d;font-size:13px;border-bottom:1px solid #fee2e2;">Your Role</td>
                <td style="padding:7px 0;color:#0f172a;font-size:13px;font-weight:600;border-bottom:1px solid #fee2e2;">Task ${escapeHtml(params.recipientRole)}</td>
              </tr>
              ${
                params.assigneeName
                  ? `<tr>
                      <td style="padding:7px 0;color:#7f1d1d;font-size:13px;border-bottom:1px solid #fee2e2;">Assigned Counsel</td>
                      <td style="padding:7px 0;color:#0f172a;font-size:13px;font-weight:600;border-bottom:1px solid #fee2e2;">${escapeHtml(params.assigneeName)}</td>
                    </tr>`
                  : ""
              }
              ${
                params.creatorName
                  ? `<tr>
                      <td style="padding:7px 0;color:#7f1d1d;font-size:13px;${params.caseTitle || params.caseNumber ? "border-bottom:1px solid #fee2e2;" : ""}">Created By</td>
                      <td style="padding:7px 0;color:#0f172a;font-size:13px;font-weight:600;${params.caseTitle || params.caseNumber ? "border-bottom:1px solid #fee2e2;" : ""}">${escapeHtml(params.creatorName)}</td>
                    </tr>`
                  : ""
              }
              ${
                params.caseTitle || params.caseNumber
                  ? `<tr>
                      <td style="padding:7px 0;color:#7f1d1d;font-size:13px;">Linked Matter</td>
                      <td style="padding:7px 0;color:#0f172a;font-size:13px;font-weight:700;">${escapeHtml([params.caseNumber, params.caseTitle].filter(Boolean).join(" — "))}</td>
                    </tr>`
                  : ""
              }
            </table>
          </td>
        </tr>
      </table>

      <!-- CTA Button -->
      <div style="text-align:center;margin:28px 0 8px;">
        <a href="${escapeHtml(dashboardUrl)}" style="display:inline-block;background-color:#0f172a;color:#ffffff;text-decoration:none;padding:13px 32px;border-radius:8px;font-size:14px;font-weight:600;">
          Review &amp; Update Task Status &rarr;
        </a>
      </div>
    `;

    const html = buildMiLawEmailHtml({
      documentTitle: `Deadline Tomorrow: ${params.taskTitle}`,
      brandSubtitle: params.firmName || "Chamber Task & Limitation Desk",
      badgeHtml,
      heading: "Task Deadline Tomorrow",
      subheading: `${escapeHtml(params.taskTitle)} — Due ${escapeHtml(formattedDue)}`,
      bodyHtml,
      footerReason: "Automated 24-Hour Task Limitation Alert from MI Law",
      firmName: params.firmName,
    });

    await transporter.sendMail({
      from: `"${params.firmName || config.APP_NAME || "MI Law Workflow"}" <${config.SMTP_MAIL}>`,
      to: params.recipientEmail,
      subject: `⏰ Task Due Tomorrow: ${params.taskTitle}${params.caseNumber ? ` [${params.caseNumber}]` : ""}`,
      html,
      attachments: getMiLawLogoAttachments(),
    });

    return { success: true };
  } catch (error) {
    console.error("Failed to send task deadline reminder email:", error);
    return { success: false };
  }
};
