import { relations } from "drizzle-orm";
import {
  boolean,
  pgTable,
  timestamp,
  uuid,
  varchar,
} from "drizzle-orm/pg-core";
import emailOtp from "./emailOtp.js";
import { userStatusEnum } from "./enum.js";
import refreshTokens from "./refreshToken.js";
import advocates from "./advocates/advocates.js";
import userScopes from "./userScope.js";
import tasks from "./task/tasks.js";

const users = pgTable("users", {
  id: uuid("id").defaultRandom().primaryKey(),

  name: varchar("name", { length: 255 }).notNull(),

  email: varchar("email", { length: 255 }).notNull().unique(),

  phone: varchar("phone", { length: 20 }).notNull().unique(),

  password: varchar("password", { length: 255 }).notNull(),

  avatar: varchar("avatar", { length: 255 }),

  isEmailVerified: boolean("is_email_verified").notNull().default(false),

  isPhoneVerified: boolean("is_phone_verified").notNull().default(false),

  status: userStatusEnum("status").notNull().default("active"),

  createdBy: uuid("created_by"),

  updatedBy: uuid("updated_by"),

  lastLoginAt: timestamp("last_login_at").defaultNow().notNull(),

  deletedAt: timestamp("deleted_at"),

  deletedBy: uuid("deleted_by"),

  createdAt: timestamp("created_at").defaultNow().notNull(),

  updatedAt: timestamp("updated_at").defaultNow().notNull(),
});

export default users;

export const userRelation = relations(users, ({ many, one }) => ({
  refreshTokens: many(refreshTokens),
  otp: many(emailOtp),
  scopes: many(userScopes),
  advocate: one(advocates, {
    fields: [users.id],
    references: [advocates.userId],
  }),

  // Tasks assigned to this user
  assignedTasks: many(tasks, {
    relationName: "task_assignee",
  }),

  // Tasks created by this user
  createdTasks: many(tasks, {
    relationName: "task_creator",
  }),

  // Tasks last updated by this user
  updatedTasks: many(tasks, {
    relationName: "task_updater",
  }),
}));
