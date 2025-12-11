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
  playerRosterMessageId: text("player_roster_message_id"),
  playerRosterChannelId: text("player_roster_channel_id"),
  staffRosterMessageId: text("staff_roster_message_id"),
  staffRosterChannelId: text("staff_roster_channel_id"),
  banChannelId: text("ban_channel_id"),
  unbanChannelId: text("unban_channel_id"),
  banLogChannelId: text("ban_log_channel_id"),
  unbanLogChannelId: text("unban_log_channel_id"),
  modRoleIds: text("mod_role_ids").array(),
  staffIntroChannelId: text("staff_intro_channel_id"),
  staffIntroSubmissionsChannelId: text("staff_intro_submissions_channel_id"),
  staffIntroEmbedTitle: text("staff_intro_embed_title"),
  staffIntroEmbedDescription: text("staff_intro_embed_description"),
  inactivityChannelId: text("inactivity_channel_id"),
  inactivitySubmissionsChannelId: text("inactivity_submissions_channel_id"),
  inactivityLogChannelId: text("inactivity_log_channel_id"),
  quizQuestion1: text("quiz_question_1"),
  quizQuestion2: text("quiz_question_2"),
  quizQuestion3: text("quiz_question_3"),
  quizQuestion3Options: text("quiz_question_3_options"),
  quizQuestion4: text("quiz_question_4"),
  quizQuestion5: text("quiz_question_5"),
  quizQuestion5Options: text("quiz_question_5_options"),
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

export const roleSyncPairs = pgTable("role_sync_pairs", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  sourceGuildId: text("source_guild_id").notNull(),
  sourceRoleId: text("source_role_id").notNull(),
  targetGuildId: text("target_guild_id").notNull(),
  targetRoleId: text("target_role_id").notNull(),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

export const insertRoleSyncPairSchema = createInsertSchema(roleSyncPairs).omit({
  id: true,
  createdAt: true,
});

export type InsertRoleSyncPair = z.infer<typeof insertRoleSyncPairSchema>;
export type RoleSyncPair = typeof roleSyncPairs.$inferSelect;

export const banRequests = pgTable("ban_requests", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  guildId: text("guild_id").notNull(),
  targetUserId: text("target_user_id").notNull(),
  requestedById: text("requested_by_id").notNull(),
  reason: text("reason").notNull(),
  status: text("status").notNull().default("pending"),
  messageId: text("message_id"),
  reviewedById: text("reviewed_by_id"),
  reviewReason: text("review_reason"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
});

export const insertBanRequestSchema = createInsertSchema(banRequests).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});

export type InsertBanRequest = z.infer<typeof insertBanRequestSchema>;
export type BanRequest = typeof banRequests.$inferSelect;

export const unbanRequests = pgTable("unban_requests", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  guildId: text("guild_id").notNull(),
  targetUserId: text("target_user_id").notNull(),
  requestedById: text("requested_by_id").notNull(),
  reason: text("reason").notNull(),
  status: text("status").notNull().default("pending"),
  messageId: text("message_id"),
  reviewedById: text("reviewed_by_id"),
  reviewReason: text("review_reason"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
});

export const insertUnbanRequestSchema = createInsertSchema(unbanRequests).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});

export type InsertUnbanRequest = z.infer<typeof insertUnbanRequestSchema>;
export type UnbanRequest = typeof unbanRequests.$inferSelect;

export const staffIntroSubmissions = pgTable("staff_intro_submissions", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  guildId: text("guild_id").notNull(),
  userId: text("user_id").notNull(),
  answer1: text("answer_1").notNull(),
  answer2: text("answer_2").notNull(),
  answer3: text("answer_3").notNull(),
  answer4: text("answer_4").notNull(),
  answer5: text("answer_5").notNull(),
  status: text("status").notNull().default("pending"),
  messageId: text("message_id"),
  reviewedById: text("reviewed_by_id"),
  reviewReason: text("review_reason"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
});

export const insertStaffIntroSubmissionSchema = createInsertSchema(staffIntroSubmissions).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});

export type InsertStaffIntroSubmission = z.infer<typeof insertStaffIntroSubmissionSchema>;
export type StaffIntroSubmission = typeof staffIntroSubmissions.$inferSelect;

export const inactivityRequests = pgTable("inactivity_requests", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  guildId: text("guild_id").notNull(),
  userId: text("user_id").notNull(),
  fromDate: text("from_date").notNull(),
  toDate: text("to_date").notNull(),
  reason: text("reason").notNull(),
  status: text("status").notNull().default("pending"),
  messageId: text("message_id"),
  reviewedById: text("reviewed_by_id"),
  reviewReason: text("review_reason"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
});

export const insertInactivityRequestSchema = createInsertSchema(inactivityRequests).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});

export type InsertInactivityRequest = z.infer<typeof insertInactivityRequestSchema>;
export type InactivityRequest = typeof inactivityRequests.$inferSelect;
