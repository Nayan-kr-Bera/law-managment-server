import cron from "node-cron";
import { and, gte, lte, eq, inArray } from "drizzle-orm";
import db from "../db/index.js";
import {
  hearings,
  cases,
  caseAdvocates,
  caseClients,
  advocates,
  clients,
  user,
} from "../db/schema/index.js";
import { publishToQueue, REMINDER_EMAIL_QUEUE } from "../lib/rabbitmq.js";
import { generateGoogleCalendarUrl } from "../utils/calendarUtils.js";

export interface HearingReminderEmailJob {
  reminderId: string;
  tenantId: string;
  officeId: string;
  recipients: string[];
  reminderText: string;
  frequency: string;
  clientName?: string | null;
  caseNo?: string | null;
  stage?: string | null;
  courtNo?: string | null;
  hearingDate?: string | null;
  daysRemaining?: number;
  googleCalendarUrl?: string;
  isHearingReminder?: boolean;
}

export async function processUpcomingHearingReminders(): Promise<void> {
  console.log("⏰ Running 5-day advance Case Hearing reminder cron check...");

  try {
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    const fiveDaysOut = new Date(today);
    fiveDaysOut.setDate(fiveDaysOut.getDate() + 5);
    fiveDaysOut.setHours(23, 59, 59, 999);

    const todayStr = today.toISOString().split("T")[0];
    const fiveDaysOutStr = fiveDaysOut.toISOString().split("T")[0];

    // Select hearings happening in the next 5 days
    const upcomingHearings = await db
      .select({
        hearingId: hearings.id,
        hearingDate: hearings.hearingDate,
        stage: hearings.stage,
        courtNo: hearings.courtNo,
        remarks: hearings.remarks,
        caseId: hearings.caseId,
        caseNumber: cases.caseNumber,
        title: cases.title,
        tenantId: cases.tenantId,
        officeId: cases.officeId,
      })
      .from(hearings)
      .innerJoin(cases, eq(hearings.caseId, cases.id))
      .where(
        and(
          gte(hearings.hearingDate, todayStr),
          lte(hearings.hearingDate, fiveDaysOutStr)
        )
      );

    if (upcomingHearings.length === 0) {
      console.log("⏰ No upcoming case hearings found in the next 5 days.");
      return;
    }

    console.log(`⏰ Found ${upcomingHearings.length} hearing(s) scheduled in the next 5 days.`);

    for (const h of upcomingHearings) {
      if (!h.caseId || !h.hearingDate) continue;

      const hearingDateObj = new Date(h.hearingDate);
      hearingDateObj.setHours(0, 0, 0, 0);

      const diffTime = hearingDateObj.getTime() - today.getTime();
      const daysRemaining = Math.max(0, Math.ceil(diffTime / (1000 * 60 * 60 * 24)));

      // 1. Fetch advocate emails linked to the case
      const advocateRecords = await db
        .select({
          email: user.email,
        })
        .from(caseAdvocates)
        .innerJoin(advocates, eq(caseAdvocates.advocateId, advocates.id))
        .innerJoin(user, eq(advocates.userId, user.id))
        .where(eq(caseAdvocates.caseId, h.caseId));

      // 2. Fetch client emails linked to the case
      const clientRecords = await db
        .select({
          email: clients.email,
          firstName: clients.firstName,
          lastName: clients.lastName,
          companyName: clients.companyName,
        })
        .from(caseClients)
        .innerJoin(clients, eq(caseClients.clientId, clients.id))
        .where(eq(caseClients.caseId, h.caseId));

      const recipientsSet = new Set<string>();

      advocateRecords.forEach((a) => {
        if (a.email && a.email.trim()) recipientsSet.add(a.email.trim());
      });

      let primaryClientName = "";
      clientRecords.forEach((c) => {
        if (c.email && c.email.trim()) recipientsSet.add(c.email.trim());
        if (!primaryClientName) {
          primaryClientName =
            c.companyName || [c.firstName, c.lastName].filter(Boolean).join(" ");
        }
      });

      const recipients = Array.from(recipientsSet);

      if (recipients.length === 0) {
        console.warn(`⚠️ Hearing ${h.hearingId} (Case #${h.caseNumber}) has no linked advocate/client emails.`);
        continue;
      }

      const caseTitle = h.caseNumber ? `Case #${h.caseNumber}` : h.title || "Upcoming Case";
      const hearingTitle = `Hearing: ${caseTitle}${h.stage ? ` (${h.stage})` : ""}`;
      const description = `Case: ${caseTitle}\nStage: ${h.stage || "Scheduled Hearing"}\nCourt/Room: ${
        h.courtNo || "N/A"
      }\nDate: ${h.hearingDate}\nRemarks: ${h.remarks || "None"}`;

      // Generate Google Calendar 1-Click URL
      const googleCalendarUrl = generateGoogleCalendarUrl({
        title: hearingTitle,
        description,
        location: h.courtNo || undefined,
        startDate: h.hearingDate,
        guestEmails: recipients,
      });

      const reminderText = `Hearing scheduled on ${h.hearingDate} (${
        daysRemaining === 0 ? "TODAY" : daysRemaining === 1 ? "Tomorrow" : `In ${daysRemaining} days`
      }) for ${caseTitle}. Stage: ${h.stage || "Hearing"}. Court: ${h.courtNo || "N/A"}`;

      const emailJob: HearingReminderEmailJob = {
        reminderId: h.hearingId,
        tenantId: h.tenantId || "",
        officeId: h.officeId || "",
        recipients,
        reminderText,
        frequency: "Daily Advance Reminder",
        clientName: primaryClientName || null,
        caseNo: h.caseNumber || null,
        stage: h.stage || null,
        courtNo: h.courtNo || null,
        hearingDate: h.hearingDate,
        daysRemaining,
        googleCalendarUrl,
        isHearingReminder: true,
      };

      // Publish job to RabbitMQ queue
      await publishToQueue(REMINDER_EMAIL_QUEUE, emailJob);
      console.log(`✉️ Queued 5-day advance hearing reminder for ${recipients.length} recipient(s) [Case #${h.caseNumber}]`);
    }
  } catch (error) {
    console.error("Error processing upcoming hearing reminders in cron:", error);
  }
}

export function startHearingReminderCron(): void {
  // Run daily at 8:00 AM IST ('0 8 * * *')
  cron.schedule("0 8 * * *", () => {
    void processUpcomingHearingReminders();
  });

  console.log("📅 Scheduled 5-Day Advance Case Hearing Reminder Cron Job (runs daily at 8:00 AM IST)");
}
