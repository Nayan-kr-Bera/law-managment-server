import { Request, Response, NextFunction } from "express";
import { eq, and, inArray, desc, asc } from "drizzle-orm";
import db from "../../db/index.js";
import clientProfiles from "../../db/schema/clients/clientProfiles.js";
import cases from "../../db/schema/caseMangment/cases.js";
import caseClients from "../../db/schema/caseMangment/caseClients.js";
import caseNotes from "../../db/schema/caseMangment/caseNotes.js";
import hearings from "../../db/schema/caseMangment/hearings.js";
import caseDocuments from "../../db/schema/documents/caseDocuments.js";
import invoices from "../../db/schema/finance/invoices.js";
import payments from "../../db/schema/finance/payments.js";
import clientLedger from "../../db/schema/clients/clientLedger.js";
import razorpayService from "../../services/razorpay.service.js";
import supportTickets from "../../db/schema/support/supportTickets.js";
import supportTicketMessages from "../../db/schema/support/supportTicketMessages.js";
import notificationQueue from "../../db/schema/notifications/notificationQueue.js";
import JwtService from "../../utils/jwtServices.js";
import CustomErrorHandler from "../../utils/customErrorHandler.js";
import ResponseHandler from "../../utils/responseHandler.js";
import { config } from "../../config/index.js";
import { IClientJwtPayload } from "../../@types/payload.types.js";

