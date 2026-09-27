import { and, eq } from "drizzle-orm";
import { NextFunction, Request, Response } from "express";

import db from "../../../db/index.js";
import {
  roles,
  user,
  userRoles,
  userScopes
} from "../../../db/schema/index.js";

import CustomErrorHandler from "../../../utils/customErrorHandler.js";
import ResponseHandler from "../../../utils/responseHandler.js";

const adminUserController = {
  // =========================================================================
  // GET ALL SYSTEM USERS
  // =========================================================================
  async getSystemUsers(req: Request, res: Response, next: NextFunction) {
    try {
      const { search, tenantId } = req.query as {
        search?: string;
        role?: string;
        tenantId?: string;
      };

      const usersList = await db.query.user.findMany({
        orderBy: (u, { desc }) => [desc(u.createdAt)],
      });

      const formattedUsers = await Promise.all(
        usersList.map(async (u) => {
          const scope = await db.query.userScopes.findFirst({
            where: and(
              eq(userScopes.userId, u.id),
              eq(userScopes.isDefault, true)
            ),
            with: {
              tenant: true,
            },
          });

          const assignedRoles = scope
            ? await db
              .select({
                slug: roles.slug,
                name: roles.name,
              })
              .from(userRoles)
              .innerJoin(roles, eq(userRoles.roleId, roles.id))
              .where(eq(userRoles.scopeId, scope.id))
            : [];

          const roleName = assignedRoles[0]?.name || assignedRoles[0]?.slug || "Advocate";
          const isSuperAdmin = assignedRoles.some((r) => r.slug === "super_admin");

          return {
            id: u.id,
            name: u.name,
            email: u.email,
            phone: u.phone || undefined,
            status: u.isEmailVerified ? "active" : "invited",
            roleName,
            isSuperAdmin,
            tenantName: scope?.tenant?.name || undefined,
            tenantId: scope?.tenantId || undefined,
            lastActiveAt: u.updatedAt ? new Date(u.updatedAt).toISOString() : undefined,
            createdAt: u.createdAt ? new Date(u.createdAt).toISOString() : new Date().toISOString(),
          };
        })
      );

      let filteredUsers = formattedUsers;
      if (search && search.trim() !== "") {
        const queryTerm = search.trim().toLowerCase();
        filteredUsers = filteredUsers.filter(
          (u) =>
            u.name.toLowerCase().includes(queryTerm) ||
            u.email.toLowerCase().includes(queryTerm)
        );
      }

      if (tenantId && tenantId.trim() !== "" && tenantId !== "all") {
        filteredUsers = filteredUsers.filter((u) => u.tenantId === tenantId);
      }

      return res.status(200).json(
        ResponseHandler(200, "System users fetched successfully", filteredUsers)
      );
    } catch (error) {
      console.error("Admin get users error:", error);
      return next(CustomErrorHandler.serverError());
    }
  },

  // =========================================================================
  // TOGGLE USER STATUS
  // =========================================================================
  async toggleUserStatus(req: Request, res: Response, next: NextFunction) {
    try {
      const { userId } = req.params;
      const { status } = req.body;

      const existingUser = await db.query.user.findFirst({
        where: eq(user.id, userId),
      });

      if (!existingUser) {
        return next(CustomErrorHandler.notFound("User not found"));
      }

      await db
        .update(user)
        .set({
          isEmailVerified: status === "active",
          updatedAt: new Date(),
        })
        .where(eq(user.id, userId));

      return res.status(200).json(
        ResponseHandler(200, `User status updated to ${status}`)
      );
    } catch (error) {
      console.error("Admin toggle user status error:", error);
      return next(CustomErrorHandler.serverError());
    }
  },
};

export default adminUserController;
