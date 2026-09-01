import { relations } from "drizzle-orm";
import {
  boolean,
  date,
  decimal,
  integer,
  pgTable,
  text,
  timestamp,
  uuid,
  varchar,
} from "drizzle-orm/pg-core";

import caseUpdates from "./caseUpdates.js";
import hearings from "./hearings.js";

import caseClients from "./caseClients.js";
import { casePriorityEnum, caseStatusEnum } from "../enum.js";
import caseTypes from "../masterData/caseTypes.js";
import companies from "../masterData/companies.js";
import courts from "../masterData/courts.js";
import empanelments from "../masterData/empanelments.js";
import policeStations from "../masterData/policeStations.js";
import underSections from "../masterData/underSections.js";
import tenants from "../tenants.js";
import offices from "../offices.js";
import users from "../users.js";
import caseAdvocates from "./caseAdvocates.js";
import tasks from "../task/tasks.js";
import caseLinks from "./caseLinks.js";
import caseTags from "./caseTags.js";
import caseDecisions from "./caseDecision.js";

const cases = pgTable("cases", {
  id: uuid("id").defaultRandom().primaryKey(),

  tenantId: uuid("tenant_id").references(() => tenants.id),

  officeId: uuid("office_id").references(() => offices.id),

  caseTypeId: uuid("case_type_id").references(() => caseTypes.id),

  courtId: uuid("court_id").references(() => courts.id),

  policeStationId: uuid("police_station_id").references(
    () => policeStations.id,
  ),

  companyId: uuid("company_id").references(() => companies.id),

  empanelmentId: uuid("empanelment_id").references(() => empanelments.id),

  underSectionId: uuid("under_section_id").references(() => underSections.id),

  title: varchar("title", { length: 255 }).notNull(),

  description: text("description"),

  caseNumber: varchar("case_number", { length: 100 }),

  cnrNumber: varchar("cnr_number", { length: 100 }),

  referenceNumber: varchar("reference_number", { length: 100 }),

  fileNumber: varchar("file_number", { length: 100 }),

  fileName: varchar("file_name", { length: 255 }),

  courtNumber: varchar("court_number", { length: 100 }),

  judgeName: varchar("judge_name", { length: 255 }),

  year: integer("year"),

  firstParty: varchar("first_party", { length: 255 }),

  oppositeParty: varchar("opposite_party", { length: 255 }),

  firNumber: varchar("fir_number", { length: 100 }),

  filingDate: date("filing_date"),

  registrationDate: date("registration_date"),

  nextHearingDate: date("next_hearing_date"),

  disposedDate: date("disposed_date"),

  stage: varchar("stage", { length: 100 }),

  priority: casePriorityEnum("priority").notNull().default("medium"),

  status: caseStatusEnum("status").notNull().default("draft"),

  caseValue: decimal("case_value", {
    precision: 12,
    scale: 2,
  }),

  remarks: text("remarks"),

  isDecided: boolean("is_decided").default(false).notNull(),

  isAbandoned: boolean("is_abandoned").default(false).notNull(),

  isArchived: boolean("is_archived").default(false).notNull(),

  createdBy: uuid("created_by"),

  updatedBy: uuid("updated_by"),

  createdAt: timestamp("created_at").defaultNow().notNull(),

  updatedAt: timestamp("updated_at").defaultNow().notNull(),

  deletedAt: timestamp("deleted_at"),
});

export default cases;

export const caseRelation = relations(cases, ({ one, many }) => ({
  tenant: one(tenants, {
    fields: [cases.tenantId],
    references: [tenants.id],
  }),

  office: one(offices, {
    fields: [cases.officeId],
    references: [offices.id],
  }),

  caseType: one(caseTypes, {
    fields: [cases.caseTypeId],
    references: [caseTypes.id],
  }),

  court: one(courts, {
    fields: [cases.courtId],
    references: [courts.id],
  }),

  policeStation: one(policeStations, {
    fields: [cases.policeStationId],
    references: [policeStations.id],
  }),

  company: one(companies, {
    fields: [cases.companyId],
    references: [companies.id],
  }),

  empanelment: one(empanelments, {
    fields: [cases.empanelmentId],
    references: [empanelments.id],
  }),

  underSection: one(underSections, {
    fields: [cases.underSectionId],
    references: [underSections.id],
  }),

  creator: one(users, {
    fields: [cases.createdBy],
    references: [users.id],
    relationName: "case_creator",
  }),

  updater: one(users, {
    fields: [cases.updatedBy],
    references: [users.id],
    relationName: "case_updater",
  }),

  hearings: many(hearings),

  updates: many(caseUpdates),

  advocates: many(caseAdvocates),
  clients: many(caseClients),
  tasks: many(tasks),
  tags: many(caseTags),
  linkedCases: many(caseLinks, {
    relationName: "caseLinks",
  }),

  linkedFromCases: many(caseLinks, {
    relationName: "linkedCaseLinks",
  }),
  decisions: many(caseDecisions),
}));
