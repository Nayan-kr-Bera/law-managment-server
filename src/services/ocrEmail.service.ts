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

export interface OcrCompletionEmailData {
  toEmail: string;
  userName?: string;
  fileName: string;
  pageCount: number;
  totalPages?: number;
  pagesSkipped?: number;
  charCount: number;
  monthlyPagesUsed: number;
  monthlyPagesLimit: number;
  previewText?: string;
  documentUrl?: string;
  warning?: string;
}

export interface OcrFailureEmailData {
  toEmail: string;
  userName?: string;
  fileName: string;
  errorReason: string;
}

export const ocrEmailService = {
  /**
   * Send notification email when OCR finishes successfully
   */
  async sendOcrSuccessEmail(data: OcrCompletionEmailData): Promise<boolean> {
    const {
      toEmail,
      userName = "Advocate",
      fileName,
      pageCount,
      totalPages,
      pagesSkipped = 0,
      charCount,
      monthlyPagesUsed,
      monthlyPagesLimit,
      previewText = "",
      warning,
    } = data;

    if (!toEmail) return false;

    const remainingPages = Math.max(0, monthlyPagesLimit - monthlyPagesUsed);
    const snippet = previewText ? previewText.slice(0, 240) + "..." : "Text extracted and indexed into database.";

    const warningBannerHtml =
      pagesSkipped > 0 || warning
        ? `
      <div style="background-color: #fffaf0; border-left: 4px solid #dd6b20; border-radius: 4px; padding: 14px 16px; margin: 18px 0; color: #7b341e;">
        <p style="margin: 0; font-size: 13px; font-weight: 600;">⚠️ Partial Indexing Notice</p>
        <p style="margin: 6px 0 0 0; font-size: 12px; line-height: 1.5;">
          ${
            warning ||
            `Document contains ${totalPages || pageCount + pagesSkipped} pages. The first ${pageCount} pages were indexed and are fully searchable. The last ${pagesSkipped} pages were skipped because your monthly quota limit was reached.`
          }
        </p>
      </div>`
        : "";

    const html = `
<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <title>OCR Indexing Complete</title>
</head>
<body style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; background-color: #f7f6f2; margin: 0; padding: 24px; color: #2c2b29;">
  <div style="max-width: 580px; margin: 0 auto; background: #ffffff; border-radius: 8px; border: 1px solid #e5dfd5; overflow: hidden; box-shadow: 0 4px 14px rgba(0,0,0,0.05);">
    <div style="background-color: #1a202c; padding: 20px 24px; color: #ffffff;">
      <h2 style="margin: 0; font-size: 18px; font-weight: 600; letter-spacing: 0.5px;">⚖️ Digital Briefcase — OCR Indexing Complete</h2>
    </div>
    
    <div style="padding: 24px;">
      <p style="margin-top: 0; font-size: 14px;">Hello <strong>${userName}</strong>,</p>
      <p style="font-size: 13px; line-height: 1.6; color: #4a5568;">
        Your document <strong>${fileName}</strong> has been processed through the Hindi &amp; English OCR indexing pipeline.
      </p>

      ${warningBannerHtml}

      <div style="background-color: #fdfbf7; border: 1px solid #e8e2d7; border-radius: 6px; padding: 16px; margin: 20px 0;">
        <table style="width: 100%; font-size: 12px; border-collapse: collapse;">
          <tr>
            <td style="padding: 6px 0; color: #718096; width: 45%;">Document:</td>
            <td style="padding: 6px 0; font-weight: 600; color: #2d3748;">${fileName}</td>
          </tr>
          <tr>
            <td style="padding: 6px 0; color: #718096;">Pages Indexed:</td>
            <td style="padding: 6px 0; font-weight: 600; color: #2b6cb0;">
              ${pageCount} page${pageCount > 1 ? "s" : ""} ${totalPages && totalPages > pageCount ? `(of ${totalPages} total)` : ""}
            </td>
          </tr>
          ${
            pagesSkipped > 0
              ? `<tr>
            <td style="padding: 6px 0; color: #dd6b20;">Pages Skipped:</td>
            <td style="padding: 6px 0; font-weight: 600; color: #dd6b20;">${pagesSkipped} pages</td>
          </tr>`
              : ""
          }
          <tr>
            <td style="padding: 6px 0; color: #718096;">Extracted Characters:</td>
            <td style="padding: 6px 0; font-weight: 600; color: #2d3748;">${charCount.toLocaleString()} chars</td>
          </tr>
          <tr>
            <td style="padding: 6px 0; color: #718096;">Monthly Quota Usage:</td>
            <td style="padding: 6px 0; font-weight: 600; color: ${monthlyPagesUsed >= monthlyPagesLimit ? "#e53e3e" : "#38a169"};">
              ${monthlyPagesUsed} / ${monthlyPagesLimit} pages used (${remainingPages} remaining)
            </td>
          </tr>
        </table>
      </div>

      <div style="margin-top: 16px;">
        <p style="font-size: 12px; font-weight: 600; margin-bottom: 6px; color: #718096; text-transform: uppercase; letter-spacing: 0.5px;">Extracted Text Preview:</p>
        <div style="background-color: #f7fafc; border: 1px solid #e2e8f0; border-radius: 4px; padding: 12px; font-family: monospace; font-size: 11px; color: #4a5568; line-height: 1.5; white-space: pre-wrap;">
${snippet}
        </div>
      </div>

      <p style="font-size: 12px; color: #a0aec0; margin-top: 24px; border-top: 1px solid #edf2f7; pt: 16px;">
        You can now search any word or section inside this brief directly from the Document Library.
      </p>
    </div>
  </div>
</body>
</html>
`;

    try {
      await transporter.sendMail({
        from: config.SMTP_MAIL,
        to: toEmail,
        subject: `✅ OCR Indexing Completed: ${fileName}`,
        html,
      });
      console.log(`[ocrEmailService] OCR completion email sent to ${toEmail}`);
      return true;
    } catch (err) {
      console.error("[ocrEmailService] Failed to send OCR success email:", err);
      return false;
    }
  },

  /**
   * Send notification email when OCR fails
   */
  async sendOcrFailureEmail(data: OcrFailureEmailData): Promise<boolean> {
    const { toEmail, userName = "Advocate", fileName, errorReason } = data;
    if (!toEmail) return false;

    const html = `
<!DOCTYPE html>
<html>
<body style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; background-color: #f7f6f2; padding: 24px; color: #2c2b29;">
  <div style="max-width: 580px; margin: 0 auto; background: #ffffff; border-radius: 8px; border: 1px solid #e5dfd5; padding: 24px;">
    <h3 style="color: #c53030; margin-top: 0;">❌ OCR Processing Alert</h3>
    <p>Hello ${userName},</p>
    <p>We encountered an issue while processing OCR indexing for <strong>${fileName}</strong>:</p>
    <p style="background: #fff5f5; border: 1px solid #fed7d7; padding: 12px; border-radius: 4px; color: #9b2c2c; font-size: 12px;">
      ${errorReason}
    </p>
    <p style="font-size: 12px; color: #718096;">
      No monthly page quota was deducted for this attempt. You can retry indexing or re-upload the document.
    </p>
  </div>
</body>
</html>
`;

    try {
      await transporter.sendMail({
        from: config.SMTP_MAIL,
        to: toEmail,
        subject: `❌ OCR Indexing Failed: ${fileName}`,
        html,
      });
      return true;
    } catch (err) {
      console.error("[ocrEmailService] Failed to send OCR failure email:", err);
      return false;
    }
  },
};

export default ocrEmailService;
