import { and, asc, desc, eq, isNotNull, isNull, SQL } from "drizzle-orm";
import { NextFunction, Request, Response } from "express";

import db from "../../../db/index.js";
import {
  contactUsMessages,
  supportCallLogs,
  supportTicketMessages,
  supportTickets,
  user,
} from "../../../db/schema/index.js";

import CustomErrorHandler from "../../../utils/customErrorHandler.js";
import ResponseHandler from "../../../utils/responseHandler.js";
import { sendContactInquiryReplyEmail } from "../../../services/contactInquiryReplyEmail.service.js";
import { createClientNotification } from "../../../services/notification.service.js";
import { aiSupportService } from "../../../services/aiSupport.service.js";
import {
  emitTicketMessage,
  emitTicketUpdated,
  emitTicketClosed,
} from "../../../socket/socket.service.js";
import {
  findOptimalOnlineSupportAgent,
  assignPendingEscalatedTicketsToAgent,
} from "../../../helpers/supportTicket.helper.js";

const adminSupportController = {
  // =========================================================================
  // GET ALL SUPPORT TICKETS (With Stage, Category, & Assignee Filtering)
  // Excludes private chamber case inquiries so they stay strictly within chamber desks
  // =========================================================================
  async getSupportTickets(req: Request, res: Response, next: NextFunction) {
    try {
      const { status, priority, category, search, assignedTo } = req.query as {
        status?: string;
        priority?: string;
        category?: string;
        search?: string;
        assignedTo?: string; // "me" | "unassigned" | "all" | uuid
      };

      const adminUser = (req as Request & { user?: { id?: string; name?: string } }).user;

      const conditions: SQL[] = [
        isNull(supportTickets.caseId),
        isNull(supportTickets.clientId),
        isNull(supportTickets.clientUserId),
      ];
      if (status && status !== "all") {
        conditions.push(eq(supportTickets.status, status));
      }
      if (priority && priority !== "all") {
        conditions.push(eq(supportTickets.priority, priority));
      }
      if (category && category !== "all") {
        conditions.push(eq(supportTickets.category, category));
      }

      // Assignee filtering
      if (assignedTo === "me" && adminUser?.id) {
        conditions.push(eq(supportTickets.assignedToUserId, adminUser.id));
      } else if (assignedTo === "unassigned") {
        conditions.push(isNull(supportTickets.assignedToUserId));
      } else if (
        assignedTo &&
        assignedTo !== "all" &&
        assignedTo !== "me" &&
        assignedTo !== "unassigned"
      ) {
        conditions.push(eq(supportTickets.assignedToUserId, assignedTo));
      }

      const tickets = await db.query.supportTickets.findMany({
        where: and(...conditions),
        with: {
          tenant: true,
          office: true,
          assignedToUser: {
            columns: {
              id: true,
              name: true,
              email: true,
              phone: true,
            },
          },
          callLogs: {
            with: {
              agent: {
                columns: {
                  id: true,
                  name: true,
                },
              },
            },
            orderBy: (c, { desc }) => [desc(c.createdAt)],
          },
          messages: {
            orderBy: (m, { desc }) => [desc(m.createdAt)],
          },
        },
        orderBy: (t, { desc }) => [desc(t.updatedAt)],
      });

      let formattedTickets = tickets.map((t) => {
        const latestMsg = t.messages?.[0];
        const advocateFirmName = t.tenant?.name || "Advocate Law Firm";

        // Calculate First Response Time in minutes (if replied)
        let firstResponseMinutes: number | null = null;
        if (t.firstResponseAt && t.createdAt) {
          firstResponseMinutes = Math.max(
            0,
            Math.round(
              (new Date(t.firstResponseAt).getTime() - new Date(t.createdAt).getTime()) /
                (1000 * 60)
            )
          );
        }

        // SLA Status check (Target FRT: < 120 mins)
        let slaStatus: "healthy" | "warning" | "breached" = "healthy";
        const hoursOpen =
          (Date.now() - new Date(t.createdAt).getTime()) / (1000 * 60 * 60);

        if (!t.firstResponseAt && t.status !== "resolved" && t.status !== "closed") {
          if (hoursOpen >= 4) {
            slaStatus = "breached";
          } else if (hoursOpen >= 2) {
            slaStatus = "warning";
          }
        } else if (firstResponseMinutes && firstResponseMinutes > 120) {
          slaStatus = "breached";
        }

        return {
          id: t.id,
          ticketNumber: t.ticketNumber,
          subject: t.subject,
          category: t.category || "general",
          priority: t.priority || "medium",
          status: t.status || "open", // stages: open, in_progress, waiting_client, resolved, closed
          description: latestMsg?.message || t.subject,
          senderName: t.tenant?.name || latestMsg?.senderName || advocateFirmName,
          senderEmail: t.tenant?.organisationEmail || undefined,
          senderPhone: t.tenant?.organisationPhone || undefined,
          tenantId: t.tenantId || undefined,
          tenantName: t.tenant?.name || undefined,
          caseId: undefined,
          caseNumber: undefined,
          caseTitle: undefined,
          messagesCount: t.messages?.length || 0,
          latestReplyAt: latestMsg?.createdAt
            ? new Date(latestMsg.createdAt).toISOString()
            : undefined,
          latestSenderType: latestMsg?.senderType || "advocate",
          assignedToUserId: t.assignedToUserId || null,
          assignedAt: t.assignedAt ? new Date(t.assignedAt).toISOString() : null,
          assignedToUser: t.assignedToUser || null,
          firstResponseAt: t.firstResponseAt
            ? new Date(t.firstResponseAt).toISOString()
            : null,
          firstResponseMinutes,
          resolvedAt: t.resolvedAt ? new Date(t.resolvedAt).toISOString() : null,
          slaStatus,
          csatRating: t.csatRating || null,
          csatFeedback: t.csatFeedback || null,
          csatRatedAt: t.csatRatedAt ? new Date(t.csatRatedAt).toISOString() : null,
          callLogsCount: t.callLogs?.length || 0,
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
            t.description.toLowerCase().includes(q) ||
            (t.senderName && t.senderName.toLowerCase().includes(q)) ||
            (t.senderEmail && t.senderEmail.toLowerCase().includes(q)) ||
            (t.tenantName && t.tenantName.toLowerCase().includes(q)) ||
            (t.assignedToUser?.name && t.assignedToUser.name.toLowerCase().includes(q))
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
  // GET SINGLE TICKET WITH FULL MESSAGE THREAD & CALL LOGS
  // =========================================================================
  async getTicketById(req: Request, res: Response, next: NextFunction) {
    try {
      const { id } = req.params;

      const ticket = await db.query.supportTickets.findFirst({
        where: and(
          eq(supportTickets.id, id),
          isNull(supportTickets.caseId),
          isNull(supportTickets.clientId),
          isNull(supportTickets.clientUserId)
        ),
        with: {
          tenant: true,
          office: true,
          assignedToUser: {
            columns: {
              id: true,
              name: true,
              email: true,
              phone: true,
            },
          },
          callLogs: {
            with: {
              agent: {
                columns: {
                  id: true,
                  name: true,
                  email: true,
                },
              },
            },
            orderBy: (c, { desc }) => [desc(c.createdAt)],
          },
          messages: {
            orderBy: (m, { asc }) => [asc(m.createdAt)],
          },
        },
      });

      if (!ticket) {
        return next(CustomErrorHandler.notFound("Support ticket not found"));
      }

      const advocateFirmName = ticket.tenant?.name || "Advocate Law Firm";

      const formatted = {
        id: ticket.id,
        ticketNumber: ticket.ticketNumber,
        subject: ticket.subject,
        category: ticket.category || "general",
        priority: ticket.priority || "medium",
        status: ticket.status || "open",
        tenantId: ticket.tenantId,
        tenantName: ticket.tenant?.name,
        clientName: advocateFirmName,
        clientEmail: ticket.tenant?.organisationEmail,
        clientPhone: ticket.tenant?.organisationPhone,
        officeName: ticket.office?.name,
        caseNumber: undefined,
        caseTitle: undefined,
        assignedToUserId: ticket.assignedToUserId || null,
        assignedAt: ticket.assignedAt ? new Date(ticket.assignedAt).toISOString() : null,
        assignedToUser: ticket.assignedToUser || null,
        firstResponseAt: ticket.firstResponseAt
          ? new Date(ticket.firstResponseAt).toISOString()
          : null,
        resolvedAt: ticket.resolvedAt ? new Date(ticket.resolvedAt).toISOString() : null,
        csatRating: ticket.csatRating || null,
        csatFeedback: ticket.csatFeedback || null,
        csatRatedAt: ticket.csatRatedAt ? new Date(ticket.csatRatedAt).toISOString() : null,
        createdAt: ticket.createdAt
          ? new Date(ticket.createdAt).toISOString()
          : new Date().toISOString(),
        updatedAt: ticket.updatedAt
          ? new Date(ticket.updatedAt).toISOString()
          : new Date().toISOString(),
        callLogs: ticket.callLogs.map((c) => ({
          id: c.id,
          callType: c.callType,
          durationMinutes: c.durationMinutes,
          callerNumber: c.callerNumber,
          outcome: c.outcome,
          notes: c.notes,
          agentName: c.agent?.name || "Agent",
          agentEmail: c.agent?.email || "",
          createdAt: new Date(c.createdAt).toISOString(),
        })),
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
  // ASSIGN TICKET TO AGENT (OR UNASSIGN / RETURN TO POOL)
  // =========================================================================
  async assignTicket(req: Request, res: Response, next: NextFunction) {
    try {
      const { id } = req.params;
      const { assignedToUserId } = req.body as { assignedToUserId: string | null };

      const existing = await db.query.supportTickets.findFirst({
        where: eq(supportTickets.id, id),
      });

      if (!existing) {
        return next(CustomErrorHandler.notFound("Support ticket not found"));
      }

      let agentName = "Unassigned";
      if (assignedToUserId) {
        const agent = await db.query.user.findFirst({
          where: eq(user.id, assignedToUserId),
          columns: { id: true, name: true, email: true },
        });
        if (!agent) {
          return next(CustomErrorHandler.badRequest("Selected agent user does not exist"));
        }
        agentName = agent.name;
      }

      const [updated] = await db
        .update(supportTickets)
        .set({
          assignedToUserId: assignedToUserId || null,
          assignedAt: assignedToUserId ? new Date() : null,
          updatedAt: new Date(),
        })
        .where(eq(supportTickets.id, id))
        .returning();

      // Append system message in ticket timeline
      const adminUser = (req as Request & { user?: { id?: string; name?: string } }).user;
      await db.insert(supportTicketMessages).values({
        ticketId: id,
        senderType: "staff",
        senderId: adminUser?.id || null,
        senderName: "System",
        message: assignedToUserId
          ? `Ticket assigned to ${agentName}.`
          : "Ticket marked unassigned and returned to queue pool.",
      });

      emitTicketUpdated(id, {
        assignedToUserId,
        assignedToUser: assignedToUserId ? { id: assignedToUserId, name: agentName } : null,
        status: assignedToUserId ? "in_progress" : "open",
      });

      return res.status(200).json(
        ResponseHandler(200, `Ticket successfully assigned to ${agentName}`, updated)
      );
    } catch (error) {
      console.error("Admin assign ticket error:", error);
      return next(CustomErrorHandler.serverError());
    }
  },

  // =========================================================================
  // LOG VOICE / CALL SUPPORT RECORD
  // =========================================================================
  async logCall(req: Request, res: Response, next: NextFunction) {
    try {
      const { id } = req.params;
      const { callType, durationMinutes, callerNumber, outcome, notes } = req.body as {
        callType?: string;
        durationMinutes?: number;
        callerNumber?: string;
        outcome?: string;
        notes?: string;
      };

      if (!notes || notes.trim() === "") {
        return next(CustomErrorHandler.badRequest("Call notes cannot be empty"));
      }

      const existing = await db.query.supportTickets.findFirst({
        where: eq(supportTickets.id, id),
      });

      if (!existing) {
        return next(CustomErrorHandler.notFound("Support ticket not found"));
      }

      const adminUser = (req as Request & { user?: { id?: string; name?: string } }).user;
      const agentId = adminUser?.id;

      if (!agentId) {
        return next(CustomErrorHandler.unAuthorized("Agent user context missing"));
      }

      const [callLog] = await db
        .insert(supportCallLogs)
        .values({
          ticketId: id,
          tenantId: existing.tenantId || null,
          agentId,
          callType: callType || "outbound",
          durationMinutes: Number(durationMinutes) || 0,
          callerNumber: callerNumber?.trim() || null,
          outcome: outcome || "resolved_on_call",
          notes: notes.trim(),
        })
        .returning();

      // Append call summary note into message timeline
      const callTypeLabel = callType === "inbound" ? "Inbound Call" : "Outbound Call";
      await db.insert(supportTicketMessages).values({
        ticketId: id,
        senderType: "staff",
        senderId: agentId,
        senderName: adminUser?.name || "Support Rep",
        message: `📞 [${callTypeLabel}] Duration: ${durationMinutes || 0}m | Outcome: ${outcome || "Logged"}\nNotes: ${notes.trim()}`,
      });

      // Touch ticket updatedAt
      await db
        .update(supportTickets)
        .set({ updatedAt: new Date() })
        .where(eq(supportTickets.id, id));

      return res.status(201).json(
        ResponseHandler(201, "Call logged successfully", callLog)
      );
    } catch (error) {
      console.error("Admin log call error:", error);
      return next(CustomErrorHandler.serverError());
    }
  },

  // =========================================================================
  // GET CALL LOGS FOR TICKET
  // =========================================================================
  async getCallLogs(req: Request, res: Response, next: NextFunction) {
    try {
      const { id } = req.params;

      const logs = await db.query.supportCallLogs.findMany({
        where: eq(supportCallLogs.ticketId, id),
        with: {
          agent: {
            columns: {
              id: true,
              name: true,
              email: true,
            },
          },
        },
        orderBy: (c, { desc }) => [desc(c.createdAt)],
      });

      return res.status(200).json(
        ResponseHandler(200, "Call logs fetched successfully", logs)
      );
    } catch (error) {
      console.error("Admin get call logs error:", error);
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

      const isResolving = status === "resolved" || status === "closed";

      const [updated] = await db
        .update(supportTickets)
        .set({
          ...(status && { status }),
          ...(priority && { priority }),
          ...(category && { category }),
          ...(isResolving && !existing.resolvedAt && { resolvedAt: new Date() }),
          updatedAt: new Date(),
        })
        .where(eq(supportTickets.id, id))
        .returning();

      emitTicketUpdated(id, { status: updated.status, priority: updated.priority, category: updated.category });
      if (updated.status === "closed" || updated.status === "resolved") {
        emitTicketClosed(id);
      }

      const targetClientId = existing.clientId || existing.clientUserId;
      if (targetClientId && status && existing.status !== status) {
        const formatStatus = (s: string) =>
          s.replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());

        const statusLabel = formatStatus(status);
        const statusMessage =
          status === "closed"
            ? `Your support ticket #${existing.ticketNumber} has been resolved and closed.`
            : `Your support ticket #${existing.ticketNumber} status has been updated to "${statusLabel}".`;
        const ticketUrl = `/support?ticketId=${existing.id}`;

        createClientNotification({
          tenantId: existing.tenantId || null,
          officeId: existing.officeId,
          caseId: existing.caseId,
          clientId: targetClientId,
          channel: "push",
          title: `Ticket #${existing.ticketNumber} Status: ${statusLabel}`,
          message: statusMessage,
          link: ticketUrl,
          actionUrl: ticketUrl,
          payload: {
            ticketId: existing.id,
            ticketNumber: existing.ticketNumber,
            type: "support_status",
            status,
            link: ticketUrl,
            actionUrl: ticketUrl,
            actionLabel: "View Ticket",
          },
        }).catch((err) =>
          console.error("Failed to send admin status push notification:", err)
        );
      }

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

      const adminUserId = req.adminUser?.userId || req.user?.userId;
      let senderName = req.adminUser?.name || req.user?.name;
      if (!senderName && adminUserId) {
        const staffRecord = await db.query.user.findFirst({
          where: eq(user.id, adminUserId),
          columns: { name: true, email: true },
        });
        if (staffRecord?.name) {
          senderName = staffRecord.name;
        }
      }
      senderName = senderName || "Support Specialist";

      // 1. Insert reply message
      const [newMessage] = await db
        .insert(supportTicketMessages)
        .values({
          ticketId: id,
          senderType: "staff",
          senderId: adminUserId || null,
          senderName,
          message: message.trim(),
        })
        .returning();

      // Broadcast message to socket room
      emitTicketMessage(id, newMessage);

      // 2. Update ticket status / stage and record firstResponseAt if this is first staff response
      const targetStatus =
        nextStatus || (existing.status === "open" ? "in_progress" : existing.status);
      const isResolving = targetStatus === "resolved" || targetStatus === "closed";

      await db
        .update(supportTickets)
        .set({
          status: targetStatus,
          ...(!existing.firstResponseAt && { firstResponseAt: new Date() }),
          ...(isResolving && !existing.resolvedAt && { resolvedAt: new Date() }),
          updatedAt: new Date(),
        })
        .where(eq(supportTickets.id, id));

      emitTicketUpdated(id, { status: targetStatus });
      if (isResolving || targetStatus === "closed") {
        emitTicketClosed(id);
      }

      // Trigger push notification to client
      const targetClientId = existing.clientId || existing.clientUserId;
      if (targetClientId) {
        const messagePreview =
          message.length > 80 ? `${message.substring(0, 77)}...` : message;
        const ticketUrl = `/support?ticketId=${existing.id}`;

        createClientNotification({
          tenantId: existing.tenantId || null,
          officeId: existing.officeId,
          caseId: existing.caseId,
          clientId: targetClientId,
          channel: "push",
          title: `Response on Ticket #${existing.ticketNumber}`,
          message: `${senderName}: "${messagePreview}"`,
          link: ticketUrl,
          actionUrl: ticketUrl,
          payload: {
            ticketId: existing.id,
            ticketNumber: existing.ticketNumber,
            type: "support_reply",
            senderName,
            link: ticketUrl,
            actionUrl: ticketUrl,
            actionLabel: "View Ticket",
          },
        }).catch((err) =>
          console.error("Failed to send admin reply push notification:", err)
        );
      }

      return res.status(201).json(
        ResponseHandler(201, "Reply posted successfully", newMessage)
      );
    } catch (error) {
      console.error("Admin reply ticket error:", error);
      return next(CustomErrorHandler.serverError());
    }
  },

  // =========================================================================
  // GET LIST OF INTERNAL SUPPORT AGENTS (For Assignment Dropdowns)
  // =========================================================================
  async getSupportAgents(req: Request, res: Response, next: NextFunction) {
    try {
      const allUsers = await db.query.user.findMany({
        where: and(
          eq(user.isSupportAgent, true),
          eq(user.status, "active"),
          isNull(user.deletedAt)
        ),
        columns: {
          id: true,
          name: true,
          email: true,
          phone: true,
          lastActiveAt: true,
          supportAvailability: true,
          isSupportAgent: true,
        },
        orderBy: [asc(user.name)],
      });

      // Calculate active open tickets per agent
      const activeTickets = await db.query.supportTickets.findMany({
        where: and(
          isNull(supportTickets.caseId),
          isNull(supportTickets.clientId),
          isNull(supportTickets.clientUserId),
          isNotNull(supportTickets.assignedToUserId)
        ),
        columns: {
          id: true,
          assignedToUserId: true,
          status: true,
        },
      });

      const activeCounts: Record<string, number> = {};
      for (const t of activeTickets) {
        if (
          t.assignedToUserId &&
          t.status !== "closed" &&
          t.status !== "resolved"
        ) {
          activeCounts[t.assignedToUserId] =
            (activeCounts[t.assignedToUserId] || 0) + 1;
        }
      }

      const now = Date.now();
      const ONLINE_THRESHOLD_MS = 2.5 * 60 * 1000; // 2.5 minutes

      interface AgentUserRecord {
        id: string;
        name: string;
        email: string;
        phone?: string | null;
        lastActiveAt?: Date | null;
        supportAvailability?: string | null;
      }

      const agentsWithCounts = (allUsers as AgentUserRecord[]).map((u) => {
        const lastActiveTime = u.lastActiveAt ? new Date(u.lastActiveAt).getTime() : 0;
        const isRecentlyActive = u.lastActiveAt ? now - lastActiveTime <= ONLINE_THRESHOLD_MS : false;
        const isOnline = isRecentlyActive && u.supportAvailability !== "offline";

        return {
          id: u.id,
          name: u.name,
          email: u.email,
          phone: u.phone,
          lastActiveAt: u.lastActiveAt,
          supportAvailability: u.supportAvailability || "online",
          isOnline,
          activeTicketsCount: activeCounts[u.id] || 0,
        };
      });

      return res.status(200).json(
        ResponseHandler(200, "Support agents fetched successfully", agentsWithCounts)
      );
    } catch (error) {
      console.error("Admin get support agents error:", error);
      return next(CustomErrorHandler.serverError());
    }
  },

  // =========================================================================
  // SUPPORT PERFORMANCE & STAGE ANALYTICS (Overview + Quick Counts)
  // =========================================================================
  async getSupportStats(req: Request, res: Response, next: NextFunction) {
    try {
      const allTickets = await db.query.supportTickets.findMany({
        where: and(
          isNull(supportTickets.caseId),
          isNull(supportTickets.clientId),
          isNull(supportTickets.clientUserId)
        ),
        orderBy: (t, { desc }) => [desc(t.updatedAt)],
      });

      const total = allTickets.length;
      const pending = allTickets.filter((t) =>
        ["open", "in_progress", "waiting_client", "pending"].includes(t.status || "")
      ).length;
      const solved = allTickets.filter((t) =>
        ["resolved", "closed"].includes(t.status || "")
      ).length;

      const unassigned = allTickets.filter(
        (t) =>
          !t.assignedToUserId &&
          ["open", "in_progress", "waiting_client"].includes(t.status || "")
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
          unassigned,
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
  // MANAGER CRM ANALYTICS: SLA, CSAT, & AGENT LEADERBOARD
  // =========================================================================
  async getSupportAnalytics(req: Request, res: Response, next: NextFunction) {
    try {
      const tickets = await db.query.supportTickets.findMany({
        where: and(
          isNull(supportTickets.caseId),
          isNull(supportTickets.clientId),
          isNull(supportTickets.clientUserId)
        ),
        with: {
          assignedToUser: {
            columns: {
              id: true,
              name: true,
              email: true,
            },
          },
          callLogs: true,
        },
      });

      // 1. Overall Metric Calculations
      let totalFirstResponseMinutes = 0;
      let ticketsWithFirstResponse = 0;
      let totalResolutionHours = 0;
      let resolvedTicketsCount = 0;
      let totalCsatSum = 0;
      let csatRatedCount = 0;
      let slasBreachedCount = 0;

      const csatBreakdown: Record<number, number> = { 1: 0, 2: 0, 3: 0, 4: 0, 5: 0 };

      // Map by agent id
      const agentMap: Record<
        string,
        {
          id: string;
          name: string;
          email: string;
          assignedCount: number;
          openCount: number;
          resolvedCount: number;
          firstResponseSum: number;
          firstResponseCount: number;
          csatSum: number;
          csatCount: number;
          callsCount: number;
          callDurationMinutes: number;
        }
      > = {};

      for (const t of tickets) {
        // FRT calculation
        if (t.firstResponseAt && t.createdAt) {
          const frtMins = Math.max(
            0,
            Math.round(
              (new Date(t.firstResponseAt).getTime() - new Date(t.createdAt).getTime()) /
                (1000 * 60)
            )
          );
          totalFirstResponseMinutes += frtMins;
          ticketsWithFirstResponse++;
        }

        // Resolution Time calculation
        if (t.resolvedAt && t.createdAt) {
          const resHours = Math.max(
            0,
            (new Date(t.resolvedAt).getTime() - new Date(t.createdAt).getTime()) /
              (1000 * 60 * 60)
          );
          totalResolutionHours += resHours;
          resolvedTicketsCount++;
        }

        // CSAT calculation
        if (t.csatRating && t.csatRating >= 1 && t.csatRating <= 5) {
          totalCsatSum += t.csatRating;
          csatRatedCount++;
          csatBreakdown[t.csatRating] = (csatBreakdown[t.csatRating] || 0) + 1;
        }

        // SLA Breach calculation (> 4 hours with no first response while open, or FRT > 120 mins)
        const hoursOpen =
          (Date.now() - new Date(t.createdAt).getTime()) / (1000 * 60 * 60);
        if (
          (!t.firstResponseAt &&
            t.status !== "resolved" &&
            t.status !== "closed" &&
            hoursOpen > 4) ||
          (t.firstResponseAt &&
            new Date(t.firstResponseAt).getTime() - new Date(t.createdAt).getTime() >
              120 * 60 * 1000)
        ) {
          slasBreachedCount++;
        }

        // Agent aggregation
        if (t.assignedToUser) {
          const aid = t.assignedToUser.id;
          if (!agentMap[aid]) {
            agentMap[aid] = {
              id: aid,
              name: t.assignedToUser.name,
              email: t.assignedToUser.email,
              assignedCount: 0,
              openCount: 0,
              resolvedCount: 0,
              firstResponseSum: 0,
              firstResponseCount: 0,
              csatSum: 0,
              csatCount: 0,
              callsCount: 0,
              callDurationMinutes: 0,
            };
          }

          agentMap[aid].assignedCount++;
          if (t.status === "resolved" || t.status === "closed") {
            agentMap[aid].resolvedCount++;
          } else {
            agentMap[aid].openCount++;
          }

          if (t.firstResponseAt && t.createdAt) {
            const frt = Math.max(
              0,
              Math.round(
                (new Date(t.firstResponseAt).getTime() - new Date(t.createdAt).getTime()) /
                  (1000 * 60)
              )
            );
            agentMap[aid].firstResponseSum += frt;
            agentMap[aid].firstResponseCount++;
          }

          if (t.csatRating) {
            agentMap[aid].csatSum += t.csatRating;
            agentMap[aid].csatCount++;
          }

          if (t.callLogs && t.callLogs.length > 0) {
            agentMap[aid].callsCount += t.callLogs.length;
            agentMap[aid].callDurationMinutes += t.callLogs.reduce(
              (acc, c) => acc + (c.durationMinutes || 0),
              0
            );
          }
        }
      }

      // Format agent leaderboard
      const agentLeaderboard = Object.values(agentMap)
        .map((a) => ({
          id: a.id,
          name: a.name,
          email: a.email,
          assignedCount: a.assignedCount,
          openCount: a.openCount,
          resolvedCount: a.resolvedCount,
          avgFirstResponseMinutes:
            a.firstResponseCount > 0
              ? Math.round(a.firstResponseSum / a.firstResponseCount)
              : null,
          avgCsat:
            a.csatCount > 0
              ? Number((a.csatSum / a.csatCount).toFixed(1))
              : null,
          totalCsatRatings: a.csatCount,
          callsCount: a.callsCount,
          callDurationMinutes: a.callDurationMinutes,
        }))
        .sort((a, b) => b.resolvedCount - a.resolvedCount);

      const overview = {
        totalTickets: tickets.length,
        openTickets: tickets.filter((t) => t.status !== "resolved" && t.status !== "closed")
          .length,
        resolvedTickets: resolvedTicketsCount,
        avgFirstResponseMinutes:
          ticketsWithFirstResponse > 0
            ? Math.round(totalFirstResponseMinutes / ticketsWithFirstResponse)
            : 0,
        avgResolutionHours:
          resolvedTicketsCount > 0
            ? Number((totalResolutionHours / resolvedTicketsCount).toFixed(1))
            : 0,
        avgCsatRating:
          csatRatedCount > 0 ? Number((totalCsatSum / csatRatedCount).toFixed(2)) : 5.0,
        totalCsatResponses: csatRatedCount,
        slasBreached: slasBreachedCount,
      };

      return res.status(200).json(
        ResponseHandler(200, "Support analytics dossier fetched successfully", {
          overview,
          agentLeaderboard,
          csatBreakdown,
        })
      );
    } catch (error) {
      console.error("Admin get support analytics error:", error);
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
        role: c.role || undefined,
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

  // =========================================================================
  // REPLY TO CONTACT INQUIRY VIA EMAIL
  // =========================================================================
  async replyContactInquiry(req: Request, res: Response, next: NextFunction) {
    try {
      const { id } = req.params;
      const { subject, message, nextStatus } = req.body;

      if (!message || message.trim() === "") {
        return next(CustomErrorHandler.badRequest("Reply message cannot be empty"));
      }

      const existing = await db.query.contactUsMessages.findFirst({
        where: eq(contactUsMessages.id, id),
      });

      if (!existing) {
        return next(CustomErrorHandler.notFound("Contact inquiry not found"));
      }

      const adminUser =
        (req as Request & { adminUser?: { name?: string } }).adminUser ||
        (req as Request & { user?: { name?: string } }).user;
      const adminName = adminUser?.name || "MI Law Support Specialist";

      const mailSubject = subject?.trim() || `Re: ${existing.subject || "MI Law Inquiry"}`;

      // 1. Dispatch email
      const emailSent = await sendContactInquiryReplyEmail({
        recipientName: existing.fullName,
        recipientEmail: existing.email,
        subject: mailSubject,
        replyMessage: message.trim(),
        originalMessage: existing.message,
        originalSubject: existing.subject,
        adminName,
      });

      // 2. Prepare timestamped note
      const dateStr = new Date().toLocaleDateString("en-IN", {
        day: "numeric",
        month: "short",
        year: "numeric",
        hour: "2-digit",
        minute: "2-digit",
      });
      const noteAppend = `[Email Sent on ${dateStr} by ${adminName}]: "${message.trim()}"`;
      const updatedNotes = existing.adminNotes
        ? `${existing.adminNotes}\n\n${noteAppend}`
        : noteAppend;

      const targetStatus = nextStatus || "contacted";

      // 3. Update database record
      const [updated] = await db
        .update(contactUsMessages)
        .set({
          status: targetStatus,
          adminNotes: updatedNotes,
          updatedAt: new Date(),
        })
        .where(eq(contactUsMessages.id, id))
        .returning();

      return res.status(200).json(
        ResponseHandler(200, "Email reply sent successfully", {
          inquiry: updated,
          emailSent,
        })
      );
    } catch (error) {
      console.error("Admin reply contact inquiry error:", error);
      return next(CustomErrorHandler.serverError());
    }
  },

  // =========================================================================
  // AGENT HEARTBEAT & PRESENCE TRACKING
  // Lightweight ping sent by open tabs every 60s
  // =========================================================================
  async recordHeartbeat(req: Request, res: Response, next: NextFunction) {
    try {
      const adminUser = (req as Request & { user?: { id?: string; userId?: string } }).user;
      const targetUserId = adminUser?.id || adminUser?.userId;

      if (!targetUserId) {
        return next(CustomErrorHandler.unAuthorized("User context missing"));
      }

      const updateData: { lastActiveAt: Date; supportAvailability?: string } = {
        lastActiveAt: new Date(),
      };

      if (req.body?.availability) {
        updateData.supportAvailability = req.body.availability;
      }

      await db
        .update(user)
        .set(updateData)
        .where(eq(user.id, targetUserId));

      return res.status(200).json(
        ResponseHandler(200, "Heartbeat recorded", {
          isOnline: true,
          lastActiveAt: updateData.lastActiveAt,
          availability: req.body?.availability || "online",
        })
      );
    } catch (error) {
      console.error("Agent heartbeat error:", error);
      return next(CustomErrorHandler.serverError());
    }
  },

  // =========================================================================
  // UPDATE SUPPORT AVAILABILITY STATUS (online | busy | away | offline)
  // =========================================================================
  async updateAgentAvailability(req: Request, res: Response, next: NextFunction) {
    try {
      const adminUser = (req as Request & { user?: { id?: string; userId?: string } }).user;
      const targetUserId = adminUser?.id || adminUser?.userId;
      const { availability } = req.body as { availability: string };

      if (!targetUserId) {
        return next(CustomErrorHandler.unAuthorized("User context missing"));
      }

      if (!["online", "busy", "away", "offline"].includes(availability)) {
        return next(CustomErrorHandler.badRequest("Invalid availability status"));
      }

      const [updated] = await db
        .update(user)
        .set({
          supportAvailability: availability,
          lastActiveAt: new Date(),
        })
        .where(eq(user.id, targetUserId))
        .returning({
          id: user.id,
          name: user.name,
          availability: user.supportAvailability,
          lastActiveAt: user.lastActiveAt,
        });

      if (availability === "online") {
        await assignPendingEscalatedTicketsToAgent({
          id: updated.id,
          name: updated.name,
        }).catch((err) => console.error("Auto assign pending escalated tickets error:", err));
      }

      return res.status(200).json(
        ResponseHandler(200, "Availability status updated successfully", updated)
      );
    } catch (error) {
      console.error("Update availability status error:", error);
      return next(CustomErrorHandler.serverError());
    }
  },

  // =========================================================================
  // AUTOMATED TICKET ASSIGNMENT TO LEAST BUSY ONLINE AGENT
  // =========================================================================
  async autoAssignTicket(req: Request, res: Response, next: NextFunction) {
    try {
      const { id } = req.params;

      const ticketRecord = await db.query.supportTickets.findFirst({
        where: eq(supportTickets.id, id),
      });

      if (!ticketRecord) {
        return next(CustomErrorHandler.notFound("Support ticket not found"));
      }

      // 1. Find optimal online agent
      const optimalAgent = await findOptimalOnlineSupportAgent();

      if (!optimalAgent) {
        return res.status(200).json(
          ResponseHandler(200, "No support agents currently online. Ticket remains in unassigned queue.", {
            assigned: false,
            ticket: ticketRecord,
          })
        );
      }

      // 2. Delegate ticket to the optimal agent
      const [updatedTicket] = await db
        .update(supportTickets)
        .set({
          assignedToUserId: optimalAgent.id,
          assignedAt: new Date(),
          status: ticketRecord.status === "open" ? "in_progress" : ticketRecord.status,
          updatedAt: new Date(),
        })
        .where(eq(supportTickets.id, id))
        .returning();

      return res.status(200).json(
        ResponseHandler(200, `Ticket automatically assigned to online specialist ${optimalAgent.name}`, {
          assigned: true,
          assignedTo: optimalAgent,
          ticket: updatedTicket,
        })
      );
    } catch (error) {
      console.error("Auto-assign ticket error:", error);
      return next(CustomErrorHandler.serverError());
    }
  },

  // =========================================================================
  // AI SUPPORT CHAT ASSISTANCE & ESCALATION CONTROLLER
  // =========================================================================
  async handleAiSupportChat(req: Request, res: Response, next: NextFunction) {
    try {
      const { history = [], message, ticketId } = req.body as {
        history?: { role: "system" | "user" | "assistant"; content: string }[];
        message: string;
        ticketId?: string;
      };

      if (!message || !message.trim()) {
        return next(CustomErrorHandler.badRequest("Message is required"));
      }

      // 1. Call AI Support Service
      const aiResult = await aiSupportService.processSupportChat(history, message.trim());

      let assignedAgent: { id: string; name: string; email: string } | null = null;
      let ticketRef: Record<string, unknown> | null = null;

      // 2. If escalated, find an online agent and assign
      if (aiResult.isEscalated) {
        assignedAgent = await findOptimalOnlineSupportAgent();

        if (ticketId) {
          const [updated] = await db
            .update(supportTickets)
            .set({
              isAiHandled: true,
              aiResolutionStatus: "escalated",
              assignedToUserId: assignedAgent ? assignedAgent.id : undefined,
              assignedAt: assignedAgent ? new Date() : undefined,
              priority: aiResult.suggestedPriority,
              updatedAt: new Date(),
            })
            .where(eq(supportTickets.id, ticketId))
            .returning();
          ticketRef = updated as Record<string, unknown>;
        } else {
          // Create a new support ticket representing this escalated chat
          const generatedTicketNo = `TKT-${Math.floor(1000 + Math.random() * 9000)}`;
          const [created] = await db
            .insert(supportTickets)
            .values({
              ticketNumber: generatedTicketNo,
              subject: message.slice(0, 120),
              category: aiResult.suggestedCategory,
              priority: aiResult.suggestedPriority,
              status: assignedAgent ? "in_progress" : "open",
              isAiHandled: true,
              aiResolutionStatus: "escalated",
              assignedToUserId: assignedAgent?.id || null,
              assignedAt: assignedAgent ? new Date() : null,
            })
            .returning();
          ticketRef = created as Record<string, unknown>;

          // Insert user question into messages thread
          await db.insert(supportTicketMessages).values({
            ticketId: created.id,
            senderType: "advocate",
            senderName: "Client / Inquirer",
            message: message.trim(),
          });

          // Insert AI answer into messages thread
          await db.insert(supportTicketMessages).values({
            ticketId: created.id,
            senderType: "staff",
            senderName: "Nyaya Sahayak AI",
            message: aiResult.message,
          });
        }
      }

      // 3. If user confirmed problem solved and requested ticket closure
      if (aiResult.isTicketClosed && ticketId) {
        const [closed] = await db
          .update(supportTickets)
          .set({
            status: "closed",
            aiResolutionStatus: "resolved_by_ai",
            resolvedAt: new Date(),
            updatedAt: new Date(),
          })
          .where(eq(supportTickets.id, ticketId))
          .returning();
        ticketRef = closed as Record<string, unknown>;
      }

      return res.status(200).json(
        ResponseHandler(200, "AI response generated successfully", {
          message: aiResult.message,
          isEscalated: aiResult.isEscalated,
          escalationReason: aiResult.escalationReason,
          suggestedCategory: aiResult.suggestedCategory,
          suggestedPriority: aiResult.suggestedPriority,
          suggestedOptions: aiResult.suggestedOptions || [],
          shouldAskIfSolved: aiResult.shouldAskIfSolved || false,
          isTicketClosed: aiResult.isTicketClosed || false,
          assignedAgent,
          ticket: ticketRef,
        })
      );
    } catch (error) {
      console.error("AI Support Chat Error:", error);
      return next(CustomErrorHandler.serverError());
    }
  },
};

export { findOptimalOnlineSupportAgent };
export default adminSupportController;
