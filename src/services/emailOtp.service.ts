import { eq } from "drizzle-orm";
import nodemailer from "nodemailer";
import { config } from "../config/index.js";
import db from "../db/index.js";
import emailOtp from "../db/schema/emailOtp.js";
import generateRandomDigit from "../utils/generateRamdomDigit.js";
import {
  buildMiLawEmailHtml,
  escapeHtml,
  getMiLawLogoAttachments,
} from "./emailBrandLayout.js";

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

export async function verifySMTP() {
  const host = process.env.SMTP_HOST || "mail.smtp2go.com";
  const user = process.env.SMTP_USER || process.env.SMTP_MAIL;
  console.log(
    `📧 [SMTP] Checking connection -> Host: ${host}, Port: ${port}, Secure: ${isSecure}, User: ${user || "(not set)"}`,
  );
  try {
    await transporter.verify();
    console.log("✅ [SMTP] Connection verified! Server is ready to send emails.");
    return true;
  } catch (e: unknown) {
    console.error(
      "❌ [SMTP] Connection verification failed:",
      e instanceof Error ? e.message : e,
    );
    return false;
  }
}
verifySMTP();

export interface EmailOtpParams {
  id: string;
  email: string;
  userName?: string;
  purpose?: string;
}

const OTP_VALIDITY_MINUTES = 15;
const OTP_VALIDITY_MS = OTP_VALIDITY_MINUTES * 60 * 1000;

export const emailOtpService = async ({
  id,
  email,
  userName,
  purpose,
}: EmailOtpParams) => {
  try {
    const createOTP = generateRandomDigit(100000, 900000);

    const badgeHtml = `<span style="display:inline-block;background-color:#eef2ff;color:#4f46e5;font-size:11px;font-weight:700;padding:4px 12px;border-radius:20px;text-transform:uppercase;letter-spacing:0.6px;border:1px solid #c7d2fe;">Security Verification</span>`;

    const bodyHtml = `
      <p style="margin:0 0 12px;color:#0f172a;font-size:15px;">
        Hello${userName ? ` <strong>${escapeHtml(userName)}</strong>` : ""},
      </p>
      <p style="margin:0 0 24px;color:#475569;font-size:14px;line-height:1.6;">
        Use the One-Time Verification Code (OTP) below to complete your ${escapeHtml(purpose || "account verification or sign-in request")} on <strong>MI Law</strong> for <strong>${escapeHtml(email)}</strong>:
      </p>

      <!-- OTP Display Box -->
      <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#f8fafc;border:2px dashed #cbd5e1;border-radius:12px;margin-bottom:24px;">
        <tr>
          <td align="center" style="padding:28px 20px;">
            <div style="font-size:11px;font-weight:700;text-transform:uppercase;letter-spacing:1.2px;color:#64748b;margin-bottom:10px;">
              One-Time Verification Code
            </div>
            <div style="font-size:36px;font-weight:800;letter-spacing:10px;color:#0f172a;font-family:'Courier New',monospace;background:#ffffff;display:inline-block;padding:12px 28px;border-radius:8px;border:1px solid #e2e8f0;">
              ${escapeHtml(String(createOTP))}
            </div>
            <div style="margin-top:12px;font-size:12px;color:#4f46e5;font-weight:600;">
              ⏱ Valid for ${OTP_VALIDITY_MINUTES} minutes
            </div>
          </td>
        </tr>
      </table>

      <!-- Security Warning -->
      <div style="background:#fffbeb;border-left:4px solid #f59e0b;padding:12px 16px;border-radius:6px;">
        <p style="margin:0;color:#92400e;font-size:12px;line-height:1.5;">
          <strong>Security Alert:</strong> Never share this verification code with anyone. MI Law team members will never ask you for your OTP via phone or email. If you did not request this code, you can safely ignore this message.
        </p>
      </div>
    `;

    const html = buildMiLawEmailHtml({
      documentTitle: `${createOTP} is your MI Law verification code`,
      brandSubtitle: "Identity & Security Verification",
      badgeHtml,
      heading: "Verify Your Email Address",
      subheading: `Enter this 6-digit code to verify ${escapeHtml(email)}`,
      bodyHtml,
      footerReason: "Automated Security Verification from MI Law",
    });

    const sentEmail = {
      from: `"${config.APP_NAME || "MI Law Security"}" <${config.SMTP_MAIL}>`,
      to: email,
      subject: `${createOTP} is your MI Law verification code`,
      html,
      attachments: getMiLawLogoAttachments(),
    };

    try {
      await db.delete(emailOtp).where(eq(emailOtp.userId, id));

      await db
        .insert(emailOtp)
        .values({
          userId: id,
          otp: createOTP.toString(),
          generatedAt: Date.now().toString(),
          expiresAt: (Date.now() + OTP_VALIDITY_MS).toString(),
        })
        .returning();
    } catch (err: unknown) {
      console.error("DB Insert OTP Error:", err);
      return { success: false, message: "Error sending OTP" };
    }

    try {
      console.log(`📨 [SMTP] Sending OTP verification email to: ${email}...`);
      const info = await transporter.sendMail(sentEmail);
      console.log(
        `✅ [SMTP] OTP email sent successfully to ${email}. Response: ${info.response}`,
      );
    } catch (emailError: unknown) {
      console.error(
        `❌ [SMTP] Failed to send email to ${email}:`,
        emailError instanceof Error ? emailError.message : emailError,
      );
      return { success: false, message: "SMTP failed to send email." };
    }
    return { success: true, message: "OTP sent successfully" };
  } catch (err: unknown) {
    console.error("Email Send Error:", err);
    return { success: false, message: "Error sending OTP" };
  }
};

export default emailOtpService;
