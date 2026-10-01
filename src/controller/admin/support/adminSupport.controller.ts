import { and, eq, SQL } from "drizzle-orm";
import { NextFunction, Request, Response } from "express";

import db from "../../../db/index.js";
import {
  contactUsMessages,
  supportTicketMessages,
  supportTickets
} from "../../../db/schema/index.js";

import CustomErrorHandler from "../../../utils/customErrorHandler.js";
import ResponseHandler from "../../../utils/responseHandler.js";

const adminSupportController = {
  // =========================================================================
  // GET ALL SUPPORT TICKETS (With Stage & Category Filtering)
  // =========================================================================
  async getSupportTickets(req: Request, res: Response, next: NextFunction) {
    try {
      const { status, priority, category, search } = req.query as {
        status?: string;
        priority?: string;
        category?: string;
        search?: string;
      };

      const conditions: SQL[] = [];
      if (status && status !== "all") {
        conditions.push(eq(supportTickets.status, status));
      }
      if (priority && priority !== "all") {
        conditions.push(eq(supportTickets.priority, priority));
      }
      if (category && category !== "all") {
        conditions.push(eq(supportTickets.category, category));
      }

      const tickets = await db.query.supportTickets.findMany({
        where: conditions.length > 0 ? and(...conditions) : undefined,
        with: {
          tenant: true,
          client: true,
          case: true,
          messages: {
            orderBy: (m, { desc }) => [desc(m.createdAt)],
          },
        },
        orderBy: (t, { desc }) => [desc(t.updatedAt)],
      });

      let formattedTickets = tickets.map((t) => {
        const latestMsg = t.messages?.[0];
        const clientName = t.client
          ? `${t.client.firstName || ""} ${t.client.lastName || ""}`.trim() ||
          t.client.companyName ||
          "Client"
          : "Client User";

        return {
          id: t.id,
          ticketNumber: t.ticketNumber,
          subject: t.subject,
          category: t.category || "general",
          priority: t.priority || "medium",
          status: t.status || "open", // stages: open, in_progress, waiting_client, resolved, closed
          description: latestMsg?.message || t.subject,
          senderName: latestMsg?.senderName || clientName,
          senderEmail: t.client?.email || "user@firm.com",
          senderPhone: t.client?.phone || undefined,
          tenantId: t.tenantId || undefined,
          tenantName: t.tenant?.name || undefined,
          caseId: t.caseId || undefined,
          caseNumber: t.case?.caseNumber || undefined,
          caseTitle: t.case?.title || undefined,
          messagesCount: t.messages?.length || 0,
          latestReplyAt: latestMsg?.createdAt
            ? new Date(latestMsg.createdAt).toISOString()
            : undefined,
          latestSenderType: latestMsg?.senderType || "client",
          createdAt: t.createdAt
            ? new Date(t.createdAt).toISOString()
            : new Date().toISOString(),
          updatedAt: t.updatedAt
            ? new Date(t.updatedAt).toISOString()
            : new Date().toISOString(),
        };
      });

      if (search && search.trim() !== "") {
        const q = search.trim().toLowerCase();
        formattedTickets = formattedTickets.filter(
          (t) =>
            t.ticketNumber.toLowerCase().includes(q) ||
            t.subject.toLowerCase().includes(q) ||
            t.senderName.toLowerCase().includes(q) ||
            t.senderEmail.toLowerCase().includes(q) ||
            (t.tenantName && t.tenantName.toLowerCase().includes(q))
        );
      }

      return res.status(200).json(
        ResponseHandler(200, "Support tickets fetched successfully", formattedTickets)
      );
    } catch (error) {
      console.error("Admin get tickets error:", error);
      return next(CustomErrorHandler.serverError());
    }
  },

  // =========================================================================
  // GET SINGLE TICKET WITH FULL MESSAGE THREAD
  // =========================================================================
  async getTicketById(req: Request, res: Response, next: NextFunction) {
    try {
      const { id } = req.params;

      const ticket = await db.query.supportTickets.findFirst({
        where: eq(supportTickets.id, id),
        with: {
          tenant: true,
          client: true,
          case: true,
          office: true,
          messages: {
            orderBy: (m, { asc }) => [asc(m.createdAt)],
          },
        },
      });

      if (!ticket) {
        return next(CustomErrorHandler.notFound("Support ticket not found"));
      }

      const clientName = ticket.client
        ? `${ticket.client.firstName || ""} ${ticket.client.lastName || ""}`.trim() ||
        ticket.client.companyName ||
        "Client"
        : "Client User";

      const formatted = {
        id: ticket.id,
        ticketNumber: ticket.ticketNumber,
        subject: ticket.subject,
        category: ticket.category || "general",
        priority: ticket.priority || "medium",
        status: ticket.status || "open",
        tenantId: ticket.tenantId,
        tenantName: ticket.tenant?.name,
        clientName,
        clientEmail: ticket.client?.email,
        clientPhone: ticket.client?.phone,
        officeName: ticket.office?.name,
        caseNumber: ticket.case?.caseNumber,
        caseTitle: ticket.case?.title,
        createdAt: ticket.createdAt
          ? new Date(ticket.createdAt).toISOString()
          : new Date().toISOString(),
        updatedAt: ticket.updatedAt
          ? new Date(ticket.updatedAt).toISOString()
          : new Date().toISOString(),
        messages: ticket.messages.map((m) => ({
          id: m.id,
          senderType: m.senderType, // "client" | "staff" | "advocate"
          senderName: m.senderName,
          senderId: m.senderId,
          message: m.message,
          createdAt: m.createdAt
            ? new Date(m.createdAt).toISOString()
            : new Date().toISOString(),
        })),
      };

      return res.status(200).json(
        ResponseHandler(200, "Support ticket dossier fetched", formatted)
      );
    } catch (error) {
      console.error("Admin get ticket detail error:", error);
      return next(CustomErrorHandler.serverError());
    }
  },

  // =========================================================================
  // UPDATE TICKET STAGE & METADATA
  // =========================================================================
  async updateTicketStatus(req: Request, res: Response, next: NextFunction) {
    try {
      const { id } = req.params;
      const { status, priority, category } = req.body;

      const existing = await db.query.supportTickets.findFirst({
        where: eq(supportTickets.id, id),
      });

      if (!existing) {
        return next(CustomErrorHandler.notFound("Support ticket not found"));
      }

      const [updated] = await db
        .update(supportTickets)
        .set({
          ...(status && { status }),
          ...(priority && { priority }),
          ...(category && { category }),
          updatedAt: new Date(),
        })
        .where(eq(supportTickets.id, id))
        .returning();

      return res.status(200).json(
        ResponseHandler(200, `Ticket stage updated to ${status || updated.status}`, updated)
      );
    } catch (error) {
      console.error("Admin update ticket status error:", error);
      return next(CustomErrorHandler.serverError());
    }
  },

  // =========================================================================
  // REPLY TO TICKET (Support Staff / Super Admin Message Resolution)
  // =========================================================================
  async replyTicket(req: Request, res: Response, next: NextFunction) {
    try {
      const { id } = req.params;
      const { message, nextStatus } = req.body;

      if (!message || message.trim() === "") {
        return next(CustomErrorHandler.badRequest("Reply message cannot be empty"));
      }

      const existing = await db.query.supportTickets.findFirst({
        where: eq(supportTickets.id, id),
      });

      if (!existing) {
        return next(CustomErrorHandler.notFound("Support ticket not found"));
      }

      const adminUser = (req as Request & { user?: { id?: string; name?: string } }).user;
      const senderName = adminUser?.name || "Support Specialist";

      // 1. Insert reply message
      const [newMessage] = await db
        .insert(supportTicketMessages)
        .values({
          ticketId: id,
          senderType: "staff",
          senderId: adminUser?.id || null,
          senderName,
          message: message.trim(),
        })
        .returning();

      // 2. Update ticket status / stage if requested or set in_progress if currently open
      const targetStatus =
        nextStatus || (existing.status === "open" ? "in_progress" : existing.status);

      await db
        .update(supportTickets)
        .set({
          status: targetStatus,
          updatedAt: new Date(),
        })
        .where(eq(supportTickets.id, id));

      return res.status(201).json(
        ResponseHandler(201, "Reply posted successfully", newMessage)
      );
    } catch (error) {
      console.error("Admin reply ticket error:", error);
      return next(CustomErrorHandler.serverError());
    }
  },

  // =========================================================================
  // SUPPORT PERFORMANCE & STAGE ANALYTICS (For Super Admin & Team Lead)
  // =========================================================================
  async getSupportStats(req: Request, res: Response, next: NextFunction) {
    try {
      const allTickets = await db.query.supportTickets.findMany({
        orderBy: (t, { desc }) => [desc(t.updatedAt)],
      });

      const total = allTickets.length;
      const pending = allTickets.filter((t) =>
        ["open", "in_progress", "waiting_client", "pending"].includes(t.status || "")
      ).length;
      const solved = allTickets.filter((t) =>
        ["resolved", "closed"].includes(t.status || "")
      ).length;

      const byStage = {
        open: allTickets.filter((t) => (t.status || "open") === "open").length,
        in_progress: allTickets.filter((t) => t.status === "in_progress").length,
        waiting_client: allTickets.filter((t) => t.status === "waiting_client").length,
        resolved: allTickets.filter((t) => t.status === "resolved").length,
        closed: allTickets.filter((t) => t.status === "closed").length,
      };

      const byCategory = {
        billing: allTickets.filter((t) => t.category === "billing").length,
        technical: allTickets.filter((t) => t.category === "technical").length,
        account: allTickets.filter((t) => t.category === "account").length,
        case_management: allTickets.filter((t) => t.category === "case_management").length,
        general: allTickets.filter((t) => !t.category || t.category === "general").length,
      };

      return res.status(200).json(
        ResponseHandler(200, "Support statistics fetched successfully", {
          total,
          pending,
          solved,
          byStage,
          byCategory,
        })
      );
    } catch (error) {
      console.error("Admin get support stats error:", error);
      return next(CustomErrorHandler.serverError());
    }
  },

  // =========================================================================
  // GET CONTACT INQUIRIES
  // =========================================================================
  async getContactInquiries(req: Request, res: Response, next: NextFunction) {
    try {
      const inquiries = await db.query.contactUsMessages.findMany({
        orderBy: (c, { desc }) => [desc(c.createdAt)],
      });

      const formattedInquiries = inquiries.map((c) => ({
        id: c.id,
        name: c.fullName,
        email: c.email,
        phone: c.phone || undefined,
        organization: c.firmName || undefined,
        subject: c.subject,
        message: c.message,
        status: c.status || "pending",
        adminNotes: c.adminNotes || undefined,
        createdAt: c.createdAt
          ? new Date(c.createdAt).toISOString()
          : new Date().toISOString(),
      }));

      return res.status(200).json(
        ResponseHandler(200, "Contact inquiries fetched successfully", formattedInquiries)
      );
    } catch (error) {
      console.error("Admin get contact inquiries error:", error);
      return next(CustomErrorHandler.serverError());
    }
  },

  // =========================================================================
  // UPDATE CONTACT INQUIRY STATUS
  // =========================================================================
  async updateContactInquiryStatus(req: Request, res: Response, next: NextFunction) {
    try {
      const { id } = req.params;
      const { status, adminNotes } = req.body;

      const existing = await db.query.contactUsMessages.findFirst({
        where: eq(contactUsMessages.id, id),
      });

      if (!existing) {
        return next(CustomErrorHandler.notFound("Contact inquiry not found"));
      }

      const [updated] = await db
        .update(contactUsMessages)
        .set({
          ...(status && { status }),
          ...(adminNotes !== undefined && { adminNotes }),
          updatedAt: new Date(),
        })
        .where(eq(contactUsMessages.id, id))
        .returning();

      return res.status(200).json(
        ResponseHandler(200, "Inquiry updated successfully", updated)
      );
    } catch (error) {
      console.error("Admin update inquiry error:", error);
      return next(CustomErrorHandler.serverError());
    }
  },
};

export default adminSupportController;
