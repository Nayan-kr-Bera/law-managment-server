import nodemailer from "nodemailer";
import { config } from "../config/index.js";

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

export interface TaskAssignmentEmailParams {
  recipientName: string;
  recipientEmail: string;
  taskTitle: string;
  assignedByName: string;
  dueDate?: string | null;
  priority: string;
  caseTitle?: string | null;
  caseNumber?: string | null;
  courtName?: string | null;
  isReassigned?: boolean;
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
}

export const sendTaskAssignmentEmail = async ({
  recipientName,
  recipientEmail,
  taskTitle,
  assignedByName,
  dueDate,
  priority,
  caseTitle,
  caseNumber,
  courtName,
  isReassigned = false,
}: TaskAssignmentEmailParams) => {
  try {
    if (!recipientEmail) return;

    const formattedDueDate = dueDate
      ? new Date(dueDate).toLocaleDateString("en-IN", {
          weekday: "short",
          day: "2-digit",
          month: "short",
          year: "numeric",
        })
      : "No fixed deadline";

    const actionText = isReassigned ? "Reassigned Task" : "New Task Assigned";
    const subject = `${actionText}: ${taskTitle} — Law Chamber Management`;
    const appUrl = config.ORIGIN_FRONTEND || "http://localhost:5173";

    const mail = {
      from: config.SMTP_MAIL,
      to: recipientEmail,
      subject,
      html: `
<!DOCTYPE html>
<html>
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>${subject}</title>
</head>
<body style="margin: 0; padding: 0; background: #f8fafc; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; color: #1e293b;">
  <table width="100%" cellpadding="0" cellspacing="0" border="0" style="background: #f8fafc; padding: 32px 16px;">
    <tr>
      <td align="center">
        <table width="100%" cellpadding="0" cellspacing="0" border="0" style="max-width: 600px; background: #ffffff; border-radius: 16px; overflow: hidden; border: 1px solid #e2e8f0; box-shadow: 0 4px 6px -1px rgba(0, 0, 0, 0.05);">
          
          <!-- Header Banner -->
          <tr>
            <td style="background: linear-gradient(135deg, #1e293b 0%, #0f172a 100%); padding: 28px 32px; text-align: left; border-bottom: 3px solid #2176ff;">
              <p style="margin: 0 0 6px; color: #93c5fd; font-size: 11px; font-weight: 700; text-transform: uppercase; letter-spacing: 0.08em;">Chamber Task Assignment</p>
              <h1 style="margin: 0; color: #ffffff; font-size: 20px; font-weight: 700;">${actionText}</h1>
            </td>
          </tr>

          <!-- Main Content -->
          <tr>
            <td style="padding: 28px 32px;">
              <p style="margin: 0 0 16px; font-size: 14px; color: #475569;">
                Hello <strong>${recipientName}</strong>,
              </p>
              
              <p style="margin: 0 0 20px; font-size: 14px; line-height: 1.6; color: #334155;">
                <strong>${assignedByName}</strong> has ${isReassigned ? "reassigned" : "assigned"} the following litigation task to your desk.
              </p>

              <!-- Task Details Box -->
              <table width="100%" cellpadding="0" cellspacing="0" border="0" style="background: #f8fafc; border: 1px solid #e2e8f0; border-radius: 12px; margin-bottom: 24px;">
                <tr>
                  <td style="padding: 16px 20px; border-bottom: 1px solid #e2e8f0;">
                    <span style="font-size: 11px; font-weight: 700; color: #64748b; text-transform: uppercase; letter-spacing: 0.05em; display: block; margin-bottom: 4px;">Task Title</span>
                    <span style="font-size: 15px; font-weight: 700; color: #0f172a;">${taskTitle}</span>
                  </td>
                </tr>

                ${
                  caseTitle || caseNumber
                    ? `
                <tr>
                  <td style="padding: 12px 20px; border-bottom: 1px solid #e2e8f0;">
                    <table width="100%" cellpadding="0" cellspacing="0">
                      <tr>
                        <td width="50%" style="vertical-align: top;">
                          <span style="font-size: 11px; color: #64748b; font-weight: 600; text-transform: uppercase; display: block;">Associated Case</span>
                          <span style="font-size: 13px; font-weight: 600; color: #1e293b;">${caseTitle || "Chamber Matter"}</span>
                          ${caseNumber ? `<span style="font-size: 12px; color: #2176ff; font-family: monospace; display: block;">${caseNumber}</span>` : ""}
                        </td>
                        ${
                          courtName
                            ? `
                        <td width="50%" style="vertical-align: top;">
                          <span style="font-size: 11px; color: #64748b; font-weight: 600; text-transform: uppercase; display: block;">Court</span>
                          <span style="font-size: 13px; color: #334155;">${courtName}</span>
                        </td>
                        `
                            : ""
                        }
                      </tr>
                    </table>
                  </td>
                </tr>
                `
                    : ""
                }

                <tr>
                  <td style="padding: 12px 20px;">
                    <table width="100%" cellpadding="0" cellspacing="0">
                      <tr>
                        <td width="50%">
                          <span style="font-size: 11px; color: #64748b; font-weight: 600; text-transform: uppercase; display: block;">Due Date</span>
                          <span style="font-size: 13px; font-weight: 700; color: #0f172a;">${formattedDueDate}</span>
                        </td>
                        <td width="50%">
                          <span style="font-size: 11px; color: #64748b; font-weight: 600; text-transform: uppercase; display: block;">Priority</span>
                          <span style="display: inline-block; font-size: 11px; font-weight: 700; text-transform: uppercase; padding: 2px 8px; border-radius: 6px; background: #e0f2fe; color: #0369a1;">
                            ${priority}
                          </span>
                        </td>
                      </tr>
                    </table>
                  </td>
                </tr>
              </table>

              <!-- CTA -->
              <table width="100%" cellpadding="0" cellspacing="0" border="0" style="margin-bottom: 24px;">
                <tr>
                  <td align="center">
                    <a href="${appUrl}/tasks" style="display: inline-block; background: #2176ff; color: #ffffff; text-decoration: none; padding: 12px 28px; border-radius: 10px; font-size: 13px; font-weight: 700; box-shadow: 0 2px 4px rgba(33, 118, 255, 0.2);">
                      Open Tasks Dashboard &rarr;
                    </a>
                  </td>
                </tr>
              </table>

              <p style="margin: 0; font-size: 12px; color: #94a3b8; text-align: center;">
                Please log in to update status, review files, or add procedural notes.
              </p>
            </td>
          </tr>

          <!-- Footer -->
          <tr>
            <td style="background: #f1f5f9; padding: 16px 32px; border-top: 1px solid #e2e8f0; text-align: center;">
              <p style="margin: 0; font-size: 11px; color: #64748b;">
                Law Practice Management System • Automated Notification
              </p>
            </td>
          </tr>

        </table>
      </td>
    </tr>
  </table>
</body>
</html>
      `,
    };

    await transporter.sendMail(mail);
    console.log(`[TaskEmail] Assignment notice sent to ${recipientEmail}`);
  } catch (error) {
    console.error("[TaskEmail] Failed to send assignment email:", error);
  }
};

