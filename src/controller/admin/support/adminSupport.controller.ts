import { and, desc, eq, SQL } from "drizzle-orm";
import { NextFunction, Request, Response } from "express";

import db from "../../../db/index.js";
import {
  contactUsMessages,
  supportTickets,
  supportTicketMessages,
  tenants,
  clients,
} from "../../../db/schema/index.js";

import CustomErrorHandler from "../../../utils/customErrorHandler.js";
import ResponseHandler from "../../../utils/responseHandler.js";

const adminSupportController = {
  // =========================================================================
  // GET ALL SUPPORT TICKETS
  // =========================================================================
  async getSupportTickets(req: Request, res: Response, next: NextFunction) {
    try {
      const { status, priority } = req.query as {
        status?: string;
        priority?: string;
      };

      const conditions: SQL[] = [];
      if (status && status !== "all") {
        conditions.push(eq(supportTickets.status, status));
      }
      if (priority && priority !== "all") {
        conditions.push(eq(supportTickets.priority, priority));
      }

      const tickets = await db.query.supportTickets.findMany({
        where: conditions.length > 0 ? and(...conditions) : undefined,
        with: {
          tenant: true,
          client: true,
          messages: {
            orderBy: (m, { desc }) => [desc(m.createdAt)],
            limit: 1,
          },
        },
        orderBy: (t, { desc }) => [desc(t.updatedAt)],
      });

      const formattedTickets = tickets.map((t) => {
        const latestMsg = t.messages?.[0];
        const clientName = t.client
          ? `${t.client.firstName || ""} ${t.client.lastName || ""}`.trim() || t.client.companyName || "Client"
          : "Client User";

        return {
          id: t.id,
          ticketNumber: t.ticketNumber,
          subject: t.subject,
          description: latestMsg?.message || t.subject,
          senderName: latestMsg?.senderName || clientName,
          senderEmail: t.client?.email || "user@firm.com",
          tenantName: t.tenant?.name || undefined,
          priority: t.priority || "medium",
          status: t.status || "open",
          createdAt: t.createdAt ? new Date(t.createdAt).toISOString() : new Date().toISOString(),
          updatedAt: t.updatedAt ? new Date(t.updatedAt).toISOString() : new Date().toISOString(),
        };
      });

      return res.status(200).json(
        ResponseHandler(200, "Support tickets fetched successfully", formattedTickets)
      );
    } catch (error) {
      console.error("Admin get tickets error:", error);
      return next(CustomErrorHandler.serverError());
    }
  },

  // =========================================================================
  // UPDATE TICKET STATUS
  // =========================================================================
  async updateTicketStatus(req: Request, res: Response, next: NextFunction) {
    try {
      const { id } = req.params;
      const { status } = req.body;

      if (!status) {
        return next(CustomErrorHandler.badRequest("Status is required"));
      }

      const existing = await db.query.supportTickets.findFirst({
        where: eq(supportTickets.id, id),
      });

      if (!existing) {
        return next(CustomErrorHandler.notFound("Support ticket not found"));
      }

      await db
        .update(supportTickets)
        .set({
          status,
          updatedAt: new Date(),
        })
        .where(eq(supportTickets.id, id));

      return res.status(200).json(
        ResponseHandler(200, `Ticket status updated to ${status}`)
      );
    } catch (error) {
      console.error("Admin update ticket status error:", error);
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
        message: c.message,
        status: c.status || "new",
        createdAt: c.createdAt ? new Date(c.createdAt).toISOString() : new Date().toISOString(),
      }));

      return res.status(200).json(
        ResponseHandler(200, "Contact inquiries fetched successfully", formattedInquiries)
      );
    } catch (error) {
      console.error("Admin get contact inquiries error:", error);
      return next(CustomErrorHandler.serverError());
    }
  },
};

export default adminSupportController;
