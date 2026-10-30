import nodemailer from "nodemailer";
import { config } from "../config/index.js";
import {
  buildMiLawEmailHtml,
  escapeHtml,
  getMiLawLogoAttachments,
} from "./emailBrandLayout.js";

interface ClientEmailParams {
  clientName: string;
  clientEmail: string;
  password: string;
  firmName?: string;
  officeName?: string;
  loginUrl?: string;
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

export const clientEmailService = async ({
  clientName,
  clientEmail,
  password,
  firmName,
  officeName,
  loginUrl,
}: ClientEmailParams): Promise<{ success: boolean }> => {
  try {
    const transporter = createTransporter();

    const basePortalUrl =
      config.ORIGIN_CLIENT || config.ORIGIN_FRONTEND || "http://localhost:5174";
    const resolvedLoginUrl =
      loginUrl || `${basePortalUrl.replace(/\/$/, "")}/login`;

    const badgeHtml = `<span style="display:inline-block;background-color:#ecfdf5;color:#047857;font-size:11px;font-weight:700;padding:4px 12px;border-radius:20px;text-transform:uppercase;letter-spacing:0.6px;border:1px solid #a7f3d0;">Client Portal Access</span>`;

    const bodyHtml = `
      <p style="margin:0 0 12px;color:#0f172a;font-size:15px;">
        Dear <strong>${escapeHtml(clientName)}</strong>,
      </p>
      <p style="margin:0 0 24px;color:#475569;font-size:14px;line-height:1.6;">
        Welcome! Your secure <strong>Client Portal</strong> account has been set up${
          firmName ? ` by <strong>${escapeHtml(firmName)}</strong>` : ""
        }. You can now track real-time case progress, upcoming hearing dates, shared legal documents, and scheduled consultations online.
      </p>

      <!-- Credentials Box -->
      <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#f8fafc;border:1px solid #e2e8f0;border-radius:10px;margin-bottom:24px;">
        <tr>
          <td style="padding:18px 20px;">
            <p style="margin:0 0 12px;font-size:11px;font-weight:700;text-transform:uppercase;letter-spacing:0.8px;color:#64748b;">
              Your Client Portal Credentials
            </p>
            <table role="presentation" width="100%" cellpadding="0" cellspacing="0">
              ${
                firmName || officeName
                  ? `<tr>
                      <td style="padding:7px 0;color:#64748b;font-size:13px;width:130px;border-bottom:1px solid #f1f5f9;">Law Chamber</td>
                      <td style="padding:7px 0;color:#0f172a;font-size:13px;font-weight:700;border-bottom:1px solid #f1f5f9;">${escapeHtml([firmName, officeName].filter(Boolean).join(" — "))}</td>
                    </tr>`
                  : ""
              }
              <tr>
                <td style="padding:7px 0;color:#64748b;font-size:13px;width:130px;border-bottom:1px solid #f1f5f9;">Portal Link</td>
                <td style="padding:7px 0;color:#0f172a;font-size:13px;font-weight:600;border-bottom:1px solid #f1f5f9;">
                  <a href="${escapeHtml(resolvedLoginUrl)}" style="color:#4f46e5;text-decoration:none;">${escapeHtml(resolvedLoginUrl)}</a>
                </td>
              </tr>
              <tr>
                <td style="padding:7px 0;color:#64748b;font-size:13px;border-bottom:1px solid #f1f5f9;">Login Email</td>
                <td style="padding:7px 0;color:#0f172a;font-size:13px;font-weight:700;border-bottom:1px solid #f1f5f9;">${escapeHtml(clientEmail)}</td>
              </tr>
              <tr>
                <td style="padding:10px 0 4px;color:#64748b;font-size:13px;">Temp Password</td>
                <td style="padding:10px 0 4px;">
                  <code style="background:#0f172a;color:#f8fafc;padding:5px 12px;border-radius:6px;font-size:14px;font-weight:700;letter-spacing:0.6px;font-family:'Courier New',monospace;">${escapeHtml(password)}</code>
                </td>
              </tr>
            </table>
          </td>
        </tr>
      </table>

      <!-- What You Can Do Card -->
      <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#ffffff;border:1px solid #e2e8f0;border-radius:10px;margin-bottom:24px;">
        <tr>
          <td style="padding:16px 20px;">
            <p style="margin:0 0 8px;font-size:11px;font-weight:700;text-transform:uppercase;letter-spacing:0.8px;color:#64748b;">
              What You Can Access in Your Portal
            </p>
            <ul style="margin:0;padding-left:18px;color:#475569;font-size:13px;line-height:1.7;">
              <li>Live status updates on your active legal matters &amp; court proceedings</li>
              <li>Upcoming court hearing dates, stages, and courtroom numbers</li>
              <li>Consultation appointments and case documents shared by your advocate</li>
            </ul>
          </td>
        </tr>
      </table>

      <!-- CTA Button -->
      <div style="text-align:center;margin:28px 0;">
        <a href="${escapeHtml(resolvedLoginUrl)}" style="display:inline-block;background-color:#0f172a;color:#ffffff;text-decoration:none;padding:13px 32px;border-radius:8px;font-size:14px;font-weight:600;">
          Sign In to Client Portal &rarr;
        </a>
      </div>

      <!-- Security Warning -->
      <div style="background:#fffbeb;border-left:4px solid #f59e0b;padding:12px 16px;border-radius:6px;">
        <p style="margin:0;color:#92400e;font-size:12px;line-height:1.5;">
          <strong>Security Tip:</strong> Please update your temporary password upon your first login to protect your confidential legal records.
        </p>
      </div>
    `;

    const html = buildMiLawEmailHtml({
      documentTitle: "Welcome to Your Client Portal — MI Law",
      brandSubtitle: firmName || "Client Portal Services",
      badgeHtml,
      heading: "Your Client Portal is Ready",
      subheading:
        "Access your legal matters, hearing dates, and chamber updates online",
      bodyHtml,
      footerReason: "Automated Client Portal Onboarding Notification",
      firmName,
    });

    await transporter.sendMail({
      from: `"${firmName || config.APP_NAME || "MI Law"}" <${config.SMTP_MAIL}>`,
      to: clientEmail,
      subject: `Welcome to ${firmName || "MI Law"} — Your Client Portal Login Credentials`,
      html,
      attachments: getMiLawLogoAttachments(),
    });

    return { success: true };
  } catch (error) {
    console.error("Client email send failed:", error);
    return { success: false };
  }
};

export default clientEmailService;
