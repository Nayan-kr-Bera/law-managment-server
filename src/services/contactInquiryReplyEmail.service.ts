import nodemailer from "nodemailer";
import { config } from "../config/index.js";
import {
  buildMiLawEmailHtml,
  escapeHtml,
  getMiLawLogoAttachments,
} from "./emailBrandLayout.js";

export interface ContactInquiryReplyEmailParams {
  recipientName: string;
  recipientEmail: string;
  subject: string;
  replyMessage: string;
  originalMessage?: string | null;
  originalSubject?: string | null;
  adminName?: string;
  inquiryId?: string | number;
}

const createTransporter = () => {
  const port = Number(config.SMTP_PORT) || 587;
  const secure =
    String(config.SMTP_SRC).toLowerCase() === "true" || port === 465;

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

export const sendContactInquiryReplyEmail = async (
  params: ContactInquiryReplyEmailParams,
): Promise<boolean> => {
  try {
    const transporter = createTransporter();
    const formattedReply = escapeHtml(params.replyMessage).replace(
      /\n/g,
      "<br/>",
    );
    const formattedOriginal = params.originalMessage
      ? escapeHtml(params.originalMessage).replace(/\n/g, "<br/>")
      : null;

    const responderName = params.adminName || "MI Law Support & Advisory Desk";
    const respondedOn = new Date().toLocaleDateString("en-IN", {
      day: "2-digit",
      month: "short",
      year: "numeric",
    });

    const badgeHtml = `<span style="display:inline-block;background-color:#eef2ff;color:#4f46e5;font-size:11px;font-weight:700;padding:4px 12px;border-radius:20px;text-transform:uppercase;letter-spacing:0.6px;border:1px solid #c7d2fe;">Support &amp; Advisory Desk</span>`;

    const bodyHtml = `
      <p style="margin:0 0 12px;color:#0f172a;font-size:15px;">
        Dear <strong>${escapeHtml(params.recipientName)}</strong>,
      </p>
      <p style="margin:0 0 20px;color:#475569;font-size:14px;line-height:1.6;">
        Thank you for reaching out to <strong>MI Law</strong>. Our team has reviewed your inquiry and provided the following response:
      </p>

      <!-- Official Reply Box -->
      <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#f8fafc;border:1px solid #e2e8f0;border-left:4px solid #4f46e5;border-radius:10px;margin-bottom:24px;">
        <tr>
          <td style="padding:20px 22px;">
            <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="margin-bottom:10px;">
              <tr>
                <td style="font-size:11px;font-weight:700;text-transform:uppercase;letter-spacing:0.8px;color:#4f46e5;">
                  Official Response from ${escapeHtml(responderName)}
                </td>
                <td align="right" style="font-size:11px;color:#64748b;font-weight:600;">
                  ${escapeHtml(respondedOn)}${params.inquiryId ? ` • Ref #${escapeHtml(String(params.inquiryId))}` : ""}
                </td>
              </tr>
            </table>
            <div style="color:#0f172a;font-size:14px;line-height:1.7;">
              ${formattedReply}
            </div>
          </td>
        </tr>
      </table>

      ${
        formattedOriginal
          ? `<!-- Quoted Original Inquiry -->
            <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#ffffff;border:1px solid #e2e8f0;border-radius:10px;margin-bottom:20px;">
              <tr>
                <td style="padding:16px 20px;">
                  <p style="margin:0 0 8px;font-size:11px;font-weight:700;text-transform:uppercase;letter-spacing:0.8px;color:#94a3b8;">
                    Your Original Inquiry${params.originalSubject ? ` — ${escapeHtml(params.originalSubject)}` : ""}
                  </p>
                  <div style="color:#64748b;font-size:13px;line-height:1.6;font-style:italic;">
                    "${formattedOriginal}"
                  </div>
                </td>
              </tr>
            </table>`
          : ""
      }

      <p style="margin:20px 0 0;color:#475569;font-size:13px;line-height:1.6;">
        If you have any follow-up questions, simply reply directly to this email and our team will be glad to assist you.
      </p>
      <p style="margin:14px 0 0;color:#0f172a;font-size:14px;font-weight:700;">
        Warm regards,<br />
        <span style="color:#4f46e5;">${escapeHtml(responderName)}</span>
      </p>
    `;

    const html = buildMiLawEmailHtml({
      documentTitle: params.subject,
      brandSubtitle: "Support & Client Relations Desk",
      badgeHtml,
      heading: "Response to Your Inquiry",
      subheading: escapeHtml(params.subject),
      bodyHtml,
      footerReason: "Sent by the MI Law Support & Client Relations Team",
    });

    await transporter.sendMail({
      from: `"MI Law Support" <${config.SMTP_MAIL}>`,
      to: params.recipientEmail,
      subject: params.subject,
      html,
      attachments: getMiLawLogoAttachments(),
    });

    return true;
  } catch (error) {
    console.error("[ContactInquiryReplyEmail] Error sending email:", error);
    return false;
  }
};

export default sendContactInquiryReplyEmail;
