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

/**
 * Compute `nextRunAt` from reminder fields.
 */
function computeNextRunAt(
  frequency: string,
  startDate: string,
  time?: string | null,
  endDate?: string | null,
): Date | null {
  const timePart = time || "08:00";
  const [hours, minutes] = timePart.split(":").map(Number);

  const start = new Date(startDate);
  start.setHours(hours, minutes, 0, 0);

  const now = new Date();

  let next: Date;

  if (frequency === "Once") {
    next = start;
  } else if (frequency === "Daily") {
    next = start > now ? start : new Date(now);
    next.setHours(hours, minutes, 0, 0);
    if (next <= now) {
      next.setDate(next.getDate() + 1);
    }
  } else if (frequency === "Weekly") {
    next = start > now ? start : new Date(now);
    next.setHours(hours, minutes, 0, 0);
    if (next <= now) {
      next.setDate(next.getDate() + 7);
    }
  } else if (frequency === "Fortnightly") {
    next = start > now ? start : new Date(now);
    next.setHours(hours, minutes, 0, 0);
    if (next <= now) {
      next.setDate(next.getDate() + 14);
    }
  } else {
    return null;
  }

  // If end date passed, no next run
  if (endDate) {
    const end = new Date(endDate);
    end.setHours(23, 59, 59, 999);
    if (next > end) {
      return null;
    }
  }

  return next;
}

const reminderController = {
  /**
   * POST /api/reminders
   */
  async createReminder(req: Request, res: Response, next: NextFunction) {
    try {
      const tenantId = req.user.tenantId;
      const officeId = req.officeId;
      const userId = req.user.userId;

      if (!tenantId) {
        return next(CustomErrorHandler.badRequest("Tenant context is missing"));
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

      // Resolve client email if clientId provided and email is empty
      if (finalClientId && !resolvedEmail) {
        const [clientData] = await db
          .select({ email: clients.email })
          .from(clients)
          .where(
            and(
              eq(clients.id, finalClientId),
              eq(clients.tenantId, tenantId),
            ),
          )
          .limit(1);

        if (clientData?.email) {
          resolvedEmail = clientData.email;
        }
      }

      // Validate case belongs to tenant and resolve associated client if missing
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

        // If clientId or email is missing, lookup associated client from caseClients
        if (!finalClientId || !resolvedEmail) {
          const [caseClientData] = await db
            .select({
              clientId: caseClients.clientId,
              email: clients.email,
            })
            .from(caseClients)
            .innerJoin(clients, eq(caseClients.clientId, clients.id))
            .where(
              and(
                eq(caseClients.caseId, caseId),
                eq(clients.tenantId, tenantId),
              ),
            )
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
          time: time || null,
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

  /**
   * GET /api/reminders
   */
  async getReminders(req: Request, res: Response, next: NextFunction) {
    try {
      const tenantId = req.user.tenantId;
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

          // Joined fields
          clientFirstName: clients.firstName,
          clientLastName: clients.lastName,
          clientCompanyName: clients.companyName,
          caseNumber: cases.caseNumber,
        })
        .from(customReminders)
        .leftJoin(
          clients,
          and(
            eq(customReminders.clientId, clients.id),
            eq(clients.tenantId, tenantId),
          ),
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

      // Format response to match frontend expectations
      const data = reminderList.map((r) => ({
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
        client:
          (r.clientCompanyName ??
            [r.clientFirstName, r.clientLastName].filter(Boolean).join(" ")) ||
          null,
        caseNo: r.caseNumber ?? null,
      }));

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

  /**
   * PUT /api/reminders/:id
   */
  async updateReminder(req: Request, res: Response, next: NextFunction) {
    try {
      const { id } = req.params;
      const tenantId = req.user.tenantId;
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

      // Resolve client email if clientId provided and email is empty
      let resolvedEmail = email !== undefined ? email : undefined;

      if (clientId && !resolvedEmail) {
        const [clientData] = await db
          .select({ email: clients.email })
          .from(clients)
          .where(
            and(
              eq(clients.id, clientId),
              eq(clients.tenantId, tenantId),
            ),
          )
          .limit(1);

        if (clientData?.email) {
          resolvedEmail = clientData.email;
        }
      }

      // Recompute nextRunAt if frequency/dates changed
      let nextRunAt: Date | null | undefined = undefined;
      if (frequency !== undefined || startDate !== undefined) {
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

        nextRunAt = computeNextRunAt(
          finalFrequency,
          finalStartDate,
          time,
          endDate,
        );
      }

      const [updated] = await db
        .update(customReminders)
        .set({
          ...(reminder !== undefined && { reminder }),
          ...(frequency !== undefined && { frequency }),
          ...(startDate !== undefined && { startDate }),
          ...(endDate !== undefined && { endDate: endDate || null }),
          ...(time !== undefined && { time: time || null }),
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

  /**
   * DELETE /api/reminders/:id
   */
  async deleteReminder(req: Request, res: Response, next: NextFunction) {
    try {
      const { id } = req.params;
      const tenantId = req.user.tenantId;
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
