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

interface AppointmentEmailParams {
  clientName: string;
  clientEmail: string;
  appointmentDate: Date;
  purpose: string;
  mode: "in_person" | "phone" | "online";
  location?: string | null;
  caseNumber?: string | null;
  caseTitle?: string | null;
}
interface AppointmentCancellationEmailParams {
  clientName: string;
  clientEmail: string;
  appointmentDate: Date;
  purpose: string;
}
const formatAppointmentDate = (date: Date) => {
  return date.toLocaleDateString("en-IN", {
    weekday: "long",
    year: "numeric",
    month: "long",
    day: "numeric",
  });
};

const formatAppointmentTime = (date: Date) => {
  return date.toLocaleTimeString("en-IN", {
    hour: "2-digit",
    minute: "2-digit",
    hour12: true,
  });
};

const getModeLabel = (mode: AppointmentEmailParams["mode"]) => {
  switch (mode) {
    case "in_person":
      return "In-Person Appointment";

    case "phone":
      return "Phone Appointment";

    case "online":
      return "Video Appointment";

    default:
      return "Appointment";
  }
};

const getLocationLabel = (mode: AppointmentEmailParams["mode"]) => {
  switch (mode) {
    case "in_person":
      return "Location";

    case "phone":
      return "Contact Number";

    case "online":
      return "Meeting Link";

    default:
      return "Details";
  }
};

