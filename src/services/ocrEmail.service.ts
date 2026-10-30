import nodemailer from "nodemailer";
import { config } from "../config/index.js";
import {
  buildMiLawEmailHtml,
  escapeHtml,
  getMiLawLogoAttachments,
} from "./emailBrandLayout.js";

const createTransporter = () => {
  const port = Number(config.SMTP_PORT) || 2525;
  const secure = config.SMTP_SRC === "true" || port === 465;

  return nodemailer.createTransport({
    host: config.SMTP_HOST,
    port,
    secure,
    auth: {
      user: config.SMTP_MAIL,
      pass: config.SMTP_PASS,
    },
    tls: {
      rejectUnauthorized: false,
    },
  });
};

export interface OcrCompletionEmailData {
  toEmail: string;
  userName: string;
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
  firmName?: string;
}

class OcrEmailService {
  /**
   * Sends an email notification when background OCR processing finishes successfully
   */
  public async sendOcrSuccessEmail(
    data: OcrCompletionEmailData,
  ): Promise<boolean> {
    if (!config.SMTP_MAIL || !config.SMTP_PASS) {
      console.warn(
        "[OcrEmailService] SMTP credentials not configured. Skipping OCR email.",
      );
      return false;
    }

    try {
      const transporter = createTransporter();
      const {
        toEmail,
        userName,
        fileName,
        pageCount,
        totalPages,
        pagesSkipped = 0,
        charCount,
        monthlyPagesUsed,
        monthlyPagesLimit,
        previewText,
        documentUrl,
        warning,
        firmName,
      } = data;

      const isUnlimited = monthlyPagesLimit === -1;
      const quotaDisplay = isUnlimited
        ? `${monthlyPagesUsed} pages used (Unlimited Plan)`
        : `${monthlyPagesUsed} / ${monthlyPagesLimit} pages (${Math.min(
            100,
            Math.round((monthlyPagesUsed / monthlyPagesLimit) * 100),
          )}%)`;

      const pagesDisplay =
        totalPages && totalPages > pageCount
          ? `${pageCount} of ${totalPages} page(s) (${pagesSkipped} skipped)`
          : `${pageCount} page(s)`;

      const snippet = previewText
        ? previewText.slice(0, 380).trim() +
          (previewText.length > 380 ? "..." : "")
        : "Text extracted and indexed successfully.";

      const workspaceDocsUrl =
        documentUrl ||
        `${(config.ORIGIN_CLIENT || config.ORIGIN_FRONTEND || "http://localhost:5173").replace(/\/$/, "")}/documents`;

      const isPartial = Boolean(warning || pagesSkipped > 0);
      const badgeHtml = isPartial
        ? `<span style="display:inline-block;background-color:#fffbeb;color:#d97706;font-size:11px;font-weight:700;padding:4px 12px;border-radius:20px;text-transform:uppercase;letter-spacing:0.6px;border:1px solid #fde68a;">⚠ Partial OCR Extraction</span>`
        : `<span style="display:inline-block;background-color:#ecfdf5;color:#047857;font-size:11px;font-weight:700;padding:4px 12px;border-radius:20px;text-transform:uppercase;letter-spacing:0.6px;border:1px solid #a7f3d0;">✓ OCR Extraction Complete</span>`;

      const warningBannerHtml = isPartial
        ? `
        <div style="background:#fffbeb;border-left:4px solid #f59e0b;padding:12px 16px;border-radius:6px;margin-bottom:20px;">
          <p style="margin:0;color:#92400e;font-size:13px;line-height:1.5;">
            <strong>Partial Extraction Notice:</strong> ${escapeHtml(
              warning ||
                `Processed first ${pageCount} of ${totalPages} pages. Remaining ${pagesSkipped} page(s) were skipped due to OCR credit limit.`,
            )}
          </p>
        </div>`
        : "";

      const bodyHtml = `
        <p style="margin:0 0 12px;color:#0f172a;font-size:15px;">
          Hello <strong>${escapeHtml(userName || "Advocate")}</strong>,
        </p>
        <p style="margin:0 0 20px;color:#475569;font-size:14px;line-height:1.6;">
          Your legal document has finished background AI OCR processing and is now searchable inside your <strong>MI Law Document Library</strong>.
        </p>

        ${warningBannerHtml}

        <!-- Extraction Metrics Table -->
        <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#f8fafc;border:1px solid #e2e8f0;border-radius:10px;margin-bottom:20px;">
          <tr>
            <td style="padding:18px 20px;">
              <p style="margin:0 0 12px;font-size:11px;font-weight:700;text-transform:uppercase;letter-spacing:0.8px;color:#64748b;">
                OCR Extraction Summary
              </p>
              <table role="presentation" width="100%" cellpadding="0" cellspacing="0">
                <tr>
                  <td style="padding:7px 0;color:#64748b;font-size:13px;width:155px;border-bottom:1px solid #f1f5f9;">Document Name</td>
                  <td style="padding:7px 0;color:#0f172a;font-size:13px;font-weight:700;border-bottom:1px solid #f1f5f9;">${escapeHtml(fileName)}</td>
                </tr>
                <tr>
                  <td style="padding:7px 0;color:#64748b;font-size:13px;border-bottom:1px solid #f1f5f9;">Pages Processed</td>
                  <td style="padding:7px 0;color:#047857;font-size:13px;font-weight:700;border-bottom:1px solid #f1f5f9;">${escapeHtml(pagesDisplay)}</td>
                </tr>
                <tr>
                  <td style="padding:7px 0;color:#64748b;font-size:13px;border-bottom:1px solid #f1f5f9;">Characters Indexed</td>
                  <td style="padding:7px 0;color:#0f172a;font-size:13px;font-weight:600;border-bottom:1px solid #f1f5f9;">${charCount.toLocaleString()} characters</td>
                </tr>
                <tr>
                  <td style="padding:7px 0;color:#64748b;font-size:13px;">Monthly Quota Usage</td>
                  <td style="padding:7px 0;color:#4f46e5;font-size:13px;font-weight:700;">${escapeHtml(quotaDisplay)}</td>
                </tr>
              </table>
            </td>
          </tr>
        </table>

        <!-- Extracted Text Preview -->
        <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#ffffff;border:1px solid #e2e8f0;border-radius:10px;margin-bottom:24px;">
          <tr>
            <td style="padding:16px 20px;">
              <p style="margin:0 0 8px;font-size:11px;font-weight:700;text-transform:uppercase;letter-spacing:0.8px;color:#64748b;">
                Extracted Text Snippet
              </p>
              <div style="font-family:'Courier New',monospace;font-size:12px;color:#334155;line-height:1.6;white-space:pre-wrap;background:#f8fafc;padding:12px;border-radius:6px;border:1px solid #f1f5f9;">${escapeHtml(snippet)}</div>
            </td>
          </tr>
        </table>

        <!-- CTA Button -->
        <div style="text-align:center;margin:24px 0 8px;">
          <a href="${escapeHtml(workspaceDocsUrl)}" style="display:inline-block;background-color:#0f172a;color:#ffffff;text-decoration:none;padding:12px 28px;border-radius:8px;font-size:14px;font-weight:600;">
            View Document in Workspace &rarr;
          </a>
        </div>
      `;

      const html = buildMiLawEmailHtml({
        documentTitle: `OCR Completed — ${fileName}`,
        brandSubtitle: "Document Intelligence & OCR Engine",
        badgeHtml,
        heading: isPartial
          ? "OCR Completed (Partial Pages)"
          : "Document OCR Completed",
        subheading: escapeHtml(fileName),
        bodyHtml,
        footerReason:
          "Automated Document Intelligence Notification from MI Law",
        firmName,
      });

      await transporter.sendMail({
        from: `"${config.APP_NAME || "MI Law Document AI"}" <${config.SMTP_MAIL}>`,
        to: toEmail,
        subject: `${isPartial ? "OCR Completed (Partial)" : "OCR Completed"}: ${fileName} (${pagesDisplay})`,
        html,
        attachments: getMiLawLogoAttachments(),
      });

      return true;
    } catch (err) {
      console.error("[OcrEmailService] Failed to send OCR success email:", err);
      return false;
    }
  }

