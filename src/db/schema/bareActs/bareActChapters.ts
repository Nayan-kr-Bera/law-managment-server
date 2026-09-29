import { relations } from "drizzle-orm";
import {
  integer,
  pgTable,
  text,
  timestamp,
  uuid,
  varchar,
} from "drizzle-orm/pg-core";
import bareActs from "./bareActs.js";
import bareActSections from "./bareActSections.js";

const bareActChapters = pgTable("bare_act_chapters", {
  id: uuid("id").defaultRandom().primaryKey(),

  actId: uuid("act_id")
    .references(() => bareActs.id, { onDelete: "cascade" })
    .notNull(),

  partNumber: varchar("part_number", { length: 50 }), // e.g. "Part I", "Part III", "Part IV-A"
  partTitle: varchar("part_title", { length: 255 }), // e.g. "Fundamental Rights"
  chapterNumber: varchar("chapter_number", { length: 50 }), // e.g. "Chapter I", "Order XXXIX"
  title: varchar("title", { length: 255 }).notNull(),
  description: text("description"),

  startSection: varchar("start_section", { length: 50 }), // e.g. "Article 12", "Section 299"
  endSection: varchar("end_section", { length: 50 }), // e.g. "Article 35", "Section 377"
  orderIndex: integer("order_index").default(0).notNull(),

  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at")
    .defaultNow()
    .$onUpdate(() => new Date()),
});

export default bareActChapters;

export const bareActChaptersRelations = relations(bareActChapters, ({ one, many }) => ({
  act: one(bareActs, {
    fields: [bareActChapters.actId],
    references: [bareActs.id],
  }),
  sections: many(bareActSections),
}));
