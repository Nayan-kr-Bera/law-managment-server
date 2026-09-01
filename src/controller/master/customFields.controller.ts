import { Request, Response, NextFunction } from "express";
import { and, eq, ne } from "drizzle-orm";
import {
  caseCustomFieldValues,
  customFieldOptions,
  customFields,
} from "../../db/schema/index.js";
import db from "../../db/index.js";
import CustomErrorHandler from "../../utils/customErrorHandler.js";
import ResponseHandler from "../../utils/responseHandler.js";
import slugify from "slugify";

class CustomFieldController {
  // Create
  async createCustomField(req: Request, res: Response, next: NextFunction) {
    try {
      const tenantId = req.user.tenantId;
      const userId = req.user.id;

      const {
        officeId,
        label,
        fieldType,
        isRequired,
        sortOrder,
        options = [],
      } = req.body;
      
      const fieldKey = slugify(label, {
        lower: true,
        strict: true,
        replacement: "_",
      });

      const exists = await db.query.customFields.findFirst({
        where: and(
          eq(customFields.tenantId, tenantId),
          eq(customFields.fieldKey, fieldKey),
        ),
      });

      if (exists) {
        return next(
          CustomErrorHandler.alreadyExist(
            "Custom field with this label already exists.",
          ),
        );
      }

      const [field] = await db
        .insert(customFields)
        .values({
          tenantId,
          officeId,
          label,
          fieldKey,
          fieldType,
          isRequired,
          sortOrder,
          createdBy: userId,
        })
        .returning();

      // Insert options only for option-based fields
      if (
        ["select", "radio", "checkbox", "multiselect"].includes(fieldType) &&
        Array.isArray(options) &&
        options.length > 0
      ) {
        await db.insert(customFieldOptions).values(
          options.map(
            (
              option: {
                label: string;
                value?: string;
              },
              index: number,
            ) => ({
              fieldId: field.id,
              label: option.label,
              value:
                option.value ||
                slugify(option.label, {
                  lower: true,
                  strict: true,
                  replacement: "_",
                }),
              sortOrder: index + 1,
            }),
          ),
        );
      }

      const createdField = await db.query.customFields.findFirst({
        where: eq(customFields.id, field.id),
        with: {
          options: true,
        },
      });

      return res
        .status(201)
        .send(
          ResponseHandler(
            201,
            "Custom field created successfully",
            createdField,
          ),
        );
    } catch (error) {
      console.error(error);
      return next(CustomErrorHandler.serverError());
    }
  }

  // Get All
  async getCustomFields(req: Request, res: Response, next: NextFunction) {
    try {
      const tenantId = req.user.tenantId;

      const fields = await db.query.customFields.findMany({
        where: eq(customFields.tenantId, tenantId),
        with: {
          options: true,
        },
      });

      return res
        .status(200)
        .send(
          ResponseHandler(200, "Custom fields fetched successfully", fields),
        );
    } catch (error) {
      console.error(error);
      return next(CustomErrorHandler.serverError());
    }
  }

  // Get By Id
  async getCustomFieldById(req: Request, res: Response, next: NextFunction) {
    try {
      const { id } = req.params;
      const tenantId = req.user.tenantId;

      const field = await db.query.customFields.findFirst({
        where: and(
          eq(customFields.id, id),
          eq(customFields.tenantId, tenantId),
        ),
        with: {
          options: true,
        },
      });

      if (!field) {
        return next(CustomErrorHandler.notFound("Custom field not found"));
      }

      return res
        .status(200)
        .send(ResponseHandler(200, "Custom field fetched successfully", field));
    } catch (error) {
      console.error(error);
      return next(CustomErrorHandler.serverError());
    }
  }

  // Update
  async updateCustomField(req: Request, res: Response, next: NextFunction) {
    try {
      const { id } = req.params;
      const tenantId = req.user.tenantId;

      const {
        officeId,
        label,
        fieldType,
        isRequired,
        sortOrder,
        options = [],
      } = req.body;

      const fieldKey = slugify(label, {
        lower: true,
        strict: true,
        replacement: "_",
      });

      const field = await db.query.customFields.findFirst({
        where: and(
          eq(customFields.id, id),
          eq(customFields.tenantId, tenantId),
        ),
        with: {
          options: true,
        },
      });

      if (!field) {
        return next(CustomErrorHandler.notFound("Custom field not found"));
      }

      const duplicate = await db.query.customFields.findFirst({
        where: and(
          eq(customFields.tenantId, tenantId),
          eq(customFields.fieldKey, fieldKey),
          ne(customFields.id, id),
        ),
      });

      if (duplicate) {
        return next(
          CustomErrorHandler.alreadyExist(
            "A custom field with this label already exists.",
          ),
        );
      }

      await db.transaction(async (tx) => {
        // Update field
        await tx
          .update(customFields)
          .set({
            officeId,
            label,
            fieldKey,
            fieldType,
            isRequired,
            sortOrder,
          })
          .where(eq(customFields.id, id));

        // Remove all old options
        await tx
          .delete(customFieldOptions)
          .where(eq(customFieldOptions.fieldId, id));

        // Insert new options only for Select/Radio
        if (
          (fieldType === "select" || fieldType === "radio") &&
          Array.isArray(options) &&
          options.length > 0
        ) {
          await tx.insert(customFieldOptions).values(
            options.map(
              (
                option: { label: string; value?: string; sortOrder?: number },
                index: number,
              ) => ({
                fieldId: id,
                label: option.label,
                value:
                  option.value ??
                  slugify(option.label, {
                    lower: true,
                    strict: true,
                    replacement: "_",
                  }),
                sortOrder: option.sortOrder ?? index + 1,
              }),
            ),
          );
        }
      });

      const updated = await db.query.customFields.findFirst({
        where: eq(customFields.id, id),
        with: {
          options: true,
        },
      });

      return res
        .status(200)
        .send(
          ResponseHandler(200, "Custom field updated successfully", updated),
        );
    } catch (error) {
      console.error(error);
      return next(CustomErrorHandler.serverError());
    }
  }

  // Delete
  async deleteCustomField(req: Request, res: Response, next: NextFunction) {
    try {
      const { id } = req.params;
      const tenantId = req.user.tenantId;

      const field = await db.query.customFields.findFirst({
        where: and(
          eq(customFields.id, id),
          eq(customFields.tenantId, tenantId),
        ),
      });

      if (!field) {
        return next(CustomErrorHandler.notFound("Custom field not found"));
      }

      const assigned = await db.query.caseCustomFieldValues.findFirst({
        where: eq(caseCustomFieldValues.fieldId, id),
      });

      if (assigned) {
        return next(
          CustomErrorHandler.badRequest(
            "Custom field is being used by one or more cases. Remove those values first.",
          ),
        );
      }

      await db
        .delete(customFields)
        .where(
          and(eq(customFields.id, id), eq(customFields.tenantId, tenantId)),
        );

      return res
        .status(200)
        .send(ResponseHandler(200, "Custom field deleted successfully"));
    } catch (error) {
      console.error(error);
      return next(CustomErrorHandler.serverError());
    }
  }
}

export default new CustomFieldController();
