import { and, asc, desc, eq, inArray, isNull, sql } from "drizzle-orm";
import { NextFunction, Request, Response } from "express";

import db from "../../db/index.js";
import {
  advocates,
  caseAdvocates,
  caseClients,
  caseTypes,
  cases,
  clients,
  courts,
  hearings,
  user,
} from "../../db/schema/index.js";
import CustomErrorHandler from "../../utils/customErrorHandler.js";

interface HearingBody {
  caseId?: string;
  hearingDate?: string;
  stage?: string;
  courtNo?: string;
  remarks?: string;
}

interface HearingParams {
  id?: string;
}

type DbTransaction = Parameters<typeof db.transaction>[0] extends (
  tx: infer T,
) => unknown
  ? T
  : never;

const isIsoDate = (value: unknown): value is string => {
  return typeof value === "string" && /^\d{4}-\d{2}-\d{2}$/.test(value);
};

const getClientName = (client: {
  firstName: string | null;
  lastName: string | null;
  companyName: string | null;
}) => {
  const name = `${client.firstName ?? ""} ${client.lastName ?? ""}`.trim();

  return name || client.companyName || "";
};

const syncCaseFromHearings = async (
  tx: DbTransaction,
  caseId: string,
  userId: string,
) => {
  const upcomingHearing = await tx.query.hearings.findFirst({
    where: sql`
      ${hearings.caseId} = ${caseId}
      AND ${hearings.hearingDate} >= CURRENT_DATE
    `,
    orderBy: [asc(hearings.hearingDate), asc(hearings.id)],
    columns: {
      hearingDate: true,
      stage: true,
      courtNo: true,
      remarks: true,
    },
  });

  const latestHearing = await tx.query.hearings.findFirst({
    where: eq(hearings.caseId, caseId),
    orderBy: [desc(hearings.hearingDate), desc(hearings.id)],
    columns: {
      stage: true,
      courtNo: true,
      remarks: true,
    },
  });

  const hearing = upcomingHearing ?? latestHearing;

  await tx
    .update(cases)
    .set({
      nextHearingDate: upcomingHearing?.hearingDate ?? null,
      stage: hearing?.stage ?? null,
      courtNumber: hearing?.courtNo ?? null,
      remarks: hearing?.remarks ?? null,
      updatedBy: userId,
      updatedAt: new Date(),
    })
    .where(eq(cases.id, caseId));
};

