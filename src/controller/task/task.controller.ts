import { and, asc, count, desc, eq, ilike, inArray, isNull, or, sql, SQL } from "drizzle-orm";
import { NextFunction, Request, Response } from "express";

import db from "../../db/index.js";
import {
  caseAdvocates,
  caseClients,
  cases,
  courts,
  notifications,
  taskComments,
  taskTimelines,
  tasks,
  user,
  userScopeOffices,
  userScopes,
  userRoles,
  roles,
  rolePermissions,
  userPermissions,
  permissions,
} from "../../db/schema/index.js";
import users from "../../db/schema/users.js";
import CustomErrorHandler from "../../utils/customErrorHandler.js";
import { sendTaskAssignmentEmail } from "../../services/taskEmail.service.js";

/**
 * Helper to check if a user is an administrator or has specific permission
 */
async function checkUserAdminOrPermission(
  userId: string,
  tenantId: string,
  reqUser: { isSuperAdmin?: boolean; permissions?: string[] } | Record<string, unknown> | null | undefined,
  requiredPermission?: string
): Promise<boolean> {
  if (reqUser && "isSuperAdmin" in reqUser && reqUser.isSuperAdmin) return true;

  const userPerms: string[] = (reqUser && "permissions" in reqUser && Array.isArray(reqUser.permissions))
    ? (reqUser.permissions as string[])
    : [];
  if (requiredPermission && userPerms.includes(requiredPermission)) {
    return true;
  }

  // Check roles in DB
  const scope = await db.query.userScopes.findFirst({
    where: and(eq(userScopes.userId, userId), eq(userScopes.tenantId, tenantId)),
  });

  if (!scope) return false;

  const userRoleData = await db
    .select({ slug: roles.slug })
    .from(userRoles)
    .innerJoin(roles, eq(userRoles.roleId, roles.id))
    .where(eq(userRoles.scopeId, scope.id));

  const isAdminRole = userRoleData.some(
    (r) => r.slug === "super_admin" || r.slug === "tenant_admin" || r.slug === "admin"
  );

  if (isAdminRole) return true;

  // If not admin, check if required permission is directly assigned in userPermissions table
  if (requiredPermission) {
    const directPerm = await db
      .select({ code: permissions.code })
      .from(userPermissions)
      .innerJoin(permissions, eq(userPermissions.permissionId, permissions.id))
      .where(
        and(
          eq(userPermissions.scopeId, scope.id),
          eq(permissions.code, requiredPermission)
        )
      )
      .limit(1);

    if (directPerm.length > 0) return true;
  }

  return false;
}

