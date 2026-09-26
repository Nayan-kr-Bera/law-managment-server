import cron from "node-cron";
import { and, eq, inArray, sql } from "drizzle-orm";
import db from "../db/index.js";
import { tasks, cases, user, notifications } from "../db/schema/index.js";
import { sendTaskDeadlineReminderEmail } from "./taskEmail.service.js";
import { createNotification } from "./notification.service.js";

/**
 * Task Deadline Reminder Service
 * Checks tasks due tomorrow and alerts both Assignee and Creator
 */
export async function processTaskDeadlineReminders(): Promise<void> {
  console.log("⏰ [TaskReminderCron] Checking tasks due tomorrow...");

  try {
    const tomorrow = new Date();
    tomorrow.setDate(tomorrow.getDate() + 1);
    const tomorrowIso = tomorrow.toISOString().split("T")[0];

    // Find all active tasks due tomorrow
    const dueTasks = await db
      .select({
        id: tasks.id,
        tenantId: tasks.tenantId,
        officeId: tasks.officeId,
        title: tasks.title,
        dueDate: tasks.dueDate,
        priority: tasks.priority,
        status: tasks.status,
        caseId: tasks.caseId,
        assignedTo: tasks.assignedTo,
        createdBy: tasks.createdBy,
        caseTitle: cases.title,
        caseNumber: cases.caseNumber,
      })
      .from(tasks)
      .leftJoin(cases, eq(tasks.caseId, cases.id))
      .where(
        and(
          inArray(tasks.status, ["todo", "in_progress"]),
          eq(tasks.dueDate, tomorrowIso)
        )
      );

    if (dueTasks.length === 0) {
      console.log("⏰ [TaskReminderCron] No tasks due tomorrow.");
      return;
    }

    console.log(`⏰ [TaskReminderCron] Found ${dueTasks.length} task(s) due tomorrow.`);

    for (const task of dueTasks) {
      // Fetch Assignee User Details
      let assigneeData: { id: string; name: string; email: string } | null = null;
      if (task.assignedTo) {
        const [aUser] = await db
          .select({ id: user.id, name: user.name, email: user.email })
          .from(user)
          .where(eq(user.id, task.assignedTo))
          .limit(1);
        if (aUser) assigneeData = aUser;
      }

      // Fetch Creator User Details
      let creatorData: { id: string; name: string; email: string } | null = null;
      if (task.createdBy) {
        const [cUser] = await db
          .select({ id: user.id, name: user.name, email: user.email })
          .from(user)
          .where(eq(user.id, task.createdBy))
          .limit(1);
        if (cUser) creatorData = cUser;
      }

      // 1. Notify Assignee
      if (assigneeData) {
        // Send In-App Notification
        await createNotification({
          tenantId: task.tenantId || "",
          officeId: task.officeId || null,
          userId: assigneeData.id,
          title: `Deadline Tomorrow: ${task.title}`,
          body: `Your assigned task "${task.title}" is due tomorrow (${task.dueDate}). Priority: ${task.priority.toUpperCase()}`,
          type: "task",
        });

        // Send Email Reminder
        await sendTaskDeadlineReminderEmail({
          recipientName: assigneeData.name || "Advocate",
          recipientEmail: assigneeData.email,
          recipientRole: "Assignee",
          taskTitle: task.title,
          dueDate: task.dueDate!,
          priority: task.priority,
          assigneeName: assigneeData.name,
          creatorName: creatorData?.name,
          caseTitle: task.caseTitle,
          caseNumber: task.caseNumber,
        });
      }

      // 2. Notify Creator (if different from assignee)
      if (creatorData && creatorData.id !== assigneeData?.id) {
        // Send In-App Notification
        await createNotification({
          tenantId: task.tenantId || "",
          officeId: task.officeId || null,
          userId: creatorData.id,
          title: `Task Deadline Tomorrow: ${task.title}`,
          body: `The task "${task.title}" created by you (assigned to ${assigneeData?.name || "unassigned"}) is due tomorrow.`,
          type: "task",
        });

        // Send Email Reminder
        await sendTaskDeadlineReminderEmail({
          recipientName: creatorData.name || "Colleague",
          recipientEmail: creatorData.email,
          recipientRole: "Creator",
          taskTitle: task.title,
          dueDate: task.dueDate!,
          priority: task.priority,
          assigneeName: assigneeData?.name,
          creatorName: creatorData.name,
          caseTitle: task.caseTitle,
          caseNumber: task.caseNumber,
        });
      }
    }
  } catch (error) {
    console.error("[TaskReminderCron] Error processing task deadline reminders:", error);
  }
}

/**
 * Start the Task Reminder Cron Job
 * Runs every day at 08:30 AM server time
 */
export function startTaskReminderCron(): void {
  // Run daily at 08:30 AM
  cron.schedule("30 8 * * *", () => {
    processTaskDeadlineReminders();
  });
  console.log("⏰ Task Deadline Reminder Cron registered (08:30 AM Daily).");
}
