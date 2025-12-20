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
  inactivityPingRoleIds: text("inactivity_ping_role_ids").array(),
  inactivityEmbedTitle: text("inactivity_embed_title"),
  inactivityEmbedDescription: text("inactivity_embed_description"),
  quizQuestion1: text("quiz_question_1"),
  quizQuestion2: text("quiz_question_2"),
  quizQuestion3: text("quiz_question_3"),
  quizQuestion3Options: text("quiz_question_3_options"),
  quizQuestion4: text("quiz_question_4"),
  quizQuestion5: text("quiz_question_5"),
  quizQuestion5Options: text("quiz_question_5_options"),
  modmailCategoryId: text("modmail_category_id"),
  modmailLogChannelId: text("modmail_log_channel_id"),
  modmailStaffRoleIds: text("modmail_staff_role_ids").array(),
  modmailBlockRoleIds: text("modmail_block_role_ids").array(),
  modmailClaimRoleIds: text("modmail_claim_role_ids").array(),
  activityResetRoleIds: text("activity_reset_role_ids").array(),
  modmailEmbedTitle: text("modmail_embed_title"),
  modmailEmbedDescription: text("modmail_embed_description"),
  categoryPingGeneral: text("category_ping_general").array(),
  categoryPingCompetitive: text("category_ping_competitive").array(),
  categoryPingContentcreator: text("category_ping_contentcreator").array(),
  categoryPingReport: text("category_ping_report").array(),
  categoryPingPartnerships: text("category_ping_partnerships").array(),
  categoryPingGfx: text("category_ping_gfx").array(),
  categoryPingCreativewarrior: text("category_ping_creativewarrior").array(),
  categoryPingVfxeditor: text("category_ping_vfxeditor").array(),
  customModmailCategories: text("custom_modmail_categories"), // JSON array of {id, label, description, emoji}
  commandPrefix: text("command_prefix").default("."),
  commandLogChannelId: text("command_log_channel_id"),
  // Appeal system config
  appealCategoryId: text("appeal_category_id"),
  appealLogChannelId: text("appeal_log_channel_id"),
  appealStaffRoleIds: text("appeal_staff_role_ids").array(),
  appealEmbedTitle: text("appeal_embed_title"),
  appealEmbedDescription: text("appeal_embed_description"),
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

export const modmailThreads = pgTable("modmail_threads", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  guildId: text("guild_id").notNull(),
  userId: text("user_id").notNull(),
  channelId: text("channel_id"),
  status: text("status").notNull().default("open"),
  category: text("category"), // ticket category: general, competitive, contentcreator, report, partnerships, gfx, creativewarrior, vfxeditor
  claimedById: text("claimed_by_id"),
  closedById: text("closed_by_id"),
  closeReason: text("close_reason"),
  subscribedUserIds: text("subscribed_user_ids").array().default([]),
  ignoreInactivity: text("ignore_inactivity").default("false"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  closedAt: timestamp("closed_at"),
});

export const insertModmailThreadSchema = createInsertSchema(modmailThreads).omit({
  id: true,
  createdAt: true,
});

export type InsertModmailThread = z.infer<typeof insertModmailThreadSchema>;
export type ModmailThread = typeof modmailThreads.$inferSelect;