const taskController = {
  // 1. Create Task & Notify Assignee
  async createTask(req: Request, res: Response, next: NextFunction) {
    try {
      const { caseId, assignedTo, title, description, dueDate, priority, status } = req.body;

      const tenantId = req.user.tenantId as string;
      const officeId = req.officeId as string;
      const creatorUserId = req.user.userId as string;

      if (!tenantId) {
        return next(CustomErrorHandler.badRequest("Tenant context is missing"));
      }

      if (!officeId) {
        return next(CustomErrorHandler.badRequest("Office context is missing"));
      }

      if (!title || typeof title !== "string" || !title.trim()) {
        return next(CustomErrorHandler.badRequest("Task title is required"));
      }

      let caseData: { id: string; title: string; caseNumber: string | null; courtName: string | null } | null = null;

      if (caseId) {
        const [c] = await db
          .select({
            id: cases.id,
            title: cases.title,
            caseNumber: cases.caseNumber,
            courtName: courts.name,
          })
          .from(cases)
          .leftJoin(courts, eq(cases.courtId, courts.id))
          .where(
            and(
              eq(cases.id, caseId),
              eq(cases.tenantId, tenantId),
              eq(cases.officeId, officeId)
            )
          )
          .limit(1);

        if (!c) {
          return next(CustomErrorHandler.notFound("Associated case not found"));
        }
        caseData = c;
      }

      let assignedUserRecord: { id: string; name: string; email: string } | null = null;

      if (assignedTo) {
        const [assignedUser] = await db
          .select({
            id: users.id,
            name: users.name,
            email: users.email,
          })
          .from(users)
          .innerJoin(userScopes, eq(userScopes.userId, users.id))
          .innerJoin(
            userScopeOffices,
            eq(userScopeOffices.userScopeId, userScopes.id)
          )
          .where(
            and(
              eq(users.id, assignedTo),
              eq(userScopes.tenantId, tenantId),
              eq(userScopeOffices.officeId, officeId),
              isNull(users.deletedAt)
            )
          )
          .limit(1);

        if (!assignedUser) {
          return next(
            CustomErrorHandler.notFound(
              "Assigned user is not available in this office"
            )
          );
        }

        assignedUserRecord = assignedUser;
      }

      // Fetch Creator Name
      const [creatorRecord] = await db
        .select({ id: users.id, name: users.name, email: users.email })
        .from(users)
        .where(eq(users.id, creatorUserId))
        .limit(1);

      const [task] = await db
        .insert(tasks)
        .values({
          tenantId,
          officeId,
          caseId: caseId || null,
          assignedTo: assignedUserRecord ? assignedUserRecord.id : null,
          title: title.trim(),
          description: description ? String(description).trim() : null,
          dueDate: dueDate || null,
          priority: priority || "medium",
          status: status || "todo",
          createdBy: creatorUserId,
          updatedBy: creatorUserId,
        })
        .returning();

      // Dispatch Notifications if assigned to someone else
      if (assignedUserRecord) {
        try {
          // In-App Notification
          await db.insert(notifications).values({
            tenantId,
            officeId,
            userId: assignedUserRecord.id,
            title: `New Task Assigned: ${title}`,
            body: `${creatorRecord?.name || "A chamber colleague"} assigned you a new task: "${title}". Due: ${dueDate || "Open"}`,
            type: "task",
            status: "pending",
          });
        } catch (notifErr) {
          console.error("Failed to create in-app notification:", notifErr);
        }

        // Email Notification
        sendTaskAssignmentEmail({
          recipientName: assignedUserRecord.name || "Advocate",
          recipientEmail: assignedUserRecord.email,
          taskTitle: title,
          assignedByName: creatorRecord?.name || "Chamber Administrator",
          dueDate,
          priority: priority || "medium",
          caseTitle: caseData?.title,
          caseNumber: caseData?.caseNumber,
          courtName: caseData?.courtName,
          isReassigned: false,
        }).catch((err) => console.error("Email send error:", err));
      }

      // Record Initial Timeline Event
      try {
        await db.insert(taskTimelines).values({
          tenantId,
          officeId,
          taskId: task.id,
          userId: creatorUserId,
          action: "created",
          toAssigneeId: assignedUserRecord ? assignedUserRecord.id : null,
          toStatus: status || "todo",
          title: "Task Inception & Assignment",
          description: assignedUserRecord
            ? `Task created by ${creatorRecord?.name || "Chamber user"} and assigned to ${assignedUserRecord.name}. Limitation: ${dueDate || "Open"}`
            : `Task created by ${creatorRecord?.name || "Chamber user"} as unassigned.`,
        });
      } catch (tlErr) {
        console.error("Failed to record task timeline on create:", tlErr);
      }

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

  // 2. Get Tasks with Dynamic Scope & Permissions
  async getTasks(req: Request, res: Response, next: NextFunction) {
    try {
      const tenantId = req.user.tenantId as string;
      const officeId = req.officeId as string;
      const userId = req.user.userId as string;

      if (!tenantId) {
        return next(CustomErrorHandler.badRequest("Tenant context is missing"));
      }

      if (!officeId) {
        return next(CustomErrorHandler.badRequest("Office context is missing"));
      }

      const {
        search,
        status,
        priority,
        caseId,
        assignedTo,
        scope = "all", // "all", "assigned_to_me", "created_by_me"
        page = "1",
        limit = "10",
      } = req.query;

      const currentPage = Math.max(Number(page) || 1, 1);
      const pageLimit = Math.min(Math.max(Number(limit) || 10, 1), 100);
      const offset = (currentPage - 1) * pageLimit;

      const canViewAllTasks = await checkUserAdminOrPermission(
        userId,
        tenantId,
        req.user,
        "task.read_all"
      );
      const isAdmin = canViewAllTasks;

      const conditions: (SQL | undefined)[] = [
        eq(tasks.tenantId, tenantId),
        eq(tasks.officeId, officeId),
      ];

      // Scope filtering
      if (scope === "assigned_to_me") {
        conditions.push(eq(tasks.assignedTo, userId));
      } else if (scope === "created_by_me") {
        conditions.push(eq(tasks.createdBy, userId));
      } else {
        // scope === "all" or default
        if (!canViewAllTasks) {
          // Regular user without task.read_all only sees tasks assigned to them or created by them
          conditions.push(
            or(eq(tasks.assignedTo, userId), eq(tasks.createdBy, userId))!
          );
        }
      }

      // Search
      if (search) {
        conditions.push(
          or(
            ilike(tasks.title, `%${String(search).trim()}%`),
            sql`exists (
              select 1 from cases
              where cases.id = ${tasks.caseId}
              and (cases.title ilike ${`%${String(search).trim()}%`} or cases.case_number ilike ${`%${String(search).trim()}%`})
            )`
          )!
        );
      }

      // Status
      if (status && status !== "all") {
        conditions.push(
          eq(
            tasks.status,
            String(status) as "todo" | "in_progress" | "completed" | "cancelled"
          )
        );
      }

      // Priority
      if (priority && priority !== "all") {
        conditions.push(
          eq(
            tasks.priority,
            String(priority) as "low" | "medium" | "high" | "urgent"
          )
        );
      }

      // Case
      if (caseId) {
        conditions.push(eq(tasks.caseId, String(caseId)));
      }

      // Explicit Assigned User filter
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

      // Fetch task records with joined Case, Assignee, and Creator info
      const taskList = await db
        .select({
          id: tasks.id,
          title: tasks.title,
          description: tasks.description,
          dueDate: tasks.dueDate,
          priority: tasks.priority,
          status: tasks.status,
          createdAt: tasks.createdAt,
          updatedAt: tasks.updatedAt,

          // Case
          caseId: tasks.caseId,
          caseTitle: cases.title,
          caseNumber: cases.caseNumber,

          // Assigned User
          assignedTo: tasks.assignedTo,
          assignedUserName: user.name,
          assignedUserEmail: user.email,

          // Creator User
          createdBy: tasks.createdBy,
        })
        .from(tasks)
        .leftJoin(
          cases,
          and(
            eq(tasks.caseId, cases.id),
            eq(cases.tenantId, tenantId),
            eq(cases.officeId, officeId)
          )
        )
        .leftJoin(user, eq(tasks.assignedTo, user.id))
        .where(and(...conditions))
        .orderBy(desc(tasks.createdAt))
        .limit(pageLimit)
        .offset(offset);

      // Stats query conditions based on scope & permissions
      const statsConditions: (SQL | undefined)[] = [
        eq(tasks.tenantId, tenantId),
        eq(tasks.officeId, officeId),
      ];

      if (scope === "assigned_to_me") {
        statsConditions.push(eq(tasks.assignedTo, userId));
      } else if (scope === "created_by_me") {
        statsConditions.push(eq(tasks.createdBy, userId));
      } else if (!canViewAllTasks) {
        statsConditions.push(
          or(eq(tasks.assignedTo, userId), eq(tasks.createdBy, userId))!
        );
      }

      const taskStats = await db
        .select({
          status: tasks.status,
          count: count(),
        })
        .from(tasks)
        .where(and(...statsConditions))
        .groupBy(tasks.status);

      const stats = {
        total: 0,
        todo: 0,
        inProgress: 0,
        completed: 0,
        cancelled: 0,
      };

      for (const row of taskStats) {
        const c = Number(row.count);
        stats.total += c;
        if (row.status === "todo") stats.todo = c;
        else if (row.status === "in_progress") stats.inProgress = c;
        else if (row.status === "completed") stats.completed = c;
        else if (row.status === "cancelled") stats.cancelled = c;
      }

      // Populate Client Name, Advocate Name, Creator Name, and Comments count
      const data = await Promise.all(
        taskList.map(async (task) => {
          let clientName: string | null = null;
          let advocateName: string | null = null;
          let creatorName: string | null = null;

          // Creator name
          if (task.createdBy) {
            const [cUser] = await db
              .select({ name: user.name })
              .from(user)
              .where(eq(user.id, task.createdBy))
              .limit(1);
            creatorName = cUser?.name || null;
          }

          // Case client & advocate info
          if (task.caseId) {
            const clientData = await db.query.caseClients.findFirst({
              where: eq(caseClients.caseId, task.caseId),
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
              const c = clientData.client;
              clientName =
                c.companyName ||
                [c.firstName, c.lastName].filter(Boolean).join(" ") ||
                null;
            }

            const advocateData = await db.query.caseAdvocates.findFirst({
              where: eq(caseAdvocates.caseId, task.caseId),
              with: {
                advocate: {
                  with: {
                    user: {
                      columns: { name: true },
                    },
                  },
                },
              },
            });

            advocateName = advocateData?.advocate?.user?.name ?? null;
          }

          // Comments count
          const [commentsRes] = await db
            .select({ count: count() })
            .from(taskComments)
            .where(eq(taskComments.taskId, task.id));

          const commentsCount = Number(commentsRes?.count ?? 0);

          // Permissions flags for frontend UI
          const canDelete = isAdmin || task.createdBy === userId;
          const canEdit = isAdmin || task.createdBy === userId;
          const canChangeStatus =
            isAdmin || task.createdBy === userId || task.assignedTo === userId;

          return {
            id: task.id,
            title: task.title,
            description: task.description,
            dueDate: task.dueDate,
            priority: task.priority,
            status: task.status,
            createdAt: task.createdAt,
            updatedAt: task.updatedAt,
            caseId: task.caseId,
            caseTitle: task.caseTitle,
            caseNumber: task.caseNumber,
            assignedTo: task.assignedTo,
            assignedUser: task.assignedUserName,
            assignedUserEmail: task.assignedUserEmail,
            createdBy: task.createdBy,
            creatorName,
            clientName,
            advocateName,
            commentsCount,
            canDelete,
            canEdit,
            canChangeStatus,
          };
        })
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
      console.error("getTasks error:", error);
      return next(error);
    }
  },

  // 3. Get Task By ID with full notes/comments & permissions
  async getTaskById(req: Request, res: Response, next: NextFunction) {
    try {
      const { taskId } = req.params;
      const tenantId = req.user.tenantId as string;
      const officeId = req.officeId as string;
      const userId = req.user.userId as string;

      if (!tenantId || !officeId || !taskId) {
        return next(CustomErrorHandler.badRequest("Context is missing"));
      }

      const [task] = await db
        .select({
          id: tasks.id,
          title: tasks.title,
          description: tasks.description,
          dueDate: tasks.dueDate,
          priority: tasks.priority,
          status: tasks.status,
          createdAt: tasks.createdAt,
          updatedAt: tasks.updatedAt,

          caseId: tasks.caseId,
          caseTitle: cases.title,
          caseNumber: cases.caseNumber,
          courtName: courts.name,

          assignedTo: tasks.assignedTo,
          assignedUserName: user.name,
          assignedUserEmail: user.email,

          createdBy: tasks.createdBy,
        })
        .from(tasks)
        .leftJoin(
          cases,
          and(
            eq(tasks.caseId, cases.id),
            eq(cases.tenantId, tenantId),
            eq(cases.officeId, officeId)
          )
        )
        .leftJoin(courts, eq(cases.courtId, courts.id))
        .leftJoin(user, eq(tasks.assignedTo, user.id))
        .where(
          and(
            eq(tasks.id, taskId),
            eq(tasks.tenantId, tenantId),
            eq(tasks.officeId, officeId)
          )
        )
        .limit(1);

      if (!task) {
        return next(CustomErrorHandler.notFound("Task not found"));
      }

      // Creator Name
      let creatorName: string | null = null;
      if (task.createdBy) {
        const [cUser] = await db
          .select({ name: user.name })
          .from(user)
          .where(eq(user.id, task.createdBy))
          .limit(1);
        creatorName = cUser?.name || null;
      }

      // Fetch task comments / notes history
      const comments = await db
        .select({
          id: taskComments.id,
          comment: taskComments.comment,
          createdAt: taskComments.createdAt,
          userId: taskComments.userId,
          userName: user.name,
          userEmail: user.email,
        })
        .from(taskComments)
        .leftJoin(user, eq(taskComments.userId, user.id))
        .where(eq(taskComments.taskId, task.id))
        .orderBy(asc(taskComments.createdAt));

      const isAdmin = await checkUserAdminOrPermission(
        userId,
        tenantId,
        req.user,
        "task.read"
      );

      const canDelete = isAdmin || task.createdBy === userId;
      const canEdit = isAdmin || task.createdBy === userId;
      const canChangeStatus =
        isAdmin || task.createdBy === userId || task.assignedTo === userId;

      return res.status(200).json({
        success: true,
        message: "Task fetched successfully",
        data: {
          ...task,
          creatorName,
          comments,
          canDelete,
          canEdit,
          canChangeStatus,
        },
      });
    } catch (error) {
      console.error("getTaskById error:", error);
      return next(error);
    }
  },

  // 4. Update Task & Reassignment Handling
  async updateTask(req: Request, res: Response, next: NextFunction) {
    try {
      const { taskId } = req.params;
      const { caseId, assignedTo, title, description, dueDate, priority, status } = req.body;

      const tenantId = req.user.tenantId as string;
      const officeId = req.officeId as string;
      const userId = req.user.userId as string;

      if (!tenantId || !officeId || !taskId) {
        return next(CustomErrorHandler.badRequest("Context is missing"));
      }

      const [existingTask] = await db
        .select({
          id: tasks.id,
          assignedTo: tasks.assignedTo,
          createdBy: tasks.createdBy,
          title: tasks.title,
          dueDate: tasks.dueDate,
          priority: tasks.priority,
          status: tasks.status,
          caseId: tasks.caseId,
        })
        .from(tasks)
        .where(
          and(
            eq(tasks.id, taskId),
            eq(tasks.tenantId, tenantId),
            eq(tasks.officeId, officeId)
          )
        )
        .limit(1);

      if (!existingTask) {
        return next(CustomErrorHandler.notFound("Task not found"));
      }

      const isAdmin = await checkUserAdminOrPermission(
        userId,
        tenantId,
        req.user,
        "task.update"
      );

      const isCreator = existingTask.createdBy === userId;
      const isAssignee = existingTask.assignedTo === userId;

      // If user is only assignee (not creator and not admin), they cannot change title, dueDate, or reassign
      const isTryingToEditRestricted =
        title !== undefined ||
        dueDate !== undefined ||
        priority !== undefined ||
        caseId !== undefined ||
        assignedTo !== undefined;

      if (isTryingToEditRestricted && !isCreator && !isAdmin) {
        return next(
          CustomErrorHandler.forbidden(
            "Only the task creator or chamber administrator can edit or reassign this task."
          )
        );
      }

      // Check if reassigning to a new user
      let isReassigned = false;
      let newAssigneeRecord: { id: string; name: string; email: string } | null = null;

      if (assignedTo !== undefined && assignedTo !== null && assignedTo !== existingTask.assignedTo) {
        const [targetUser] = await db
          .select({ id: users.id, name: users.name, email: users.email })
          .from(users)
          .innerJoin(userScopes, eq(userScopes.userId, users.id))
          .innerJoin(
            userScopeOffices,
            eq(userScopeOffices.userScopeId, userScopes.id)
          )
          .where(
            and(
              eq(users.id, assignedTo),
              eq(userScopes.tenantId, tenantId),
              eq(userScopeOffices.officeId, officeId),
              isNull(users.deletedAt)
            )
          )
          .limit(1);

        if (!targetUser) {
          return next(
            CustomErrorHandler.notFound(
              "Reassigned user is not available in this office"
            )
          );
        }

        isReassigned = true;
        newAssigneeRecord = targetUser;
      }

      const [updatedTask] = await db
        .update(tasks)
        .set({
          ...(caseId !== undefined && { caseId: caseId || null }),
          ...(assignedTo !== undefined && { assignedTo: assignedTo || null }),
          ...(title !== undefined && { title: title.trim() }),
          ...(description !== undefined && { description: description ? String(description).trim() : null }),
          ...(dueDate !== undefined && { dueDate: dueDate || null }),
          ...(priority !== undefined && { priority }),
          ...(status !== undefined && { status }),
          updatedBy: userId,
          updatedAt: new Date(),
        })
        .where(
          and(
            eq(tasks.id, taskId),
            eq(tasks.tenantId, tenantId),
            eq(tasks.officeId, officeId)
          )
        )
        .returning();

      // If reassigned, notify the new assignee
      if (isReassigned && newAssigneeRecord) {
        const [updaterUser] = await db
          .select({ name: users.name })
          .from(users)
          .where(eq(users.id, userId))
          .limit(1);

        let caseDetails: { title: string; caseNumber: string | null; courtName: string | null } | null = null;
        if (updatedTask.caseId) {
          const [c] = await db
            .select({
              title: cases.title,
              caseNumber: cases.caseNumber,
              courtName: courts.name,
            })
            .from(cases)
            .leftJoin(courts, eq(cases.courtId, courts.id))
            .where(eq(cases.id, updatedTask.caseId))
            .limit(1);
          if (c) caseDetails = c;
        }

        try {
          await db.insert(notifications).values({
            tenantId,
            officeId,
            userId: newAssigneeRecord.id,
            title: `Task Reassigned: ${updatedTask.title}`,
            body: `${updaterUser?.name || "Chamber Administrator"} has reassigned the task "${updatedTask.title}" to your desk. Due: ${updatedTask.dueDate || "Open"}`,
            type: "task",
            status: "pending",
          });
        } catch (notifErr) {
          console.error("Failed to create in-app notification on reassignment:", notifErr);
        }

        sendTaskAssignmentEmail({
          recipientName: newAssigneeRecord.name || "Advocate",
          recipientEmail: newAssigneeRecord.email,
          taskTitle: updatedTask.title,
          assignedByName: updaterUser?.name || "Chamber Administrator",
          dueDate: updatedTask.dueDate,
          priority: updatedTask.priority,
          caseTitle: caseDetails?.title,
          caseNumber: caseDetails?.caseNumber,
          courtName: caseDetails?.courtName,
          isReassigned: true,
        }).catch((err) => console.error("Email send error on reassignment:", err));
      }

      // Record Timeline Events
      try {
        if (isReassigned) {
          await db.insert(taskTimelines).values({
            tenantId,
            officeId,
            taskId: updatedTask.id,
            userId,
            action: "reassigned",
            fromAssigneeId: existingTask.assignedTo,
            toAssigneeId: updatedTask.assignedTo,
            title: "Task Reassigned",
            description: `Reassigned from previous advocate to ${newAssigneeRecord?.name || "Advocate"}.`,
          });
        }
        if (status !== undefined && status !== existingTask.status) {
          await db.insert(taskTimelines).values({
            tenantId,
            officeId,
            taskId: updatedTask.id,
            userId,
            action: "status_changed",
            fromStatus: existingTask.status,
            toStatus: status,
            title: `Status Changed to ${String(status).replace("_", " ")}`,
            description: `Status changed from ${existingTask.status.replace("_", " ")} to ${String(status).replace("_", " ")}.`,
          });
        }
        if (dueDate !== undefined && dueDate !== existingTask.dueDate) {
          await db.insert(taskTimelines).values({
            tenantId,
            officeId,
            taskId: updatedTask.id,
            userId,
            action: "due_date_changed",
            title: "Limitation Date Updated",
            description: `Limitation deadline updated to ${dueDate || "Open"}.`,
          });
        }
      } catch (tlErr) {
        console.error("Failed to record timeline event in updateTask:", tlErr);
      }

      return res.status(200).json({
        success: true,
        message: "Task updated successfully",
        data: updatedTask,
      });
    } catch (error) {
      console.error("updateTask error:", error);
      return next(error);
    }
  },

  // 5. Update Task Status (Permitted for Assignee, Creator, and Admins)
  async updateTaskStatus(req: Request, res: Response, next: NextFunction) {
    try {
      const { taskId } = req.params;
      const { status } = req.body;

      const tenantId = req.user.tenantId as string;
      const officeId = req.officeId as string;
      const userId = req.user.userId as string;

      if (!tenantId || !officeId || !taskId) {
        return next(CustomErrorHandler.badRequest("Missing required context"));
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
          assignedTo: tasks.assignedTo,
          createdBy: tasks.createdBy,
          title: tasks.title,
          status: tasks.status,
        })
        .from(tasks)
        .where(
          and(
            eq(tasks.id, taskId),
            eq(tasks.tenantId, tenantId),
            eq(tasks.officeId, officeId)
          )
        )
        .limit(1);

      if (!existingTask) {
        return next(CustomErrorHandler.notFound("Task not found"));
      }

      const isAdmin = await checkUserAdminOrPermission(
        userId,
        tenantId,
        req.user,
        "task.update"
      );

      const isAssignee = existingTask.assignedTo === userId;
      const isCreator = existingTask.createdBy === userId;

      if (!isAdmin && !isAssignee && !isCreator) {
        return next(
          CustomErrorHandler.forbidden(
            "You do not have permission to update the status of this task."
          )
        );
      }

      const [updatedTask] = await db
        .update(tasks)
        .set({
          status,
          updatedBy: userId,
          updatedAt: new Date(),
        })
        .where(
          and(
            eq(tasks.id, taskId),
            eq(tasks.tenantId, tenantId),
            eq(tasks.officeId, officeId)
          )
        )
        .returning();

      // Record Timeline Event
      try {
        await db.insert(taskTimelines).values({
          tenantId,
          officeId,
          taskId: updatedTask.id,
          userId,
          action: "status_changed",
          fromStatus: existingTask.status || "todo",
          toStatus: status,
          title: `Status Changed to ${String(status).replace("_", " ")}`,
          description: `Status changed from ${String(existingTask.status || "todo").replace("_", " ")} to ${String(status).replace("_", " ")}.`,
        });
      } catch (tlErr) {
        console.error("Failed to record timeline event in updateTaskStatus:", tlErr);
      }

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

  // 6. Delete Task (Strict: Only Creator or Admin)
  async deleteTask(req: Request, res: Response, next: NextFunction) {
    try {
      const { taskId } = req.params;
      const tenantId = req.user.tenantId;
      const officeId = req.officeId;
      const userId = req.user.userId;

      if (!tenantId || !officeId || !taskId) {
        return next(CustomErrorHandler.badRequest("Missing required context"));
      }

      const [existingTask] = await db
        .select({
          id: tasks.id,
          createdBy: tasks.createdBy,
          title: tasks.title,
        })
        .from(tasks)
        .where(
          and(
            eq(tasks.id, taskId),
            eq(tasks.tenantId, tenantId),
            eq(tasks.officeId, officeId)
          )
        )
        .limit(1);

      if (!existingTask) {
        return next(CustomErrorHandler.notFound("Task not found"));
      }

      const isAdmin = await checkUserAdminOrPermission(
        userId,
        tenantId,
        req.user,
        "task.delete"
      );

      const isCreator = existingTask.createdBy === userId;

      if (!isAdmin && !isCreator) {
        return next(
          CustomErrorHandler.forbidden(
            "Only the task creator or chamber administrator can delete this task."
          )
        );
      }

      // Delete associated comments first
      await db.delete(taskComments).where(eq(taskComments.taskId, taskId));

      const [deletedTask] = await db
        .delete(tasks)
        .where(
          and(
            eq(tasks.id, taskId),
            eq(tasks.tenantId, tenantId),
            eq(tasks.officeId, officeId)
          )
        )
        .returning();

      return res.status(200).json({
        success: true,
        message: "Task deleted successfully",
        data: deletedTask,
      });
    } catch (error) {
      console.error("deleteTask error:", error);
      return next(error);
    }
  },

  // 7. Calendar Tasks
  async getCalendarTasks(req: Request, res: Response, next: NextFunction) {
    try {
      const tenantId = req.user.tenantId as string;
      const officeId = req.officeId as string;
      const userId = req.user.userId as string;

      if (!tenantId || !officeId || !userId) {
        return next(CustomErrorHandler.badRequest("Context is missing"));
      }

      const { date } = req.query;

      if (!date || typeof date !== "string") {
        return next(
          CustomErrorHandler.badRequest(
            "Date is required. Expected format: YYYY-MM-DD"
          )
        );
      }

      const taskData = await db.query.tasks.findMany({
        where: and(
          eq(tasks.tenantId, tenantId),
          eq(tasks.officeId, officeId),
          eq(tasks.assignedTo, userId),
          eq(tasks.dueDate, date)
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

      const calendarTasks = taskData.map((t) => ({
        id: t.id,
        title: t.title,
        priority: t.priority,
        status: t.status,
        date: t.dueDate,
        createdAt: t.createdAt,
        caseId: t.caseId,
        case: t.case
          ? {
              id: t.case.id,
              caseNumber: t.case.caseNumber,
              title: t.case.title,
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
      next(error);
    }
  },

  // 8. Get Specific Task Timeline (Auditing & History)
  async getTaskTimeline(req: Request, res: Response, next: NextFunction) {
    try {
      const { taskId } = req.params;
      const tenantId = req.user.tenantId as string;
      const officeId = req.officeId as string;
      const userId = req.user.userId as string;

      if (!tenantId || !officeId || !taskId) {
        return next(CustomErrorHandler.badRequest("Context is missing"));
      }

      // Permission check: Only Tenant Admin, Super Admin, or users granted task.timeline can view
      const hasTimelinePermission = await checkUserAdminOrPermission(
        userId,
        tenantId,
        req.user,
        "task.timeline"
      );

      if (!hasTimelinePermission) {
        return next(
          CustomErrorHandler.forbidden(
            "Access denied: You do not have permission to view task timeline and performance history."
          )
        );
      }

      const timelineRecords = await db
        .select({
          id: taskTimelines.id,
          taskId: taskTimelines.taskId,
          action: taskTimelines.action,
          title: taskTimelines.title,
          description: taskTimelines.description,
          fromStatus: taskTimelines.fromStatus,
          toStatus: taskTimelines.toStatus,
          createdAt: taskTimelines.createdAt,

          // Performer
          performerId: taskTimelines.userId,
          performerName: user.name,
          performerEmail: user.email,
        })
        .from(taskTimelines)
        .leftJoin(user, eq(taskTimelines.userId, user.id))
        .where(
          and(
            eq(taskTimelines.taskId, taskId),
            eq(taskTimelines.tenantId, tenantId),
            eq(taskTimelines.officeId, officeId)
          )
        )
        .orderBy(desc(taskTimelines.createdAt));

      // Resolve fromAssignee & toAssignee names if any
      const items = await Promise.all(
        timelineRecords.map(async (tl) => {
          let fromAssigneeName: string | null = null;
          let toAssigneeName: string | null = null;

          if (tl.action === "reassigned" || tl.action === "created") {
            const rawTl = await db.query.taskTimelines.findFirst({
              where: eq(taskTimelines.id, tl.id),
              columns: { fromAssigneeId: true, toAssigneeId: true },
            });
            if (rawTl?.fromAssigneeId) {
              const [u] = await db
                .select({ name: user.name })
                .from(user)
                .where(eq(user.id, rawTl.fromAssigneeId))
                .limit(1);
              fromAssigneeName = u?.name || null;
            }
            if (rawTl?.toAssigneeId) {
              const [u] = await db
                .select({ name: user.name })
                .from(user)
                .where(eq(user.id, rawTl.toAssigneeId))
                .limit(1);
              toAssigneeName = u?.name || null;
            }
          }

          return {
            ...tl,
            fromAssigneeName,
            toAssigneeName,
          };
        })
      );

      return res.status(200).json({
        success: true,
        message: "Task timeline fetched successfully",
        data: items,
      });
    } catch (error) {
      console.error("getTaskTimeline error:", error);
      return next(error);
    }
  },

  // 9. Get Chamber-Wide Task Timeline & Performance Tracking (Admin or task.timeline permission)
  async getChamberTaskTimeline(req: Request, res: Response, next: NextFunction) {
    try {
      const tenantId = req.user.tenantId as string;
      const officeId = req.officeId as string;
      const userId = req.user.userId as string;

      if (!tenantId || !officeId) {
        return next(CustomErrorHandler.badRequest("Context is missing"));
      }

      const hasTimelinePermission = await checkUserAdminOrPermission(
        userId,
        tenantId,
        req.user,
        "task.timeline"
      );

      if (!hasTimelinePermission) {
        return next(
          CustomErrorHandler.forbidden(
            "Access denied: You do not have permission to view the chamber task timeline and performance tracking."
          )
        );
      }

      const { page = 1, limit = 20, action, advocateId, search } = req.query;
      const currentPage = Math.max(Number(page) || 1, 1);
      const pageLimit = Math.min(Math.max(Number(limit) || 20, 1), 100);
      const offset = (currentPage - 1) * pageLimit;

      const conditions: (SQL | undefined)[] = [
        eq(taskTimelines.tenantId, tenantId),
        eq(taskTimelines.officeId, officeId),
      ];

      if (action && action !== "all") {
        conditions.push(eq(taskTimelines.action, String(action)));
      }

      if (advocateId && advocateId !== "all") {
        conditions.push(
          or(
            eq(taskTimelines.userId, String(advocateId)),
            eq(taskTimelines.toAssigneeId, String(advocateId)),
            eq(taskTimelines.fromAssigneeId, String(advocateId))
          )!
        );
      }

      if (search) {
        conditions.push(
          or(
            ilike(taskTimelines.title, `%${String(search).trim()}%`),
            ilike(taskTimelines.description, `%${String(search).trim()}%`),
            sql`exists (
              select 1 from tasks
              where tasks.id = ${taskTimelines.taskId}
              and tasks.title ilike ${`%${String(search).trim()}%`}
            )`
          )!
        );
      }

      const [totalRes] = await db
        .select({ value: count() })
        .from(taskTimelines)
        .where(and(...conditions));

      const totalItems = totalRes?.value ?? 0;
      const totalPages = Math.ceil(totalItems / pageLimit) || 1;

      const records = await db
        .select({
          id: taskTimelines.id,
          taskId: taskTimelines.taskId,
          taskTitle: tasks.title,
          taskDueDate: tasks.dueDate,
          taskPriority: tasks.priority,
          taskStatus: tasks.status,
          caseId: tasks.caseId,
          caseTitle: cases.title,
          caseNumber: cases.caseNumber,

          action: taskTimelines.action,
          title: taskTimelines.title,
          description: taskTimelines.description,
          fromStatus: taskTimelines.fromStatus,
          toStatus: taskTimelines.toStatus,
          createdAt: taskTimelines.createdAt,

          performerId: taskTimelines.userId,
          performerName: user.name,
          performerEmail: user.email,
          fromAssigneeId: taskTimelines.fromAssigneeId,
          toAssigneeId: taskTimelines.toAssigneeId,
        })
        .from(taskTimelines)
        .leftJoin(tasks, eq(taskTimelines.taskId, tasks.id))
        .leftJoin(cases, eq(tasks.caseId, cases.id))
        .leftJoin(user, eq(taskTimelines.userId, user.id))
        .where(and(...conditions))
        .orderBy(desc(taskTimelines.createdAt))
        .limit(pageLimit)
        .offset(offset);

      // Resolve fromAssignee & toAssignee names
      const timelineFeed = await Promise.all(
        records.map(async (r) => {
          let fromAssigneeName: string | null = null;
          let toAssigneeName: string | null = null;

          if (r.fromAssigneeId) {
            const [u] = await db
              .select({ name: user.name })
              .from(user)
              .where(eq(user.id, r.fromAssigneeId))
              .limit(1);
            fromAssigneeName = u?.name || null;
          }
          if (r.toAssigneeId) {
            const [u] = await db
              .select({ name: user.name })
              .from(user)
              .where(eq(user.id, r.toAssigneeId))
              .limit(1);
            toAssigneeName = u?.name || null;
          }

          return {
            ...r,
            fromAssigneeName,
            toAssigneeName,
          };
        })
      );

      // Calculate Chamber Performance Tracking Metrics
      const [reassignedCountRes] = await db
        .select({ value: count() })
        .from(taskTimelines)
        .where(
          and(
            eq(taskTimelines.tenantId, tenantId),
            eq(taskTimelines.officeId, officeId),
            eq(taskTimelines.action, "reassigned")
          )
        );

      const [statusChangedCountRes] = await db
        .select({ value: count() })
        .from(taskTimelines)
        .where(
          and(
            eq(taskTimelines.tenantId, tenantId),
            eq(taskTimelines.officeId, officeId),
            eq(taskTimelines.action, "status_changed")
          )
        );

      const performanceMetrics = {
        totalActivityEvents: totalItems,
        totalReassignments: reassignedCountRes?.value ?? 0,
        totalStatusTransitions: statusChangedCountRes?.value ?? 0,
      };

      return res.status(200).json({
        success: true,
        message: "Chamber task timeline fetched successfully",
        data: timelineFeed,
        metrics: performanceMetrics,
        pagination: {
          page: currentPage,
          limit: pageLimit,
          total: totalItems,
          totalPages,
          hasNextPage: currentPage < totalPages,
          hasPreviousPage: currentPage > 1,
        },
      });
    } catch (error) {
      console.error("getChamberTaskTimeline error:", error);
      return next(error);
    }
  },
};

export default taskController;
