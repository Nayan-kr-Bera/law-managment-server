import nodemailer from "nodemailer";
import { and, eq, inArray } from "drizzle-orm";
import db from "../db/index.js";
import {
  advocates,
  cases,
  clients,
  courts,
  tenants,
} from "../db/schema/index.js";
import users from "../db/schema/users.js";
import { config } from "../config/index.js";
import {
  createClientNotification,
  createNotification,
} from "./notification.service.js";
import { sendClientCaseNotificationEmail } from "./clientNotificationEmail.service.js";

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

interface AdvocateEmailPayload {
  advocateName: string;
  advocateEmail: string;
  caseTitle: string;
  caseNumber?: string | null;
  courtName?: string | null;
  courtNumber?: string | null;
  parties?: string | null;
  nextHearingDate?: string | Date | null;
  firmName?: string;
  action: "assigned" | "unassigned" | "reassigned";
  transferredToOrFromName?: string;
}

/**
 * Sends a high-polish HTML email to an advocate when assigned, unassigned, or reassigned to a case matter.
 */
export const sendAdvocateCaseEmail = async ({
  advocateName,
  advocateEmail,
  caseTitle,
  caseNumber,
  courtName,
  courtNumber,
  parties,
  nextHearingDate,
  firmName = "Law Practice System",
  action,
  transferredToOrFromName,
}: AdvocateEmailPayload) => {
  try {
    const isAssigned = action === "assigned";
    const isReassigned = action === "reassigned";
    const isUnassigned = action === "unassigned";

    let subjectPrefix = "New Case Assigned";
    let headerTag = "Case Matter Assignment";
    let accentColor = "#2563eb"; // blue
    let actionDescription = `You have been officially assigned as legal counsel to the following case matter by ${firmName}.`;

    if (isReassigned) {
      subjectPrefix = "Case Matter Reassigned";
      headerTag = "Case Matter Transfer";
      accentColor = "#7c3aed"; // purple
      actionDescription = `The legal matter below has been reassigned to you${
        transferredToOrFromName ? ` from ${transferredToOrFromName}` : ""
      }.`;
    } else if (isUnassigned) {
      subjectPrefix = "Notice: Case Matter Unassigned";
      headerTag = "Matter Assignment Update";
      accentColor = "#dc2626"; // red
      actionDescription = `Please be advised that you have been unassigned from the case matter below${
        transferredToOrFromName ? ` (transferred to ${transferredToOrFromName})` : ""
      }.`;
    }

    const emailSubject = `${subjectPrefix}: ${caseNumber || caseTitle}`;
    const portalUrl = config.ORIGIN_CLIENT || "http://localhost:5173";

    const formattedHearing = nextHearingDate
      ? new Date(nextHearingDate).toLocaleDateString("en-IN", {
          day: "2-digit",
          month: "short",
          year: "numeric",
        })
      : "Not yet scheduled";

    const mailOptions = {
      from: config.SMTP_MAIL || process.env.SMTP_MAIL,
      to: advocateEmail,
      subject: emailSubject,
      html: `
<!DOCTYPE html>
<html>
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>${emailSubject}</title>
</head>
<body style="margin: 0; padding: 0; background: #f8fafc; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; color: #1e293b;">
  <table width="100%" cellpadding="0" cellspacing="0" border="0" style="background: #f8fafc; padding: 32px 16px;">
    <tr>
      <td align="center">
        <table width="100%" cellpadding="0" cellspacing="0" border="0" style="max-width: 600px; background: #ffffff; border-radius: 16px; overflow: hidden; border: 1px solid #e2e8f0; box-shadow: 0 4px 6px -1px rgba(0, 0, 0, 0.05);">
          
          <!-- Header Banner -->
          <tr>
            <td style="background: linear-gradient(135deg, #0f172a 0%, #1e293b 100%); padding: 30px 36px; text-align: left; border-bottom: 4px solid ${accentColor};">
              <p style="margin: 0 0 6px; color: #94a3b8; font-size: 11px; font-weight: 700; text-transform: uppercase; letter-spacing: 0.08em;">${headerTag}</p>
              <h1 style="margin: 0; color: #ffffff; font-size: 20px; font-weight: 700;">${firmName}</h1>
            </td>
          </tr>

          <!-- Main Content -->
          <tr>
            <td style="padding: 32px 36px;">
              <p style="margin: 0 0 16px; font-size: 15px; color: #334155;">
                Dear <strong>${advocateName}</strong>,
              </p>
              
              <p style="margin: 0 0 24px; font-size: 14px; line-height: 1.6; color: #475569;">
                ${actionDescription}
              </p>

              <!-- Matter Details Card -->
              <table width="100%" cellpadding="0" cellspacing="0" border="0" style="background: #f8fafc; border: 1px solid #e2e8f0; border-radius: 12px; margin-bottom: 26px; overflow: hidden;">
                <tr>
                  <td colspan="2" style="background: #f1f5f9; padding: 12px 18px; border-bottom: 1px solid #e2e8f0;">
                    <p style="margin: 0; font-size: 11px; font-weight: 700; text-transform: uppercase; letter-spacing: 0.06em; color: #475569;">Matter Details</p>
                  </td>
                </tr>
                <tr>
                  <td width="35%" style="padding: 10px 18px; font-size: 13px; color: #64748b; border-bottom: 1px solid #e2e8f0;">Case Title:</td>
                  <td style="padding: 10px 18px; font-size: 13px; font-weight: 600; color: #0f172a; border-bottom: 1px solid #e2e8f0;">
                    ${caseTitle}
                  </td>
                </tr>
                ${
                  caseNumber
                    ? `
                <tr>
                  <td style="padding: 10px 18px; font-size: 13px; color: #64748b; border-bottom: 1px solid #e2e8f0;">Case Number:</td>
                  <td style="padding: 10px 18px; font-size: 13px; font-weight: 600; color: #0f172a; border-bottom: 1px solid #e2e8f0;">${caseNumber}</td>
                </tr>`
                    : ""
                }
                <tr>
                  <td style="padding: 10px 18px; font-size: 13px; color: #64748b; border-bottom: 1px solid #e2e8f0;">Court:</td>
                  <td style="padding: 10px 18px; font-size: 13px; font-weight: 600; color: #0f172a; border-bottom: 1px solid #e2e8f0;">
                    ${courtName || "Court of Record"}${courtNumber ? ` (Court No. ${courtNumber})` : ""}
                  </td>
                </tr>
                ${
                  parties
                    ? `
                <tr>
                  <td style="padding: 10px 18px; font-size: 13px; color: #64748b; border-bottom: 1px solid #e2e8f0;">Parties:</td>
                  <td style="padding: 10px 18px; font-size: 13px; font-weight: 600; color: #0f172a; border-bottom: 1px solid #e2e8f0;">${parties}</td>
                </tr>`
                    : ""
                }
                <tr>
                  <td style="padding: 10px 18px; font-size: 13px; color: #64748b;">Next Hearing Date:</td>
                  <td style="padding: 10px 18px; font-size: 13px; font-weight: 700; color: ${accentColor};">
                    ${formattedHearing}
                  </td>
                </tr>
              </table>

              ${
                !isUnassigned
                  ? `
              <!-- CTA Button -->
              <div style="text-align: center; margin: 30px 0 15px;">
                <a href="${portalUrl}/cases" style="display: inline-block; background: ${accentColor}; color: #ffffff; text-decoration: none; padding: 12px 28px; border-radius: 8px; font-size: 13px; font-weight: 600; box-shadow: 0 2px 4px rgba(0, 0, 0, 0.1);">
                  Open Case in Dashboard &rarr;
                </a>
              </div>`
                  : ""
              }

              <p style="margin: 22px 0 0; font-size: 12px; line-height: 1.6; color: #64748b; text-align: center;">
                Please coordinate with your chamber partner or managing clerk for any docket files or instructions.
              </p>
            </td>
          </tr>

          <!-- Footer -->
          <tr>
            <td style="padding: 20px 36px; background: #f8fafc; border-top: 1px solid #e2e8f0; text-align: center;">
              <p style="margin: 0; font-size: 11px; color: #94a3b8;">
                This notice was automatically dispatched by ${firmName}. Confidential & Legal Privileged.
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
    console.log(
      `✅ [SMTP] Advocate case notification email sent to ${advocateEmail}. MessageId: ${info.messageId}`
    );
    return { success: true };
  } catch (error) {
    console.error(
      `❌ [SMTP] Advocate case notification email failed for ${advocateEmail}:`,
      error
    );
    return { success: false, error };
  }
};

/**
 * 1. Notify Advocates when assigned to a newly created case
 */
export const notifyAdvocatesOnCaseCreation = async (
  caseId: string,
  tenantId: string,
  advocateIds: string[]
) => {
  try {
    if (!advocateIds || advocateIds.length === 0) return;

    // Fetch case info
    const caseRecord = await db.query.cases.findFirst({
      where: and(eq(cases.id, caseId), eq(cases.tenantId, tenantId)),
      with: {
        court: true,
        tenant: true,
      },
    });

    if (!caseRecord) return;

    const firmName = caseRecord.tenant?.name || "Law Chamber";
    const parties = [caseRecord.firstParty, caseRecord.oppositeParty]
      .filter(Boolean)
      .join(" vs ");

    // Fetch advocates and their underlying users
    for (const advId of advocateIds) {
      const adv = await db.query.advocates.findFirst({
        where: eq(advocates.id, advId),
        with: {
          user: true,
        },
      });

      if (!adv?.user) continue;

      // 1. In-app notification
      await createNotification({
        tenantId,
        officeId: caseRecord.officeId,
        userId: adv.user.id,
        title: `New Case Assigned: ${caseRecord.title}`,
        body: `You have been assigned to case "${caseRecord.title}" (${
          caseRecord.caseNumber || "No Case No."
        }) at ${caseRecord.court?.name || "Court"}.`,
        type: "case",
      });

      // 2. Email alert
      if (adv.user.email) {
        await sendAdvocateCaseEmail({
          advocateName: adv.user.name,
          advocateEmail: adv.user.email,
          caseTitle: caseRecord.title,
          caseNumber: caseRecord.caseNumber,
          courtName: caseRecord.court?.name,
          courtNumber: caseRecord.courtNumber,
          parties,
          nextHearingDate: caseRecord.nextHearingDate,
          firmName,
          action: "assigned",
        });
      }
    }
  } catch (error) {
    console.error("Failed to notify advocates on case creation:", error);
  }
};

/**
 * 2. Notify Clients when assigned to a newly created case
 */
export const notifyClientsOnCaseCreation = async (
  caseId: string,
  tenantId: string,
  clientIds: string[]
) => {
  try {
    if (!clientIds || clientIds.length === 0) return;

    const caseRecord = await db.query.cases.findFirst({
      where: and(eq(cases.id, caseId), eq(cases.tenantId, tenantId)),
      with: {
        court: true,
        tenant: true,
      },
    });

    if (!caseRecord) return;

    const firmName = caseRecord.tenant?.name || "Law Chamber";

    for (const cid of clientIds) {
      const client = await db.query.clients.findFirst({
        where: eq(clients.id, cid),
      });

      if (!client) continue;

      const clientDisplayName =
        client.companyName ||
        `${client.firstName} ${client.lastName || ""}`.trim() ||
        "Client";

      // 1. Client Portal notification queue
      await createClientNotification({
        tenantId,
        officeId: caseRecord.officeId,
        caseId: caseRecord.id,
        clientId: client.id,
        channel: "portal",
        recipient: client.email || "",
        title: `Matter Registered: ${caseRecord.title}`,
        message: `Your legal matter "${caseRecord.title}" (${
          caseRecord.caseNumber || "Registration In Progress"
        }) has been registered with our chamber.`,
        payload: {
          caseId: caseRecord.id,
          caseTitle: caseRecord.title,
          caseNumber: caseRecord.caseNumber,
          court: caseRecord.court?.name,
          nextHearingDate: caseRecord.nextHearingDate,
        },
      });

      // 2. Email alert
      if (client.email) {
        await sendClientCaseNotificationEmail({
          clientName: clientDisplayName,
          clientEmail: client.email,
          caseTitle: caseRecord.title,
          caseNumber: caseRecord.caseNumber || undefined,
          cnrNumber: caseRecord.cnrNumber || undefined,
          court: caseRecord.court?.name || undefined,
          courtNo: caseRecord.courtNumber || undefined,
          firstParty: caseRecord.firstParty || undefined,
          oppositeParty: caseRecord.oppositeParty || undefined,
          nextHearingDate: caseRecord.nextHearingDate,
          subject: `Matter Registered — ${caseRecord.caseNumber || caseRecord.title}`,
          customMessage: `Your legal matter has been successfully registered in our practice. You can track progress and cause list updates via your client portal.`,
          firmName,
        });
      }
    }
  } catch (error) {
    console.error("Failed to notify clients on case creation:", error);
  }
};

/**
 * 3. Notify an Advocate when existing cases are assigned to them (from Advocate assign modal)
 */
export const notifyAdvocateCasesAssigned = async (
  advocateId: string,
  tenantId: string,
  caseIds: string[]
) => {
  try {
    if (!caseIds || caseIds.length === 0) return;

    const adv = await db.query.advocates.findFirst({
      where: eq(advocates.id, advocateId),
      with: { user: true },
    });

    if (!adv?.user) return;

    const caseList = await db.query.cases.findMany({
      where: and(inArray(cases.id, caseIds), eq(cases.tenantId, tenantId)),
      with: { court: true, tenant: true },
    });

    for (const c of caseList) {
      const firmName = c.tenant?.name || "Law Chamber";
      const parties = [c.firstParty, c.oppositeParty].filter(Boolean).join(" vs ");

      // In-app notification
      await createNotification({
        tenantId,
        officeId: c.officeId,
        userId: adv.user.id,
        title: `Case Assigned: ${c.title}`,
        body: `You have been assigned to case "${c.title}" (${
          c.caseNumber || "No Case No."
        }) at ${c.court?.name || "Court"}.`,
        type: "case",
      });

      // Email alert
      if (adv.user.email) {
        await sendAdvocateCaseEmail({
          advocateName: adv.user.name,
          advocateEmail: adv.user.email,
          caseTitle: c.title,
          caseNumber: c.caseNumber,
          courtName: c.court?.name,
          courtNumber: c.courtNumber,
          parties,
          nextHearingDate: c.nextHearingDate,
          firmName,
          action: "assigned",
        });
      }
    }
  } catch (error) {
    console.error("Failed to notify advocate on case assignment:", error);
  }
};

/**
 * 4. Notify an Advocate when cases are revoked/unassigned from them
 */
export const notifyAdvocateCasesRevoked = async (
  advocateId: string,
  tenantId: string,
  caseIds: string[]
) => {
  try {
    if (!caseIds || caseIds.length === 0) return;

    const adv = await db.query.advocates.findFirst({
      where: eq(advocates.id, advocateId),
      with: { user: true },
    });

    if (!adv?.user) return;

    const caseList = await db.query.cases.findMany({
      where: and(inArray(cases.id, caseIds), eq(cases.tenantId, tenantId)),
      with: { court: true, tenant: true },
    });

    for (const c of caseList) {
      const firmName = c.tenant?.name || "Law Chamber";
      const parties = [c.firstParty, c.oppositeParty].filter(Boolean).join(" vs ");

      // In-app notification
      await createNotification({
        tenantId,
        officeId: c.officeId,
        userId: adv.user.id,
        title: `Case Unassigned: ${c.title}`,
        body: `You have been unassigned from case "${c.title}" (${
          c.caseNumber || "No Case No."
        }).`,
        type: "case",
      });

      // Email alert
      if (adv.user.email) {
        await sendAdvocateCaseEmail({
          advocateName: adv.user.name,
          advocateEmail: adv.user.email,
          caseTitle: c.title,
          caseNumber: c.caseNumber,
          courtName: c.court?.name,
          courtNumber: c.courtNumber,
          parties,
          nextHearingDate: c.nextHearingDate,
          firmName,
          action: "unassigned",
        });
      }
    }
  } catch (error) {
    console.error("Failed to notify advocate on case revocation:", error);
  }
};

/**
 * 5. Notify Advocates when cases are reassigned from Advocate A to Advocate B
 */
export const notifyCasesReassigned = async (
  fromAdvocateId: string,
  toAdvocateId: string,
  tenantId: string,
  caseIds: string[]
) => {
  try {
    if (!caseIds || caseIds.length === 0) return;

    const [fromAdv, toAdv] = await Promise.all([
      db.query.advocates.findFirst({
        where: eq(advocates.id, fromAdvocateId),
        with: { user: true },
      }),
      db.query.advocates.findFirst({
        where: eq(advocates.id, toAdvocateId),
        with: { user: true },
      }),
    ]);

    const caseList = await db.query.cases.findMany({
      where: and(inArray(cases.id, caseIds), eq(cases.tenantId, tenantId)),
      with: { court: true, tenant: true },
    });

    const toAdvName = toAdv?.user?.name || "another counsel";
    const fromAdvName = fromAdv?.user?.name || "previous counsel";

    for (const c of caseList) {
      const firmName = c.tenant?.name || "Law Chamber";
      const parties = [c.firstParty, c.oppositeParty].filter(Boolean).join(" vs ");

      // Alert the previous advocate (unassigned)
      if (fromAdv?.user) {
        await createNotification({
          tenantId,
          officeId: c.officeId,
          userId: fromAdv.user.id,
          title: `Case Transferred: ${c.title}`,
          body: `Case "${c.title}" has been transferred to ${toAdvName}.`,
          type: "case",
        });

        if (fromAdv.user.email) {
          await sendAdvocateCaseEmail({
            advocateName: fromAdv.user.name,
            advocateEmail: fromAdv.user.email,
            caseTitle: c.title,
            caseNumber: c.caseNumber,
            courtName: c.court?.name,
            courtNumber: c.courtNumber,
            parties,
            nextHearingDate: c.nextHearingDate,
            firmName,
            action: "unassigned",
            transferredToOrFromName: toAdvName,
          });
        }
      }

      // Alert the new advocate (reassigned to them)
      if (toAdv?.user) {
        await createNotification({
          tenantId,
          officeId: c.officeId,
          userId: toAdv.user.id,
          title: `Case Reassigned to You: ${c.title}`,
          body: `Case "${c.title}" has been reassigned to you from ${fromAdvName}.`,
          type: "case",
        });

        if (toAdv.user.email) {
          await sendAdvocateCaseEmail({
            advocateName: toAdv.user.name,
            advocateEmail: toAdv.user.email,
            caseTitle: c.title,
            caseNumber: c.caseNumber,
            courtName: c.court?.name,
            courtNumber: c.courtNumber,
            parties,
            nextHearingDate: c.nextHearingDate,
            firmName,
            action: "reassigned",
            transferredToOrFromName: fromAdvName,
          });
        }
      }
    }
  } catch (error) {
    console.error("Failed to notify advocates on case reassignment:", error);
  }
};

/**
 * 6. Notify Client when added to an existing case
 */
export const notifyClientAddedToCase = async (
  caseId: string,
  clientId: string,
  tenantId: string
) => {
  try {
    await notifyClientsOnCaseCreation(caseId, tenantId, [clientId]);
  } catch (error) {
    console.error("Failed to notify client added to case:", error);
  }
};

/**
 * 7. Notify Client when removed/unlinked from a case
 */
export const notifyClientRemovedFromCase = async (
  caseId: string,
  clientId: string,
  tenantId: string
) => {
  try {
    const [caseRecord, client] = await Promise.all([
      db.query.cases.findFirst({
        where: and(eq(cases.id, caseId), eq(cases.tenantId, tenantId)),
        with: { tenant: true },
      }),
      db.query.clients.findFirst({
        where: eq(clients.id, clientId),
      }),
    ]);

    if (!caseRecord || !client) return;

    const firmName = caseRecord.tenant?.name || "Law Chamber";
    const clientDisplayName =
      client.companyName ||
      `${client.firstName} ${client.lastName || ""}`.trim() ||
      "Client";

    // Portal notification
    await createClientNotification({
      tenantId,
      officeId: caseRecord.officeId,
      caseId: caseRecord.id,
      clientId: client.id,
      channel: "portal",
      recipient: client.email || "",
      title: `Notice: Matter Unlinked`,
      message: `Your profile has been unlinked from matter "${caseRecord.title}".`,
      payload: {
        caseId: caseRecord.id,
        caseTitle: caseRecord.title,
      },
    });

    // Email
    if (client.email) {
      await sendClientCaseNotificationEmail({
        clientName: clientDisplayName,
        clientEmail: client.email,
        caseTitle: caseRecord.title,
        caseNumber: caseRecord.caseNumber || undefined,
        subject: `Notice: Matter Association Updated — ${caseRecord.title}`,
        customMessage: `Please note that your client account has been unlinked from the matter "${caseRecord.title}". For any questions, please contact our chamber.`,
        firmName,
      });
    }
  } catch (error) {
    console.error("Failed to notify client removed from case:", error);
  }
};
