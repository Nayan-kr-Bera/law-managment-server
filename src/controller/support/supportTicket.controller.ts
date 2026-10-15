import { and, eq, isNotNull, isNull, or, SQL } from "drizzle-orm";
import { NextFunction, Request, Response } from "express";
import db from "../../db/index.js";
import supportTicketMessages from "../../db/schema/support/supportTicketMessages.js";
import supportTickets from "../../db/schema/support/supportTickets.js";
import {
  autoCloseInactiveTicketIfExpired,
  autoCloseInactiveTicketsList,
  findOptimalOnlineSupportAgent,
  formatTicketMessage,
  isAnySupportAgentBusy,
  isExplicitProblemSolved,
  isSupportOfficeHours,
} from "../../helpers/supportTicket.helper.js";
import { aiSupportService } from "../../services/aiSupport.service.js";
import { createClientNotification } from "../../services/notification.service.js";
import {
  emitTicketClosed,
  emitTicketMessage,
  emitTicketUpdated,
} from "../../socket/socket.service.js";
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
        messages: (t.messages || []).map(formatTicketMessage),
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

      const { status, category, caseId, scope } = req.query as {
        status?: string;
        category?: string;
        caseId?: string;
        scope?: "platform" | "clients";
      };

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
      if (scope === "platform") {
        // Tickets raised to MI Law Platform Super Admin (no legal case, no client)
        conditions.push(
          isNull(supportTickets.caseId),
          isNull(supportTickets.clientId),
          isNull(supportTickets.clientUserId)
        );
      } else if (scope === "clients") {
        // Inquiries from chamber clients
        conditions.push(
          or(
            isNotNull(supportTickets.caseId),
            isNotNull(supportTickets.clientId),
            isNotNull(supportTickets.clientUserId)
          )!
        );
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
          assignedToUser: {
            columns: {
              id: true,
              name: true,
              email: true,
            },
          },
        },
        orderBy: (t, { desc }) => [desc(t.updatedAt)],
      });

      // Auto-close inactive AI-handled tickets if user hasn't messaged within 7 minutes
      await autoCloseInactiveTicketsList(ticketRecords);

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
        isAiHandled: t.isAiHandled ?? false,
        aiResolutionStatus: t.aiResolutionStatus ?? null,
        assignedToUser: t.assignedToUser ?? null,
        createdAt: t.createdAt ? new Date(t.createdAt).toLocaleString() : "",
        updatedAt: t.updatedAt ? new Date(t.updatedAt).toLocaleString() : "",
        messages: (t.messages || []).map(formatTicketMessage),
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
          assignedToUser: {
            columns: {
              id: true,
              name: true,
              email: true,
            },
          },
        },
      });

      if (!ticketRecord) {
        return next(CustomErrorHandler.notFound("Support ticket not found"));
      }

      await autoCloseInactiveTicketIfExpired(ticketRecord);

      return res.status(200).json(
        ResponseHandler(200, "Support ticket fetched successfully", {
          ...ticketRecord,
          messages: (ticketRecord.messages || []).map(formatTicketMessage),
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

      if (req.clientUser && !caseId) {
        return next(
          CustomErrorHandler.badRequest(
            "Please select a legal case. Chamber inquiries must be linked to a specific case."
          )
        );
      }

      let tenantId: string | null = req.user?.tenantId || null;
      let officeId: string | null = req.officeId || null;
      let clientId = req.clientUser?.clientId || null;
      let clientUserId = req.clientUser?.clientUserId || null;

      // If request is from client portal, get tenantId/officeId from their JWT profile
      if (!tenantId && req.clientUser?.tenantId) {
        tenantId = req.clientUser.tenantId;
        officeId = req.clientUser.officeId ?? null;
      }

      let senderName = "Client User";
      let senderType = "client";

      if (req.user?.userId) {
        senderType = "advocate";
        senderName = req.body.senderName || req.user.name || "Advocate";
      } else if (req.clientUser?.email) {
        senderName = `Client (${req.clientUser.email})`;
      }

      const generatedTicketNo = `TKT-${Math.floor(1000 + Math.random() * 9000)}`;

      const isPlatformTicket = !caseId;

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
          isAiHandled: isPlatformTicket,
          aiResolutionStatus: isPlatformTicket ? "in_progress" : null,
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

      const formattedMessages = [
        {
          id: initialMessage.id,
          senderName: initialMessage.senderName,
          senderRole: initialMessage.senderType,
          message: initialMessage.message,
          timestamp: new Date().toLocaleString(),
        },
      ];

      // Auto-trigger Nyaya Sahayak AI Support Agent for Platform Tickets
      if (isPlatformTicket) {
        try {
          const aiResponse = await aiSupportService.processSupportChat([], message);
          if (aiResponse && aiResponse.message) {
            const [aiMsg] = await db
              .insert(supportTicketMessages)
              .values({
                ticketId: newTicket.id,
                senderType: "ai",
                senderName: "Nyaya Sahayak AI",
                message: aiResponse.message,
              })
              .returning();

            formattedMessages.push({
              id: aiMsg.id,
              senderName: aiMsg.senderName,
              senderRole: aiMsg.senderType,
              message: aiMsg.message,
              timestamp: new Date().toLocaleString(),
            });

            // If user immediately requested human escalation
            if (aiResponse.isEscalated) {
              const optimalAgent = await findOptimalOnlineSupportAgent();
              if (optimalAgent) {
                await db
                  .update(supportTickets)
                  .set({
                    assignedToUserId: optimalAgent.id,
                    assignedAt: new Date(),
                    aiResolutionStatus: "escalated",
                    priority: aiResponse.suggestedPriority || "high",
                    status: "in_progress",
                  })
                  .where(eq(supportTickets.id, newTicket.id));

                const [escalateMsg] = await db
                  .insert(supportTicketMessages)
                  .values({
                    ticketId: newTicket.id,
                    senderType: "ai",
                    senderName: "Nyaya Sahayak AI",
                    message: `📌 Ticket transferred to live support specialist: ${optimalAgent.name} (${optimalAgent.email}). An agent will respond shortly.`,
                  })
                  .returning();

                formattedMessages.push({
                  id: escalateMsg.id,
                  senderName: escalateMsg.senderName,
                  senderRole: escalateMsg.senderType,
                  message: escalateMsg.message,
                  timestamp: new Date().toLocaleString(),
                });
              } else {
                await db
                  .update(supportTickets)
                  .set({
                    aiResolutionStatus: "escalated",
                    priority: "high",
                    status: "in_progress",
                  })
                  .where(eq(supportTickets.id, newTicket.id));

                const [queueMsg] = await db
                  .insert(supportTicketMessages)
                  .values({
                    ticketId: newTicket.id,
                    senderType: "ai",
                    senderName: "Nyaya Sahayak AI",
                    message:
                      "I cannot create new organizations or law firm chambers directly. I have marked your ticket as High Priority. As soon as a support specialist is online, they will review your request and you will be notified.",
                  })
                  .returning();

                formattedMessages.push({
                  id: queueMsg.id,
                  senderName: queueMsg.senderName,
                  senderRole: queueMsg.senderType,
                  message: queueMsg.message,
                  timestamp: new Date().toLocaleString(),
                });
              }
            }
          }
        } catch (aiErr) {
          console.error("AI initial response generation error:", aiErr);
        }
      }

      const formattedTicket = {
        id: newTicket.id,
        ticketNumber: newTicket.ticketNumber,
        subject: newTicket.subject,
        category: newTicket.category,
        priority: newTicket.priority,
        status: newTicket.status,
        caseId: newTicket.caseId || undefined,
        isAiHandled: isPlatformTicket,
        aiResolutionStatus: isPlatformTicket ? "in_progress" : null,
        createdAt: new Date().toLocaleString(),
        updatedAt: new Date().toLocaleString(),
        messages: formattedMessages,
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

      if (ticketRecord.status === "closed") {
        return next(
          CustomErrorHandler.badRequest(
            "This support ticket has been closed. Further replies are disabled. Please raise a new ticket."
          )
        );
      }

      let senderType = "client";
      let senderName = "Client User";

      if (req.user?.userId) {
        senderType = "advocate";
        senderName = req.user.name || "Advocate";
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

      // Broadcast real-time message to socket room
      emitTicketMessage(ticketId, newMessage);

      // Update ticket updatedAt and set status to in_progress if open
      let currentStatus = ticketRecord.status === "closed" || ticketRecord.status === "open" ? "in_progress" : ticketRecord.status;
      await db
        .update(supportTickets)
        .set({
          status: currentStatus,
          updatedAt: new Date(),
        })
        .where(eq(supportTickets.id, ticketId));

      // Trigger push notification to client if advocate/staff replied
      const targetClientId = ticketRecord.clientId || ticketRecord.clientUserId;
      if (targetClientId && (senderType === "advocate" || req.user?.userId)) {
        const messagePreview =
          message.length > 80 ? `${message.substring(0, 77)}...` : message;

        createClientNotification({
          tenantId: ticketRecord.tenantId || null,
          officeId: ticketRecord.officeId,
          caseId: ticketRecord.caseId,
          clientId: targetClientId,
          channel: "push",
          title: `Response on Ticket #${ticketRecord.ticketNumber}`,
          message: `${senderName}: "${messagePreview}"`,
          payload: {
            ticketId: ticketRecord.id,
            ticketNumber: ticketRecord.ticketNumber,
            type: "support_reply",
            senderName,
          },
        }).catch((err) =>
          console.error("Failed to push support ticket reply notification:", err)
        );
      }

      // If this is a platform support ticket, Nyaya Sahayak AI answers advocate messages!
      const isPlatformTicket = !ticketRecord.caseId;
      if (isPlatformTicket && senderType === "advocate") {
        try {
          const allMsgs = await db.query.supportTicketMessages.findMany({
            where: eq(supportTicketMessages.ticketId, ticketId),
            orderBy: (m, { asc }) => [asc(m.createdAt)],
          });

          const chatHistory = allMsgs.map((m) => ({
            role: (m.senderType === "ai" || m.senderType === "staff" ? "assistant" : "user") as "user" | "assistant",
            content: m.message,
          }));

          const aiResult = await aiSupportService.processSupportChat(chatHistory, message);

          // Natural conversational pacing pause so typing state feels authentic
          await new Promise((resolve) => setTimeout(resolve, 1200));

          if (aiResult.isTicketClosed || isExplicitProblemSolved(message)) {
            // Advocate confirmed problem is resolved
            currentStatus = "closed";
            await db
              .update(supportTickets)
              .set({
                status: "closed",
                aiResolutionStatus: "resolved_by_ai",
                resolvedAt: new Date(),
                updatedAt: new Date(),
              })
              .where(eq(supportTickets.id, ticketId));

            const [savedAiMsg] = await db
              .insert(supportTicketMessages)
              .values({
                ticketId,
                senderType: "ai",
                senderName: "Nyaya Sahayak AI",
                message: aiResult.message.replace(/\*{1,3}/g, ""),
              })
              .returning();

            emitTicketMessage(ticketId, savedAiMsg);
            emitTicketClosed(ticketId);
            emitTicketUpdated(ticketId, { status: "closed" });
          } else if (aiResult.isEscalated) {
            // Check Office Hours: 10:00 AM to 7:00 PM IST (10:00 - 19:00)
            if (!isSupportOfficeHours()) {
              await db
                .update(supportTickets)
                .set({
                  aiResolutionStatus: "escalated",
                  priority: "high",
                  status: "in_progress",
                  updatedAt: new Date(),
                })
                .where(eq(supportTickets.id, ticketId));

              const outOfOfficeNotice =
                "I cannot create new organizations or law firm chambers directly. Our live human support specialists are available during office hours from 10:00 AM to 7:00 PM. I have marked your ticket as High Priority. As soon as an agent is online at 10:00 AM, they will assist you and you will be notified.";

              const [outMsg] = await db
                .insert(supportTicketMessages)
                .values({
                  ticketId,
                  senderType: "ai",
                  senderName: "Nyaya Sahayak AI",
                  message: outOfOfficeNotice,
                })
                .returning();

              emitTicketMessage(ticketId, outMsg);
              emitTicketUpdated(ticketId, { status: "in_progress" });
            } else {
              // Within office hours: check for online, available agents
              const optimalAgent = await findOptimalOnlineSupportAgent();

              if (optimalAgent) {
                // Agent is live and available
                await db
                  .update(supportTickets)
                  .set({
                    assignedToUserId: optimalAgent.id,
                    assignedAt: new Date(),
                    aiResolutionStatus: "escalated",
                    priority: aiResult.suggestedPriority || "high",
                    status: "in_progress",
                    updatedAt: new Date(),
                  })
                  .where(eq(supportTickets.id, ticketId));

                const handoverNotice = `Connected with specialist ${optimalAgent.name}. They will join this chat shortly.`;

                const [handoverMsg] = await db
                  .insert(supportTicketMessages)
                  .values({
                    ticketId,
                    senderType: "system",
                    senderName: "System",
                    message: handoverNotice,
                  })
                  .returning();

                emitTicketMessage(ticketId, handoverMsg);
                emitTicketUpdated(ticketId, {
                  assignedToUserId: optimalAgent.id,
                  assignedToUser: optimalAgent,
                  status: "in_progress",
                });
              } else {
                // Check if any support agent is online but currently marked 'busy'
                const isAnyAgentBusy = await isAnySupportAgentBusy();

                await db
                  .update(supportTickets)
                  .set({
                    aiResolutionStatus: "escalated",
                    priority: "high",
                    status: "in_progress",
                    updatedAt: new Date(),
                  })
                  .where(eq(supportTickets.id, ticketId));

                const waitNotice = isAnyAgentBusy
                  ? "I cannot create new organizations or law firm chambers directly. I have marked your ticket as High Priority. All our support specialists are currently assisting other advocates, but you will be notified as soon as an agent becomes free."
                  : "I cannot create new organizations or law firm chambers directly. I have marked your ticket as High Priority and queued it for our support specialists. Once a specialist is online, they will take over this ticket and you will be notified.";

                const [waitMsg] = await db
                  .insert(supportTicketMessages)
                  .values({
                    ticketId,
                    senderType: "ai",
                    senderName: "Nyaya Sahayak AI",
                    message: waitNotice,
                  })
                  .returning();

                emitTicketMessage(ticketId, waitMsg);
                emitTicketUpdated(ticketId, { status: "in_progress" });
              }
            }
          } else {
            // Standard step-by-step guidance without any markdown asterisks
            const plainMessage = aiResult.message.replace(/\*{1,3}/g, "");
            const [guidanceMsg] = await db
              .insert(supportTicketMessages)
              .values({
                ticketId,
                senderType: "ai",
                senderName: "Nyaya Sahayak AI",
                message: plainMessage,
              })
              .returning();

            emitTicketMessage(ticketId, guidanceMsg);
          }
        } catch (aiErr) {
          console.error("AI reply processing error:", aiErr);
        }
      }

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
        status: currentStatus,
        caseId: ticketRecord.caseId || undefined,
        createdAt: new Date(ticketRecord.createdAt).toLocaleString(),
        updatedAt: new Date().toLocaleString(),
        messages: allMessages.map(formatTicketMessage),
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

      const ticketRecord = await db.query.supportTickets.findFirst({
        where: eq(supportTickets.id, ticketId),
      });

      if (!ticketRecord) {
        return next(CustomErrorHandler.notFound("Support ticket not found"));
      }

      await db
        .update(supportTickets)
        .set({
          status,
          ...(status === "resolved" || status === "closed"
            ? { resolvedAt: ticketRecord.resolvedAt || new Date() }
            : {}),
          updatedAt: new Date(),
        })
        .where(eq(supportTickets.id, ticketId));

      emitTicketUpdated(ticketId, { status });
      if (status === "closed" || status === "resolved") {
        emitTicketClosed(ticketId);
      }

      const targetClientId = ticketRecord.clientId || ticketRecord.clientUserId;
      if (targetClientId && ticketRecord.status !== status) {
        const formatStatus = (s: string) =>
          s.replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());

        const statusLabel = formatStatus(status);
        const statusMessage =
          status === "closed"
            ? `Your support ticket #${ticketRecord.ticketNumber} has been resolved and closed.`
            : `Your support ticket #${ticketRecord.ticketNumber} status is now "${statusLabel}".`;

        createClientNotification({
          tenantId: ticketRecord.tenantId || null,
          officeId: ticketRecord.officeId,
          caseId: ticketRecord.caseId,
          clientId: targetClientId,
          channel: "push",
          title: `Ticket #${ticketRecord.ticketNumber} Status: ${statusLabel}`,
          message: statusMessage,
          payload: {
            ticketId: ticketRecord.id,
            ticketNumber: ticketRecord.ticketNumber,
            type: "support_status",
            status,
          },
        }).catch((err) =>
          console.error("Failed to push support ticket status notification:", err)
        );
      }

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

  // SUBMIT CUSTOMER SATISFACTION (CSAT) RATING & FEEDBACK
  async submitCsatRating(req: Request, res: Response, next: NextFunction) {
    try {
      const { ticketId } = req.params;
      const { rating, feedback } = req.body;

      if (!rating || Number(rating) < 1 || Number(rating) > 5) {
        return next(CustomErrorHandler.badRequest("Rating must be a valid integer between 1 and 5"));
      }

      const existing = await db.query.supportTickets.findFirst({
        where: eq(supportTickets.id, ticketId),
      });

      if (!existing) {
        return next(CustomErrorHandler.notFound("Support ticket not found"));
      }

      const [updated] = await db
        .update(supportTickets)
        .set({
          csatRating: Number(rating),
          csatFeedback: feedback?.trim() || null,
          csatRatedAt: new Date(),
          updatedAt: new Date(),
        })
        .where(eq(supportTickets.id, ticketId))
        .returning();

      // Append CSAT system entry in ticket messages
      const stars = "⭐".repeat(Number(rating));
      await db.insert(supportTicketMessages).values({
        ticketId,
        senderType: "client",
        senderId: (req as Request & { user?: { id?: string } }).user?.id || null,
        senderName: "Customer Feedback",
        message: `Customer rated resolution ${stars} (${rating}/5)${feedback ? `: "${feedback.trim()}"` : "."}`,
      });

      return res.status(200).json(
        ResponseHandler(200, "Thank you! Your feedback has been recorded.", updated)
      );
    } catch (error) {
      console.error("Submit CSAT rating error:", error);
      return next(CustomErrorHandler.serverError());
    }
  },
};

export default supportTicketController;
