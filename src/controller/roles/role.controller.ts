import { and, count, eq, inArray, or } from "drizzle-orm";
import { NextFunction, Request, Response } from "express";

import db from "../../db/index.js";

import {
  permissions,
  rolePermissions,
  roles,
  userRoles,
  userScopes,
} from "../../db/schema/index.js";

import ResponseHandler from "../../utils/responseHandler.js";
import CustomErrorHandler from "../../utils/customErrorHandler.js";

const UUID_REGEX =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

const roleController = {
  async getRoles(req: Request, res: Response, next: NextFunction) {
    try {
      const tenantId = req.user?.tenantId;

      if (!tenantId) {
        return next(CustomErrorHandler.badRequest("Tenant id is required"));
      }

      const roledata = await db.query.roles.findMany({
        where: or(
          eq(roles.tenantId, tenantId),
          and(eq(roles.isSystemRole, true), eq(roles.slug, "tenant_admin")),
        ),
        columns: {
          id: true,
          name: true,
          slug: true,
          description: true,
          createdAt: true,
          isSystemRole: true,
        },
      });

      const roleIds = roledata.map((r) => r.id);
      if (roleIds.length === 0) {
        return res
          .status(200)
          .send(ResponseHandler(200, "Roles fetched successfully", []));
      }

      const userCounts = await db
        .select({
          roleId: userRoles.roleId,
          count: count(),
        })
        .from(userRoles)
        .innerJoin(userScopes, eq(userRoles.scopeId, userScopes.id))
        .where(
          and(
            inArray(userRoles.roleId, roleIds),
            eq(userScopes.tenantId, tenantId),
          ),
        )
        .groupBy(userRoles.roleId);

      const permissionCounts = await db
        .select({
          roleId: rolePermissions.roleId,
          count: count(),
        })
        .from(rolePermissions)
        .where(inArray(rolePermissions.roleId, roleIds))
        .groupBy(rolePermissions.roleId);

      const userMap = new Map(
        userCounts.map((r) => [r.roleId, Number(r.count)]),
      );

      const permissionMap = new Map(
        permissionCounts.map((r) => [r.roleId, Number(r.count)]),
      );

      const data = roledata.map((role) => ({
        ...role,
        usersCount: userMap.get(role.id) ?? 0,
        permissionsCount: permissionMap.get(role.id) ?? 0,
      }));

      return res
        .status(200)
        .send(ResponseHandler(200, "Roles fetched successfully", data));
    } catch (error) {
      console.error("Error in getRoles:", error);
      return next(CustomErrorHandler.serverError());
    }
  },

  async getRoleById(req: Request, res: Response, next: NextFunction) {
    try {
      const { id } = req.params;

      if (!id || !UUID_REGEX.test(id)) {
        return next(CustomErrorHandler.badRequest("Valid role id is required"));
      }

      const role = await db.query.roles.findFirst({
        where: eq(roles.id, id),
      });

      if (!role) {
        return next(CustomErrorHandler.notFound("Role not found"));
      }

      const allPermissions = await db.query.permissions.findMany({
        where: eq(permissions.isAdminPortal, false),
        orderBy: (permissions, { asc }) => [asc(permissions.code)],
      });

      const assignedPermissions = await db.query.rolePermissions.findMany({
        where: eq(rolePermissions.roleId, id),
        columns: {
          permissionId: true,
        },
      });

      const assignedPermissionIds = new Set(
        assignedPermissions.map((item) => item.permissionId),
      );

      const permissionsData = allPermissions.map((permission) => ({
        id: permission.id,
        code: permission.code,
        description: permission.description,
        selected: assignedPermissionIds.has(permission.id),
      }));

      return res.status(200).send(
        ResponseHandler(200, "Role fetched successfully", {
          id: role.id,
          name: role.name,
          slug: role.slug,
          description: role.description,
          isSystemRole: role.isSystemRole,
          createdAt: role.createdAt,
          permissions: permissionsData,
        }),
      );
    } catch (error) {
      console.error("Error in getRoleById:", error);
      return next(CustomErrorHandler.serverError());
    }
  },

  async createRole(req: Request, res: Response, next: NextFunction) {
    try {
      const {
        name,
        description,
        permissions: permissionCodes,
      } = req.body;
      const tenantId = req.user?.tenantId;
      const userId = req.user?.userId;

      if (!tenantId) {
        return next(CustomErrorHandler.badRequest("Tenant id is required"));
      }

      if (!name || !name.trim()) {
        return next(CustomErrorHandler.badRequest("Role name is required"));
      }

      if (!Array.isArray(permissionCodes)) {
        return next(
          CustomErrorHandler.badRequest("Permissions must be an array"),
        );
      }

      const trimmedName = name.trim();
      const slug = trimmedName.toLowerCase().replace(/\s+/g, "_");

      const existingRole = await db.query.roles.findFirst({
        where: and(
          eq(roles.name, trimmedName),
          or(eq(roles.tenantId, tenantId), eq(roles.isSystemRole, true)),
        ),
      });

      if (existingRole) {
        return next(CustomErrorHandler.badRequest("Role name already exists in this chamber"));
      }

      const existingSlug = await db.query.roles.findFirst({
        where: and(
          eq(roles.slug, slug),
          or(eq(roles.tenantId, tenantId), eq(roles.isSystemRole, true)),
        ),
      });

      if (existingSlug) {
        return next(CustomErrorHandler.badRequest("Role slug already exists in this chamber"));
      }

      let createdRole;
      await db.transaction(async (tx) => {
        const [role] = await tx
          .insert(roles)
          .values({
            name: trimmedName,
            slug,
            tenantId,
            description: description?.trim() || null,
            isSystemRole: false,
            createdBy: userId || null,
          })
          .returning();

        createdRole = role;

        if (permissionCodes.length > 0) {
          const permissionRows = await tx
            .select({
              id: permissions.id,
              code: permissions.code,
            })
            .from(permissions)
            .where(inArray(permissions.code, permissionCodes));

          if (permissionRows.length > 0) {
            await tx.insert(rolePermissions).values(
              permissionRows.map((permission) => ({
                roleId: role.id,
                permissionId: permission.id,
              })),
            );
          }
        }
      });

      return res
        .status(201)
        .send(ResponseHandler(201, "Role created successfully", createdRole));
    } catch (error) {
      console.error("Error in createRole:", error);
      return next(CustomErrorHandler.serverError());
    }
  },

  async updateRole(req: Request, res: Response, next: NextFunction) {
    try {
      const { id } = req.params;
      const { name, description, permissions: permissionCodes } = req.body;
      const tenantId = req.user?.tenantId;

      if (!id || !UUID_REGEX.test(id)) {
        return next(CustomErrorHandler.badRequest("Valid role id is required"));
      }

      if (!name || !name.trim()) {
        return next(CustomErrorHandler.badRequest("Role name is required"));
      }

      if (!Array.isArray(permissionCodes)) {
        return next(
          CustomErrorHandler.badRequest("Permissions must be an array"),
        );
      }

      const role = await db.query.roles.findFirst({
        where: eq(roles.id, id),
      });

      if (!role) {
        return next(CustomErrorHandler.notFound("Role not found"));
      }

      if (role.isSystemRole) {
        return next(
          CustomErrorHandler.badRequest("System roles cannot be modified"),
        );
      }

      if (tenantId && role.tenantId && role.tenantId !== tenantId) {
        return next(
          CustomErrorHandler.unAuthorized("Not authorized to modify this role"),
        );
      }

      const trimmedName = name.trim();
      const slug = trimmedName.toLowerCase().replace(/\s+/g, "_");

      const duplicateName = await db.query.roles.findFirst({
        where: and(
          eq(roles.name, trimmedName),
          tenantId
            ? or(eq(roles.tenantId, tenantId), eq(roles.isSystemRole, true))
            : undefined,
        ),
      });

      if (duplicateName && duplicateName.id !== id) {
        return next(CustomErrorHandler.badRequest("Role name already exists"));
      }

      const duplicateSlug = await db.query.roles.findFirst({
        where: and(
          eq(roles.slug, slug),
          tenantId
            ? or(eq(roles.tenantId, tenantId), eq(roles.isSystemRole, true))
            : undefined,
        ),
      });

      if (duplicateSlug && duplicateSlug.id !== id) {
        return next(CustomErrorHandler.badRequest("Role slug already exists"));
      }

      await db.transaction(async (tx) => {
        await tx
          .update(roles)
          .set({
            name: trimmedName,
            slug,
            description: description?.trim() || null,
          })
          .where(eq(roles.id, id));

        await tx.delete(rolePermissions).where(eq(rolePermissions.roleId, id));

        if (permissionCodes.length > 0) {
          const permissionRows = await tx
            .select({
              id: permissions.id,
              code: permissions.code,
            })
            .from(permissions)
            .where(inArray(permissions.code, permissionCodes));

          if (permissionRows.length > 0) {
            await tx.insert(rolePermissions).values(
              permissionRows.map((permission) => ({
                roleId: id,
                permissionId: permission.id,
              })),
            );
          }
        }
      });

      return res
        .status(200)
        .send(ResponseHandler(200, "Role updated successfully"));
    } catch (error) {
      console.error("Error in updateRole:", error);
      return next(CustomErrorHandler.serverError());
    }
  },

  async deleteRole(req: Request, res: Response, next: NextFunction) {
    try {
      const { id } = req.params;
      const tenantId = req.user?.tenantId;

      if (!id || !UUID_REGEX.test(id)) {
        return next(CustomErrorHandler.badRequest("Valid role id is required"));
      }

      const role = await db.query.roles.findFirst({
        where: eq(roles.id, id),
      });

      if (!role) {
        return next(CustomErrorHandler.notFound("Role not found"));
      }

      if (role.isSystemRole) {
        return next(
          CustomErrorHandler.badRequest("System roles cannot be deleted"),
        );
      }

      if (tenantId && role.tenantId && role.tenantId !== tenantId) {
        return next(
          CustomErrorHandler.unAuthorized("Not authorized to delete this role"),
        );
      }

      const assignedUsers = await db.query.userRoles.findFirst({
        where: eq(userRoles.roleId, id),
      });

      if (assignedUsers) {
        return next(
          CustomErrorHandler.badRequest(
            "Role is assigned to users. Remove users from this role before deleting.",
          ),
        );
      }

      await db.transaction(async (tx) => {
        await tx.delete(rolePermissions).where(eq(rolePermissions.roleId, id));
        await tx.delete(roles).where(eq(roles.id, id));
      });

      return res
        .status(200)
        .send(ResponseHandler(200, "Role deleted successfully"));
    } catch (error) {
      console.error("Error in deleteRole:", error);
      return next(CustomErrorHandler.serverError());
    }
  },
};

export default roleController;
