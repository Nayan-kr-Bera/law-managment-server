import {
  pgTable,
  uuid,
  varchar,
  timestamp,
  index,
  uniqueIndex,
} from "drizzle-orm/pg-core";
import users from "./users.js";

/**
 * Device-bound sessions for the mobile (chamber) app.
 *
 * The web portal keeps using `refresh_tokens` (one session per user).
 * Mobile uses this table: one row per (user, device), so logging in on a
 * phone never logs out the web or other phones.
 *
 * Only a SHA-256 hash of the opaque refresh token is stored.
 */
const mobileSessions = pgTable(
  "mobile_sessions",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    userId: uuid("user_id")
      .references(() => users.id, { onDelete: "cascade" })
      .notNull(),
    tenantId: uuid("tenant_id"),
    scopeId: uuid("scope_id"),

    deviceId: varchar("device_id", { length: 128 }).notNull(),
    deviceName: varchar("device_name", { length: 255 }),
    platform: varchar("platform", { length: 32 }),

    tokenHash: varchar("token_hash", { length: 128 }).notNull(),
    prevTokenHash: varchar("prev_token_hash", { length: 128 }),
    prevValidUntil: timestamp("prev_valid_until"),

    lastIp: varchar("last_ip", { length: 64 }),
    userAgent: varchar("user_agent", { length: 512 }),

    lastUsedAt: timestamp("last_used_at").defaultNow(),
    expiresAt: timestamp("expires_at").notNull(),
    revokedAt: timestamp("revoked_at"),
    createdAt: timestamp("created_at").defaultNow(),
  },
  (table) => [
    uniqueIndex("mobile_sessions_user_device_uq").on(table.userId, table.deviceId),
    index("mobile_sessions_user_idx").on(table.userId),
  ],
);

export default mobileSessions;

