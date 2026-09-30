import { z } from "zod";

export const BARE_ACT_CATEGORIES = [
  "constitutional",
  "criminal",
  "civil_procedure",
  "corporate_commercial",
  "banking_finance",
  "family_personal",
  "property_realestate",
  "labour_employment",
  "taxation",
  "cyber_ipr",
  "consumer_environment",
  "motor_accidents",
  "arbitration_adr",
  "general_special",
] as const;

export const BARE_ACT_JURISDICTIONS = ["central", "state"] as const;
export const BARE_ACT_STATUS = [
  "active",
  "repealed",
  "amended",
  "pending_enforcement",
] as const;
export const BARE_ACT_SOURCES = ["system_seed", "admin_upload"] as const;

export const SECTION_TYPES = [
  "section",
  "article",
  "order_rule",
  "clause",
  "schedule",
] as const;

export const BAILABLE_STATUS = [
  "bailable",
  "non_bailable",
  "not_applicable",
] as const;

export const COGNIZABLE_STATUS = [
  "cognizable",
  "non_cognizable",
  "not_applicable",
] as const;

export const COMPOUNDABLE_STATUS = [
  "compoundable",
  "non_compoundable",
  "compoundable_with_permission",
  "not_applicable",
] as const;

// Create Bare Act
export const createBareActSchema = z.object({
  title: z.string().trim().min(2, "Title is required").max(255),
  shortCode: z.string().trim().max(50).optional(),
  slug: z.string().trim().max(255).optional(),
  longTitle: z.string().trim().optional(),
  actNumber: z.string().trim().max(100).optional(),
  actYear: z.number().int().min(1700).max(2100),
  category: z.enum(BARE_ACT_CATEGORIES).default("general_special"),
  jurisdiction: z.enum(BARE_ACT_JURISDICTIONS).default("central"),
  stateJurisdiction: z.string().trim().max(100).optional(),
  ministry: z.string().trim().max(255).optional(),
  status: z.enum(BARE_ACT_STATUS).default("active"),
  enactmentDate: z.string().optional(),
  enforcementDate: z.string().optional(),
  isFeatured: z.boolean().optional().default(false),
  preamble: z.string().optional(),
  description: z.string().optional(),
  pdfUrl: z.string().url().optional().or(z.literal("")),
  repealedBy: z.string().max(255).optional(),
  replacesAct: z.string().max(255).optional(),
  keywords: z.array(z.string()).optional().default([]),
});

// Update Bare Act
export const updateBareActSchema = createBareActSchema.partial();

// Chapter Validator
export const createChapterSchema = z.object({
  partNumber: z.string().trim().max(50).optional(),
  partTitle: z.string().trim().max(255).optional(),
  chapterNumber: z.string().trim().max(50).optional(),
  title: z.string().trim().min(1, "Chapter title is required").max(255),
  description: z.string().optional(),
  startSection: z.string().trim().max(50).optional(),
  endSection: z.string().trim().max(50).optional(),
  orderIndex: z.number().int().optional().default(0),
  autoAssignByRange: z.boolean().optional(),
  sectionIds: z.array(z.string().uuid()).optional(),
});

export const updateChapterSchema = createChapterSchema.partial();

export const assignSectionsToChapterSchema = z.object({
  sectionIds: z.array(z.string().uuid()).optional(),
  startSection: z.string().trim().optional(),
  endSection: z.string().trim().optional(),
});

export const unassignSectionsSchema = z.object({
  sectionIds: z.array(z.string().uuid()).min(1, "At least one sectionId is required"),
});

// Section Validator
export const createSectionSchema = z.object({
  chapterId: z.string().uuid().optional(),
  sectionType: z.enum(SECTION_TYPES).default("section"),
  sectionNumber: z.string().trim().min(1, "Section number is required").max(100),
  sectionNumeric: z.number().optional(),
  title: z.string().trim().min(1, "Title is required").max(500),
  slug: z.string().trim().max(255).optional(),
  content: z.string().min(1, "Section content is required"),
  subSections: z
    .array(
      z.object({
        number: z.string().optional(),
        text: z.string(),
      })
    )
    .optional()
    .default([]),
  provisos: z.array(z.string()).optional().default([]),
  explanations: z.array(z.string()).optional().default([]),
  illustrations: z.array(z.string()).optional().default([]),
  footnotes: z.array(z.string()).optional().default([]),
  punishment: z.string().optional(),
  bailableStatus: z.enum(BAILABLE_STATUS).default("not_applicable"),
  cognizableStatus: z.enum(COGNIZABLE_STATUS).default("not_applicable"),
  compoundableStatus: z.enum(COMPOUNDABLE_STATUS).default("not_applicable"),
  triableBy: z.string().max(255).optional(),
  keywords: z.array(z.string()).optional().default([]),
  crossReferences: z
    .object({
      oldEquivalent: z.string().optional(),
      newEquivalent: z.string().optional(),
      relatedArticles: z.array(z.string()).optional(),
      relatedSections: z.array(z.string()).optional(),
      landmarkJudgments: z
        .array(
          z.object({
            title: z.string(),
            citation: z.string(),
            year: z.number().optional(),
            summary: z.string().optional(),
          })
        )
        .optional(),
    })
    .optional()
    .default({}),
  orderIndex: z.number().int().optional().default(0),
});

export const updateSectionSchema = createSectionSchema.partial();

// Schedule Validator
export const createScheduleSchema = z.object({
  scheduleNumber: z.string().trim().min(1).max(100),
  title: z.string().trim().min(1).max(255),
  content: z.string().optional(),
  tableData: z.array(z.any()).optional().default([]),
  orderIndex: z.number().int().optional().default(0),
});

export const updateScheduleSchema = createScheduleSchema.partial();

// Bulk Import Schema
export const bulkImportBareActSchema = z.object({
  act: createBareActSchema,
  chapters: z
    .array(
      createChapterSchema.extend({
        sections: z.array(createSectionSchema.omit({ chapterId: true })).optional(),
      })
    )
    .optional(),
  sections: z.array(createSectionSchema).optional(),
  schedules: z.array(createScheduleSchema).optional(),
});

export type CreateBareActInput = z.infer<typeof createBareActSchema>;
export type UpdateBareActInput = z.infer<typeof updateBareActSchema>;
export type CreateChapterInput = z.infer<typeof createChapterSchema>;
export type UpdateChapterInput = z.infer<typeof updateChapterSchema>;
export type CreateSectionInput = z.infer<typeof createSectionSchema>;
export type UpdateSectionInput = z.infer<typeof updateSectionSchema>;
export type CreateScheduleInput = z.infer<typeof createScheduleSchema>;
export type UpdateScheduleInput = z.infer<typeof updateScheduleSchema>;
export type BulkImportBareActInput = z.infer<typeof bulkImportBareActSchema>;
export type AssignSectionsToChapterInput = z.infer<typeof assignSectionsToChapterSchema>;
export type UnassignSectionsInput = z.infer<typeof unassignSectionsSchema>;

