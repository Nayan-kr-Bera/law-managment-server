import nodemailer from "nodemailer";
import { config } from "../config/index.js";
import {
  buildMiLawEmailHtml,
  escapeHtml,
  getMiLawLogoAttachments,
} from "./emailBrandLayout.js";

export interface ClientCaseNotificationParams {
  clientName: string;
  clientEmail: string;
  caseTitle: string;
  caseNumber?: string | null;
  cnrNumber?: string | null;
  court?: string | null;
  courtNo?: string | null;
  firstParty?: string | null;
  oppositeParty?: string | null;
  nextHearingDate?: string | Date | null;
  fixedFor?: string | null;
  subject?: string;
  customMessage?: string;
  firmName?: string;
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

export const sendClientCaseNotificationEmail = async (
  params: ClientCaseNotificationParams,
): Promise<{ success: boolean; error?: string }> => {
  try {
    const transporter = createTransporter();

    const formattedNextDate = params.nextHearingDate
      ? new Date(params.nextHearingDate).toLocaleDateString("en-IN", {
          weekday: "short",
          day: "2-digit",
          month: "short",
          year: "numeric",
        })
      : "To Be Announced";

    const portalUrl =
      config.ORIGIN_CLIENT || config.ORIGIN_FRONTEND || "http://localhost:5174";
    const emailSubject =
      params.subject?.trim() ||
      `Case Status Update: ${params.caseNumber ? `[${params.caseNumber}] ` : ""}${params.caseTitle}`;

    const partiesDisplay =
      params.firstParty || params.oppositeParty
        ? `${params.firstParty || "First Party"} vs. ${params.oppositeParty || "Opposite Party"}`
        : null;

    const badgeHtml = `<span style="display:inline-block;background-color:#eef2ff;color:#4f46e5;font-size:11px;font-weight:700;padding:4px 12px;border-radius:20px;text-transform:uppercase;letter-spacing:0.6px;border:1px solid #c7d2fe;">Official Case Update</span>`;

    const customNoteHtml = params.customMessage?.trim()
      ? `
      <div style="background:#eef2ff;border-left:4px solid #4f46e5;padding:16px 18px;border-radius:8px;margin-bottom:24px;">
        <p style="margin:0 0 6px;font-size:11px;font-weight:700;text-transform:uppercase;letter-spacing:0.8px;color:#4338ca;">
          Note from Your Legal Counsel
        </p>
        <p style="margin:0;color:#1e293b;font-size:14px;line-height:1.6;white-space:pre-line;">${escapeHtml(params.customMessage.trim())}</p>
      </div>`
      : "";

    const bodyHtml = `
      <p style="margin:0 0 12px;color:#0f172a;font-size:15px;">
        Dear <strong>${escapeHtml(params.clientName)}</strong>,
      </p>
      <p style="margin:0 0 24px;color:#475569;font-size:14px;line-height:1.6;">
        We are writing to share an official update regarding your legal matter managed by <strong>${escapeHtml(params.firmName || "our chamber")}</strong>. Please review the latest docket details and upcoming hearing information below.
      </p>

      ${customNoteHtml}

      <!-- Case Details Table -->
      <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#f8fafc;border:1px solid #e2e8f0;border-radius:10px;margin-bottom:24px;">
        <tr>
          <td style="padding:18px 20px;">
            <p style="margin:0 0 12px;font-size:11px;font-weight:700;text-transform:uppercase;letter-spacing:0.8px;color:#64748b;">
              Case &amp; Hearing Particulars
            </p>
            <table role="presentation" width="100%" cellpadding="0" cellspacing="0">
              <tr>
                <td style="padding:7px 0;color:#64748b;font-size:13px;width:140px;border-bottom:1px solid #f1f5f9;">Case Title</td>
                <td style="padding:7px 0;color:#0f172a;font-size:13px;font-weight:700;border-bottom:1px solid #f1f5f9;">${escapeHtml(params.caseTitle)}</td>
              </tr>
              <tr>
                <td style="padding:7px 0;color:#64748b;font-size:13px;border-bottom:1px solid #f1f5f9;">Case Number</td>
                <td style="padding:7px 0;color:#0f172a;font-size:13px;font-weight:700;font-family:monospace;border-bottom:1px solid #f1f5f9;">${escapeHtml(params.caseNumber || "N/A")}</td>
              </tr>
              ${
                params.cnrNumber
                  ? `<tr>
                      <td style="padding:7px 0;color:#64748b;font-size:13px;border-bottom:1px solid #f1f5f9;">CNR Number</td>
                      <td style="padding:7px 0;color:#0f172a;font-size:13px;font-weight:600;font-family:monospace;border-bottom:1px solid #f1f5f9;">${escapeHtml(params.cnrNumber)}</td>
                    </tr>`
                  : ""
              }
              ${
                partiesDisplay
                  ? `<tr>
                      <td style="padding:7px 0;color:#64748b;font-size:13px;border-bottom:1px solid #f1f5f9;">Parties</td>
                      <td style="padding:7px 0;color:#0f172a;font-size:13px;font-weight:600;border-bottom:1px solid #f1f5f9;">${escapeHtml(partiesDisplay)}</td>
                    </tr>`
                  : ""
              }
              <tr>
                <td style="padding:7px 0;color:#64748b;font-size:13px;border-bottom:1px solid #f1f5f9;">Court / Forum</td>
                <td style="padding:7px 0;color:#0f172a;font-size:13px;font-weight:600;border-bottom:1px solid #f1f5f9;">
                  ${escapeHtml(params.court || "N/A")}${params.courtNo ? ` (Court Room: ${escapeHtml(params.courtNo)})` : ""}
                </td>
              </tr>
              <tr>
                <td style="padding:7px 0;color:#64748b;font-size:13px;border-bottom:1px solid #f1f5f9;">Next Hearing Date</td>
                <td style="padding:7px 0;color:#4f46e5;font-size:13px;font-weight:700;border-bottom:1px solid #f1f5f9;">${escapeHtml(formattedNextDate)}</td>
              </tr>
              <tr>
                <td style="padding:7px 0;color:#64748b;font-size:13px;">Stage / Fixed For</td>
                <td style="padding:7px 0;color:#0f172a;font-size:13px;font-weight:600;">${escapeHtml(params.fixedFor || "Scheduled Proceeding")}</td>
              </tr>
            </table>
          </td>
        </tr>
      </table>

      <!-- CTA Button -->
      <div style="text-align:center;margin:28px 0 8px;">
        <a href="${escapeHtml(portalUrl)}" style="display:inline-block;background-color:#0f172a;color:#ffffff;text-decoration:none;padding:13px 32px;border-radius:8px;font-size:14px;font-weight:600;">
          View Case in Client Portal &rarr;
        </a>
      </div>
    `;

    const html = buildMiLawEmailHtml({
      documentTitle: emailSubject,
      brandSubtitle: params.firmName || "Client Legal Advisory",
      badgeHtml,
      heading: "Case Status & Hearing Update",
      subheading: `${escapeHtml(params.caseNumber || "Matter")} — ${escapeHtml(params.caseTitle)}`,
      bodyHtml,
      footerReason: `Official Case Communication from ${escapeHtml(params.firmName || "MI Law")}`,
      firmName: params.firmName,
    });

    await transporter.sendMail({
      from: `"${params.firmName || config.APP_NAME || "MI Law"}" <${config.SMTP_MAIL}>`,
      to: params.clientEmail,
      subject: emailSubject,
      html,
      attachments: getMiLawLogoAttachments(),
    });

    return { success: true };
  } catch (error: unknown) {
    console.error("Client case notification email failed:", error);
    return {
      success: false,
      error: error instanceof Error ? error.message : "Failed to send email",
    };
  }
};

export default sendClientCaseNotificationEmail;
