import { and, count, desc, eq, ilike } from "drizzle-orm";
import { NextFunction, Request, Response } from "express";

import db from "../../db/index.js";
import {
  customReminders,
  cases,
  clients,
  caseClients,
} from "../../db/schema/index.js";
import CustomErrorHandler from "../../utils/customErrorHandler.js";

function parseTimeString(timeStr?: string | null): { hours: number; minutes: number } {
  if (!timeStr || typeof timeStr !== "string") {
    return { hours: 8, minutes: 0 };
  }

  const str = timeStr.trim();
  const match = str.match(/^(\d{1,2})(?::(\d{1,2}))?(?::\d{1,2})?\s*(am|pm)?$/i);
  if (match) {
    let hours = parseInt(match[1], 10);
    const minutes = match[2] ? parseInt(match[2], 10) : 0;
    const meridiem = match[3]?.toUpperCase();

    if (meridiem === "PM" && hours < 12) {
      hours += 12;
    } else if (meridiem === "AM" && hours === 12) {
      hours = 0;
    }

    const safeHours = Number.isFinite(hours) ? Math.min(Math.max(hours, 0), 23) : 8;
    const safeMinutes = Number.isFinite(minutes) ? Math.min(Math.max(minutes, 0), 59) : 0;
    return { hours: safeHours, minutes: safeMinutes };
  }

  const parts = str.replace(/[^\d:]/g, "").split(":");
  let hours = parseInt(parts[0], 10);
  let minutes = parseInt(parts[1], 10);
  if (isNaN(hours)) hours = 8;
  if (isNaN(minutes)) minutes = 0;
  if (/pm/i.test(str) && hours < 12) hours += 12;
  if (/am/i.test(str) && hours === 12) hours = 0;

  return {
    hours: Math.min(Math.max(hours, 0), 23),
    minutes: Math.min(Math.max(minutes, 0), 59),
  };
}

function parseDateString(dateStr: string, hours = 0, minutes = 0): Date {
  if (!dateStr || typeof dateStr !== "string") {
    const d = new Date();
    d.setHours(hours, minutes, 0, 0);
    return d;
  }

  const ymdMatch = dateStr.trim().match(/^(\d{4})[-/](\d{1,2})[-/](\d{1,2})/);
  if (ymdMatch) {
    const year = parseInt(ymdMatch[1], 10);
    const month = parseInt(ymdMatch[2], 10) - 1;
    const day = parseInt(ymdMatch[3], 10);
    const d = new Date(year, month, day, hours, minutes, 0, 0);
    if (!isNaN(d.getTime())) return d;
  }

  const d = new Date(dateStr);
  if (!isNaN(d.getTime())) {
    d.setHours(hours, minutes, 0, 0);
    return d;
  }

  const fallback = new Date();
  fallback.setHours(hours, minutes, 0, 0);
  return fallback;
}

function computeNextRunAt(
  frequency: string,
  startDate: string,
  time?: string | null,
  endDate?: string | null,
): Date | null {
  const { hours, minutes } = parseTimeString(time);
  const start = parseDateString(startDate, hours, minutes);

  const now = new Date();
  let next: Date;

  const freq = (frequency || "").toLowerCase();

  if (freq === "once") {
    next = start;
  } else if (freq === "daily") {
    if (start > now) {
      next = start;
    } else {
      next = new Date(now);
      next.setHours(hours, minutes, 0, 0);
      if (next <= now) {
        next.setDate(next.getDate() + 1);
      }
    }
  } else if (freq === "weekly") {
    if (start > now) {
      next = start;
    } else {
      const diffMs = now.getTime() - start.getTime();
      const diffDays = Math.max(0, Math.floor(diffMs / (24 * 60 * 60 * 1000)));
      const weeksToAdd = Math.floor(diffDays / 7);
      next = new Date(start.getTime() + weeksToAdd * 7 * 24 * 60 * 60 * 1000);
      while (next <= now) {
        next.setDate(next.getDate() + 7);
      }
    }
  } else if (freq === "fortnightly" || freq === "14 days") {
    if (start > now) {
      next = start;
    } else {
      const diffMs = now.getTime() - start.getTime();
      const diffDays = Math.max(0, Math.floor(diffMs / (24 * 60 * 60 * 1000)));
      const fortnightsToAdd = Math.floor(diffDays / 14);
      next = new Date(start.getTime() + fortnightsToAdd * 14 * 24 * 60 * 60 * 1000);
      while (next <= now) {
        next.setDate(next.getDate() + 14);
      }
    }
  } else {
    return null;
  }

  if (endDate) {
    const end = parseDateString(endDate, 23, 59);
    end.setSeconds(59, 999);
    if (next > end) {
      return null;
    }
  }

  if (isNaN(next.getTime())) {
    return null;
  }

  return next;
}