  /**
   * Sends an email notification if OCR fails (e.g., quota exceeded or unreadable file)
   */
  public async sendOcrFailureEmail(params: {
    toEmail: string;
    userName: string;
    fileName: string;
    errorReason: string;
    firmName?: string;
  }): Promise<boolean> {
    if (!config.SMTP_MAIL || !config.SMTP_PASS) return false;

    try {
      const transporter = createTransporter();
      const { toEmail, userName, fileName, errorReason, firmName } = params;
      const workspaceDocsUrl = `${(config.ORIGIN_CLIENT || config.ORIGIN_FRONTEND || "http://localhost:5173").replace(/\/$/, "")}/documents`;

      const badgeHtml = `<span style="display:inline-block;background-color:#fef2f2;color:#dc2626;font-size:11px;font-weight:700;padding:4px 12px;border-radius:20px;text-transform:uppercase;letter-spacing:0.6px;border:1px solid #fecaca;">✕ OCR Processing Failed</span>`;

      const bodyHtml = `
        <p style="margin:0 0 12px;color:#0f172a;font-size:15px;">
          Hello <strong>${escapeHtml(userName || "Advocate")}</strong>,
        </p>
        <p style="margin:0 0 20px;color:#475569;font-size:14px;line-height:1.6;">
          We were unable to complete background OCR text extraction for your uploaded document <strong>${escapeHtml(fileName)}</strong>.
        </p>

        <!-- Error Details Box -->
        <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#fef2f2;border:1px solid #fecaca;border-left:4px solid #dc2626;border-radius:10px;margin-bottom:24px;">
          <tr>
            <td style="padding:18px 20px;">
              <p style="margin:0 0 6px;font-size:11px;font-weight:700;text-transform:uppercase;letter-spacing:0.8px;color:#b91c1c;">
                Diagnostic Reason
              </p>
              <p style="margin:0;color:#7f1d1d;font-size:13px;line-height:1.6;font-weight:600;">
                ${escapeHtml(errorReason)}
              </p>
            </td>
          </tr>
        </table>

        <p style="margin:0 0 24px;color:#475569;font-size:13px;line-height:1.6;">
          Please verify that the uploaded file is a valid, unencrypted PDF or clear image scan, and ensure your workspace has sufficient OCR credits before retrying.
        </p>

        <!-- CTA Button -->
        <div style="text-align:center;margin:24px 0 8px;">
          <a href="${escapeHtml(workspaceDocsUrl)}" style="display:inline-block;background-color:#0f172a;color:#ffffff;text-decoration:none;padding:12px 28px;border-radius:8px;font-size:14px;font-weight:600;">
            Manage Documents &amp; Credits &rarr;
          </a>
        </div>
      `;

      const html = buildMiLawEmailHtml({
        documentTitle: `OCR Processing Failed — ${fileName}`,
        brandSubtitle: "Document Intelligence & OCR Engine",
        badgeHtml,
        heading: "Document OCR Could Not Complete",
        subheading: escapeHtml(fileName),
        bodyHtml,
        footerReason: "Automated Document Intelligence Alert from MI Law",
        firmName,
      });

      await transporter.sendMail({
        from: `"${config.APP_NAME || "MI Law Document AI"}" <${config.SMTP_MAIL}>`,
        to: toEmail,
        subject: `OCR Processing Failed: ${fileName}`,
        html,
        attachments: getMiLawLogoAttachments(),
      });
      return true;
    } catch (err) {
      console.error("[OcrEmailService] Failed to send OCR failure email:", err);
      return false;
    }
  }
}

export const ocrEmailService = new OcrEmailService();
export default ocrEmailService;
