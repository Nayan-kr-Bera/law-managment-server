import {
  pgTable,
  uuid,
  timestamp,
  unique,
} from "drizzle-orm/pg-core";
import { relations } from "drizzle-orm";

import userScopes from "./userScope.js";
import offices from "./offices.js";
import users from "./users.js";

const userScopeOffices = pgTable(
  "user_scope_offices",
  {
    id: uuid("id").defaultRandom().primaryKey(),

    userScopeId: uuid("user_scope_id")
      .notNull()
      .references(() => userScopes.id),

    officeId: uuid("office_id")
      .notNull()
      .references(() => offices.id),

    createdBy: uuid("created_by").references(() => users.id),

    createdAt: timestamp("created_at").defaultNow().notNull(),
  },
  (table) => ({
    uniqueScopeOffice: unique().on(table.userScopeId, table.officeId),
  })
);

export default userScopeOffices;

export const userScopeOfficeRelation = relations(
  userScopeOffices,
  ({ one }) => ({
    userScope: one(userScopes, {
      fields: [userScopeOffices.userScopeId],
      references: [userScopes.id],
    }),

    office: one(offices, {
      fields: [userScopeOffices.officeId],
      references: [offices.id],
    }),

    creator: one(users, {
      fields: [userScopeOffices.createdBy],
      references: [users.id],
      relationName: "user_scope_office_creator",
    }),
  })
);