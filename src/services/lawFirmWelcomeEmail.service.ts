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

export interface LawFirmWelcomeEmailParams {
  lawyerName: string;
  lawyerEmail: string;
  password?: string;
  firmName: string;
  workspaceSlug: string;
  planName?: string;
  loginUrl?: string;
}

export const sendLawFirmWelcomeEmail = async ({
  lawyerName,
  lawyerEmail,
  password,
  firmName,
  workspaceSlug,
  planName = "14-Day Free Trial",
  loginUrl,
}: LawFirmWelcomeEmailParams): Promise<boolean> => {
  try {
    const clientAppUrl =
      loginUrl ||
      config.ORIGIN_CLIENT ||
      config.ORIGIN_FRONTEND ||
      "http://localhost:5173";

    const practiceLoginUrl = `${clientAppUrl}/login`;

    const mailOptions = {
      from: `"${config.APP_NAME || "LawOS Platform"}" <${config.SMTP_MAIL || "support@lawmanagement.com"}>`,
      to: lawyerEmail,
      subject: `Your Law Practice Workspace has been Created - ${firmName}`,
      html: `
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>Law Firm Account Created</title>
</head>
<body style="margin:0; padding:0; background:#0f172a; font-family:-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; color:#334155;">
  <table width="100%" cellpadding="0" cellspacing="0" border="0" style="background:#0f172a; padding:40px 15px;">
    <tr>
      <td align="center">
        <table width="600" cellpadding="0" cellspacing="0" border="0" style="width:100%; max-width:600px; background:#ffffff; border-radius:12px; overflow:hidden; box-shadow:0 20px 25px -5px rgba(0, 0, 0, 0.2), 0 8px 10px -6px rgba(0, 0, 0, 0.2);">
          
          <!-- HEADER -->
          <tr>
            <td style="background: linear-gradient(135deg, #0f172a 0%, #1e293b 100%); padding:32px 36px; text-align:left; border-bottom:3px solid #10b981;">
              <div style="display:inline-block; padding:4px 10px; background:rgba(16, 185, 129, 0.2); border:1px solid rgba(16, 185, 129, 0.4); border-radius:6px; color:#6ee7b7; font-size:11px; font-weight:600; text-transform:uppercase; letter-spacing:0.05em; margin-bottom:12px;">
                Law Practice Workspace Provisioned
              </div>
              <h1 style="margin:0; color:#ffffff; font-size:22px; font-weight:700; letter-spacing:-0.02em;">
                Welcome to ${config.APP_NAME || "LawOS"}
              </h1>
              <p style="margin:6px 0 0; color:#94a3b8; font-size:13px;">
                Your managing partner account & law firm practice are ready
              </p>
            </td>
          </tr>

          <!-- MAIN BODY -->
          <tr>
            <td style="padding:36px 36px 24px;">
              <p style="margin:0 0 16px; font-size:15px; color:#1e293b; line-height:1.6;">
                Dear <strong>${lawyerName}</strong>,
              </p>
              <p style="margin:0 0 24px; font-size:14px; color:#475569; line-height:1.6;">
                Your dedicated law firm workspace for <strong>${firmName}</strong> has been provisioned on the platform by the administrator. Below are your official account credentials to access your workspace.
              </p>

              <!-- CREDENTIALS TABLE -->
              <table width="100%" cellpadding="0" cellspacing="0" border="0" style="background:#f8fafc; border:1px solid #e2e8f0; border-radius:10px; margin-bottom:24px;">
                <tr>
                  <td style="padding:20px 24px;">
                    <table width="100%" cellpadding="6" cellspacing="0" border="0">
                      <tr>
                        <td width="35%" style="font-size:12px; font-weight:600; text-transform:uppercase; letter-spacing:0.05em; color:#64748b; padding-left:0;">
                          Law Practice
                        </td>
                        <td style="font-size:13px; font-weight:700; color:#0f172a;">
                          ${firmName}
                        </td>
                      </tr>
                      <tr>
                        <td style="font-size:12px; font-weight:600; text-transform:uppercase; letter-spacing:0.05em; color:#64748b; padding-left:0;">
                          Workspace Scope
                        </td>
                        <td style="font-size:12px; font-family:monospace; color:#059669; font-weight:600;">
                          /${workspaceSlug}
                        </td>
                      </tr>
                      <tr>
                        <td style="font-size:12px; font-weight:600; text-transform:uppercase; letter-spacing:0.05em; color:#64748b; padding-left:0;">
                          Subscription Tier
                        </td>
                        <td style="font-size:12px; font-weight:600; color:#0284c7;">
                          ${planName}
                        </td>
                      </tr>
                      <tr>
                        <td style="font-size:12px; font-weight:600; text-transform:uppercase; letter-spacing:0.05em; color:#64748b; padding-left:0;">
                          Login Email
                        </td>
                        <td style="font-size:13px; font-family:monospace; color:#0f172a; font-weight:600;">
                          ${lawyerEmail}
                        </td>
                      </tr>
                      ${
                        password
                          ? `
                      <tr>
                        <td style="font-size:12px; font-weight:600; text-transform:uppercase; letter-spacing:0.05em; color:#64748b; padding-left:0;">
                          Temporary Password
                        </td>
                        <td>
                          <span style="display:inline-block; background:#ffffff; border:1px dashed #cbd5e1; padding:4px 10px; border-radius:6px; font-family:monospace; font-size:14px; font-weight:700; color:#0f172a; letter-spacing:0.05em;">
                            ${password}
                          </span>
                        </td>
                      </tr>
                      `
                          : ""
                      }
                    </table>
                  </td>
                </tr>
              </table>

              <!-- IMPORTANT PASSWORD CHANGE NOTICE -->
              <table width="100%" cellpadding="0" cellspacing="0" border="0" style="background:#fffbeb; border:1px solid #fde68a; border-radius:8px; margin-bottom:28px;">
                <tr>
                  <td style="padding:16px 20px;">
                    <div style="font-size:13px; font-weight:700; color:#b45309; margin-bottom:4px; display:flex; align-items:center;">
                      🔒 Important Security Requirement:
                    </div>
                    <div style="font-size:13px; color:#92400e; line-height:1.5;">
                      Please note: The password above is a temporary credential generated for your initial onboarding. <strong>Please change your password immediately after logging in</strong> by navigating to <em>Settings &rarr; Security & Password</em>.
                    </div>
                  </td>
                </tr>
              </table>

              <!-- CTA BUTTON -->
              <table width="100%" cellpadding="0" cellspacing="0" border="0" style="margin-bottom:28px;">
                <tr>
                  <td align="center">
                    <a href="${practiceLoginUrl}" target="_blank" style="display:inline-block; background:#10b981; color:#ffffff; font-size:14px; font-weight:600; text-decoration:none; padding:12px 28px; border-radius:8px; box-shadow:0 4px 6px -1px rgba(16, 185, 129, 0.2); letter-spacing:-0.01em;">
                      Log In to Practice Workspace &rarr;
                    </a>
                  </td>
                </tr>
              </table>

              <p style="margin:0; font-size:12px; color:#64748b; line-height:1.5;">
                If you have any questions or require assistance setting up your associates, chambers, or matters, please contact support or your organization administrator.
              </p>
            </td>
          </tr>

          <!-- FOOTER -->
          <tr>
            <td style="background:#f8fafc; padding:20px 36px; border-top:1px solid #e2e8f0; text-align:center;">
              <p style="margin:0; font-size:11px; color:#94a3b8; line-height:1.5;">
                This is an automated administrative notification. Please do not reply directly to this email.<br />
                &copy; ${new Date().getFullYear()} ${config.APP_NAME || "LawOS Legal Management Platform"}. All rights reserved.
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
    console.log("Law firm welcome email dispatched:", info.messageId);
    return true;
  } catch (error) {
    console.error("Failed to send law firm welcome email:", error);
    return false;
  }
};
