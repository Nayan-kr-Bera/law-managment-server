import { pgTable, uuid, varchar, timestamp } from "drizzle-orm/pg-core";
import { relations } from "drizzle-orm";
import users from "./users.js";

const emailOtp = pgTable("email_otp", {
  id: uuid("id").defaultRandom().primaryKey(),
  userId: uuid("user_id")
    .references(() => users.id, { onDelete: "cascade" })
    .notNull(),
  otp: varchar("otp", { length: 10 }).notNull(),
  generatedAt: varchar("generatedAt").notNull(),
  expiresAt: varchar("expiresAt").notNull(),
  createdAt: timestamp("created_at").defaultNow(),
});

export const emailOtpRelations = relations(emailOtp, ({ one }) => ({
  user: one(users, {
    fields: [emailOtp.userId],
    references: [users.id],
  }),
}));
export default emailOtp;
