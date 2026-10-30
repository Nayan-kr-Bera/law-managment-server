import nodemailer from "nodemailer";
import { config } from "../config/index.js";
import {
  buildMiLawEmailHtml,
  escapeHtml,
  getMiLawLogoAttachments,
} from "./emailBrandLayout.js";

export type AppointmentEmailMode = "in_person" | "video" | "online" | "phone";

interface AppointmentEmailParams {
  clientName: string;
  clientEmail: string;
  appointmentDate: Date | string;
  purpose: string;
  mode: AppointmentEmailMode;
  location?: string | null;
  caseNumber?: string | null;
  caseTitle?: string | null;
  firmName?: string | null;
  portalUrl?: string;
}

interface AppointmentCancellationEmailParams {
  clientName: string;
  clientEmail: string;
  appointmentDate: Date | string;
  purpose: string;
  mode?: AppointmentEmailMode | null;
  location?: string | null;
  caseNumber?: string | null;
  caseTitle?: string | null;
  firmName?: string | null;
  portalUrl?: string;
}

const createTransporter = () => {
  const port = Number(config.SMTP_PORT);
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

const formatModeLabel = (mode?: AppointmentEmailMode | null) => {
  switch (mode) {
    case "in_person":
      return "In-Person Consultation";
    case "video":
    case "online":
      return "Video Consultation";
    case "phone":
      return "Phone Consultation";
    default:
      return "Legal Consultation";
  }
};

const formatDateTime = (date: Date | string) => {
  const parsedDate = new Date(date);

  return {
    formattedDate: parsedDate.toLocaleDateString("en-IN", {
      weekday: "long",
      day: "2-digit",
      month: "long",
      year: "numeric",
    }),
    formattedTime: parsedDate.toLocaleTimeString("en-IN", {
      hour: "2-digit",
      minute: "2-digit",
      hour12: true,
    }),
  };
};

export const appointmentEmailService = async ({
  clientName,
  clientEmail,
  appointmentDate,
  purpose,
  mode,
  location,
  caseNumber,
  caseTitle,
  firmName,
  portalUrl,
}: AppointmentEmailParams): Promise<{ success: boolean; message?: string }> => {
  try {
    const transporter = createTransporter();
    const { formattedDate, formattedTime } = formatDateTime(appointmentDate);
    const modeLabel = formatModeLabel(mode);
    const resolvedPortalUrl =
      portalUrl ||
      config.ORIGIN_CLIENT ||
      config.ORIGIN_FRONTEND ||
      "http://localhost:5174";

    const badgeHtml = `<span style="display:inline-block;background-color:#ecfdf5;color:#047857;font-size:11px;font-weight:700;padding:4px 12px;border-radius:20px;text-transform:uppercase;letter-spacing:0.6px;border:1px solid #a7f3d0;">✓ Confirmed Appointment</span>`;

    const caseDetailsCard =
      caseNumber || caseTitle
        ? `
      <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#ffffff;border:1px solid #e2e8f0;border-radius:10px;margin-bottom:20px;">
        <tr>
          <td style="padding:18px 20px;">
            <p style="margin:0 0 12px;font-size:11px;font-weight:700;text-transform:uppercase;letter-spacing:0.8px;color:#64748b;">
              Associated Legal Matter
            </p>
            <table role="presentation" width="100%" cellpadding="0" cellspacing="0">
              ${
                caseNumber
                  ? `<tr>
                      <td style="padding:6px 0;color:#64748b;font-size:13px;width:130px;border-bottom:1px solid #f1f5f9;">Case Number</td>
                      <td style="padding:6px 0;color:#0f172a;font-size:13px;font-weight:700;font-family:monospace;border-bottom:1px solid #f1f5f9;">${escapeHtml(caseNumber)}</td>
                    </tr>`
                  : ""
              }
              ${
                caseTitle
                  ? `<tr>
                      <td style="padding:6px 0;color:#64748b;font-size:13px;">Case Title</td>
                      <td style="padding:6px 0;color:#0f172a;font-size:13px;font-weight:600;">${escapeHtml(caseTitle)}</td>
                    </tr>`
                  : ""
              }
            </table>
          </td>
        </tr>
      </table>`
        : "";

    const bodyHtml = `
      <p style="margin:0 0 12px;color:#0f172a;font-size:15px;">
        Dear <strong>${escapeHtml(clientName)}</strong>,
      </p>
      <p style="margin:0 0 24px;color:#475569;font-size:14px;line-height:1.6;">
        Your legal consultation with <strong>${escapeHtml(firmName || "our legal chamber")}</strong> has been scheduled and confirmed. Please review your appointment schedule and details below.
      </p>

      <!-- Date & Time Highlight Box -->
      <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#f0fdf4;border:1px solid #bbf7d0;border-radius:10px;margin-bottom:20px;">
        <tr>
          <td style="padding:18px 20px;">
            <table role="presentation" width="100%" cellpadding="0" cellspacing="0">
              <tr>
                <td style="vertical-align:top;padding-bottom:10px;">
                  <div style="font-size:11px;font-weight:700;text-transform:uppercase;letter-spacing:0.8px;color:#15803d;margin-bottom:4px;">Date &amp; Time</div>
                  <div style="font-size:17px;font-weight:800;color:#0f172a;">${escapeHtml(formattedDate)}</div>
                  <div style="font-size:14px;font-weight:700;color:#047857;margin-top:2px;">at ${escapeHtml(formattedTime)} (IST)</div>
                </td>
              </tr>
              <tr>
                <td style="border-top:1px solid #dcfce7;padding-top:12px;">
                  <table role="presentation" width="100%" cellpadding="0" cellspacing="0">
                    <tr>
                      <td style="padding:4px 0;color:#475569;font-size:13px;width:130px;">Consultation Mode</td>
                      <td style="padding:4px 0;color:#0f172a;font-size:13px;font-weight:700;">${escapeHtml(modeLabel)}</td>
                    </tr>
                    <tr>
                      <td style="padding:4px 0;color:#475569;font-size:13px;">Purpose / Agenda</td>
                      <td style="padding:4px 0;color:#0f172a;font-size:13px;font-weight:600;">${escapeHtml(purpose)}</td>
                    </tr>
                    ${
                      location
                        ? `<tr>
                            <td style="padding:4px 0;color:#475569;font-size:13px;">Location / Link</td>
                            <td style="padding:4px 0;color:#0f172a;font-size:13px;font-weight:600;">${escapeHtml(location)}</td>
                          </tr>`
                        : ""
                    }
                  </table>
                </td>
              </tr>
            </table>
          </td>
        </tr>
      </table>

      ${caseDetailsCard}

      <!-- Preparation Checklist -->
      <div style="background:#f8fafc;border-left:4px solid #0f172a;padding:12px 16px;border-radius:6px;margin-bottom:24px;">
        <p style="margin:0;color:#334155;font-size:13px;line-height:1.5;">
          <strong>Preparation Note:</strong> Please be available 5–10 minutes prior to the scheduled time and keep any relevant case documents or reference papers handy.
        </p>
      </div>

      <!-- CTA Button -->
      <div style="text-align:center;margin:24px 0 8px;">
        <a href="${escapeHtml(resolvedPortalUrl)}" style="display:inline-block;background-color:#0f172a;color:#ffffff;text-decoration:none;padding:12px 28px;border-radius:8px;font-size:14px;font-weight:600;">
          View Appointment in Client Portal &rarr;
        </a>
      </div>
    `;

    const html = buildMiLawEmailHtml({
      documentTitle: "Appointment Confirmation — MI Law",
      brandSubtitle: firmName || "Client Consultation Desk",
      badgeHtml,
      heading: "Your Appointment is Confirmed",
      subheading: `${escapeHtml(modeLabel)} scheduled for ${escapeHtml(formattedDate)}`,
      bodyHtml,
      footerReason:
        "Automated Appointment Confirmation from your Legal Chamber",
      firmName,
    });

    await transporter.sendMail({
      from: `"${firmName || config.APP_NAME || "MI Law"}" <${config.SMTP_MAIL}>`,
      to: clientEmail,
      subject: `Appointment Confirmed: ${formattedDate} at ${formattedTime}`,
      html,
      attachments: getMiLawLogoAttachments(),
    });

    return {
      success: true,
      message: "Appointment email sent successfully",
    };
  } catch (error) {
    console.error("Appointment email send failed:", error);
    return {
      success: false,
      message: "Failed to send appointment email",
    };
  }
};

export const appointmentCancellationEmailService = async ({
  clientName,
  clientEmail,
  appointmentDate,
  purpose,
  mode,
  location,
  caseNumber,
  caseTitle,
  firmName,
  portalUrl,
}: AppointmentCancellationEmailParams): Promise<{
  success: boolean;
  message?: string;
}> => {
  try {
    const transporter = createTransporter();
    const { formattedDate, formattedTime } = formatDateTime(appointmentDate);
    const resolvedPortalUrl =
      portalUrl ||
      config.ORIGIN_CLIENT ||
      config.ORIGIN_FRONTEND ||
      "http://localhost:5174";

    const badgeHtml = `<span style="display:inline-block;background-color:#fef2f2;color:#dc2626;font-size:11px;font-weight:700;padding:4px 12px;border-radius:20px;text-transform:uppercase;letter-spacing:0.6px;border:1px solid #fecaca;">✕ Appointment Cancelled</span>`;

    const bodyHtml = `
      <p style="margin:0 0 12px;color:#0f172a;font-size:15px;">
        Dear <strong>${escapeHtml(clientName)}</strong>,
      </p>
      <p style="margin:0 0 24px;color:#475569;font-size:14px;line-height:1.6;">
        Please be advised that your scheduled appointment with <strong>${escapeHtml(firmName || "our legal chamber")}</strong> has been <strong>cancelled</strong>. Below are the details of the cancelled session for your records.
      </p>

      <!-- Cancelled Appointment Card -->
      <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#fef2f2;border:1px solid #fecaca;border-radius:10px;margin-bottom:24px;">
        <tr>
          <td style="padding:18px 20px;">
            <p style="margin:0 0 12px;font-size:11px;font-weight:700;text-transform:uppercase;letter-spacing:0.8px;color:#b91c1c;">
              Cancelled Session Details
            </p>
            <table role="presentation" width="100%" cellpadding="0" cellspacing="0">
              <tr>
                <td style="padding:6px 0;color:#7f1d1d;font-size:13px;width:130px;border-bottom:1px solid #fee2e2;">Original Date</td>
                <td style="padding:6px 0;color:#0f172a;font-size:13px;font-weight:700;text-decoration:line-through;border-bottom:1px solid #fee2e2;">${escapeHtml(formattedDate)}</td>
              </tr>
              <tr>
                <td style="padding:6px 0;color:#7f1d1d;font-size:13px;border-bottom:1px solid #fee2e2;">Original Time</td>
                <td style="padding:6px 0;color:#0f172a;font-size:13px;font-weight:700;text-decoration:line-through;border-bottom:1px solid #fee2e2;">${escapeHtml(formattedTime)} (IST)</td>
              </tr>
              ${
                mode
                  ? `<tr>
                      <td style="padding:6px 0;color:#7f1d1d;font-size:13px;border-bottom:1px solid #fee2e2;">Mode</td>
                      <td style="padding:6px 0;color:#0f172a;font-size:13px;font-weight:600;border-bottom:1px solid #fee2e2;">${escapeHtml(formatModeLabel(mode))}</td>
                    </tr>`
                  : ""
              }
              <tr>
                <td style="padding:6px 0;color:#7f1d1d;font-size:13px;${caseNumber || caseTitle || location ? "border-bottom:1px solid #fee2e2;" : ""}">Purpose</td>
                <td style="padding:6px 0;color:#0f172a;font-size:13px;font-weight:600;${caseNumber || caseTitle || location ? "border-bottom:1px solid #fee2e2;" : ""}">${escapeHtml(purpose)}</td>
              </tr>
              ${
                location
                  ? `<tr>
                      <td style="padding:6px 0;color:#7f1d1d;font-size:13px;${caseNumber || caseTitle ? "border-bottom:1px solid #fee2e2;" : ""}">Location</td>
                      <td style="padding:6px 0;color:#0f172a;font-size:13px;font-weight:600;${caseNumber || caseTitle ? "border-bottom:1px solid #fee2e2;" : ""}">${escapeHtml(location)}</td>
                    </tr>`
                  : ""
              }
              ${
                caseNumber || caseTitle
                  ? `<tr>
                      <td style="padding:6px 0;color:#7f1d1d;font-size:13px;">Related Case</td>
                      <td style="padding:6px 0;color:#0f172a;font-size:13px;font-weight:600;">${escapeHtml([caseNumber, caseTitle].filter(Boolean).join(" — "))}</td>
                    </tr>`
                  : ""
              }
            </table>
          </td>
        </tr>
      </table>

      <div style="background:#f8fafc;border-left:4px solid #64748b;padding:12px 16px;border-radius:6px;margin-bottom:24px;">
        <p style="margin:0;color:#334155;font-size:13px;line-height:1.5;">
          Need to reschedule? Please contact your legal representative or visit your Client Portal to request a new consultation slot.
        </p>
      </div>

      <!-- CTA Button -->
      <div style="text-align:center;margin:24px 0 8px;">
        <a href="${escapeHtml(resolvedPortalUrl)}" style="display:inline-block;background-color:#0f172a;color:#ffffff;text-decoration:none;padding:12px 28px;border-radius:8px;font-size:14px;font-weight:600;">
          Open Client Portal &rarr;
        </a>
      </div>
    `;

    const html = buildMiLawEmailHtml({
      documentTitle: "Appointment Cancelled — MI Law",
      brandSubtitle: firmName || "Client Consultation Desk",
      badgeHtml,
      heading: "Appointment Cancellation Notice",
      subheading: `Session originally scheduled for ${escapeHtml(formattedDate)} has been cancelled`,
      bodyHtml,
      footerReason: "Automated Appointment Status Update from your Legal Chamber",
      firmName,
    });

    await transporter.sendMail({
      from: `"${firmName || config.APP_NAME || "MI Law"}" <${config.SMTP_MAIL}>`,
      to: clientEmail,
      subject: `Appointment Cancelled: ${formattedDate} at ${formattedTime}`,
      html,
      attachments: getMiLawLogoAttachments(),
    });

    return {
      success: true,
      message: "Cancellation email sent successfully",
    };
  } catch (error) {
    console.error("Appointment cancellation email failed:", error);
    return {
      success: false,
      message: "Failed to send cancellation email",
    };
  }
};

export default appointmentEmailService;
