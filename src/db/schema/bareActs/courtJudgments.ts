import { boolean, index, integer, pgTable, text, timestamp, uuid, varchar } from "drizzle-orm/pg-core";
import users from "../users.js";

export const courtJudgments = pgTable(
  "court_judgments",
  {
    id: uuid("id").defaultRandom().primaryKey(),

    // Case Details
    title: varchar("title", { length: 500 }).notNull(),
    citation: varchar("citation", { length: 255 }), // Traditional citation e.g. "(2024) 4 SCC 120"
    neutralCitation: varchar("neutral_citation", { length: 150 }), // Official Neutral Citation e.g. "2024 INSC 123", "2023:DHC:4567"
    equivalentCitations: text("equivalent_citations"), // Other reported citations e.g. "AIR 2024 SC 850 | 2024 (2) SCALE 99"
    court: varchar("court", { length: 255 }).notNull(), // e.g. "Supreme Court of India", "Delhi High Court"
    courtLevel: varchar("court_level", { length: 50 }).default("supreme_court").notNull(), // "supreme_court" | "high_court" | "tribunal"
    date: varchar("date", { length: 100 }), // Date of judgment e.g. "24 April 1973"
    decisionDate: varchar("decision_date", { length: 50 }), // YYYY-MM-DD format if available
    year: integer("year"),
    bench: text("bench"), // Judges on the bench
    benchStrength: integer("bench_strength").default(2), // 2-Judge, 3-Judge, 5-Judge Constitution Bench

    // Parties
    petitioner: text("petitioner"),
    respondent: text("respondent"),

    // Legal Analysis
    actSection: text("act_section"), // Key Statutes / Provisions interpreted e.g. "Art. 21, IPC 302"
    ratioDecidendi: text("ratio_decidendi"), // Binding legal principle
    summary: text("summary"), // Executive summary of dispute & holding
    fullText: text("full_text"), // Optional judgment excerpt / text

    // Links & Verification
    cnr: varchar("cnr", { length: 100 }),
    url: text("url"), // eCourts or official source link
    isFeatured: boolean("is_featured").default(false).notNull(),

    // Tracking
    uploadedByAdminId: uuid("uploaded_by_admin_id").references(() => users.id, {
      onDelete: "set null",
    }),

    createdAt: timestamp("created_at").defaultNow().notNull(),
    updatedAt: timestamp("updated_at")
      .defaultNow()
      .$onUpdate(() => new Date()),
  },
  (table) => [
    index("court_judgments_court_level_idx").on(table.courtLevel),
    index("court_judgments_year_idx").on(table.year),
    index("court_judgments_citation_idx").on(table.citation),
    index("court_judgments_neutral_citation_idx").on(table.neutralCitation),
  ]
);

export default courtJudgments;
