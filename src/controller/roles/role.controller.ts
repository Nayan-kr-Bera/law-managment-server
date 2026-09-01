import { count, eq, inArray } from "drizzle-orm";
import { NextFunction, Request, Response } from "express";

import db from "../../db/index.js";

import {
  permissions,
  rolePermissions,
  roles,
  userRoles,
} from "../../db/schema/index.js";

import ResponseHandler from "../../utils/responseHandler.js";
import CustomErrorHandler from "../../utils/customErrorHandler.js";

const roleController = {
  async getRoles(req: Request, res: Response, next: NextFunction) {
    const { id: tenantId } = req.params;
    try {
      const roledata = await db.query.roles.findMany({
        where: eq(roles.tenantId, tenantId),
        columns: {
          id: true,
          name: true,
          slug: true,
          description: true,
          createdAt: true,
          isSystemRole: true,
        },
      });

      const userCounts = await db
        .select({
          roleId: userRoles.roleId,
          count: count(),
        })
        .from(userRoles)
        .groupBy(userRoles.roleId);

      const permissionCounts = await db
        .select({
          roleId: rolePermissions.roleId,
          count: count(),
        })
        .from(rolePermissions)
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
      console.error(error);
      return next(CustomErrorHandler.serverError());
    }
  },
  async getRoleById(req: Request, res: Response, next: NextFunction) {
    try {
      const { id } = req.params;

      if (!id) {
        return next(CustomErrorHandler.badRequest("Role id is required"));
      }

      // Get role
      const role = await db.query.roles.findFirst({
        where: eq(roles.id, id),
      });

      if (!role) {
        return next(CustomErrorHandler.notFound("Role not found"));
      }

      // Get all permissions
      const allPermissions = await db.query.permissions.findMany({
        orderBy: (permissions, { asc }) => [asc(permissions.code)],
      });

      // Get assigned permissions
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
      console.log(error);
      return next(CustomErrorHandler.serverError());
    }
  },
  async createRole(req: Request, res: Response, next: NextFunction) {
    try {
      const {
        name,
        description,
        permissions: permissionCodes,
        tenantId,
      } = req.body;
      const userId = req.user.id;
      if (!name) {
        return next(CustomErrorHandler.badRequest("Role name is required"));
      }

      if (!Array.isArray(permissionCodes)) {
        return next(
          CustomErrorHandler.badRequest("Permissions must be an array"),
        );
      }

      const slug = name.trim().toLowerCase().replace(/\s+/g, "_");

      // Check duplicate name
      const existingRole = await db.query.roles.findFirst({
        where: eq(roles.name, name),
      });

      if (existingRole) {
        return next(CustomErrorHandler.badRequest("Role already exists"));
      }

      // Check duplicate slug
      const existingSlug = await db.query.roles.findFirst({
        where: eq(roles.slug, slug),
      });

      if (existingSlug) {
        return next(CustomErrorHandler.badRequest("Role slug already exists"));
      }

      await db.transaction(async (tx) => {
        const [role] = await tx
          .insert(roles)
          .values({
            name,
            slug,
            tenantId,
            description,
            isSystemRole: false,
            createdBy: userId,
          })
          .returning();

        if (permissionCodes.length > 0) {
          const permissionRows = await tx
            .select({
              id: permissions.id,
              code: permissions.code,
            })
            .from(permissions)
            .where(inArray(permissions.code, permissionCodes));

          await tx.insert(rolePermissions).values(
            permissionRows.map((permission) => ({
              roleId: role.id,
              permissionId: permission.id,
            })),
          );
        }
      });

      return res
        .status(201)
        .send(ResponseHandler(201, "Role created successfully"));
    } catch (error) {
      console.log(error);
      return next(CustomErrorHandler.serverError());
    }
  },
  async updateRole(req: Request, res: Response, next: NextFunction) {
    try {
      const { id } = req.params;
      const { name, description, permissions: permissionCodes } = req.body;

      if (!id) {
        return next(CustomErrorHandler.badRequest("Role id is required"));
      }

      if (!name) {
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

      const slug = name.trim().toLowerCase().replace(/\s+/g, "_");

      const duplicateName = await db.query.roles.findFirst({
        where: eq(roles.name, name),
      });

      if (duplicateName && duplicateName.id !== id) {
        return next(CustomErrorHandler.badRequest("Role name already exists"));
      }

      const duplicateSlug = await db.query.roles.findFirst({
        where: eq(roles.slug, slug),
      });

      if (duplicateSlug && duplicateSlug.id !== id) {
        return next(CustomErrorHandler.badRequest("Role slug already exists"));
      }

      await db.transaction(async (tx) => {
        await tx
          .update(roles)
          .set({
            name,
            slug,
            description,
          })
          .where(eq(roles.id, id));

        // Remove existing permissions
        await tx.delete(rolePermissions).where(eq(rolePermissions.roleId, id));

        if (permissionCodes.length > 0) {
          const permissionRows = await tx
            .select({
              id: permissions.id,
              code: permissions.code,
            })
            .from(permissions)
            .where(inArray(permissions.code, permissionCodes));

          await tx.insert(rolePermissions).values(
            permissionRows.map((permission) => ({
              roleId: id,
              permissionId: permission.id,
            })),
          );
        }
      });

      return res
        .status(200)
        .send(ResponseHandler(200, "Role updated successfully"));
    } catch (error) {
      console.error(error);
      return next(CustomErrorHandler.serverError());
    }
  },
  async deleteRole(req: Request, res: Response, next: NextFunction) {
    try {
      const { id } = req.params;

      if (!id) {
        return next(CustomErrorHandler.badRequest("Role id is required"));
      }

      // Check role exists
      const role = await db.query.roles.findFirst({
        where: eq(roles.id, id),
      });

      if (!role) {
        return next(CustomErrorHandler.notFound("Role not found"));
      }

      // Prevent deleting system roles
      if (role.isSystemRole) {
        return next(
          CustomErrorHandler.badRequest("System roles cannot be deleted"),
        );
      }

      // Check whether role is assigned to users
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
      console.log(error);
      return next(CustomErrorHandler.serverError());
    }
  },
};

export default roleController;
