import { relations } from "drizzle-orm";
import {
  boolean,
  integer,
  jsonb,
  pgTable,
  text,
  timestamp,
  uuid,
  varchar,
} from "drizzle-orm/pg-core";
import {
  bareActCategoryEnum,
  bareActJurisdictionEnum,
  bareActSourceEnum,
  bareActStatusEnum,
} from "../enum.js";
import users from "../users.js";
import bareActChapters from "./bareActChapters.js";
import bareActSections from "./bareActSections.js";
import bareActSchedules from "./bareActSchedules.js";

const bareActs = pgTable("bare_acts", {

  id: uuid("id").defaultRandom().primaryKey(),

  // Act Identification
  title: varchar("title", { length: 255 }).notNull(),
  shortCode: varchar("short_code", { length: 50 }),
  slug: varchar("slug", { length: 255 }).notNull().unique(),
  longTitle: text("long_title"),
  actNumber: varchar("act_number", { length: 100 }),
  actYear: integer("act_year").notNull(),

  // Classification & Jurisdiction
  category: bareActCategoryEnum("category").default("general_special").notNull(),
  jurisdiction: bareActJurisdictionEnum("jurisdiction").default("central").notNull(),
  stateJurisdiction: varchar("state_jurisdiction", { length: 100 }), // e.g. "Maharashtra", "Delhi" if state
  ministry: varchar("ministry", { length: 255 }),

  // Status & Lifecycle
  status: bareActStatusEnum("status").default("active").notNull(),
  enactmentDate: varchar("enactment_date", { length: 50 }),
  enforcementDate: varchar("enforcement_date", { length: 50 }),

  // Source & Access Control
  source: bareActSourceEnum("source").default("system_seed").notNull(),
  uploadedByAdminId: uuid("uploaded_by_admin_id").references(() => users.id, {
    onDelete: "set null",
  }),

  // Features & Rich Content
  isFeatured: boolean("is_featured").default(false).notNull(),
  preamble: text("preamble"),
  description: text("description"),
  pdfUrl: text("pdf_url"),

  // Cross-references (e.g. Old vs New Criminal Laws)
  repealedBy: varchar("repealed_by", { length: 255 }), // e.g., "Bharatiya Nyaya Sanhita, 2023"
  replacesAct: varchar("replaces_act", { length: 255 }), // e.g., "Indian Penal Code, 1860"

  // Quick stats & Search optimization
  totalSections: integer("total_sections").default(0).notNull(),
  totalChapters: integer("total_chapters").default(0).notNull(),
  keywords: jsonb("keywords").$type<string[]>().default([]),

  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at")
    .defaultNow()
    .$onUpdate(() => new Date()),
});

export default bareActs;

export const bareActsRelations = relations(bareActs, ({ one, many }) => ({
  uploadedBy: one(users, {
    fields: [bareActs.uploadedByAdminId],
    references: [users.id],
  }),
  chapters: many(bareActChapters),
  sections: many(bareActSections),
  schedules: many(bareActSchedules),
}));
