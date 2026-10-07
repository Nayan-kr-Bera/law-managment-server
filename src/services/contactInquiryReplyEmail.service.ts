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

export interface ContactInquiryReplyParams {
  recipientName: string;
  recipientEmail: string;
  subject: string;
  replyMessage: string;
  originalMessage?: string;
  originalSubject?: string;
  adminName?: string;
}

export const sendContactInquiryReplyEmail = async ({
  recipientName,
  recipientEmail,
  subject,
  replyMessage,
  originalMessage,
  originalSubject,
  adminName = "Support Team",
}: ContactInquiryReplyParams): Promise<boolean> => {
  try {
    const formattedReply = replyMessage.replace(/\n/g, "<br/>");
    const formattedOriginal = originalMessage ? originalMessage.replace(/\n/g, "<br/>") : "";

    const mailOptions = {
      from: `"${config.APP_NAME || "MI Law Platform Support"}" <${config.SMTP_MAIL}>`,
      to: recipientEmail,
      subject: subject || `Re: ${originalSubject || "Inquiry with MI Law Support"}`,
      html: `
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>Response to your Inquiry</title>
</head>
<body style="margin: 0; padding: 0; background-color: #f8fafc; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; color: #1e293b;">
  <table width="100%" border="0" cellspacing="0" cellpadding="0" style="background-color: #f8fafc; padding: 32px 16px;">
    <tr>
      <td align="center">
        <table width="100%" max-width="600" style="max-width: 600px; background-color: #ffffff; border-radius: 16px; border: 1px solid #e2e8f0; overflow: hidden; box-shadow: 0 4px 6px -1px rgba(0, 0, 0, 0.05);">
          <!-- Header -->
          <tr>
            <td style="padding: 28px 32px; background: linear-gradient(135deg, #1e1b4b 0%, #312e81 100%);">
              <table width="100%" border="0" cellspacing="0" cellpadding="0">
                <tr>
                  <td>
                    <span style="display: inline-block; font-size: 11px; font-weight: 700; text-transform: uppercase; letter-spacing: 0.1em; color: #a5b4fc; background-color: rgba(255, 255, 255, 0.12); padding: 4px 10px; border-radius: 9999px;">
                      Platform Support Response
                    </span>
                    <h1 style="margin: 12px 0 0 0; color: #ffffff; font-size: 20px; font-weight: 700; line-height: 1.3;">
                      ${subject}
                    </h1>
                  </td>
                </tr>
              </table>
            </td>
          </tr>

          <!-- Content Body -->
          <tr>
            <td style="padding: 32px;">
              <p style="margin: 0 0 16px 0; font-size: 15px; color: #334155; line-height: 1.6;">
                Dear <strong>${recipientName}</strong>,
              </p>
              
              <div style="margin: 20px 0; font-size: 14px; line-height: 1.7; color: #0f172a; white-space: normal;">
                ${formattedReply}
              </div>

              <!-- Original Inquiry Quote Box -->
              ${
                formattedOriginal
                  ? `
              <div style="margin-top: 28px; padding: 16px 20px; background-color: #f1f5f9; border-left: 4px solid #6366f1; border-radius: 6px;">
                <p style="margin: 0 0 6px 0; font-size: 11px; font-weight: 700; text-transform: uppercase; letter-spacing: 0.05em; color: #64748b;">
                  Your Original Inquiry:
                </p>
                <p style="margin: 0; font-size: 13px; color: #475569; font-style: italic; line-height: 1.5;">
                  ${formattedOriginal}
                </p>
              </div>
              `
                  : ""
              }

              <div style="margin-top: 32px; padding-top: 24px; border-top: 1px solid #f1f5f9; font-size: 13px; color: #64748b; line-height: 1.6;">
                <p style="margin: 0;">Warm regards,</p>
                <p style="margin: 4px 0 0 0; font-weight: 600; color: #1e293b;">${adminName}</p>
                <p style="margin: 2px 0 0 0; font-size: 12px; color: #64748b;">MI Law Platform Operations & Support Team</p>
              </div>
            </td>
          </tr>

          <!-- Footer -->
          <tr>
            <td style="background-color: #f8fafc; padding: 20px 32px; border-top: 1px solid #e2e8f0; text-align: center;">
              <p style="margin: 0; font-size: 12px; color: #94a3b8;">
                This response was sent directly from the MI Law Platform Support Console.
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

    await transporter.sendMail(mailOptions);
    return true;
  } catch (error) {
    console.error("Failed to send contact inquiry reply email:", error);
    return false;
  }
};
