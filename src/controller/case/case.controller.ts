import {
  and,
  asc,
  count,
  desc,
  eq,
  exists,
  ilike,
  inArray,
  isNull,
  or,
  sql,
} from "drizzle-orm";
import { NextFunction, Request, Response } from "express";
import db from "../../db/index.js";
import {
  advocates,
  caseAdvocates,
  caseClients,
  caseCustomFieldValues,
  caseDocuments,
  cases,
  caseStatusHistory,
  caseTags,
  courts,
  documentFolders,
  hearings
} from "../../db/schema/index.js";
import CustomErrorHandler from "../../utils/customErrorHandler.js";
import { getDateRange } from "../../utils/dateRange.js";
import ResponseHandler from "../../utils/responseHandler.js";
import { createCaseSchema } from "../../validators/case.validator.js";

const caseController = {
  async createCase(req: Request, res: Response, next: NextFunction) {
    const validated = createCaseSchema.safeParse(req.body);

    if (!validated.success) {
      return next(validated.error);
    }

    try {
      const {
        title,
        description,
        courtId,
        caseTypeId,
        companyId,
        policeStationId,
        underSectionId,
        empanelmentId,
        caseNumber,
        cnrNumber,
        referenceNumber,
        fileNumber,
        fileName,
        courtNumber,
        judgeName,
        year,
        firstParty,
        oppositeParty,
        firNumber,
        filingDate,
        registrationDate,
        nextHearingDate,
        stage,
        remarks,
        priority,
        status,
        caseValue,
        isDecided,
        isAbandoned,
        clients,
        advocates,
        customFields,
      } = validated.data;

      if (!req.user) {
        return next(CustomErrorHandler.unAuthorized());
      }

      const tenantId = req.user.tenantId;
      const officeId = req.officeId;
      const userId = req.user.userId;

      const createdCase = await db.transaction(async (tx) => {
        // Create Case
        const [newCase] = await tx
          .insert(cases)
          .values({
            tenantId,
            officeId,
            courtId,
            caseTypeId,
            companyId,
            policeStationId,
            underSectionId,
            empanelmentId,
            title,
            description,
            caseNumber,
            cnrNumber,
            referenceNumber,
            fileNumber,
            fileName,
            courtNumber,
            judgeName,
            year,
            firstParty,
            oppositeParty,
            firNumber,

            filingDate,
            registrationDate,
            nextHearingDate,
            stage,
            remarks,
            priority,
            status,
            caseValue: caseValue ?? undefined,
            isDecided,
            isAbandoned,
            createdBy: userId,
            updatedBy: userId,
          })
          .returning();

        const caseId = newCase.id;

        // Status History
        await tx.insert(caseStatusHistory).values({
          caseId,
          oldStatus: null,
          newStatus: status ?? "draft",
          changedBy: userId,
        });

        // Associate Clients
        if (Array.isArray(clients) && clients.length > 0) {
          await tx.insert(caseClients).values(
            clients.map((client: { clientId: string; role?: string }) => ({
              caseId,
              clientId: client.clientId,
              role: client.role ?? null,
            })),
          );
        }

        // Associate Advocates
        if (Array.isArray(advocates) && advocates.length > 0) {
          await tx.insert(caseAdvocates).values(
            advocates.map(
              (advocate: { advocateId: string; isPrimary?: boolean }) => ({
                caseId,
                advocateId: advocate.advocateId,
                isPrimary: advocate.isPrimary ?? false,
              }),
            ),
          );
        }

        // Save Custom Field Values
        if (Array.isArray(customFields) && customFields.length > 0) {
          await tx.insert(caseCustomFieldValues).values(
            customFields.map((field: { fieldId: string; value: string }) => ({
              caseId,
              fieldId: field.fieldId,
              value: field.value,
            })),
          );
        }

        // Create Initial Hearing
        if (nextHearingDate) {
          await tx.insert(hearings).values({
            caseId,
            hearingDate: nextHearingDate,
            stage,
            courtNo: courtNumber,
            remarks,
          });
        }

        return newCase;
      });

      return res.status(201).json({
        success: true,
        message: "Case created successfully.",
        data: createdCase,
      });
    } catch (error) {
      console.error(error);
      return next(CustomErrorHandler.serverError());
    }
  },

  async getCaseById(req: Request, res: Response, next: NextFunction) {
    try {
      if (!req.user) {
        return next(CustomErrorHandler.unAuthorized());
      }
      const { id } = req.params;

      const caseRecord = await db.query.cases.findFirst({
        where: eq(cases.id, id),
        with: {
          court: true,
          caseType: true,
          policeStation: true,
          underSection: true,
          company: true,
          empanelment: true,
          clients: {
            with: {
              client: true,
            },
          },
          advocates: {
            with: {
              advocate: {
                with: {
                  user: true,
                },
              },
            },
          },
        },
      });

      if (!caseRecord) {
        return next(CustomErrorHandler.notFound("Case record not found"));
      }

      const getClientName = (client?: { firstName?: string | null; lastName?: string | null; companyName?: string | null } | null) => {
        if (!client) return "";
        const name = `${client.firstName ?? ""} ${client.lastName ?? ""}`.trim();
        return name || client.companyName || "";
      };

      const formattedCase = {
        ...caseRecord,
        caseNo: caseRecord.caseNumber || caseRecord.id,
        cnrNo: caseRecord.cnrNumber || undefined,
        referenceNo: caseRecord.referenceNumber || undefined,
        fileNo: caseRecord.fileNumber || undefined,
        firNo: caseRecord.firNumber || undefined,
        court: caseRecord.court?.name || undefined,
        courtNo: caseRecord.courtNumber || undefined,
        judge: caseRecord.judgeName || undefined,
        type: caseRecord.caseType?.name || undefined,
        policeStation: caseRecord.policeStation?.name || undefined,
        underSection: caseRecord.underSection
          ? `${caseRecord.underSection.actName || ""} ${caseRecord.underSection.section || ""}`.trim()
          : undefined,
        company: caseRecord.company?.name || undefined,
        empanelment: caseRecord.empanelment?.name || undefined,
        clients:
          caseRecord.clients
            ?.map((cc) => getClientName(cc.client))
            .filter(Boolean) || [],
        advocates:
          caseRecord.advocates
            ?.map((ca) => ca.advocate?.user?.name)
            .filter(Boolean) || [],
        clientDetails:
          caseRecord.clients
            ?.map((cc) => ({
              clientId: cc.clientId,
              role: cc.role,
              name: getClientName(cc.client),
              firstName: cc.client?.firstName,
              lastName: cc.client?.lastName,
              companyName: cc.client?.companyName,
              email: cc.client?.email,
              phone: cc.client?.phone,
            }))
            .filter((c) => Boolean(c.clientId)) || [],
        advocateDetails:
          caseRecord.advocates
            ?.map((ca) => ({
              advocateId: ca.advocateId,
              isPrimary: ca.isPrimary,
              name: ca.advocate?.user?.name,
              email: ca.advocate?.user?.email,
            }))
            .filter((a) => Boolean(a.advocateId)) || [],
      };

      return res.status(200).json({
        success: true,
        message: "Case fetched successfully",
        data: formattedCase,
      });
    } catch (error) {
      console.error("getCaseById error:", error);
      return next(CustomErrorHandler.serverError());
    }
  },

  async getCases(req: Request, res: Response, next: NextFunction) {
    try {
      if (!req.user) {
        return next(CustomErrorHandler.unAuthorized());
      }

      const { tenantId, userId } = req.user;
      const officeId = req.officeId;
      const search = String(req.query.search ?? "").trim();
      const page = Number(req.query.page ?? 1);
      const limit = Number(req.query.limit ?? 10);
      const offset = (page - 1) * limit;

      const {
        cnrNo,
        caseNo,
        referenceNo,
        court,
        courtNo,
        firstParty,
        oppositeParty,
        company,
        empanelment,
        fixedFor,
        fileNo,
        includeDecided,
        onlyDecided,
        onlyAwaited,
        nextDate,
        previousDate,
        policeStationCompany,
        client,
        advocate,
        nextDateFrom,
        nextDateTo,
        caseYear,
        nextDateMonth,
        nextDateYear,
        firNo,
        judgeName,
        filingDateFrom,
        filingDateTo,
        customField,
        includeAbandoned,
        onlyAbandoned,
        onlyCasesWithoutClient,
        statusKey,
        label,
        dateFilter,
      } = req.query;
      const includeDocuments = String(req.query.includeDocuments ?? "false") === "true";

      if (!tenantId) {
        return next(CustomErrorHandler.badRequest("Tenant context is missing"));
      }

      if (!officeId) {
        return next(CustomErrorHandler.badRequest("Office context is missing"));
      }

      let loggedInAdvocate: { id: string } | null = null;

      if (statusKey === "my") {
        loggedInAdvocate =
          (await db.query.advocates.findFirst({
            where: eq(advocates.userId, userId),
            columns: {
              id: true,
            },
          })) ?? null;
      }
      const filters = [
        eq(cases.tenantId, tenantId),
        eq(cases.officeId, officeId),
      ];

      // 1. Quick search
      if (search) {
        filters.push(
          or(
            ilike(cases.title, `%${search}%`),
            ilike(cases.caseNumber, `%${search}%`),
            ilike(cases.cnrNumber, `%${search}%`),
            ilike(cases.referenceNumber, `%${search}%`),
            ilike(cases.fileNumber, `%${search}%`),
            ilike(cases.firstParty, `%${search}%`),
            ilike(cases.oppositeParty, `%${search}%`),
            ilike(cases.judgeName, `%${search}%`),
          )!,
        );
      }

      // 2. Individual fields
      if (cnrNo) {
        filters.push(ilike(cases.cnrNumber, `%${cnrNo}%`));
      }
      if (caseNo) {
        filters.push(ilike(cases.caseNumber, `%${caseNo}%`));
      }
      if (referenceNo) {
        filters.push(ilike(cases.referenceNumber, `%${referenceNo}%`));
      }
      if (court) {
        filters.push(
          sql`exists (
            select 1 from courts
            where courts.id = cases.court_id
            and courts.name ilike ${`%${court}%`}
          )`,
        );
      }
      if (courtNo) {
        filters.push(ilike(cases.courtNumber, `%${courtNo}%`));
      }
      if (firstParty) {
        filters.push(ilike(cases.firstParty, `%${firstParty}%`));
      }
      if (oppositeParty) {
        filters.push(ilike(cases.oppositeParty, `%${oppositeParty}%`));
      }
      if (company) {
        filters.push(
          sql`exists (
            select 1 from companies
            where companies.id = cases.company_id
            and companies.name ilike ${`%${company}%`}
          )`,
        );
      }
      if (empanelment) {
        filters.push(
          sql`exists (
            select 1 from empanelments
            where empanelments.id = cases.empanelment_id
            and empanelments.name ilike ${`%${empanelment}%`}
          )`,
        );
      }
      if (fixedFor) {
        filters.push(ilike(cases.stage, `%${fixedFor}%`));
      }
      if (fileNo) {
        filters.push(ilike(cases.fileNumber, `%${fileNo}%`));
      }

      // 3. More filters fields
      if (nextDate) {
        filters.push(eq(cases.nextHearingDate, nextDate as string));
      }
      if (previousDate) {
        filters.push(
          sql`exists (
            select 1 from hearings 
            where hearings.case_id = cases.id 
            and hearings.hearing_date = ${previousDate as string}
          )`,
        );
      }
      if (policeStationCompany) {
        filters.push(
          or(
            sql`exists (
              select 1 from police_stations 
              where police_stations.id = cases.police_station_id 
              and police_stations.name ilike ${`%${policeStationCompany}%`}
            )`,
            sql`exists (
              select 1 from companies 
              where companies.id = cases.company_id 
              and companies.name ilike ${`%${policeStationCompany}%`}
            )`,
          )!,
        );
      }
      if (client) {
        filters.push(
          sql`exists (
            select 1 from case_clients
            join clients on case_clients.client_id = clients.id
            where case_clients.case_id = cases.id
            and (
              clients.company_name ilike ${`%${client}%`}
              or clients.first_name ilike ${`%${client}%`}
              or clients.last_name ilike ${`%${client}%`}
              or concat(clients.first_name, ' ', clients.last_name) ilike ${`%${client}%`}
            )
          )`,
        );
      }
      if (advocate) {
        filters.push(
          sql`exists (
            select 1 from case_advocates
            join advocates on case_advocates.advocate_id = advocates.id
            join users on advocates.user_id = users.id
            where case_advocates.case_id = cases.id
            and users.name ilike ${`%${advocate}%`}
          )`,
        );
      }
      if (nextDateFrom) {
        filters.push(
          or(
            sql`${cases.nextHearingDate} >= ${nextDateFrom as string}`,
            sql`exists (
              select 1 from hearings
              where hearings.case_id = cases.id
              and hearings.hearing_date >= ${nextDateFrom as string}
            )`,
          )!,
        );
      }
      if (nextDateTo) {
        filters.push(
          or(
            sql`${cases.nextHearingDate} <= ${nextDateTo as string}`,
            sql`exists (
              select 1 from hearings
              where hearings.case_id = cases.id
              and hearings.hearing_date <= ${nextDateTo as string}
            )`,
          )!,
        );
      }
      if (caseYear) {
        filters.push(eq(cases.year, Number(caseYear)));
      }
      if (nextDateMonth) {
        const months: Record<string, number> = {
          january: 1,
          february: 2,
          march: 3,
          april: 4,
          may: 5,
          june: 6,
          july: 7,
          august: 8,
          september: 9,
          october: 10,
          november: 11,
          december: 12,
        };
        const monthNum = months[String(nextDateMonth).toLowerCase()];
        if (monthNum) {
          filters.push(
            or(
              sql`EXTRACT(MONTH FROM ${cases.nextHearingDate}) = ${monthNum}`,
              sql`exists (
                select 1 from hearings
                where hearings.case_id = cases.id
                and EXTRACT(MONTH FROM hearings.hearing_date) = ${monthNum}
              )`,
            )!,
          );
        }
      }
      if (nextDateYear) {
        filters.push(
          or(
            sql`EXTRACT(YEAR FROM ${cases.nextHearingDate}) = ${Number(nextDateYear)}`,
            sql`exists (
              select 1 from hearings
              where hearings.case_id = cases.id
              and EXTRACT(YEAR FROM hearings.hearing_date) = ${Number(nextDateYear)}
            )`,
          )!,
        );
      }
      if (firNo) {
        filters.push(ilike(cases.firNumber, `%${firNo}%`));
      }
      if (judgeName) {
        filters.push(ilike(cases.judgeName, `%${judgeName}%`));
      }
      if (filingDateFrom) {
        filters.push(
          or(
            sql`${cases.filingDate} >= ${filingDateFrom as string}`,
            sql`DATE(${cases.createdAt}) >= ${filingDateFrom as string}`,
          )!,
        );
      }
      if (filingDateTo) {
        filters.push(
          or(
            sql`${cases.filingDate} <= ${filingDateTo as string}`,
            sql`DATE(${cases.createdAt}) <= ${filingDateTo as string}`,
          )!,
        );
      }
      if (customField) {
        filters.push(
          sql`exists (
            select 1 from case_custom_field_values
            where case_custom_field_values.case_id = cases.id
            and case_custom_field_values.value ilike ${`%${customField}%`}
          )`,
        );
      }

      // Checkbox / Boolean filters
      const incAbandoned = includeAbandoned !== "false";
      const onlyAban = onlyAbandoned === "true";
      const onlyNoClient = onlyCasesWithoutClient === "true";

      if (onlyAban) {
        filters.push(eq(cases.isAbandoned, true));
      } else if (!incAbandoned) {
        filters.push(eq(cases.isAbandoned, false));
      }

      if (onlyNoClient) {
        filters.push(
          sql`not exists (
            select 1 from case_clients
            where case_clients.case_id = cases.id
          )`,
        );
      }

      const incDecided = includeDecided !== "false";
      const onlyDec = onlyDecided === "true";

      if (onlyDec) {
        filters.push(eq(cases.isDecided, true));
      } else if (!incDecided) {
        filters.push(eq(cases.isDecided, false));
      }

      if (onlyAwaited === "true") {
        filters.push(isNull(cases.nextHearingDate));
      }

      // Label filter
      if (label && label !== "All Labels") {
        filters.push(
          sql`exists (
      select 1
      from case_tags
      inner join tags
        on tags.id = case_tags.tag_id
      where case_tags.case_id = cases.id
        and tags.slug = ${label as string}
        and (
          tags.tenant_id = ${tenantId}
          or tags.is_built_in = true
        )
    )`,
        );
      }

      // Date filter — check both cases.nextHearingDate AND hearings table
      if (dateFilter) {
        filters.push(
          or(
            eq(cases.nextHearingDate, dateFilter as string),
            sql`exists (
              select 1 from hearings
              where hearings.case_id = cases.id
              and hearings.hearing_date = ${dateFilter as string}
            )`,
          )!,
        );
      }

      // 4. Status Key (Sidebar / Navigation Views)
      if (statusKey) {
        switch (statusKey) {
          case "important":
            filters.push(inArray(cases.priority, ["high", "urgent"]));
            break;
          case "my": {
            if (loggedInAdvocate) {
              filters.push(
                sql`exists (
        select 1
        from case_advocates ca
        where ca.case_id = ${cases.id}
          and ca.advocate_id = ${loggedInAdvocate.id}
      )`,
              );
            } else {
              filters.push(
                sql`not exists (
        select 1
        from case_advocates ca
        where ca.case_id = ${cases.id}
      )`,
              );
            }

            break;
          }

          case "today":
            filters.push(sql`${cases.nextHearingDate} = CURRENT_DATE`);
            break;
          case "tomorrow":
            filters.push(sql`${cases.nextHearingDate} = CURRENT_DATE + 1`);
            break;
          case "date-awaited":
            filters.push(isNull(cases.nextHearingDate));
            break;
          case "decided":
            filters.push(eq(cases.isDecided, true));
            break;
          case "abandoned":
            filters.push(eq(cases.isAbandoned, true));
            break;
          case "pending":
            filters.push(eq(cases.status, "pending"));
            break;

          case "in-progress":
            filters.push(eq(cases.status, "in_progress"));
            break;

          case "stayed":
            filters.push(eq(cases.status, "stayed"));
            break;

          case "disposed":
            filters.push(eq(cases.status, "disposed"));
            break;
          default:
            break;
        }
      }

      const where = and(...filters);

      const [data, total] = await Promise.all([
        db.query.cases.findMany({
          where,
          limit,
          offset,
          orderBy: (cases, { desc }) => [desc(cases.createdAt)],
          with: {
            caseType: {
              columns: {
                id: true,
                name: true,
              },
            },
            court: {
              columns: {
                id: true,
                name: true,
              },
            },
            company: {
              columns: {
                id: true,
                name: true,
              },
            },
            empanelment: {
              columns: {
                id: true,
                name: true,
              },
            },
            tags: {
              with: {
                tag: {
                  columns: {
                    id: true,
                    name: true,
                    slug: true,
                    color: true,
                    isBuiltIn: true,
                  },
                },
              },
            },
            advocates: {
              with: {
                advocate: {
                  with: {
                    user: {
                      columns: {
                        name: true,
                      },
                    },
                  },
                },
              },
            },
            clients: {
              with: {
                client: {
                  columns: {
                    firstName: true,
                    lastName: true,
                    companyName: true,
                  },
                },
              },
            },
          },
        }),

        db
          .select({
            total: count(),
          })
          .from(cases)
          .where(where),
      ]);

      if (includeDocuments && data.length > 0) {
        const caseIds = data.map((caseItem) => caseItem.id);
        const [folders, documents] = await Promise.all([
          db.select().from(documentFolders).where(and(
            eq(documentFolders.tenantId, tenantId),
            eq(documentFolders.officeId, officeId),
            inArray(documentFolders.caseId, caseIds),
          )),
          db.select().from(caseDocuments).where(and(
            eq(caseDocuments.tenantId, tenantId),
            eq(caseDocuments.officeId, officeId),
            inArray(caseDocuments.caseId, caseIds),
          )),
        ]);

        for (const caseItem of data) {
          Object.assign(caseItem, {
            documentFolders: folders.filter((folder) => folder.caseId === caseItem.id),
            documents: documents.filter((document) => document.caseId === caseItem.id),
          });
        }
      }

      return res.status(200).json({
        success: true,
        data,
        pagination: {
          page,
          limit,
          total: total[0].total,
          totalPages: Math.ceil(total[0].total / limit),
        },
      });
    } catch (error) {
      console.error(error);
      return next(CustomErrorHandler.serverError());
    }
  },
  async getCasesForFrom(req: Request, res: Response, next: NextFunction) {
    try {
      const tenantId = req.user?.tenantId;
      const officeId = req.officeId;

      if (!tenantId || !officeId) {
        return next(
          CustomErrorHandler.wrongCredentials(
            "Tenant ID and office ID is required",
          ),
        );
      }

      // 1. Parse pagination parameters with sensible defaults
      const pageParam = parseInt(req.query.page as string, 10);
      const limitParam = parseInt(req.query.limit as string, 10);

      const page = !isNaN(pageParam) && pageParam > 0 ? pageParam : 1;
      const limit = !isNaN(limitParam) && limitParam > 0 ? limitParam : 20;
      const offset = (page - 1) * limit;

      // 2. Parse optional search parameter
      const searchParam = req.query.search;
      const searchString =
        typeof searchParam === "string" ? searchParam.trim() : "";

      const searchCondition = searchString
        ? or(
          ilike(cases.caseNumber, `%${searchString}%`),
          ilike(cases.title, `%${searchString}%`),
        )
        : undefined;

      // 3. Define shared WHERE clause
      const whereClause = and(
        eq(cases.tenantId, tenantId),
        eq(cases.officeId, officeId),
        inArray(cases.status, [
          "draft",
          "open",
          "pending",
          "in_progress",
          "stayed",
        ]),
        isNull(cases.deletedAt),
        searchCondition,
      );

      // 4. Fetch total count & paginated records in parallel
      const [totalCountResult, casesData] = await Promise.all([
        db.select({ total: count() }).from(cases).where(whereClause),
        db.query.cases.findMany({
          where: whereClause,
          columns: {
            id: true,
            caseNumber: true,
            title: true,
          },
          limit,
          offset,
        }),
      ]);

      const totalRecords = totalCountResult[0]?.total ?? 0;
      const totalPages = Math.ceil(totalRecords / limit);

      return res.status(200).json({
        success: true,
        message: "Cases fetched successfully",
        casesData,
        pagination: {
          page,
          limit,
          totalRecords,
          totalPages,
          hasNextPage: page < totalPages,
          hasPrevPage: page > 1,
        },
      });
    } catch (error) {
      next(error);
    }
  },
  async getCaseForUpdate(req: Request, res: Response, next: NextFunction) {
    try {
      if (!req.user) {
        return next(CustomErrorHandler.unAuthorized());
      }

      const { id } = req.params;
      const tenantId = req.user.tenantId;
      const officeId = req.officeId;

      if (!id) {
        return next(CustomErrorHandler.badRequest("Case id is required"));
      }

      if (!officeId) {
        return next(CustomErrorHandler.badRequest("Office id is required"));
      }

      const caseRecord = await db.query.cases.findFirst({
        where: and(
          eq(cases.id, id),
          eq(cases.tenantId, tenantId),
          eq(cases.officeId, officeId),
        ),

        with: {
          court: true,
          company: true,
          empanelment: true,

          advocates: {
            with: {
              advocate: true,
            },
          },

          clients: {
            with: {
              client: true,
            },
          },

          linkedCases: {
            with: {
              linkedCase: true,
            },
          },
        },
      });

      if (!caseRecord) {
        return next(CustomErrorHandler.notFound("Case not found"));
      }

      const caseTagsData = await db.query.caseTags.findMany({
        where: eq(caseTags.caseId, id),

        with: {
          tag: true,
        },
      });

      const responseData = {
        id: caseRecord.id,

        title: caseRecord.title,
        caseNumber: caseRecord.caseNumber,
        cnrNumber: caseRecord.cnrNumber,
        referenceNumber: caseRecord.referenceNumber,
        fileNumber: caseRecord.fileNumber,

        courtId: caseRecord.courtId,
        court: caseRecord.court,

        courtNumber: caseRecord.courtNumber,
        judgeName: caseRecord.judgeName,

        firstParty: caseRecord.firstParty,
        oppositeParty: caseRecord.oppositeParty,

        companyId: caseRecord.companyId,
        company: caseRecord.company,

        empanelmentId: caseRecord.empanelmentId,
        empanelment: caseRecord.empanelment,

        nextHearingDate: caseRecord.nextHearingDate,
        stage: caseRecord.stage,
        remarks: caseRecord.remarks,

        priority: caseRecord.priority,
        status: caseRecord.status,

        isDecided: caseRecord.isDecided,
        isAbandoned: caseRecord.isAbandoned,
        isArchived: caseRecord.isArchived,

        tags: caseTagsData.map((item) => ({
          id: item.tag.id,
          name: item.tag.name,
          color: item.tag.color,
          isBuiltIn: item.tag.isBuiltIn,
        })),

        clients: caseRecord.clients.map((item) => ({
          caseId: item.caseId,
          clientId: item.clientId,
          role: item.role,
          client: item.client,
        })),

        advocates: caseRecord.advocates.map((item) => ({
          caseId: item.caseId,
          advocateId: item.advocateId,
          isPrimary: item.isPrimary,
          advocate: item.advocate,
        })),

        linkedCases: caseRecord.linkedCases.map((item) => ({
          id: item.id,
          caseId: item.caseId,
          linkedCaseId: item.linkedCaseId,
          notes: item.notes,
          linkedCase: item.linkedCase,
        })),
      };

      return res
        .status(200)
        .send(
          ResponseHandler(200, "Case data fetched successfully", responseData),
        );
    } catch (error) {
      console.error(error);

      return next(CustomErrorHandler.serverError());
    }
  },
  async getCaseStatusStats(req: Request, res: Response, next: NextFunction) {
    try {
      if (!req.user) {
        return next(CustomErrorHandler.unAuthorized());
      }

      const tenantId = req.user.tenantId;
      const officeId = req.officeId;

      const courtType = req.query.courtType as string | undefined;

      if (!tenantId) {
        return next(CustomErrorHandler.badRequest("Tenant context is missing"));
      }

      if (!officeId) {
        return next(CustomErrorHandler.badRequest("Office context is missing"));
      }

      const filters = [
        eq(cases.tenantId, tenantId),
        eq(cases.officeId, officeId),

        // Make sure the court also belongs to this tenant
        eq(courts.tenantId, tenantId),
      ];

      if (courtType) {
        filters.push(eq(courts.courtType, courtType));
      }

      const [stats] = await db
        .select({
          all: count(cases.id),

          today: sql<number>`
          count(*) filter (
            where ${cases.nextHearingDate} = CURRENT_DATE
          )
        `,

          tomorrow: sql<number>`
          count(*) filter (
            where ${cases.nextHearingDate} = CURRENT_DATE + 1
          )
        `,

          awaited: sql<number>`
          count(*) filter (
            where ${cases.nextHearingDate} IS NULL
          )
        `,

          decided: sql<number>`
          count(*) filter (
            where ${cases.isDecided} = true
          )
        `,
        })
        .from(cases)
        .innerJoin(courts, eq(cases.courtId, courts.id))
        .where(and(...filters));

      return res.status(200).json({
        success: true,
        data: {
          all: Number(stats?.all ?? 0),
          today: Number(stats?.today ?? 0),
          tomorrow: Number(stats?.tomorrow ?? 0),
          awaited: Number(stats?.awaited ?? 0),
          decided: Number(stats?.decided ?? 0),
        },
      });
    } catch (error) {
      console.error(error);
      return next(CustomErrorHandler.serverError());
    }
  },
  async getCasesFiledStats(req: Request, res: Response, next: NextFunction) {
    try {
      if (!req.user) {
        return next(CustomErrorHandler.unAuthorized());
      }

      const tenantId = req.user.tenantId;
      const officeId = req.officeId;

      const range = String(req.query.range ?? "this_month") as
        | "this_month"
        | "last_month"
        | "custom";

      const from = req.query.from ? String(req.query.from) : undefined;
      const to = req.query.to ? String(req.query.to) : undefined;

      if (!tenantId) {
        return next(CustomErrorHandler.badRequest("Tenant context is missing"));
      }

      if (!officeId) {
        return next(CustomErrorHandler.badRequest("Office context is missing"));
      }

      let dateRange;

      try {
        dateRange = getDateRange(range, from, to);
      } catch (error) {
        return next(
          CustomErrorHandler.badRequest(
            error instanceof Error ? error.message : "Invalid date range",
          ),
        );
      }

      const { startDate, endDate } = dateRange;

      const [stats] = await db
        .select({
          casesFiled: sql<number>`
          count(*)
          filter (
            where
              ${cases.filingDate} >= ${startDate}
              and
              ${cases.filingDate} <= ${endDate}
          )
        `,
        })
        .from(cases)
        .where(and(eq(cases.tenantId, tenantId), eq(cases.officeId, officeId)));

      return res.status(200).json({
        success: true,
        data: {
          range,
          from: startDate,
          to: endDate,
          casesFiled: Number(stats?.casesFiled ?? 0),
        },
      });
    } catch (error) {
      console.error(error);
      return next(CustomErrorHandler.serverError());
    }
  },
  async getCasesDecidedStats(req: Request, res: Response, next: NextFunction) {
    try {
      if (!req.user) {
        return next(CustomErrorHandler.unAuthorized());
      }

      const tenantId = req.user.tenantId;
      const officeId = req.officeId;

      const range = String(req.query.range ?? "this_month") as
        | "this_month"
        | "last_month"
        | "custom";

      const from = req.query.from ? String(req.query.from) : undefined;
      const to = req.query.to ? String(req.query.to) : undefined;

      if (!tenantId) {
        return next(CustomErrorHandler.badRequest("Tenant context is missing"));
      }

      if (!officeId) {
        return next(CustomErrorHandler.badRequest("Office context is missing"));
      }

      let dateRange;

      try {
        dateRange = getDateRange(range, from, to);
      } catch (error) {
        return next(
          CustomErrorHandler.badRequest(
            error instanceof Error ? error.message : "Invalid date range",
          ),
        );
      }

      const { startDate, endDate } = dateRange;

      const [stats] = await db
        .select({
          casesDecided: sql<number>`
          count(*)
          filter (
            where
              ${cases.disposedDate} >= ${startDate}
              and
              ${cases.disposedDate} <= ${endDate}
          )
        `,
        })
        .from(cases)
        .where(and(eq(cases.tenantId, tenantId), eq(cases.officeId, officeId)));

      return res.status(200).json({
        success: true,
        data: {
          range,
          from: startDate,
          to: endDate,
          casesDecided: Number(stats?.casesDecided ?? 0),
        },
      });
    } catch (error) {
      console.error(error);
      return next(CustomErrorHandler.serverError());
    }
  },
  async getRecentAssignedCases(
    req: Request,
    res: Response,
    next: NextFunction,
  ) {
    try {
      if (!req.user) {
        return next(CustomErrorHandler.unAuthorized());
      }

      const { tenantId, userId } = req.user;
      const officeId = req.officeId;

      if (!tenantId) {
        return next(CustomErrorHandler.badRequest("Tenant context is missing"));
      }

      if (!officeId) {
        return next(CustomErrorHandler.badRequest("Office context is missing"));
      }

      if (!userId) {
        return next(CustomErrorHandler.badRequest("User context is missing"));
      }

      const limit = Math.min(Math.max(Number(req.query.limit) || 10, 1), 50);

      const advocate = await db.query.advocates.findFirst({
        where: eq(advocates.userId, userId),

        columns: {
          id: true,
        },
      });

      if (!advocate) {
        return res.status(200).json({
          success: true,
          data: [],
        });
      }

      const recentCases = await db.query.cases.findMany({
        where: and(
          eq(cases.tenantId, tenantId),
          eq(cases.officeId, officeId),

          exists(
            db
              .select()
              .from(caseAdvocates)
              .where(
                and(
                  eq(caseAdvocates.caseId, cases.id),
                  eq(caseAdvocates.advocateId, advocate.id),
                ),
              ),
          ),
        ),

        with: {
          court: true,

          caseType: true,

          clients: {
            with: {
              client: true,
            },
          },

          advocates: true,
        },

        orderBy: desc(cases.createdAt),

        limit,
      });

      const data = recentCases.map((item) => ({
        id: item.id,

        caseNo: item.caseNumber,

        title: item.title,

        client: item.clients?.[0]?.client
          ? `${item.clients[0].client.firstName ?? ""} ${item.clients[0].client.lastName ?? ""}`.trim()
          : null,

        oppositeParty: item.oppositeParty ?? null,

        court: item.court?.name ?? null,

        caseType: item.caseType?.name ?? null,

        status: item.status,

        nextHearing: item.nextHearingDate ?? null,

        filedDate: item.filingDate ?? null,
      }));

      return res.status(200).json({
        success: true,
        data,
      });
    } catch (error) {
      console.error("getRecentAssignedCases error:", error);

      return next(CustomErrorHandler.serverError());
    }
  },
  async getCasesByPurposeAndAge(
    req: Request,
    res: Response,
    next: NextFunction,
  ) {
    try {
      if (!req.user) {
        return next(CustomErrorHandler.unAuthorized());
      }

      const tenantId = req.user.tenantId;
      const officeId = req.officeId;

      if (!tenantId) {
        return next(CustomErrorHandler.badRequest("Tenant context is missing"));
      }

      if (!officeId) {
        return next(CustomErrorHandler.badRequest("Office context is missing"));
      }

      const caseData = await db.query.cases.findMany({
        where: and(
          eq(cases.tenantId, tenantId),
          eq(cases.officeId, officeId),

          eq(cases.isDecided, false),
          eq(cases.isAbandoned, false),
          eq(cases.isArchived, false),

          isNull(cases.deletedAt),
        ),

        columns: {
          id: true,
          caseNumber: true,
          title: true,
          stage: true,
          filingDate: true,
          isDecided: true,
          isAbandoned: true,
          isArchived: true,
        },

        orderBy: desc(cases.createdAt),
      });

      const purposeMap = new Map<string, number>();

      for (const item of caseData) {
        const rawStage = item.stage?.trim();
        const purpose = rawStage || "Other";

        purposeMap.set(purpose, (purposeMap.get(purpose) ?? 0) + 1);
      }

      const purposeOrder = [
        "Hearing",
        "Evidence",
        "Arguments",
        "Orders",
        "Admission",
        "Other",
      ];

      const purposeRows = purposeOrder
        .map((purpose) => ({
          purpose,
          count: purposeMap.get(purpose) ?? 0,
        }))
        .filter((row) => row.count > 0);

      const purposeTotal = caseData.length;

      const ageMap = new Map<string, number>();

      const ageOrder = [
        "0–30 days",
        "31–90 days",
        "91–180 days",
        "181–365 days",
        "1–2 years",
        "2+ years",
        "Unknown",
      ];

      for (const age of ageOrder) {
        ageMap.set(age, 0);
      }

      const today = new Date();

      for (const item of caseData) {
        // Missing filing date
        if (!item.filingDate) {
          ageMap.set("Unknown", (ageMap.get("Unknown") ?? 0) + 1);

          continue;
        }

        const filingDate = new Date(item.filingDate);

        // Invalid filing date
        if (Number.isNaN(filingDate.getTime())) {
          ageMap.set("Unknown", (ageMap.get("Unknown") ?? 0) + 1);

          continue;
        }

        // Calculate case age
        const diffInMs = today.getTime() - filingDate.getTime();

        const days = Math.floor(diffInMs / (1000 * 60 * 60 * 24));

        let age: string;

        if (days <= 30) {
          age = "0–30 days";
        } else if (days <= 90) {
          age = "31–90 days";
        } else if (days <= 180) {
          age = "91–180 days";
        } else if (days <= 365) {
          age = "181–365 days";
        } else if (days <= 730) {
          age = "1–2 years";
        } else {
          age = "2+ years";
        }

        ageMap.set(age, (ageMap.get(age) ?? 0) + 1);
      }

      const ageRows = ageOrder
        .map((age) => ({
          age,
          count: ageMap.get(age) ?? 0,
        }))
        .filter((row) => row.count > 0);

      return res.status(200).json({
        success: true,

        data: {
          purposeRows,
          purposeTotal,
          ageRows,
        },
      });
    } catch (error) {
      console.error("getCasesByPurposeAndAge error:", error);

      return next(CustomErrorHandler.serverError());
    }
  },
  async getCasesPerCourtType(req: Request, res: Response, next: NextFunction) {
    try {
      if (!req.user) {
        return next(CustomErrorHandler.unAuthorized());
      }

      const tenantId = req.user.tenantId;

      if (!tenantId) {
        return next(CustomErrorHandler.badRequest("Tenant context is missing"));
      }

      const courtData = await db
        .select({
          courtType: courts.courtType,

          caseCount: sql<number>`
          count(distinct ${cases.id})
        `.as("case_count"),

          nextHearingDate: sql<string | null>`
          min(
            case
              when ${hearings.hearingDate} >= CURRENT_DATE
              then ${hearings.hearingDate}
            end
          )
        `.as("next_hearing_date"),
        })
        .from(courts)

        .leftJoin(cases, eq(cases.courtId, courts.id))

        .leftJoin(hearings, eq(hearings.caseId, cases.id))

        .where(and(eq(courts.tenantId, tenantId), eq(courts.isActive, true)))

        .groupBy(courts.courtType)

        .orderBy(
          asc(
            sql`
            min(
              case
                when ${hearings.hearingDate} >= CURRENT_DATE
                then ${hearings.hearingDate}
              end
            )
          `,
          ),
        );

      const data = courtData.map((item) => ({
        courtType: item.courtType,
        nextHearingDate: item.nextHearingDate ?? null,
        caseCount: Number(item.caseCount),
      }));

      return res.status(200).json({
        success: true,
        message: "Cases per court type fetched successfully",
        data,
      });
    } catch (error) {
      console.error("getCasesPerCourtType error:", error);

      return next(CustomErrorHandler.serverError());
    }
  },
};

export default caseController;
