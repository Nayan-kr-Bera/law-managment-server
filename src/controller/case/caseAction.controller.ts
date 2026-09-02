import { and, eq, inArray, or } from "drizzle-orm";
import { NextFunction, Request, Response } from "express";
import db from "../../db/index.js";
import {
  caseClients,
  caseDecisions,
  caseLinks,
  cases,
  caseStatusHistory,
  caseTags,
  caseTimelines,
  clientProfiles,
  companies,
  empanelments,
  tags
} from "../../db/schema/index.js";
import CustomErrorHandler from "../../utils/customErrorHandler.js";
import ResponseHandler from "../../utils/responseHandler.js";
const DISPOSAL_NATURES = [
  "judgment",
  "dismissed",
  "compromised_settled",
  "withdrawn",
  "allowed",
  "partly_allowed",
  "disposed_other",
] as const;
const caseActionController = {
  async addCaseLink(req: Request, res: Response, next: NextFunction) {
    try {
      const { caseId, linkedCaseId, notes } = req.body;

      const tenantId = req.user?.tenantId;
      const userId = req.user?.userId;

      if (!tenantId) {
        return next(
          CustomErrorHandler.badRequest("Tenant ID is required"),
        );
      }

      if (!userId) {
        return next(
          CustomErrorHandler.badRequest("User ID is required"),
        );
      }

      if (!caseId || !linkedCaseId) {
        return next(
          CustomErrorHandler.badRequest("caseId and linkedCaseId are required"),
        );
      }

      if (caseId === linkedCaseId) {
        return next(
          CustomErrorHandler.conflict("A case cannot be linked to itself"),
        );
      }

      const tenantCases = await db.query.cases.findMany({
        where: and(
          eq(cases.tenantId, tenantId),
          or(eq(cases.id, caseId), eq(cases.id, linkedCaseId)),
        ),
        columns: {
          id: true,
        },
      });

      if (tenantCases.length !== 2) {
        return next(CustomErrorHandler.notFound("One or both cases not found"));
      }

      const existingLink = await db.query.caseLinks.findFirst({
        where: and(
          eq(caseLinks.tenantId, tenantId),
          or(
            and(
              eq(caseLinks.caseId, caseId),
              eq(caseLinks.linkedCaseId, linkedCaseId),
            ),
            and(
              eq(caseLinks.caseId, linkedCaseId),
              eq(caseLinks.linkedCaseId, caseId),
            ),
          ),
        ),
      });

      if (existingLink) {
        return next(
          CustomErrorHandler.conflict("These cases are already linked"),
        );
      }

      const [newLink] = await db
        .insert(caseLinks)
        .values({
          tenantId,
          caseId,
          linkedCaseId,
          notes: notes?.trim() || null,
          createdBy: userId,
        })
        .returning();

      return res
        .status(201)
        .send(ResponseHandler(201, "Cases linked successfully", newLink));
    } catch (error) {
      console.error(error);
      return next(CustomErrorHandler.serverError());
    }
  },
  async updateCaseLink(req: Request, res: Response, next: NextFunction) {
    try {
      const { id } = req.params;
      const { notes } = req.body;

      const tenantId = req.user?.tenantId;
      if (!tenantId) {
        return next(
          CustomErrorHandler.badRequest("Tenant ID is required"),
        );
      }

      if (!id) {
        return next(CustomErrorHandler.badRequest("case link id is required"));
      }

      const existingLink = await db.query.caseLinks.findFirst({
        where: and(eq(caseLinks.id, id), eq(caseLinks.tenantId, tenantId)),
      });

      if (!existingLink) {
        return next(CustomErrorHandler.notFound("Case link not found"));
      }

      const [updatedLink] = await db
        .update(caseLinks)
        .set({
          notes: notes?.trim() || null,
        })
        .where(and(eq(caseLinks.id, id), eq(caseLinks.tenantId, tenantId)))
        .returning();

      return res
        .status(200)
        .send(
          ResponseHandler(200, "Case link updated successfully", updatedLink),
        );
    } catch (error) {
      console.error(error);
      return next(CustomErrorHandler.serverError());
    }
  },
  async getCaseLinks(req: Request, res: Response, next: NextFunction) {
    try {
      const { caseId } = req.params;

      const tenantId = req.user?.tenantId;
      const officeId = req.officeId;

      if (!tenantId) {
        return next(
          CustomErrorHandler.badRequest("Tenant ID is required"),
        );
      }

      if (!officeId) {
        return next(
          CustomErrorHandler.badRequest("Office ID is required"),
        );
      }

      if (!caseId) {
        return next(CustomErrorHandler.badRequest("Case id is required"));
      }


      // Check current case belongs to tenant + office
      const currentCase = await db.query.cases.findFirst({
        where: and(
          eq(cases.id, caseId),
          eq(cases.tenantId, tenantId),
          eq(cases.officeId, officeId),
        ),
        columns: {
          id: true,
        },
      });

      if (!currentCase) {
        return next(CustomErrorHandler.notFound("Case not found"));
      }

      // Find all links for this case
      const links = await db.query.caseLinks.findMany({
        where: and(
          eq(caseLinks.tenantId, tenantId),
          or(eq(caseLinks.caseId, caseId), eq(caseLinks.linkedCaseId, caseId)),
        ),
        columns: {
          id: true,
          caseId: true,
          linkedCaseId: true,
          notes: true,
          createdBy: true,
          createdAt: true,
        },
      });

      if (links.length === 0) {
        return res
          .status(200)
          .send(ResponseHandler(200, "Case links fetched successfully", []));
      }

      // Get the opposite case from each link
      const linkedCaseIds = links.map((link) =>
        link.caseId === caseId ? link.linkedCaseId : link.caseId,
      );

      // Only get linked cases from SAME tenant + SAME office
      const linkedCases = await db.query.cases.findMany({
        where: and(
          eq(cases.tenantId, tenantId),
          eq(cases.officeId, officeId),
          inArray(cases.id, linkedCaseIds),
        ),
        columns: {
          id: true,
          title: true,
          caseNumber: true,
          cnrNumber: true,
          referenceNumber: true,
          fileNumber: true,
          status: true,
          priority: true,
          nextHearingDate: true,
          firstParty: true,
          oppositeParty: true,
          judgeName: true,
          year: true,
          isDecided: true,
          isAbandoned: true,
        },
      });

      const linkedCaseMap = new Map(linkedCases.map((item) => [item.id, item]));

      const result = links
        .map((link) => {
          const linkedCaseId =
            link.caseId === caseId ? link.linkedCaseId : link.caseId;

          const linkedCase = linkedCaseMap.get(linkedCaseId);

          if (!linkedCase) {
            return null;
          }

          return {
            id: link.id,
            notes: link.notes,
            createdBy: link.createdBy,
            createdAt: link.createdAt,
            linkedCase,
          };
        })
        .filter((item): item is NonNullable<typeof item> => item !== null);

      return res
        .status(200)
        .send(ResponseHandler(200, "Case links fetched successfully", result));
    } catch (error) {
      console.error(error);
      return next(CustomErrorHandler.serverError());
    }
  },
  async removeCaseLink(req: Request, res: Response, next: NextFunction) {
    try {
      const { id } = req.params;
      const tenantId = req.user?.tenantId;
      if (!tenantId) {
        return next(
          CustomErrorHandler.badRequest("Tenant ID is required"),
        );
      }

      if (!id) {
        return next(CustomErrorHandler.badRequest("case link id is required"));
      }

      const existingLink = await db.query.caseLinks.findFirst({
        where: and(eq(caseLinks.id, id), eq(caseLinks.tenantId, tenantId)),
      });

      if (!existingLink) {
        return next(CustomErrorHandler.notFound("Case link not found"));
      }

      await db
        .delete(caseLinks)
        .where(and(eq(caseLinks.id, id), eq(caseLinks.tenantId, tenantId)));

      return res
        .status(200)
        .send(ResponseHandler(200, "Case link removed successfully"));
    } catch (error) {
      console.error(error);
      return next(CustomErrorHandler.serverError());
    }
  },
  async bulkCaseAction(req: Request, res: Response, next: NextFunction) {
    try {
      const {
        caseIds,
        action,
        priority,
        decisionDate,
        natureOfDisposal,
        judgmentSummary,
      } = req.body;

      const tenantId = req.user?.tenantId;
      const userId = req.user?.userId;

      if (!tenantId) {
        return next(
          CustomErrorHandler.badRequest("Tenant ID is required"),
        );
      }

      if (!userId) {
        return next(
          CustomErrorHandler.badRequest("User ID is required"),
        );
      }

      if (!Array.isArray(caseIds) || caseIds.length === 0) {
        return next(
          CustomErrorHandler.badRequest("At least one case id is required"),
        );
      }

      const uniqueCaseIds = [...new Set(caseIds)];

      const allowedActions = [
        "mark_important",
        "remove_important",
        "mark_decided",
        "mark_abandoned",
      ];

      if (!allowedActions.includes(action)) {
        return next(CustomErrorHandler.badRequest("Invalid case action"));
      }

      if (
        action === "mark_important" &&
        !["high", "urgent"].includes(priority)
      ) {
        return next(
          CustomErrorHandler.badRequest(
            "Priority must be high or urgent when marking cases as important",
          ),
        );
      }

      if (action === "mark_decided") {
        if (!decisionDate) {
          return next(
            CustomErrorHandler.badRequest(
              "Decision / disposal date is required",
            ),
          );
        }

        if (!natureOfDisposal) {
          return next(
            CustomErrorHandler.badRequest("Nature of disposal is required"),
          );
        }

        if (!DISPOSAL_NATURES.includes(natureOfDisposal)) {
          return next(
            CustomErrorHandler.badRequest("Invalid nature of disposal"),
          );
        }
      }
      const tenantCases = await db.query.cases.findMany({
        where: and(
          eq(cases.tenantId, tenantId),
          inArray(cases.id, uniqueCaseIds),
        ),
        columns: {
          id: true,
        },
      });

      if (tenantCases.length !== uniqueCaseIds.length) {
        return next(
          CustomErrorHandler.notFound("One or more cases were not found"),
        );
      }

      let updateData: Partial<typeof cases.$inferInsert> = {
        updatedBy: userId,
        updatedAt: new Date(),
      };

      switch (action) {
        case "mark_important":
          updateData = {
            ...updateData,
            priority,
          };
          break;

        case "remove_important":
          updateData = {
            ...updateData,
            priority: "medium",
          };
          break;

        case "mark_decided":
          updateData = {
            ...updateData,
            isDecided: true,
            status: "disposed",
            disposedDate: decisionDate,
          };
          break;

        case "mark_abandoned":
          updateData = {
            ...updateData,
            isAbandoned: true,
          };
          break;
      }

      const updatedCases = await db.transaction(async (tx) => {
        const updated = await tx
          .update(cases)
          .set(updateData)
          .where(
            and(eq(cases.tenantId, tenantId), inArray(cases.id, uniqueCaseIds)),
          )
          .returning({
            id: cases.id,
          });

        if (action === "mark_decided") {
          await tx.insert(caseDecisions).values(
            uniqueCaseIds.map((caseId) => ({
              caseId,
              decisionDate,
              natureOfDisposal,
              judgmentSummary: judgmentSummary || null,
              createdBy: userId,
            })),
          );
        }

        return updated;
      });

      return res.status(200).send(
        ResponseHandler(
          200,
          `${updatedCases.length} case(s) updated successfully`,
          {
            action,
            updatedCount: updatedCases.length,
            caseIds: updatedCases.map((item) => item.id),
          },
        ),
      );
    } catch (error) {
      console.error(error);
      return next(CustomErrorHandler.serverError());
    }
  },
  async updateCaseCompany(req: Request, res: Response, next: NextFunction) {
    try {
      const { caseId } = req.params;
      const { companyId } = req.body;

      const tenantId = req.user?.tenantId;
      const userId = req.user?.userId;

      if (!tenantId) {
        return next(
          CustomErrorHandler.badRequest("Tenant ID is required"),
        );
      }

      if (!userId) {
        return next(
          CustomErrorHandler.badRequest("User ID is required"),
        );
      }

      if (!caseId) {
        return next(CustomErrorHandler.badRequest("Case id is required"));
      }

      const caseRecord = await db.query.cases.findFirst({
        where: and(eq(cases.id, caseId), eq(cases.tenantId, tenantId)),
        columns: {
          id: true,
          companyId: true,
        },
      });

      if (!caseRecord) {
        return next(CustomErrorHandler.notFound("Case not found"));
      }

      // Remove company
      if (!companyId) {
        if (!caseRecord.companyId) {
          return next(
            CustomErrorHandler.badRequest(
              "No company is attached to this case",
            ),
          );
        }

        await db
          .update(cases)
          .set({
            companyId: null,
            updatedBy: userId,
            updatedAt: new Date(),
          })
          .where(and(eq(cases.id, caseId), eq(cases.tenantId, tenantId)));

        return res
          .status(200)
          .send(ResponseHandler(200, "Company removed from case successfully"));
      }

      // Same company already attached
      if (caseRecord.companyId === companyId) {
        return next(
          CustomErrorHandler.conflict(
            "This company is already attached to the case",
          ),
        );
      }

      // Check company belongs to tenant
      const company = await db.query.companies.findFirst({
        where: and(
          eq(companies.id, companyId),
          eq(companies.tenantId, tenantId),
        ),
        columns: {
          id: true,
        },
      });

      if (!company) {
        return next(CustomErrorHandler.notFound("Company not found"));
      }

      await db
        .update(cases)
        .set({
          companyId,
          updatedBy: userId,
          updatedAt: new Date(),
        })
        .where(and(eq(cases.id, caseId), eq(cases.tenantId, tenantId)));

      return res
        .status(200)
        .send(ResponseHandler(200, "Company updated successfully"));
    } catch (error) {
      console.error(error);
      return next(CustomErrorHandler.serverError());
    }
  },
  async removeCaseCompany(req: Request, res: Response, next: NextFunction) {
    try {
      const { caseId } = req.params;

      const tenantId = req.user?.tenantId;
      const userId = req.user?.userId;

      if (!tenantId) {
        return next(
          CustomErrorHandler.badRequest("Tenant ID is required"),
        );
      }

      if (!userId) {
        return next(
          CustomErrorHandler.badRequest("User ID is required"),
        );
      }
      if (!caseId) {
        return next(CustomErrorHandler.badRequest("Case id is required"));
      }

      const caseRecord = await db.query.cases.findFirst({
        where: and(eq(cases.id, caseId), eq(cases.tenantId, tenantId)),
        columns: {
          id: true,
          companyId: true,
        },
      });

      if (!caseRecord) {
        return next(CustomErrorHandler.notFound("Case not found"));
      }

      if (!caseRecord.companyId) {
        return next(
          CustomErrorHandler.badRequest("No company is attached to this case"),
        );
      }

      await db
        .update(cases)
        .set({
          companyId: null,
          updatedBy: userId,
          updatedAt: new Date(),
        })
        .where(and(eq(cases.id, caseId), eq(cases.tenantId, tenantId)));

      return res
        .status(200)
        .send(ResponseHandler(200, "Company removed from case successfully"));
    } catch (error) {
      console.error(error);
      return next(CustomErrorHandler.serverError());
    }
  },
  async updateCaseEmpanelment(req: Request, res: Response, next: NextFunction) {
    try {
      const { caseId } = req.params;
      const { empanelmentId } = req.body;

      const tenantId = req.user?.tenantId;
      const userId = req.user?.userId;

      if (!tenantId) {
        return next(
          CustomErrorHandler.badRequest("Tenant ID is required"),
        );
      }

      if (!userId) {
        return next(
          CustomErrorHandler.badRequest("User ID is required"),
        );
      }
      if (!caseId) {
        return next(CustomErrorHandler.badRequest("Case id is required"));
      }

      const caseRecord = await db.query.cases.findFirst({
        where: and(eq(cases.id, caseId), eq(cases.tenantId, tenantId)),
        columns: {
          id: true,
          empanelmentId: true,
        },
      });

      if (!caseRecord) {
        return next(CustomErrorHandler.notFound("Case not found"));
      }

      // Remove empanelment
      if (!empanelmentId) {
        if (!caseRecord.empanelmentId) {
          return next(
            CustomErrorHandler.badRequest(
              "No empanelment is attached to this case",
            ),
          );
        }

        await db
          .update(cases)
          .set({
            empanelmentId: null,
            updatedBy: userId,
            updatedAt: new Date(),
          })
          .where(and(eq(cases.id, caseId), eq(cases.tenantId, tenantId)));

        return res
          .status(200)
          .send(
            ResponseHandler(200, "Empanelment removed from case successfully"),
          );
      }

      // Same empanelment already attached
      if (caseRecord.empanelmentId === empanelmentId) {
        return next(
          CustomErrorHandler.conflict(
            "This empanelment is already attached to the case",
          ),
        );
      }

      // Check empanelment belongs to tenant
      const empanelment = await db.query.empanelments.findFirst({
        where: and(
          eq(empanelments.id, empanelmentId),
          eq(empanelments.tenantId, tenantId),
        ),
        columns: {
          id: true,
        },
      });

      if (!empanelment) {
        return next(CustomErrorHandler.notFound("Empanelment not found"));
      }

      await db
        .update(cases)
        .set({
          empanelmentId,
          updatedBy: userId,
          updatedAt: new Date(),
        })
        .where(and(eq(cases.id, caseId), eq(cases.tenantId, tenantId)));

      return res
        .status(200)
        .send(ResponseHandler(200, "Empanelment updated successfully"));
    } catch (error) {
      console.error(error);
      return next(CustomErrorHandler.serverError());
    }
  },
  async removeCaseEmpanelment(req: Request, res: Response, next: NextFunction) {
    try {
      const { caseId } = req.params;

      const tenantId = req.user?.tenantId;
      const userId = req.user?.userId;

      if (!tenantId) {
        return next(
          CustomErrorHandler.badRequest("Tenant ID is required"),
        );
      }

      if (!userId) {
        return next(
          CustomErrorHandler.badRequest("User ID is required"),
        );
      }

      if (!caseId) {
        return next(CustomErrorHandler.badRequest("Case id is required"));
      }

      const caseRecord = await db.query.cases.findFirst({
        where: and(eq(cases.id, caseId), eq(cases.tenantId, tenantId)),
        columns: {
          id: true,
          empanelmentId: true,
        },
      });

      if (!caseRecord) {
        return next(CustomErrorHandler.notFound("Case not found"));
      }

      if (!caseRecord.empanelmentId) {
        return next(
          CustomErrorHandler.badRequest(
            "No empanelment is attached to this case",
          ),
        );
      }

      await db
        .update(cases)
        .set({
          empanelmentId: null,
          updatedBy: userId,
          updatedAt: new Date(),
        })
        .where(and(eq(cases.id, caseId), eq(cases.tenantId, tenantId)));

      return res
        .status(200)
        .send(
          ResponseHandler(200, "Empanelment removed from case successfully"),
        );
    } catch (error) {
      console.error(error);
      return next(CustomErrorHandler.serverError());
    }
  },
  async addCaseTag(req: Request, res: Response, next: NextFunction) {
    try {
      const { caseId } = req.params;
      const { tagId } = req.body;

      const tenantId = req.user?.tenantId;

      if (!tenantId) {
        return next(
          CustomErrorHandler.badRequest("Tenant ID is required"),
        );
      }
      if (!caseId || !tagId) {
        return next(
          CustomErrorHandler.badRequest("caseId and tagId are required"),
        );
      }

      // Check case
      const caseRecord = await db.query.cases.findFirst({
        where: and(eq(cases.id, caseId), eq(cases.tenantId, tenantId)),
      });

      if (!caseRecord) {
        return next(CustomErrorHandler.notFound("Case not found"));
      }

      const tag = await db.query.tags.findFirst({
        where: and(
          eq(tags.id, tagId),
          or(eq(tags.tenantId, tenantId), eq(tags.isBuiltIn, true)),
        ),
      });

      if (!tag) {
        return next(CustomErrorHandler.notFound("Tag not found"));
      }

      const existingTag = await db.query.caseTags.findFirst({
        where: and(eq(caseTags.caseId, caseId), eq(caseTags.tagId, tagId)),
      });

      if (existingTag) {
        return next(
          CustomErrorHandler.badRequest("Tag is already assigned to this case"),
        );
      }

      await db.insert(caseTags).values({
        caseId,
        tagId,
      });

      return res
        .status(201)
        .send(ResponseHandler(201, "Tag added to case successfully"));
    } catch (error) {
      console.error(error);
      return next(CustomErrorHandler.serverError());
    }
  },
  async removeCaseTag(req: Request, res: Response, next: NextFunction) {
    try {
      const { caseId, tagId } = req.params;
      const tenantId = req.user?.tenantId;

      if (!tenantId) {
        return next(
          CustomErrorHandler.badRequest("Tenant ID is required"),
        );
      }
      if (!caseId || !tagId) {
        return next(
          CustomErrorHandler.badRequest("caseId and tagId are required"),
        );
      }

      const caseRecord = await db.query.cases.findFirst({
        where: and(eq(cases.id, caseId), eq(cases.tenantId, tenantId)),
        columns: {
          id: true,
        },
      });

      if (!caseRecord) {
        return next(CustomErrorHandler.notFound("Case not found"));
      }

      const existingTag = await db.query.caseTags.findFirst({
        where: and(eq(caseTags.caseId, caseId), eq(caseTags.tagId, tagId)),
      });

      if (!existingTag) {
        return next(
          CustomErrorHandler.notFound("Tag is not assigned to this case"),
        );
      }

      await db
        .delete(caseTags)
        .where(and(eq(caseTags.caseId, caseId), eq(caseTags.tagId, tagId)));

      return res
        .status(200)
        .send(ResponseHandler(200, "Tag removed from case successfully"));
    } catch (error) {
      console.error(error);
      return next(CustomErrorHandler.serverError());
    }
  },
  async addCaseClient(req: Request, res: Response, next: NextFunction) {
    try {
      const { caseId } = req.params;
      const { clientId, role } = req.body;

      const tenantId = req.user?.tenantId;
      if (!tenantId) {
        return next(
          CustomErrorHandler.badRequest("Tenant ID is required"),
        );
      }

      if (!caseId || !clientId) {
        return next(
          CustomErrorHandler.badRequest("caseId and clientId are required"),
        );
      }

      const caseRecord = await db.query.cases.findFirst({
        where: and(eq(cases.id, caseId), eq(cases.tenantId, tenantId)),
      });

      if (!caseRecord) {
        return next(CustomErrorHandler.notFound("Case not found"));
      }

      // Verify client identity exists and belongs to this tenant
      const clientProfile = await db.query.clientProfiles.findFirst({
        where: and(eq(clientProfiles.identityId, clientId), eq(clientProfiles.tenantId, tenantId)),
      });

      if (!clientProfile) {
        return next(CustomErrorHandler.notFound("Client not found"));
      }

      const existingClient = await db.query.caseClients.findFirst({
        where: and(
          eq(caseClients.caseId, caseId),
          eq(caseClients.clientId, clientId),
        ),
      });

      if (existingClient) {
        return next(
          CustomErrorHandler.badRequest(
            "Client is already assigned to this case",
          ),
        );
      }

      const [caseClient] = await db
        .insert(caseClients)
        .values({
          caseId,
          clientId,
          role: role?.trim() || null,
        })
        .returning();

      return res
        .status(201)
        .send(
          ResponseHandler(201, "Client added to case successfully", caseClient),
        );
    } catch (error) {
      console.error(error);
      return next(CustomErrorHandler.serverError());
    }
  },
  async removeCaseClient(req: Request, res: Response, next: NextFunction) {
    try {
      const { caseId, clientId } = req.params;

      const tenantId = req.user?.tenantId;
      if (!tenantId) {
        return next(
          CustomErrorHandler.badRequest("Tenant ID is required"),
        );
      }
      if (!caseId || !clientId) {
        return next(
          CustomErrorHandler.badRequest("caseId and clientId are required"),
        );
      }

      const caseRecord = await db.query.cases.findFirst({
        where: and(eq(cases.id, caseId), eq(cases.tenantId, tenantId)),
      });

      if (!caseRecord) {
        return next(CustomErrorHandler.notFound("Case not found"));
      }

      const existingClient = await db.query.caseClients.findFirst({
        where: and(
          eq(caseClients.caseId, caseId),
          eq(caseClients.clientId, clientId),
        ),
      });

      if (!existingClient) {
        return next(
          CustomErrorHandler.notFound("Client is not assigned to this case"),
        );
      }

      await db
        .delete(caseClients)
        .where(
          and(
            eq(caseClients.caseId, caseId),
            eq(caseClients.clientId, clientId),
          ),
        );

      return res
        .status(200)
        .send(ResponseHandler(200, "Client removed from case successfully"));
    } catch (error) {
      console.error(error);
      return next(CustomErrorHandler.serverError());
    }
  },
  async updateCase(req: Request, res: Response, next: NextFunction) {
    try {
      const { id } = req.params;

      const tenantId = req.user?.tenantId;
      const userId = req.user?.userId;

      if (!tenantId) {
        return next(
          CustomErrorHandler.badRequest("Tenant ID is required"),
        );
      }

      if (!userId) {
        return next(
          CustomErrorHandler.badRequest("User ID is required"),
        );
      }

      if (!id) {
        return next(CustomErrorHandler.badRequest("Case id is required"));
      }

      const {
        title,
        caseNumber,
        cnrNumber,
        referenceNumber,
        fileNumber,

        courtId,
        courtNumber,
        judgeName,

        firstParty,
        oppositeParty,

        companyId,
        empanelmentId,

        nextHearingDate,
        stage,
        remarks,

        priority,

        isDecided,
        isAbandoned,
      } = req.body;

      const existingCase = await db.query.cases.findFirst({
        where: and(eq(cases.id, id), eq(cases.tenantId, tenantId)),
      });

      if (!existingCase) {
        return next(CustomErrorHandler.notFound("Case not found"));
      }

      let newStatus = existingCase.status;

      if (isAbandoned === true) {
        newStatus = "archived";
      } else if (isDecided === true) {
        newStatus = "disposed";
      }

      // If previously abandoned/decided and user removes it,
      // return it to open status.
      if (isAbandoned === false && existingCase.isAbandoned === true) {
        newStatus = "open";
      }

      if (isDecided === false && existingCase.isDecided === true) {
        newStatus = "open";
      }

      const [updatedCase] = await db
        .update(cases)
        .set({
          title,
          caseNumber,
          cnrNumber,
          referenceNumber,
          fileNumber,

          courtId,
          courtNumber,
          judgeName,

          firstParty,
          oppositeParty,

          companyId,
          empanelmentId,

          nextHearingDate,
          stage,
          remarks,

          priority,

          isDecided,
          isAbandoned,

          status: newStatus,

          updatedBy: userId,
          updatedAt: new Date(),
        })
        .where(and(eq(cases.id, id), eq(cases.tenantId, tenantId)))
        .returning();

      if (existingCase.status !== newStatus) {
        await db.insert(caseStatusHistory).values({
          caseId: id,
          oldStatus: existingCase.status,
          newStatus,
          changedBy: userId,
        });
      }

      await db.insert(caseTimelines).values({
        caseId: id,
        userId,
        activityType: "case_updated",
        title: "Case details updated",
        description: "Case information was updated",
      });

      return res
        .status(200)
        .send(ResponseHandler(200, "Case updated successfully", updatedCase));
    } catch (error) {
      console.error(error);
      return next(CustomErrorHandler.serverError());
    }
  },
};
export default caseActionController;
