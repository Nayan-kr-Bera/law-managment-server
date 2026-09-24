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

export interface CaseNotificationEmailParams {
  clientName: string;
  clientEmail: string;
  caseTitle: string;
  caseNumber?: string;
  cnrNumber?: string;
  court?: string;
  courtNo?: string;
  firstParty?: string;
  oppositeParty?: string;
  nextHearingDate?: string | Date | null;
  fixedFor?: string | null;
  subject?: string;
  customMessage?: string;
  firmName?: string;
}

export const sendClientCaseNotificationEmail = async ({
  clientName,
  clientEmail,
  caseTitle,
  caseNumber,
  cnrNumber,
  court,
  courtNo,
  firstParty,
  oppositeParty,
  nextHearingDate,
  fixedFor,
  subject,
  customMessage,
  firmName = "Law Practice System",
}: CaseNotificationEmailParams) => {
  try {
    const formattedHearingDate = nextHearingDate
      ? new Date(nextHearingDate).toLocaleDateString("en-IN", {
          day: "2-digit",
          month: "short",
          year: "numeric",
        })
      : "To be notified";

    const emailSubject =
      subject?.trim() ||
      `Case Notice & Status Update — ${caseNumber || caseTitle || "Your Matter"}`;

    const portalLoginUrl =
      config.ORIGIN_CLIENT || "http://localhost:5174";

    const mail = {
      from: config.SMTP_MAIL,
      to: clientEmail,
      subject: emailSubject,
      html: `
<!DOCTYPE html>
<html>
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>${emailSubject}</title>
</head>
<body style="margin: 0; padding: 0; background: #f8fafc; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; color: #1e293b;">
  <table width="100%" cellpadding="0" cellspacing="0" border="0" style="background: #f8fafc; padding: 32px 16px;">
    <tr>
      <td align="center">
        <table width="100%" cellpadding="0" cellspacing="0" border="0" style="max-width: 620px; background: #ffffff; border-radius: 16px; overflow: hidden; border: 1px solid #e2e8f0; box-shadow: 0 4px 6px -1px rgba(0, 0, 0, 0.05);">
          
          <!-- Header Banner -->
          <tr>
            <td style="background: linear-gradient(135deg, #1e293b 0%, #0f172a 100%); padding: 32px 36px; text-align: left; border-bottom: 3px solid #2176ff;">
              <p style="margin: 0 0 6px; color: #93c5fd; font-size: 12px; font-weight: 700; text-transform: uppercase; letter-spacing: 0.08em;">Official Legal Notice</p>
              <h1 style="margin: 0; color: #ffffff; font-size: 22px; font-weight: 700; letter-spacing: -0.02em;">${firmName}</h1>
            </td>
          </tr>

          <!-- Main Content -->
          <tr>
            <td style="padding: 32px 36px;">
              <p style="margin: 0 0 16px; font-size: 15px; color: #475569;">
                Dear <strong>${clientName}</strong>,
              </p>
              
              <p style="margin: 0 0 24px; font-size: 14px; line-height: 1.6; color: #334155;">
                This is an official communication regarding your ongoing legal matter handled by our practice. Please find the latest updates and proceedings information summarized below:
              </p>

              ${
                customMessage?.trim()
                  ? `
              <!-- Advocate / Custom Message Box -->
              <div style="background: #eff6ff; border-left: 4px solid #2176ff; border-radius: 8px; padding: 18px 20px; margin-bottom: 28px;">
                <p style="margin: 0 0 6px; font-size: 12px; font-weight: 700; text-transform: uppercase; letter-spacing: 0.05em; color: #1e40af;">Advocate's Note / Notice</p>
                <p style="margin: 0; font-size: 14px; line-height: 1.6; color: #1e3a8a; white-space: pre-wrap;">${customMessage.trim()}</p>
              </div>
              `
                  : ""
              }

              <!-- Case Information Table -->
              <table width="100%" cellpadding="0" cellspacing="0" border="0" style="background: #f8fafc; border: 1px solid #e2e8f0; border-radius: 12px; margin-bottom: 28px; overflow: hidden;">
                <tr>
                  <td colspan="2" style="background: #f1f5f9; padding: 12px 18px; border-bottom: 1px solid #e2e8f0;">
                    <p style="margin: 0; font-size: 12px; font-weight: 700; text-transform: uppercase; letter-spacing: 0.05em; color: #475569;">Matter Details</p>
                  </td>
                </tr>
                <tr>
                  <td width="35%" style="padding: 11px 18px; font-size: 13px; color: #64748b; border-bottom: 1px solid #e2e8f0;">Case Title / Number:</td>
                  <td style="padding: 11px 18px; font-size: 13px; font-weight: 600; color: #0f172a; border-bottom: 1px solid #e2e8f0;">
                    ${caseNumber || "N/A"} ${caseTitle ? `— ${caseTitle}` : ""}
                  </td>
                </tr>
                ${
                  cnrNumber
                    ? `
                <tr>
                  <td style="padding: 11px 18px; font-size: 13px; color: #64748b; border-bottom: 1px solid #e2e8f0;">CNR Number:</td>
                  <td style="padding: 11px 18px; font-size: 13px; font-weight: 600; color: #0f172a; border-bottom: 1px solid #e2e8f0;">${cnrNumber}</td>
                </tr>`
                    : ""
                }
                <tr>
                  <td style="padding: 11px 18px; font-size: 13px; color: #64748b; border-bottom: 1px solid #e2e8f0;">Court & Room:</td>
                  <td style="padding: 11px 18px; font-size: 13px; font-weight: 600; color: #0f172a; border-bottom: 1px solid #e2e8f0;">
                    ${court || "Court of Record"}${courtNo ? ` (Court No. ${courtNo})` : ""}
                  </td>
                </tr>
                ${
                  firstParty || oppositeParty
                    ? `
                <tr>
                  <td style="padding: 11px 18px; font-size: 13px; color: #64748b; border-bottom: 1px solid #e2e8f0;">Parties:</td>
                  <td style="padding: 11px 18px; font-size: 13px; font-weight: 600; color: #0f172a; border-bottom: 1px solid #e2e8f0;">
                    ${firstParty || "Petitioner"} vs ${oppositeParty || "Respondent"}
                  </td>
                </tr>`
                    : ""
                }
                <tr>
                  <td style="padding: 11px 18px; font-size: 13px; color: #64748b;">Next Hearing Date:</td>
                  <td style="padding: 11px 18px; font-size: 13px; font-weight: 700; color: #2176ff;">
                    ${formattedHearingDate} ${fixedFor ? `(Fixed for: ${fixedFor})` : ""}
                  </td>
                </tr>
              </table>

              <!-- Portal Access CTA Button -->
              <div style="text-align: center; margin: 32px 0 20px;">
                <a href="${portalLoginUrl}" style="display: inline-block; background: #2176ff; color: #ffffff; text-decoration: none; padding: 13px 28px; border-radius: 10px; font-size: 14px; font-weight: 600; box-shadow: 0 2px 4px rgba(33, 118, 255, 0.25);">
                  View Case in Client Portal &rarr;
                </a>
              </div>

              <p style="margin: 24px 0 0; font-size: 13px; line-height: 1.6; color: #64748b; text-align: center;">
                You can also review all proceedings, filed documents, and schedule updates directly through your online client portal.
              </p>
            </td>
          </tr>

          <!-- Footer -->
          <tr>
            <td style="padding: 24px 36px; background: #f8fafc; border-top: 1px solid #e2e8f0; text-align: center;">
              <p style="margin: 0 0 6px; font-size: 12px; color: #94a3b8;">
                This email contains confidential client-attorney privileged information intended solely for ${clientEmail}.
              </p>
              <p style="margin: 0; font-size: 12px; color: #cbd5e1;">
                &copy; ${new Date().getFullYear()} ${firmName}. All rights reserved.
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

    console.log(`📨 [SMTP] Sending case notification to client: ${clientEmail} (${caseNumber || caseTitle})...`);
    const info = await transporter.sendMail(mail);
    console.log(`✅ [SMTP] Notification delivered to ${clientEmail}. Message ID:`, info.messageId);

    return {
      success: true,
      messageId: info.messageId,
    };
  } catch (error: unknown) {
    console.error(
      `❌ [SMTP] Failed to send client notification to ${clientEmail}:`,
      error instanceof Error ? error.message : error
    );
    return {
      success: false,
      error: error instanceof Error ? error.message : "Failed to deliver email",
    };
  }
};
