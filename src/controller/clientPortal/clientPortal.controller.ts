import { Request, Response, NextFunction } from "express";
import { eq, and, inArray, desc, asc, sql } from "drizzle-orm";
import db from "../../db/index.js";
import clients from "../../db/schema/clients/clients.js";
import tenants from "../../db/schema/tenants.js";
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
import { notificationEvents } from "../../services/notification.service.js";
import bcrypt from "bcrypt";
import { formatCaseRemarks } from "../../services/caseRemarks.service.js";

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

      const matchedCaseIds = matchedCases.map((c) => c.id);
      const noteCountMap = new Map<string, number>();

      if (matchedCaseIds.length > 0) {
        try {
          const counts = await db
            .select({
              caseId: caseNotes.caseId,
              count: sql<number>`count(*)::int`,
            })
            .from(caseNotes)
            .where(
              and(
                inArray(caseNotes.caseId, matchedCaseIds),
                eq(caseNotes.isPrivate, false)
              )
            )
            .groupBy(caseNotes.caseId);

          for (const record of counts) {
            if (record.caseId) {
              noteCountMap.set(record.caseId, Number(record.count) || 0);
            }
          }
        } catch (e) {
          console.error("Error calculating case remarks counts:", e);
        }
      }

      const formattedCases = matchedCases.map((c) => {
        const countFromNotes = noteCountMap.get(c.id) || 0;
        const initialRemarkCount = c.remarks && c.remarks.trim() ? 1 : 0;
        const totalRemarks = countFromNotes > 0 ? countFromNotes : initialRemarkCount;

        return {
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
          remarksCount: totalRemarks,
          officeId: c.officeId || undefined,
          officeName: c.office?.name || undefined,
          tenantId: c.tenantId || undefined,
          firmName: c.tenant?.name || undefined,
        };
      });

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

      const isValidUuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(caseId);
      if (!isValidUuid) {
        return next(CustomErrorHandler.notFound("Case record not found"));
      }

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

      const formattedRemarks = await formatCaseRemarks(notes);

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
        remarksCount: formattedRemarks.length > 0 ? formattedRemarks.length : (caseRecord.remarks && caseRecord.remarks.trim() ? 1 : 0),
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
          remarks: formattedRemarks,
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

      if (!content || !content.trim()) {
        return next(CustomErrorHandler.badRequest("Remark content is required"));
      }

      const isValidUuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(caseId);
      if (!isValidUuid) {
        return next(CustomErrorHandler.notFound("Case not found"));
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
          note: content.trim(),
          isPrivate: false,
        })
        .returning();

      const [formattedRemark] = await formatCaseRemarks([newNote]);

      return res.status(201).json(
        ResponseHandler(201, "Case remark posted successfully", {
          remark: formattedRemark,
          data: formattedRemark,
        })
      );
    } catch (error) {
      console.error("Add case remark error:", error);
      return next(CustomErrorHandler.serverError());
    }
  },

  // GET CASE REMARKS LIST
  async getCaseRemarks(req: Request, res: Response, next: NextFunction) {
    try {
      const { caseId } = req.params;

      const isValidUuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(caseId);
      if (!isValidUuid) {
        return res.status(200).json(
          ResponseHandler(200, "Case remarks fetched successfully", [])
        );
      }

      const notes = await db.query.caseNotes.findMany({
        where: and(eq(caseNotes.caseId, caseId), eq(caseNotes.isPrivate, false)),
        orderBy: [desc(caseNotes.createdAt)],
      });
      const formatted = await formatCaseRemarks(notes);

      if (formatted.length === 0) {
        const caseRecord = await db.query.cases.findFirst({
          where: eq(cases.id, caseId),
          columns: { remarks: true, createdAt: true },
        });
        if (caseRecord?.remarks && caseRecord.remarks.trim()) {
          formatted.push({
            id: `initial-${caseId}`,
            caseId,
            authorName: "Case Note",
            authorRole: "advocate",
            content: caseRecord.remarks.trim(),
            note: caseRecord.remarks.trim(),
            isPrivate: false,
            createdAt: caseRecord.createdAt ? caseRecord.createdAt.toISOString() : new Date().toISOString(),
          });
        }
      }

      return res.status(200).json(
        ResponseHandler(200, "Case remarks fetched successfully", formatted)
      );
    } catch (error) {
      console.error("Get case remarks error:", error);
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
        uploader?: {
          id: string;
          name: string;
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
            uploader: {
              columns: { id: true, name: true },
            },
          },
          orderBy: [desc(caseDocuments.createdAt)],
          limit: 100,
        });
      }

      const formattedDocs = docs.map((d) => ({
        ...d,
        uploadedAt: d.createdAt ? d.createdAt.toISOString() : new Date().toISOString(),
        createdAt: d.createdAt ? d.createdAt.toISOString() : new Date().toISOString(),
        uploadedBy: d.uploader?.name || "Advocate Chamber",
        uploadedByName: d.uploader?.name || undefined,
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

  // GET CLIENT INVOICES — all-in-one tunnel by client identity with full GST & item breakdown
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
          items: true,
          client: true,
          payments: {
            orderBy: [asc(payments.paidAt)],
          },
          office: true,
          tenant: true,
        },
        orderBy: [desc(invoices.createdAt)],
        limit: 100,
      });

      const formattedInvoices = invs.map((inv) => {
        const totalPaid = (inv.payments || []).reduce(
          (sum: number, p) => sum + (Number(p.amount) || 0),
          0,
        );
        const totalAmount = Number(inv.total) || 0;
        const dynamicStatus =
          totalPaid >= totalAmount - 0.01 && totalAmount > 0
            ? "paid"
            : totalPaid > 0
            ? "partially_paid"
            : inv.status === "paid"
            ? "paid"
            : "unpaid";

        const lineItems = (inv.items || []).map((it) => {
          const isNonGst =
            typeof it.description === "string" &&
            (it.description.toLowerCase().includes("non-gst") ||
              it.description.toLowerCase().includes("stamp") ||
              it.description.toLowerCase().includes("court fee") ||
              it.description.toLowerCase().includes("registry"));
          const price = Number(it.price) || 0;
          const qty = it.quantity || 1;
          const subtotal = price * qty;
          const gstRate = isNonGst ? 0 : 18;
          const gstAmount = isNonGst ? 0 : Math.round(subtotal * 0.18 * 100) / 100;

          return {
            id: it.id,
            description: it.description,
            quantity: qty,
            price,
            amount: subtotal,
            isGstApplicable: !isNonGst,
            gstRate,
            gstAmount,
            total: subtotal + gstAmount,
          };
        });

        const taxableSubtotal = lineItems
          .filter((li) => li.isGstApplicable)
          .reduce((sum: number, li) => sum + li.amount, 0);

        const nonTaxableSubtotal = lineItems
          .filter((li) => !li.isGstApplicable)
          .reduce((sum: number, li) => sum + li.amount, 0);

        const totalGst = lineItems.reduce((sum: number, li) => sum + li.gstAmount, 0);
        const cgst = Math.round((totalGst / 2) * 100) / 100;
        const sgst = Math.round((totalGst / 2) * 100) / 100;

        return {
          ...inv,
          invoiceNumber: inv.invoiceNo,
          totalAmount,
          paidAmount: totalPaid,
          status: dynamicStatus,
          amount: taxableSubtotal + nonTaxableSubtotal,
          taxAmount: totalGst,
          taxableSubtotal,
          nonTaxableSubtotal,
          totalGst,
          cgst,
          sgst,
          lineItems,
          items: lineItems,
          payments: inv.payments || [],
          caseNumber: inv.case?.caseNumber || undefined,
          caseTitle: inv.case?.title || undefined,
          courtName: undefined,
          clientName:
            inv.client?.companyName ||
            `${inv.client?.firstName || ""} ${inv.client?.lastName || ""}`.trim() ||
            "Client",
          clientEmail: inv.client?.email || undefined,
          clientPhone: inv.client?.phone || undefined,
          clientAddress: [inv.client?.address, inv.client?.city, inv.client?.state]
            .filter(Boolean)
            .join(", ") || undefined,
          officeName: inv.office?.name || undefined,
          firmName: inv.tenant?.name || "Advocate Legal Chambers",
        };
      });

      return res.status(200).json(
        ResponseHandler(200, "Client invoices fetched successfully", formattedInvoices)
      );
    } catch (error) {
      console.error("Get client invoices error:", error);
      return next(CustomErrorHandler.serverError());
    }
  },

  // CREATE INVOICE RAZORPAY ORDER (Supports Full or Part/Hearing Payment)
  async createInvoiceRazorpayOrder(req: Request, res: Response, next: NextFunction) {
    try {
      const { invoiceId } = req.params;
      const clientId = req.clientUser?.clientId;
      const customAmount = req.body.amount ? Number(req.body.amount) : undefined;

      const invoiceRecord = await db.query.invoices.findFirst({
        where: and(
          eq(invoices.id, invoiceId),
          clientId ? eq(invoices.clientId, clientId) : undefined
        ),
        with: {
          payments: true,
        },
      });

      if (!invoiceRecord) {
        return next(CustomErrorHandler.notFound("Invoice not found or access denied"));
      }

      if (invoiceRecord.status === "paid") {
        return next(CustomErrorHandler.badRequest("This invoice has already been settled and paid in full"));
      }

      const totalNum = Number(invoiceRecord.total) || 0;
      const existingPaid = (invoiceRecord.payments || []).reduce(
        (sum, p) => sum + (Number(p.amount) || 0),
        0
      );
      const remainingDue = Math.max(0, totalNum - existingPaid);

      if (remainingDue <= 0) {
        return next(CustomErrorHandler.badRequest("No balance remaining on this invoice"));
      }

      // If client chose a partial amount for hearing/milestone, validate and clamp it
      let payAmount = remainingDue;
      if (customAmount && customAmount > 0) {
        payAmount = Math.min(customAmount, remainingDue);
      }

      const amountInPaise = Math.round(payAmount * 100);
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
            payingAmount: String(payAmount),
            remainingDue: String(remainingDue),
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
          paidAmount: existingPaid,
          remainingDue,
          payingAmount: payAmount,
        })
      );
    } catch (error) {
      console.error("Create invoice razorpay order error:", error);
      return next(CustomErrorHandler.serverError());
    }
  },

  // PAY INVOICE (Online Client Part/Full Settlement via Razorpay)
  async payInvoice(req: Request, res: Response, next: NextFunction) {
    try {
      const { invoiceId } = req.params;
      const clientId = req.clientUser?.clientId;
      const {
        amount,
        paymentMethod = "Razorpay (Online)",
        razorpayPaymentId,
        razorpayOrderId,
        hearingNotes,
      } = req.body;
      const receiptNo = `RCPT-2026-${Math.floor(1000 + Math.random() * 9000)}`;

      // Security check: Clients cannot self-record offline cash or cheque payments
      if (
        paymentMethod &&
        (paymentMethod.toLowerCase().includes("cash") ||
          paymentMethod.toLowerCase().includes("cheque") ||
          paymentMethod.toLowerCase().includes("offline"))
      ) {
        return next(
          CustomErrorHandler.badRequest(
            "Clients cannot self-certify offline cash/cheque payments. Please pay online via Razorpay or deposit funds at the advocate chamber."
          )
        );
      }

      const invoiceRecord = await db.query.invoices.findFirst({
        where: and(
          eq(invoices.id, invoiceId),
          clientId ? eq(invoices.clientId, clientId) : undefined
        ),
        with: {
          payments: true,
        },
      });

      if (!invoiceRecord) {
        return next(CustomErrorHandler.notFound("Invoice not found or access denied"));
      }

      if (invoiceRecord.status === "paid") {
        return next(CustomErrorHandler.badRequest("This invoice has already been settled and paid in full"));
      }

      const totalNum = Number(invoiceRecord.total) || 0;
      const existingPaid = (invoiceRecord.payments || []).reduce(
        (sum, p) => sum + (Number(p.amount) || 0),
        0
      );
      const remainingDue = Math.max(0, totalNum - existingPaid);

      if (remainingDue <= 0) {
        return next(CustomErrorHandler.badRequest("No balance remaining on this invoice"));
      }

      let payAmount = remainingDue;
      if (amount && Number(amount) > 0) {
        payAmount = Math.min(Number(amount), remainingDue);
      }

      const isPartPayment = payAmount < remainingDue - 0.01;
      const verifiedPaymentMethod = razorpayPaymentId
        ? `Razorpay (Online) - Ref: ${razorpayPaymentId}`
        : "Razorpay (Online)";

      // 1. Insert into payments table
      const [newPayment] = await db
        .insert(payments)
        .values({
          invoiceId: invoiceRecord.id,
          amount: String(payAmount),
          paymentMethod: verifiedPaymentMethod,
        })
        .returning();

      // 2. Insert into clientLedger table
      if (invoiceRecord.clientId && invoiceRecord.tenantId) {
        await db.insert(clientLedger).values({
          tenantId: invoiceRecord.tenantId,
          clientId: invoiceRecord.clientId,
          caseId: invoiceRecord.caseId,
          invoiceId: invoiceRecord.id,
          paymentId: newPayment?.id,
          debit: "0",
          credit: String(payAmount),
          description: isPartPayment
            ? `Part Payment via ${verifiedPaymentMethod} for ${invoiceRecord.invoiceNo}${
                hearingNotes ? ` (${hearingNotes})` : ""
              }`
            : `Settlement Payment via ${verifiedPaymentMethod} for ${invoiceRecord.invoiceNo}`,
          transactionDate: new Date(),
        });
      }

      // 3. Update invoice status based on accumulated paid total
      const newTotalPaid = existingPaid + payAmount;
      const newStatus = newTotalPaid >= totalNum - 0.01 ? "paid" : "partially_paid";

      await db
        .update(invoices)
        .set({
          status: newStatus,
        })
        .where(eq(invoices.id, invoiceId));

      return res.status(200).json(
        ResponseHandler(200, isPartPayment ? "Part payment processed successfully" : "Invoice settled successfully", {
          receiptNo,
          invoiceId,
          paymentId: newPayment?.id,
          tenantId: invoiceRecord.tenantId,
          officeId: invoiceRecord.officeId,
          caseId: invoiceRecord.caseId,
          amountPaid: payAmount,
          newTotalPaid,
          remainingDue: Math.max(0, totalNum - newTotalPaid),
          status: newStatus,
        })
      );
    } catch (error) {
      console.error("Pay invoice error:", error);
      return next(CustomErrorHandler.serverError());
    }
  },

  // GET CLIENT RUNNING LEDGER (Account Statement across all cases & hearing fees)
  async getClientLedger(req: Request, res: Response, next: NextFunction) {
    try {
      const clientId = req.clientUser?.clientId;
      const tenantId = (req.query.tenantId as string) || (req.headers["x-tenant-id"] as string) || undefined;
      const caseId = (req.query.caseId as string) || undefined;

      if (!clientId) {
        return next(CustomErrorHandler.badRequest("Client identity required"));
      }

      const clientRecord = await db.query.clients.findFirst({
        where: eq(clients.id, clientId),
      });

      const effectiveTenantId = tenantId || req.clientUser?.tenantId;
      const tenantRecord = effectiveTenantId
        ? await db.query.tenants.findFirst({
            where: eq(tenants.id, effectiveTenantId),
          })
        : null;

      const ledgerRecords = await db.query.clientLedger.findMany({
        where: and(
          eq(clientLedger.clientId, clientId),
          effectiveTenantId ? eq(clientLedger.tenantId, effectiveTenantId) : undefined,
          caseId ? eq(clientLedger.caseId, caseId) : undefined
        ),
        with: {
          case: {
            columns: { id: true, caseNumber: true, title: true },
          },
          invoice: {
            columns: { id: true, invoiceNo: true, total: true, status: true, caseId: true },
            with: {
              case: {
                columns: { id: true, caseNumber: true, title: true },
              },
            },
          },
          payment: {
            columns: { id: true, paymentMethod: true, amount: true, paidAt: true },
          },
        },
        orderBy: [asc(clientLedger.transactionDate), asc(clientLedger.createdAt)],
      });

      let runningBalance = 0;
      let totalDebits = 0;
      let totalCredits = 0;

      const formattedEntries = ledgerRecords.map((entry) => {
        // Strict double-entry accounting guarantee:
        // Payment entries (has paymentId or credit > 0) are strictly credits (debit = 0).
        // Invoice entries (no paymentId) are strictly debits (credit = 0).
        let debit = entry.paymentId ? 0 : Number(entry.debit) || 0;
        let credit = entry.paymentId ? Number(entry.credit) || (entry.payment?.amount ? Number(entry.payment.amount) : 0) : 0;

        totalDebits += debit;
        totalCredits += credit;
        runningBalance = runningBalance + debit - credit;

        const resolvedCaseNumber =
          entry.case?.caseNumber || entry.invoice?.case?.caseNumber || undefined;
        const resolvedCaseTitle =
          entry.case?.title || entry.invoice?.case?.title || undefined;

        // Clean up description display
        let displayDescription = entry.description;
        if (entry.paymentId && (!displayDescription || displayDescription.startsWith("Invoice updated:"))) {
          displayDescription = `Payment Received${entry.payment?.paymentMethod ? ` via ${entry.payment.paymentMethod}` : ""}`;
        }

        return {
          id: entry.id,
          transactionDate: entry.transactionDate ? new Date(entry.transactionDate).toISOString() : new Date().toISOString(),
          description: displayDescription,
          debit,
          credit,
          runningBalance,
          caseId: entry.caseId || entry.invoice?.caseId || undefined,
          caseNumber: resolvedCaseNumber,
          caseTitle: resolvedCaseTitle,
          invoiceId: entry.invoiceId,
          invoiceNumber: entry.invoice?.invoiceNo || undefined,
          paymentId: entry.paymentId,
          paymentMethod: entry.payment?.paymentMethod || undefined,
        };
      });

      const clientName = clientRecord?.companyName || `${clientRecord?.firstName || ""} ${clientRecord?.lastName || ""}`.trim() || "Valued Client";
      const firmName = tenantRecord?.name || "Advocate Legal Chambers";

      return res.status(200).json(
        ResponseHandler(200, "Client ledger fetched successfully", {
          summary: {
            totalBilled: totalDebits,
            totalPaid: totalCredits,
            netBalanceDue: runningBalance,
          },
          clientName,
          firmName,
          entries: formattedEntries,
        })
      );
    } catch (error) {
      console.error("Get client ledger error:", error);
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

      if (!caseId) {
        return next(
          CustomErrorHandler.badRequest(
            "Please select an associated legal case. Chamber inquiries must be linked to a specific case."
          )
        );
      }

      // Verify client has access to this case and inherit tenant & office directly from case
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
      if (!caseRecord) {
        return next(CustomErrorHandler.notFound("Selected case not found"));
      }

      const tenantId = caseRecord.tenantId;
      const officeId = caseRecord.officeId;

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

      if (ticket.status === "closed") {
        return next(
          CustomErrorHandler.badRequest(
            "This support ticket is closed. Sending messages to a closed ticket is not permitted."
          )
        );
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

  async deleteNotification(req: Request, res: Response, next: NextFunction) {
    try {
      const { id } = req.params;
      const clientId = req.clientUser?.clientId;
      if (!clientId) {
        return next(CustomErrorHandler.unAuthorized("Client ID not found"));
      }

      await db
        .delete(notificationQueue)
        .where(
          and(
            eq(notificationQueue.id, id),
            eq(notificationQueue.clientId, clientId)
          )
        );

      return res.status(200).json(
        ResponseHandler(200, "Notification deleted successfully")
      );
    } catch (error) {
      console.error("Delete client notification error:", error);
      return next(CustomErrorHandler.serverError());
    }
  },

  async clearReadNotifications(req: Request, res: Response, next: NextFunction) {
    try {
      const clientId = req.clientUser?.clientId;
      if (!clientId) {
        return next(CustomErrorHandler.unAuthorized("Client ID not found"));
      }

      await db
        .delete(notificationQueue)
        .where(
          and(
            eq(notificationQueue.clientId, clientId),
            eq(notificationQueue.status, "read")
          )
        );

      return res.status(200).json(
        ResponseHandler(200, "All read notifications cleared successfully")
      );
    } catch (error) {
      console.error("Clear read client notifications error:", error);
      return next(CustomErrorHandler.serverError());
    }
  },

  // ─── CLIENT SSE STREAM (Real-time live notifications) ────────────────
  async streamNotifications(req: Request, res: Response, next: NextFunction) {
    try {
      const clientId = req.clientUser?.clientId;
      if (!clientId) {
        return next(CustomErrorHandler.unAuthorized("Client ID not found"));
      }

      // Setup SSE Headers
      res.setHeader("Content-Type", "text/event-stream");
      res.setHeader("Cache-Control", "no-cache, no-transform");
      res.setHeader("Connection", "keep-alive");
      res.setHeader("X-Accel-Buffering", "no");
      res.flushHeaders();

      // Send initial connection event
      res.write(
        `event: connected\ndata: ${JSON.stringify({
          status: "connected",
          clientId,
          time: new Date().toISOString(),
        })}\n\n`
      );

      // Event listener callback: strictly push events targeted to this client
      const onClientNotification = (item: typeof notificationQueue.$inferSelect) => {
        try {
          if (item.clientId === clientId) {
            res.write(`event: notification\ndata: ${JSON.stringify(item)}\n\n`);
          }
        } catch (err) {
          console.error("Error sending Client SSE notification frame:", err);
        }
      };

      notificationEvents.on("client_notification:new", onClientNotification);

      // Keep connection alive with heartbeat every 25s
      const heartbeatInterval = setInterval(() => {
        try {
          if (!res.writableEnded) {
            res.write(`: heartbeat\n\n`);
          } else {
            clearInterval(heartbeatInterval);
          }
        } catch {
          clearInterval(heartbeatInterval);
        }
      }, 25000);

      // Clean up when client disconnects
      req.on("close", () => {
        clearInterval(heartbeatInterval);
        notificationEvents.off("client_notification:new", onClientNotification);
        try {
          if (!res.writableEnded) {
            res.end();
          }
        } catch {
          // Socket already cleanly closed
        }
      });
    } catch (error) {
      console.error("Client SSE stream error:", error);
      return next(CustomErrorHandler.serverError());
    }
  },

  // ─── CLIENT PROFILE & ACCOUNT SETTINGS ───────────────────────────────
  async getProfile(req: Request, res: Response, next: NextFunction) {
    try {
      const clientId = req.clientUser?.clientId || req.clientUser?.clientUserId;
      if (!clientId) {
        return next(CustomErrorHandler.unAuthorized("Client identity not found"));
      }

      const client = await db.query.clients.findFirst({
        where: eq(clients.id, clientId),
      });

      if (!client) {
        return next(CustomErrorHandler.notFound("Client profile record not found"));
      }

      // Also fetch active profile engagement
      let tenantInfo = null;
      let officeInfo = null;
      if (req.clientUser?.tenantId) {
        tenantInfo = await db.query.tenants.findFirst({
          where: eq(tenants.id, req.clientUser.tenantId),
        });
      }

      const { passwordHash, ...sanitizedClient } = client;

      return res.status(200).json(
        ResponseHandler(200, "Client profile retrieved successfully", {
          ...sanitizedClient,
          tenant: tenantInfo ? { id: tenantInfo.id, name: tenantInfo.name } : null,
          officeId: req.clientUser?.officeId || null,
        })
      );
    } catch (error) {
      console.error("Get client profile error:", error);
      return next(CustomErrorHandler.serverError());
    }
  },

  async updateProfile(req: Request, res: Response, next: NextFunction) {
    try {
      const clientId = req.clientUser?.clientId || req.clientUser?.clientUserId;
      if (!clientId) {
        return next(CustomErrorHandler.unAuthorized("Client identity not found"));
      }

      const { firstName, lastName, phone, companyName, address, city, state, country } = req.body;

      if (!firstName || !firstName.trim()) {
        return next(CustomErrorHandler.badRequest("First name is required"));
      }

      const updated = await db
        .update(clients)
        .set({
          firstName: firstName.trim(),
          lastName: lastName ? lastName.trim() : null,
          phone: phone ? phone.trim() : null,
          companyName: companyName ? companyName.trim() : null,
          address: address ? address.trim() : null,
          city: city ? city.trim() : null,
          state: state ? state.trim() : null,
          country: country ? country.trim() : null,
        })
        .where(eq(clients.id, clientId))
        .returning();

      if (!updated.length) {
        return next(CustomErrorHandler.notFound("Client not found"));
      }

      const { passwordHash, ...sanitizedClient } = updated[0];

      return res.status(200).json(
        ResponseHandler(200, "Profile updated successfully", sanitizedClient)
      );
    } catch (error) {
      console.error("Update client profile error:", error);
      return next(CustomErrorHandler.serverError());
    }
  },

  async changePassword(req: Request, res: Response, next: NextFunction) {
    try {
      const clientId = req.clientUser?.clientId || req.clientUser?.clientUserId;
      if (!clientId) {
        return next(CustomErrorHandler.unAuthorized("Client identity not found"));
      }

      const { currentPassword, newPassword } = req.body;

      if (!currentPassword || !newPassword) {
        return next(CustomErrorHandler.badRequest("Current password and new password are required"));
      }

      if (newPassword.length < 6) {
        return next(CustomErrorHandler.badRequest("New password must be at least 6 characters long"));
      }

      const client = await db.query.clients.findFirst({
        where: eq(clients.id, clientId),
      });

      if (!client || !client.passwordHash) {
        return next(CustomErrorHandler.unAuthorized("Client account not found"));
      }

      const isValid = await bcrypt.compare(currentPassword, client.passwordHash);
      if (!isValid) {
        return next(CustomErrorHandler.badRequest("Current password does not match"));
      }

      const newHash = await bcrypt.hash(newPassword, 10);

      await db
        .update(clients)
        .set({ passwordHash: newHash })
        .where(eq(clients.id, clientId));

      return res.status(200).json(
        ResponseHandler(200, "Password changed successfully")
      );
    } catch (error) {
      console.error("Change client password error:", error);
      return next(CustomErrorHandler.serverError());
    }
  },
};

export default clientPortalController;