const reminderController = {
  async createReminder(req: Request, res: Response, next: NextFunction) {
    try {

      const officeId = req.officeId;
      const tenantId = req.user?.tenantId;
      const userId = req.user?.userId;

      if (!tenantId) {
        return next(
          CustomErrorHandler.badRequest("Tenant ID is required"),
        );
      }

      if (!userId) {
        return next(
          CustomErrorHandler.badRequest("User ID is required"),
        );
      }


      if (!officeId) {
        return next(CustomErrorHandler.badRequest("Office context is missing"));
      }

      const {
        reminder,
        frequency,
        startDate,
        endDate,
        time,
        dayOfWeek,
        email,
        contact,
        clientId,
        caseId,
      } = req.body;

      if (!reminder || !frequency || !startDate) {
        return next(
          CustomErrorHandler.badRequest(
            "reminder, frequency, and startDate are required",
          ),
        );
      }

      let finalClientId = clientId || null;
      let resolvedEmail = email || null;

      if (finalClientId && !resolvedEmail) {
        const [clientData] = await db
          .select({ email: clients.email })
          .from(clients)
          .where(eq(clients.id, finalClientId))
          .limit(1);

        if (clientData?.email) {
          resolvedEmail = clientData.email;
        }
      }

      if (caseId) {
        const [caseData] = await db
          .select({ id: cases.id })
          .from(cases)
          .where(
            and(
              eq(cases.id, caseId),
              eq(cases.tenantId, tenantId),
            ),
          )
          .limit(1);

        if (!caseData) {
          return next(CustomErrorHandler.notFound("Case not found"));
        }

        if (!finalClientId || !resolvedEmail) {
          const [caseClientData] = await db
            .select({
              clientId: caseClients.clientId,
              email: clients.email,
            })
            .from(caseClients)
            .innerJoin(clients, eq(caseClients.clientId, clients.id))
            .where(eq(caseClients.caseId, caseId))
            .limit(1);

          if (caseClientData) {
            if (!finalClientId) finalClientId = caseClientData.clientId;
            if (!resolvedEmail && caseClientData.email) resolvedEmail = caseClientData.email;
          }
        }
      }

      console.log("📌 [createReminder] Payload received:", { reminder, frequency, startDate, clientId, caseId, email });
      console.log("✉️ [createReminder] Resolved Client ID:", finalClientId, "Resolved Email:", resolvedEmail);

      const nextRunAt = computeNextRunAt(frequency, startDate, time, endDate);
      const safeTime = time ? String(time).trim().slice(0, 10) : null;

      const [created] = await db
        .insert(customReminders)
        .values({
          tenantId,
          officeId,
          createdBy: userId,
          reminder,
          frequency,
          startDate,
          endDate: endDate || null,
          time: safeTime,
          dayOfWeek: dayOfWeek || null,
          email: resolvedEmail,
          contact: contact || null,
          clientId: finalClientId || null,
          caseId: caseId || null,
          isActive: true,
          nextRunAt,
        })
        .returning();

      return res.status(201).json({
        success: true,
        message: "Reminder created successfully",
        data: created,
      });
    } catch (error) {
      console.error("createReminder error:", error);
      return next(error);
    }
  },

  async getReminders(req: Request, res: Response, next: NextFunction) {
    try {
      const tenantId = req.user?.tenantId;
      const officeId = req.officeId;

      if (!tenantId) {
        return next(CustomErrorHandler.badRequest("Tenant context is missing"));
      }

      if (!officeId) {
        return next(CustomErrorHandler.badRequest("Office context is missing"));
      }

      const {
        search,
        page = "1",
        limit = "20",
      } = req.query;

      const currentPage = Math.max(Number(page) || 1, 1);
      const pageLimit = Math.min(Math.max(Number(limit) || 20, 1), 100);
      const offset = (currentPage - 1) * pageLimit;

      const conditions = [
        eq(customReminders.tenantId, tenantId),
        eq(customReminders.officeId, officeId),
      ];

      if (search) {
        conditions.push(
          ilike(customReminders.reminder, `%${String(search)}%`),
        );
      }

      const [totalResult] = await db
        .select({ count: count() })
        .from(customReminders)
        .where(and(...conditions));

      const total = Number(totalResult?.count ?? 0);
      const totalPages = total === 0 ? 0 : Math.ceil(total / pageLimit);

      const reminderList = await db
        .select({
          id: customReminders.id,
          reminder: customReminders.reminder,
          frequency: customReminders.frequency,
          startDate: customReminders.startDate,
          endDate: customReminders.endDate,
          time: customReminders.time,
          dayOfWeek: customReminders.dayOfWeek,
          email: customReminders.email,
          contact: customReminders.contact,
          clientId: customReminders.clientId,
          caseId: customReminders.caseId,
          isActive: customReminders.isActive,
          nextRunAt: customReminders.nextRunAt,
          lastSentAt: customReminders.lastSentAt,
          createdAt: customReminders.createdAt,

          clientFirstName: clients.firstName,
          clientLastName: clients.lastName,
          clientCompanyName: clients.companyName,
          caseNumber: cases.caseNumber,
        })
        .from(customReminders)
        .leftJoin(
          clients,
          eq(customReminders.clientId, clients.id),
        )
        .leftJoin(
          cases,
          and(
            eq(customReminders.caseId, cases.id),
            eq(cases.tenantId, tenantId),
          ),
        )
        .where(and(...conditions))
        .orderBy(desc(customReminders.createdAt))
        .limit(pageLimit)
        .offset(offset);

      const data = reminderList.map((r) => {
        const personName = [r.clientFirstName, r.clientLastName].filter(Boolean).join(" ").trim();
        const clientDisplayName = personName || r.clientCompanyName || null;

        return {
          id: r.id,
          reminder: r.reminder,
          frequency: r.frequency,
          startDate: r.startDate,
          endDate: r.endDate,
          time: r.time,
          dayOfWeek: r.dayOfWeek,
          email: r.email,
          contact: r.contact,
          clientId: r.clientId,
          caseId: r.caseId,
          isActive: r.isActive,
          nextRunAt: r.nextRunAt,
          lastSentAt: r.lastSentAt,
          createdAt: r.createdAt,
          client: clientDisplayName,
          clientName: personName || null,
          companyName: r.clientCompanyName || null,
          caseNo: r.caseNumber ?? null,
        };
      });

      return res.status(200).json({
        success: true,
        message: "Reminders fetched successfully",
        data,
        pagination: {
          page: currentPage,
          limit: pageLimit,
          total,
          totalPages,
          hasNextPage: currentPage < totalPages,
          hasPreviousPage: currentPage > 1,
        },
      });
    } catch (error) {
      console.error("getReminders error:", error);
      return next(error);
    }
  },

  async updateReminder(req: Request, res: Response, next: NextFunction) {
    try {
      const { id } = req.params;
      const tenantId = req.user?.tenantId;
      const officeId = req.officeId;

      if (!tenantId || !officeId) {
        return next(CustomErrorHandler.badRequest("Tenant/Office context is missing"));
      }

      const [existing] = await db
        .select({ id: customReminders.id })
        .from(customReminders)
        .where(
          and(
            eq(customReminders.id, id),
            eq(customReminders.tenantId, tenantId),
            eq(customReminders.officeId, officeId),
          ),
        )
        .limit(1);

      if (!existing) {
        return next(CustomErrorHandler.notFound("Reminder not found"));
      }

      const {
        reminder,
        frequency,
        startDate,
        endDate,
        time,
        dayOfWeek,
        email,
        contact,
        clientId,
        caseId,
      } = req.body;

      let resolvedEmail = email !== undefined ? email : undefined;

      if (clientId && !resolvedEmail) {
        const [clientData] = await db
          .select({ email: clients.email })
          .from(clients)
          .where(eq(clients.id, clientId))
          .limit(1);

        if (clientData?.email) {
          resolvedEmail = clientData.email;
        }
      }

      let nextRunAt: Date | null | undefined = undefined;
      if (frequency !== undefined || startDate !== undefined || time !== undefined || endDate !== undefined) {
        const finalFrequency = frequency ?? (await db
          .select({ frequency: customReminders.frequency })
          .from(customReminders)
          .where(eq(customReminders.id, id))
          .limit(1)
          .then((r) => r[0]?.frequency ?? "Once"));

        const finalStartDate = startDate ?? (await db
          .select({ startDate: customReminders.startDate })
          .from(customReminders)
          .where(eq(customReminders.id, id))
          .limit(1)
          .then((r) => r[0]?.startDate ?? ""));

        const finalTime = time !== undefined ? time : (await db
          .select({ time: customReminders.time })
          .from(customReminders)
          .where(eq(customReminders.id, id))
          .limit(1)
          .then((r) => r[0]?.time ?? null));

        const finalEndDate = endDate !== undefined ? endDate : (await db
          .select({ endDate: customReminders.endDate })
          .from(customReminders)
          .where(eq(customReminders.id, id))
          .limit(1)
          .then((r) => r[0]?.endDate ?? null));

        nextRunAt = computeNextRunAt(
          finalFrequency,
          finalStartDate,
          finalTime,
          finalEndDate,
        );
      }

      const safeTime = time !== undefined ? (time ? String(time).trim().slice(0, 10) : null) : undefined;

      const [updated] = await db
        .update(customReminders)
        .set({
          ...(reminder !== undefined && { reminder }),
          ...(frequency !== undefined && { frequency }),
          ...(startDate !== undefined && { startDate }),
          ...(endDate !== undefined && { endDate: endDate || null }),
          ...(safeTime !== undefined && { time: safeTime }),
          ...(dayOfWeek !== undefined && { dayOfWeek: dayOfWeek || null }),
          ...(resolvedEmail !== undefined && { email: resolvedEmail || null }),
          ...(contact !== undefined && { contact: contact || null }),
          ...(clientId !== undefined && { clientId: clientId || null }),
          ...(caseId !== undefined && { caseId: caseId || null }),
          ...(nextRunAt !== undefined && { nextRunAt }),
        })
        .where(
          and(
            eq(customReminders.id, id),
            eq(customReminders.tenantId, tenantId),
            eq(customReminders.officeId, officeId),
          ),
        )
        .returning();

      return res.status(200).json({
        success: true,
        message: "Reminder updated successfully",
        data: updated,
      });
    } catch (error) {
      console.error("updateReminder error:", error);
      return next(error);
    }
  },

  async deleteReminder(req: Request, res: Response, next: NextFunction) {
    try {
      const { id } = req.params;
      const tenantId = req.user?.tenantId;
      const officeId = req.officeId;

      if (!tenantId || !officeId) {
        return next(CustomErrorHandler.badRequest("Tenant/Office context is missing"));
      }

      const [deleted] = await db
        .delete(customReminders)
        .where(
          and(
            eq(customReminders.id, id),
            eq(customReminders.tenantId, tenantId),
            eq(customReminders.officeId, officeId),
          ),
        )
        .returning();

      if (!deleted) {
        return next(CustomErrorHandler.notFound("Reminder not found"));
      }

      return res.status(200).json({
        success: true,
        message: "Reminder deleted successfully",
        data: deleted,
      });
    } catch (error) {
      console.error("deleteReminder error:", error);
      return next(error);
    }
  },
};

export default reminderController;
