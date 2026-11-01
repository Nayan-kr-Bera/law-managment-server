import { Request, Response, NextFunction } from "express";
import { and, count, desc, eq, ilike, isNull, or } from "drizzle-orm";
import db from "../../db/index.js";
import {
  appointments,
  cases,
  clients,
  offices,
  tenants,
  userScopes,
} from "../../db/schema/index.js";

import CustomErrorHandler from "../../utils/customErrorHandler.js";
import appointmentEmailService, {
  appointmentCancellationEmailService,
} from "../../services/appointmentEmail.service.js";
import { createClientNotification } from "../../services/notification.service.js";

const VALID_APPOINTMENT_MODES = ["in_person", "online", "phone"] as const;
type AppointmentMode = (typeof VALID_APPOINTMENT_MODES)[number];

const VALID_APPOINTMENT_STATUSES = [
  "pending",
  "scheduled",
  "completed",
  "cancelled",
] as const;
type AppointmentStatus = (typeof VALID_APPOINTMENT_STATUSES)[number];

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

      const appointmentDate = new Date(date);

      if (Number.isNaN(appointmentDate.getTime())) {
        return next(
          CustomErrorHandler.wrongCredentials("Invalid appointment date"),
        );
      }

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
        `${clientData?.firstName ?? ""} ${clientData?.lastName ?? ""}`.trim();

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

      const tenantRow = await db.query.tenants.findFirst({
        where: eq(tenants.id, tenantId),
        columns: { name: true },
      });

      const [appointment] = await db
        .insert(appointments)
        .values({
          tenantId,
          officeId: officeId || (req.user as any)?.officeId || null,
          clientId: clientId || null,
          caseId: caseId || null,
          assignedTo: assignedTo || req.user?.userId || null,
          date: appointmentDate,
          mode: mode as AppointmentMode,
          purpose: purpose.trim(),
          location: location?.trim() || null,
          status: "scheduled",
          sendEmail: Boolean(sendEmail),
          sendWhatsApp: Boolean(sendWhatsApp),
        })
        .returning();

      if (clientData) {
        const formattedDate = appointmentDate.toLocaleDateString("en-IN", {
          day: "2-digit",
          month: "short",
          year: "numeric",
        });
        const formattedTime = appointmentDate.toLocaleTimeString("en-IN", {
          hour: "2-digit",
          minute: "2-digit",
        });

        createClientNotification({
          tenantId,
          officeId: appointment.officeId,
          caseId: appointment.caseId,
          clientId: clientData.id,
          channel: "portal",
          recipient: clientData.email || "",
          title: `Appointment Scheduled: ${formattedDate}`,
          message: `A consultation (${mode === "online" ? "Online Video" : mode === "phone" ? "Phone" : "In-Person"}) has been scheduled for ${formattedDate} at ${formattedTime} regarding "${purpose.trim()}".`,
          link: "/appointments",
          actionUrl: "/appointments",
          payload: {
            type: "appointment",
            appointmentId: appointment.id,
            status: "scheduled",
            date: appointmentDate.toISOString(),
            mode,
            purpose: purpose.trim(),
            location: location?.trim() || null,
            link: "/appointments",
            actionUrl: "/appointments",
            actionLabel: "View Appointment",
          },
        }).catch((err) =>
          console.error("Failed to create client appointment notification:", err),
        );
      }

      if (sendEmail && clientData?.email) {
        await appointmentEmailService({
          clientName,
          clientEmail: clientData.email,
          appointmentDate,
          purpose: purpose.trim(),
          mode: mode as AppointmentMode,
          location: location?.trim() || null,
          caseNumber: caseData?.caseNumber ?? null,
          caseTitle: caseData?.title ?? null,
          firmName: tenantRow?.name ?? null,
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

      if (search) {
        conditions.push(
          or(
            ilike(appointments.purpose, `%${search}%`),
            ilike(appointments.location, `%${search}%`),
          )!,
        );
      }

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
          count: count(),
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
          count: count(),
        })
        .from(appointments)
        .where(and(...statusCountConditions))
        .groupBy(appointments.status);

      const statusCounts = {
        pending: 0,
        scheduled: 0,
        completed: 0,
        cancelled: 0,
      };

      for (const row of statusCountsResult) {
        if (
          row.status === "pending" ||
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
        status,
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

      if (
        status !== undefined &&
        !VALID_APPOINTMENT_STATUSES.includes(status as AppointmentStatus)
      ) {
        return next(
          CustomErrorHandler.wrongCredentials("Invalid appointment status"),
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

      // If this was a pending client request and the advocate modifies & saves it, confirm it as "scheduled"
      const wasPending = existingAppointment.status === "pending";
      if (status !== undefined) {
        updateData.status = status as AppointmentStatus;
      } else if (wasPending) {
        updateData.status = "scheduled";
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

      const finalDate = appointmentDate ?? existingAppointment.date;
      const finalMode = mode ?? existingAppointment.mode;
      const finalPurpose = purpose?.trim() ?? existingAppointment.purpose;
      const finalLocation =
        location !== undefined
          ? location?.trim() || null
          : existingAppointment.location;

      const tenantRow = await db.query.tenants.findFirst({
        where: eq(tenants.id, tenantId),
        columns: { name: true },
      });

      // Notify client in portal & push
      if (clientData) {
        const formattedDate = new Date(finalDate).toLocaleDateString("en-IN", {
          day: "2-digit",
          month: "short",
          year: "numeric",
        });
        const formattedTime = new Date(finalDate).toLocaleTimeString("en-IN", {
          hour: "2-digit",
          minute: "2-digit",
        });

        const title = wasPending
          ? `Appointment Confirmed: ${formattedDate}`
          : `Appointment Updated: ${formattedDate}`;
        const message = wasPending
          ? `Your appointment request has been reviewed and confirmed for ${formattedDate} at ${formattedTime} (${finalMode === "online" ? "Online Video" : finalMode === "phone" ? "Phone" : "In-Person"}).`
          : `Your consultation schedule has been updated to ${formattedDate} at ${formattedTime} regarding "${finalPurpose}".`;

        createClientNotification({
          tenantId,
          officeId: updatedAppointment.officeId,
          caseId: updatedAppointment.caseId,
          clientId: clientData.id,
          channel: "portal",
          recipient: clientData.email || "",
          title,
          message,
          link: "/appointments",
          actionUrl: "/appointments",
          payload: {
            type: "appointment",
            appointmentId: updatedAppointment.id,
            status: updatedAppointment.status,
            date: new Date(finalDate).toISOString(),
            mode: finalMode,
            purpose: finalPurpose,
            location: finalLocation,
            link: "/appointments",
            actionUrl: "/appointments",
            actionLabel: "View Appointment",
          },
        }).catch((err) =>
          console.error("Failed to create client appointment update notification:", err),
        );
      }

      if ((sendEmail || wasPending) && clientData?.email) {
        const clientName = `${clientData.firstName ?? ""} ${
          clientData.lastName ?? ""
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
          firmName: tenantRow?.name ?? null,
        });
      }

      return res.status(200).json({
        success: true,
        message: wasPending
          ? "Appointment modified and confirmed successfully"
          : "Appointment updated successfully",
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
      const { status, location, date, mode } = req.body;

      if (!tenantId) {
        return next(
          CustomErrorHandler.wrongCredentials("Tenant ID is required"),
        );
      }

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

      const updateFields: Partial<typeof appointments.$inferInsert> = {
        status: status as AppointmentStatus,
        updatedAt: new Date(),
      };

      if (location !== undefined) {
        updateFields.location = location?.trim() || null;
      }
      if (date !== undefined) {
        const parsed = new Date(date);
        if (!Number.isNaN(parsed.getTime())) {
          updateFields.date = parsed;
        }
      }
      if (
        mode !== undefined &&
        VALID_APPOINTMENT_MODES.includes(mode as AppointmentMode)
      ) {
        updateFields.mode = mode as AppointmentMode;
      }

      const [updatedAppointment] = await db
        .update(appointments)
        .set(updateFields)
        .where(
          and(eq(appointments.id, id), eq(appointments.tenantId, tenantId)),
        )
        .returning();

      if (existingAppointment.clientId) {
        const [client, caseData, tenantRow] = await Promise.all([
          db.query.clients.findFirst({
            where: eq(clients.id, existingAppointment.clientId),
            columns: {
              id: true,
              firstName: true,
              lastName: true,
              email: true,
            },
          }),
          existingAppointment.caseId
            ? db.query.cases.findFirst({
                where: eq(cases.id, existingAppointment.caseId),
                columns: { caseNumber: true, title: true },
              })
            : Promise.resolve(undefined),
          db.query.tenants.findFirst({
            where: eq(tenants.id, tenantId),
            columns: { name: true },
          }),
        ]);

        if (client) {
          const clientName = `${client.firstName ?? ""} ${
            client.lastName ?? ""
          }`.trim();
          const finalDate = updatedAppointment.date;
          const formattedDate = new Date(finalDate).toLocaleDateString("en-IN", {
            day: "2-digit",
            month: "short",
            year: "numeric",
          });
          const formattedTime = new Date(finalDate).toLocaleTimeString("en-IN", {
            hour: "2-digit",
            minute: "2-digit",
          });

          if (status === "scheduled") {
            createClientNotification({
              tenantId,
              officeId: updatedAppointment.officeId,
              caseId: updatedAppointment.caseId,
              clientId: client.id,
              channel: "portal",
              recipient: client.email || "",
              title: `Appointment Confirmed: ${formattedDate}`,
              message: `Your consultation request for ${formattedDate} at ${formattedTime} has been confirmed by ${tenantRow?.name || "your legal chamber"}.`,
              link: "/appointments",
              actionUrl: "/appointments",
              payload: {
                type: "appointment",
                appointmentId: updatedAppointment.id,
                status: "scheduled",
                date: new Date(finalDate).toISOString(),
                mode: updatedAppointment.mode,
                purpose: updatedAppointment.purpose,
                location: updatedAppointment.location,
                link: "/appointments",
                actionUrl: "/appointments",
                actionLabel: "View Appointment",
              },
            }).catch((err) =>
              console.error("Failed to notify client of confirmed appointment:", err),
            );

            if (client.email) {
              await appointmentEmailService({
                clientName,
                clientEmail: client.email,
                appointmentDate: finalDate,
                purpose: updatedAppointment.purpose,
                mode: updatedAppointment.mode as AppointmentMode,
                location: updatedAppointment.location,
                caseNumber: caseData?.caseNumber ?? null,
                caseTitle: caseData?.title ?? null,
                firmName: tenantRow?.name ?? null,
              });
            }
          } else if (status === "cancelled") {
            createClientNotification({
              tenantId,
              officeId: updatedAppointment.officeId,
              caseId: updatedAppointment.caseId,
              clientId: client.id,
              channel: "portal",
              recipient: client.email || "",
              title: `Appointment Cancelled: ${formattedDate}`,
              message: `Your appointment scheduled for ${formattedDate} at ${formattedTime} ("${updatedAppointment.purpose}") has been cancelled.`,
              link: "/appointments",
              actionUrl: "/appointments",
              payload: {
                type: "appointment",
                appointmentId: updatedAppointment.id,
                status: "cancelled",
                date: new Date(finalDate).toISOString(),
                link: "/appointments",
                actionUrl: "/appointments",
                actionLabel: "View Appointments",
              },
            }).catch((err) =>
              console.error("Failed to notify client of cancelled appointment:", err),
            );

            if (client.email) {
              await appointmentCancellationEmailService({
                clientName,
                clientEmail: client.email,
                appointmentDate: finalDate,
                purpose: updatedAppointment.purpose,
                mode: updatedAppointment.mode as AppointmentMode,
                location: updatedAppointment.location,
                caseNumber: caseData?.caseNumber ?? null,
                caseTitle: caseData?.title ?? null,
                firmName: tenantRow?.name ?? null,
              });
            }
          } else if (status === "completed") {
            createClientNotification({
              tenantId,
              officeId: updatedAppointment.officeId,
              caseId: updatedAppointment.caseId,
              clientId: client.id,
              channel: "portal",
              recipient: client.email || "",
              title: `Consultation Completed`,
              message: `Your consultation regarding "${updatedAppointment.purpose}" on ${formattedDate} has been marked as completed.`,
              link: "/appointments",
              actionUrl: "/appointments",
              payload: {
                type: "appointment",
                appointmentId: updatedAppointment.id,
                status: "completed",
                link: "/appointments",
                actionUrl: "/appointments",
                actionLabel: "View Appointments",
              },
            }).catch((err) =>
              console.error("Failed to notify client of completed appointment:", err),
            );
          }
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
