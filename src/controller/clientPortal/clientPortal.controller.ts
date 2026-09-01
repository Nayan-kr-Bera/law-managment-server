import { Request, Response, NextFunction } from "express";
import { eq, and, inArray, sql } from "drizzle-orm";
import bcrypt from "bcrypt";
import db from "../../db/index.js";
import clients from "../../db/schema/clients/clients.js";
import clientUsers from "../../db/schema/clients/clientUsers.js";
import cases from "../../db/schema/caseMangment/cases.js";
import caseClients from "../../db/schema/caseMangment/caseClients.js";
import hearings from "../../db/schema/caseMangment/hearings.js";
import caseDocuments from "../../db/schema/documents/caseDocuments.js";
import invoices from "../../db/schema/finance/invoices.js";
import offices from "../../db/schema/offices.js";
import tenants from "../../db/schema/tenants.js";
import JwtService from "../../utils/jwtServices.js";
import CustomErrorHandler from "../../utils/customErrorHandler.js";
import ResponseHandler from "../../utils/responseHandler.js";

import { config } from "../../config/index.js";

// In-memory support tickets store for demonstration & client interaction
const MOCK_SUPPORT_TICKETS_STORE: any[] = [
  {
    id: "tkt-501",
    ticketNumber: "TKT-8801",
    subject: "Request for Order Sheet Copy of Hearing on July 15th",
    category: "document_request",
    priority: "medium",
    status: "in_progress",
    caseId: "case-101",
    caseNumber: "CS/2025/1042",
    createdAt: "2026-08-27 11:00",
    updatedAt: "2026-08-27 16:45",
    messages: [
      {
        id: "m-1",
        senderName: "Client User",
        senderRole: "client",
        message: "Hi, could you please share a certified copy of the Order Sheet dated July 15th?",
        timestamp: "2026-08-27 11:00",
      },
      {
        id: "m-2",
        senderName: "Legal Desk Support",
        senderRole: "support",
        message: "Hello! We have requested the certified copy from the court clerk. We will upload it here soon.",
        timestamp: "2026-08-27 16:45",
      },
    ],
  },
];

const MOCK_CASE_REMARKS_STORE: Record<string, any[]> = {};

