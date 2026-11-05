import cron from "node-cron";
import { and, eq, inArray, sql } from "drizzle-orm";
import db from "../db/index.js";
import { tasks, cases, user, notifications } from "../db/schema/index.js";
import { sendTaskDeadlineReminderEmail } from "./taskEmail.service.js";
import { createNotification } from "./notification.service.js";

export async function processTaskDeadlineReminders(): Promise<void> {
  console.log("⏰ [TaskReminderCron] Checking tasks due tomorrow...");

  try {
    const tomorrow = new Date();
    tomorrow.setDate(tomorrow.getDate() + 1);
    const tomorrowIso = tomorrow.toISOString().split("T")[0];

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
      let assigneeData: { id: string; name: string; email: string } | null = null;
      if (task.assignedTo) {
        const [aUser] = await db
          .select({ id: user.id, name: user.name, email: user.email })
          .from(user)
          .where(eq(user.id, task.assignedTo))
          .limit(1);
        if (aUser) assigneeData = aUser;
      }

      let creatorData: { id: string; name: string; email: string } | null = null;
      if (task.createdBy) {
        const [cUser] = await db
          .select({ id: user.id, name: user.name, email: user.email })
          .from(user)
          .where(eq(user.id, task.createdBy))
          .limit(1);
        if (cUser) creatorData = cUser;
      }

      if (assigneeData) {
        await createNotification({
          tenantId: task.tenantId || "",
          officeId: task.officeId || null,
          userId: assigneeData.id,
          title: `Deadline Tomorrow: ${task.title}`,
          body: `Your assigned task "${task.title}" is due tomorrow (${task.dueDate}). Priority: ${task.priority.toUpperCase()}`,
          type: "task",
        });

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

      if (creatorData && creatorData.id !== assigneeData?.id) {
        await createNotification({
          tenantId: task.tenantId || "",
          officeId: task.officeId || null,
          userId: creatorData.id,
          title: `Task Deadline Tomorrow: ${task.title}`,
          body: `The task "${task.title}" created by you (assigned to ${assigneeData?.name || "unassigned"}) is due tomorrow.`,
          type: "task",
        });

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

export function startTaskReminderCron(): void {
  cron.schedule("30 8 * * *", () => {
    processTaskDeadlineReminders();
  });
  console.log("⏰ Task Deadline Reminder Cron registered (08:30 AM Daily).");
}
