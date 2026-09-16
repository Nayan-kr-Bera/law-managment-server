import { eq } from 'drizzle-orm';
import nodemailer from 'nodemailer';
import { config } from '../config/index.js';
import db from '../db/index.js';
import emailOtp from '../db/schema/emailOtp.js';
import generateRandomDigit from '../utils/generateRamdomDigit.js';


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
  console.log(`📧 [SMTP] Checking connection -> Host: ${host}, Port: ${port}, Secure: ${isSecure}, User: ${user || "(not set)"}`);
  try {
    await transporter.verify();
    console.log("✅ [SMTP] Connection verified! Server is ready to send emails.");
    return true;
  } catch (e: unknown) {
    console.error("❌ [SMTP] Connection verification failed:", e instanceof Error ? e.message : e);
    return false;
  }
}
verifySMTP();

const emailOtpService = async ({ id, email }: { id: string; email: string }) => {
  try {
    // generate otp
    const createOTP = generateRandomDigit(100000, 900000);

    // sent mail
    const sentEmail = {
      from: config.SMTP_MAIL,
      to: email,
      subject: 'Your Verification Code – Law Practice System',
      html: `
<!DOCTYPE html>
<html>
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>Law Practice System – Verification Code</title>
</head>
<body
  style="
    margin:0;
    padding:0;
    background:#f5f6f8;
    font-family:Arial,Helvetica,sans-serif;
    color:#333333;
  "
>
  <table width="100%" cellpadding="0" cellspacing="0" border="0" style="background:#f5f6f8;">
    <tr>
      <td align="center" style="padding:40px 15px;">

        <table
          width="600"
          cellpadding="0"
          cellspacing="0"
          border="0"
          style="
            width:100%;
            max-width:600px;
            background:#ffffff;
            border-radius:10px;
            overflow:hidden;
            border:1px solid #e5e7eb;
          "
        >

          <!-- HEADER -->
          <tr>
            <td
              style="
                background:#5b2d8e;
                padding:28px 35px;
                text-align:center;
              "
            >
              <h1
                style="
                  margin:0;
                  color:#ffffff;
                  font-size:24px;
                  font-weight:600;
                "
              >
                Law Practice System
              </h1>

              <p
                style="
                  margin:8px 0 0;
                  color:#e9ddf5;
                  font-size:14px;
                "
              >
                Email Verification
              </p>
            </td>
          </tr>

          <!-- CONTENT -->
          <tr>
            <td style="padding:35px;">

              <h2
                style="
                  margin:0 0 20px;
                  color:#222222;
                  font-size:22px;
                "
              >
                Your Verification Code
              </h2>

              <p
                style="
                  margin:0 0 20px;
                  font-size:15px;
                  line-height:1.7;
                  color:#555555;
                "
              >
                Use the one-time code below to verify your identity.
                This code is valid for <strong>15 minutes</strong>.
              </p>

              <!-- OTP Box -->
              <table
                width="100%"
                cellpadding="0"
                cellspacing="0"
                border="0"
                style="margin:25px 0;"
              >
                <tr>
                  <td align="center">
                    <div
                      style="
                        display:inline-block;
                        background:#f8f6fb;
                        border:1px solid #e4d8ef;
                        border-radius:8px;
                        padding:22px 40px;
                        font-size:36px;
                        font-weight:700;
                        letter-spacing:8px;
                        color:#5b2d8e;
                        font-family:'Courier New', Courier, monospace;
                      "
                    >
                      ${createOTP}
                    </div>
                  </td>
                </tr>
              </table>

              <!-- Security Notice -->
              <table
                width="100%"
                cellpadding="0"
                cellspacing="0"
                border="0"
                style="
                  background:#fff8e6;
                  border-left:4px solid #e5a100;
                  margin:25px 0;
                "
              >
                <tr>
                  <td style="padding:14px 16px;">
                    <p
                      style="
                        margin:0;
                        font-size:13px;
                        line-height:1.6;
                        color:#6b5200;
                      "
                    >
                      <strong>Security Notice:</strong>
                      Never share this code with anyone.
                      Our team will never ask you for your verification code
                      by email or phone.
                    </p>
                  </td>
                </tr>
              </table>

              <p
                style="
                  margin:25px 0 0;
                  font-size:14px;
                  line-height:1.7;
                  color:#555555;
                "
              >
                If you did not request this code, you can safely ignore this email.
              </p>

              <p
                style="
                  margin:20px 0 0;
                  font-size:14px;
                  line-height:1.7;
                  color:#333333;
                "
              >
                Regards,<br />
                <strong>Law Practice System Team</strong>
              </p>

            </td>
          </tr>

          <!-- FOOTER -->
          <tr>
            <td
              style="
                padding:22px 35px;
                background:#f8f8f8;
                border-top:1px solid #eeeeee;
                text-align:center;
              "
            >
              <p
                style="
                  margin:0 0 8px;
                  font-size:12px;
                  color:#888888;
                "
              >
                This is an automated email. Please do not reply directly to this email.
              </p>

              <p
                style="
                  margin:0;
                  font-size:12px;
                  color:#aaaaaa;
                "
              >
                © ${new Date().getFullYear()} Law Practice System.
                All rights reserved.
              </p>
            </td>
          </tr>

        </table>

      </td>
    </tr>
  </table>
</body>
</html>`,
    };

    try {
      await db.delete(emailOtp).where(eq(emailOtp.userId, id));

      await db
        .insert(emailOtp)
        .values({
          userId: id,
          otp: createOTP.toString(),
          generatedAt: Date.now().toString(),
          expiresAt: (Date.now() + 600000).toString(),
        })
        .returning();
    } catch (err: unknown) {
      console.log(err);
      console.error('DB Insert OTP Error:', err);
      return { success: false, message: 'Error sending OTP' };
    }

    try {
      console.log(`📨 [SMTP] Sending OTP verification email to: ${email}...`);
      const info = await transporter.sendMail(sentEmail);
      console.log(`✅ [SMTP] OTP email sent successfully to ${email}. Response: ${info.response}`);
    } catch (emailError: unknown) {
      console.error(`❌ [SMTP] Failed to send email to ${email}:`, emailError instanceof Error ? emailError.message : emailError);
      return { success: false, message: 'SMTP failed to send email.' };
    }
    return { success: true, message: 'OTP sent successfully' };
  } catch (err: unknown) {
    console.error('Email Send Error:', err);
    return { success: false, message: 'Error sending OTP' };
  }
};

export default emailOtpService;