const appointmentEmailService = async ({
  clientName,
  clientEmail,
  appointmentDate,
  purpose,
  mode,
  location,
  caseNumber,
  caseTitle,
}: AppointmentEmailParams) => {
  try {
    const formattedDate = formatAppointmentDate(appointmentDate);

    const formattedTime = formatAppointmentTime(appointmentDate);

    const modeLabel = getModeLabel(mode);

    const locationLabel = getLocationLabel(mode);

    const caseSection =
      caseNumber || caseTitle
        ? `
          <tr>
            <td style="padding:0 0 12px 0;">
              <strong style="color:#333;">Case:</strong>
              <span style="color:#555;">
                ${caseNumber ?? ""}${
                  caseNumber && caseTitle ? " - " : ""
                }${caseTitle ?? ""}
              </span>
            </td>
          </tr>
        `
        : "";

    const locationSection = location
      ? `
          <tr>
            <td style="padding:0 0 12px 0;">
              <strong style="color:#333;">
                ${locationLabel}:
              </strong>

              <span style="color:#555;">
                ${location}
              </span>
            </td>
          </tr>
        `
      : "";

    const sentEmail = {
      from: config.SMTP_MAIL,
      to: clientEmail,
      subject: `Appointment Scheduled - ${formattedDate}`,
      html: `
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta
    name="viewport"
    content="width=device-width, initial-scale=1.0"
  />

  <title>Appointment Confirmation</title>
</head>

<body
  style="
    margin:0;
    padding:0;
    background:#f5f6f8;
    font-family:
      'Segoe UI',
      Tahoma,
      Geneva,
      Verdana,
      sans-serif;
    color:#333;
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

      <!-- Main Container -->
      <table
        width="600"
        cellpadding="0"
        cellspacing="0"
        border="0"
        style="
          width:100%;
          max-width:600px;
          background:#ffffff;
          border-radius:12px;
          overflow:hidden;
          box-shadow:0 4px 15px rgba(0,0,0,0.08);
        "
      >

        <!-- Header -->
        <tr>
          <td
            style="
              background:#5b2d8e;
              padding:28px 35px;
            "
          >

              <h1
                style="
                  margin:0;
                  color:#ffffff;
                  font-size:24px;
                  font-weight:600;
                  text-align:center;
                "
              >
                Law Practice System
              </h1>
              <p
                style="
                  margin:8px 0 0;
                  color:#e9ddf5;
                  font-size:14px;
                  text-align:center;
                "
              >
                Appointment Notification
              </p>

          </td>
        </tr>


        <!-- Main Content -->
        <tr>
          <td style="padding:40px 35px 20px 35px;">

            <h1
              style="
                margin:0 0 20px 0;
                font-size:25px;
                line-height:1.3;
                color:#2d2d2d;
              "
            >
              Appointment Scheduled
            </h1>

            <p
              style="
                margin:0 0 16px 0;
                font-size:15px;
                line-height:1.7;
                color:#555;
              "
            >
              Dear ${clientName},
            </p>

            <p
              style="
                margin:0 0 16px 0;
                font-size:15px;
                line-height:1.7;
                color:#555;
              "
            >
              We are pleased to inform you that your appointment
              has been successfully scheduled with our office.
              Please find the appointment details below.
            </p>


            <!-- Appointment Details -->
            <table
              width="100%"
              cellpadding="0"
              cellspacing="0"
              border="0"
              style="
                margin:25px 0;
                background:#faf9fc;
                border:1px solid #e7e2ef;
                border-radius:10px;
              "
            >

              <tr>
                <td
                  style="
                    padding:20px 20px 10px 20px;
                    font-size:17px;
                    font-weight:700;
                    color:#5b2d8e;
                  "
                >
                  ${modeLabel}
                </td>
              </tr>

              <tr>
                <td style="padding:10px 20px 20px 20px;">

                  <table
                    width="100%"
                    cellpadding="0"
                    cellspacing="0"
                    border="0"
                    style="
                      font-size:14px;
                      line-height:1.6;
                    "
                  >

                    <tr>
                      <td style="padding:0 0 12px 0;">
                        <strong style="color:#333;">
                          Date:
                        </strong>

                        <span style="color:#555;">
                          ${formattedDate}
                        </span>
                      </td>
                    </tr>

                    <tr>
                      <td style="padding:0 0 12px 0;">
                        <strong style="color:#333;">
                          Time:
                        </strong>

                        <span style="color:#555;">
                          ${formattedTime}
                        </span>
                      </td>
                    </tr>

                    <tr>
                      <td style="padding:0 0 12px 0;">
                        <strong style="color:#333;">
                          Purpose:
                        </strong>

                        <span style="color:#555;">
                          ${purpose}
                        </span>
                      </td>
                    </tr>

                    ${caseSection}

                    ${locationSection}

                    <tr>
                      <td style="padding:0;">
                        <strong style="color:#333;">
                          Appointment Type:
                        </strong>

                        <span style="color:#555;">
                          ${modeLabel}
                        </span>
                      </td>
                    </tr>

                  </table>

                </td>
              </tr>

            </table>


            <p
              style="
                margin:0 0 16px 0;
                font-size:15px;
                line-height:1.7;
                color:#555;
              "
            >
              We kindly request that you make the necessary
              arrangements to attend the appointment at the
              scheduled date and time.
            </p>

            <p
              style="
                margin:0 0 16px 0;
                font-size:15px;
                line-height:1.7;
                color:#555;
              "
            >
              If you are unable to attend or need to make any
              changes to the appointment, please contact our
              office in advance.
            </p>

            <p
              style="
                margin:25px 0 0 0;
                font-size:15px;
                line-height:1.7;
                color:#555;
              "
            >
              We look forward to assisting you.
            </p>

            <p
              style="
                margin:20px 0 0 0;
                font-size:15px;
                line-height:1.7;
                color:#333;
              "
            >
              Regards,<br />

              <strong>
                MDE ERP
              </strong>

            </p>

          </td>
        </tr>


        <!-- Divider -->
        <tr>
          <td style="padding:10px 35px 0 35px;">
            <div
              style="
                height:1px;
                background:#e5e5e5;
              "
            ></div>
          </td>
        </tr>


        <!-- Footer -->
        <tr>
          <td
            align="center"
            style="
              padding:25px 35px 30px 35px;
            "
          >

            <p
              style="
                margin:0 0 12px 0;
                font-size:12px;
                line-height:1.6;
                color:#888;
              "
            >
              This is an automated appointment notification.
              Please do not reply to this email.
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

    const info = await transporter.sendMail(sentEmail);

    console.log("Appointment email sent:", info.messageId);

    return {
      success: true,
      message: "Appointment email sent successfully",
    };
  } catch (error) {
    console.error("Appointment email failed:", error);

    return {
      success: false,
      message: "Failed to send appointment email",
    };
  }
};
export const appointmentCancellationEmailService = async ({
  clientName,
  clientEmail,
  appointmentDate,
  purpose,
}: AppointmentCancellationEmailParams) => {
  try {
    const formattedDate = formatAppointmentDate(appointmentDate);
    const formattedTime = formatAppointmentTime(appointmentDate);

    const sentEmail = {
      from: config.SMTP_MAIL,
      to: clientEmail,
      subject: `Appointment Cancelled - ${formattedDate}`,
      html: `
<!DOCTYPE html>
<html lang="en">

<head>
  <meta charset="UTF-8" />
  <meta
    name="viewport"
    content="width=device-width, initial-scale=1.0"
  />
  <title>Appointment Cancelled</title>
</head>

<body
  style="
    margin:0;
    padding:0;
    background:#f5f6f8;
    font-family:'Segoe UI', Tahoma, Geneva, Verdana, sans-serif;
    color:#333;
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
            border-radius:12px;
            overflow:hidden;
            box-shadow:0 4px 15px rgba(0,0,0,0.08);
          "
        >

          <!-- Header -->
          <tr>
            <td
              style="
                background:#5b2d8e;
                padding:28px 35px;
              "
            >
              <table
                width="100%"
                cellpadding="0"
                cellspacing="0"
                border="0"
              >
                <tr>
                </tr>
              </table>
              <h1
                style="
                  margin:0;
                  color:#ffffff;
                  font-size:24px;
                  font-weight:600;
                  text-align:center;
                "
              >
                Law Practice System
              </h1>
              <p
                style="
                  margin:8px 0 0;
                  color:#e9ddf5;
                  font-size:14px;
                  text-align:center;
                "
              >
                Appointment Notification
              </p>
            </td>
          </tr>

          <!-- Content -->
          <tr>
            <td style="padding:40px 35px 20px 35px;">

              <h1
                style="
                  margin:0 0 20px 0;
                  font-size:25px;
                  color:#2d2d2d;
                "
              >
                Appointment Cancelled
              </h1>

              <p
                style="
                  margin:0 0 16px 0;
                  font-size:15px;
                  line-height:1.7;
                  color:#555;
                "
              >
                Dear ${clientName},
              </p>

              <p
                style="
                  margin:0 0 16px 0;
                  font-size:15px;
                  line-height:1.7;
                  color:#555;
                "
              >
                We would like to inform you that your appointment
                has been cancelled.
              </p>

              <!-- Appointment Details -->
              <table
                width="100%"
                cellpadding="0"
                cellspacing="0"
                border="0"
                style="
                  margin:25px 0;
                  background:#faf9fc;
                  border:1px solid #e7e2ef;
                  border-radius:10px;
                "
              >
                <tr>
                  <td
                    style="
                      padding:20px 20px 10px 20px;
                      font-size:17px;
                      font-weight:700;
                      color:#5b2d8e;
                    "
                  >
                    Cancelled Appointment
                  </td>
                </tr>

                <tr>
                  <td style="padding:10px 20px 20px 20px;">

                    <table
                      width="100%"
                      cellpadding="0"
                      cellspacing="0"
                      border="0"
                      style="
                        font-size:14px;
                        line-height:1.6;
                      "
                    >

                      <tr>
                        <td style="padding:0 0 12px 0;">
                          <strong style="color:#333;">
                            Date:
                          </strong>

                          <span style="color:#555;">
                            ${formattedDate}
                          </span>
                        </td>
                      </tr>

                      <tr>
                        <td style="padding:0 0 12px 0;">
                          <strong style="color:#333;">
                            Time:
                          </strong>

                          <span style="color:#555;">
                            ${formattedTime}
                          </span>
                        </td>
                      </tr>

                      <tr>
                        <td style="padding:0;">
                          <strong style="color:#333;">
                            Purpose:
                          </strong>

                          <span style="color:#555;">
                            ${purpose}
                          </span>
                        </td>
                      </tr>

                    </table>

                  </td>
                </tr>
              </table>

              <p
                style="
                  margin:0 0 16px 0;
                  font-size:15px;
                  line-height:1.7;
                  color:#555;
                "
              >
                If you need to schedule a new appointment,
                please contact our office.
              </p>

              <p
                style="
                  margin:25px 0 0 0;
                  font-size:15px;
                  line-height:1.7;
                  color:#555;
                "
              >
                Regards,<br />
                <strong>Law Practice System Team</strong>
              </p>

            </td>
          </tr>

          <!-- Divider -->
          <tr>
            <td style="padding:10px 35px 0 35px;">
              <div
                style="
                  height:1px;
                  background:#e5e5e5;
                "
              ></div>
            </td>
          </tr>

          <!-- Footer -->
          <tr>
            <td
              align="center"
              style="padding:25px 35px 30px 35px;"
            >

              <p
                style="
                  margin:0 0 12px 0;
                  font-size:12px;
                  line-height:1.6;
                  color:#888;
                "
              >
                This is an automated appointment notification.
                Please do not reply to this email.
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

    const info = await transporter.sendMail(sentEmail);

    console.log("Appointment cancellation email sent:", info.messageId);

    return {
      success: true,
      message: "Appointment cancellation email sent successfully",
    };
  } catch (error) {
    console.error("Appointment cancellation email failed:", error);

    return {
      success: false,
      message: "Failed to send appointment cancellation email",
    };
  }
};
export default appointmentEmailService;
