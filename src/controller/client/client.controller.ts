import bcrypt from "bcrypt";
import { and, desc, eq, ilike, inArray, isNotNull, or, sql } from "drizzle-orm";
import { NextFunction, Request, Response } from "express";
import db from "../../db/index.js";
import {
  caseClients,
  cases,
  caseTypes,
  clientLedger,
  clients,
  clientUsers,
  invoices,
  payments,
} from "../../db/schema/index.js";
import CustomErrorHandler from "../../utils/customErrorHandler.js";
import clientEmailService from "../../services/clientEmail.service.js";

const clientController = {
  async getClients(req: Request, res: Response, next: NextFunction) {
    try {
      const { tenantId } = req.user;

      const page = Number(req.query.page ?? 1);
      const limit = Number(req.query.limit ?? 10);
      const search = String(req.query.search ?? "").trim();

      const filters = [eq(clients.tenantId, tenantId)];

      if (search) {
        filters.push(
          or(
            ilike(clients.firstName, `%${search}%`),
            ilike(clients.lastName, `%${search}%`),
            ilike(clients.email, `%${search}%`),
            ilike(clients.phone, `%${search}%`),
            ilike(clients.companyName, `%${search}%`),
          )!,
        );
      }

      const [{ total }] = await db
        .select({
          total: sql<number>`count(*)`,
        })
        .from(clients)
        .where(and(...filters));

      const data = await db
        .select({
          id: clients.id,
          tenantId: clients.tenantId,
          officeId: clients.officeId,
          companyName: clients.companyName,
          firstName: clients.firstName,
          lastName: clients.lastName,
          email: clients.email,
          phone: clients.phone,
          address: clients.address,
          city: clients.city,
          state: clients.state,
          country: clients.country,
          notes: clients.notes,
          createdBy: clients.createdBy,
          createdAt: clients.createdAt,

          caseCount: sql<number>`count(${caseClients.caseId})`,
        })
        .from(clients)
        .leftJoin(caseClients, eq(caseClients.clientId, clients.id))
        .where(and(...filters))
        .groupBy(clients.id)
        .orderBy(desc(clients.createdAt))
        .limit(limit)
        .offset((page - 1) * limit);

      const totalCount = Number(total);

      return res.status(200).json({
        success: true,
        data: {
          clients: data,
          pagination: {
            page,
            limit,
            total: totalCount,
            totalPages: Math.ceil(totalCount / limit),
          },
        },
      });
    } catch (error) {
      next(error);
    }
  },
  async getClient(req: Request, res: Response, next: NextFunction) {
    try {
      const { id } = req.params;
      const { tenantId } = req.user;

      const client = await db.query.clients.findFirst({
        where: (table, { and, eq }) =>
          and(eq(table.id, id), eq(table.tenantId, tenantId)),
      });

      if (!client) {
        return res.status(404).json({
          success: false,
          message: "Client not found",
        });
      }

      return res.status(200).json({
        success: true,
        data: client,
      });
    } catch (error) {
      next(error);
    }
  },
  async createClient(req: Request, res: Response, next: NextFunction) {
    try {
      const {
        officeId,
        companyName,
        firstName,
        lastName,
        email,
        phone,
        address,
        city,
        state,
        country,
        notes,
        password,
      } = req.body;

      const { userId, tenantId } = req.user;
      const exitingclient = await db.query.clients.findFirst({
        where: and(eq(clients.tenantId, tenantId), eq(clients.email, email)),
      });
      if (exitingclient) {
        return res.status(400).json({
          success: false,
          message: "Client with this email already exists",
        });
      }
      const exitingemailemail = await db.query.clients.findFirst({
        where: eq(clients.email, email),
      });
      if (exitingemailemail) {
        return res.status(400).json({
          success: false,
          message: "Client with this email already exists",
        });
      }

      const exitingclientPhone = await db.query.clients.findFirst({
        where: eq(clients.phone, phone),
      });
      if (exitingclientPhone) {
        return res.status(400).json({
          success: false,
          message: "Client with this phone number already exists",
        });
      }
      await db.transaction(async (tx) => {
        const [client] = await tx
          .insert(clients)
          .values({
            tenantId,
            officeId,
            companyName,
            firstName,
            lastName,
            email,
            phone,
            address,
            city,
            state,
            country,
            notes,
            createdBy: userId,
          })
          .returning();

        const passwordHash = await bcrypt.hash(password, 10);

        await tx.insert(clientUsers).values({
          clientId: client.id,
          email,
          passwordHash,
        });
        if (email) {
          await clientEmailService({
            clientName: `${firstName} ${lastName}`.trim(),
            clientEmail: email,
            password,
          });
        }
        return res.status(201).json({
          success: true,
          message: "Client created successfully.",
          data: client,
        });
      });
    } catch (err) {
      next(err);
    }
  },
  async assignCasesToClient(req: Request, res: Response, next: NextFunction) {
    try {
      const { clientId } = req.params;
      const { caseIds } = req.body;

      if (!Array.isArray(caseIds) || caseIds.length === 0) {
        return res.status(400).json({
          success: false,
          message: "caseIds must be a non-empty array.",
        });
      }

      // Verify all cases exist
      const existingCases = await db
        .select({
          id: cases.id,
        })
        .from(cases)
        .where(inArray(cases.id, caseIds));

      if (existingCases.length !== caseIds.length) {
        return res.status(404).json({
          success: false,
          message: "One or more selected cases do not exist.",
        });
      }

      // Find already assigned cases
      const assignedCases = await db
        .select({
          caseId: caseClients.caseId,
        })
        .from(caseClients)
        .where(
          and(
            eq(caseClients.clientId, clientId),
            inArray(caseClients.caseId, caseIds),
          ),
        );

      const assignedIds = new Set(assignedCases.map((c) => c.caseId));

      const rows = caseIds
        .filter((id) => !assignedIds.has(id))
        .map((caseId) => ({
          clientId,
          caseId,
        }));

      if (rows.length > 0) {
        await db.insert(caseClients).values(rows);
      }

      return res.status(200).json({
        success: true,
        message: `${rows.length} case(s) associated successfully.`,
        added: rows.length,
        skipped: assignedIds.size,
      });
    } catch (error) {
      next(error);
    }
  },
  async removeCasesFromClient(req: Request, res: Response, next: NextFunction) {
    try {
      const { clientId } = req.params;
      const { caseIds } = req.body;

      if (!Array.isArray(caseIds) || caseIds.length === 0) {
        return res.status(400).json({
          success: false,
          message: "caseIds must be a non-empty array.",
        });
      }

      const removedCases = await db
        .delete(caseClients)
        .where(
          and(
            eq(caseClients.clientId, clientId),
            inArray(caseClients.caseId, caseIds),
          ),
        )
        .returning({
          caseId: caseClients.caseId,
        });

      return res.status(200).json({
        success: true,
        message: `${removedCases.length} case(s) removed successfully.`,
        removed: removedCases.length,
        removedCaseIds: removedCases.map((item) => item.caseId),
      });
    } catch (error) {
      next(error);
    }
  },
  async getClientCases(req: Request, res: Response, next: NextFunction) {
    try {
      const { clientId } = req.params;

      const page = Math.max(Number(req.query.page ?? 1), 1);
      const limit = Math.max(Number(req.query.limit ?? 10), 1);
      const search = String(req.query.search ?? "").trim();
      const status = String(req.query.status ?? "")
        .trim()
        .toLowerCase();

      const filters = [eq(caseClients.clientId, clientId)];

      /*
       * SEARCH FILTER
       */

      if (search) {
        filters.push(
          or(
            ilike(cases.cnrNumber, `%${search}%`),
            ilike(cases.caseNumber, `%${search}%`),
            ilike(cases.firstParty, `%${search}%`),
            ilike(cases.oppositeParty, `%${search}%`),
          )!,
        );
      }

      /*
       * STATUS FILTER
       * all
       * running
       * decided
       * pending-fees
       * Database:
       * Running:
       *   isDecided = false
       *   isAbandoned = false
       *   isArchived = false
       *
       * Decided / Abandoned:
       *   isDecided = true
       *   OR isAbandoned = true
       */

      switch (status) {
        case "running":
          filters.push(
            eq(cases.isDecided, false),
            eq(cases.isAbandoned, false),
            eq(cases.isArchived, false),
          );
          break;

        case "decided":
        case "decided/abandoned":
          filters.push(
            or(eq(cases.isDecided, true), eq(cases.isAbandoned, true))!,
          );
          break;

        case "all":
        case "":
          // No status filter
          break;

        default:
          return res.status(400).json({
            success: false,
            message: `Invalid status filter: ${status}`,
          });
      }

      /*
       * TOTAL
       */

      const [{ total }] = await db
        .select({
          total: sql<number>`count(*)`,
        })
        .from(caseClients)
        .innerJoin(cases, eq(caseClients.caseId, cases.id))
        .where(and(...filters));

      /*
       * DATA
       */

      const data = await db
        .select({
          id: cases.id,

          cnrNumber: cases.cnrNumber,

          referenceNumber: cases.referenceNumber,

          caseNumber: cases.caseNumber,

          year: cases.year,

          firstParty: cases.firstParty,

          oppositeParty: cases.oppositeParty,

          courtNumber: cases.courtNumber,

          nextDate: cases.nextHearingDate,

          caseType: caseTypes.name,

          status: cases.status,

          isDecided: cases.isDecided,

          isAbandoned: cases.isAbandoned,

          isArchived: cases.isArchived,

          updatedAt: cases.updatedAt,
        })
        .from(caseClients)
        .innerJoin(cases, eq(caseClients.caseId, cases.id))
        .leftJoin(caseTypes, eq(cases.caseTypeId, caseTypes.id))
        .where(and(...filters))
        .orderBy(desc(cases.updatedAt))
        .limit(limit)
        .offset((page - 1) * limit);

      /*
       * RESPONSE
       */

      return res.status(200).json({
        success: true,

        data,

        pagination: {
          page,
          limit,
          total: Number(total),
          totalPages: Math.ceil(Number(total) / limit),
        },
      });
    } catch (error) {
      next(error);
    }
  },
  async updateClient(req: Request, res: Response, next: NextFunction) {
    try {
      const { id } = req.params;

      const {
        officeId,
        companyName,
        firstName,
        lastName,
        email,
        phone,
        address,
        city,
        state,
        country,
        notes,
      } = req.body;

      const { tenantId } = req.user;

      const client = await db.query.clients.findFirst({
        where: and(eq(clients.id, id), eq(clients.tenantId, tenantId)),
      });

      if (!client) {
        return res.status(404).json({
          success: false,
          message: "Client not found.",
        });
      }

      const emailExists = await db.query.clients.findFirst({
        where: and(eq(clients.email, email), sql`${clients.id} <> ${id}`),
      });

      if (emailExists) {
        return res.status(400).json({
          success: false,
          message: "Client with this email already exists.",
        });
      }

      const phoneExists = await db.query.clients.findFirst({
        where: and(eq(clients.phone, phone), sql`${clients.id} <> ${id}`),
      });

      if (phoneExists) {
        return res.status(400).json({
          success: false,
          message: "Client with this phone number already exists.",
        });
      }

      const [updatedClient] = await db
        .update(clients)
        .set({
          officeId,
          companyName,
          firstName,
          lastName,
          email,
          phone,
          address,
          city,
          state,
          country,
          notes,
        })
        .where(and(eq(clients.id, id), eq(clients.tenantId, tenantId)))
        .returning();

      await db
        .update(clientUsers)
        .set({
          email,
        })
        .where(eq(clientUsers.clientId, id));

      return res.status(200).json({
        success: true,
        message: "Client updated successfully.",
        data: updatedClient,
      });
    } catch (error) {
      next(error);
    }
  },
  async deleteClient(req: Request, res: Response, next: NextFunction) {
    try {
      const { id } = req.params;
      const { tenantId } = req.user;

      const client = await db.query.clients.findFirst({
        where: and(eq(clients.id, id), eq(clients.tenantId, tenantId)),
      });

      if (!client) {
        return res.status(404).json({
          success: false,
          message: "Client not found.",
        });
      }

      await db.transaction(async (tx) => {
        await tx.delete(caseClients).where(eq(caseClients.clientId, id));

        await tx.delete(clientUsers).where(eq(clientUsers.clientId, id));

        await tx.delete(clients).where(eq(clients.id, id));
      });

      return res.status(200).json({
        success: true,
        message: "Client deleted successfully.",
      });
    } catch (error) {
      next(error);
    }
  },
  async getClientCaseSummary(req: Request, res: Response, next: NextFunction) {
    try {
      const { clientId } = req.params;

      if (!clientId) {
        return res.status(400).json({
          success: false,
          message: "Client ID is required",
        });
      }

      /*
       * 1. CASE STATUS COUNTS
       * All Cases
       * Running Cases
       * Decided / Abandoned Cases
       */

      const statusResult = await db
        .select({
          all: sql<number>`count(*)`,

          running: sql<number>`
          count(*) FILTER (
            WHERE
              ${cases.isDecided} = false
              AND ${cases.isAbandoned} = false
              AND ${cases.isArchived} = false
          )
        `,

          decidedAbandoned: sql<number>`
          count(*) FILTER (
            WHERE
              ${cases.isDecided} = true
              OR ${cases.isAbandoned} = true
          )
        `,
        })
        .from(cases)
        .innerJoin(caseClients, eq(caseClients.caseId, cases.id))
        .where(eq(caseClients.clientId, clientId));

      const allCases = Number(statusResult[0]?.all ?? 0);
      const runningCases = Number(statusResult[0]?.running ?? 0);
      const decidedAbandonedCases = Number(
        statusResult[0]?.decidedAbandoned ?? 0,
      );

      /*
       * 2. TOTAL FEES + PAID FEES
       * We first calculate payment total for each invoice.
       * This prevents duplicate invoice totals when an invoice
       * has multiple payments.
       */

      const paymentSubQuery = db
        .select({
          invoiceId: payments.invoiceId,

          paidAmount: sql<string>`
          COALESCE(SUM(${payments.amount}), 0)
        `.as("paid_amount"),
        })
        .from(payments)
        .groupBy(payments.invoiceId)
        .as("payment_totals");

      const feeResult = await db
        .select({
          totalFees: sql<string>`
          COALESCE(SUM(${invoices.total}), 0)
        `,

          totalPaid: sql<string>`
          COALESCE(
            SUM(
              COALESCE(${paymentSubQuery.paidAmount}, 0)
            ),
            0
          )
        `,
        })
        .from(invoices)
        .innerJoin(caseClients, eq(caseClients.caseId, invoices.caseId))
        .leftJoin(paymentSubQuery, eq(paymentSubQuery.invoiceId, invoices.id))
        .where(eq(caseClients.clientId, clientId));

      const totalFees = Number(feeResult[0]?.totalFees ?? 0);

      const totalPaid = Number(feeResult[0]?.totalPaid ?? 0);

      const totalPending = Math.max(totalFees - totalPaid, 0);

      /*
       * 3. PENDING FEE CASE
       * A case is considered pending fee when:
       * Total invoice amount > Total payments
       * Example:
       * Invoice = 10,000
       * Paid    = 7,000
       * Pending = 3,000
       * Therefore this case belongs to Pending Fee Cases.
       */

      const pendingFeeCasesResult = await db
        .select({
          count: sql<number>`
          COUNT(*)
        `,
        })
        .from(
          db
            .select({
              caseId: invoices.caseId,

              totalFees: sql<string>`
              COALESCE(SUM(${invoices.total}), 0)
            `.as("total_fees"),

              totalPaid: sql<string>`
              COALESCE(
                SUM(
                  COALESCE(${paymentSubQuery.paidAmount}, 0)
                ),
                0
              )
            `.as("total_paid"),
            })
            .from(invoices)
            .innerJoin(caseClients, eq(caseClients.caseId, invoices.caseId))
            .leftJoin(
              paymentSubQuery,
              eq(paymentSubQuery.invoiceId, invoices.id),
            )
            .where(eq(caseClients.clientId, clientId))
            .groupBy(invoices.caseId)
            .as("case_fee_totals"),
        )
        .where(sql`total_fees > total_paid`);

      const pendingFeeCases = Number(pendingFeeCasesResult[0]?.count ?? 0);

      /*
       * 4. RESPONS
       */

      return res.status(200).json({
        success: true,
        message: "Client case summary fetched successfully",

        data: {
          statusCounts: {
            all: allCases,
            running: runningCases,
            decidedAbandoned: decidedAbandonedCases,
            pendingFee: pendingFeeCases,
          },

          fees: {
            total: totalFees,
            paid: totalPaid,
            pending: totalPending,
          },
        },
      });
    } catch (error) {
      console.error("Get Client Case Summary Error:", error);

      return next(CustomErrorHandler.serverError());
    }
  },
  async getClientPendingFees(req: Request, res: Response, next: NextFunction) {
    try {
      const { clientId } = req.params;
      console.log("params get", req.params);
      console.log("client id", clientId);
      const page = Math.max(Number(req.query.page) || 1, 1);
      const limit = Math.max(Number(req.query.limit) || 10, 1);
      const search = String(req.query.search || "").trim();

      if (!clientId) {
        return res.status(400).json({
          success: false,
          message: "Client ID is required",
        });
      }

      const offset = (page - 1) * limit;

      /*
       * 1. PAYMENT TOTAL PER INVOICE
       */

      const paymentSubQuery = db
        .select({
          invoiceId: payments.invoiceId,

          paidAmount: sql<string>`
          COALESCE(SUM(${payments.amount}), 0)
        `.as("paid_amount"),
        })
        .from(payments)
        .groupBy(payments.invoiceId)
        .as("payment_totals");

      /*
       * 2. TOTAL FEES / PAID FEES PER CASE
       */

      const caseFeeSubQuery = db
        .select({
          caseId: invoices.caseId,

          totalFees: sql<string>`
          COALESCE(SUM(${invoices.total}), 0)
        `.as("total_fees"),

          feesPaid: sql<string>`
          COALESCE(
            SUM(
              COALESCE(${paymentSubQuery.paidAmount}, 0)
            ),
            0
          )
        `.as("fees_paid"),
        })
        .from(invoices)
        .leftJoin(paymentSubQuery, eq(paymentSubQuery.invoiceId, invoices.id))
        .where(isNotNull(invoices.caseId))
        .groupBy(invoices.caseId)
        .as("case_fee_totals");

      /*
       * 3. BASE CONDITION
       */

      const conditions = [
        eq(caseClients.clientId, clientId),
        sql`
        ${caseFeeSubQuery.totalFees} >
        ${caseFeeSubQuery.feesPaid}
      `,
      ];

      /*
       * Search by:
       * - case number
       * - first party
       * - opposite party
       */

      if (search) {
        conditions.push(
          or(
            ilike(cases.caseNumber, `%${search}%`),
            ilike(cases.firstParty, `%${search}%`),
            ilike(cases.oppositeParty, `%${search}%`),
          )!,
        );
      }

      /*
       * 4. TOTAL COUNT
       */

      const countResult = await db
        .select({
          count: sql<number>`COUNT(*)`,
        })
        .from(caseClients)
        .innerJoin(
          caseFeeSubQuery,
          eq(caseFeeSubQuery.caseId, caseClients.caseId),
        )
        .innerJoin(cases, eq(cases.id, caseClients.caseId))
        .where(and(...conditions));

      const total = Number(countResult[0]?.count ?? 0);

      /*
       * 5. FETCH PAGINATED CASES
       */

      const pendingCases = await db
        .select({
          id: cases.id,

          caseNumber: cases.caseNumber,

          firstParty: cases.firstParty,

          oppositeParty: cases.oppositeParty,

          totalFees: sql<string>`
          ${caseFeeSubQuery.totalFees}
        `,

          feesPaid: sql<string>`
          ${caseFeeSubQuery.feesPaid}
        `,

          feesPending: sql<string>`
          (
            ${caseFeeSubQuery.totalFees} -
            ${caseFeeSubQuery.feesPaid}
          )
        `,
        })
        .from(caseClients)
        .innerJoin(
          caseFeeSubQuery,
          eq(caseFeeSubQuery.caseId, caseClients.caseId),
        )
        .innerJoin(cases, eq(cases.id, caseClients.caseId))
        .where(and(...conditions))
        .orderBy(cases.caseNumber)
        .limit(limit)
        .offset(offset);

      /*
       * 6. RESPONSE
       */

      const totalPages = Math.ceil(total / limit);

      return res.status(200).json({
        success: true,
        message: "Client pending fee cases fetched successfully",

        data: pendingCases.map((item) => ({
          id: item.id,
          caseNumber: item.caseNumber,
          firstParty: item.firstParty,
          oppositeParty: item.oppositeParty,

          totalFees: Number(item.totalFees ?? 0),
          feesPaid: Number(item.feesPaid ?? 0),
          feesPending: Number(item.feesPending ?? 0),
        })),

        pagination: {
          page,
          limit,
          total,
          totalPages,
        },
      });
    } catch (error) {
      console.error("Get Client Pending Fees Error:", error);

      return next(CustomErrorHandler.serverError());
    }
  },
  async getClientFeeLedger(req: Request, res: Response, next: NextFunction) {
    try {
      const { clientId } = req.params;
      const tenantId = req.user.tenantId;

      const page = Math.max(Number(req.query.page) || 1, 1);
      const limit = Math.max(Number(req.query.limit) || 10, 1);
      const search = String(req.query.search || "")
        .trim()
        .toLowerCase();

      if (!clientId) {
        return res.status(400).json({
          success: false,
          message: "Client ID is required",
        });
      }

      // Verify client
      const client = await db.query.clients.findFirst({
        where: and(eq(clients.id, clientId), eq(clients.tenantId, tenantId)),
      });

      if (!client) {
        return res.status(404).json({
          success: false,
          message: "Client not found",
        });
      }

      // Get ledger
      const ledger = await db.query.clientLedger.findMany({
        where: and(
          eq(clientLedger.clientId, clientId),
          eq(clientLedger.tenantId, tenantId),
        ),
        with: {
          case: true,
          invoice: true,
          payment: true,
        },
        orderBy: (ledger, { asc }) => [asc(ledger.transactionDate)],
      });

      // Search
      const filteredLedger = search
        ? ledger.filter((entry) => {
            const searchText = [
              entry.description,
              entry.case?.caseNumber,
              entry.case?.firstParty,
              entry.case?.oppositeParty,
              entry.invoice?.invoiceNo,
              entry.payment?.paymentMethod,
            ]
              .filter(Boolean)
              .join(" ")
              .toLowerCase();

            return searchText.includes(search);
          })
        : ledger;

      // Running balance
      let balance = 0;

      const ledgerWithBalance = filteredLedger.map((entry) => {
        const billed = Number(entry.debit || 0);
        const paid = Number(entry.credit || 0);

        balance += billed - paid;

        return {
          id: entry.id,
          date: entry.transactionDate,
          caseNumber: entry.case?.caseNumber ?? null,
          firstParty: entry.case?.firstParty ?? null,
          oppositeParty: entry.case?.oppositeParty ?? null,
          description: entry.description,
          mode:
            entry.payment?.paymentMethod ??
            (entry.invoice ? "Invoice" : "Ledger"),
          billed,
          paid,
          balance,
        };
      });

      // Pagination
      const total = ledgerWithBalance.length;
      const totalPages = Math.ceil(total / limit);
      const offset = (page - 1) * limit;

      return res.status(200).json({
        success: true,
        message: "Client fee ledger fetched successfully",
        data: ledgerWithBalance.slice(offset, offset + limit),
        pagination: {
          page,
          limit,
          total,
          totalPages,
        },
      });
    } catch (error) {
      console.error("Get Client Fee Ledger Error:", error);

      return next(CustomErrorHandler.serverError());
    }
  },
  async getclienForFrom(req: Request, res: Response, next: NextFunction) {
    try {
      const tenantId = req.user.tenantId;
      const search = String(req.query.search ?? "").trim();

      const clientsData = await db.query.clients.findMany({
        where: (clients, { and, eq, or, ilike }) =>
          and(
            eq(clients.tenantId, tenantId),
            search
              ? or(
                  ilike(clients.firstName, `%${search}%`),
                  ilike(clients.lastName, `%${search}%`),
                  ilike(clients.email, `%${search}%`),
                  ilike(clients.phone, `%${search}%`),
                  ilike(clients.companyName, `%${search}%`),
                )
              : undefined,
          ),
        columns: {
          id: true,
          firstName: true,
          lastName: true,
          companyName: true,
        },
        orderBy: (clients, { asc }) => [asc(clients.firstName)],
      });

      const data = clientsData.map((client) => ({
        id: client.id,
        name:
          `${client.firstName ?? ""} ${client.lastName ?? ""}`.trim() ||
          client.companyName ||
          "",
      }));

      return res.status(200).json({
        success: true,
        data,
      });
    } catch (error) {
      next(error);
    }
  },
};

export default clientController;
