import nodemailer from "nodemailer";
import { config } from "../config/index.js";
import {
  buildMiLawEmailHtml,
  escapeHtml,
  getMiLawLogoAttachments,
} from "./emailBrandLayout.js";

interface AdvocateEmailParams {
  advocateName: string;
  advocateEmail: string;
  password: string;
  officeName: string;
  roleName: string;
  firmName?: string;
  designation?: string;
  enrollmentNo?: string;
  barCouncil?: string;
  practiceArea?: string;
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

export const advocateEmailService = async ({
  advocateName,
  advocateEmail,
  password,
  officeName,
  roleName,
  firmName,
  designation,
  enrollmentNo,
  barCouncil,
  practiceArea,
  loginUrl,
}: AdvocateEmailParams): Promise<{ success: boolean }> => {
  try {
    const transporter = createTransporter();

    const baseClientUrl =
      config.ORIGIN_CLIENT || config.ORIGIN_FRONTEND || "http://localhost:5173";
    const resolvedLoginUrl =
      loginUrl || `${baseClientUrl.replace(/\/$/, "")}/login`;

    const badgeHtml = `<span style="display:inline-block;background-color:#eef2ff;color:#4f46e5;font-size:11px;font-weight:700;padding:4px 12px;border-radius:20px;text-transform:uppercase;letter-spacing:0.6px;border:1px solid #c7d2fe;">Advocate Onboarding</span>`;

    const professionalRows = [
      firmName
        ? `<tr>
            <td style="padding:7px 0;color:#64748b;font-size:13px;width:140px;border-bottom:1px solid #f1f5f9;">Law Firm</td>
            <td style="padding:7px 0;color:#0f172a;font-size:13px;font-weight:700;border-bottom:1px solid #f1f5f9;">${escapeHtml(firmName)}</td>
          </tr>`
        : "",
      `<tr>
        <td style="padding:7px 0;color:#64748b;font-size:13px;width:140px;border-bottom:1px solid #f1f5f9;">Chamber / Office</td>
        <td style="padding:7px 0;color:#0f172a;font-size:13px;font-weight:600;border-bottom:1px solid #f1f5f9;">${escapeHtml(officeName)}</td>
      </tr>`,
      `<tr>
        <td style="padding:7px 0;color:#64748b;font-size:13px;border-bottom:1px solid #f1f5f9;">Assigned Role</td>
        <td style="padding:7px 0;color:#0f172a;font-size:13px;font-weight:600;border-bottom:1px solid #f1f5f9;">
          <span style="display:inline-block;background:#eef2ff;color:#4f46e5;padding:2px 10px;border-radius:12px;font-size:12px;font-weight:700;">${escapeHtml(roleName)}</span>
        </td>
      </tr>`,
      designation
        ? `<tr>
            <td style="padding:7px 0;color:#64748b;font-size:13px;border-bottom:1px solid #f1f5f9;">Designation</td>
            <td style="padding:7px 0;color:#0f172a;font-size:13px;font-weight:600;border-bottom:1px solid #f1f5f9;">${escapeHtml(designation)}</td>
          </tr>`
        : "",
      enrollmentNo
        ? `<tr>
            <td style="padding:7px 0;color:#64748b;font-size:13px;border-bottom:1px solid #f1f5f9;">Enrollment No.</td>
            <td style="padding:7px 0;color:#0f172a;font-size:13px;font-weight:600;border-bottom:1px solid #f1f5f9;font-family:monospace;">${escapeHtml(enrollmentNo)}</td>
          </tr>`
        : "",
      barCouncil
        ? `<tr>
            <td style="padding:7px 0;color:#64748b;font-size:13px;border-bottom:1px solid #f1f5f9;">Bar Council</td>
            <td style="padding:7px 0;color:#0f172a;font-size:13px;font-weight:600;border-bottom:1px solid #f1f5f9;">${escapeHtml(barCouncil)}</td>
          </tr>`
        : "",
      practiceArea
        ? `<tr>
            <td style="padding:7px 0;color:#64748b;font-size:13px;">Practice Area</td>
            <td style="padding:7px 0;color:#0f172a;font-size:13px;font-weight:600;">${escapeHtml(practiceArea)}</td>
          </tr>`
        : "",
    ].join("");

    const bodyHtml = `
      <p style="margin:0 0 12px;color:#0f172a;font-size:15px;">
        Dear <strong>${escapeHtml(advocateName)}</strong>,
      </p>
      <p style="margin:0 0 24px;color:#475569;font-size:14px;line-height:1.6;">
        Your advocate account has been created under <strong>${escapeHtml(firmName || officeName)}</strong> on the <strong>MI Law Practice Management Platform</strong>. Below are your professional profile details and login credentials.
      </p>

      <!-- Chamber & Professional Profile -->
      <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#ffffff;border:1px solid #e2e8f0;border-radius:10px;margin-bottom:20px;">
        <tr>
          <td style="padding:18px 20px;">
            <p style="margin:0 0 12px;font-size:11px;font-weight:700;text-transform:uppercase;letter-spacing:0.8px;color:#64748b;">
              Chamber &amp; Bar Profile
            </p>
            <table role="presentation" width="100%" cellpadding="0" cellspacing="0">
              ${professionalRows}
            </table>
          </td>
        </tr>
      </table>

      <!-- Login Credentials Card -->
      <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#f8fafc;border:1px solid #e2e8f0;border-radius:10px;margin-bottom:24px;">
        <tr>
          <td style="padding:18px 20px;">
            <p style="margin:0 0 12px;font-size:11px;font-weight:700;text-transform:uppercase;letter-spacing:0.8px;color:#64748b;">
              Your Login Credentials
            </p>
            <table role="presentation" width="100%" cellpadding="0" cellspacing="0">
              <tr>
                <td style="padding:7px 0;color:#64748b;font-size:13px;width:140px;border-bottom:1px solid #f1f5f9;">Workspace URL</td>
                <td style="padding:7px 0;color:#0f172a;font-size:13px;font-weight:600;border-bottom:1px solid #f1f5f9;">
                  <a href="${escapeHtml(resolvedLoginUrl)}" style="color:#4f46e5;text-decoration:none;">${escapeHtml(resolvedLoginUrl)}</a>
                </td>
              </tr>
              <tr>
                <td style="padding:7px 0;color:#64748b;font-size:13px;border-bottom:1px solid #f1f5f9;">Email Address</td>
                <td style="padding:7px 0;color:#0f172a;font-size:13px;font-weight:700;border-bottom:1px solid #f1f5f9;">${escapeHtml(advocateEmail)}</td>
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
        <a href="${escapeHtml(resolvedLoginUrl)}" style="display:inline-block;background-color:#0f172a;color:#ffffff;text-decoration:none;padding:13px 32px;border-radius:8px;font-size:14px;font-weight:600;">
          Log In to Advocate Workspace &rarr;
        </a>
      </div>

      <!-- Security Warning -->
      <div style="background:#fffbeb;border-left:4px solid #f59e0b;padding:12px 16px;border-radius:6px;">
        <p style="margin:0;color:#92400e;font-size:12px;line-height:1.5;">
          <strong>Security Notice:</strong> Please change your temporary password immediately after your first login to keep chamber and client records secure.
        </p>
      </div>
    `;

    const html = buildMiLawEmailHtml({
      documentTitle: "Welcome to Your Advocate Workspace — MI Law",
      brandSubtitle: firmName || officeName,
      badgeHtml,
      heading: "Welcome to Your Advocate Workspace",
      subheading: `You have been onboarded to ${escapeHtml(officeName)}`,
      bodyHtml,
      footerReason: `Sent on behalf of ${escapeHtml(firmName || officeName)}`,
      firmName: firmName || officeName,
    });

    await transporter.sendMail({
      from: `"${firmName || officeName || config.APP_NAME || "MI Law"}" <${config.SMTP_MAIL}>`,
      to: advocateEmail,
      subject: `Welcome to ${firmName || officeName} — Your Advocate Workspace Credentials`,
      html,
      attachments: getMiLawLogoAttachments(),
    });

    return { success: true };
  } catch (error) {
    console.error("Advocate email send failed:", error);
    return { success: false };
  }
};

export default advocateEmailService;
