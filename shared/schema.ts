import { sql } from "drizzle-orm";
import { pgTable, text, varchar, timestamp } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod";

export const guildConfigs = pgTable("guild_configs", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  guildId: text("guild_id").notNull().unique(),
  requestChannelId: text("request_channel_id"),
  logChannelId: text("log_channel_id"),
  allowedRoleIds: text("allowed_role_ids").array(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
});

export const insertGuildConfigSchema = createInsertSchema(guildConfigs).omit({
  id: true,
  updatedAt: true,
});

export type InsertGuildConfig = z.infer<typeof insertGuildConfigSchema>;
export type GuildConfig = typeof guildConfigs.$inferSelect;

export const payoutRequests = pgTable("payout_requests", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  guildId: text("guild_id").notNull(),
  userId: text("user_id").notNull(),
  requestedById: text("requested_by_id").notNull(),
  reason: text("reason").notNull(),
  moneyOwed: text("money_owed").notNull(),
  email: text("email").notNull(),
  status: text("status").notNull().default("pending"),
  messageId: text("message_id"),
  actionedById: text("actioned_by_id"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
});

export const insertPayoutRequestSchema = createInsertSchema(payoutRequests).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});

export type InsertPayoutRequest = z.infer<typeof insertPayoutRequestSchema>;
export type PayoutRequest = typeof payoutRequests.$inferSelect;
