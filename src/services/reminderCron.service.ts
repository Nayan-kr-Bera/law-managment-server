import cron from "node-cron";
import { and, eq, lte } from "drizzle-orm";
import db from "../db/index.js";
import { customReminders, clients, cases } from "../db/schema/index.js";
import { publishToQueue, REMINDER_EMAIL_QUEUE } from "../lib/rabbitmq.js";
import { ReminderEmailJob } from "./reminderEmailWorker.service.js";

function computeNextRunDate(
  frequency: string,
  currentNextRun: Date,
  endDateStr?: string | null
): { nextRun: Date | null; isActive: boolean } {
  if (frequency === "Once") {
    return { nextRun: null, isActive: false };
  }

  const next = new Date(currentNextRun);

  if (frequency === "Daily") {
    next.setDate(next.getDate() + 1);
  } else if (frequency === "Weekly") {
    next.setDate(next.getDate() + 7);
  } else if (frequency === "Fortnightly") {
    next.setDate(next.getDate() + 14);
  } else {
    return { nextRun: null, isActive: false };
  }

  if (endDateStr) {
    const end = new Date(endDateStr);
    end.setHours(23, 59, 59, 999);
    if (next > end) {
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
      })
      .from(customReminders)
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
      // Build recipient email list
      const emailList: string[] = [];

      if (r.email) {
        const split = r.email.split(",").map((e) => e.trim()).filter(Boolean);
        emailList.push(...split);
      } else if (r.clientEmail) {
        emailList.push(r.clientEmail.trim());
      }

      const clientName =
        r.clientCompanyName ||
        [r.clientFirstName, r.clientLastName].filter(Boolean).join(" ") ||
        null;

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

        // Publish to RabbitMQ
        await publishToQueue(REMINDER_EMAIL_QUEUE, emailJob);
      } else {
        console.warn(`⚠️ Reminder ${r.id} is due but has no recipient email.`);
      }

      // Compute next run
      const currentNext = r.nextRunAt ? new Date(r.nextRunAt) : new Date();
      const { nextRun, isActive } = computeNextRunDate(
        r.frequency,
        currentNext,
        r.endDate
      );

      // Update record
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
  // Run once daily at 8:00 AM IST ('0 8 * * *')
  cron.schedule("0 8 * * *", () => {
    void processDueReminders();
  });

  console.log("📅 Scheduled Daily Reminder Cron Job (runs every day at 8:00 AM IST)");
}
