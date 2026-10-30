import nodemailer from "nodemailer";
import { config } from "../config/index.js";
import {
  buildMiLawEmailHtml,
  escapeHtml,
  getMiLawLogoAttachments,
} from "./emailBrandLayout.js";

interface AdminWelcomeEmailParams {
  adminName: string;
  adminEmail: string;
  password: string;
  roleName: string;
  roleSlug?: string;
  grantedPermissions?: string[];
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

export const sendAdminWelcomeEmail = async ({
  adminName,
  adminEmail,
  password,
  roleName,
  roleSlug = "admin",
  grantedPermissions = [],
  loginUrl,
}: AdminWelcomeEmailParams): Promise<{ success: boolean; error?: string }> => {
  try {
    if (!config.SMTP_HOST || !config.SMTP_MAIL || !config.SMTP_PASS) {
      console.warn(
        "[AdminWelcomeEmail] SMTP configuration missing. Skipping email dispatch.",
      );
      return { success: false, error: "SMTP not configured" };
    }

    const transporter = createTransporter();
    const portalUrl =
      loginUrl ||
      (config.ORIGIN_ADMIN
        ? `${config.ORIGIN_ADMIN.replace(/\/$/, "")}/login`
        : "http://localhost:5175/login");

    const isSuperAdmin =
      roleSlug === "super-admin" || roleSlug === "super_admin";

    const permissionsChipsHtml = isSuperAdmin
      ? `<div style="display:inline-block;padding:8px 14px;background:#fef3c7;border:1px solid #fde68a;border-radius:8px;color:#92400e;font-size:13px;font-weight:700;">
           ★ Unrestricted Super Admin Access (All Modules &amp; System Settings)
         </div>`
      : grantedPermissions.length > 0
        ? grantedPermissions
            .map(
              (perm) =>
                `<span style="display:inline-block;margin:3px 4px 3px 0;padding:4px 10px;background:#f1f5f9;border:1px solid #cbd5e1;border-radius:6px;color:#1e293b;font-size:12px;font-weight:600;font-family:monospace;">${escapeHtml(perm)}</span>`,
            )
            .join("")
        : `<span style="color:#64748b;font-size:13px;">Standard Read-Only Dashboard Access</span>`;

    const badgeHtml = `<span style="display:inline-block;background-color:#eef2ff;color:#4f46e5;font-size:11px;font-weight:700;padding:4px 12px;border-radius:20px;text-transform:uppercase;letter-spacing:0.6px;border:1px solid #c7d2fe;">Admin Portal Provisioned</span>`;

    const bodyHtml = `
      <p style="margin:0 0 12px;color:#0f172a;font-size:15px;">
        Dear <strong>${escapeHtml(adminName)}</strong>,
      </p>
      <p style="margin:0 0 24px;color:#475569;font-size:14px;line-height:1.6;">
        You have been appointed to the <strong>MI Law Platform Administration Team</strong>. Your account is now active and configured with the role and module permissions detailed below.
      </p>

      <!-- Credentials Box -->
      <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#f8fafc;border:1px solid #e2e8f0;border-radius:10px;margin-bottom:24px;">
        <tr>
          <td style="padding:18px 20px;">
            <p style="margin:0 0 12px;font-size:11px;font-weight:700;text-transform:uppercase;letter-spacing:0.8px;color:#64748b;">
              Your Login Credentials
            </p>
            <table role="presentation" width="100%" cellpadding="0" cellspacing="0">
              <tr>
                <td style="padding:7px 0;color:#64748b;font-size:13px;width:130px;border-bottom:1px solid #f1f5f9;">Portal URL</td>
                <td style="padding:7px 0;color:#0f172a;font-size:13px;font-weight:600;border-bottom:1px solid #f1f5f9;">
                  <a href="${escapeHtml(portalUrl)}" style="color:#4f46e5;text-decoration:none;">${escapeHtml(portalUrl)}</a>
                </td>
              </tr>
              <tr>
                <td style="padding:7px 0;color:#64748b;font-size:13px;border-bottom:1px solid #f1f5f9;">Email Address</td>
                <td style="padding:7px 0;color:#0f172a;font-size:13px;font-weight:700;border-bottom:1px solid #f1f5f9;">${escapeHtml(adminEmail)}</td>
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

      <!-- Assigned Role & Access Scope -->
      <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#ffffff;border:1px solid #e2e8f0;border-radius:10px;margin-bottom:28px;">
        <tr>
          <td style="padding:18px 20px;">
            <p style="margin:0 0 12px;font-size:11px;font-weight:700;text-transform:uppercase;letter-spacing:0.8px;color:#64748b;">
              Assigned Role &amp; Access Scope
            </p>
            <div style="margin-bottom:14px;">
              <span style="font-size:13px;color:#64748b;margin-right:8px;">Assigned Role:</span>
              <span style="display:inline-block;padding:4px 12px;background:#eef2ff;color:#4f46e5;border:1px solid #c7d2fe;border-radius:999px;font-size:13px;font-weight:700;">
                ${escapeHtml(roleName)} (${escapeHtml(roleSlug)})
              </span>
            </div>
            <div>
              <p style="margin:0 0 8px;font-size:12px;color:#64748b;font-weight:600;">Granted Permission Keys (${isSuperAdmin ? "All" : grantedPermissions.length}):</p>
              <div style="line-height:1.8;">
                ${permissionsChipsHtml}
              </div>
            </div>
          </td>
        </tr>
      </table>

      <!-- CTA Button -->
      <div style="text-align:center;margin:28px 0;">
        <a href="${escapeHtml(portalUrl)}" style="display:inline-block;background-color:#0f172a;color:#ffffff;text-decoration:none;padding:13px 32px;border-radius:8px;font-size:14px;font-weight:600;letter-spacing:0.2px;">
          Sign In to Admin Console &rarr;
        </a>
      </div>

      <!-- Security Warning -->
      <div style="background:#fffbeb;border-left:4px solid #f59e0b;padding:12px 16px;border-radius:6px;">
        <p style="margin:0;color:#92400e;font-size:12px;line-height:1.5;">
          <strong>Security Notice:</strong> Please sign in and update your password immediately after your first login. Never share your administrative credentials with anyone.
        </p>
      </div>
    `;

    const htmlContent = buildMiLawEmailHtml({
      documentTitle: "Welcome to MI Law Admin Console",
      brandSubtitle: "Platform Governance & Administration",
      badgeHtml,
      heading: "Welcome to the Admin Console",
      subheading: "Your administrative account and role permissions are ready",
      bodyHtml,
      footerReason: "Automated Administrative Provisioning Notification",
    });

    await transporter.sendMail({
      from: `"MI Law Platform Admin" <${config.SMTP_MAIL}>`,
      to: adminEmail,
      subject: `Welcome to MI Law Admin Console — Assigned Role: ${roleName}`,
      html: htmlContent,
      attachments: getMiLawLogoAttachments(),
    });

    return { success: true };
  } catch (err: unknown) {
    const errorMessage =
      err instanceof Error ? err.message : "Unknown email dispatch error";
    console.error(
      "[AdminWelcomeEmail] Failed to send admin welcome email:",
      errorMessage,
    );
    return { success: false, error: errorMessage };
  }
};

export default sendAdminWelcomeEmail;
