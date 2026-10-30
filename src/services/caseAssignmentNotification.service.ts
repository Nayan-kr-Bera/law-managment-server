import nodemailer from "nodemailer";
import { and, eq, inArray } from "drizzle-orm";
import db from "../db/index.js";
import {
  advocates,
  cases,
  clients,
} from "../db/schema/index.js";
import { config } from "../config/index.js";
import {
  createClientNotification,
  createNotification,
} from "./notification.service.js";
import { sendClientCaseNotificationEmail } from "./clientNotificationEmail.service.js";
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

export interface AdvocateEmailPayload {
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
 * Sends a modern MI Law HTML email to an advocate when assigned, unassigned, or reassigned to a case matter.
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
  firmName = "MI Law Chamber",
  action,
  transferredToOrFromName,
}: AdvocateEmailPayload) => {
  try {
    const isReassigned = action === "reassigned";
    const isUnassigned = action === "unassigned";

    const badgeStyle = isUnassigned
      ? "background-color:#fef2f2;color:#dc2626;border:1px solid #fecaca;"
      : isReassigned
        ? "background-color:#fffbeb;color:#d97706;border:1px solid #fde68a;"
        : "background-color:#eef2ff;color:#4f46e5;border:1px solid #c7d2fe;";

    const badgeLabel = isUnassigned
      ? "Case Unassigned"
      : isReassigned
        ? "Case Reassigned to You"
        : "New Case Assigned";

    const heading = isUnassigned
      ? "Removed from Case Roster"
      : isReassigned
        ? "Case File Reassigned to You"
        : "New Case Assigned to Your Roster";

    const subjectPrefix = isUnassigned
      ? "Notice: Case Matter Unassigned"
      : isReassigned
        ? "Case Matter Reassigned"
        : "New Case Assigned";

    const actionDescription = isUnassigned
      ? `Please be advised that you have been unassigned from the case matter below${
          transferredToOrFromName
            ? ` (transferred to <strong>${escapeHtml(transferredToOrFromName)}</strong>)`
            : ""
        }.`
      : isReassigned
        ? `The legal matter below has been reassigned to your active roster${
            transferredToOrFromName
              ? ` from <strong>${escapeHtml(transferredToOrFromName)}</strong>`
              : ""
          }.`
        : `You have been officially assigned as legal counsel to the following case matter by <strong>${escapeHtml(firmName)}</strong>.`;

    const emailSubject = `${subjectPrefix}: ${caseNumber || caseTitle}`;
    const portalUrl =
      config.ORIGIN_CLIENT || config.ORIGIN_FRONTEND || "http://localhost:5173";

    const formattedHearing = nextHearingDate
      ? new Date(nextHearingDate).toLocaleDateString("en-IN", {
          day: "2-digit",
          month: "short",
          year: "numeric",
        })
      : "Not yet scheduled";

    const badgeHtml = `<span style="display:inline-block;${badgeStyle}font-size:11px;font-weight:700;padding:4px 12px;border-radius:20px;text-transform:uppercase;letter-spacing:0.6px;">${badgeLabel}</span>`;

    const bodyHtml = `
      <p style="margin:0 0 12px;color:#0f172a;font-size:15px;">
        Dear Adv. <strong>${escapeHtml(advocateName)}</strong>,
      </p>
      <p style="margin:0 0 24px;color:#475569;font-size:14px;line-height:1.6;">
        ${actionDescription}
      </p>

      <!-- Case Dossier Card -->
      <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#f8fafc;border:1px solid #e2e8f0;border-radius:10px;margin-bottom:24px;">
        <tr>
          <td style="padding:18px 20px;">
            <p style="margin:0 0 12px;font-size:11px;font-weight:700;text-transform:uppercase;letter-spacing:0.8px;color:#64748b;">
              Case Dossier Summary
            </p>
            <table role="presentation" width="100%" cellpadding="0" cellspacing="0">
              <tr>
                <td style="padding:7px 0;color:#64748b;font-size:13px;width:140px;border-bottom:1px solid #f1f5f9;">Case Title</td>
                <td style="padding:7px 0;color:#0f172a;font-size:14px;font-weight:700;border-bottom:1px solid #f1f5f9;">${escapeHtml(caseTitle)}</td>
              </tr>
              ${
                caseNumber
                  ? `<tr>
                      <td style="padding:7px 0;color:#64748b;font-size:13px;border-bottom:1px solid #f1f5f9;">Case Number</td>
                      <td style="padding:7px 0;color:#0f172a;font-size:13px;font-weight:700;font-family:monospace;border-bottom:1px solid #f1f5f9;">${escapeHtml(caseNumber)}</td>
                    </tr>`
                  : ""
              }
              <tr>
                <td style="padding:7px 0;color:#64748b;font-size:13px;border-bottom:1px solid #f1f5f9;">Court / Forum</td>
                <td style="padding:7px 0;color:#0f172a;font-size:13px;font-weight:600;border-bottom:1px solid #f1f5f9;">
                  ${escapeHtml(courtName || "Court of Record")}${courtNumber ? ` (Court No. ${escapeHtml(courtNumber)})` : ""}
                </td>
              </tr>
              ${
                parties
                  ? `<tr>
                      <td style="padding:7px 0;color:#64748b;font-size:13px;border-bottom:1px solid #f1f5f9;">Parties</td>
                      <td style="padding:7px 0;color:#0f172a;font-size:13px;font-weight:600;border-bottom:1px solid #f1f5f9;">${escapeHtml(parties)}</td>
                    </tr>`
                  : ""
              }
              <tr>
                <td style="padding:7px 0;color:#64748b;font-size:13px;">Next Hearing Date</td>
                <td style="padding:7px 0;color:#4f46e5;font-size:13px;font-weight:700;">${escapeHtml(formattedHearing)}</td>
              </tr>
            </table>
          </td>
        </tr>
      </table>

      ${
        !isUnassigned
          ? `<div style="text-align:center;margin:28px 0 12px;">
              <a href="${escapeHtml(portalUrl.replace(/\/$/, ""))}/cases" style="display:inline-block;background-color:#0f172a;color:#ffffff;text-decoration:none;padding:13px 32px;border-radius:8px;font-size:14px;font-weight:600;">
                Open Case in Dashboard &rarr;
              </a>
            </div>`
          : ""
      }

      <p style="margin:18px 0 0;font-size:12px;line-height:1.6;color:#64748b;text-align:center;">
        Please coordinate with your chamber partner or managing clerk for any docket files or instructions.
      </p>
    `;

    const html = buildMiLawEmailHtml({
      documentTitle: emailSubject,
      brandSubtitle: firmName,
      badgeHtml,
      heading,
      subheading: `${escapeHtml(caseNumber || "Matter")} — ${escapeHtml(caseTitle)}`,
      bodyHtml,
      footerReason: `Automated Case Roster Notification from ${escapeHtml(firmName)}`,
      firmName,
    });

    const info = await transporter.sendMail({
      from: `"${firmName || config.APP_NAME || "MI Law"}" <${config.SMTP_MAIL || process.env.SMTP_MAIL}>`,
      to: advocateEmail,
      subject: emailSubject,
      html,
      attachments: getMiLawLogoAttachments(),
    });

    console.log(
      `✅ [SMTP] Advocate case notification email sent to ${advocateEmail}. MessageId: ${info.messageId}`,
    );
    return { success: true };
  } catch (error) {
    console.error(
      `❌ [SMTP] Advocate case notification email failed for ${advocateEmail}:`,
      error,
    );
    return { success: false, error };
  }
};