const clientPortalController = {
  // CLIENT REFRESH TOKEN — verifies client JWT payload and issues scoped token via clientProfiles
  async refreshToken(req: Request, res: Response, next: NextFunction) {
    try {
      const refresh_token = req.body?.refresh_token || req.body?.refreshToken;

      if (!refresh_token) {
        return next(CustomErrorHandler.badRequest("Refresh token is required"));
      }

      let decoded: IClientJwtPayload;
      try {
        decoded = JwtService.verifyClient(
          refresh_token,
          config.REFRESH_SECRET
        );
      } catch {
        return next(
          CustomErrorHandler.unAuthorized("Invalid or expired refresh token")
        );
      }

      if (!decoded || (!decoded.clientUserId && !decoded.clientId)) {
        return next(
          CustomErrorHandler.unAuthorized("Invalid client refresh token payload")
        );
      }

      // Load active firm profile for this client identity to get current tenantId & officeId
      let profile = null;
      if (decoded.profileId) {
        profile = await db.query.clientProfiles.findFirst({
          where: eq(clientProfiles.id, decoded.profileId),
        });
      } else if (decoded.clientId) {
        profile = await db.query.clientProfiles.findFirst({
          where: eq(clientProfiles.identityId, decoded.clientId),
        });
      }

      if (!profile || profile.status !== "active") {
        return next(CustomErrorHandler.unAuthorized("Active client profile not found"));
      }

      const payload: IClientJwtPayload = {
        clientUserId: decoded.clientUserId,
        clientId: decoded.clientId,
        email: decoded.email,
        profileId: profile.id,
        tenantId: profile.tenantId,
        officeId: profile.officeId ?? undefined,
        requiresProfileSelection: false,
      };

      const newAccessToken = JwtService.sign(payload, "7d", config.ACCESS_SECRET);

      return res.status(200).json(
        ResponseHandler(200, "Token refreshed successfully", {
          token: newAccessToken,
          accessToken: newAccessToken,
        })
      );
    } catch (error) {
      console.error("Client refreshToken error:", error);
      return next(CustomErrorHandler.serverError());
    }
  },

  // REGISTER — disabled. Clients are added by law firms only.
  async register(req: Request, res: Response, next: NextFunction) {
    return res.status(403).json(
      ResponseHandler(
        403,
        "Self-registration is not available. Please contact your law firm to add you as a client.",
        null
      )
    );
  },

  // GET CLIENT CASES — all-in-one tunnel by client identity
  async getCases(req: Request, res: Response, next: NextFunction) {
    try {
      const clientId = req.clientUser?.clientId;
      // Optional filters if passed via query/header
      const officeId = (req.query.officeId as string) || (req.headers["x-office-id"] as string) || undefined;
      const tenantId = (req.query.tenantId as string) || (req.headers["x-tenant-id"] as string) || undefined;

      let matchedCases: (typeof cases.$inferSelect & {
        court?: { name: string } | null;
        caseType?: { name: string } | null;
        policeStation?: { name: string } | null;
        underSection?: { actName?: string | null; section?: string | null } | null;
        office?: { name: string } | null;
        tenant?: { name: string } | null;
      })[] = [];

      if (clientId) {
        const caseClientRecords = await db
          .select({ caseId: caseClients.caseId })
          .from(caseClients)
          .where(eq(caseClients.clientId, clientId));

        const caseIds = caseClientRecords.map((r) => r.caseId);

        if (caseIds.length > 0) {
          matchedCases = await db.query.cases.findMany({
            where: and(
              inArray(cases.id, caseIds),
              tenantId ? eq(cases.tenantId, tenantId) : undefined,
              officeId ? eq(cases.officeId, officeId) : undefined
            ),
            with: {
              court: true,
              caseType: true,
              policeStation: true,
              underSection: true,
              office: true,
              tenant: true,
            },
          });
        }
      }

      const formattedCases = matchedCases.map((c) => ({
        id: c.id,
        caseNumber: c.caseNumber || c.id,
        cnrNumber: c.cnrNumber || undefined,
        referenceNumber: c.referenceNumber || undefined,
        fileNumber: c.fileNumber || undefined,
        firNumber: c.firNumber || undefined,
        title: c.title,
        courtName: c.court?.name || undefined,
        courtNumber: c.courtNumber || undefined,
        judgeName: c.judgeName || undefined,
        status: c.status || "active",
        stage: c.stage || undefined,
        firstParty: c.firstParty || undefined,
        oppositeParty: c.oppositeParty || undefined,
        nextHearingDate: c.nextHearingDate || undefined,
        filingDate: c.filingDate || undefined,
        registrationDate: c.registrationDate || undefined,
        caseTypeName: c.caseType?.name || undefined,
        policeStationName: c.policeStation?.name || undefined,
        underSectionName: c.underSection
          ? `${c.underSection.actName || ""} ${c.underSection.section || ""}`.trim()
          : undefined,
        description: c.description || undefined,
        remarks: c.remarks || undefined,
        officeId: c.officeId || undefined,
        officeName: c.office?.name || undefined,
        tenantId: c.tenantId || undefined,
        firmName: c.tenant?.name || undefined,
      }));

      return res.status(200).json(
        ResponseHandler(200, "Client cases fetched successfully", formattedCases)
      );
    } catch (error) {
      console.error("Get client cases error:", error);
      return next(CustomErrorHandler.serverError());
    }
  },

  // GET CLIENT CASE BY ID
  async getCaseById(req: Request, res: Response, next: NextFunction) {
    try {
      const { caseId } = req.params;
      const clientId = req.clientUser?.clientId;

      // Verify client has access to this case
      if (clientId) {
        const clientAccess = await db.query.caseClients.findFirst({
          where: and(
            eq(caseClients.caseId, caseId),
            eq(caseClients.clientId, clientId)
          ),
        });
        if (!clientAccess) {
          return next(CustomErrorHandler.notFound("Case record not found or access denied"));
        }
      }

      const caseRecord = await db.query.cases.findFirst({
        where: eq(cases.id, caseId),
        with: {
          court: true,
          caseType: true,
          policeStation: true,
          underSection: true,
          office: true,
          tenant: true,
        },
      });

      if (!caseRecord) {
        return next(CustomErrorHandler.notFound("Case record not found"));
      }

      const hearingRecords = await db.query.hearings.findMany({
        where: eq(hearings.caseId, caseId),
      });

      const notes = await db.query.caseNotes.findMany({
        where: and(eq(caseNotes.caseId, caseId), eq(caseNotes.isPrivate, false)),
        orderBy: [desc(caseNotes.createdAt)],
      });

      const formattedCase = {
        id: caseRecord.id,
        caseNumber: caseRecord.caseNumber || caseRecord.id,
        cnrNumber: caseRecord.cnrNumber || undefined,
        referenceNumber: caseRecord.referenceNumber || undefined,
        fileNumber: caseRecord.fileNumber || undefined,
        firNumber: caseRecord.firNumber || undefined,
        title: caseRecord.title,
        courtName: caseRecord.court?.name || undefined,
        courtNumber: caseRecord.courtNumber || undefined,
        judgeName: caseRecord.judgeName || undefined,
        status: caseRecord.status || "active",
        stage: caseRecord.stage || undefined,
        firstParty: caseRecord.firstParty || undefined,
        oppositeParty: caseRecord.oppositeParty || undefined,
        nextHearingDate: caseRecord.nextHearingDate || undefined,
        filingDate: caseRecord.filingDate || undefined,
        registrationDate: caseRecord.registrationDate || undefined,
        caseTypeName: caseRecord.caseType?.name || undefined,
        policeStationName: caseRecord.policeStation?.name || undefined,
        underSectionName: caseRecord.underSection
          ? `${caseRecord.underSection.actName || ""} ${caseRecord.underSection.section || ""}`.trim()
          : undefined,
        description: caseRecord.description || undefined,
        remarks: caseRecord.remarks || undefined,
        officeId: caseRecord.officeId || undefined,
        officeName: caseRecord.office?.name || undefined,
        tenantId: caseRecord.tenantId || undefined,
        firmName: caseRecord.tenant?.name || undefined,
      };

      return res.status(200).json(
        ResponseHandler(200, "Client case details fetched successfully", {
          ...formattedCase,
          data: formattedCase,
          hearings: hearingRecords,
          remarks: notes,
        })
      );
    } catch (error) {
      console.error("Get client case by ID error:", error);
      return next(CustomErrorHandler.serverError());
    }
  },

  // ADD CASE REMARK / NOTE
  async addCaseRemark(req: Request, res: Response, next: NextFunction) {
    try {
      const { caseId } = req.params;
      const { content } = req.body;
      const clientId = req.clientUser?.clientId;

      if (!content) {
        return next(CustomErrorHandler.badRequest("Remark content is required"));
      }

      // Verify client actually belongs to this case
      if (clientId) {
        const clientAccess = await db.query.caseClients.findFirst({
          where: and(
            eq(caseClients.caseId, caseId),
            eq(caseClients.clientId, clientId)
          ),
        });
        if (!clientAccess) {
          return next(CustomErrorHandler.notFound("Case not found or access denied"));
        }
      }

      const caseExists = await db.query.cases.findFirst({
        where: eq(cases.id, caseId),
      });

      if (!caseExists) {
        return next(CustomErrorHandler.notFound("Case not found"));
      }

      const [newNote] = await db
        .insert(caseNotes)
        .values({
          caseId,
          createdBy: clientId || undefined,
          note: content,
          isPrivate: false,
        })
        .returning();

      return res.status(201).json(
        ResponseHandler(201, "Case remark posted successfully", {
          remark: newNote,
        })
      );
    } catch (error) {
      console.error("Add case remark error:", error);
      return next(CustomErrorHandler.serverError());
    }
  },

  // GET CLIENT DOCUMENTS — all-in-one tunnel by client identity
  async getDocuments(req: Request, res: Response, next: NextFunction) {
    try {
      const clientId = req.clientUser?.clientId;
      const officeId = (req.query.officeId as string) || (req.headers["x-office-id"] as string) || undefined;
      const tenantId = (req.query.tenantId as string) || (req.headers["x-tenant-id"] as string) || undefined;
      let matchedCaseIds: string[] = [];

      if (clientId) {
        const caseClientRecords = await db
          .select({ caseId: caseClients.caseId })
          .from(caseClients)
          .where(eq(caseClients.clientId, clientId));

        matchedCaseIds = caseClientRecords.map((r) => r.caseId);
      }

      let docs: (typeof caseDocuments.$inferSelect & {
        case?: {
          id: string;
          caseNumber: string | null;
          title: string;
          office?: { name: string } | null;
          tenant?: { name: string } | null;
        } | null;
      })[] = [];
      if (matchedCaseIds.length > 0) {
        docs = await db.query.caseDocuments.findMany({
          where: and(
            inArray(caseDocuments.caseId, matchedCaseIds),
            eq(caseDocuments.isPrivate, false),
            tenantId ? eq(caseDocuments.tenantId, tenantId) : undefined,
            officeId ? eq(caseDocuments.officeId, officeId) : undefined
          ),
          with: {
            case: {
              columns: { id: true, caseNumber: true, title: true },
              with: { office: true, tenant: true },
            },
          },
          limit: 100,
        });
      }

      const formattedDocs = docs.map((d) => ({
        ...d,
        caseNumber: d.case?.caseNumber || undefined,
        caseTitle: d.case?.title || undefined,
        officeName: d.case?.office?.name || undefined,
        firmName: d.case?.tenant?.name || undefined,
      }));

      return res.status(200).json(
        ResponseHandler(200, "Client documents fetched successfully", formattedDocs)
      );
    } catch (error) {
      console.error("Get client documents error:", error);
      return next(CustomErrorHandler.serverError());
    }
  },

  // GET CLIENT INVOICES — all-in-one tunnel by client identity
  async getInvoices(req: Request, res: Response, next: NextFunction) {
    try {
      const clientId = req.clientUser?.clientId;
      const officeId = (req.query.officeId as string) || (req.headers["x-office-id"] as string) || undefined;
      const tenantId = (req.query.tenantId as string) || (req.headers["x-tenant-id"] as string) || undefined;

      const invs = await db.query.invoices.findMany({
        where: and(
          clientId ? eq(invoices.clientId, clientId) : undefined,
          tenantId ? eq(invoices.tenantId, tenantId) : undefined,
          officeId ? eq(invoices.officeId, officeId) : undefined
        ),
        with: {
          case: {
            columns: { id: true, caseNumber: true, title: true },
          },
          office: true,
          tenant: true,
        },
        limit: 100,
      });

      const formattedInvoices = invs.map((inv) => ({
        ...inv,
        invoiceNumber: inv.invoiceNo,
        totalAmount: Number(inv.total) || 0,
        paidAmount: inv.status === "paid" ? Number(inv.total) : 0,
        amount: Number(inv.total) || 0,
        taxAmount: 0,
        caseNumber: inv.case?.caseNumber || undefined,
        caseTitle: inv.case?.title || undefined,
        officeName: inv.office?.name || undefined,
        firmName: inv.tenant?.name || undefined,
      }));

      return res.status(200).json(
        ResponseHandler(200, "Client invoices fetched successfully", formattedInvoices)
      );
    } catch (error) {
      console.error("Get client invoices error:", error);
      return next(CustomErrorHandler.serverError());
    }
  },

  // CREATE INVOICE RAZORPAY ORDER
  async createInvoiceRazorpayOrder(req: Request, res: Response, next: NextFunction) {
    try {
      const { invoiceId } = req.params;
      const clientId = req.clientUser?.clientId;

      const invoiceRecord = await db.query.invoices.findFirst({
        where: and(
          eq(invoices.id, invoiceId),
          clientId ? eq(invoices.clientId, clientId) : undefined
        ),
      });

      if (!invoiceRecord) {
        return next(CustomErrorHandler.notFound("Invoice not found or access denied"));
      }

      if (invoiceRecord.status === "paid") {
        return next(CustomErrorHandler.badRequest("This invoice has already been settled and paid in full"));
      }

      const totalNum = Number(invoiceRecord.total) || 0;
      const amountInPaise = Math.round(totalNum * 100);
      const receipt = `inv_${invoiceRecord.id.slice(0, 8)}_${Date.now()}`;

      let orderId = `order_${Date.now()}`;
      try {
        const order = await razorpayService.createOrder({
          amount: amountInPaise,
          currency: "INR",
          receipt,
          notes: {
            invoiceId: invoiceRecord.id,
            invoiceNo: invoiceRecord.invoiceNo,
            clientId: invoiceRecord.clientId || "",
          },
        });
        orderId = order.id;
      } catch (rErr) {
        console.warn("Razorpay createOrder warning (using simulated order for development):", rErr);
      }

      return res.status(200).json(
        ResponseHandler(200, "Razorpay payment order created", {
          orderId,
          amount: amountInPaise,
          currency: "INR",
          keyId: process.env.RAZORPAY_KEY_ID || "rzp_test_placeholder",
          invoiceNumber: invoiceRecord.invoiceNo,
          totalAmount: totalNum,
        })
      );
    } catch (error) {
      console.error("Create invoice razorpay order error:", error);
      return next(CustomErrorHandler.serverError());
    }
  },

  // PAY INVOICE
  async payInvoice(req: Request, res: Response, next: NextFunction) {
    try {
      const { invoiceId } = req.params;
      const clientId = req.clientUser?.clientId;
      const { paymentMethod = "Razorpay (Online)" } = req.body;
      const receiptNo = `RCPT-2026-${Math.floor(1000 + Math.random() * 9000)}`;

      // Inner query: lookup invoice by ID & clientId to get tenantId, officeId, and caseId
      const invoiceRecord = await db.query.invoices.findFirst({
        where: and(
          eq(invoices.id, invoiceId),
          clientId ? eq(invoices.clientId, clientId) : undefined
        ),
      });

      if (!invoiceRecord) {
        return next(CustomErrorHandler.notFound("Invoice not found or access denied"));
      }

      if (invoiceRecord.status === "paid") {
        return next(CustomErrorHandler.badRequest("This invoice has already been settled and paid in full"));
      }

      // 1. Insert into payments table
      const [newPayment] = await db
        .insert(payments)
        .values({
          invoiceId: invoiceRecord.id,
          amount: String(invoiceRecord.total),
          paymentMethod: paymentMethod,
        })
        .returning();

      // 2. Insert into clientLedger table
      if (invoiceRecord.clientId && invoiceRecord.tenantId) {
        await db.insert(clientLedger).values({
          tenantId: invoiceRecord.tenantId,
          clientId: invoiceRecord.clientId,
          invoiceId: invoiceRecord.id,
          paymentId: newPayment?.id,
          debit: "0",
          credit: String(invoiceRecord.total),
          description: `Online Payment via ${paymentMethod} for ${invoiceRecord.invoiceNo}`,
          transactionDate: new Date(),
        });
      }

      // 3. Mark invoice as paid
      await db
        .update(invoices)
        .set({
          status: "paid",
        })
        .where(eq(invoices.id, invoiceId));

      return res.status(200).json(
        ResponseHandler(200, "Invoice paid successfully", {
          receiptNo,
          invoiceId,
          paymentId: newPayment?.id,
          tenantId: invoiceRecord.tenantId,
          officeId: invoiceRecord.officeId,
          caseId: invoiceRecord.caseId,
          amountPaid: Number(invoiceRecord.total) || 0,
        })
      );
    } catch (error) {
      console.error("Pay invoice error:", error);
      return next(CustomErrorHandler.serverError());
    }
  },

  // SUPPORT TICKETS — all-in-one tunnel by client identity
  async getSupportTickets(req: Request, res: Response, next: NextFunction) {
    try {
      const clientId = req.clientUser?.clientId;
      const officeId = (req.query.officeId as string) || (req.headers["x-office-id"] as string) || undefined;
      const tenantId = (req.query.tenantId as string) || (req.headers["x-tenant-id"] as string) || undefined;

      const tickets = await db.query.supportTickets.findMany({
        where: and(
          clientId ? eq(supportTickets.clientId, clientId) : undefined,
          tenantId ? eq(supportTickets.tenantId, tenantId) : undefined,
          officeId ? eq(supportTickets.officeId, officeId) : undefined
        ),
        with: {
          messages: {
            orderBy: [asc(supportTicketMessages.createdAt)],
          },
          case: {
            columns: {
              id: true,
              caseNumber: true,
              title: true,
            },
            with: { office: true, tenant: true },
          },
          office: true,
          tenant: true,
        },
        orderBy: [desc(supportTickets.updatedAt)],
      });

      const formattedTickets = tickets.map((t) => ({
        id: t.id,
        ticketNumber: t.ticketNumber,
        subject: t.subject,
        category: t.category,
        priority: t.priority,
        status: t.status,
        caseId: t.caseId || undefined,
        caseNumber: t.case?.caseNumber || undefined,
        officeName: t.office?.name || t.case?.office?.name || undefined,
        firmName: t.tenant?.name || t.case?.tenant?.name || undefined,
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
        ResponseHandler(200, "Support tickets fetched successfully", formattedTickets)
      );
    } catch (error) {
      console.error("Get support tickets error:", error);
      return next(CustomErrorHandler.serverError());
    }
  },

  async createSupportTicket(req: Request, res: Response, next: NextFunction) {
    try {
      const { subject, category, priority, caseId, message } = req.body;
      const clientId = req.clientUser?.clientId || null;

      if (!subject || !message) {
        return next(CustomErrorHandler.badRequest("Subject and initial message are required"));
      }

      let tenantId = req.clientUser?.tenantId ?? req.tenantId ?? null;
      let officeId = req.clientUser?.officeId ?? req.officeId ?? null;

      // If caseId is provided, verify client has access to this case and inherit tenant & office
      if (caseId) {
        if (clientId) {
          const clientAccess = await db.query.caseClients.findFirst({
            where: and(
              eq(caseClients.caseId, caseId),
              eq(caseClients.clientId, clientId)
            ),
          });
          if (!clientAccess) {
            return next(CustomErrorHandler.badRequest("You do not have access to this case"));
          }
        }

        const caseRecord = await db.query.cases.findFirst({
          where: eq(cases.id, caseId),
          columns: { tenantId: true, officeId: true },
        });
        if (caseRecord) {
          tenantId = caseRecord.tenantId;
          officeId = caseRecord.officeId;
        }
      }

      // Fallback: client's first active profile
      if (!tenantId && clientId) {
        const profile = await db.query.clientProfiles.findFirst({
          where: eq(clientProfiles.identityId, clientId),
        });
        if (profile) {
          tenantId = profile.tenantId;
          officeId = officeId || profile.officeId;
        }
      }

      const ticketNumber = `TKT-${Math.floor(100000 + Math.random() * 900000)}`;

      const [newTicket] = await db
        .insert(supportTickets)
        .values({
          tenantId,
          officeId,
          clientId,
          clientUserId: clientId,
          caseId: caseId || null,
          ticketNumber,
          subject,
          category: category || "general",
          priority: priority || "medium",
          status: "open",
        })
        .returning();

      await db.insert(supportTicketMessages).values({
        ticketId: newTicket.id,
        senderType: "client",
        senderId: clientId || undefined,
        senderName: "Client User",
        message,
      });

      return res.status(201).json(
        ResponseHandler(201, "Support ticket created successfully", {
          ticket: newTicket,
        })
      );
    } catch (error) {
      console.error("Create support ticket error:", error);
      return next(CustomErrorHandler.serverError());
    }
  },

  async replySupportTicket(req: Request, res: Response, next: NextFunction) {
    try {
      const { ticketId } = req.params;
      const { message } = req.body;

      if (!message) {
        return next(CustomErrorHandler.badRequest("Message content is required"));
      }

      const ticket = await db.query.supportTickets.findFirst({
        where: eq(supportTickets.id, ticketId),
      });

      if (!ticket) {
        return next(CustomErrorHandler.notFound("Support ticket not found"));
      }

      if (req.clientUser?.clientId && ticket.clientId !== req.clientUser.clientId) {
        return next(CustomErrorHandler.unAuthorized("Access denied: You do not have access to this ticket"));
      }

      const [newMessage] = await db
        .insert(supportTicketMessages)
        .values({
          ticketId,
          senderType: "client",
          senderId: req.clientUser?.clientUserId || req.clientUser?.clientId || undefined,
          senderName: "Client User",
          message,
        })
        .returning();

      await db
        .update(supportTickets)
        .set({ updatedAt: new Date() })
        .where(eq(supportTickets.id, ticketId));

      return res.status(200).json(
        ResponseHandler(200, "Support ticket reply sent successfully", {
          message: newMessage,
        })
      );
    } catch (error) {
      console.error("Reply support ticket error:", error);
      return next(CustomErrorHandler.serverError());
    }
  },

  // ─── CLIENT NOTIFICATIONS ──────────────────────────────────────────
  async getNotifications(req: Request, res: Response, next: NextFunction) {
    try {
      const clientId = req.clientUser?.clientId;
      if (!clientId) {
        return next(CustomErrorHandler.unAuthorized("Client ID not found"));
      }

      const clientNotifs = await db
        .select()
        .from(notificationQueue)
        .where(eq(notificationQueue.clientId, clientId))
        .orderBy(desc(notificationQueue.sentAt))
        .limit(50);

      const unreadCount = clientNotifs.filter(
        (n) => n.status !== "read"
      ).length;

      return res.status(200).json(
        ResponseHandler(200, "Client notifications fetched successfully", {
          notifications: clientNotifs,
          unreadCount,
        })
      );
    } catch (error) {
      console.error("Get client notifications error:", error);
      return next(CustomErrorHandler.serverError());
    }
  },

  async markNotificationRead(req: Request, res: Response, next: NextFunction) {
    try {
      const { id } = req.params;
      const clientId = req.clientUser?.clientId;
      if (!clientId) {
        return next(CustomErrorHandler.unAuthorized("Client ID not found"));
      }

      await db
        .update(notificationQueue)
        .set({ status: "read" })
        .where(
          and(
            eq(notificationQueue.id, id),
            eq(notificationQueue.clientId, clientId)
          )
        );

      return res.status(200).json(
        ResponseHandler(200, "Notification marked as read")
      );
    } catch (error) {
      console.error("Mark notification read error:", error);
      return next(CustomErrorHandler.serverError());
    }
  },

  async markAllNotificationsRead(req: Request, res: Response, next: NextFunction) {
    try {
      const clientId = req.clientUser?.clientId;
      if (!clientId) {
        return next(CustomErrorHandler.unAuthorized("Client ID not found"));
      }

      await db
        .update(notificationQueue)
        .set({ status: "read" })
        .where(eq(notificationQueue.clientId, clientId));

      return res.status(200).json(
        ResponseHandler(200, "All notifications marked as read")
      );
    } catch (error) {
      console.error("Mark all notifications read error:", error);
      return next(CustomErrorHandler.serverError());
    }
  },
};

export default clientPortalController;
