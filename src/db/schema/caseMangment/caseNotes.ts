import {
  pgTable,
  uuid,
  text,
  boolean,
  timestamp,
} from "drizzle-orm/pg-core";
import { relations } from "drizzle-orm";

import cases from "./cases.js";
import users from "../users.js";

const caseNotes = pgTable("case_notes", {
  id: uuid("id").defaultRandom().primaryKey(),

  caseId: uuid("case_id").references(() => cases.id),

  createdBy: uuid("created_by"),

  note: text("note").notNull(),

  isPrivate: boolean("is_private").default(false).notNull(),

  createdAt: timestamp("created_at").defaultNow().notNull(),
});

export default caseNotes;

export const caseNoteRelation = relations(caseNotes, ({ one }) => ({
  case: one(cases, {
    fields: [caseNotes.caseId],
    references: [cases.id],
  }),

  creator: one(users, {
    fields: [caseNotes.createdBy],
    references: [users.id],
  }),
}));