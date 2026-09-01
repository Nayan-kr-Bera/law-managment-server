import { and, eq, SQL } from "drizzle-orm";
import { NextFunction, Request, Response } from "express";
import db from "../../db/index.js";
import clients from "../../db/schema/clients/clients.js";
import supportTicketMessages from "../../db/schema/support/supportTicketMessages.js";
import supportTickets from "../../db/schema/support/supportTickets.js";
import CustomErrorHandler from "../../utils/customErrorHandler.js";
import ResponseHandler from "../../utils/responseHandler.js";

const supportTicketController = {
  // GET TICKETS FOR CLIENT PORTAL
  async getClientTickets(req: Request, res: Response, next: NextFunction) {
    try {
      const clientUserId = req.clientUser?.clientUserId;
      const clientId = req.clientUser?.clientId;

      if (!clientUserId && !clientId) {
        return next(CustomErrorHandler.unAuthorized("Client user context missing"));
      }

      let ticketRecords = await db.query.supportTickets.findMany({
        where: clientId
          ? eq(supportTickets.clientId, clientId)
          : eq(supportTickets.clientUserId, clientUserId!),
        with: {
          messages: {
            orderBy: (msgs, { asc }) => [asc(msgs.createdAt)],
          },
          case: {
            columns: {
              id: true,
              caseNumber: true,
              title: true,
            },
          },
        },
        orderBy: (t, { desc }) => [desc(t.updatedAt)],
      });

      // Format response matching Client Portal interface
      const formattedTickets = ticketRecords.map((t) => ({
        id: t.id,
        ticketNumber: t.ticketNumber,
        subject: t.subject,
        category: t.category,
        priority: t.priority,
        status: t.status,
        caseId: t.caseId || undefined,
        caseNumber: t.case?.caseNumber || undefined,
        createdAt: t.createdAt ? new Date(t.createdAt).toLocaleString() : "",
        updatedAt: t.updatedAt ? new Date(t.updatedAt).toLocaleString() : "",
        messages: (t.messages || []).map((m) => ({
          id: m.id,
          senderName: m.senderName,
          senderRole: m.senderType,
          message: m.message,
          timestamp: m.createdAt ? new Date(m.createdAt).toLocaleString() : "",
        })),
      }));

      return res.status(200).json(
        ResponseHandler(200, "Client support tickets fetched successfully", formattedTickets)
      );
    } catch (error) {
      console.error("Get client tickets error:", error);
      return next(CustomErrorHandler.serverError());
    }
  },

  // GET TICKETS FOR ADVOCATE PORTAL
  async getAdvocateTickets(req: Request, res: Response, next: NextFunction) {
    try {
      const tenantId = req.user?.tenantId;

      if (!tenantId) {
        return next(CustomErrorHandler.unAuthorized("Tenant ID missing"));
      }

      const { status, category, caseId } = req.query;

      let conditions: SQL[] = [eq(supportTickets.tenantId, tenantId)];
      if (status) {
        conditions.push(eq(supportTickets.status, status as string));
      }
      if (category) {
        conditions.push(eq(supportTickets.category, category as string));
      }
      if (caseId) {
        conditions.push(eq(supportTickets.caseId, caseId as string));
      }

      const ticketRecords = await db.query.supportTickets.findMany({
        where: and(...conditions),
        with: {
          messages: {
            orderBy: (msgs, { asc }) => [asc(msgs.createdAt)],
          },
          case: {
            columns: {
              id: true,
              caseNumber: true,
              title: true,
            },
          },
          client: {
            columns: {
              id: true,
              firstName: true,
              lastName: true,
              companyName: true,
              email: true,
            },
          },
        },
        orderBy: (t, { desc }) => [desc(t.updatedAt)],
      });

      const formattedTickets = ticketRecords.map((t) => ({
        id: t.id,
        ticketNumber: t.ticketNumber,
        subject: t.subject,
        category: t.category,
        priority: t.priority,
        status: t.status,
        caseId: t.caseId || undefined,
        caseNumber: t.case?.caseNumber || undefined,
        caseTitle: t.case?.title || undefined,
        clientName: t.client
          ? `${t.client.firstName || ""} ${t.client.lastName || ""}`.trim() || t.client.companyName || "Client"
          : "Client User",
        clientEmail: t.client?.email || undefined,
        createdAt: t.createdAt ? new Date(t.createdAt).toLocaleString() : "",
        updatedAt: t.updatedAt ? new Date(t.updatedAt).toLocaleString() : "",
        messages: (t.messages || []).map((m) => ({
          id: m.id,
          senderName: m.senderName,
          senderRole: m.senderType,
          message: m.message,
          timestamp: m.createdAt ? new Date(m.createdAt).toLocaleString() : "",
        })),
      }));

      return res.status(200).json(
        ResponseHandler(200, "Advocate support tickets fetched successfully", formattedTickets)
      );
    } catch (error) {
      console.error("Get advocate tickets error:", error);
      return next(CustomErrorHandler.serverError());
    }
  },

  // GET TICKET BY ID
  async getTicketById(req: Request, res: Response, next: NextFunction) {
    try {
      const { ticketId } = req.params;

      const ticketRecord = await db.query.supportTickets.findFirst({
        where: eq(supportTickets.id, ticketId),
        with: {
          messages: {
            orderBy: (msgs, { asc }) => [asc(msgs.createdAt)],
          },
          case: true,
          client: true,
        },
      });

      if (!ticketRecord) {
        return next(CustomErrorHandler.notFound("Support ticket not found"));
      }

      return res.status(200).json(
        ResponseHandler(200, "Support ticket fetched successfully", {
          ...ticketRecord,
          messages: (ticketRecord.messages || []).map((m) => ({
            id: m.id,
            senderName: m.senderName,
            senderRole: m.senderType,
            message: m.message,
            timestamp: m.createdAt ? new Date(m.createdAt).toLocaleString() : "",
          })),
        })
      );
    } catch (error) {
      console.error("Get ticket by ID error:", error);
      return next(CustomErrorHandler.serverError());
    }
  },

  // CREATE TICKET (Client or Advocate)
  async createTicket(req: Request, res: Response, next: NextFunction) {
    try {
      const { subject, category, priority, caseId, message } = req.body;

      if (!subject || !message) {
        return next(CustomErrorHandler.badRequest("Subject and initial message are required"));
      }

      let tenantId: string | null = req.user?.tenantId || null;
      let officeId: string | null = null;
      let clientId = req.clientUser?.clientId || null;
      let clientUserId = req.clientUser?.clientUserId || null;

      if (!tenantId && clientId) {
        const clientRecord = await db.query.clients.findFirst({
          where: eq(clients.id, clientId),
          columns: { tenantId: true, officeId: true },
        });
        if (clientRecord) {
          tenantId = clientRecord.tenantId;
          officeId = clientRecord.officeId;
        }
      }

      let senderName = "Client User";
      let senderType = "client";

      if (req.user?.userId) {
        senderType = "advocate";
        senderName = "Legal Desk Team";
      } else if (req.clientUser?.email) {
        senderName = `Client (${req.clientUser.email})`;
      }

      const generatedTicketNo = `TKT-${Math.floor(1000 + Math.random() * 9000)}`;

      const [newTicket] = await db
        .insert(supportTickets)
        .values({
          tenantId,
          officeId,
          clientId,
          clientUserId,
          caseId: caseId || null,
          ticketNumber: generatedTicketNo,
          subject,
          category: category || "general",
          priority: priority || "medium",
          status: "open",
        })
        .returning();

      const [initialMessage] = await db
        .insert(supportTicketMessages)
        .values({
          ticketId: newTicket.id,
          senderType,
          senderId: req.user?.userId || req.clientUser?.clientUserId || null,
          senderName,
          message,
        })
        .returning();

      const formattedTicket = {
        id: newTicket.id,
        ticketNumber: newTicket.ticketNumber,
        subject: newTicket.subject,
        category: newTicket.category,
        priority: newTicket.priority,
        status: newTicket.status,
        caseId: newTicket.caseId || undefined,
        createdAt: new Date().toLocaleString(),
        updatedAt: new Date().toLocaleString(),
        messages: [
          {
            id: initialMessage.id,
            senderName: initialMessage.senderName,
            senderRole: initialMessage.senderType,
            message: initialMessage.message,
            timestamp: new Date().toLocaleString(),
          },
        ],
      };

      return res.status(201).json(
        ResponseHandler(201, "Support ticket created successfully", {
          ticket: formattedTicket,
        })
      );
    } catch (error) {
      console.error("Create ticket error:", error);
      return next(CustomErrorHandler.serverError());
    }
  },

  // REPLY TO TICKET
  async replyTicket(req: Request, res: Response, next: NextFunction) {
    try {
      const { ticketId } = req.params;
      const { message } = req.body;

      if (!message) {
        return next(CustomErrorHandler.badRequest("Reply message text is required"));
      }

      const ticketRecord = await db.query.supportTickets.findFirst({
        where: eq(supportTickets.id, ticketId),
      });

      if (!ticketRecord) {
        return next(CustomErrorHandler.notFound("Support ticket not found"));
      }

      let senderType = "client";
      let senderName = "Client User";

      if (req.user?.userId) {
        senderType = "advocate";
        senderName = "Legal Desk Team";
      } else if (req.clientUser?.email) {
        senderName = `Client (${req.clientUser.email})`;
      }

      const [newMessage] = await db
        .insert(supportTicketMessages)
        .values({
          ticketId,
          senderType,
          senderId: req.user?.userId || req.clientUser?.clientUserId || null,
          senderName,
          message,
        })
        .returning();

      // Update ticket updatedAt and set status to in_progress if open
      const newStatus = ticketRecord.status === "open" ? "in_progress" : ticketRecord.status;
      await db
        .update(supportTickets)
        .set({
          status: newStatus,
          updatedAt: new Date(),
        })
        .where(eq(supportTickets.id, ticketId));

      const allMessages = await db.query.supportTicketMessages.findMany({
        where: eq(supportTicketMessages.ticketId, ticketId),
        orderBy: (msgs, { asc }) => [asc(msgs.createdAt)],
      });

      const formattedTicket = {
        id: ticketRecord.id,
        ticketNumber: ticketRecord.ticketNumber,
        subject: ticketRecord.subject,
        category: ticketRecord.category,
        priority: ticketRecord.priority,
        status: newStatus,
        caseId: ticketRecord.caseId || undefined,
        createdAt: new Date(ticketRecord.createdAt).toLocaleString(),
        updatedAt: new Date().toLocaleString(),
        messages: allMessages.map((m) => ({
          id: m.id,
          senderName: m.senderName,
          senderRole: m.senderType,
          message: m.message,
          timestamp: m.createdAt ? new Date(m.createdAt).toLocaleString() : "",
        })),
      };

      return res.status(200).json(
        ResponseHandler(200, "Support ticket reply sent successfully", {
          ticket: formattedTicket,
        })
      );
    } catch (error) {
      console.error("Reply ticket error:", error);
      return next(CustomErrorHandler.serverError());
    }
  },

  // UPDATE TICKET STATUS (Advocate / Staff)
  async updateTicketStatus(req: Request, res: Response, next: NextFunction) {
    try {
      const { ticketId } = req.params;
      const { status } = req.body;

      if (!status) {
        return next(CustomErrorHandler.badRequest("Ticket status is required"));
      }

      await db
        .update(supportTickets)
        .set({
          status,
          updatedAt: new Date(),
        })
        .where(eq(supportTickets.id, ticketId));

      return res.status(200).json(
        ResponseHandler(200, `Support ticket status updated to ${status}`, {
          ticketId,
          status,
        })
      );
    } catch (error) {
      console.error("Update ticket status error:", error);
      return next(CustomErrorHandler.serverError());
    }
  },
};

export default supportTicketController;
