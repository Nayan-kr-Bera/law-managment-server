import { and, eq, isNull, ne, or } from "drizzle-orm";
import { NextFunction, Request, Response } from "express";
import slugify from "slugify";
import db from "../../db/index.js";
import { caseTags, tags } from "../../db/schema/index.js";
import ResponseHandler from "../../utils/responseHandler.js";
import CustomErrorHandler from "../../utils/customErrorHandler.js";
const tagController = {
  async gettags(req: Request, res: Response, next: NextFunction) {
    const tenantId = req.user.tenantId;

    try {
      const tagdata = await db.query.tags.findMany({
        where: or(
          isNull(tags.tenantId), // Built-in tags
          eq(tags.tenantId, tenantId), // Tenant-specific tags
        ),
        columns: {
          id: true,
          name: true,
          color: true,
          slug: true,
          isBuiltIn: true,
        },
      });

      return res
        .status(200)
        .send(ResponseHandler(200, "Tags fetched successfully", tagdata));
    } catch (error) {
      console.error(error);
      return next(CustomErrorHandler.serverError());
    }
  },
  async createtag(req: Request, res: Response, next: NextFunction) {
    try {
      const { name, color } = req.body;
      const slug = slugify(name, {
        lower: true,
        strict: true,
        trim: true,
      });
      const tenantId = req.user.tenantId;
      if (!name) {
        return next(CustomErrorHandler.badRequest("tag name is required"));
      }

      // Check duplicate name
      const existingtag = await db.query.tags.findFirst({
        where: eq(tags.name, name),
      });

      if (existingtag) {
        return next(CustomErrorHandler.badRequest("tag already exists"));
      }

      await db.insert(tags).values({
        name,
        tenantId,
        slug,
        color,
      });

      return res
        .status(201)
        .send(ResponseHandler(201, "tag created successfully"));
    } catch (error) {
      console.log(error);
      return next(CustomErrorHandler.serverError());
    }
  },
  async updatetag(req: Request, res: Response, next: NextFunction) {
    try {
      const { id } = req.params;
      const tenantId = req.user.tenantId;
      const { name, color } = req.body;

      if (!id) {
        return next(CustomErrorHandler.badRequest("tag id is required"));
      }

      const tag = await db.query.tags.findFirst({
        where: and(eq(tags.id, id), eq(tags.tenantId, tenantId)),
      });

      if (!tag) {
        return next(CustomErrorHandler.notFound("tag not found"));
      }

      // Built-in tags cannot be modified
      if (tag.isBuiltIn) {
        return next(
          CustomErrorHandler.badRequest("Built-in tags cannot be modified"),
        );
      }

      const slug = slugify(name, {
        lower: true,
        strict: true,
        trim: true,
      });

      if (slug && slug !== tag.slug) {
        const duplicateName = await db.query.tags.findFirst({
          where: and(
            eq(tags.slug, slug),
            eq(tags.tenantId, tenantId),
            ne(tags.id, id),
          ),
        });

        if (duplicateName) {
          return next(CustomErrorHandler.badRequest("tag name already exists"));
        }
      }

      await db
        .update(tags)
        .set({
          name,
          color,
          slug,
        })
        .where(and(eq(tags.id, id), eq(tags.tenantId, tenantId)));

      return res
        .status(200)
        .send(ResponseHandler(200, "tag updated successfully"));
    } catch (error) {
      console.error(error);
      return next(CustomErrorHandler.serverError());
    }
  },

  async deletetag(req: Request, res: Response, next: NextFunction) {
    try {
      const { id } = req.params;
      const tenantId = req.user.tenantId;

      if (!id) {
        return next(CustomErrorHandler.badRequest("tag id is required"));
      }

      const tag = await db.query.tags.findFirst({
        where: and(eq(tags.id, id), eq(tags.tenantId, tenantId)),
      });

      if (!tag) {
        return next(CustomErrorHandler.notFound("tag not found"));
      }

      // Built-in tags cannot be deleted
      if (tag.isBuiltIn) {
        return next(
          CustomErrorHandler.badRequest("Built-in tags cannot be deleted"),
        );
      }

      const assignedCaseTag = await db.query.caseTags.findFirst({
        where: eq(caseTags.tagId, id),
      });

      if (assignedCaseTag) {
        return next(
          CustomErrorHandler.badRequest(
            "Tag is assigned to one or more cases. Remove it from those cases first.",
          ),
        );
      }

      await db
        .delete(tags)
        .where(and(eq(tags.id, id), eq(tags.tenantId, tenantId)));

      return res
        .status(200)
        .send(ResponseHandler(200, "Tag deleted successfully"));
    } catch (error) {
      console.error(error);
      return next(CustomErrorHandler.serverError());
    }
  },
};

export default tagController;
