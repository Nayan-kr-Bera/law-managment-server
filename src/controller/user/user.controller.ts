import { Request, Response, NextFunction } from "express";
import { and, eq, ilike, isNull } from "drizzle-orm";

import db from "../../db/index.js";
import users from "../../db/schema/users.js";
import CustomErrorHandler from "../../utils/customErrorHandler.js";
import {
  deleteFileFromCloudinary,
  uploadFileToCloudinary,
} from "../../services/cloudinary.service.js";
import tenants from "../../db/schema/tenants.js";
import userScopes from "../../db/schema/userScope.js";

const userController = {
  async getUsers(req: Request, res: Response, next: NextFunction) {
    try {
      const tenantId = req.user?.tenantId;

      if (!tenantId) {
        return next(
          CustomErrorHandler.notFound("Tenant information not found"),
        );
      }

      const search =
        typeof req.query.search === "string" ? req.query.search.trim() : "";

      const conditions = [isNull(users.deletedAt)];

      if (search) {
        conditions.push(ilike(users.name, `%${search}%`));
      }

      const userList = await db
        .select({
          id: users.id,
          name: users.name,
          email: users.email,
          phone: users.phone,
          avatar: users.avatar,
          isEmailVerified: users.isEmailVerified,
          isPhoneVerified: users.isPhoneVerified,
          status: users.status,
          lastLoginAt: users.lastLoginAt,
          createdAt: users.createdAt,
          updatedAt: users.updatedAt,
        })
        .from(users)
        .where(and(...conditions));

      return res.status(200).json({
        success: true,
        message: "Users fetched successfully",
        data: userList,
      });
    } catch (error) {
      next(error);
    }
  },

  async getUserById(req: Request, res: Response, next: NextFunction) {
    try {
      const { id } = req.params;

      const user = await db.query.user.findFirst({
        where: and(eq(users.id, id), isNull(users.deletedAt)),
        columns: {
          id: true,
          name: true,
          email: true,
          phone: true,
          avatar: true,
          isEmailVerified: true,
          isPhoneVerified: true,
          status: true,
          lastLoginAt: true,
          createdAt: true,
          updatedAt: true,
        },
      });

      if (!user) {
        return next(CustomErrorHandler.notFound("User not found"));
      }

      return res.status(200).json({
        success: true,
        message: "User fetched successfully",
        data: user,
      });
    } catch (error) {
      next(error);
    }
  },
  async updateUser(req: Request, res: Response, next: NextFunction) {
    try {
      const { id } = req.params;
      const { name, email, phone } = req.body;

      // 1. Find existing use
      const existingUser = await db.query.user.findFirst({
        where: and(eq(users.id, id), isNull(users.deletedAt)),
        columns: {
          id: true,
          avatar: true,
        },
      });

      if (!existingUser) {
        console.log("User not found:", id);

        return next(CustomErrorHandler.notFound("User not found"));
      }

      let avatarUrl: string | undefined;

      // 2. Handle avata
      if (req.file) {
        // 3. Delete old avatar if it exists
        if (existingUser.avatar) {
          await deleteFileFromCloudinary(existingUser.avatar, "image");

          // 4. Upload new avatar
          const uploadedFile = await uploadFileToCloudinary({
            buffer: req.file.buffer,
            originalName: req.file.originalname,
            mimetype: req.file.mimetype,
            folder: "mi_law_practice",
          });

          avatarUrl = uploadedFile.secureUrl;

          // 5. Update databas
          const [updatedUser] = await db
            .update(users)
            .set({
              ...(name !== undefined && { name }),
              ...(email !== undefined && { email }),
              ...(phone !== undefined && { phone }),

              ...(avatarUrl !== undefined && {
                avatar: avatarUrl,
              }),

              updatedBy: req.user?.userId,
              updatedAt: new Date(),
            })
            .where(and(eq(users.id, id), isNull(users.deletedAt)))
            .returning({
              id: users.id,
              name: users.name,
              email: users.email,
              phone: users.phone,
              avatar: users.avatar,
              status: users.status,
              updatedAt: users.updatedAt,
            });

          console.log("Updated user:", updatedUser);

          if (!updatedUser) {
            return next(CustomErrorHandler.notFound("User not found"));
          }

          return res.status(200).json({
            success: true,
            message: "User updated successfully",
            data: updatedUser,
          });
        }
      }
    } catch (error) {
      next(error);
    }
  },

  async updateUserStatus(req: Request, res: Response, next: NextFunction) {
    try {
      const { id } = req.params;
      const { status } = req.body;

      if (!status) {
        return next(CustomErrorHandler.badRequest("Status is required"));
      }

      const [updatedUser] = await db
        .update(users)
        .set({
          status,
          updatedBy: req.user?.userId,
          updatedAt: new Date(),
        })
        .where(and(eq(users.id, id), isNull(users.deletedAt)))
        .returning({
          id: users.id,
          name: users.name,
          email: users.email,
          status: users.status,
          updatedAt: users.updatedAt,
        });

      if (!updatedUser) {
        return next(CustomErrorHandler.notFound("User not found"));
      }

      return res.status(200).json({
        success: true,
        message: "User status updated successfully",
        data: updatedUser,
      });
    } catch (error) {
      next(error);
    }
  },
  async deleteUser(req: Request, res: Response, next: NextFunction) {
    try {
      const { id } = req.params;

      // ---------------------------------------------------------
      // 1. FIND USER
      // ---------------------------------------------------------

      const existingUser = await db.query.user.findFirst({
        where: and(eq(users.id, id), isNull(users.deletedAt)),
        columns: {
          id: true,
          name: true,
          email: true,
          avatar: true,
        },
      });

      if (!existingUser) {
        return next(CustomErrorHandler.notFound("User not found"));
      }

      // ---------------------------------------------------------
      // 2. DELETE AVATAR FROM CLOUDINARY
      // ---------------------------------------------------------

      if (existingUser.avatar) {
        await deleteFileFromCloudinary(existingUser.avatar, "image");
      }

      // ---------------------------------------------------------
      // 3. SOFT DELETE USER
      // ---------------------------------------------------------

      const [deletedUser] = await db
        .update(users)
        .set({
          deletedAt: new Date(),
          deletedBy: req.user?.userId,
          updatedAt: new Date(),
        })
        .where(and(eq(users.id, id), isNull(users.deletedAt)))
        .returning({
          id: users.id,
          name: users.name,
          email: users.email,
        });

      if (!deletedUser) {
        return next(CustomErrorHandler.notFound("User not found"));
      }

      // ---------------------------------------------------------
      // 4. RESPONSE
      // ---------------------------------------------------------

      return res.status(200).json({
        success: true,
        message: "User deleted successfully",
        data: deletedUser,
      });
    } catch (error) {
      console.error("DELETE USER ERROR:", error);

      return next(error);
    }
  },
  async getMyTenants(req: Request, res: Response, next: NextFunction) {
    try {
      const userId = req.user.userId;

      const userTenants = await db
        .select({
          id: tenants.id,
          name: tenants.name,
          slug: tenants.slug,
          logo: tenants.logo,
          gst: tenants.gst,
          organisationEmail: tenants.organisationEmail,
          organisationPhone: tenants.organisationPhone,
          timezone: tenants.timezone,
          status: tenants.status,

          isDefault: userScopes.isDefault,
        })
        .from(userScopes)
        .innerJoin(tenants, eq(userScopes.tenantId, tenants.id))
        .where(eq(userScopes.userId, userId));

      return res.status(200).json({
        success: true,
        message: "My tenants fetched successfully",
        data: userTenants,
      });
    } catch (error) {
      next(error);
    }
  },
};

export default userController;
