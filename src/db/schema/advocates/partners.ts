import {
  pgTable,
  uuid,
  varchar,
} from "drizzle-orm/pg-core";
import { relations } from "drizzle-orm";

import tenants from "../tenants.js";
import offices from "../offices.js";
import users from "../users.js";

const partners = pgTable("partners", {
  id: uuid("id").defaultRandom().primaryKey(),

  tenantId: uuid("tenant_id").references(() => tenants.id),

  officeId: uuid("office_id").references(() => offices.id),

  userId: uuid("user_id").references(() => users.id),

  designation: varchar("designation", {
    length: 100,
  }),
});

export default partners;

export const partnerRelation = relations(
  partners,
  ({ one }) => ({
    tenant: one(tenants, {
      fields: [partners.tenantId],
      references: [tenants.id],
    }),

    office: one(offices, {
      fields: [partners.officeId],
      references: [offices.id],
    }),

    user: one(users, {
      fields: [partners.userId],
      references: [users.id],
    }),
  })
);
