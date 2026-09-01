import { Request, Response, NextFunction } from "express";
import db from "../../db/index.js";
import users from "../../db/schema/users.js";
import { and, count, desc, eq, ilike, inArray, or } from "drizzle-orm";
import bcrypt from "bcrypt";
import userScopes from "../../db/schema/userScope.js";
import userScopeOffices from "../../db/schema/userscopeoffices.js";
import {
  advocates,
  caseAdvocates,
  cases,
  caseTypes,
  courts,
  offices,
  roles,
  userRoles,
} from "../../db/schema/index.js";
import {
  assignCasesSchema,
  reassignCasesSchema,
} from "../../validators/advocate.validator.js";
import CustomErrorHandler from "../../utils/customErrorHandler.js";
import advocateEmailService from "../../services/advocateEmail.service.js";
const advocatesController = {
  async getadvocates(req: Request, res: Response, next: NextFunction) {
    try {
      const tenantId = req.user.tenantId;

      if (!tenantId) {
        return res.status(400).json({
          success: false,
          message: "Tenant ID is required",
        });
      }

      const page = Number(req.query.page) > 0 ? Number(req.query.page) : 1;
      const limit = Number(req.query.limit) > 0 ? Number(req.query.limit) : 10;
      const search = ((req.query.search as string) || "").trim().toLowerCase();

      const scopes = await db.query.userScopes.findMany({
        where: eq(userScopes.tenantId, tenantId),
        with: {
          user: {
            with: {
              advocate: {
                with: {
                  cases: true,
                },
              },
            },
          },
          roles: {
            with: {
              role: true,
            },
          },
          offices: {
            with: {
              office: true,
            },
          },
        },
      });

      const filtered = scopes.filter((scope) => {
        if (!scope.user?.advocate) return false;

        if (!search) return true;

        const advocate = scope.user.advocate;

        return [
          scope.user.name,
          scope.user.email,
          scope.user.phone,
          advocate.enrollmentNo,
          advocate.barCouncil,
          advocate.designation,
          advocate.practiceArea,
        ]
          .filter(Boolean)
          .some((value) => value!.toLowerCase().includes(search));
      });

      const total = filtered.length;
      const totalPages = Math.ceil(total / limit);
      const offset = (page - 1) * limit;

      const data = filtered.slice(offset, offset + limit).map((scope) => {
        const advocate = scope.user!.advocate!;

        return {
          id: advocate.id,
          userId: scope.user!.id,
          name: scope.user!.name,
          email: scope.user!.email,
          phone: scope.user!.phone,
          enrollmentNo: advocate.enrollmentNo,
          barCouncil: advocate.barCouncil,
          designation: advocate.designation,
          practiceArea: advocate.practiceArea,

          role:
            scope.roles.length > 0
              ? {
                  id: scope.roles[0].role.id,
                  name: scope.roles[0].role.name,
                }
              : null,

          offices: scope.offices.map((item) => ({
            id: item.office.id,
            name: item.office.name,
          })),

          assignedCases: advocate.cases.length,
        };
      });

      return res.status(200).json({
        success: true,
        data,
        pagination: {
          page,
          limit,
          total,
          totalPages,
          hasNextPage: page < totalPages,
          hasPreviousPage: page > 1,
        },
      });
    } catch (error) {
      next(error);
    }
  },
  async createAdvocate(req: Request, res: Response, next: NextFunction) {
    try {
      const {
        name,
        email,
        phone,
        password,
        officeId,
        roleId,
        enrollmentNo,
        barCouncil,
        designation,
        practiceArea,
      } = req.body;

      const tenantId = req.user.tenantId;

      const existingEmail = await db.query.user.findFirst({
        where: eq(users.email, email),
      });

      if (existingEmail) {
        throw new Error("Email already exists");
      }

      const existingPhone = await db.query.user.findFirst({
        where: eq(users.phone, phone),
      });

      if (existingPhone) {
        throw new Error("Phone already exists");
      }

      const office = await db.query.offices.findFirst({
        where: and(eq(offices.id, officeId), eq(offices.tenantId, tenantId)),
      });

      if (!office) {
        throw new Error(
          "Invalid office or office does not belong to this tenant",
        );
      }

      const role = await db.query.roles.findFirst({
        where: eq(roles.id, roleId),
      });

      if (!role) {
        throw new Error("Invalid role");
      }

      const hashedPassword = await bcrypt.hash(password, 10);

      const result = await db.transaction(async (tx) => {
        // Create User
        const [user] = await tx
          .insert(users)
          .values({
            name,
            email,
            phone,
            password: hashedPassword,
          })
          .returning();

        // Create User Scope
        const [scope] = await tx
          .insert(userScopes)
          .values({
            userId: user.id,
            tenantId,
            isDefault: true,
          })
          .returning();

        // Attach Office
        await tx.insert(userScopeOffices).values({
          userScopeId: scope.id,
          officeId,
        });

        // Assign Role
        await tx.insert(userRoles).values({
          scopeId: scope.id,
          roleId,
        });

        // Create Advocate
        const [advocate] = await tx
          .insert(advocates)
          .values({
            userId: user.id,
            enrollmentNo,
            barCouncil,
            designation,
            practiceArea,
          })
          .returning();

        return {
          user,
          scope,
          advocate,
        };
      });

      const emailResult = await advocateEmailService({
        advocateName: result.user.name,
        advocateEmail: result.user.email,
        password,

        officeName: office.name,
        roleName: role.name,

        designation: result.advocate.designation ?? undefined,
        enrollmentNo: result.advocate.enrollmentNo ?? undefined,
        barCouncil: result.advocate.barCouncil ?? undefined,
        practiceArea: result.advocate.practiceArea ?? undefined,
      });

      return res.status(201).json({
        success: true,
        message: emailResult.success
          ? "Advocate created successfully and welcome email sent"
          : "Advocate created successfully, but welcome email could not be sent",
        data: result.advocate,
      });
    } catch (error) {
      next(error);
    }
  },
  async updateAdvocate(req: Request, res: Response, next: NextFunction) {
    try {
      const { id } = req.params;

      const {
        name,
        email,
        phone,
        officeId,
        roleId,
        enrollmentNo,
        barCouncil,
        designation,
        practiceArea,
      } = req.body;

      const advocate = await db.query.advocates.findFirst({
        where: eq(advocates.id, id),
        with: {
          user: {
            with: {
              scopes: {
                with: {
                  offices: true,
                  roles: true,
                },
              },
            },
          },
        },
      });

      if (!advocate || !advocate.user) {
        return res.status(404).json({
          success: false,
          message: "Advocate not found",
        });
      }

      // Check email uniqueness
      if (email && email !== advocate.user.email) {
        const existingEmail = await db.query.user.findFirst({
          where: eq(users.email, email),
        });

        if (existingEmail) {
          return res.status(400).json({
            success: false,
            message: "Email already exists",
          });
        }
      }

      // Check phone uniqueness
      if (phone && phone !== advocate.user.phone) {
        const existingPhone = await db.query.user.findFirst({
          where: eq(users.phone, phone),
        });

        if (existingPhone) {
          return res.status(400).json({
            success: false,
            message: "Phone already exists",
          });
        }
      }

      await db.transaction(async (tx) => {
        await tx
          .update(users)
          .set({
            name,
            email,
            phone,
            updatedAt: new Date(),
          })
          .where(eq(users.id, advocate.userId));

        await tx
          .update(advocates)
          .set({
            enrollmentNo,
            barCouncil,
            designation,
            practiceArea,
          })
          .where(eq(advocates.id, id));

        const defaultScope = advocate.user.scopes.find(
          (s: (typeof advocate.user.scopes)[number]) => s.isDefault,
        );

        if (defaultScope) {
          if (officeId && defaultScope.offices.length) {
            await tx
              .update(userScopeOffices)
              .set({
                officeId,
              })
              .where(eq(userScopeOffices.userScopeId, defaultScope.id));
          }

          if (roleId && defaultScope.roles.length) {
            await tx
              .update(userRoles)
              .set({
                roleId,
              })
              .where(eq(userRoles.scopeId, defaultScope.id));
          }
        }
      });

      const updated = await db.query.advocates.findFirst({
        where: eq(advocates.id, id),
        with: {
          user: {
            with: {
              scopes: {
                with: {
                  offices: true,
                  roles: true,
                },
              },
            },
          },
        },
      });

      return res.json({
        success: true,
        message: "Advocate updated successfully",
        data: updated,
      });
    } catch (error) {
      next(error);
    }
  },
  async deleteAdvocate(req: Request, res: Response, next: NextFunction) {
    try {
      const { id } = req.params;
      const tenantId = req.user.tenantId;

      if (!tenantId) {
        return next(CustomErrorHandler.badRequest("Tenant ID is required."));
      }

      // 1. Find advocate
      const advocate = await db.query.advocates.findFirst({
        where: eq(advocates.id, id),
      });

      if (!advocate) {
        return next(CustomErrorHandler.notFound("Advocate not found."));
      }

      // 2. Get advocate's scopes for the current tenant
      // Avoid relational `with: { user: { scopes: true } }`
      // because users <-> userScopes has multiple relations.
      const scopes = await db
        .select({
          id: userScopes.id,
        })
        .from(userScopes)
        .where(
          and(
            eq(userScopes.userId, advocate.userId),
            eq(userScopes.tenantId, tenantId),
          ),
        );

      if (scopes.length === 0) {
        return next(
          CustomErrorHandler.forbidden(
            "Advocate does not belong to this tenant.",
          ),
        );
      }

      const scopeIds = scopes.map((scope) => scope.id);

      await db.transaction(async (tx) => {
        // 3. Remove case assignments first
        await tx.delete(caseAdvocates).where(eq(caseAdvocates.advocateId, id));

        // 4. Remove roles attached to scopes
        if (scopeIds.length > 0) {
          await tx
            .delete(userRoles)
            .where(inArray(userRoles.scopeId, scopeIds));

          // 5. Remove office assignments
          await tx
            .delete(userScopeOffices)
            .where(inArray(userScopeOffices.userScopeId, scopeIds));

          // 6. Remove scopes
          await tx.delete(userScopes).where(inArray(userScopes.id, scopeIds));
        }

        // 7. Delete advocate
        await tx.delete(advocates).where(eq(advocates.id, id));

        // 8. Check whether this user still has another scope.
        // If not, delete the underlying user too.
        const remainingScopes = await tx
          .select({
            id: userScopes.id,
          })
          .from(userScopes)
          .where(eq(userScopes.userId, advocate.userId))
          .limit(1);

        if (remainingScopes.length === 0) {
          await tx.delete(users).where(eq(users.id, advocate.userId));
        }
      });

      return res.status(200).json({
        success: true,
        message: "Advocate deleted successfully",
      });
    } catch (error) {
      next(error);
    }
  },
  async assignCases(req: Request, res: Response, next: NextFunction) {
    const validated = assignCasesSchema.safeParse(req.body);

    if (!validated.success) {
      return next(validated.error);
    }

    try {
      const { advocateId } = req.params;
      const tenantId = req.user.tenantId;

      const { cases: assignedCases } = validated.data;

      // Check advocate
      const advocate = await db.query.advocates.findFirst({
        where: eq(advocates.id, advocateId),
        with: {
          user: {
            with: {
              scopes: true,
            },
          },
        },
      });

      if (!advocate) {
        return next(CustomErrorHandler.notFound("Advocate not found."));
      }

      const belongsToTenant = advocate.user.scopes.some(
        (scope) => scope.tenantId === tenantId,
      );

      if (!belongsToTenant) {
        return next(
          CustomErrorHandler.forbidden(
            "Advocate does not belong to this tenant.",
          ),
        );
      }

      const caseIds = assignedCases.map((c) => c.caseId);

      // Validate cases
      if (caseIds.length) {
        const existingCases = await db.query.cases.findMany({
          where: (c, { and, eq, inArray }) =>
            and(eq(c.tenantId, tenantId), inArray(c.id, caseIds)),
        });

        if (existingCases.length !== caseIds.length) {
          return next(
            CustomErrorHandler.notFound("One or more cases were not found."),
          );
        }
      }

      await db.transaction(async (tx) => {
        // Current assignments
        const existingAssignments = await tx
          .select({
            caseId: caseAdvocates.caseId,
          })
          .from(caseAdvocates)
          .where(eq(caseAdvocates.advocateId, advocateId));

        const existingCaseIds = new Set(
          existingAssignments.map((a) => a.caseId),
        );

        const incomingCaseIds = new Set(caseIds);

        // Cases to add
        const toInsert = assignedCases.filter(
          (item) => !existingCaseIds.has(item.caseId),
        );

        // Cases to remove
        const toRemove = [...existingCaseIds].filter(
          (id) => !incomingCaseIds.has(id),
        );

        if (toInsert.length) {
          await tx.insert(caseAdvocates).values(
            toInsert.map((item) => ({
              advocateId,
              caseId: item.caseId,
              isPrimary: item.isPrimary ?? false,
            })),
          );
        }

        if (toRemove.length) {
          await tx
            .delete(caseAdvocates)
            .where(
              and(
                eq(caseAdvocates.advocateId, advocateId),
                inArray(caseAdvocates.caseId, toRemove),
              ),
            );
        }
      });

      return res.status(200).json({
        success: true,
        message: "Case assignments updated successfully.",
      });
    } catch (error) {
      console.error(error);
      return next(CustomErrorHandler.serverError());
    }
  },
  async reassignCases(req: Request, res: Response, next: NextFunction) {
    try {
      const tenantId = req.user.tenantId;
      const validated = reassignCasesSchema.safeParse(req.body);

      if (!validated.success) {
        return next(validated.error);
      }
      const {
        fromAdvocateId,
        toAdvocateId,
        caseIds,
      }: {
        fromAdvocateId: string;
        toAdvocateId: string;
        caseIds: string[];
      } = validated.data;

      if (!caseIds?.length) {
        return next(
          CustomErrorHandler.badRequest("Please select at least one case"),
        );
      }

      if (fromAdvocateId === toAdvocateId) {
        return next(
          CustomErrorHandler.badRequest("Both advocates cannot be same"),
        );
      }

      const fromAdvocate = await db.query.advocates.findFirst({
        where: eq(advocates.id, fromAdvocateId),
        with: {
          user: {
            with: {
              scopes: true,
            },
          },
        },
      });

      if (!fromAdvocate) {
        return next(CustomErrorHandler.notFound("Current advocate not found."));
      }

      const fromBelongsToTenant = fromAdvocate.user.scopes.some(
        (scope) => scope.tenantId === tenantId,
      );

      if (!fromBelongsToTenant) {
        return next(
          CustomErrorHandler.forbidden(
            "Current advocate does not belong to this tenant.",
          ),
        );
      }

      const toAdvocate = await db.query.advocates.findFirst({
        where: eq(advocates.id, toAdvocateId),
        with: {
          user: {
            with: {
              scopes: true,
            },
          },
        },
      });

      if (!toAdvocate) {
        return next(CustomErrorHandler.notFound("Target advocate not found."));
      }

      const toBelongsToTenant = toAdvocate.user.scopes.some(
        (scope) => scope.tenantId === tenantId,
      );

      if (!toBelongsToTenant) {
        return next(
          CustomErrorHandler.forbidden(
            "Target advocate does not belong to this tenant.",
          ),
        );
      }

      const tenantCases = await db
        .select({ id: cases.id })
        .from(cases)
        .where(and(eq(cases.tenantId, tenantId), inArray(cases.id, caseIds)));

      if (tenantCases.length !== caseIds.length) {
        return next(CustomErrorHandler.badRequest("Invalid case selection"));
      }

      await db.transaction(async (tx) => {
        await tx
          .delete(caseAdvocates)
          .where(
            and(
              eq(caseAdvocates.advocateId, fromAdvocateId),
              inArray(caseAdvocates.caseId, caseIds),
            ),
          );

        await tx.insert(caseAdvocates).values(
          caseIds.map((caseId) => ({
            caseId,
            advocateId: toAdvocateId,
            isPrimary: false,
          })),
        );
      });

      return res.status(200).json({
        success: true,
        message: "Cases reassigned successfully",
      });
    } catch (error) {
      console.error(error);
      return next(CustomErrorHandler.serverError());
    }
  },
  async getAdvocateCases(req: Request, res: Response, next: NextFunction) {
    try {
      const tenantId = req.user.tenantId;
      const { advocateId } = req.params;

      const {
        status,
        running,
        isDecided,
        isAbandoned,
        search,
        page = "1",
        limit = "10",
      } = req.query;

      const pageNumber = Number(page);
      const pageSize = Number(limit);
      const offset = (pageNumber - 1) * pageSize;

      const conditions = [
        eq(cases.tenantId, tenantId),
        eq(caseAdvocates.advocateId, advocateId),
      ];

      if (status) {
        conditions.push(
          eq(cases.status, status as typeof cases.$inferSelect.status),
        );
      }

      if (running === "true") {
        conditions.push(
          inArray(cases.status, ["open", "pending", "in_progress", "stayed"]),
        );

        conditions.push(eq(cases.isDecided, false));
        conditions.push(eq(cases.isAbandoned, false));
      }

      if (isDecided !== undefined) {
        conditions.push(eq(cases.isDecided, isDecided === "true"));
      }

      if (isAbandoned !== undefined) {
        conditions.push(eq(cases.isAbandoned, isAbandoned === "true"));
      }

      if (search) {
        conditions.push(
          or(
            ilike(cases.title, `%${search}%`),
            ilike(cases.caseNumber, `%${search}%`),
            ilike(cases.cnrNumber, `%${search}%`),
            ilike(cases.referenceNumber, `%${search}%`),
            ilike(cases.firstParty, `%${search}%`),
            ilike(cases.oppositeParty, `%${search}%`),
          )!,
        );
      }

      const where = and(...conditions);

      const data = await db
        .select({
          id: cases.id,

          title: cases.title,

          caseNo: cases.caseNumber,
          cnrNo: cases.cnrNumber,
          referenceNo: cases.referenceNumber,

          year: cases.year,

          previousDate: cases.registrationDate,
          nextDate: cases.nextHearingDate,

          courtNo: cases.courtNumber,

          firstParty: cases.firstParty,
          oppositeParty: cases.oppositeParty,

          fixedFor: cases.stage,

          status: cases.status,
          priority: cases.priority,

          isDecided: cases.isDecided,
          isAbandoned: cases.isAbandoned,

          createdAt: cases.createdAt,

          court: courts.name,

          type: caseTypes.name,
        })
        .from(caseAdvocates)
        .innerJoin(cases, eq(caseAdvocates.caseId, cases.id))
        .leftJoin(courts, eq(cases.courtId, courts.id))
        .leftJoin(caseTypes, eq(cases.caseTypeId, caseTypes.id))
        .where(where)
        .orderBy(desc(cases.createdAt))
        .limit(pageSize)
        .offset(offset);

      const [{ total }] = await db
        .select({
          total: count(),
        })
        .from(caseAdvocates)
        .innerJoin(cases, eq(caseAdvocates.caseId, cases.id))
        .where(where);

      const totalCount = Number(total);

      return res.status(200).json({
        success: true,
        data,
        pagination: {
          page: pageNumber,
          limit: pageSize,
          total: totalCount,
          totalPages: Math.ceil(totalCount / pageSize),
        },
      });
    } catch (error) {
      next(error);
    }
  },
  async getAdvocatesForFrom(req: Request, res: Response, next: NextFunction) {
    try {
      const tenantId = req.user.tenantId;

      if (!tenantId) {
        return next(CustomErrorHandler.badRequest("Tenant ID is required"));
      }

      const page = Number(req.query.page) > 0 ? Number(req.query.page) : 1;

      const limit = Number(req.query.limit) > 0 ? Number(req.query.limit) : 10;

      const search = ((req.query.search as string) || "").trim();

      const offset = (page - 1) * limit;

      const conditions = [eq(userScopes.tenantId, tenantId)];

      // Search by name, email, or practice area
      if (search) {
        conditions.push(
          or(
            ilike(users.name, `%${search}%`),
            ilike(users.email, `%${search}%`),
            ilike(advocates.practiceArea, `%${search}%`),
          )!,
        );
      }

      const whereCondition = and(...conditions);

      // Get paginated advocates
      const data = await db
        .select({
          id: advocates.id,
          name: users.name,
          email: users.email,
          userId:advocates.userId,
          practiceArea: advocates.practiceArea,
          designation: advocates.designation,
        })
        .from(advocates)
        .innerJoin(users, eq(advocates.userId, users.id))
        .innerJoin(userScopes, eq(userScopes.userId, users.id))
        .where(whereCondition)
        .orderBy(users.name)
        .limit(limit)
        .offset(offset);

      // Get total count
      const [{ total }] = await db
        .select({
          total: count(),
        })
        .from(advocates)
        .innerJoin(users, eq(advocates.userId, users.id))
        .innerJoin(userScopes, eq(userScopes.userId, users.id))
        .where(whereCondition);

      const totalCount = Number(total);

      const totalPages = Math.ceil(totalCount / limit);

      return res.status(200).json({
        success: true,
        data,
        pagination: {
          page,
          limit,
          total: totalCount,
          totalPages,
          hasNextPage: page < totalPages,
          hasPreviousPage: page > 1,
        },
      });
    } catch (error) {
      next(error);
    }
  },
};
export default advocatesController;