export const sendTaskDeadlineReminderEmail = async ({
  recipientName,
  recipientEmail,
  recipientRole,
  taskTitle,
  dueDate,
  priority,
  assigneeName,
  creatorName,
  caseTitle,
  caseNumber,
}: TaskDeadlineReminderEmailParams) => {
  try {
    if (!recipientEmail) return;

    const formattedDueDate = new Date(dueDate).toLocaleDateString("en-IN", {
      weekday: "short",
      day: "2-digit",
      month: "short",
      year: "numeric",
    });

    const subject = `⚠️ Deadline Alert: "${taskTitle}" is Due Tomorrow (${formattedDueDate})`;
    const appUrl = config.ORIGIN_FRONTEND || "http://localhost:5173";

    const mail = {
      from: config.SMTP_MAIL,
      to: recipientEmail,
      subject,
      html: `
<!DOCTYPE html>
<html>
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>${subject}</title>
</head>
<body style="margin: 0; padding: 0; background: #f8fafc; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; color: #1e293b;">
  <table width="100%" cellpadding="0" cellspacing="0" border="0" style="background: #f8fafc; padding: 32px 16px;">
    <tr>
      <td align="center">
        <table width="100%" cellpadding="0" cellspacing="0" border="0" style="max-width: 600px; background: #ffffff; border-radius: 16px; overflow: hidden; border: 1px solid #fecdd3; box-shadow: 0 4px 6px -1px rgba(0, 0, 0, 0.05);">
          
          <!-- Header Banner -->
          <tr>
            <td style="background: linear-gradient(135deg, #991b1b 0%, #7f1d1d 100%); padding: 28px 32px; text-align: left; border-bottom: 3px solid #ef4444;">
              <p style="margin: 0 0 6px; color: #fecaca; font-size: 11px; font-weight: 700; text-transform: uppercase; letter-spacing: 0.08em;">Chamber Deadline Reminder • 24H Remaining</p>
              <h1 style="margin: 0; color: #ffffff; font-size: 20px; font-weight: 700;">Task Due Tomorrow</h1>
            </td>
          </tr>

          <!-- Main Content -->
          <tr>
            <td style="padding: 28px 32px;">
              <p style="margin: 0 0 16px; font-size: 14px; color: #475569;">
                Hello <strong>${recipientName}</strong> (${recipientRole}),
              </p>
              
              <p style="margin: 0 0 20px; font-size: 14px; line-height: 1.6; color: #334155;">
                This is an automated chamber reminder that the following task deadline is scheduled for <strong>tomorrow, ${formattedDueDate}</strong>.
              </p>

              <!-- Task Details Box -->
              <table width="100%" cellpadding="0" cellspacing="0" border="0" style="background: #fff1f2; border: 1px solid #fecdd3; border-radius: 12px; margin-bottom: 24px;">
                <tr>
                  <td style="padding: 16px 20px; border-bottom: 1px solid #fecdd3;">
                    <span style="font-size: 11px; font-weight: 700; color: #9f1239; text-transform: uppercase; letter-spacing: 0.05em; display: block; margin-bottom: 4px;">Task Title</span>
                    <span style="font-size: 15px; font-weight: 700; color: #881337;">${taskTitle}</span>
                  </td>
                </tr>

                ${
                  caseTitle || caseNumber
                    ? `
                <tr>
                  <td style="padding: 12px 20px; border-bottom: 1px solid #fecdd3;">
                    <span style="font-size: 11px; color: #9f1239; font-weight: 600; text-transform: uppercase; display: block;">Associated Case</span>
                    <span style="font-size: 13px; font-weight: 600; color: #1e293b;">${caseTitle || "Chamber Matter"}</span>
                    ${caseNumber ? `<span style="font-size: 12px; color: #dc2626; font-family: monospace; display: block;">${caseNumber}</span>` : ""}
                  </td>
                </tr>
                `
                    : ""
                }

                <tr>
                  <td style="padding: 12px 20px;">
                    <table width="100%" cellpadding="0" cellspacing="0">
                      <tr>
                        <td width="50%">
                          <span style="font-size: 11px; color: #9f1239; font-weight: 600; text-transform: uppercase; display: block;">Assigned Advocate</span>
                          <span style="font-size: 13px; font-weight: 600; color: #0f172a;">${assigneeName || "Unassigned"}</span>
                        </td>
                        <td width="50%">
                          <span style="font-size: 11px; color: #9f1239; font-weight: 600; text-transform: uppercase; display: block;">Created By</span>
                          <span style="font-size: 13px; font-weight: 600; color: #0f172a;">${creatorName || "Chamber Staff"}</span>
                        </td>
                      </tr>
                    </table>
                  </td>
                </tr>
              </table>

              <!-- CTA -->
              <table width="100%" cellpadding="0" cellspacing="0" border="0" style="margin-bottom: 24px;">
                <tr>
                  <td align="center">
                    <a href="${appUrl}/tasks" style="display: inline-block; background: #dc2626; color: #ffffff; text-decoration: none; padding: 12px 28px; border-radius: 10px; font-size: 13px; font-weight: 700; box-shadow: 0 2px 4px rgba(220, 38, 38, 0.2);">
                      Review & Complete Task &rarr;
                    </a>
                  </td>
                </tr>
              </table>

              <p style="margin: 0; font-size: 12px; color: #94a3b8; text-align: center;">
                If already completed, please mark the task as 'Completed' in the portal.
              </p>
            </td>
          </tr>

          <!-- Footer -->
          <tr>
            <td style="background: #f1f5f9; padding: 16px 32px; border-top: 1px solid #e2e8f0; text-align: center;">
              <p style="margin: 0; font-size: 11px; color: #64748b;">
                Law Practice Management System • 24H Deadline Safeguard
              </p>
            </td>
          </tr>

        </table>
      </td>
    </tr>
  </table>
</body>
</html>
      `,
    };

    await transporter.sendMail(mail);
    console.log(`[TaskEmail] Deadline reminder sent to ${recipientEmail} (${recipientRole})`);
  } catch (error) {
    console.error("[TaskEmail] Failed to send deadline reminder email:", error);
  }
};
