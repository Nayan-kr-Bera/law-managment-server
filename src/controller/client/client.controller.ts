import bcrypt from "bcrypt";
import { and, desc, eq, ilike, inArray, isNotNull, or, sql, SQL } from "drizzle-orm";
import { NextFunction, Request, Response } from "express";
import db from "../../db/index.js";
import {
  caseClients,
  cases,
  caseTypes,
  clientLedger,
  clientProfiles,
  clients,
  invoices,
  payments,
} from "../../db/schema/index.js";
import CustomErrorHandler from "../../utils/customErrorHandler.js";
import clientEmailService from "../../services/clientEmail.service.js";

const clientController = {
  async getClients(req: Request, res: Response, next: NextFunction) {
    try {
      const tenantId = req.user?.tenantId;
      if (!tenantId) {
        return next(CustomErrorHandler.unAuthorized());
      }
      const page = Number(req.query.page ?? 1);
      const limit = Number(req.query.limit ?? 10);
      const search = String(req.query.search ?? "").trim();

      // Scope to this tenant's profiles — join identity through client_profiles
      const profileFilters = [eq(clientProfiles.tenantId, tenantId)];
      const identityFilters: SQL[] = [];

      if (search) {
        identityFilters.push(
          or(
            ilike(clients.firstName, `%${search}%`),
            ilike(clients.lastName, `%${search}%`),
            ilike(clients.email, `%${search}%`),
            ilike(clients.phone, `%${search}%`),
            ilike(clients.companyName, `%${search}%`),
          )!,
        );
      }

      const allFilters = identityFilters.length > 0
        ? and(...profileFilters, ...identityFilters)
        : and(...profileFilters);

      const [{ total }] = await db
        .select({ total: sql<number>`count(distinct ${clients.id})` })
        .from(clientProfiles)
        .innerJoin(clients, eq(clientProfiles.identityId, clients.id))
        .where(allFilters);

      const data = await db
        .select({
          id: clients.id,
          profileId: clientProfiles.id,
          tenantId: clientProfiles.tenantId,
          officeId: clientProfiles.officeId,
          // Firm-specific company name overrides identity's global one
          companyName: sql<string>`COALESCE(${clientProfiles.companyName}, ${clients.companyName})`,
          firstName: clients.firstName,
          lastName: clients.lastName,
          email: clients.email,
          phone: clients.phone,
          address: clients.address,
          city: clients.city,
          state: clients.state,
          country: clients.country,
          notes: sql<string>`COALESCE(${clientProfiles.notes}, ${clients.notes})`,
          profileStatus: clientProfiles.status,
          createdBy: clients.createdBy,
          createdAt: clients.createdAt,
          caseCount: sql<number>`count(distinct ${caseClients.caseId})`,
        })
        .from(clientProfiles)
        .innerJoin(clients, eq(clientProfiles.identityId, clients.id))
        .leftJoin(caseClients, eq(caseClients.clientId, clients.id))
        .where(allFilters)
        .groupBy(clients.id, clientProfiles.id)
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
      const tenantId = req.user?.tenantId;
      if (!tenantId) {
        return next(CustomErrorHandler.unAuthorized());
      }
      // Find client identity that has a profile in this tenant
      const result = await db
        .select({
          id: clients.id,
          profileId: clientProfiles.id,
          tenantId: clientProfiles.tenantId,
          officeId: clientProfiles.officeId,
          companyName: sql<string>`COALESCE(${clientProfiles.companyName}, ${clients.companyName})`,
          firstName: clients.firstName,
          lastName: clients.lastName,
          email: clients.email,
          phone: clients.phone,
          address: clients.address,
          city: clients.city,
          state: clients.state,
          country: clients.country,
          notes: sql<string>`COALESCE(${clientProfiles.notes}, ${clients.notes})`,
          profileStatus: clientProfiles.status,
          createdBy: clients.createdBy,
          createdAt: clients.createdAt,
        })
        .from(clientProfiles)
        .innerJoin(clients, eq(clientProfiles.identityId, clients.id))
        .where(and(eq(clients.id, id), eq(clientProfiles.tenantId, tenantId)))
        .limit(1);

      if (!result[0]) {
        return res.status(404).json({
          success: false,
          message: "Client not found",
        });
      }

      return res.status(200).json({
        success: true,
        data: result[0],
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

      const { userId, tenantId } = req.user!;
      if (!userId || !tenantId) {
        return next(CustomErrorHandler.badRequest("User ID or Tenant ID is missing"));
      }

      await db.transaction(async (tx) => {
        /**
         * UPSERT IDENTITY LOGIC:
         *
         * Check if a client identity already exists with this email.
         * - If YES → reuse the existing identity, skip INSERT into clients.
         *            Only create a new client_profiles row for this tenant.
         * - If NO  → create the identity & credentials in clients,
         *            then create the client_profiles row.
         *
         * This allows the same person (email) to be a client at multiple law firms.
         */
        let identity = await tx.query.clients.findFirst({
          where: eq(clients.email, email),
        });

        let isNewIdentity = false;

        if (!identity) {
          // New identity — create client with portal credentials
          const passwordHash = password ? await bcrypt.hash(password, 10) : null;
          const [newClient] = await tx
            .insert(clients)
            .values({
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
              passwordHash,
              status: "active",
              createdBy: userId,
            })
            .returning();

          identity = newClient;
          isNewIdentity = true;
        }

        // Check if this firm already has a profile for this client
        const existingProfile = await tx.query.clientProfiles.findFirst({
          where: and(
            eq(clientProfiles.identityId, identity.id),
            eq(clientProfiles.tenantId, tenantId),
            officeId ? eq(clientProfiles.officeId, officeId) : sql`${clientProfiles.officeId} IS NULL`,
          ),
        });

        if (existingProfile) {
          return res.status(400).json({
            success: false,
            message: isNewIdentity
              ? "Client created but profile already exists for this office."
              : "This client is already registered with your firm's office.",
          });
        }

        // Create the per-tenant-office profile
        const [profile] = await tx
          .insert(clientProfiles)
          .values({
            identityId: identity.id,
            tenantId,
            officeId: officeId ?? null,
            companyName: companyName ?? null,
            notes: notes ?? null,
            status: "active",
            createdBy: userId,
          })
          .returning();

        // Send welcome email only for brand-new identities
        if (isNewIdentity && email) {
          await clientEmailService({
            clientName: `${firstName} ${lastName ?? ""}`.trim(),
            clientEmail: email,
            password,
          });
        }

        return res.status(201).json({
          success: true,
          message: isNewIdentity
            ? "Client created and added to your firm successfully."
            : "Existing client added to your firm successfully. They can log in with their existing password.",
          data: {
            ...identity,
            profileId: profile.id,
            tenantId: profile.tenantId,
            officeId: profile.officeId,
            isNewIdentity,
          },
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
      const { id } = req.params; // id = clients.id (identity)

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

      const { tenantId } = req.user!;

      // Verify this client has a profile in this tenant
      const profile = await db.query.clientProfiles.findFirst({
        where: and(
          eq(clientProfiles.identityId, id),
          eq(clientProfiles.tenantId, tenantId),
        ),
      });

      if (!profile) {
        return res.status(404).json({
          success: false,
          message: "Client not found in your firm.",
        });
      }

      // Update global identity fields (shared across all firms)
      const [updatedClient] = await db
        .update(clients)
        .set({
          firstName,
          lastName,
          phone,
          address,
          city,
          state,
          country,
          // Do NOT update email here — email is the unique identity key
          // Do NOT update companyName/notes on identity — use profile overrides below
        })
        .where(eq(clients.id, id))
        .returning();

      // Update firm-specific profile fields
      await db
        .update(clientProfiles)
        .set({
          officeId: officeId ?? profile.officeId,
          companyName: companyName ?? null,
          notes: notes ?? null,
          updatedAt: new Date(),
        })
        .where(eq(clientProfiles.id, profile.id));

      return res.status(200).json({
        success: true,
        message: "Client updated successfully.",
        data: {
          ...updatedClient,
          profileId: profile.id,
          tenantId: profile.tenantId,
          officeId: officeId ?? profile.officeId,
          companyName: companyName ?? updatedClient.companyName,
          notes: notes ?? updatedClient.notes,
        },
      });
    } catch (error) {
      next(error);
    }
  },
  async deleteClient(req: Request, res: Response, next: NextFunction) {
    try {
      const { id } = req.params; // id = clients.id (identity)
      const tenantId = req.user?.tenantId;
      if (!tenantId) {
        return next(CustomErrorHandler.unAuthorized());
      }


      /**
       * IMPORTANT: We only delete the client_profiles row for THIS tenant.
       * We do NOT delete the global identity (clients)
       * because the same client may belong to other law firms.
       *
       * Deleting the profile effectively removes the client from this firm
       * without affecting their other firm memberships.
       */
      const profile = await db.query.clientProfiles.findFirst({
        where: and(
          eq(clientProfiles.identityId, id),
          eq(clientProfiles.tenantId, tenantId),
        ),
      });

      if (!profile) {
        return res.status(404).json({
          success: false,
          message: "Client not found in your firm.",
        });
      }

      // Only delete the profile row — preserve the global identity
      await db
        .delete(clientProfiles)
        .where(eq(clientProfiles.id, profile.id));

      return res.status(200).json({
        success: true,
        message: "Client removed from your firm successfully.",
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
      const tenantId = req.user?.tenantId;
      if (!tenantId) {
        return next(CustomErrorHandler.unAuthorized());
      }
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

      // Verify client belongs to this tenant via client_profiles
      const profile = await db.query.clientProfiles.findFirst({
        where: and(eq(clientProfiles.identityId, clientId), eq(clientProfiles.tenantId, tenantId)),
      });

      if (!profile) {
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
      const tenantId = req.user?.tenantId;
      const search = String(req.query.search ?? "").trim();
      if (!tenantId) {
        return next(CustomErrorHandler.unAuthorized());
      }
      // Scope client list to this tenant via client_profiles join
      const clientsData = await db
        .select({
          id: clients.id,
          firstName: clients.firstName,
          lastName: clients.lastName,
          companyName: sql<string>`COALESCE(${clientProfiles.companyName}, ${clients.companyName})`,
        })
        .from(clientProfiles)
        .innerJoin(clients, eq(clientProfiles.identityId, clients.id))
        .where(
          and(
            eq(clientProfiles.tenantId, tenantId),
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
        )
        .orderBy(clients.firstName);

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
