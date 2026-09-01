
import { eq } from "drizzle-orm";
import db from "../index.js";
import systemAlerts from "../schema/systemAlerts.js";

const systemAlertsSeed = [
  {
    title: "Case Documents",
    message:
      "Case Documents can now be uploaded by clicking on the More button against each case from the Cases page.",
    link: "/cases",
    type: "info",
    isActive: true,
  },
  {
    title: "E-Courts Case Updates",
    message:
      "Next Hearing Date, Court No., Court and Fixed For will be fetched from E-Courts and automatically updated for cases. This is done on a best-effort basis and may fail.",
    link: null,
    type: "info",
    isActive: true,
  },
  {
    title: "Development Version",
    message:
      "You are currently using the Version 1 development/testing release of the Law Management System. Some features may still be under development.",
    link: null,
    type: "warning",
    isActive: true,
  },
  {
    title: "Task Management",
    message:
      "Tasks can now be assigned to advocates and tracked using task status, priority and due dates.",
    link: "/tasks",
    type: "success",
    isActive: true,
  },
];

export default async function seedSystemAlerts() {
  console.log("🌱 Seeding system alerts...");

  for (const alert of systemAlertsSeed) {
    const existingAlert = await db.query.systemAlerts.findFirst({
      where: eq(systemAlerts.title, alert.title),
    });

    if (existingAlert) {
      console.log(`⚠️ Alert already exists: ${alert.title}`);
      continue;
    }

    await db.insert(systemAlerts).values({
      title: alert.title,
      message: alert.message,
      link: alert.link,
      type: alert.type,
      isActive: alert.isActive,
    });

    console.log(`✅ Created alert: ${alert.title}`);
  }

  console.log("🌱 System alerts seeded successfully");
}