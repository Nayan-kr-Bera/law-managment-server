import { Request, Response, NextFunction } from "express";
import { and, desc, eq, ilike, isNull, or, sql } from "drizzle-orm";
import db from "../../db/index.js";
import {
  appointments,
  cases,
  clients,
  offices,
  userScopes,
} from "../../db/schema/index.js";

import CustomErrorHandler from "../../utils/customErrorHandler.js";
import appointmentEmailService, {
  appointmentCancellationEmailService,
} from "../../services/appointmentEmail.service.js";

const VALID_APPOINTMENT_MODES = ["in_person", "online", "phone"] as const;

type AppointmentMode = (typeof VALID_APPOINTMENT_MODES)[number];

const appointmentController = {
  async createAppointment(req: Request, res: Response, next: NextFunction) {
    try {
      const tenantId = req.user?.tenantId;

      if (!tenantId) {
        return next(
          CustomErrorHandler.wrongCredentials("Tenant ID is required"),
        );
      }

      const {
        officeId,
        clientId,
        caseId,
        assignedTo,
        date,
        mode,
        purpose,
        location,
        sendEmail,
        sendWhatsApp,
      } = req.body;

      // Required fields
      if (!date) {
        return next(
          CustomErrorHandler.wrongCredentials(
            "Appointment date and time are required",
          ),
        );
      }

      if (!mode) {
        return next(
          CustomErrorHandler.wrongCredentials("Appointment mode is required"),
        );
      }

      if (!VALID_APPOINTMENT_MODES.includes(mode as AppointmentMode)) {
        return next(
          CustomErrorHandler.wrongCredentials("Invalid appointment mode"),
        );
      }

      if (!purpose || !purpose.trim()) {
        return next(CustomErrorHandler.wrongCredentials("Purpose is required"));
      }

      // Validate date
      const appointmentDate = new Date(date);

      if (Number.isNaN(appointmentDate.getTime())) {
        return next(
          CustomErrorHandler.wrongCredentials("Invalid appointment date"),
        );
      }

      // Validate CLIENT belongs to tenant
      let clientData;

      if (clientId) {
        clientData = await db.query.clients.findFirst({
          where: eq(clients.id, clientId),
          columns: {
            id: true,
            firstName: true,
            lastName: true,
            email: true,
          },
        });

        if (!clientData) {
          return next(CustomErrorHandler.notFound("Client not found"));
        }
      }
      const clientName =
        `${clientData?.firstName} ${clientData?.lastName}`.trim();
      let caseData;

      if (caseId) {
        caseData = await db.query.cases.findFirst({
          where: and(
            eq(cases.id, caseId),
            eq(cases.tenantId, tenantId),
            isNull(cases.deletedAt),
          ),
          columns: {
            id: true,
            caseNumber: true,
            title: true,
          },
        });

        if (!caseData) {
          return next(CustomErrorHandler.notFound("Case not found"));
        }
      }

      // Validate OFFICE belongs to tenant
      if (officeId) {
        const office = await db.query.offices.findFirst({
          where: and(eq(offices.id, officeId), eq(offices.tenantId, tenantId)),
          columns: {
            id: true,
          },
        });

        if (!office) {
          return next(CustomErrorHandler.notFound("Office not found"));
        }
      }

      if (assignedTo) {
        const userScope = await db.query.userScopes.findFirst({
          where: and(
            eq(userScopes.userId, assignedTo),
            eq(userScopes.tenantId, tenantId),
          ),
          columns: {
            id: true,
            userId: true,
            tenantId: true,
          },
        });

        if (!userScope) {
          return next(
            CustomErrorHandler.notFound(
              "Assigned user does not belong to this tenant",
            ),
          );
        }
      }

      // CREATE
      const [appointment] = await db
        .insert(appointments)
        .values({
          tenantId,

          officeId: officeId || null,

          clientId: clientId || null,

          caseId: caseId || null,

          assignedTo: assignedTo || null,

          date: appointmentDate,

          mode: mode as AppointmentMode,

          purpose: purpose.trim(),

          location: location?.trim() || null,

          sendEmail: Boolean(sendEmail),

          sendWhatsApp: Boolean(sendWhatsApp),
        })
        .returning();
      // Send appointment email
      if (sendEmail && clientData?.email) {
        await appointmentEmailService({
          clientName: clientName,
          clientEmail: clientData.email,

          appointmentDate,

          purpose: purpose.trim(),

          mode: mode as AppointmentMode,

          location: location?.trim() || null,

          caseNumber: caseData?.caseNumber ?? null,

          caseTitle: caseData?.title ?? null,
        });
      }
      return res.status(201).json({
        success: true,
        message: "Appointment created successfully",
        data: appointment,
      });
    } catch (error) {
      next(error);
    }
  },
  async getAppointments(req: Request, res: Response, next: NextFunction) {
    try {
      const tenantId = req.user?.tenantId;

      if (!tenantId) {
        return next(
          CustomErrorHandler.wrongCredentials("Tenant ID is required"),
        );
      }

      const page = Math.max(Number(req.query.page) || 1, 1);

      const limit = Math.min(Math.max(Number(req.query.limit) || 10, 1), 100);

      const offset = (page - 1) * limit;

      const search =
        typeof req.query.search === "string" ? req.query.search.trim() : "";

      const VALID_APPOINTMENT_STATUSES = [
        "scheduled",
        "completed",
        "cancelled",
      ] as const;

      type AppointmentStatus = (typeof VALID_APPOINTMENT_STATUSES)[number];

      const status =
        typeof req.query.status === "string" ? req.query.status : undefined;

      if (
        status &&
        !VALID_APPOINTMENT_STATUSES.includes(status as AppointmentStatus)
      ) {
        return next(
          CustomErrorHandler.wrongCredentials("Invalid appointment status"),
        );
      }

      const conditions = [eq(appointments.tenantId, tenantId)];

      // Search filter

      if (search) {
        conditions.push(
          or(
            ilike(appointments.purpose, `%${search}%`),
            ilike(appointments.location, `%${search}%`),
          )!,
        );
      }

      // Status filter

      if (status) {
        conditions.push(eq(appointments.status, status as AppointmentStatus));
      }

      const whereCondition = and(...conditions);

      const appointmentData = await db.query.appointments.findMany({
        where: whereCondition,

        with: {
          client: true,
          case: true,
          office: true,
          assignee: true,
        },

        orderBy: [desc(appointments.date)],

        limit,

        offset,
      });

      const totalResult = await db
        .select({
          count: sql<number>`count(*)`,
        })
        .from(appointments)
        .where(whereCondition);

      const total = Number(totalResult[0]?.count || 0);

      const statusCountConditions = [eq(appointments.tenantId, tenantId)];

      if (search) {
        statusCountConditions.push(
          or(
            ilike(appointments.purpose, `%${search}%`),
            ilike(appointments.location, `%${search}%`),
          )!,
        );
      }

      const statusCountsResult = await db
        .select({
          status: appointments.status,

          count: sql<number>`count(*)`,
        })
        .from(appointments)
        .where(and(...statusCountConditions))
        .groupBy(appointments.status);

      const statusCounts = {
        scheduled: 0,
        completed: 0,
        cancelled: 0,
      };

      for (const row of statusCountsResult) {
        if (
          row.status === "scheduled" ||
          row.status === "completed" ||
          row.status === "cancelled"
        ) {
          statusCounts[row.status] = Number(row.count);
        }
      }

      return res.status(200).json({
        success: true,

        data: appointmentData,

        pagination: {
          page,
          limit,
          total,
          totalPages: Math.ceil(total / limit),
        },

        statusCounts: {
          ...statusCounts,
        },
      });
    } catch (error) {
      next(error);
    }
  },
  async getAppointmentById(req: Request, res: Response, next: NextFunction) {
    try {
      const tenantId = req.user?.tenantId;

      const { id } = req.params;

      if (!tenantId) {
        return next(
          CustomErrorHandler.wrongCredentials("Tenant ID is required"),
        );
      }

      const appointment = await db.query.appointments.findFirst({
        where: and(
          eq(appointments.id, id),
          eq(appointments.tenantId, tenantId),
        ),

        with: {
          client: true,
          case: true,
          office: true,
          assignee: true,
        },
      });

      if (!appointment) {
        return next(CustomErrorHandler.notFound("Appointment not found"));
      }

      return res.status(200).json({
        success: true,
        data: appointment,
      });
    } catch (error) {
      next(error);
    }
  },
  async updateAppointment(req: Request, res: Response, next: NextFunction) {
    try {
      const tenantId = req.user?.tenantId;
      const { id } = req.params;

      if (!tenantId) {
        return next(
          CustomErrorHandler.wrongCredentials("Tenant ID is required"),
        );
      }

      const existingAppointment = await db.query.appointments.findFirst({
        where: and(
          eq(appointments.id, id),
          eq(appointments.tenantId, tenantId),
        ),
      });

      if (!existingAppointment) {
        return next(CustomErrorHandler.notFound("Appointment not found"));
      }

      const {
        officeId,
        clientId,
        caseId,
        assignedTo,
        date,
        mode,
        purpose,
        location,
        sendEmail,
        sendWhatsApp,
      } = req.body;

      if (
        mode !== undefined &&
        !VALID_APPOINTMENT_MODES.includes(mode as AppointmentMode)
      ) {
        return next(
          CustomErrorHandler.wrongCredentials("Invalid appointment mode"),
        );
      }

      let appointmentDate: Date | undefined;

      if (date !== undefined) {
        appointmentDate = new Date(date);

        if (Number.isNaN(appointmentDate.getTime())) {
          return next(
            CustomErrorHandler.wrongCredentials("Invalid appointment date"),
          );
        }
      }

      const finalClientId =
        clientId !== undefined
          ? clientId || null
          : existingAppointment.clientId;

      let clientData;

      if (finalClientId) {
        clientData = await db.query.clients.findFirst({
          where: eq(clients.id, finalClientId),
          columns: {
            id: true,
            firstName: true,
            lastName: true,
            email: true,
          },
        });

        if (!clientData) {
          return next(CustomErrorHandler.notFound("Client not found"));
        }
      }

      const finalCaseId =
        caseId !== undefined ? caseId || null : existingAppointment.caseId;

      let caseData;

      if (finalCaseId) {
        caseData = await db.query.cases.findFirst({
          where: and(
            eq(cases.id, finalCaseId),
            eq(cases.tenantId, tenantId),
            isNull(cases.deletedAt),
          ),
          columns: {
            id: true,
            caseNumber: true,
            title: true,
          },
        });

        if (!caseData) {
          return next(CustomErrorHandler.notFound("Case not found"));
        }
      }

      if (officeId !== undefined && officeId !== null && officeId !== "") {
        const office = await db.query.offices.findFirst({
          where: and(eq(offices.id, officeId), eq(offices.tenantId, tenantId)),
          columns: {
            id: true,
          },
        });

        if (!office) {
          return next(CustomErrorHandler.notFound("Office not found"));
        }
      }

      if (
        assignedTo !== undefined &&
        assignedTo !== null &&
        assignedTo !== ""
      ) {
        const userScope = await db.query.userScopes.findFirst({
          where: and(
            eq(userScopes.userId, assignedTo),
            eq(userScopes.tenantId, tenantId),
          ),
          columns: {
            id: true,
          },
        });

        if (!userScope) {
          return next(
            CustomErrorHandler.notFound(
              "Assigned user does not belong to this tenant",
            ),
          );
        }
      }

      const updateData: Partial<typeof appointments.$inferInsert> = {};

      if (officeId !== undefined) {
        updateData.officeId = officeId || null;
      }

      if (clientId !== undefined) {
        updateData.clientId = clientId || null;
      }

      if (caseId !== undefined) {
        updateData.caseId = caseId || null;
      }

      if (assignedTo !== undefined) {
        updateData.assignedTo = assignedTo || null;
      }

      if (appointmentDate !== undefined) {
        updateData.date = appointmentDate;
      }

      if (mode !== undefined) {
        updateData.mode = mode as AppointmentMode;
      }

      if (purpose !== undefined) {
        if (!purpose.trim()) {
          return next(
            CustomErrorHandler.wrongCredentials("Purpose cannot be empty"),
          );
        }

        updateData.purpose = purpose.trim();
      }

      if (location !== undefined) {
        updateData.location = location?.trim() || null;
      }

      if (sendEmail !== undefined) {
        updateData.sendEmail = Boolean(sendEmail);
      }

      if (sendWhatsApp !== undefined) {
        updateData.sendWhatsApp = Boolean(sendWhatsApp);
      }

      updateData.updatedAt = new Date();

      const [updatedAppointment] = await db
        .update(appointments)
        .set(updateData)
        .where(
          and(eq(appointments.id, id), eq(appointments.tenantId, tenantId)),
        )
        .returning();

      if (sendEmail && clientData?.email) {
        const finalDate = appointmentDate ?? existingAppointment.date;

        const finalMode = mode ?? existingAppointment.mode;

        const finalPurpose = purpose?.trim() ?? existingAppointment.purpose;

        const finalLocation =
          location !== undefined
            ? location?.trim() || null
            : existingAppointment.location;

        const clientName = `${clientData.firstName ?? ""} ${clientData.lastName ?? ""
          }`.trim();

        await appointmentEmailService({
          clientName,

          clientEmail: clientData.email,

          appointmentDate: finalDate,

          purpose: finalPurpose,

          mode: finalMode as AppointmentMode,

          location: finalLocation,

          caseNumber: caseData?.caseNumber ?? null,

          caseTitle: caseData?.title ?? null,
        });
      }

      return res.status(200).json({
        success: true,
        message: "Appointment updated successfully",
        data: updatedAppointment,
      });
    } catch (error) {
      next(error);
    }
  },
  async deleteAppointment(req: Request, res: Response, next: NextFunction) {
    try {
      const tenantId = req.user?.tenantId;

      const { id } = req.params;

      if (!tenantId) {
        return next(
          CustomErrorHandler.wrongCredentials("Tenant ID is required"),
        );
      }

      // Delete only if appointment belongs to tenant

      const [deletedAppointment] = await db
        .delete(appointments)
        .where(
          and(eq(appointments.id, id), eq(appointments.tenantId, tenantId)),
        )
        .returning();

      if (!deletedAppointment) {
        return next(CustomErrorHandler.notFound("Appointment not found"));
      }

      return res.status(200).json({
        success: true,
        message: "Appointment deleted successfully",
        data: deletedAppointment,
      });
    } catch (error) {
      next(error);
    }
  },
  async updateAppointmentStatus(
    req: Request,
    res: Response,
    next: NextFunction,
  ) {
    try {
      const tenantId = req.user?.tenantId;
      const { id } = req.params;
      const { status } = req.body;

      if (!tenantId) {
        return next(
          CustomErrorHandler.wrongCredentials("Tenant ID is required"),
        );
      }

      const VALID_APPOINTMENT_STATUSES = [
        "scheduled",
        "completed",
        "cancelled",
      ] as const;

      type AppointmentStatus = (typeof VALID_APPOINTMENT_STATUSES)[number];

      if (
        !status ||
        !VALID_APPOINTMENT_STATUSES.includes(status as AppointmentStatus)
      ) {
        return next(
          CustomErrorHandler.wrongCredentials("Invalid appointment status"),
        );
      }

      const existingAppointment = await db.query.appointments.findFirst({
        where: and(
          eq(appointments.id, id),
          eq(appointments.tenantId, tenantId),
        ),
      });

      if (!existingAppointment) {
        return next(CustomErrorHandler.notFound("Appointment not found"));
      }

      const [updatedAppointment] = await db
        .update(appointments)
        .set({
          status: status as AppointmentStatus,
          updatedAt: new Date(),
        })
        .where(
          and(eq(appointments.id, id), eq(appointments.tenantId, tenantId)),
        )
        .returning();

      // Send cancellation email to client
      if (status === "cancelled" && existingAppointment.clientId) {
        const client = await db.query.clients.findFirst({
          where: eq(clients.id, existingAppointment.clientId),
          columns: {
            firstName: true,
            lastName: true,
            email: true,
          },
        });

        if (client?.email) {
          await appointmentCancellationEmailService({
            clientName: `${client.firstName ?? ""} ${client.lastName ?? ""
              }`.trim(),

            clientEmail: client.email,

            appointmentDate: existingAppointment.date,

            purpose: existingAppointment.purpose,
          });
        }
      }

      return res.status(200).json({
        success: true,
        message: "Appointment status updated successfully",
        data: updatedAppointment,
      });
    } catch (error) {
      next(error);
    }
  },
};

export default appointmentController;
