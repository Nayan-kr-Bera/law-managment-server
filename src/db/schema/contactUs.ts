import { pgTable, uuid, varchar, text, timestamp } from "drizzle-orm/pg-core";

const contactUsMessages = pgTable("contact_us_messages", {
  id: uuid("id").defaultRandom().primaryKey(),
  fullName: varchar("full_name", { length: 150 }).notNull(),
  email: varchar("email", { length: 255 }).notNull(),
  phone: varchar("phone", { length: 50 }),
  firmName: varchar("firm_name", { length: 255 }),
  role: varchar("role", { length: 100 }).default("Advocate"),
  subject: varchar("subject", { length: 255 }).notNull(),
  message: text("message").notNull(),
  status: varchar("status", { length: 50 }).default("pending").notNull(), // pending, contacted, in_review, resolved, archived
  adminNotes: text("admin_notes"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
});

export default contactUsMessages;
