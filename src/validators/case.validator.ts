import { z } from "zod";

export const CASE_STATUS = [
  "draft",
  "open",
  "pending",
  "in_progress",
  "stayed",
  "closed",
  "disposed",
  "archived",
] as const;

export const CASE_PRIORITY = ["low", "medium", "high", "urgent"] as const;
export const createCaseSchema = z.object({
  title: z.string().trim().min(1, "Title is required").max(255),

  description: z.string().trim().optional(),

  officeId: z.uuid().optional(),

  courtId: z.uuid({
    error: "Court is required",
  }),

  caseTypeId: z.uuid({
    error: "Case type is required",
  }),

  companyId: z.uuid().optional(),

  policeStationId: z.uuid().optional(),

  underSectionId: z.uuid().optional(),

  empanelmentId: z.uuid().optional(),

  caseNumber: z.string().max(100).optional(),

  cnrNumber: z.string().max(100).optional(),

  referenceNumber: z.string().max(100).optional(),

  fileNumber: z.string().max(100).optional(),

  fileName: z.string().max(255).optional(),

  courtNumber: z.string().max(100).optional(),

  judgeName: z.string().max(255).optional(),

  year: z.number().int().min(1900).max(3000).optional(),

  firstParty: z.string().max(255).optional(),

  oppositeParty: z.string().max(255).optional(),

  firNumber: z.string().max(100).optional(),

  filingDate: z.iso.date().optional(),

  registrationDate: z.iso.date().optional(),

  nextHearingDate: z.iso.date().optional(),

  stage: z.string().max(100).optional(),

  remarks: z.string().optional(),

  status: z.enum(CASE_STATUS).optional(),

  priority: z.enum(CASE_PRIORITY).optional(),

  caseValue: z
    .union([
      z.number().nonnegative(),
      z
        .string()
        .trim()
        .regex(/^\d+(\.\d{1,2})?$/, "Case value must be a valid amount"),
    ])
    .optional()
    .transform((value) => {
      if (value === undefined) return undefined;
      return typeof value === "string" ? value : value.toFixed(2);
    }),

  isDecided: z.boolean().optional(),

  isAbandoned: z.boolean().optional(),

  clients: z
    .array(
      z.object({
        clientId: z.uuid(),

        role: z.string().max(100).optional(),
      }),
    )
    .optional(),

  advocates: z
    .array(
      z.object({
        advocateId: z.uuid(),

        isPrimary: z.boolean().optional(),
      }),
    )
    .optional(),

  customFields: z
    .array(
      z.object({
        fieldId: z.uuid(),

        value: z.string(),
      }),
    )
    .optional(),
});

export type CreateCaseInput = z.infer<typeof createCaseSchema>;
