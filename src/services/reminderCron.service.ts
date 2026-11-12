import cron from "node-cron";
import { and, eq, lte } from "drizzle-orm";
import db from "../db/index.js";
import { customReminders, clients, cases, user } from "../db/schema/index.js";
import { publishToQueue, REMINDER_EMAIL_QUEUE } from "../lib/rabbitmq.js";
import { ReminderEmailJob } from "./reminderEmailWorker.service.js";
import { createNotification, createClientNotification } from "./notification.service.js";

function computeNextRunDate(
  frequency: string,
  currentNextRun: Date,
  endDateStr?: string | null
): { nextRun: Date | null; isActive: boolean } {
  const freq = (frequency || "").toLowerCase();
  if (freq === "once") {
    return { nextRun: null, isActive: false };
  }

  const next = new Date(currentNextRun);
  if (isNaN(next.getTime())) {
    return { nextRun: null, isActive: false };
  }

  if (freq === "daily") {
    next.setDate(next.getDate() + 1);
  } else if (freq === "weekly") {
    next.setDate(next.getDate() + 7);
  } else if (freq === "fortnightly" || freq === "14 days") {
    next.setDate(next.getDate() + 14);
  } else {
    return { nextRun: null, isActive: false };
  }

  if (endDateStr) {
    const end = new Date(endDateStr);
    end.setHours(23, 59, 59, 999);
    if (!isNaN(end.getTime()) && next > end) {
      return { nextRun: null, isActive: false };
    }
  }

  return { nextRun: next, isActive: true };
}

export async function processDueReminders(): Promise<void> {
  console.log("⏰ Running daily reminder cron check...");

  try {
    const now = new Date();

    const dueReminders = await db
      .select({
        id: customReminders.id,
        tenantId: customReminders.tenantId,
        officeId: customReminders.officeId,
        createdBy: customReminders.createdBy,
        reminder: customReminders.reminder,
        frequency: customReminders.frequency,
        startDate: customReminders.startDate,
        endDate: customReminders.endDate,
        email: customReminders.email,
        clientId: customReminders.clientId,
        caseId: customReminders.caseId,
        nextRunAt: customReminders.nextRunAt,
        clientFirstName: clients.firstName,
        clientLastName: clients.lastName,
        clientCompanyName: clients.companyName,
        clientEmail: clients.email,
        caseNumber: cases.caseNumber,
        creatorName: user.name,
        creatorEmail: user.email,
      })
      .from(customReminders)
      .leftJoin(user, eq(customReminders.createdBy, user.id))
      .leftJoin(clients, eq(customReminders.clientId, clients.id))
      .leftJoin(cases, eq(customReminders.caseId, cases.id))
      .where(
        and(
          eq(customReminders.isActive, true),
          lte(customReminders.nextRunAt, now)
        )
      );

    if (dueReminders.length === 0) {
      console.log("⏰ No due reminders found today.");
      return;
    }

    console.log(`⏰ Found ${dueReminders.length} due reminder(s) to process.`);

    for (const r of dueReminders) {
      const emailList: string[] = [];

      // 1. Client & custom emails
      if (r.email) {
        const split = r.email.split(",").map((e) => e.trim()).filter(Boolean);
        emailList.push(...split);
      } else if (r.clientEmail) {
        emailList.push(r.clientEmail.trim());
      }

      // 2. Two-way dispatch: Creator (Lawyer / Chamber staff) also receives reminder email
      if (r.creatorEmail) {
        const cleanCreator = r.creatorEmail.trim().toLowerCase();
        if (!emailList.some((e) => e.toLowerCase() === cleanCreator)) {
          emailList.push(r.creatorEmail.trim());
        }
      }

      const personName = [r.clientFirstName, r.clientLastName].filter(Boolean).join(" ").trim();
      const clientName = personName || r.clientCompanyName || null;

      // 3. In-App Notification for Creator (Lawyer / Advocate)
      if (r.tenantId && r.createdBy) {
        try {
          await createNotification({
            tenantId: r.tenantId,
            officeId: r.officeId,
            userId: r.createdBy,
            title: `Reminder Alert: ${r.reminder.slice(0, 50)}`,
            body: r.caseNumber ? `[Case ${r.caseNumber}] ${r.reminder}` : r.reminder,
            type: "reminder",
          });
        } catch (err) {
          console.error(`Failed to send in-app notification to creator ${r.createdBy}:`, err);
        }
      }

      // 4. In-App / Portal Notification for Linked Client
      if (r.clientId) {
        try {
          await createClientNotification({
            tenantId: r.tenantId,
            officeId: r.officeId,
            caseId: r.caseId,
            clientId: r.clientId,
            title: `Chamber Reminder`,
            message: r.reminder,
          });
        } catch (err) {
          console.error(`Failed to send client notification to ${r.clientId}:`, err);
        }
      }

      if (emailList.length > 0) {
        const emailJob: ReminderEmailJob = {
          reminderId: r.id,
          tenantId: r.tenantId || "",
          officeId: r.officeId || "",
          recipients: emailList,
          reminderText: r.reminder,
          frequency: r.frequency,
          clientName,
          caseNo: r.caseNumber || null,
        };

        await publishToQueue(REMINDER_EMAIL_QUEUE, emailJob);
      } else {
        console.warn(`⚠️ Reminder ${r.id} is due but has no recipient email.`);
      }

      const currentNext = r.nextRunAt ? new Date(r.nextRunAt) : new Date();
      const { nextRun, isActive } = computeNextRunDate(
        r.frequency,
        currentNext,
        r.endDate
      );

      await db
        .update(customReminders)
        .set({
          lastSentAt: now,
          nextRunAt: nextRun,
          isActive,
        })
        .where(eq(customReminders.id, r.id));
    }
  } catch (error) {
    console.error("Error processing due reminders in cron:", error);
  }
}

export function startReminderCron(): void {
  cron.schedule("0 8 * * *", () => {
    void processDueReminders();
  });

  console.log("📅 Scheduled Daily Reminder Cron Job (runs every day at 8:00 AM IST)");
}
