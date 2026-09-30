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

export interface AdminWelcomeEmailParams {
  adminName: string;
  adminEmail: string;
  password: string;
  roleName: string;
  roleSlug?: string;
  grantedPermissions?: string[];
  loginUrl?: string;
}

export const sendAdminWelcomeEmail = async ({
  adminName,
  adminEmail,
  password,
  roleName,
  roleSlug,
  grantedPermissions = [],
  loginUrl,
}: AdminWelcomeEmailParams): Promise<boolean> => {
  try {
    const adminConsoleUrl =
      loginUrl || config.ORIGIN_ADMIN || "https://law-management-admin.vercel.app";

    const permissionHighlights =
      grantedPermissions.includes("*") || roleSlug === "super_admin"
        ? "Full Master Administrative Control (Unrestricted)"
        : grantedPermissions.length > 0
          ? `${grantedPermissions.length} granular operational permissions granted`
          : "Standard platform management access";

    const mailOptions = {
      from: `"${config.APP_NAME || "Legal Management Platform"}" <${config.SMTP_MAIL}>`,
      to: adminEmail,
      subject: `Platform Administrator Account Provisioned - ${roleName}`,
      html: `
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>Admin Credentials</title>
</head>
<body style="margin:0; padding:0; background:#0f172a; font-family:-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; color:#334155;">
  <table width="100%" cellpadding="0" cellspacing="0" border="0" style="background:#0f172a; padding:40px 15px;">
    <tr>
      <td align="center">
        <table width="600" cellpadding="0" cellspacing="0" border="0" style="width:100%; max-width:600px; background:#ffffff; border-radius:12px; overflow:hidden; box-shadow:0 20px 25px -5px rgba(0, 0, 0, 0.2), 0 8px 10px -6px rgba(0, 0, 0, 0.2);">
          
          <!-- HEADER -->
          <tr>
            <td style="background: linear-gradient(135deg, #0f172a 0%, #1e293b 100%); padding:32px 36px; text-align:left; border-bottom:3px solid #3b82f6;">
              <div style="display:inline-block; padding:4px 10px; background:rgba(59, 130, 246, 0.2); border:1px solid rgba(59, 130, 246, 0.4); border-radius:6px; color:#93c5fd; font-size:11px; font-weight:600; text-transform:uppercase; letter-spacing:0.05em; margin-bottom:12px;">
                Platform Operations
              </div>
              <h1 style="margin:0; color:#ffffff; font-size:22px; font-weight:700; letter-spacing:-0.02em;">
                Administrative Access Granted
              </h1>
              <p style="margin:6px 0 0; color:#94a3b8; font-size:13px;">
                Your platform operator credentials for the Admin Console
              </p>
            </td>
          </tr>

          <!-- MAIN CONTENT -->
          <tr>
            <td style="padding:36px 36px 24px;">
              <p style="margin:0 0 16px; font-size:15px; color:#1e293b; line-height:1.6;">
                Hello <strong>${adminName}</strong>,
              </p>
              <p style="margin:0 0 24px; font-size:14px; color:#475569; line-height:1.6;">
                You have been provisioned as an administrative operator on the platform. Below are your official system credentials to log into the Admin Console.
              </p>

              <!-- CREDENTIALS CARD -->
              <table width="100%" cellpadding="0" cellspacing="0" border="0" style="background:#f8fafc; border:1px solid #e2e8f0; border-radius:10px; margin-bottom:28px;">
                <tr>
                  <td style="padding:20px 24px;">
                    <table width="100%" cellpadding="6" cellspacing="0" border="0">
                      <tr>
                        <td width="35%" style="font-size:12px; font-weight:600; text-transform:uppercase; letter-spacing:0.05em; color:#64748b; padding-left:0;">
                          Portal Role
                        </td>
                        <td style="font-size:13px; font-weight:700; color:#0f172a;">
                          <span style="display:inline-block; padding:3px 8px; background:#eff6ff; border:1px solid #bfdbfe; border-radius:4px; color:#1d4ed8; font-size:12px;">
                            ${roleName}
                          </span>
                        </td>
                      </tr>
                      <tr>
                        <td width="35%" style="font-size:12px; font-weight:600; text-transform:uppercase; letter-spacing:0.05em; color:#64748b; padding-left:0;">
                          Login Email
                        </td>
                        <td style="font-size:14px; font-weight:600; color:#0f172a; font-family:monospace;">
                          ${adminEmail}
                        </td>
                      </tr>
                      <tr>
                        <td width="35%" style="font-size:12px; font-weight:600; text-transform:uppercase; letter-spacing:0.05em; color:#64748b; padding-left:0;">
                          Temporary Password
                        </td>
                        <td style="font-size:14px; font-weight:700; color:#b91c1c; font-family:monospace; background:#fef2f2; padding:6px 10px; border-radius:6px; border:1px dashed #fca5a5;">
                          ${password}
                        </td>
                      </tr>
                      <tr>
                        <td width="35%" style="font-size:12px; font-weight:600; text-transform:uppercase; letter-spacing:0.05em; color:#64748b; padding-left:0;">
                          Scope Scope
                        </td>
                        <td style="font-size:12px; color:#475569;">
                          ${permissionHighlights}
                        </td>
                      </tr>
                    </table>
                  </td>
                </tr>
              </table>

              <!-- CTA BUTTON -->
              <table width="100%" cellpadding="0" cellspacing="0" border="0" style="margin-bottom:28px;">
                <tr>
                  <td align="center">
                    <a href="${adminConsoleUrl}" target="_blank" style="display:inline-block; background:#0f172a; color:#ffffff; font-size:14px; font-weight:600; text-decoration:none; padding:14px 32px; border-radius:8px; box-shadow:0 4px 6px -1px rgba(0, 0, 0, 0.1);">
                      Access Admin Console &rarr;
                    </a>
                  </td>
                </tr>
              </table>

              <!-- SECURITY WARNING -->
              <div style="background:#fffbeb; border:1px solid #fef3c7; border-left:4px solid #f59e0b; padding:14px 16px; border-radius:6px; margin-bottom:20px;">
                <p style="margin:0; font-size:12px; color:#92400e; line-height:1.5;">
                  <strong>Important Security Notice:</strong> This account has elevated platform administrative privileges. You must never share these credentials with unauthorized individuals. For optimal security, please update your password immediately upon first sign-in.
                </p>
              </div>

              <p style="margin:0; font-size:12px; color:#94a3b8; line-height:1.5;">
                Direct URL: <a href="${adminConsoleUrl}" style="color:#2563eb; text-decoration:none;">${adminConsoleUrl}</a>
              </p>
            </td>
          </tr>

          <!-- FOOTER -->
          <tr>
            <td style="background:#f8fafc; padding:20px 36px; border-top:1px solid #e2e8f0; text-align:center;">
              <p style="margin:0; font-size:11px; color:#94a3b8;">
                This is an automated system notification from your Platform Security Administration. Please do not reply directly to this email.
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

    const info = await transporter.sendMail(mailOptions);
    console.log(`✅ [Admin Email] Welcome email dispatched to ${adminEmail} (MsgId: ${info.messageId})`);
    return true;
  } catch (error) {
    console.error("❌ [Admin Email] Failed to send administrator welcome email:", error);
    return false;
  }
};
