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

interface ClientWelcomeEmailParams {
  clientName: string;
  clientEmail: string;
  password: string;
}

const clientEmailService = async ({
  clientName,
  clientEmail,
  password,
}: ClientWelcomeEmailParams) => {
  try {
    const loginUrl = "https://your-law-practice-system.com/client/login";

    const mail = {
      from: config.SMTP_MAIL,
      to: clientEmail,
      subject: "Welcome to Law Practice System - Your Client Account",
      html: `
<!DOCTYPE html>
<html>
<head>
  <meta charset="UTF-8" />
  <meta
    name="viewport"
    content="width=device-width, initial-scale=1.0"
  />
  <title>Welcome to Law Practice System</title>
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
  <table
    width="100%"
    cellpadding="0"
    cellspacing="0"
    border="0"
    style="background:#f5f6f8;"
  >
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
                Client Portal
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
                Welcome, ${clientName}!
              </h2>

              <p
                style="
                  margin:0 0 16px;
                  font-size:15px;
                  line-height:1.7;
                  color:#555555;
                "
              >
                Thank you for joining our Law Practice System.
                We are pleased to have you with us.
              </p>

              <p
                style="
                  margin:0 0 20px;
                  font-size:15px;
                  line-height:1.7;
                  color:#555555;
                "
              >
                An online client account has been created for you.
                You can use this account to access your client portal
                and view information related to your legal matters.
              </p>

              <!-- LOGIN DETAILS -->
              <table
                width="100%"
                cellpadding="0"
                cellspacing="0"
                border="0"
                style="
                  background:#f8f6fb;
                  border:1px solid #e4d8ef;
                  border-radius:8px;
                  margin:25px 0;
                "
              >
                <tr>
                  <td style="padding:22px;">

                    <h3
                      style="
                        margin:0 0 18px;
                        color:#5b2d8e;
                        font-size:16px;
                      "
                    >
                      Your Login Details
                    </h3>

                    <p
                      style="
                        margin:8px 0;
                        font-size:14px;
                        color:#555555;
                      "
                    >
                      <strong>Email:</strong>
                      ${clientEmail}
                    </p>

                    <p
                      style="
                        margin:8px 0;
                        font-size:14px;
                        color:#555555;
                      "
                    >
                      <strong>Temporary Password:</strong>
                      ${password}
                    </p>

                  </td>
                </tr>
              </table>

              <!-- LOGIN BUTTON -->
              <div style="text-align:center;margin:30px 0;">

                <a
                  href="${loginUrl}"
                  style="
                    display:inline-block;
                    background:#5b2d8e;
                    color:#ffffff;
                    text-decoration:none;
                    padding:13px 28px;
                    border-radius:6px;
                    font-size:14px;
                    font-weight:600;
                  "
                >
                  Login to Client Portal
                </a>

              </div>

              <p
                style="
                  margin:0 0 18px;
                  font-size:14px;
                  line-height:1.7;
                  color:#555555;
                "
              >
                For your security, please log in using the credentials
                provided above and <strong>change your password immediately
                after your first login</strong>.
              </p>

              <!-- SECURITY NOTICE -->
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
                      Please do not share your password with anyone.
                      Our team will never ask you to provide your password
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
                If you did not expect this account or believe this email
                was sent to you by mistake, please contact our support team.
              </p>

              <p
                style="
                  margin:25px 0 0;
                  font-size:14px;
                  line-height:1.7;
                  color:#555555;
                "
              >
                We look forward to assisting you.
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
                This is an automated email. Please do not reply directly
                to this email.
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
</html>
`,
    };

    console.log(`📨 [SMTP] Sending client welcome email to: ${clientEmail}...`);
    const info = await transporter.sendMail(mail);
    console.log(`✅ [SMTP] Client welcome email sent to ${clientEmail}. Response:`, info.response);

    return {
      success: true,
      message: "Client welcome email sent successfully",
    };
  } catch (error: any) {
    console.error(`❌ [SMTP] Client welcome email error for ${clientEmail}:`, error?.message || error);

    return {
      success: false,
      message: "Failed to send client welcome email",
    };
  }
};

export default clientEmailService;