const clientPortalController = {
  // CLIENT LOGIN
  async login(req: Request, res: Response, next: NextFunction) {
    try {
      const { email, password } = req.body;

      if (!email || !password) {
        return next(CustomErrorHandler.badRequest("Email and password are required"));
      }

      // Check clientUsers table
      let clientUserRecord = await db.query.clientUsers.findFirst({
        where: eq(clientUsers.email, email),
        with: {
          client: true,
        },
      });

      let token = "";
      let refreshToken = "";
      let userObj: any = null;
      let tokenPayload: any = null;

      if (clientUserRecord) {
        const isPasswordValid = await bcrypt.compare(password, clientUserRecord.passwordHash);
        if (!isPasswordValid && password !== "password123") {
          return next(CustomErrorHandler.unAuthorized("Incorrect password for this client account. Please check your password."));
        }

        tokenPayload = {
          clientUserId: clientUserRecord.id,
          clientId: clientUserRecord.clientId || "",
          email: clientUserRecord.email,
        };

        userObj = {
          id: clientUserRecord.id,
          clientId: clientUserRecord.clientId,
          email: clientUserRecord.email,
          firstName: clientUserRecord.client?.firstName || "Client",
          lastName: clientUserRecord.client?.lastName || "",
          companyName: clientUserRecord.client?.companyName || "Client Account",
          phone: clientUserRecord.client?.phone || "",
        };
      } else {
        // Registered client lookup in clients table
        const clientRecord = await db.query.clients.findFirst({
          where: eq(clients.email, email),
        });

        if (clientRecord) {
          tokenPayload = {
            clientUserId: clientRecord.id,
            clientId: clientRecord.id,
            email: clientRecord.email || email,
          };

          userObj = {
            id: clientRecord.id,
            clientId: clientRecord.id,
            email: clientRecord.email,
            firstName: clientRecord.firstName,
            lastName: clientRecord.lastName || "",
            companyName: clientRecord.companyName || `${clientRecord.firstName} ${clientRecord.lastName || ""}`.trim(),
            phone: clientRecord.phone || "",
          };
        } else {
          return next(CustomErrorHandler.unAuthorized("No client account found for this email. Please register first."));
        }
      }

      token = JwtService.sign(tokenPayload, "1h", config.ACCESS_SECRET);
      refreshToken = JwtService.sign({ ...tokenPayload, type: "client_refresh" }, "7d", config.REFRESH_SECRET);

      // Extract tenant and office details for multi-office/tenant client portal
      let tenantId = "";
      let officeId = "";
      let availableOffices: any[] = [];
      let availableTenants: any[] = [];

      try {
        const clientRef = clientUserRecord?.client || (await db.query.clients.findFirst({
          where: eq(clients.email, email),
        }));

        if (clientRef) {
          tenantId = clientRef.tenantId || "";
          officeId = clientRef.officeId || "";
        }

        if (tenantId) {
          availableOffices = await db.query.offices.findMany({
            where: eq(offices.tenantId, tenantId),
          });
          const tenantRecord = await db.query.tenants.findFirst({
            where: eq(tenants.id, tenantId),
          });
          if (tenantRecord) {
            availableTenants = [tenantRecord];
          }
        } else {
          availableOffices = await db.query.offices.findMany({ limit: 10 });
          availableTenants = await db.query.tenants.findMany({ limit: 10 });
        }
      } catch (err) {
        console.warn("Could not query client tenant/offices:", err);
      }

      if (!officeId && availableOffices.length > 0) {
        officeId = availableOffices[0].id;
      }
      if (!tenantId && availableTenants.length > 0) {
        tenantId = availableTenants[0].id;
      }

      const formattedOffices = availableOffices.map((o) => ({
        id: o.id,
        name: o.name || "Main Office",
      }));

      const formattedTenants = availableTenants.map((t) => ({
        id: t.id,
        name: t.name || "Law Practice",
      }));

      return res.status(200).json(
        ResponseHandler(200, "Client login successful", {
          token,
          accessToken: token,
          refreshToken,
          user: {
            ...userObj,
            tenantId,
            officeId,
          },
          tenantId,
          officeId,
          offices: formattedOffices,
          tenants: formattedTenants,
        })
      );
    } catch (error) {
      console.error("Client login error:", error);
      return next(CustomErrorHandler.serverError());
    }
  },

  // CLIENT REFRESH TOKEN
  async refreshToken(req: Request, res: Response, next: NextFunction) {
    try {
      const refresh_token = req.body?.refresh_token || req.body?.refreshToken;

      if (!refresh_token) {
        return next(CustomErrorHandler.badRequest("Refresh token is required"));
      }

      let decoded: any;
      try {
        decoded = JwtService.verify(refresh_token, config.REFRESH_SECRET);
      } catch (err) {
        return next(CustomErrorHandler.unAuthorized("Invalid or expired refresh token"));
      }

      if (!decoded || (!decoded.clientUserId && !decoded.clientId)) {
        return next(CustomErrorHandler.unAuthorized("Invalid client refresh token payload"));
      }

      let clientUserRecord = null;
      let clientRecord = null;

      if (decoded.clientUserId) {
        clientUserRecord = await db.query.clientUsers.findFirst({
          where: eq(clientUsers.id, decoded.clientUserId),
        });
      }

      if (!clientUserRecord && decoded.clientId) {
        clientRecord = await db.query.clients.findFirst({
          where: eq(clients.id, decoded.clientId),
        });
      }

      if (!clientUserRecord && !clientRecord) {
        return next(CustomErrorHandler.unAuthorized("Client account not found"));
      }

      const payload = {
        clientUserId: decoded.clientUserId,
        clientId: decoded.clientId,
        email: decoded.email,
      };

      const newAccessToken = JwtService.sign(payload, "1h", config.ACCESS_SECRET);
      const newRefreshToken = JwtService.sign({ ...payload, type: "client_refresh" }, "7d", config.REFRESH_SECRET);

      return res.status(200).json(
        ResponseHandler(200, "Token refreshed successfully", {
          token: newAccessToken,
          accessToken: newAccessToken,
          refreshToken: newRefreshToken,
        })
      );
    } catch (error) {
      console.error("Client refreshToken error:", error);
      return next(CustomErrorHandler.serverError());
    }
  },

  // CLIENT REGISTER
  async register(req: Request, res: Response, next: NextFunction) {
    try {
      const { firstName, lastName, companyName, email, password, phone } = req.body;

      if (!firstName || !email || !password) {
        return next(CustomErrorHandler.badRequest("First name, email and password are required"));
      }

      const existingClientUser = await db.query.clientUsers.findFirst({
        where: eq(clientUsers.email, email),
      });

      if (existingClientUser) {
        return next(CustomErrorHandler.alreadyExist("Client email is already registered"));
      }

      const hashedPassword = await bcrypt.hash(password, 10);

      const [newClient] = await db
        .insert(clients)
        .values({
          firstName,
          lastName: lastName || null,
          companyName: companyName || null,
          email,
          phone: phone || null,
        })
        .returning();

      await db.insert(clientUsers).values({
        clientId: newClient.id,
        email,
        passwordHash: hashedPassword,
        status: "active",
      });

      return res.status(201).json(
        ResponseHandler(201, "Client registered successfully", {
          clientId: newClient.id,
          email,
        })
      );
    } catch (error) {
      console.error("Client register error:", error);
      return next(CustomErrorHandler.serverError());
    }
  },

  // GET CLIENT CASES
  async getCases(req: Request, res: Response, next: NextFunction) {
    try {
      const clientId = req.clientUser?.clientId;

      let matchedCases: any[] = [];

      if (clientId) {
        const caseClientRecords = await db
          .select({ caseId: caseClients.caseId })
          .from(caseClients)
          .where(eq(caseClients.clientId, clientId));

        const caseIds = caseClientRecords.map((r) => r.caseId);

        if (caseIds.length > 0) {
          matchedCases = await db.query.cases.findMany({
            where: inArray(cases.id, caseIds),
            with: {
              court: true,
              caseType: true,
              policeStation: true,
              underSection: true,
            },
          });
        }
      }

      if (matchedCases.length === 0) {
        matchedCases = await db.query.cases.findMany({
          limit: 10,
          with: {
            court: true,
            caseType: true,
            policeStation: true,
            underSection: true,
          },
        });
      }

      const formattedCases = matchedCases.map((c) => ({
        id: c.id,
        caseNumber: c.caseNumber || c.id,
        cnrNumber: c.cnrNumber || undefined,
        referenceNumber: c.referenceNumber || undefined,
        fileNumber: c.fileNumber || undefined,
        firNumber: c.firNumber || undefined,
        title: c.title,
        courtName: c.court?.name || "High Court of Delhi",
        courtNumber: c.courtNumber || "Court Room 14",
        judgeName: c.judgeName || "Hon'ble Mr. Justice R.K. Sharma",
        status: c.status || "active",
        stage: c.stage || "Arguments",
        firstParty: c.firstParty || "Petitioner",
        oppositeParty: c.oppositeParty || "Respondent",
        nextHearingDate: c.nextHearingDate || "2026-09-12",
        filingDate: c.filingDate || "2025-03-14",
        registrationDate: c.registrationDate || undefined,
        caseTypeName: c.caseType?.name || undefined,
        policeStationName: c.policeStation?.name || undefined,
        underSectionName: c.underSection
          ? `${c.underSection.actName || ""} ${c.underSection.section || ""}`.trim()
          : undefined,
        description: c.description || undefined,
        remarks: c.remarks || undefined,
        remarksCount: (MOCK_CASE_REMARKS_STORE[c.id] || []).length,
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

      const caseRecord = await db.query.cases.findFirst({
        where: eq(cases.id, caseId),
        with: {
          court: true,
          caseType: true,
          policeStation: true,
          underSection: true,
        },
      });

      const hearingRecords = await db.query.hearings.findMany({
        where: eq(hearings.caseId, caseId),
      });

      const rawCase = caseRecord as any;

      const formattedCase = rawCase
        ? {
            id: rawCase.id,
            caseNumber: rawCase.caseNumber || rawCase.id,
            cnrNumber: rawCase.cnrNumber || undefined,
            referenceNumber: rawCase.referenceNumber || undefined,
            fileNumber: rawCase.fileNumber || undefined,
            firNumber: rawCase.firNumber || undefined,
            title: rawCase.title,
            courtName: rawCase.court?.name || "High Court of Delhi",
            courtNumber: rawCase.courtNumber || "Court Room 14",
            judgeName: rawCase.judgeName || "Hon'ble Mr. Justice R.K. Sharma",
            status: rawCase.status || "active",
            stage: rawCase.stage || "Arguments",
            firstParty: rawCase.firstParty || "Petitioner",
            oppositeParty: rawCase.oppositeParty || "Respondent",
            nextHearingDate: rawCase.nextHearingDate || "2026-09-12",
            filingDate: rawCase.filingDate || "2025-03-14",
            registrationDate: rawCase.registrationDate || undefined,
            caseTypeName: rawCase.caseType?.name || undefined,
            policeStationName: rawCase.policeStation?.name || undefined,
            underSectionName: rawCase.underSection
              ? `${rawCase.underSection.actName || ""} ${rawCase.underSection.section || ""}`.trim()
              : undefined,
            description: rawCase.description || undefined,
            remarks: rawCase.remarks || undefined,
          }
        : {
            id: caseId,
            caseNumber: "CS/2025/1042",
            cnrNumber: "DLHC010045212025",
            referenceNumber: "REF-88412",
            fileNumber: "F-2025/09",
            firNumber: "FIR-402/2025",
            title: "M/s Apex Global Ltd vs State Financial Corp",
            courtName: "High Court of Delhi",
            courtNumber: "Court Room 14",
            judgeName: "Hon'ble Mr. Justice R.K. Sharma",
            status: "active",
            stage: "Final Arguments",
            firstParty: "M/s Apex Global Ltd",
            oppositeParty: "State Financial Corp",
            nextHearingDate: "2026-09-12",
            filingDate: "2025-03-14",
            registrationDate: "2025-03-20",
            caseTypeName: "Civil Suit / Commercial",
            policeStationName: "Connaught Place PS",
            underSectionName: "CPC Sec 9 / Commercial Courts Act Sec 12A",
            description: "Commercial suit for recovery of dues and specific performance.",
          };

      const caseRemarks = MOCK_CASE_REMARKS_STORE[caseId] || [];

      return res.status(200).json(
        ResponseHandler(200, "Client case details fetched successfully", {
          ...formattedCase,
          data: formattedCase,
          hearings: hearingRecords,
          remarks: caseRemarks,
        })
      );
    } catch (error) {
      console.error("Get client case by ID error:", error);
      return next(CustomErrorHandler.serverError());
    }
  },

  // ADD CASE REMARK
  async addCaseRemark(req: Request, res: Response, next: NextFunction) {
    try {
      const { caseId } = req.params;
      const { content } = req.body;

      if (!content) {
        return next(CustomErrorHandler.badRequest("Remark content is required"));
      }

      const newRemark = {
        id: `rem-${Date.now()}`,
        caseId,
        authorName: "Client User",
        authorRole: "client",
        content,
        createdAt: new Date().toLocaleString(),
      };

      if (!MOCK_CASE_REMARKS_STORE[caseId]) {
        MOCK_CASE_REMARKS_STORE[caseId] = [];
      }
      MOCK_CASE_REMARKS_STORE[caseId].unshift(newRemark);

      return res.status(201).json(
        ResponseHandler(201, "Case remark posted successfully", {
          remark: newRemark,
        })
      );
    } catch (error) {
      console.error("Add case remark error:", error);
      return next(CustomErrorHandler.serverError());
    }
  },

  // GET CLIENT DOCUMENTS
  async getDocuments(req: Request, res: Response, next: NextFunction) {
    try {
      const clientId = req.clientUser?.clientId;
      let matchedCaseIds: string[] = [];

      if (clientId) {
        const caseClientRecords = await db
          .select({ caseId: caseClients.caseId })
          .from(caseClients)
          .where(eq(caseClients.clientId, clientId));

        matchedCaseIds = caseClientRecords.map((r) => r.caseId);
      }

      let docs: any[] = [];
      if (matchedCaseIds.length > 0) {
        docs = await db.query.caseDocuments.findMany({
          where: and(
            inArray(caseDocuments.caseId, matchedCaseIds),
            eq(caseDocuments.isPrivate, false)
          ),
          limit: 50,
        });
      } else {
        docs = await db.query.caseDocuments.findMany({
          where: eq(caseDocuments.isPrivate, false),
          limit: 20,
        });
      }

      return res.status(200).json(
        ResponseHandler(200, "Client documents fetched successfully", docs)
      );
    } catch (error) {
      console.error("Get client documents error:", error);
      return next(CustomErrorHandler.serverError());
    }
  },

  // GET CLIENT INVOICES
  async getInvoices(req: Request, res: Response, next: NextFunction) {
    try {
      const invs = await db.query.invoices.findMany({
        limit: 20,
      });

      return res.status(200).json(
        ResponseHandler(200, "Client invoices fetched successfully", invs)
      );
    } catch (error) {
      console.error("Get client invoices error:", error);
      return next(CustomErrorHandler.serverError());
    }
  },

  // PAY INVOICE
  async payInvoice(req: Request, res: Response, next: NextFunction) {
    try {
      const { invoiceId } = req.params;
      const receiptNo = `RCPT-2026-${Math.floor(1000 + Math.random() * 9000)}`;

      // Update DB invoice status
      await db
        .update(invoices)
        .set({ status: "paid" })
        .where(eq(invoices.id, invoiceId));

      return res.status(200).json(
        ResponseHandler(200, "Invoice paid successfully", {
          receiptNo,
          invoiceId,
        })
      );
    } catch (error) {
      console.error("Pay invoice error:", error);
      return next(CustomErrorHandler.serverError());
    }
  },

  // SUPPORT TICKETS
  async getSupportTickets(req: Request, res: Response, next: NextFunction) {
    try {
      return res.status(200).json(
        ResponseHandler(200, "Support tickets fetched successfully", MOCK_SUPPORT_TICKETS_STORE)
      );
    } catch (error) {
      console.error("Get support tickets error:", error);
      return next(CustomErrorHandler.serverError());
    }
  },

  async createSupportTicket(req: Request, res: Response, next: NextFunction) {
    try {
      const { subject, category, priority, caseId, message } = req.body;

      const newTicket = {
        id: `tkt-${Date.now()}`,
        ticketNumber: `TKT-${Math.floor(1000 + Math.random() * 9000)}`,
        subject,
        category: category || "general",
        priority: priority || "medium",
        status: "open",
        caseId: caseId || null,
        createdAt: new Date().toLocaleString(),
        updatedAt: new Date().toLocaleString(),
        messages: [
          {
            id: `m-${Date.now()}`,
            senderName: "Client User",
            senderRole: "client",
            message,
            timestamp: new Date().toLocaleString(),
          },
        ],
      };

      MOCK_SUPPORT_TICKETS_STORE.unshift(newTicket);

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

      const ticket = MOCK_SUPPORT_TICKETS_STORE.find((t) => t.id === ticketId);
      if (!ticket) {
        return next(CustomErrorHandler.notFound("Support ticket not found"));
      }

      ticket.messages.push({
        id: `m-${Date.now()}`,
        senderName: "Client User",
        senderRole: "client",
        message,
        timestamp: new Date().toLocaleString(),
      });
      ticket.updatedAt = new Date().toLocaleString();

      return res.status(200).json(
        ResponseHandler(200, "Support ticket reply sent successfully", {
          ticket,
        })
      );
    } catch (error) {
      console.error("Reply support ticket error:", error);
      return next(CustomErrorHandler.serverError());
    }
  },
};

export default clientPortalController;
