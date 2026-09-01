import { relations } from "drizzle-orm";
import {
  boolean,
  pgTable,
  uuid,
  varchar,
} from "drizzle-orm/pg-core";

import caseAdvocates from "../caseMangment/caseAdvocates.js";
import users from "../users.js";

const advocates = pgTable("advocates", {
  id: uuid("id").defaultRandom().primaryKey(),

  userId: uuid("user_id").references(() => users.id).notNull(),

  enrollmentNo: varchar("enrollment_no", {
    length: 100,
  }),

  barCouncil: varchar("bar_council", {
    length: 255,
  }),

  designation: varchar("designation", {
    length: 100,
  }),

  practiceArea: varchar("practice_area", {
    length: 255,
  }),

  isActive: boolean("is_active").default(true).notNull(),
});

export default advocates;

export const advocateRelation = relations(
  advocates,
  ({ one, many }) => ({

    user: one(users, {
      fields: [advocates.userId],
      references: [users.id],
    }),

    cases: many(caseAdvocates),
  })
);
