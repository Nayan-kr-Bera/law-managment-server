import {
  pgTable,
  uuid,
  varchar,
  text,
  date,
} from "drizzle-orm/pg-core";
import { relations } from "drizzle-orm";

import cases from "./cases.js";
import hearingOrders from "./hearingOrders.js";

const hearings = pgTable("hearings", {
  id: uuid("id").defaultRandom().primaryKey(),

  caseId: uuid("case_id").references(() => cases.id),

  hearingDate: date("hearing_date"),

  stage: varchar("stage", { length: 255 }),

  courtNo: varchar("court_no", { length: 100 }),

  remarks: text("remarks"),
});

export default hearings;

export const hearingRelation = relations(hearings, ({ one, many }) => ({
  case: one(cases, {
    fields: [hearings.caseId],
    references: [cases.id],
  }),

  orders: many(hearingOrders),
}));