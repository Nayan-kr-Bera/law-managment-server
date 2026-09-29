import { relations } from "drizzle-orm";
import {
  doublePrecision,
  index,
  integer,
  jsonb,
  pgTable,
  text,
  timestamp,
  uuid,
  varchar,
} from "drizzle-orm/pg-core";
import {
  bailableStatusEnum,
  cognizableStatusEnum,
  compoundableStatusEnum,
  sectionTypeEnum,
} from "../enum.js";
import bareActs from "./bareActs.js";
import bareActChapters from "./bareActChapters.js";

export interface ISubSectionItem {
  number?: string; // e.g. "(1)", "(2)(a)"
  text: string;
}

export interface ICrossReferenceInfo {
  oldEquivalent?: string; // e.g. "IPC Section 302"
  newEquivalent?: string; // e.g. "BNS Section 103"
  relatedArticles?: string[]; // e.g. ["Article 21", "Article 22"]
  relatedSections?: string[]; // e.g. ["BNSS Section 437", "BNSS Section 482"]
  landmarkJudgments?: Array<{
    title: string;
    citation: string;
    year?: number;
    summary?: string;
  }>;
}

const bareActSections = pgTable(
  "bare_act_sections",
  {
    id: uuid("id").defaultRandom().primaryKey(),

    actId: uuid("act_id")
      .references(() => bareActs.id, { onDelete: "cascade" })
      .notNull(),

    chapterId: uuid("chapter_id").references(() => bareActChapters.id, {
      onDelete: "set null",
    }),

    // Structural & Numbering
    sectionType: sectionTypeEnum("section_type").default("section").notNull(),
    sectionNumber: varchar("section_number", { length: 100 }).notNull(), // e.g. "Section 302", "Article 21", "Order XXXIX Rule 1"
    sectionNumeric: doublePrecision("section_numeric").default(0), // for natural numerical sorting (e.g. 21.0, 21.1 for 21A)
    title: varchar("title", { length: 500 }).notNull(), // e.g. "Protection of life and personal liberty"
    slug: varchar("slug", { length: 255 }).notNull(),

    // Statutory Content
    content: text("content").notNull(),
    subSections: jsonb("sub_sections").$type<ISubSectionItem[]>().default([]),
    provisos: jsonb("provisos").$type<string[]>().default([]),
    explanations: jsonb("explanations").$type<string[]>().default([]),
    illustrations: jsonb("illustrations").$type<string[]>().default([]),
    footnotes: jsonb("footnotes").$type<string[]>().default([]),

    // Criminal Law & Legal Classification
    punishment: text("punishment"), // e.g. "Death, or imprisonment for life, and fine"
    bailableStatus: bailableStatusEnum("bailable_status").default("not_applicable").notNull(),
    cognizableStatus: cognizableStatusEnum("cognizable_status").default("not_applicable").notNull(),
    compoundableStatus: compoundableStatusEnum("compoundable_status").default("not_applicable").notNull(),
    triableBy: varchar("triable_by", { length: 255 }), // e.g. "Court of Session", "Magistrate of First Class"

    // Search & Cross-References
    keywords: jsonb("keywords").$type<string[]>().default([]),
    crossReferences: jsonb("cross_references").$type<ICrossReferenceInfo>().default({}),

    orderIndex: integer("order_index").default(0).notNull(),

    createdAt: timestamp("created_at").defaultNow().notNull(),
    updatedAt: timestamp("updated_at")
      .defaultNow()
      .$onUpdate(() => new Date()),
  },
  (table) => [
    index("bare_act_sections_act_id_idx").on(table.actId),
    index("bare_act_sections_slug_idx").on(table.slug),
    index("bare_act_sections_bailable_idx").on(table.bailableStatus),
    index("bare_act_sections_cognizable_idx").on(table.cognizableStatus),
    index("bare_act_sections_numeric_idx").on(table.sectionNumeric),
  ]
);

export default bareActSections;

export const bareActSectionsRelations = relations(bareActSections, ({ one }) => ({
  act: one(bareActs, {
    fields: [bareActSections.actId],
    references: [bareActs.id],
  }),
  chapter: one(bareActChapters, {
    fields: [bareActSections.chapterId],
    references: [bareActChapters.id],
  }),
}));
