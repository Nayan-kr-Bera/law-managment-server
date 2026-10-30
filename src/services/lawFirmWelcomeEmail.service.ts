import nodemailer from "nodemailer";
import { config } from "../config/index.js";
import {
  buildMiLawEmailHtml,
  escapeHtml,
  getMiLawLogoAttachments,
} from "./emailBrandLayout.js";

interface LawFirmWelcomeEmailParams {
  lawyerName: string;
  lawyerEmail: string;
  password: string;
  firmName: string;
  workspaceSlug: string;
  planName?: string;
  loginUrl?: string;
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

export const sendLawFirmWelcomeEmail = async ({
  lawyerName,
  lawyerEmail,
  password,
  firmName,
  workspaceSlug,
  planName = "Enterprise Legal Suite",
  loginUrl,
}: LawFirmWelcomeEmailParams): Promise<{
  success: boolean;
  error?: string;
}> => {
  try {
    if (!config.SMTP_HOST || !config.SMTP_MAIL || !config.SMTP_PASS) {
      console.warn(
        "[LawFirmWelcomeEmail] SMTP configuration missing. Skipping email dispatch.",
      );
      return { success: false, error: "SMTP not configured" };
    }

    const transporter = createTransporter();
    const baseClientUrl =
      config.ORIGIN_CLIENT || config.ORIGIN_FRONTEND || "http://localhost:5173";
    const portalUrl = loginUrl || `${baseClientUrl.replace(/\/$/, "")}/login`;

    const badgeHtml = `<span style="display:inline-block;background-color:#ecfdf5;color:#047857;font-size:11px;font-weight:700;padding:4px 12px;border-radius:20px;text-transform:uppercase;letter-spacing:0.6px;border:1px solid #a7f3d0;">✓ Law Firm Workspace Active</span>`;

    const bodyHtml = `
      <p style="margin:0 0 12px;color:#0f172a;font-size:15px;">
        Dear <strong>${escapeHtml(lawyerName)}</strong>,
      </p>
      <p style="margin:0 0 24px;color:#475569;font-size:14px;line-height:1.6;">
        Congratulations! Your dedicated digital chamber for <strong>${escapeHtml(firmName)}</strong> has been provisioned on the <strong>MI Law Practice Management Platform</strong>. Your workspace is pre-configured with court docket management, AI legal OCR, client portals, and chamber billing tools.
      </p>

      <!-- Workspace Details Card -->
      <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#ffffff;border:1px solid #e2e8f0;border-radius:10px;margin-bottom:20px;">
        <tr>
          <td style="padding:18px 20px;">
            <p style="margin:0 0 12px;font-size:11px;font-weight:700;text-transform:uppercase;letter-spacing:0.8px;color:#64748b;">
              Provisioned Chamber Details
            </p>
            <table role="presentation" width="100%" cellpadding="0" cellspacing="0">
              <tr>
                <td style="padding:7px 0;color:#64748b;font-size:13px;width:140px;border-bottom:1px solid #f1f5f9;">Law Firm / Chamber</td>
                <td style="padding:7px 0;color:#0f172a;font-size:13px;font-weight:700;border-bottom:1px solid #f1f5f9;">${escapeHtml(firmName)}</td>
              </tr>
              <tr>
                <td style="padding:7px 0;color:#64748b;font-size:13px;border-bottom:1px solid #f1f5f9;">Workspace ID</td>
                <td style="padding:7px 0;color:#0f172a;font-size:13px;font-weight:600;border-bottom:1px solid #f1f5f9;">
                  <code style="background:#f1f5f9;color:#334155;padding:3px 8px;border-radius:4px;font-size:12px;">${escapeHtml(workspaceSlug)}</code>
                </td>
              </tr>
              <tr>
                <td style="padding:7px 0;color:#64748b;font-size:13px;">Active Subscription</td>
                <td style="padding:7px 0;">
                  <span style="display:inline-block;padding:3px 10px;background:#ecfdf5;color:#047857;border:1px solid #a7f3d0;border-radius:999px;font-size:12px;font-weight:700;">
                    ${escapeHtml(planName)}
                  </span>
                </td>
              </tr>
            </table>
          </td>
        </tr>
      </table>

      <!-- Login Credentials Card -->
      <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#f8fafc;border:1px solid #e2e8f0;border-radius:10px;margin-bottom:24px;">
        <tr>
          <td style="padding:18px 20px;">
            <p style="margin:0 0 12px;font-size:11px;font-weight:700;text-transform:uppercase;letter-spacing:0.8px;color:#64748b;">
              Administrator Login Credentials
            </p>
            <table role="presentation" width="100%" cellpadding="0" cellspacing="0">
              <tr>
                <td style="padding:7px 0;color:#64748b;font-size:13px;width:140px;border-bottom:1px solid #f1f5f9;">Workspace URL</td>
                <td style="padding:7px 0;color:#0f172a;font-size:13px;font-weight:600;border-bottom:1px solid #f1f5f9;">
                  <a href="${escapeHtml(portalUrl)}" style="color:#4f46e5;text-decoration:none;">${escapeHtml(portalUrl)}</a>
                </td>
              </tr>
              <tr>
                <td style="padding:7px 0;color:#64748b;font-size:13px;border-bottom:1px solid #f1f5f9;">Admin Email</td>
                <td style="padding:7px 0;color:#0f172a;font-size:13px;font-weight:700;border-bottom:1px solid #f1f5f9;">${escapeHtml(lawyerEmail)}</td>
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

      <!-- CTA Button -->
      <div style="text-align:center;margin:28px 0;">
        <a href="${escapeHtml(portalUrl)}" style="display:inline-block;background-color:#0f172a;color:#ffffff;text-decoration:none;padding:13px 32px;border-radius:8px;font-size:14px;font-weight:600;">
          Launch Your Law Firm Workspace &rarr;
        </a>
      </div>

      <!-- Security Warning -->
      <div style="background:#fffbeb;border-left:4px solid #f59e0b;padding:12px 16px;border-radius:6px;">
        <p style="margin:0;color:#92400e;font-size:12px;line-height:1.5;">
          <strong>Security Notice:</strong> As the Primary Chamber Administrator, please update your temporary password immediately after your first sign-in.
        </p>
      </div>
    `;

    const htmlContent = buildMiLawEmailHtml({
      documentTitle: `Welcome to MI Law — ${firmName}`,
      brandSubtitle: `${firmName} • Chamber Workspace`,
      badgeHtml,
      heading: "Your Law Firm Workspace is Live",
      subheading: `${escapeHtml(firmName)} is ready on the MI Law platform`,
      bodyHtml,
      footerReason: "Automated Law Firm Provisioning Notification from MI Law",
      firmName,
    });

    await transporter.sendMail({
      from: `"MI Law Platform" <${config.SMTP_MAIL}>`,
      to: lawyerEmail,
      subject: `Welcome to MI Law — Your Workspace for "${firmName}" is Ready!`,
      html: htmlContent,
      attachments: getMiLawLogoAttachments(),
    });

    return { success: true };
  } catch (err: unknown) {
    const errorMessage =
      err instanceof Error ? err.message : "Unknown email dispatch error";
    console.error(
      "[LawFirmWelcomeEmail] Failed to send welcome email:",
      errorMessage,
    );
    return { success: false, error: errorMessage };
  }
};

export default sendLawFirmWelcomeEmail;