export const modmailMessages = pgTable("modmail_messages", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  threadId: text("thread_id").notNull(),
  authorId: text("author_id").notNull(),
  content: text("content").notNull(),
  isStaff: text("is_staff").notNull().default("false"),
  channelMessageId: text("channel_message_id"),
  dmMessageId: text("dm_message_id"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

export const insertModmailMessageSchema = createInsertSchema(modmailMessages).omit({
  id: true,
  createdAt: true,
});

export type InsertModmailMessage = z.infer<typeof insertModmailMessageSchema>;
export type ModmailMessage = typeof modmailMessages.$inferSelect;

export const modmailBlocks = pgTable("modmail_blocks", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  guildId: text("guild_id").notNull(),
  userId: text("user_id").notNull(),
  blockedById: text("blocked_by_id").notNull(),
  reason: text("reason"),
  expiresAt: timestamp("expires_at"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

export const insertModmailBlockSchema = createInsertSchema(modmailBlocks).omit({
  id: true,
  createdAt: true,
});

export type InsertModmailBlock = z.infer<typeof insertModmailBlockSchema>;
export type ModmailBlock = typeof modmailBlocks.$inferSelect;

export const snippets = pgTable("snippets", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  guildId: text("guild_id").notNull(),
  alias: text("alias").notNull(),
  content: text("content").notNull(),
  createdById: text("created_by_id").notNull(),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
});

export const insertSnippetSchema = createInsertSchema(snippets).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});

export type InsertSnippet = z.infer<typeof insertSnippetSchema>;
export type Snippet = typeof snippets.$inferSelect;

export const activityResetBackups = pgTable("activity_reset_backups", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  guildId: text("guild_id").notNull(),
  resetById: text("reset_by_id").notNull(),
  category: text("category"),
  targetUserId: text("target_user_id"),
  banRequestsData: text("ban_requests_data"),
  unbanRequestsData: text("unban_requests_data"),
  modmailThreadsData: text("modmail_threads_data"),
  appealThreadsData: text("appeal_threads_data"),
  entryCount: text("entry_count").notNull(),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

export const insertActivityResetBackupSchema = createInsertSchema(activityResetBackups).omit({
  id: true,
  createdAt: true,
});

export type InsertActivityResetBackup = z.infer<typeof insertActivityResetBackupSchema>;
export type ActivityResetBackup = typeof activityResetBackups.$inferSelect;

// Appeal system tables (separate from modmail)
export const appealThreads = pgTable("appeal_threads", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  guildId: text("guild_id").notNull(),
  userId: text("user_id").notNull(),
  channelId: text("channel_id"),
  status: text("status").notNull().default("open"),
  claimedById: text("claimed_by_id"),
  closedById: text("closed_by_id"),
  closeReason: text("close_reason"),
  subscribedUserIds: text("subscribed_user_ids").array().default([]),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  closedAt: timestamp("closed_at"),
});

export const insertAppealThreadSchema = createInsertSchema(appealThreads).omit({
  id: true,
  createdAt: true,
});

export type InsertAppealThread = z.infer<typeof insertAppealThreadSchema>;
export type AppealThread = typeof appealThreads.$inferSelect;

export const appealMessages = pgTable("appeal_messages", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  threadId: text("thread_id").notNull(),
  authorId: text("author_id").notNull(),
  content: text("content").notNull(),
  isStaff: text("is_staff").notNull().default("false"),
  channelMessageId: text("channel_message_id"),
  dmMessageId: text("dm_message_id"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

export const insertAppealMessageSchema = createInsertSchema(appealMessages).omit({
  id: true,
  createdAt: true,
});

export type InsertAppealMessage = z.infer<typeof insertAppealMessageSchema>;
export type AppealMessage = typeof appealMessages.$inferSelect;

export const appealBlocks = pgTable("appeal_blocks", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  guildId: text("guild_id").notNull(),
  userId: text("user_id").notNull(),
  blockedById: text("blocked_by_id").notNull(),
  reason: text("reason"),
  expiresAt: timestamp("expires_at"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

export const insertAppealBlockSchema = createInsertSchema(appealBlocks).omit({
  id: true,
  createdAt: true,
});

export type InsertAppealBlock = z.infer<typeof insertAppealBlockSchema>;
export type AppealBlock = typeof appealBlocks.$inferSelect;

export const appealSnippets = pgTable("appeal_snippets", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  guildId: text("guild_id").notNull(),
  alias: text("alias").notNull(),
  content: text("content").notNull(),
  createdById: text("created_by_id").notNull(),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
});

export const insertAppealSnippetSchema = createInsertSchema(appealSnippets).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});

export type InsertAppealSnippet = z.infer<typeof insertAppealSnippetSchema>;
export type AppealSnippet = typeof appealSnippets.$inferSelect;
