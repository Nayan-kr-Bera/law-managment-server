import { and, asc, count, desc, eq, ilike, isNull } from "drizzle-orm";
import { NextFunction, Request, Response } from "express";

import db from "../../db/index.js";
import {
  caseAdvocates,
  caseClients,
  cases,
  tasks,
  user,
  userScopeOffices,
  userScopes,
} from "../../db/schema/index.js";
import users from "../../db/schema/users.js";
import CustomErrorHandler from "../../utils/customErrorHandler.js";

const taskController = {
  async createTask(req: Request, res: Response, next: NextFunction) {
    try {
      const { caseId, assignedTo, title, dueDate, priority, status } = req.body;

      const tenantId = req.user.tenantId;
      const officeId = req.officeId;

      if (!tenantId) {
        return next(CustomErrorHandler.badRequest("Tenant context is missing"));
      }

      if (!officeId) {
        return next(CustomErrorHandler.badRequest("Office context is missing"));
      }

      if (caseId) {
        const [caseData] = await db
          .select({
            id: cases.id,
          })
          .from(cases)
          .where(
            and(
              eq(cases.id, caseId),
              eq(cases.tenantId, tenantId),
              eq(cases.officeId, officeId),
            ),
          )
          .limit(1);

        if (!caseData) {
          return next(CustomErrorHandler.notFound("Case not found"));
        }
      }

      let assignedUserId: string | null = null;

      if (assignedTo) {
        const [assignedUser] = await db
          .select({
            userId: users.id,
          })
          .from(users)
          .innerJoin(userScopes, eq(userScopes.userId, users.id))
          .innerJoin(
            userScopeOffices,
            eq(userScopeOffices.userScopeId, userScopes.id),
          )
          .where(
            and(
              eq(users.id, assignedTo),
              eq(userScopes.tenantId, tenantId),
              eq(userScopeOffices.officeId, officeId),
              isNull(users.deletedAt),
            ),
          )
          .limit(1);

        if (!assignedUser) {
          return next(
            CustomErrorHandler.notFound(
              "Assigned user is not available in this office",
            ),
          );
        }

        assignedUserId = assignedUser.userId;
      }

      const [task] = await db
        .insert(tasks)
        .values({
          tenantId,
          officeId,

          caseId: caseId ?? null,

          // users.id
          assignedTo: assignedUserId,

          title,

          dueDate: dueDate ?? null,

          priority: priority ?? "medium",

          status: status ?? "todo",
        })
        .returning();

      return res.status(201).json({
        success: true,
        message: "Task created successfully",
        data: task,
      });
    } catch (error) {
      console.error("createTask error:", error);

      return next(error);
    }
  },

  async getTasks(req: Request, res: Response, next: NextFunction) {
    try {
      const tenantId = req.user.tenantId;

      const {
        search,
        status,
        priority,
        caseId,
        assignedTo,
        page = "1",
        limit = "10",
      } = req.query;

      const currentPage = Math.max(Number(page) || 1, 1);

      const pageLimit = Math.min(Math.max(Number(limit) || 10, 1), 100);

      const offset = (currentPage - 1) * pageLimit;

      const conditions = [eq(tasks.tenantId, tenantId)];

      // Search
      if (search) {
        conditions.push(ilike(tasks.title, `%${String(search)}%`));
      }

      // Status
      if (status) {
        conditions.push(
          eq(
            tasks.status,
            String(status) as
              | "todo"
              | "in_progress"
              | "completed"
              | "cancelled",
          ),
        );
      }

      // Priority
      if (priority) {
        conditions.push(
          eq(
            tasks.priority,
            String(priority) as "low" | "medium" | "high" | "urgent",
          ),
        );
      }

      // Case
      if (caseId) {
        conditions.push(eq(tasks.caseId, String(caseId)));
      }

      // Assigned user
      if (assignedTo) {
        conditions.push(eq(tasks.assignedTo, String(assignedTo)));
      }

      const [totalResult] = await db
        .select({
          count: count(),
        })
        .from(tasks)
        .where(and(...conditions));

      const total = Number(totalResult?.count ?? 0);

      const totalPages = total === 0 ? 0 : Math.ceil(total / pageLimit);

      const taskList = await db
        .select({
          id: tasks.id,
          title: tasks.title,
          dueDate: tasks.dueDate,
          priority: tasks.priority,
          status: tasks.status,

          // Case
          caseId: tasks.caseId,
          caseTitle: cases.title,

          // Assigned User
          assignedTo: tasks.assignedTo,
          assignedUser: user.name,
        })
        .from(tasks)

        .leftJoin(
          cases,
          and(eq(tasks.caseId, cases.id), eq(cases.tenantId, tenantId)),
        )

        .leftJoin(user, eq(tasks.assignedTo, user.id))

        .where(and(...conditions))

        .orderBy(desc(tasks.dueDate))

        .limit(pageLimit)
        .offset(offset);

      const taskStats = await db
        .select({
          status: tasks.status,
          count: count(),
        })
        .from(tasks)
        .where(eq(tasks.tenantId, tenantId))
        .groupBy(tasks.status);

      const stats = {
        total: 0,
        todo: 0,
        inProgress: 0,
        completed: 0,
        cancelled: 0,
      };

      for (const row of taskStats) {
        const taskCount = Number(row.count);

        stats.total += taskCount;

        switch (row.status) {
          case "todo":
            stats.todo = taskCount;
            break;

          case "in_progress":
            stats.inProgress = taskCount;
            break;

          case "completed":
            stats.completed = taskCount;
            break;

          case "cancelled":
            stats.cancelled = taskCount;
            break;
        }
      }
      const data = await Promise.all(
        taskList.map(async (task) => {
          let clientName: string | null = null;

          let advocateName: string | null = null;

          if (task.caseId) {
            const clientData = await db.query.caseClients.findFirst({
              where: and(
                eq(caseClients.caseId, task.caseId),
                // eq(clients.tenantId, tenantId),
              ),

              columns: {
                clientId: true,
              },

              with: {
                client: {
                  columns: {
                    firstName: true,
                    lastName: true,
                    companyName: true,
                  },
                },
              },
            });

            if (clientData?.client) {
              const client = clientData.client;

              clientName =
                client.companyName ??
                [client.firstName, client.lastName].filter(Boolean).join(" ");
            }
          }

          if (task.caseId) {
            const advocateData = await db.query.caseAdvocates.findFirst({
              where: eq(caseAdvocates.caseId, task.caseId),

              columns: {
                advocateId: true,
              },

              with: {
                advocate: {
                  columns: {
                    userId: true,
                  },

                  with: {
                    user: {
                      columns: {
                        name: true,
                      },
                    },
                  },
                },
              },
            });

            advocateName = advocateData?.advocate?.user?.name ?? null;
          }

          return {
            ...task,
            clientName,
            advocateName,
          };
        }),
      );

      return res.status(200).json({
        success: true,
        message: "Tasks fetched successfully",

        data,
        stats,
        pagination: {
          page: currentPage,
          limit: pageLimit,
          total,
          totalPages,
          hasNextPage: currentPage < totalPages,
          hasPreviousPage: currentPage > 1,
        },
      });
    } catch (error) {
      next(error);
    }
  },

  async getTaskById(req: Request, res: Response, next: NextFunction) {
    try {
      const { taskId } = req.params;

      const tenantId = req.user.tenantId;

      const [task] = await db
        .select({
          id: tasks.id,
          title: tasks.title,
          dueDate: tasks.dueDate,
          priority: tasks.priority,
          status: tasks.status,

          caseId: tasks.caseId,
          caseTitle: cases.title,

          assignedTo: tasks.assignedTo,
          assignedUser: user.name,
        })
        .from(tasks)

        // Case relation
        .leftJoin(
          cases,
          and(eq(tasks.caseId, cases.id), eq(cases.tenantId, tenantId)),
        )

        // User relation
        .leftJoin(user, eq(tasks.assignedTo, user.id))

        .where(and(eq(tasks.id, taskId), eq(tasks.tenantId, tenantId)))
        .limit(1);

      if (!task) {
        return next(CustomErrorHandler.notFound("Task not found"));
      }

      return res.status(200).json({
        success: true,
        message: "Task fetched successfully",
        data: task,
      });
    } catch (error) {
      next(error);
    }
  },

  async updateTask(req: Request, res: Response, next: NextFunction) {
    try {
      const { taskId } = req.params;

      const { caseId, assignedTo, title, dueDate, priority, status } = req.body;

      const tenantId = req.user.tenantId;

      const [existingTask] = await db
        .select({
          id: tasks.id,
        })
        .from(tasks)
        .where(and(eq(tasks.id, taskId), eq(tasks.tenantId, tenantId)))
        .limit(1);

      if (!existingTask) {
        return next(CustomErrorHandler.notFound("Task not found"));
      }

      if (caseId !== undefined && caseId !== null) {
        const [caseData] = await db
          .select({
            id: cases.id,
          })
          .from(cases)
          .where(and(eq(cases.id, caseId), eq(cases.tenantId, tenantId)))
          .limit(1);

        if (!caseData) {
          return next(CustomErrorHandler.notFound("Case not found"));
        }
      }

      if (assignedTo !== undefined && assignedTo !== null) {
        const [userData] = await db
          .select({
            userId: userScopes.userId,
          })
          .from(userScopes)
          .where(
            and(
              eq(userScopes.userId, assignedTo),
              eq(userScopes.tenantId, tenantId),
            ),
          )
          .limit(1);

        if (!userData) {
          return next(
            CustomErrorHandler.notFound(
              "Assigned user not found in this tenant",
            ),
          );
        }
      }

      const [updatedTask] = await db
        .update(tasks)
        .set({
          ...(caseId !== undefined && {
            caseId,
          }),

          ...(assignedTo !== undefined && {
            assignedTo,
          }),

          ...(title !== undefined && {
            title,
          }),

          ...(dueDate !== undefined && {
            dueDate,
          }),

          ...(priority !== undefined && {
            priority,
          }),

          ...(status !== undefined && {
            status,
          }),
        })
        .where(and(eq(tasks.id, taskId), eq(tasks.tenantId, tenantId)))
        .returning();

      return res.status(200).json({
        success: true,
        message: "Task updated successfully",
        data: updatedTask,
      });
    } catch (error) {
      next(error);
    }
  },

  async deleteTask(req: Request, res: Response, next: NextFunction) {
    try {
      const { taskId } = req.params;

      const tenantId = req.user.tenantId;

      const [deletedTask] = await db
        .delete(tasks)
        .where(and(eq(tasks.id, taskId), eq(tasks.tenantId, tenantId)))
        .returning();

      if (!deletedTask) {
        return next(CustomErrorHandler.notFound("Task not found"));
      }

      return res.status(200).json({
        success: true,
        message: "Task deleted successfully",
        data: deletedTask,
      });
    } catch (error) {
      next(error);
    }
  },
  async getCalendarTasks(req: Request, res: Response, next: NextFunction) {
    try {
      const tenantId = req.user.tenantId;
      const officeId = req.officeId;
      const userId = req.user.userId;

      if (!tenantId) {
        return next(CustomErrorHandler.badRequest("Tenant context is missing"));
      }

      if (!officeId) {
        return next(CustomErrorHandler.badRequest("Office context is missing"));
      }

      if (!userId) {
        return next(CustomErrorHandler.badRequest("User context is missing"));
      }

      const { date } = req.query;

      if (!date || typeof date !== "string") {
        return next(
          CustomErrorHandler.badRequest(
            "Date is required. Expected format: YYYY-MM-DD",
          ),
        );
      }

      const dateRegex = /^\d{4}-\d{2}-\d{2}$/;

      if (!dateRegex.test(date)) {
        return next(
          CustomErrorHandler.badRequest(
            "Invalid date format. Expected YYYY-MM-DD",
          ),
        );
      }

      const taskData = await db.query.tasks.findMany({
        where: and(
          // Tenant isolation
          eq(tasks.tenantId, tenantId),

          // Office isolation
          eq(tasks.officeId, officeId),

          // Only logged-in user's tasks
          eq(tasks.assignedTo, userId),

          // Selected date
          eq(tasks.dueDate, date),
        ),

        columns: {
          id: true,
          caseId: true,
          assignedTo: true,
          title: true,
          dueDate: true,
          priority: true,
          status: true,
          createdAt: true,
        },

        // Related case
        with: {
          case: {
            columns: {
              id: true,
              caseNumber: true,
              title: true,
            },
          },
        },

        orderBy: [asc(tasks.createdAt)],
      });

      const calendarTasks = taskData.map((task) => ({
        id: task.id,

        title: task.title,

        priority: task.priority,

        status: task.status,

        date: task.dueDate,

        createdAt: task.createdAt,

        caseId: task.caseId,

        case: task.case
          ? {
              id: task.case.id,
              caseNumber: task.case.caseNumber,
              title: task.case.title,
            }
          : null,
      }));

      return res.status(200).json({
        success: true,

        data: {
          date,
          tasks: calendarTasks,
          total: calendarTasks.length,
        },
      });
    } catch (error) {
      console.error("getCalendarTasks error:", error);

      return next(CustomErrorHandler.serverError());
    }
  },
  async updateTaskStatus(req: Request, res: Response, next: NextFunction) {
    try {
      const { taskId } = req.params;
      const { status } = req.body;

      const tenantId = req.user.tenantId;
      const officeId = req.officeId;
      const userId = req.user.userId;

      if (!tenantId) {
        return next(CustomErrorHandler.badRequest("Tenant context is missing"));
      }

      if (!officeId) {
        return next(CustomErrorHandler.badRequest("Office context is missing"));
      }

      if (!taskId) {
        return next(CustomErrorHandler.badRequest("Task ID is required"));
      }

      const allowedStatuses = [
        "todo",
        "in_progress",
        "completed",
        "cancelled",
      ] as const;

      if (!status || !allowedStatuses.includes(status)) {
        return next(CustomErrorHandler.badRequest("Invalid task status"));
      }
      const [existingTask] = await db
        .select({
          id: tasks.id,
        })
        .from(tasks)
        .where(
          and(
            eq(tasks.id, taskId),
            eq(tasks.tenantId, tenantId),
            eq(tasks.officeId, officeId),
          ),
        )
        .limit(1);

      if (!existingTask) {
        return next(CustomErrorHandler.notFound("Task not found"));
      }

      const [updatedTask] = await db
        .update(tasks)
        .set({
          status,
          updatedBy: userId,
        })
        .where(
          and(
            eq(tasks.id, taskId),
            eq(tasks.tenantId, tenantId),
            eq(tasks.officeId, officeId),
          ),
        )
        .returning();

      return res.status(200).json({
        success: true,
        message: "Task status updated successfully",
        data: updatedTask,
      });
    } catch (error) {
      console.error("updateTaskStatus error:", error);

      return next(error);
    }
  },
};

export default taskController;
