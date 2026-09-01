import { relations } from "drizzle-orm";
import {
  boolean,
  pgTable,
  uuid,
  varchar,
} from "drizzle-orm/pg-core";

import caseTags from "../caseMangment/caseTags.js";
import tenants from "../tenants.js";

const tags = pgTable("tags", {
  id: uuid("id").defaultRandom().primaryKey(),

  tenantId: uuid("tenant_id").references(() => tenants.id),

  name: varchar("name", {
    length: 100,
  }).notNull(),
  slug: varchar("slug", {
    length: 100,
  }).notNull().unique(),
 isBuiltIn:boolean("is_built_in").default(false).notNull(),
  color: varchar("color", {
    length: 20,
  })
});

export default tags;

export const tagRelation = relations(tags, ({ one, many }) => ({
  tenant: one(tenants, {
    fields: [tags.tenantId],
    references: [tenants.id],
  }),

  caseTags: many(caseTags),
}));