const hearingController = {
  async getHearings(req: Request, res: Response, next: NextFunction) {
    try {
      const tenantId = req.user?.tenantId;
      const officeId = req.officeId;

      const from = req.query.from ? String(req.query.from) : undefined;

      const to = req.query.to ? String(req.query.to) : undefined;

      const caseId = req.query.caseId ? String(req.query.caseId) : undefined;

      if (!tenantId) {
        return next(CustomErrorHandler.badRequest("Tenant context is missing"));
      }

      if (!officeId) {
        return next(CustomErrorHandler.badRequest("Office context is missing"));
      }

      if (from && !isIsoDate(from)) {
        return next(CustomErrorHandler.badRequest("Invalid from date"));
      }

      if (to && !isIsoDate(to)) {
        return next(CustomErrorHandler.badRequest("Invalid to date"));
      }

      const filters = [
        eq(cases.tenantId, tenantId),
        eq(cases.officeId, officeId),
        isNull(cases.deletedAt),
      ];

      if (from) {
        filters.push(sql`${hearings.hearingDate} >= ${from}`);
      }

      if (to) {
        filters.push(sql`${hearings.hearingDate} <= ${to}`);
      }

      if (caseId) {
        filters.push(eq(hearings.caseId, caseId));
      }

      const hearingRows = await db
        .select({
          id: hearings.id,
          caseId: hearings.caseId,
          hearingDate: hearings.hearingDate,
          stage: hearings.stage,
          courtNo: hearings.courtNo,
          remarks: hearings.remarks,

          title: cases.title,
          caseNumber: cases.caseNumber,
          judgeName: cases.judgeName,
          firstParty: cases.firstParty,
          oppositeParty: cases.oppositeParty,
          status: cases.status,
          priority: cases.priority,

          courtName: courts.name,
          courtType: courts.courtType,
          caseTypeName: caseTypes.name,
        })
        .from(hearings)
        .innerJoin(cases, eq(hearings.caseId, cases.id))
        .leftJoin(courts, eq(cases.courtId, courts.id))
        .leftJoin(caseTypes, eq(cases.caseTypeId, caseTypes.id))
        .where(and(...filters))
        .orderBy(
          asc(hearings.hearingDate),
          asc(hearings.courtNo),
          asc(cases.caseNumber),
          asc(cases.title),
        );

      if (hearingRows.length === 0) {
        return res.status(200).json({
          success: true,
          data: [],
        });
      }

      const caseIds = [
        ...new Set(
          hearingRows
            .map((item) => item.caseId)
            .filter((id): id is string => Boolean(id)),
        ),
      ];

      const clientRows = await db
        .select({
          caseId: caseClients.caseId,
          firstName: clients.firstName,
          lastName: clients.lastName,
          companyName: clients.companyName,
        })
        .from(caseClients)
        .innerJoin(clients, eq(caseClients.clientId, clients.id))
        .where(inArray(caseClients.caseId, caseIds));

      const advocateRows = await db
        .select({
          caseId: caseAdvocates.caseId,
          name: user.name,
        })
        .from(caseAdvocates)
        .innerJoin(advocates, eq(caseAdvocates.advocateId, advocates.id))
        .innerJoin(user, eq(advocates.userId, user.id))
        .where(inArray(caseAdvocates.caseId, caseIds));

      const data = hearingRows.map((hearing) => {
        const clientsForCase = clientRows
          .filter((client) => client.caseId === hearing.caseId)
          .map(getClientName)
          .filter(Boolean);

        const advocatesForCase = advocateRows
          .filter((advocate) => advocate.caseId === hearing.caseId)
          .map((advocate) => advocate.name)
          .filter((name): name is string => Boolean(name));

        return {
          ...hearing,
          clientNames: [...new Set(clientsForCase)],
          advocateNames: [...new Set(advocatesForCase)],
        };
      });

      return res.status(200).json({
        success: true,
        data,
      });
    } catch (error) {
      console.error(error);
      return next(CustomErrorHandler.serverError());
    }
  },

  async createHearing(
    req: Request<{}, {}, HearingBody>,
    res: Response,
    next: NextFunction,
  ) {
    try {
      const tenantId = req.user?.tenantId;
      const officeId = req.officeId;
      const userId = req.user?.userId;

      const { caseId, hearingDate, stage, courtNo, remarks } = req.body;

      if (!tenantId) {
        return next(CustomErrorHandler.badRequest("Tenant context is missing"));
      }

      if (!officeId) {
        return next(CustomErrorHandler.badRequest("Office context is missing"));
      }

      if (!userId) {
        return next(CustomErrorHandler.badRequest("User context is missing"));
      }

      if (!caseId) {
        return next(CustomErrorHandler.badRequest("Case id is required"));
      }

      if (!isIsoDate(hearingDate)) {
        return next(
          CustomErrorHandler.badRequest("Valid hearing date is required"),
        );
      }

      const caseRecord = await db.query.cases.findFirst({
        where: and(
          eq(cases.id, caseId),
          eq(cases.tenantId, tenantId),
          eq(cases.officeId, officeId),
          isNull(cases.deletedAt),
        ),
        columns: {
          id: true,
        },
      });

      if (!caseRecord) {
        return next(CustomErrorHandler.notFound("Case not found"));
      }

      const hearing = await db.transaction(async (tx) => {
        const [newHearing] = await tx
          .insert(hearings)
          .values({
            caseId,
            hearingDate,
            stage: stage?.trim() || null,
            courtNo: courtNo?.trim() || null,
            remarks: remarks?.trim() || null,
          })
          .returning();

        await syncCaseFromHearings(tx, caseId, userId);

        return newHearing;
      });

      return res.status(201).json({
        success: true,
        message: "Hearing created successfully",
        data: hearing,
      });
    } catch (error) {
      console.error(error);
      return next(CustomErrorHandler.serverError());
    }
  },

  async updateHearing(
    req: Request<HearingParams, {}, HearingBody>,
    res: Response,
    next: NextFunction,
  ) {
    try {
      const tenantId = req.user?.tenantId;
      const officeId = req.officeId;
      const userId = req.user?.userId;

      const { id } = req.params;

      const { caseId, hearingDate, stage, courtNo, remarks } = req.body;

      if (!id) {
        return next(CustomErrorHandler.badRequest("Hearing id is required"));
      }

      if (!tenantId) {
        return next(CustomErrorHandler.badRequest("Tenant context is missing"));
      }

      if (!officeId) {
        return next(CustomErrorHandler.badRequest("Office context is missing"));
      }

      if (!userId) {
        return next(CustomErrorHandler.badRequest("User context is missing"));
      }

      if (!caseId) {
        return next(CustomErrorHandler.badRequest("Case id is required"));
      }

      if (!isIsoDate(hearingDate)) {
        return next(
          CustomErrorHandler.badRequest("Valid hearing date is required"),
        );
      }

      const existingHearing = await db.query.hearings.findFirst({
        where: eq(hearings.id, id),
        columns: {
          id: true,
          caseId: true,
        },
      });

      if (!existingHearing) {
        return next(CustomErrorHandler.notFound("Hearing not found"));
      }

      const targetCase = await db.query.cases.findFirst({
        where: and(
          eq(cases.id, caseId),
          eq(cases.tenantId, tenantId),
          eq(cases.officeId, officeId),
          isNull(cases.deletedAt),
        ),
        columns: {
          id: true,
        },
      });

      if (!targetCase) {
        return next(CustomErrorHandler.notFound("Case not found"));
      }

      const previousCaseId = existingHearing.caseId;

      const hearing = await db.transaction(async (tx) => {
        const [updatedHearing] = await tx
          .update(hearings)
          .set({
            caseId,
            hearingDate,
            stage: stage?.trim() || null,
            courtNo: courtNo?.trim() || null,
            remarks: remarks?.trim() || null,
          })
          .where(eq(hearings.id, id))
          .returning();

        await syncCaseFromHearings(tx, caseId, userId);

        if (previousCaseId && previousCaseId !== caseId) {
          await syncCaseFromHearings(tx, previousCaseId, userId);
        }

        return updatedHearing;
      });

      return res.status(200).json({
        success: true,
        message: "Hearing updated successfully",
        data: hearing,
      });
    } catch (error) {
      console.error(error);
      return next(CustomErrorHandler.serverError());
    }
  },

  async deleteHearing(
    req: Request<HearingParams>,
    res: Response,
    next: NextFunction,
  ) {
    try {
      const tenantId = req.user?.tenantId;
      const officeId = req.officeId;
      const userId = req.user?.userId;

      const { id } = req.params;

      if (!id) {
        return next(CustomErrorHandler.badRequest("Hearing id is required"));
      }

      if (!tenantId) {
        return next(CustomErrorHandler.badRequest("Tenant context is missing"));
      }

      if (!officeId) {
        return next(CustomErrorHandler.badRequest("Office context is missing"));
      }

      if (!userId) {
        return next(CustomErrorHandler.badRequest("User context is missing"));
      }

      const hearing = await db
        .select({
          id: hearings.id,
          caseId: hearings.caseId,
        })
        .from(hearings)
        .innerJoin(cases, eq(hearings.caseId, cases.id))
        .where(
          and(
            eq(hearings.id, id),
            eq(cases.tenantId, tenantId),
            eq(cases.officeId, officeId),
            isNull(cases.deletedAt),
          ),
        )
        .limit(1);

      if (hearing.length === 0) {
        return next(CustomErrorHandler.notFound("Hearing not found"));
      }

      const caseId = hearing[0].caseId;

      await db.transaction(async (tx) => {
        await tx.delete(hearings).where(eq(hearings.id, id));

        if (caseId) {
          await syncCaseFromHearings(tx, caseId, userId);
        }
      });

      return res.status(200).json({
        success: true,
        message: "Hearing deleted successfully",
      });
    } catch (error) {
      console.error(error);
      return next(CustomErrorHandler.serverError());
    }
  },
};

export default hearingController;
