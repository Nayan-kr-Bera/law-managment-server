import { z } from "zod";

export const caseBulkActionSchema = z
  .object({
    caseIds: z
      .array(z.string().uuid("Invalid case ID"))
      .min(1, "At least one case must be selected")
      .refine(
        (ids) => new Set(ids).size === ids.length,
        "Duplicate case IDs are not allowed",
      ),

    action: z.enum([
      "mark-important",
      "remove-important",
      "mark-decided",
      "mark-abandoned",
      "company",
      "restore",
      "archive",
      "status",
      "priority",
      "empanelment",
      "label",
      "client",
      "link",
    ]),

    value: z.string().trim().optional(),

    secondaryValue: z.string().trim().optional(),
  })
  .superRefine((data, ctx) => {
    const actionsRequiringValue = [
      "company",
      "empanelment",
      "label",
      "client",
      "link",
    ];

    if (actionsRequiringValue.includes(data.action) && !data.value) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["value"],
        message: `${data.action} requires a value`,
      });
    }
  });

export type CaseBulkActionInput = z.infer<typeof caseBulkActionSchema>;