export const sendAdvocateCaseAssignmentEmail = sendAdvocateCaseEmail;

/**
 * 1. Notify Advocates when assigned to a newly created case
 */
export const notifyAdvocatesOnCaseCreation = async (
  caseId: string,
  tenantId: string,
  advocateIds: string[],
) => {
  try {
    if (!advocateIds || advocateIds.length === 0) return;

    const caseRecord = await db.query.cases.findFirst({
      where: and(eq(cases.id, caseId), eq(cases.tenantId, tenantId)),
      with: {
        court: true,
        tenant: true,
      },
    });

    if (!caseRecord) return;

    const firmName = caseRecord.tenant?.name || "MI Law Chamber";
    const parties = [caseRecord.firstParty, caseRecord.oppositeParty]
      .filter(Boolean)
      .join(" vs ");

    for (const advId of advocateIds) {
      const adv = await db.query.advocates.findFirst({
        where: eq(advocates.id, advId),
        with: {
          user: true,
        },
      });

      if (!adv?.user) continue;

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
  clientIds: string[],
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

    const firmName = caseRecord.tenant?.name || "MI Law Chamber";

    for (const cid of clientIds) {
      const client = await db.query.clients.findFirst({
        where: eq(clients.id, cid),
      });

      if (!client) continue;

      const clientDisplayName =
        client.companyName ||
        `${client.firstName} ${client.lastName || ""}`.trim() ||
        "Client";

      const caseUrl = `/cases/${caseRecord.id}`;
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
        link: caseUrl,
        actionUrl: caseUrl,
        payload: {
          caseId: caseRecord.id,
          caseTitle: caseRecord.title,
          caseNumber: caseRecord.caseNumber,
          court: caseRecord.court?.name,
          nextHearingDate: caseRecord.nextHearingDate,
          link: caseUrl,
          actionUrl: caseUrl,
          actionLabel: "View Matter",
        },
      });

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
  caseIds: string[],
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
      const firmName = c.tenant?.name || "MI Law Chamber";
      const parties = [c.firstParty, c.oppositeParty].filter(Boolean).join(" vs ");

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
  caseIds: string[],
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
      const firmName = c.tenant?.name || "MI Law Chamber";
      const parties = [c.firstParty, c.oppositeParty].filter(Boolean).join(" vs ");

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
  caseIds: string[],
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
      const firmName = c.tenant?.name || "MI Law Chamber";
      const parties = [c.firstParty, c.oppositeParty].filter(Boolean).join(" vs ");

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
  tenantId: string,
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
  tenantId: string,
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

    const firmName = caseRecord.tenant?.name || "MI Law Chamber";
    const clientDisplayName =
      client.companyName ||
      `${client.firstName} ${client.lastName || ""}`.trim() ||
      "Client";

    await createClientNotification({
      tenantId,
      officeId: caseRecord.officeId,
      caseId: caseRecord.id,
      clientId: client.id,
      channel: "portal",
      recipient: client.email || "",
      title: `Notice: Matter Unlinked`,
      message: `Your profile has been unlinked from matter "${caseRecord.title}".`,
      link: "/cases",
      actionUrl: "/cases",
      payload: {
        type: "case_unlinked",
        caseId: caseRecord.id,
        caseTitle: caseRecord.title,
        unlinked: true,
        link: "/cases",
        actionUrl: "/cases",
        actionLabel: "View Cases",
      },
    });

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
