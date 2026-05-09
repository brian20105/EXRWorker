import { 
  type GuildConfig, 
  type InsertGuildConfig, 
  type PayoutRequest,
  type InsertPayoutRequest,
  type RoleSyncPair,
  type InsertRoleSyncPair,
  type BanRequest,
  type InsertBanRequest,
  type UnbanRequest,
  type InsertUnbanRequest,
  type StaffIntroSubmission,
  type InsertStaffIntroSubmission,
  type InactivityRequest,
  type InsertInactivityRequest,
  type ModmailThread,
  type InsertModmailThread,
  type ModmailMessage,
  type InsertModmailMessage,
  type ModmailBlock,
  type InsertModmailBlock,
  type Snippet,
  type InsertSnippet,
  type ActivityResetBackup,
  type InsertActivityResetBackup,
  type AppealThread,
  type InsertAppealThread,
  type AppealMessage,
  type InsertAppealMessage,
  type AppealBlock,
  type InsertAppealBlock,
  type AppealSnippet,
  type InsertAppealSnippet,
  type ModerationAction,
  type InsertModerationAction,
  type InviteAttribution,
  type InsertInviteAttribution,
  type RosterConfig,
  type InsertRosterConfig,
  guildConfigs,
  moderationActions,
  payoutRequests,
  roleSyncPairs,
  banRequests,
  unbanRequests,
  staffIntroSubmissions,
  inactivityRequests,
  modmailThreads,
  modmailMessages,
  modmailBlocks,
  snippets,
  activityResetBackups,
  appealThreads,
  appealMessages,
  appealBlocks,
  appealSnippets,
  inviteAttributions,
  rosterConfigs
} from "@shared/schema";
import { db, withRetry, sqlEnabled } from "./sql";
import { randomUUID } from "crypto";
console.log("storage: db type:", typeof (db), "db.select:", typeof (db as any).select);
import { eq, and, desc, or, sql, gte, lte, count, inArray } from "drizzle-orm";

// MongoDB has been removed â€” using PostgreSQL/Neon only
async function getCollection(name: string): Promise<any | null> {
  return null;
}

// In-memory fallback storage (used when MongoDB is unreachable)
const inMemoryStore = {
  modmailThreads: new Map<string, any>(),
  modmailMessages: new Map<string, any>(),
  threadsByChannel: new Map<string, string>(), // channelId -> threadId
  guildConfigs: new Map<string, any>(), // guildId -> config
};

const GUILD_CONFIG_SQL_BACKOFF_MS = 15000;
let guildConfigSqlBackoffUntil = 0;

// Short-lived TTL cache so repeated calls within a single interaction hit memory instead of DB
const GUILD_CONFIG_CACHE_TTL_MS = 30_000;
const guildConfigCache = new Map<string, { config: any; expiresAt: number }>();

function getGuildConfigFromCache(guildId: string): any | undefined {
  const entry = guildConfigCache.get(guildId);
  if (entry && Date.now() < entry.expiresAt) return entry.config;
  guildConfigCache.delete(guildId);
  return undefined;
}

function setGuildConfigCache(guildId: string, config: any): void {
  guildConfigCache.set(guildId, { config, expiresAt: Date.now() + GUILD_CONFIG_CACHE_TTL_MS });
}

function invalidateGuildConfigCache(guildId: string): void {
  guildConfigCache.delete(guildId);
}

function normalizeScopeGuildIds(guildIds?: string[]): string[] {
  return Array.from(new Set((guildIds || []).map((entry) => String(entry || "").trim()).filter(Boolean)));
}

function addGuildScopeCondition(conditions: any[], column: any, guildIds?: string[]): void {
  const scopedGuildIds = normalizeScopeGuildIds(guildIds);
  if (scopedGuildIds.length > 0) {
    conditions.push(inArray(column, scopedGuildIds));
  }
}

function isTransientSqlError(err: any): boolean {
  const message = String(err?.message || "").toLowerCase();
  const code = String(err?.code || "").toUpperCase();
  return (
    code === "ECONNRESET" ||
    code === "ECONNREFUSED" ||
    code === "ETIMEDOUT" ||
    message.includes("read econnreset") ||
    message.includes("connection terminated") ||
    message.includes("timeout")
  );
}

export interface IStorage {
  getGuildConfig(guildId: string): Promise<GuildConfig | undefined>;
  upsertGuildConfig(config: InsertGuildConfig): Promise<GuildConfig>;
  updateRequestChannel(guildId: string, channelId: string): Promise<GuildConfig>;
  updateLogChannel(guildId: string, channelId: string): Promise<GuildConfig>;
  updateAllowedRoles(guildId: string, roleIds: string[]): Promise<GuildConfig>;
  createPayoutRequest(request: InsertPayoutRequest): Promise<PayoutRequest>;
  getPayoutRequest(id: string): Promise<PayoutRequest | undefined>;
  getPayoutRequestByMessageId(messageId: string): Promise<PayoutRequest | undefined>;
  getPendingPayouts(guildId: string): Promise<PayoutRequest[]>;
  getAllPayouts(guildId: string): Promise<PayoutRequest[]>;
  getUserPayouts(guildId: string, userId: string): Promise<PayoutRequest[]>;
  getUserPendingPayouts(guildId: string, userId: string): Promise<PayoutRequest[]>;
  updatePayoutStatus(id: string, status: string, actionedById: string): Promise<PayoutRequest>;
  updatePayoutMessageId(id: string, messageId: string): Promise<void>;
  updatePayoutRequest(id: string, updates: { moneyOwed?: string; email?: string; reason?: string; status?: string }): Promise<PayoutRequest>;
  deletePayoutRequest(id: string): Promise<void>;
  deleteAllPayouts(guildId: string): Promise<number>;
  deleteUserPayouts(guildId: string, userId: string): Promise<number>;
  getAllRoleSyncPairs(): Promise<RoleSyncPair[]>;
  addRoleSyncPair(pair: InsertRoleSyncPair): Promise<RoleSyncPair>;
  removeRoleSyncPair(id: string): Promise<void>;
  getRoleSyncPairsByGuild(guildId: string): Promise<RoleSyncPair[]>;
  createBanRequest(request: InsertBanRequest): Promise<BanRequest>;
  getBanRequest(id: string): Promise<BanRequest | undefined>;
  updateBanRequest(id: string, updates: { status?: string; reviewedById?: string; reviewReason?: string; messageId?: string }): Promise<BanRequest>;
  getAllBanRequests(guildId: string): Promise<BanRequest[]>;
  createUnbanRequest(request: InsertUnbanRequest): Promise<UnbanRequest>;
  getUnbanRequest(id: string): Promise<UnbanRequest | undefined>;
  updateUnbanRequest(id: string, updates: { status?: string; reviewedById?: string; reviewReason?: string; messageId?: string }): Promise<UnbanRequest>;
  getAllUnbanRequests(guildId: string): Promise<UnbanRequest[]>;
  getActivityStats(guildId: string, category: string, fromDays?: number, toDays?: number): Promise<{ userId: string; count: number }[]>;
  getInviteStats(guildId: string, fromDays?: number, toDays?: number): Promise<{ userId: string; count: number }[]>;
  removeActivityEntries(guildId: string, userId: string, category: string, amount: number): Promise<number>;
  addInviteActivityEntries(guildId: string, userId: string, amount: number): Promise<void>;
  removeInviteActivityEntries(guildId: string, userId: string, amount: number): Promise<number>;
  createInviteAttribution(attribution: InsertInviteAttribution): Promise<InviteAttribution>;
  getInviteAttributionsByGuild(guildId: string): Promise<InviteAttribution[]>;
  getInviteAttributionByInvitedUser(guildId: string, invitedUserId: string): Promise<InviteAttribution | undefined>;
  removeInviteAttribution(guildId: string, invitedUserId: string): Promise<number>;
  createStaffIntroSubmission(submission: InsertStaffIntroSubmission): Promise<StaffIntroSubmission>;
  getStaffIntroSubmission(id: string): Promise<StaffIntroSubmission | undefined>;
  updateStaffIntroSubmission(id: string, updates: { status?: string; reviewedById?: string; reviewReason?: string; messageId?: string }): Promise<StaffIntroSubmission>;

  createInactivityRequest(request: InsertInactivityRequest): Promise<InactivityRequest>;
  getInactivityRequest(id: string): Promise<InactivityRequest | undefined>;
  getInactivityRequestsByGuild(guildId: string): Promise<InactivityRequest[]>;
  updateInactivityRequest(id: string, updates: { status?: string; reviewedById?: string; reviewReason?: string; messageId?: string }): Promise<InactivityRequest>;
  deleteInactivityRequest(id: string): Promise<void>;

  createModmailThread(thread: InsertModmailThread): Promise<ModmailThread>;
  getModmailThread(id: string): Promise<ModmailThread | undefined>;
  getOpenModmailThread(guildId: string, userId: string): Promise<ModmailThread | undefined>;
  getOpenModmailThreadByUserId(userId: string): Promise<ModmailThread | undefined>;
  getOpenModmailThreadByAddedMember(userId: string): Promise<ModmailThread | undefined>;
  getModmailThreadByChannel(channelId: string): Promise<ModmailThread | undefined>;
  updateModmailThread(id: string, updates: { status?: string; claimedById?: string | null; closedById?: string; closeReason?: string; channelId?: string; closedAt?: Date; subscribedUserIds?: string[]; addedMemberIds?: string[]; ignoreInactivity?: string }): Promise<ModmailThread>;
  getAllModmailThreads(guildId: string): Promise<ModmailThread[]>;
  getAllModmailThreadsByUser(userId: string): Promise<ModmailThread[]>;

  addModmailMessage(message: InsertModmailMessage): Promise<ModmailMessage>;
  getModmailMessages(threadId: string): Promise<ModmailMessage[]>;
  getModmailMessage(id: string): Promise<ModmailMessage | undefined>;
  getModmailMessageByChannelMessageId(channelMessageId: string): Promise<ModmailMessage | undefined>;
  getModmailMessageByDmMessageId(dmMessageId: string): Promise<ModmailMessage | undefined>;
  updateModmailMessage(id: string, updates: { content?: string; channelMessageId?: string; dmMessageId?: string }): Promise<ModmailMessage | undefined>;
  deleteModmailMessage(id: string): Promise<void>;
  getLatestStaffModmailMessage(threadId: string): Promise<ModmailMessage | undefined>;
  getLatestStaffRelayModmailMessage(threadId: string): Promise<ModmailMessage | undefined>;
  getModmailStats(guildId: string, fromDays?: number, toDays?: number): Promise<{ userId: string; count: number }[]>;
  getModmailStatsByCategory(guildId: string, fromDays?: number, toDays?: number): Promise<{ category: string; count: number }[]>;
  getActivityStatsForUser(guildId: string, userId: string, category: string, fromDays?: number, toDays?: number): Promise<number>;
  getModmailStatsForUser(guildId: string, userId: string, fromDays?: number, toDays?: number): Promise<number>;
  getModmailStatsByCategoryForUser(guildId: string, userId: string, fromDays?: number, toDays?: number): Promise<{ category: string; count: number }[]>;

  // Cross-server activity stats (aggregates from linked/shared servers when a scope list is provided)
  getActivityStatsForUserAllGuilds(userId: string, category: string, fromDays?: number, toDays?: number, scopeGuildIds?: string[]): Promise<number>;
  getInviteStatsForUser(guildId: string, userId: string, fromDays?: number, toDays?: number): Promise<number>;
  getInviteStatsForUserAllGuilds(userId: string, fromDays?: number, toDays?: number, scopeGuildIds?: string[]): Promise<number>;
  getModmailStatsForUserAllGuilds(userId: string, fromDays?: number, toDays?: number, scopeGuildIds?: string[]): Promise<number>;
  getModmailStatsByCategoryForUserAllGuilds(userId: string, fromDays?: number, toDays?: number, scopeGuildIds?: string[]): Promise<{ category: string; count: number }[]>;
  getAppealStatsForUserAllGuilds(userId: string, fromDays?: number, toDays?: number, scopeGuildIds?: string[]): Promise<number>;
  getStaffReportStatsForUser(guildId: string, userId: string, fromDays?: number, toDays?: number): Promise<number>;
  getStaffReportStatsForUserAllGuilds(userId: string, fromDays?: number, toDays?: number, scopeGuildIds?: string[]): Promise<number>;
  getAllGuildsActivityStats(fromDays?: number, toDays?: number, scopeGuildIds?: string[]): Promise<{ userId: string; count: number }[]>;
  getAllGuildsBanStats(fromDays?: number, toDays?: number, scopeGuildIds?: string[]): Promise<{ userId: string; count: number }[]>;
  getAllGuildsUnbanStats(fromDays?: number, toDays?: number, scopeGuildIds?: string[]): Promise<{ userId: string; count: number }[]>;
  getAllGuildsInviteStats(fromDays?: number, toDays?: number, scopeGuildIds?: string[]): Promise<{ userId: string; count: number }[]>;
  getAllGuildsModmailStats(fromDays?: number, toDays?: number, scopeGuildIds?: string[]): Promise<{ userId: string; count: number }[]>;
  getAllGuildsAppealStats(fromDays?: number, toDays?: number, scopeGuildIds?: string[]): Promise<{ userId: string; count: number }[]>;

  createModmailBlock(block: InsertModmailBlock): Promise<ModmailBlock>;
  getActiveModmailBlock(guildId: string, userId: string): Promise<ModmailBlock | undefined>;
  removeModmailBlock(guildId: string, userId: string): Promise<void>;
  getAllModmailBlocks(guildId: string): Promise<ModmailBlock[]>;
  getAllModmailBlocksGlobal(): Promise<ModmailBlock[]>;

  createSnippet(snippet: InsertSnippet): Promise<Snippet>;
  getSnippet(guildId: string, alias: string): Promise<Snippet | undefined>;
  updateSnippet(guildId: string, alias: string, content: string): Promise<Snippet | undefined>;
  deleteSnippet(guildId: string, alias: string): Promise<void>;
  getAllSnippets(guildId: string): Promise<Snippet[]>;

  addModmailActivityEntries(guildId: string, userId: string, amount: number): Promise<void>;
  removeModmailActivityEntries(guildId: string, userId: string, amount: number): Promise<number>;
  addAppealActivityEntries(guildId: string, userId: string, amount: number): Promise<void>;
  removeAppealActivityEntries(guildId: string, userId: string, amount: number): Promise<number>;
  addModerationActivityEntries(guildId: string, userId: string, category: "modban" | "kick" | "mute", amount: number): Promise<void>;
  removeModerationActivityEntries(guildId: string, userId: string, category: "modban" | "kick" | "mute", amount: number): Promise<number>;
  getAppealStats(guildId: string, fromDays?: number, toDays?: number): Promise<{ userId: string; count: number }[]>;
  getAppealStatsForUser(guildId: string, userId: string, fromDays?: number, toDays?: number): Promise<number>;
  resetActivityStats(guildId: string, resetById: string, category?: string, userId?: string): Promise<number>;
  getLatestActivityResetBackup(guildId: string): Promise<ActivityResetBackup | undefined>;
  restoreActivityStats(guildId: string): Promise<number>;
  deleteActivityResetBackup(id: string): Promise<void>;

  // Appeal system methods
  createAppealThread(thread: InsertAppealThread): Promise<AppealThread>;
  getAppealThread(id: string): Promise<AppealThread | undefined>;
  getOpenAppealThread(guildId: string, userId: string): Promise<AppealThread | undefined>;
  getAppealThreadByChannel(channelId: string): Promise<AppealThread | undefined>;
  updateAppealThread(id: string, updates: { status?: string; claimedById?: string | null; closedById?: string; closeReason?: string; channelId?: string; closedAt?: Date; subscribedUserIds?: string[]; addedMemberIds?: string[] }): Promise<AppealThread>;
  getAllAppealThreads(guildId: string): Promise<AppealThread[]>;
  getAllAppealThreadsByUser(userId: string): Promise<AppealThread[]>;

  addAppealMessage(message: InsertAppealMessage): Promise<AppealMessage>;
  getAppealMessages(threadId: string): Promise<AppealMessage[]>;
  getAppealMessage(id: string): Promise<AppealMessage | undefined>;
  getAppealMessageByChannelMessageId(channelMessageId: string): Promise<AppealMessage | undefined>;
  updateAppealMessage(id: string, updates: { content?: string; channelMessageId?: string; dmMessageId?: string }): Promise<AppealMessage | undefined>;
  deleteAppealMessage(id: string): Promise<void>;
  getLatestStaffAppealMessage(threadId: string): Promise<AppealMessage | undefined>;
  getLatestStaffRelayAppealMessage(threadId: string): Promise<AppealMessage | undefined>;

  createAppealBlock(block: InsertAppealBlock): Promise<AppealBlock>;
  getActiveAppealBlock(guildId: string, userId: string): Promise<AppealBlock | undefined>;
  removeAppealBlock(guildId: string, userId: string): Promise<void>;
  getAllAppealBlocks(guildId: string): Promise<AppealBlock[]>;
  getAllAppealBlocksGlobal(): Promise<AppealBlock[]>;

  createAppealSnippet(snippet: InsertAppealSnippet): Promise<AppealSnippet>;
  getAppealSnippet(guildId: string, alias: string): Promise<AppealSnippet | undefined>;
  updateAppealSnippet(guildId: string, alias: string, content: string): Promise<AppealSnippet | undefined>;
  deleteAppealSnippet(guildId: string, alias: string): Promise<void>;
  getAllAppealSnippets(guildId: string): Promise<AppealSnippet[]>;

  // Moderation actions tracking
  createModerationAction(action: InsertModerationAction): Promise<ModerationAction>;
  getModerationStats(guildId: string, fromDays?: number, toDays?: number): Promise<{ moderatorId: string; warns: number; mutes: number; unmutes: number; kicks: number; bans: number; unbans: number }[]>;
  getModerationActionExists(guildId: string, sourceMessageId: string): Promise<boolean>;
  getModerationActionsByGuild(guildId: string): Promise<ModerationAction[]>;
  getModerationActionsByTarget(guildId: string, targetId: string): Promise<ModerationAction[]>;
  getAllModerationActions(): Promise<ModerationAction[]>;
  getAllModerationActionsByTarget(targetId: string): Promise<ModerationAction[]>;
  updateModerationAction(id: string, updates: { reason?: string | null }): Promise<ModerationAction | undefined>;
  deleteModerationAction(id: string): Promise<void>;

  // Roster management
  createRosterConfig(roster: InsertRosterConfig): Promise<RosterConfig>;
  getRosterConfig(guildId: string, name: string): Promise<RosterConfig | undefined>;
  updateRosterConfig(guildId: string, name: string, updates: { roleIds?: string[]; messageId?: string; channelId?: string }): Promise<RosterConfig | undefined>;
  deleteRosterConfig(guildId: string, name: string): Promise<void>;
  getAllRosterConfigs(guildId: string): Promise<RosterConfig[]>;
}

export class DatabaseStorage implements IStorage {
  async getGuildConfig(guildId: string): Promise<GuildConfig | undefined> {
    // Serve from TTL cache first to avoid repeated DB round-trips within the same interaction
    const cached = getGuildConfigFromCache(guildId);
    if (cached !== undefined) return cached;

    const memoryConfig = inMemoryStore.guildConfigs.get(guildId);

    if (Date.now() < guildConfigSqlBackoffUntil) {
      return memoryConfig;
    }

    try {
      const result = await withRetry(
        async () => {
          return await db
            .select()
            .from(guildConfigs)
            .where(eq(guildConfigs.guildId, guildId))
            .limit(1);
        },
        3,
        350,
      );
      if (result && result.length > 0) {
        inMemoryStore.guildConfigs.set(guildId, result[0]);
        setGuildConfigCache(guildId, result[0]);
        return result[0];
      }
      guildConfigSqlBackoffUntil = 0;
    } catch (err: any) {
      console.log('[storage] getGuildConfig SQL error:', err?.message || err);
      if (isTransientSqlError(err)) {
        guildConfigSqlBackoffUntil = Date.now() + GUILD_CONFIG_SQL_BACKOFF_MS;
      }
      return memoryConfig;
    }
    // Fall back to in-memory
    return memoryConfig;
  }

  async upsertGuildConfig(config: InsertGuildConfig): Promise<GuildConfig> {
    try {
      const existing = await this.getGuildConfig(config.guildId);

      if (existing) {
        const updated = await db
          .update(guildConfigs)
          .set({ ...config, updatedAt: new Date() })
          .where(eq(guildConfigs.guildId, config.guildId))
          .returning();
        if (updated && updated.length > 0) {
          inMemoryStore.guildConfigs.set(config.guildId, updated[0]);
          setGuildConfigCache(config.guildId, updated[0]);
          return updated[0];
        }
      } else {
        const inserted = await db.insert(guildConfigs).values(config).returning();
        if (inserted && inserted.length > 0) {
          inMemoryStore.guildConfigs.set(config.guildId, inserted[0]);
          setGuildConfigCache(config.guildId, inserted[0]);
          return inserted[0];
        }
      }
    } catch (err: any) {
      console.log('[storage] upsertGuildConfig SQL error:', err?.message || err);
    }
    // Fall back to in-memory, merging with existing config
    const existing = inMemoryStore.guildConfigs.get(config.guildId);
    const fullConfig = { ...existing, ...config, updatedAt: new Date() } as GuildConfig;
    inMemoryStore.guildConfigs.set(config.guildId, fullConfig);
    invalidateGuildConfigCache(config.guildId);
    return fullConfig;
  }

  async updateRequestChannel(guildId: string, channelId: string): Promise<GuildConfig> {
    return this.upsertGuildConfig({
      guildId,
      requestChannelId: channelId,
    });
  }

  async updateLogChannel(guildId: string, channelId: string): Promise<GuildConfig> {
    return this.upsertGuildConfig({
      guildId,
      logChannelId: channelId,
    });
  }

  async updateAllowedRoles(guildId: string, roleIds: string[]): Promise<GuildConfig> {
    return this.upsertGuildConfig({
      guildId,
      allowedRoleIds: roleIds,
    });
  }

  async createPayoutRequest(request: InsertPayoutRequest): Promise<PayoutRequest> {
    const result = await db.insert(payoutRequests).values(request).returning();
    return result[0];
  }

  async getPayoutRequest(id: string): Promise<PayoutRequest | undefined> {
    const result = await db
      .select()
      .from(payoutRequests)
      .where(eq(payoutRequests.id, id))
      .limit(1);
    return result[0];
  }

  async getPayoutRequestByMessageId(messageId: string): Promise<PayoutRequest | undefined> {
    const result = await db
      .select()
      .from(payoutRequests)
      .where(eq(payoutRequests.messageId, messageId))
      .limit(1);
    return result[0];
  }

  async getPendingPayouts(guildId: string): Promise<PayoutRequest[]> {
    return db
      .select()
      .from(payoutRequests)
      .where(and(
        eq(payoutRequests.guildId, guildId),
        eq(payoutRequests.status, "pending")
      ));
  }

  async getAllPayouts(guildId: string): Promise<PayoutRequest[]> {
    return withRetry(async () => {
      return db
        .select()
        .from(payoutRequests)
        .where(eq(payoutRequests.guildId, guildId))
        .orderBy(desc(payoutRequests.createdAt));
    });
  }

  async getUserPayouts(guildId: string, userId: string): Promise<PayoutRequest[]> {
    return db
      .select()
      .from(payoutRequests)
      .where(and(
        eq(payoutRequests.guildId, guildId),
        eq(payoutRequests.userId, userId)
      ));
  }

  async getUserPendingPayouts(guildId: string, userId: string): Promise<PayoutRequest[]> {
    return db
      .select()
      .from(payoutRequests)
      .where(and(
        eq(payoutRequests.guildId, guildId),
        eq(payoutRequests.userId, userId),
        eq(payoutRequests.status, "pending")
      ));
  }

  async updatePayoutStatus(id: string, status: string, actionedById: string): Promise<PayoutRequest> {
    const result = await db
      .update(payoutRequests)
      .set({ status, actionedById, updatedAt: new Date() })
      .where(eq(payoutRequests.id, id))
      .returning();
    return result[0];
  }

  async updatePayoutMessageId(id: string, messageId: string): Promise<void> {
    await db
      .update(payoutRequests)
      .set({ messageId })
      .where(eq(payoutRequests.id, id));
  }

  async updatePayoutRequest(id: string, updates: { moneyOwed?: string; email?: string; reason?: string; status?: string }): Promise<PayoutRequest> {
    const result = await db
      .update(payoutRequests)
      .set({ ...updates, updatedAt: new Date() })
      .where(eq(payoutRequests.id, id))
      .returning();
    return result[0];
  }

  async deletePayoutRequest(id: string): Promise<void> {
    await db
      .delete(payoutRequests)
      .where(eq(payoutRequests.id, id));
  }

  async deleteAllPayouts(guildId: string): Promise<number> {
    const payouts = await this.getAllPayouts(guildId);
    await db
      .delete(payoutRequests)
      .where(eq(payoutRequests.guildId, guildId));
    return payouts.length;
  }

  async deleteUserPayouts(guildId: string, userId: string): Promise<number> {
    const payouts = await this.getUserPayouts(guildId, userId);
    await db
      .delete(payoutRequests)
      .where(and(
        eq(payoutRequests.guildId, guildId),
        eq(payoutRequests.userId, userId)
      ));
    return payouts.length;
  }

  async getAllRoleSyncPairs(): Promise<RoleSyncPair[]> {
    return await db.select().from(roleSyncPairs);
  }

  async addRoleSyncPair(pair: InsertRoleSyncPair): Promise<RoleSyncPair> {
    const result = await db.insert(roleSyncPairs).values(pair).returning();
    return result[0];
  }

  async removeRoleSyncPair(id: string): Promise<void> {
    await db.delete(roleSyncPairs).where(eq(roleSyncPairs.id, id));
  }

  async getRoleSyncPairsByGuild(guildId: string): Promise<RoleSyncPair[]> {
    return await db
      .select()
      .from(roleSyncPairs)
      .where(
        or(
          eq(roleSyncPairs.sourceGuildId, guildId),
          eq(roleSyncPairs.targetGuildId, guildId)
        )
      );
  }

  async createBanRequest(request: InsertBanRequest): Promise<BanRequest> {
    const result = await db.insert(banRequests).values(request).returning();
    return result[0];
  }

  async getBanRequest(id: string): Promise<BanRequest | undefined> {
    const result = await db.select().from(banRequests).where(eq(banRequests.id, id));
    return result[0];
  }

  async updateBanRequest(id: string, updates: { status?: string; reviewedById?: string; reviewReason?: string; messageId?: string }): Promise<BanRequest> {
    const result = await db.update(banRequests).set({ ...updates, updatedAt: new Date() }).where(eq(banRequests.id, id)).returning();
    return result[0];
  }

  async getAllBanRequests(guildId: string): Promise<BanRequest[]> {
    return await db.select().from(banRequests).where(eq(banRequests.guildId, guildId)).orderBy(desc(banRequests.createdAt));
  }

  async createUnbanRequest(request: InsertUnbanRequest): Promise<UnbanRequest> {
    const result = await db.insert(unbanRequests).values(request).returning();
    return result[0];
  }

  async getUnbanRequest(id: string): Promise<UnbanRequest | undefined> {
    const result = await db.select().from(unbanRequests).where(eq(unbanRequests.id, id));
    return result[0];
  }

  async updateUnbanRequest(id: string, updates: { status?: string; reviewedById?: string; reviewReason?: string; messageId?: string }): Promise<UnbanRequest> {
    const result = await db.update(unbanRequests).set({ ...updates, updatedAt: new Date() }).where(eq(unbanRequests.id, id)).returning();
    return result[0];
  }

  async getAllUnbanRequests(guildId: string): Promise<UnbanRequest[]> {
    return await db.select().from(unbanRequests).where(eq(unbanRequests.guildId, guildId)).orderBy(desc(unbanRequests.createdAt));
  }

  async getActivityStats(guildId: string, category: string, fromDays?: number, toDays?: number): Promise<{ userId: string; count: number }[]> {
    if (category === "invites") {
      return this.getInviteStats(guildId, fromDays, toDays);
    }

    const table = category === "ban" ? banRequests : unbanRequests;
    let requests = await db.select().from(table).where(eq(table.guildId, guildId));

    const now = new Date();
    if (fromDays !== undefined) {
      const fromDate = new Date(now.getTime() - fromDays * 24 * 60 * 60 * 1000);
      requests = requests.filter((r: any) => r.createdAt >= fromDate);
    }
    if (toDays !== undefined) {
      const toDate = new Date(now.getTime() - toDays * 24 * 60 * 60 * 1000);
      requests = requests.filter((r: any) => r.createdAt <= toDate);
    }

    const counts: { [userId: string]: number } = {};
    for (const r of requests as any[]) {
      // Filter out placeholder entries like staff_report_entry and manual_entry
      if (r.reviewedById && r.status !== "pending" && r.reviewedById !== "staff_report_entry" && r.reviewedById !== "manual_entry") {
        counts[r.reviewedById] = (counts[r.reviewedById] || 0) + 1;
      }
    }

    return Object.entries(counts)
      .map(([userId, count]) => ({ userId, count }))
      .sort((a, b) => b.count - a.count);
  }

  async getInviteStats(guildId: string, fromDays?: number, toDays?: number): Promise<{ userId: string; count: number }[]> {
    let attributions = await db.select().from(inviteAttributions).where(eq(inviteAttributions.guildId, guildId));

    const now = new Date();
    if (fromDays !== undefined) {
      const fromDate = new Date(now.getTime() - fromDays * 24 * 60 * 60 * 1000);
      attributions = attributions.filter((a: any) => a.createdAt >= fromDate);
    }
    if (toDays !== undefined) {
      const toDate = new Date(now.getTime() - toDays * 24 * 60 * 60 * 1000);
      attributions = attributions.filter((a: any) => a.createdAt <= toDate);
    }

    const counts: { [userId: string]: number } = {};
    for (const a of attributions as any[]) {
      if (a.inviterId && a.inviterId !== "manual_entry") {
        counts[a.inviterId] = (counts[a.inviterId] || 0) + 1;
      }
    }

    return Object.entries(counts)
      .map(([userId, count]) => ({ userId, count }))
      .sort((a, b) => b.count - a.count);
  }

  async removeActivityEntries(guildId: string, userId: string, category: string, amount: number): Promise<number> {
    if (category === "invites") {
      return this.removeInviteActivityEntries(guildId, userId, amount);
    }

    const table = category === "ban" ? banRequests : unbanRequests;
    const requests = await db.select().from(table)
      .where(and(eq(table.guildId, guildId), eq(table.reviewedById, userId)))
      .orderBy(desc(table.createdAt));

    const idsToDelete = requests.slice(0, amount).map((r: any) => r.id);
    const BATCH_SIZE = 100;
    for (let i = 0; i < idsToDelete.length; i += BATCH_SIZE) {
      const batch = idsToDelete.slice(i, i + BATCH_SIZE);
      await db.delete(table).where(inArray(table.id, batch));
    }
    return idsToDelete.length;
  }

  async addBanActivityEntries(guildId: string, userId: string, amount: number): Promise<void> {
    const BATCH_SIZE = 50;
    const batches = [];
    for (let i = 0; i < amount; i += BATCH_SIZE) {
      const batchSize = Math.min(BATCH_SIZE, amount - i);
      const entries = Array.from({ length: batchSize }, () => ({
        guildId,
        targetUserId: "manual_entry",
        requestedById: "manual_entry",
        reason: "Manual activity entry",
        status: "approved",
        reviewedById: userId,
        reviewReason: "Manual entry by admin",
      }));
      batches.push(db.insert(banRequests).values(entries));
    }
    await Promise.all(batches);
  }

  async addUnbanActivityEntries(guildId: string, userId: string, amount: number): Promise<void> {
    const BATCH_SIZE = 50;
    const batches = [];
    for (let i = 0; i < amount; i += BATCH_SIZE) {
      const batchSize = Math.min(BATCH_SIZE, amount - i);
      const entries = Array.from({ length: batchSize }, () => ({
        guildId,
        targetUserId: "manual_entry",
        requestedById: "manual_entry",
        reason: "Manual activity entry",
        status: "approved",
        reviewedById: userId,
        reviewReason: "Manual entry by admin",
      }));
      batches.push(db.insert(unbanRequests).values(entries));
    }
    await Promise.all(batches);
  }

  async addModerationActivityEntries(guildId: string, userId: string, category: "modban" | "kick" | "mute", amount: number): Promise<void> {
    const actionType = category === "modban" ? "ban" : category;
    const BATCH_SIZE = 50;
    const batches = [];
    for (let i = 0; i < amount; i += BATCH_SIZE) {
      const batchSize = Math.min(BATCH_SIZE, amount - i);
      const entries = Array.from({ length: batchSize }, () => ({
        guildId,
        moderatorId: userId,
        targetId: "manual_entry",
        actionType,
        reason: "Manual activity entry",
        sourceType: "manual",
        sourceMessageId: null,
      }));
      batches.push(db.insert(moderationActions).values(entries));
    }
    await Promise.all(batches);
  }

  async removeModerationActivityEntries(guildId: string, userId: string, category: "modban" | "kick" | "mute", amount: number): Promise<number> {
    const actionTypes = category === "modban"
      ? ["ban"]
      : category === "kick"
        ? ["kick"]
        : ["mute", "timeout"];

    const actions = await db.select({ id: moderationActions.id })
      .from(moderationActions)
      .where(and(
        eq(moderationActions.guildId, guildId),
        eq(moderationActions.moderatorId, userId),
        inArray(moderationActions.actionType, actionTypes)
      ))
      .orderBy(desc(moderationActions.createdAt));

    const idsToDelete = actions.slice(0, amount).map((r: any) => r.id);
    const BATCH_SIZE = 100;
    for (let i = 0; i < idsToDelete.length; i += BATCH_SIZE) {
      const batch = idsToDelete.slice(i, i + BATCH_SIZE);
      await db.delete(moderationActions).where(inArray(moderationActions.id, batch));
    }
    return idsToDelete.length;
  }

  async createStaffIntroSubmission(submission: InsertStaffIntroSubmission): Promise<StaffIntroSubmission> {
    const result = await db.insert(staffIntroSubmissions).values(submission).returning();
    return result[0];
  }

  async getStaffIntroSubmission(id: string): Promise<StaffIntroSubmission | undefined> {
    const result = await db.select().from(staffIntroSubmissions).where(eq(staffIntroSubmissions.id, id));
    return result[0];
  }

  async updateStaffIntroSubmission(id: string, updates: { status?: string; reviewedById?: string; reviewReason?: string; messageId?: string }): Promise<StaffIntroSubmission> {
    const result = await db.update(staffIntroSubmissions).set({ ...updates, updatedAt: new Date() }).where(eq(staffIntroSubmissions.id, id)).returning();
    return result[0];
  }

  async createInactivityRequest(request: InsertInactivityRequest): Promise<InactivityRequest> {
    const result = await db.insert(inactivityRequests).values(request).returning();
    return result[0];
  }

  async getInactivityRequest(id: string): Promise<InactivityRequest | undefined> {
    const result = await db.select().from(inactivityRequests).where(eq(inactivityRequests.id, id));
    return result[0];
  }

  async getInactivityRequestsByGuild(guildId: string): Promise<InactivityRequest[]> {
    return await db
      .select()
      .from(inactivityRequests)
      .where(eq(inactivityRequests.guildId, guildId))
      .orderBy(desc(inactivityRequests.updatedAt), desc(inactivityRequests.createdAt));
  }

  async updateInactivityRequest(id: string, updates: { status?: string; reviewedById?: string; reviewReason?: string; messageId?: string }): Promise<InactivityRequest> {
    const result = await db.update(inactivityRequests).set({ ...updates, updatedAt: new Date() }).where(eq(inactivityRequests.id, id)).returning();
    return result[0];
  }

  async deleteInactivityRequest(id: string): Promise<void> {
    await db.delete(inactivityRequests).where(eq(inactivityRequests.id, id));
  }

  async createModmailThread(thread: InsertModmailThread): Promise<ModmailThread> {
    try {
      const result = await db.insert(modmailThreads).values(thread).returning();
      return result[0];
    } catch (err: any) {
      console.log('[storage] createModmailThread error:', err?.message || err);
      const id = randomUUID();
      const doc = { id, ...thread, createdAt: new Date() } as any;
      inMemoryStore.modmailThreads.set(id, doc);
      if (doc.channelId) inMemoryStore.threadsByChannel.set(doc.channelId, id);
      return doc as ModmailThread;
    }
  }

  async getModmailThread(id: string): Promise<ModmailThread | undefined> {
    try {
      const result = await db.select().from(modmailThreads).where(eq(modmailThreads.id, id));
      return result[0];
    } catch (err: any) {
      console.log('[storage] getModmailThread error:', err?.message || err);
      return inMemoryStore.modmailThreads.get(id) || undefined;
    }
  }

  async getOpenModmailThread(guildId: string, userId: string): Promise<ModmailThread | undefined> {
    const result = await db.select().from(modmailThreads).where(
      and(
        eq(modmailThreads.guildId, guildId),
        eq(modmailThreads.userId, userId),
        eq(modmailThreads.status, "open")
      )
    );
    const thread = result[0];
    // If thread exists but channel ID is missing, it's likely stuck - treat as closed
    if (thread && !thread.channelId) {
      try {
        await db.update(modmailThreads).set({ status: "closed", closedAt: new Date() }).where(eq(modmailThreads.id, thread.id));
      } catch (e) {
        console.log('[storage] Error auto-closing thread without channel:', e);
      }
      return undefined;
    }
    return thread;
  }

  async getOpenModmailThreadByUserId(userId: string): Promise<ModmailThread | undefined> {
    const result = await db.select().from(modmailThreads).where(
      and(
        eq(modmailThreads.userId, userId),
        eq(modmailThreads.status, "open")
      )
    );
    return result[0];
  }

  async getOpenModmailThreadByAddedMember(userId: string): Promise<ModmailThread | undefined> {
    const result = await db.select().from(modmailThreads).where(
      and(
        sql`${userId} = ANY(${modmailThreads.addedMemberIds})`,
        eq(modmailThreads.status, "open")
      )
    );
    return result[0];
  }

  async getModmailThreadByChannel(channelId: string): Promise<ModmailThread | undefined> {
    try {
      if (sqlEnabled) {
        const result = await db.select().from(modmailThreads).where(eq(modmailThreads.channelId, channelId));
        return result[0];
      }
      // MongoDB support removed - return in-memory fallback
        const tid = inMemoryStore.threadsByChannel.get(channelId);
        if (!tid) return undefined;
        return inMemoryStore.modmailThreads.get(tid) || undefined;
    } catch (err: any) {
      console.log('[storage] getModmailThreadByChannel error:', err?.message || err);
      return undefined;
    }
  }

  async updateModmailThread(id: string, updates: { status?: string; claimedById?: string | null; closedById?: string; closeReason?: string; channelId?: string; closedAt?: Date; subscribedUserIds?: string[]; addedMemberIds?: string[]; ignoreInactivity?: string }): Promise<ModmailThread> {
    try {
      if (sqlEnabled) {
        const result = await db.update(modmailThreads).set(updates).where(eq(modmailThreads.id, id)).returning();
        return result[0];
      }
      // MongoDB support removed - using in-memory fallback only
      // update in-memory fallback if present
      const existing = inMemoryStore.modmailThreads.get(id);
      if (existing) {
        const updated = { ...existing, ...updates, updatedAt: new Date() };
        inMemoryStore.modmailThreads.set(id, updated);
        if (updated.channelId) inMemoryStore.threadsByChannel.set(updated.channelId, id);
        return updated as ModmailThread;
      }
      const best = { id, ...updates } as ModmailThread;
      return best;
    } catch (err: any) {
      console.log('[storage] updateModmailThread error:', err?.message || err);
      return { id, ...updates } as ModmailThread;
    }
  }

  async getAllModmailThreads(guildId: string): Promise<ModmailThread[]> {
    return await db.select().from(modmailThreads).where(eq(modmailThreads.guildId, guildId)).orderBy(desc(modmailThreads.createdAt));
  }

  async getAllModmailThreadsByUser(userId: string): Promise<ModmailThread[]> {
    return await db.select().from(modmailThreads).where(eq(modmailThreads.userId, userId)).orderBy(desc(modmailThreads.createdAt));
  }

  async addModmailMessage(message: InsertModmailMessage): Promise<ModmailMessage> {
    try {
      if (sqlEnabled) {
        const result = await db.insert(modmailMessages).values(message).returning();
        return result[0];
      }
      // MongoDB support removed - using in-memory fallback
      const id = randomUUID();
      const doc = { id, ...message, createdAt: new Date() } as any;
      inMemoryStore.modmailMessages.set(id, doc);
      return doc as ModmailMessage;
    } catch (err: any) {
      console.log('[storage] addModmailMessage error:', err?.message || err);
      const doc = { id: randomUUID(), ...message, createdAt: new Date() } as any;
      return doc as ModmailMessage;
    }
  }

  async getModmailMessages(threadId: string): Promise<ModmailMessage[]> {
    try {
      if (sqlEnabled) {
        return await db.select().from(modmailMessages).where(eq(modmailMessages.threadId, threadId)).orderBy(modmailMessages.createdAt);
      }
      // MongoDB support removed - return in-memory fallback
        const docs = Array.from(inMemoryStore.modmailMessages.values()).filter((d) => d.threadId === threadId);
        docs.sort((a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime());
        return docs as ModmailMessage[];
    } catch (err: any) {
      console.log('[storage] getModmailMessages error:', err?.message || err);
      return [];
    }
  }

  async getModmailMessage(id: string): Promise<ModmailMessage | undefined> {
    const result = await db.select().from(modmailMessages).where(eq(modmailMessages.id, id));
    return result[0];
  }

  async getModmailMessageByChannelMessageId(channelMessageId: string): Promise<ModmailMessage | undefined> {
    const result = await db.select().from(modmailMessages).where(eq(modmailMessages.channelMessageId, channelMessageId));
    return result[0];
  }

  async getModmailMessageByDmMessageId(dmMessageId: string): Promise<ModmailMessage | undefined> {
    const result = await db.select().from(modmailMessages).where(eq(modmailMessages.dmMessageId, dmMessageId));
    return result[0];
  }

  async updateModmailMessage(id: string, updates: { content?: string; channelMessageId?: string; dmMessageId?: string }): Promise<ModmailMessage | undefined> {
    const result = await db.update(modmailMessages).set(updates).where(eq(modmailMessages.id, id)).returning();
    return result[0];
  }

  async deleteModmailMessage(id: string): Promise<void> {
    await db.delete(modmailMessages).where(eq(modmailMessages.id, id));
  }

  async getLatestStaffModmailMessage(threadId: string): Promise<ModmailMessage | undefined> {
    const result = await db.select().from(modmailMessages).where(
      and(
        eq(modmailMessages.threadId, threadId),
        eq(modmailMessages.isStaff, "true")
      )
    ).orderBy(desc(modmailMessages.createdAt)).limit(1);
    return result[0];
  }

  async getLatestStaffRelayModmailMessage(threadId: string): Promise<ModmailMessage | undefined> {
    const result = await db.select().from(modmailMessages).where(
      and(
        eq(modmailMessages.threadId, threadId),
        eq(modmailMessages.isStaff, "true"),
        sql`${modmailMessages.dmMessageId} IS NOT NULL`
      )
    ).orderBy(desc(modmailMessages.createdAt)).limit(1);
    return result[0];
  }

  async getModmailStats(guildId: string, fromDays?: number, toDays?: number): Promise<{ userId: string; count: number }[]> {
    let threads = await db.select().from(modmailThreads).where(
      and(
        eq(modmailThreads.guildId, guildId),
        eq(modmailThreads.status, "closed")
      )
    );

    if (threads.length === 0) return [];

    const now = new Date();
    if (fromDays !== undefined) {
      const fromDate = new Date(now.getTime() - fromDays * 24 * 60 * 60 * 1000);
      threads = threads.filter((t: any) => t.closedAt && t.closedAt >= fromDate);
    }
    if (toDays !== undefined) {
      const toDate = new Date(now.getTime() - toDays * 24 * 60 * 60 * 1000);
      threads = threads.filter((t: any) => t.closedAt && t.closedAt <= toDate);
    }

    const counts: { [userId: string]: number } = {};
    for (const t of threads) {
      if (t.closedById) {
        counts[t.closedById] = (counts[t.closedById] || 0) + 1;
      }
    }

    return Object.entries(counts)
      .map(([userId, count]) => ({ userId, count }))
      .sort((a, b) => b.count - a.count);
  }

  async getModmailStatsByCategory(guildId: string, fromDays?: number, toDays?: number): Promise<{ category: string; count: number }[]> {
    try {
      let threads = await db.select().from(modmailThreads).where(
        and(
          eq(modmailThreads.guildId, guildId),
          eq(modmailThreads.status, "closed")
        )
      );

      if (threads.length === 0) return [];

      const now = new Date();
      if (fromDays !== undefined) {
        const fromDate = new Date(now.getTime() - fromDays * 24 * 60 * 60 * 1000);
        threads = threads.filter((t: any) => t.closedAt && t.closedAt >= fromDate);
      }
      if (toDays !== undefined) {
        const toDate = new Date(now.getTime() - toDays * 24 * 60 * 60 * 1000);
        threads = threads.filter((t: any) => t.closedAt && t.closedAt <= toDate);
      }

      const counts: { [category: string]: number } = {};
      for (const t of threads) {
        const cat = t.category || "unknown";
        counts[cat] = (counts[cat] || 0) + 1;
      }

      return Object.entries(counts)
        .map(([category, count]) => ({ category, count }))
        .sort((a, b) => b.count - a.count);
    } catch (error: any) {
      // If category column doesn't exist yet, return empty array
      if (error.message?.includes('category') || error.message?.includes('column')) {
        console.log('Category column not yet migrated, skipping category stats');
        return [];
      }
      throw error;
    }
  }

  async getActivityStatsForUser(guildId: string, userId: string, category: string, fromDays?: number, toDays?: number): Promise<number> {
    if (category === "invites") {
      return this.getInviteStatsForUser(guildId, userId, fromDays, toDays);
    }

    const table = category === "ban" ? banRequests : unbanRequests;

    let conditions: any[] = [
      eq(table.guildId, guildId),
      eq(table.reviewedById, userId),
      eq(table.status, "approved")
    ];

    const now = new Date();
    if (fromDays !== undefined) {
      const fromDate = new Date(now.getTime() - fromDays * 24 * 60 * 60 * 1000);
      conditions.push(gte(table.createdAt, fromDate));
    }
    if (toDays !== undefined) {
      const toDate = new Date(now.getTime() - toDays * 24 * 60 * 60 * 1000);
      conditions.push(lte(table.createdAt, toDate));
    }

    const result = await db.select({ count: count() }).from(table).where(and(...conditions));
    return result[0]?.count || 0;
  }

  // Cross-server activity stats - aggregates from ALL guilds
  async getActivityStatsForUserAllGuilds(userId: string, category: string, fromDays?: number, toDays?: number, scopeGuildIds?: string[]): Promise<number> {
    if (category === "invites") {
      return this.getInviteStatsForUserAllGuilds(userId, fromDays, toDays, scopeGuildIds);
    }

    const table = category === "ban" ? banRequests : unbanRequests;

    let conditions: any[] = [
      eq(table.reviewedById, userId),
      eq(table.status, "approved")
    ];
    addGuildScopeCondition(conditions, table.guildId, scopeGuildIds);

    const now = new Date();
    if (fromDays !== undefined) {
      const fromDate = new Date(now.getTime() - fromDays * 24 * 60 * 60 * 1000);
      conditions.push(gte(table.createdAt, fromDate));
    }
    if (toDays !== undefined) {
      const toDate = new Date(now.getTime() - toDays * 24 * 60 * 60 * 1000);
      conditions.push(lte(table.createdAt, toDate));
    }

    const result = await db.select({ count: count() }).from(table).where(and(...conditions));
    return result[0]?.count || 0;
  }

  async getInviteStatsForUser(guildId: string, userId: string, fromDays?: number, toDays?: number): Promise<number> {
    let conditions: any[] = [
      eq(inviteAttributions.guildId, guildId),
      eq(inviteAttributions.inviterId, userId)
    ];

    const now = new Date();
    if (fromDays !== undefined) {
      const fromDate = new Date(now.getTime() - fromDays * 24 * 60 * 60 * 1000);
      conditions.push(gte(inviteAttributions.createdAt, fromDate));
    }
    if (toDays !== undefined) {
      const toDate = new Date(now.getTime() - toDays * 24 * 60 * 60 * 1000);
      conditions.push(lte(inviteAttributions.createdAt, toDate));
    }

    const result = await db.select({ count: count() }).from(inviteAttributions).where(and(...conditions));
    return result[0]?.count || 0;
  }

  async getInviteStatsForUserAllGuilds(userId: string, fromDays?: number, toDays?: number, scopeGuildIds?: string[]): Promise<number> {
    let conditions: any[] = [eq(inviteAttributions.inviterId, userId)];
    addGuildScopeCondition(conditions, inviteAttributions.guildId, scopeGuildIds);

    const now = new Date();
    if (fromDays !== undefined) {
      const fromDate = new Date(now.getTime() - fromDays * 24 * 60 * 60 * 1000);
      conditions.push(gte(inviteAttributions.createdAt, fromDate));
    }
    if (toDays !== undefined) {
      const toDate = new Date(now.getTime() - toDays * 24 * 60 * 60 * 1000);
      conditions.push(lte(inviteAttributions.createdAt, toDate));
    }

    const result = await db.select({ count: count() }).from(inviteAttributions).where(and(...conditions));
    return result[0]?.count || 0;
  }

  async getModmailStatsForUserAllGuilds(userId: string, fromDays?: number, toDays?: number, scopeGuildIds?: string[]): Promise<number> {
    let conditions: any[] = [
      eq(modmailThreads.closedById, userId),
      eq(modmailThreads.status, "closed")
    ];
    addGuildScopeCondition(conditions, modmailThreads.guildId, scopeGuildIds);

    const now = new Date();
    if (fromDays !== undefined) {
      const fromDate = new Date(now.getTime() - fromDays * 24 * 60 * 60 * 1000);
      conditions.push(gte(modmailThreads.createdAt, fromDate));
    }
    if (toDays !== undefined) {
      const toDate = new Date(now.getTime() - toDays * 24 * 60 * 60 * 1000);
      conditions.push(lte(modmailThreads.createdAt, toDate));
    }

    const result = await db.select({ count: count() }).from(modmailThreads).where(and(...conditions));
    return result[0]?.count || 0;
  }

  async getModmailStatsByCategoryForUserAllGuilds(userId: string, fromDays?: number, toDays?: number, scopeGuildIds?: string[]): Promise<{ category: string; count: number }[]> {
    let conditions: any[] = [
      eq(modmailThreads.closedById, userId),
      eq(modmailThreads.status, "closed")
    ];
    addGuildScopeCondition(conditions, modmailThreads.guildId, scopeGuildIds);

    const now = new Date();
    if (fromDays !== undefined) {
      const fromDate = new Date(now.getTime() - fromDays * 24 * 60 * 60 * 1000);
      conditions.push(gte(modmailThreads.createdAt, fromDate));
    }
    if (toDays !== undefined) {
      const toDate = new Date(now.getTime() - toDays * 24 * 60 * 60 * 1000);
      conditions.push(lte(modmailThreads.createdAt, toDate));
    }

    const threads = await db.select().from(modmailThreads).where(and(...conditions));
    const categoryCounts: { [category: string]: number } = {};
    for (const thread of threads) {
      const cat = thread.category || "general";
      categoryCounts[cat] = (categoryCounts[cat] || 0) + 1;
    }
    return Object.entries(categoryCounts).map(([category, count]) => ({ category, count }));
  }

  async getAppealStatsForUserAllGuilds(userId: string, fromDays?: number, toDays?: number, scopeGuildIds?: string[]): Promise<number> {
    let conditions: any[] = [
      eq(appealThreads.closedById, userId),
      eq(appealThreads.status, "closed")
    ];
    addGuildScopeCondition(conditions, appealThreads.guildId, scopeGuildIds);

    const now = new Date();
    if (fromDays !== undefined) {
      const fromDate = new Date(now.getTime() - fromDays * 24 * 60 * 60 * 1000);
      conditions.push(gte(appealThreads.createdAt, fromDate));
    }
    if (toDays !== undefined) {
      const toDate = new Date(now.getTime() - toDays * 24 * 60 * 60 * 1000);
      conditions.push(lte(appealThreads.createdAt, toDate));
    }

    const result = await db.select({ count: count() }).from(appealThreads).where(and(...conditions));
    return result[0]?.count || 0;
  }

  async getAllGuildsActivityStats(fromDays?: number, toDays?: number, scopeGuildIds?: string[]): Promise<{ userId: string; count: number }[]> {
    const now = new Date();

    let banConditions: any[] = [eq(banRequests.status, "approved")];
    let unbanConditions: any[] = [eq(unbanRequests.status, "approved")];
    let inviteConditions: any[] = [];
    addGuildScopeCondition(banConditions, banRequests.guildId, scopeGuildIds);
    addGuildScopeCondition(unbanConditions, unbanRequests.guildId, scopeGuildIds);
    addGuildScopeCondition(inviteConditions, inviteAttributions.guildId, scopeGuildIds);

    if (fromDays !== undefined) {
      const fromDate = new Date(now.getTime() - fromDays * 24 * 60 * 60 * 1000);
      banConditions.push(gte(banRequests.createdAt, fromDate));
      unbanConditions.push(gte(unbanRequests.createdAt, fromDate));
      inviteConditions.push(gte(inviteAttributions.createdAt, fromDate));
    }
    if (toDays !== undefined) {
      const toDate = new Date(now.getTime() - toDays * 24 * 60 * 60 * 1000);
      banConditions.push(lte(banRequests.createdAt, toDate));
      unbanConditions.push(lte(unbanRequests.createdAt, toDate));
      inviteConditions.push(lte(inviteAttributions.createdAt, toDate));
    }

    const banReqs = await db.select().from(banRequests).where(and(...banConditions));
    const unbanReqs = await db.select().from(unbanRequests).where(and(...unbanConditions));
    const invites = inviteConditions.length > 0
      ? await db.select().from(inviteAttributions).where(and(...inviteConditions))
      : await db.select().from(inviteAttributions);

    const counts: { [userId: string]: number } = {};
    for (const r of banReqs) {
      // Filter out placeholder entries like staff_report_entry and manual_entry
      if (r.reviewedById && r.reviewedById !== "staff_report_entry" && r.reviewedById !== "manual_entry") {
        counts[r.reviewedById] = (counts[r.reviewedById] || 0) + 1;
      }
    }
    for (const r of unbanReqs) {
      // Filter out placeholder entries like staff_report_entry and manual_entry
      if (r.reviewedById && r.reviewedById !== "staff_report_entry" && r.reviewedById !== "manual_entry") {
        counts[r.reviewedById] = (counts[r.reviewedById] || 0) + 1;
      }
    }
    for (const invite of invites) {
      if (invite.inviterId && invite.inviterId !== "manual_entry") {
        counts[invite.inviterId] = (counts[invite.inviterId] || 0) + 1;
      }
    }

    return Object.entries(counts).map(([userId, count]) => ({ userId, count })).sort((a, b) => b.count - a.count);
  }

  async getAllGuildsBanStats(fromDays?: number, toDays?: number, scopeGuildIds?: string[]): Promise<{ userId: string; count: number }[]> {
    const now = new Date();

    let banConditions: any[] = [eq(banRequests.status, "approved")];
    addGuildScopeCondition(banConditions, banRequests.guildId, scopeGuildIds);

    if (fromDays !== undefined) {
      const fromDate = new Date(now.getTime() - fromDays * 24 * 60 * 60 * 1000);
      banConditions.push(gte(banRequests.createdAt, fromDate));
    }
    if (toDays !== undefined) {
      const toDate = new Date(now.getTime() - toDays * 24 * 60 * 60 * 1000);
      banConditions.push(lte(banRequests.createdAt, toDate));
    }

    const banReqs = await db.select().from(banRequests).where(and(...banConditions));

    const counts: { [userId: string]: number } = {};
    for (const r of banReqs) {
      if (r.reviewedById && r.reviewedById !== "staff_report_entry" && r.reviewedById !== "manual_entry") {
        counts[r.reviewedById] = (counts[r.reviewedById] || 0) + 1;
      }
    }

    return Object.entries(counts).map(([userId, count]) => ({ userId, count })).sort((a, b) => b.count - a.count);
  }

  async getAllGuildsUnbanStats(fromDays?: number, toDays?: number, scopeGuildIds?: string[]): Promise<{ userId: string; count: number }[]> {
    const now = new Date();

    let unbanConditions: any[] = [eq(unbanRequests.status, "approved")];
    addGuildScopeCondition(unbanConditions, unbanRequests.guildId, scopeGuildIds);

    if (fromDays !== undefined) {
      const fromDate = new Date(now.getTime() - fromDays * 24 * 60 * 60 * 1000);
      unbanConditions.push(gte(unbanRequests.createdAt, fromDate));
    }
    if (toDays !== undefined) {
      const toDate = new Date(now.getTime() - toDays * 24 * 60 * 60 * 1000);
      unbanConditions.push(lte(unbanRequests.createdAt, toDate));
    }

    const unbanReqs = await db.select().from(unbanRequests).where(and(...unbanConditions));

    const counts: { [userId: string]: number } = {};
    for (const r of unbanReqs) {
      if (r.reviewedById && r.reviewedById !== "staff_report_entry" && r.reviewedById !== "manual_entry") {
        counts[r.reviewedById] = (counts[r.reviewedById] || 0) + 1;
      }
    }

    return Object.entries(counts).map(([userId, count]) => ({ userId, count })).sort((a, b) => b.count - a.count);
  }

  async getAllGuildsInviteStats(fromDays?: number, toDays?: number, scopeGuildIds?: string[]): Promise<{ userId: string; count: number }[]> {
    const now = new Date();

    let conditions: any[] = [];
    addGuildScopeCondition(conditions, inviteAttributions.guildId, scopeGuildIds);
    if (fromDays !== undefined) {
      const fromDate = new Date(now.getTime() - fromDays * 24 * 60 * 60 * 1000);
      conditions.push(gte(inviteAttributions.createdAt, fromDate));
    }
    if (toDays !== undefined) {
      const toDate = new Date(now.getTime() - toDays * 24 * 60 * 60 * 1000);
      conditions.push(lte(inviteAttributions.createdAt, toDate));
    }

    const invites = conditions.length > 0
      ? await db.select().from(inviteAttributions).where(and(...conditions))
      : await db.select().from(inviteAttributions);

    const counts: { [userId: string]: number } = {};
    for (const invite of invites) {
      if (invite.inviterId && invite.inviterId !== "manual_entry") {
        counts[invite.inviterId] = (counts[invite.inviterId] || 0) + 1;
      }
    }

    return Object.entries(counts)
      .map(([userId, count]) => ({ userId, count }))
      .sort((a, b) => b.count - a.count);
  }

  async getAllGuildsModmailStats(fromDays?: number, toDays?: number, scopeGuildIds?: string[]): Promise<{ userId: string; count: number }[]> {
    let conditions: any[] = [eq(modmailThreads.status, "closed")];
    addGuildScopeCondition(conditions, modmailThreads.guildId, scopeGuildIds);

    const now = new Date();
    if (fromDays !== undefined) {
      const fromDate = new Date(now.getTime() - fromDays * 24 * 60 * 60 * 1000);
      conditions.push(gte(modmailThreads.createdAt, fromDate));
    }
    if (toDays !== undefined) {
      const toDate = new Date(now.getTime() - toDays * 24 * 60 * 60 * 1000);
      conditions.push(lte(modmailThreads.createdAt, toDate));
    }

    const threads = await db.select().from(modmailThreads).where(and(...conditions));
    console.log(`[getAllGuildsModmailStats] Found ${threads.length} closed threads across all guilds`);

    const counts: { [userId: string]: number } = {};
    for (const thread of threads) {
      if (thread.closedById) {
        counts[thread.closedById] = (counts[thread.closedById] || 0) + 1;
      }
    }

    const result = Object.entries(counts).map(([userId, count]) => ({ userId, count })).sort((a, b) => b.count - a.count);
    console.log(`[getAllGuildsModmailStats] Returning stats for ${result.length} users:`, result.slice(0, 5));
    return result;
  }

  async getAllGuildsAppealStats(fromDays?: number, toDays?: number, scopeGuildIds?: string[]): Promise<{ userId: string; count: number }[]> {
    let conditions: any[] = [eq(appealThreads.status, "closed")];
    addGuildScopeCondition(conditions, appealThreads.guildId, scopeGuildIds);

    const now = new Date();
    if (fromDays !== undefined) {
      const fromDate = new Date(now.getTime() - fromDays * 24 * 60 * 60 * 1000);
      conditions.push(gte(appealThreads.createdAt, fromDate));
    }
    if (toDays !== undefined) {
      const toDate = new Date(now.getTime() - toDays * 24 * 60 * 60 * 1000);
      conditions.push(lte(appealThreads.createdAt, toDate));
    }

    const threads = await db.select().from(appealThreads).where(and(...conditions));
    console.log(`[getAllGuildsAppealStats] Found ${threads.length} closed appeals across all guilds`);

    const counts: { [userId: string]: number } = {};
    for (const thread of threads) {
      if (thread.closedById) {
        counts[thread.closedById] = (counts[thread.closedById] || 0) + 1;
      }
    }

    const result = Object.entries(counts).map(([userId, count]) => ({ userId, count })).sort((a, b) => b.count - a.count);
    console.log(`[getAllGuildsAppealStats] Returning stats for ${result.length} users:`, result.slice(0, 5));
    return result;
  }

  async getStaffReportStats(guildId: string, fromDays?: number, toDays?: number): Promise<{ userId: string; count: number }[]> {
    const now = new Date();

    let banReqs = await db.select().from(banRequests).where(eq(banRequests.guildId, guildId));
    let unbanReqs = await db.select().from(unbanRequests).where(eq(unbanRequests.guildId, guildId));

    if (fromDays !== undefined) {
      const fromDate = new Date(now.getTime() - fromDays * 24 * 60 * 60 * 1000);
      banReqs = banReqs.filter((r: any) => r.createdAt >= fromDate);
      unbanReqs = unbanReqs.filter((r: any) => r.createdAt >= fromDate);
    }
    if (toDays !== undefined) {
      const toDate = new Date(now.getTime() - toDays * 24 * 60 * 60 * 1000);
      banReqs = banReqs.filter((r: any) => r.createdAt <= toDate);
      unbanReqs = unbanReqs.filter((r: any) => r.createdAt <= toDate);
    }

    const counts: { [userId: string]: number } = {};
    for (const r of [...banReqs, ...unbanReqs]) {
      if (r.requestedById && r.requestedById !== "manual_entry") {
        counts[r.requestedById] = (counts[r.requestedById] || 0) + 1;
      }
    }

    return Object.entries(counts)
      .map(([userId, count]) => ({ userId, count }))
      .sort((a, b) => b.count - a.count);
  }

  async getStaffReportStatsForUser(guildId: string, userId: string, fromDays?: number, toDays?: number): Promise<number> {
    const now = new Date();

    let conditions = [eq(banRequests.guildId, guildId), eq(banRequests.requestedById, userId)];
    let conditions2 = [eq(unbanRequests.guildId, guildId), eq(unbanRequests.requestedById, userId)];

    if (fromDays !== undefined) {
      const fromDate = new Date(now.getTime() - fromDays * 24 * 60 * 60 * 1000);
      conditions.push(gte(banRequests.createdAt, fromDate));
      conditions2.push(gte(unbanRequests.createdAt, fromDate));
    }
    if (toDays !== undefined) {
      const toDate = new Date(now.getTime() - toDays * 24 * 60 * 60 * 1000);
      conditions.push(lte(banRequests.createdAt, toDate));
      conditions2.push(lte(unbanRequests.createdAt, toDate));
    }

    const banResult = await db.select({ count: count() }).from(banRequests).where(and(...conditions));
    const unbanResult = await db.select({ count: count() }).from(unbanRequests).where(and(...conditions2));
    return (banResult[0]?.count || 0) + (unbanResult[0]?.count || 0);
  }

  async getStaffReportStatsForUserAllGuilds(userId: string, fromDays?: number, toDays?: number, scopeGuildIds?: string[]): Promise<number> {
    const now = new Date();

    let conditions = [eq(banRequests.requestedById, userId)];
    let conditions2 = [eq(unbanRequests.requestedById, userId)];
    addGuildScopeCondition(conditions, banRequests.guildId, scopeGuildIds);
    addGuildScopeCondition(conditions2, unbanRequests.guildId, scopeGuildIds);

    if (fromDays !== undefined) {
      const fromDate = new Date(now.getTime() - fromDays * 24 * 60 * 60 * 1000);
      conditions.push(gte(banRequests.createdAt, fromDate));
      conditions2.push(gte(unbanRequests.createdAt, fromDate));
    }
    if (toDays !== undefined) {
      const toDate = new Date(now.getTime() - toDays * 24 * 60 * 60 * 1000);
      conditions.push(lte(banRequests.createdAt, toDate));
      conditions2.push(lte(unbanRequests.createdAt, toDate));
    }

    const banResult = await db.select({ count: count() }).from(banRequests).where(and(...conditions));
    const unbanResult = await db.select({ count: count() }).from(unbanRequests).where(and(...conditions2));
    return (banResult[0]?.count || 0) + (unbanResult[0]?.count || 0);
  }

  async addStaffReportEntries(guildId: string, userId: string, amount: number): Promise<void> {
    const BATCH_SIZE = 50;
    const batches = [];
    for (let i = 0; i < amount; i += BATCH_SIZE) {
      const batchSize = Math.min(BATCH_SIZE, amount - i);
      const entries = Array.from({ length: batchSize }, () => ({
        guildId,
        targetUserId: "staff_report_entry",
        requestedById: userId,
        reason: "Manual staff report entry",
        status: "approved",
        reviewedById: "staff_report_entry",
        reviewReason: "Staff report activity entry",
      }));
      batches.push(db.insert(banRequests).values(entries));
    }
    await Promise.all(batches);
  }

  async removeStaffReportEntries(guildId: string, userId: string, amount: number): Promise<number> {
    const banReqs = await db.select().from(banRequests)
      .where(and(eq(banRequests.guildId, guildId), eq(banRequests.requestedById, userId)))
      .orderBy(desc(banRequests.createdAt));
    const unbanReqs = await db.select().from(unbanRequests)
      .where(and(eq(unbanRequests.guildId, guildId), eq(unbanRequests.requestedById, userId)))
      .orderBy(desc(unbanRequests.createdAt));

    const allReqs = [...banReqs.map((r: any) => ({ ...r, type: 'ban' as const })), ...unbanReqs.map((r: any) => ({ ...r, type: 'unban' as const }))]
      .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())
      .slice(0, amount);

    const banIdsToDelete = allReqs.filter((r: any) => r.type === 'ban').map((r: any) => r.id);
    const unbanIdsToDelete = allReqs.filter((r: any) => r.type === 'unban').map((r: any) => r.id);

    const BATCH_SIZE = 100;
    for (let i = 0; i < banIdsToDelete.length; i += BATCH_SIZE) {
      const batch = banIdsToDelete.slice(i, i + BATCH_SIZE);
      await db.delete(banRequests).where(inArray(banRequests.id, batch));
    }
    for (let i = 0; i < unbanIdsToDelete.length; i += BATCH_SIZE) {
      const batch = unbanIdsToDelete.slice(i, i + BATCH_SIZE);
      await db.delete(unbanRequests).where(inArray(unbanRequests.id, batch));
    }

    return allReqs.length;
  }

  async resetStaffReportStats(guildId: string, userId?: string): Promise<void> {
    if (userId) {
      await db.delete(banRequests).where(and(eq(banRequests.guildId, guildId), eq(banRequests.requestedById, userId)));
      await db.delete(unbanRequests).where(and(eq(unbanRequests.guildId, guildId), eq(unbanRequests.requestedById, userId)));
    } else {
      const allBanReqs = await db.select().from(banRequests).where(eq(banRequests.guildId, guildId));
      const allUnbanReqs = await db.select().from(unbanRequests).where(eq(unbanRequests.guildId, guildId));
      for (const r of allBanReqs) {
        if (r.requestedById && r.requestedById !== "manual_entry") {
          await db.update(banRequests).set({ requestedById: "reset" }).where(eq(banRequests.id, r.id));
        }
      }
      for (const r of allUnbanReqs) {
        if (r.requestedById && r.requestedById !== "manual_entry") {
          await db.update(unbanRequests).set({ requestedById: "reset" }).where(eq(unbanRequests.id, r.id));
        }
      }
    }
  }

  async getModmailStatsForUser(guildId: string, userId: string, fromDays?: number, toDays?: number): Promise<number> {
    let threads = await db.select().from(modmailThreads).where(
      and(
        eq(modmailThreads.guildId, guildId),
        eq(modmailThreads.closedById, userId),
        eq(modmailThreads.status, "closed")
      )
    );

    if (threads.length === 0) return 0;

    const now = new Date();
    if (fromDays !== undefined) {
      const fromDate = new Date(now.getTime() - fromDays * 24 * 60 * 60 * 1000);
      threads = threads.filter((t: any) => t.closedAt && t.closedAt >= fromDate);
    }
    if (toDays !== undefined) {
      const toDate = new Date(now.getTime() - toDays * 24 * 60 * 60 * 1000);
      threads = threads.filter((t: any) => t.closedAt && t.closedAt <= toDate);
    }

    return threads.length;
  }

  async getModmailStatsByCategoryForUser(guildId: string, userId: string, fromDays?: number, toDays?: number): Promise<{ category: string; count: number }[]> {
    try {
      let threads = await db.select().from(modmailThreads).where(
        and(
          eq(modmailThreads.guildId, guildId),
          eq(modmailThreads.closedById, userId),
          eq(modmailThreads.status, "closed")
        )
      );

      if (threads.length === 0) return [];

      const now = new Date();
      if (fromDays !== undefined) {
        const fromDate = new Date(now.getTime() - fromDays * 24 * 60 * 60 * 1000);
        threads = threads.filter((t: any) => t.closedAt && t.closedAt >= fromDate);
      }
      if (toDays !== undefined) {
        const toDate = new Date(now.getTime() - toDays * 24 * 60 * 60 * 1000);
        threads = threads.filter((t: any) => t.closedAt && t.closedAt <= toDate);
      }

      const counts: { [category: string]: number } = {};
      for (const t of threads) {
        const cat = t.category || "unknown";
        counts[cat] = (counts[cat] || 0) + 1;
      }

      return Object.entries(counts)
        .map(([category, count]) => ({ category, count }))
        .sort((a, b) => b.count - a.count);
    } catch (error: any) {
      if (error.message?.includes('category') || error.message?.includes('column')) {
        console.log('Category column not yet migrated, skipping category stats for user');
        return [];
      }
      throw error;
    }
  }

  async createModmailBlock(block: InsertModmailBlock): Promise<ModmailBlock> {
    const result = await db.insert(modmailBlocks).values(block).returning();
    return result[0];
  }

  async getActiveModmailBlock(guildId: string, userId: string): Promise<ModmailBlock | undefined> {
    const now = new Date();
    const result = await db.select().from(modmailBlocks).where(
      and(
        eq(modmailBlocks.guildId, guildId),
        eq(modmailBlocks.userId, userId)
      )
    );
    const block = result[0];
    if (block && block.expiresAt && block.expiresAt <= now) {
      await db.delete(modmailBlocks).where(eq(modmailBlocks.id, block.id));
      return undefined;
    }
    return block;
  }

  async removeModmailBlock(guildId: string, userId: string): Promise<void> {
    await db.delete(modmailBlocks).where(
      and(
        eq(modmailBlocks.guildId, guildId),
        eq(modmailBlocks.userId, userId)
      )
    );
  }

  async getAllModmailBlocks(guildId: string): Promise<ModmailBlock[]> {
    return await db.select().from(modmailBlocks).where(eq(modmailBlocks.guildId, guildId));
  }

  async getAllModmailBlocksGlobal(): Promise<ModmailBlock[]> {
    return await db.select().from(modmailBlocks);
  }

  async createSnippet(snippet: InsertSnippet): Promise<Snippet> {
    const result = await db.insert(snippets).values(snippet).returning();
    return result[0];
  }

  async getSnippet(guildId: string, alias: string): Promise<Snippet | undefined> {
    const result = await db.select().from(snippets).where(
      and(
        eq(snippets.guildId, guildId),
        eq(snippets.alias, alias.toLowerCase())
      )
    );
    return result[0];
  }

  async updateSnippet(guildId: string, alias: string, content: string): Promise<Snippet | undefined> {
    const result = await db.update(snippets)
      .set({ content, updatedAt: new Date() })
      .where(
        and(
          eq(snippets.guildId, guildId),
          eq(snippets.alias, alias.toLowerCase())
        )
      )
      .returning();
    return result[0];
  }

  async deleteSnippet(guildId: string, alias: string): Promise<void> {
    await db.delete(snippets).where(
      and(
        eq(snippets.guildId, guildId),
        eq(snippets.alias, alias.toLowerCase())
      )
    );
  }

  async getAllSnippets(guildId: string): Promise<Snippet[]> {
    return await db.select().from(snippets).where(eq(snippets.guildId, guildId)).orderBy(snippets.alias);
  }

  async addModmailActivityEntries(guildId: string, userId: string, amount: number): Promise<void> {
    const BATCH_SIZE = 50;
    const batches = [];
    for (let i = 0; i < amount; i += BATCH_SIZE) {
      const batchSize = Math.min(BATCH_SIZE, amount - i);
      const entries = Array.from({ length: batchSize }, () => ({
        guildId,
        userId: "manual_entry",
        status: "closed",
        closedById: userId,
        closeReason: "Manual activity entry",
        closedAt: new Date(),
      }));
      batches.push(db.insert(modmailThreads).values(entries));
    }
    await Promise.all(batches);
  }

  async removeModmailActivityEntries(guildId: string, userId: string, amount: number): Promise<number> {
    const threads = await db.select().from(modmailThreads)
      .where(and(
        eq(modmailThreads.guildId, guildId),
        eq(modmailThreads.closedById, userId),
        eq(modmailThreads.status, "closed")
      ))
      .orderBy(desc(modmailThreads.closedAt));

    const idsToDelete = threads.slice(0, amount).map((t: any) => t.id);
    const BATCH_SIZE = 100;
    for (let i = 0; i < idsToDelete.length; i += BATCH_SIZE) {
      const batch = idsToDelete.slice(i, i + BATCH_SIZE);
      await db.delete(modmailThreads).where(inArray(modmailThreads.id, batch));
    }
    return idsToDelete.length;
  }

  async addAppealActivityEntries(guildId: string, userId: string, amount: number): Promise<void> {
    const BATCH_SIZE = 50;
    const batches = [];
    for (let i = 0; i < amount; i += BATCH_SIZE) {
      const batchSize = Math.min(BATCH_SIZE, amount - i);
      const entries = Array.from({ length: batchSize }, () => ({
        guildId,
        userId: "manual_entry",
        status: "closed",
        closedById: userId,
        closeReason: "Manual activity entry",
        closedAt: new Date(),
      }));
      batches.push(db.insert(appealThreads).values(entries));
    }
    await Promise.all(batches);
  }

  async addInviteActivityEntries(guildId: string, userId: string, amount: number): Promise<void> {
    const BATCH_SIZE = 50;
    const batches = [];
    for (let i = 0; i < amount; i += BATCH_SIZE) {
      const batchSize = Math.min(BATCH_SIZE, amount - i);
      const entries = Array.from({ length: batchSize }, () => ({
        guildId,
        inviterId: userId,
        invitedUserId: `manual_entry_${randomUUID()}`,
      }));
      batches.push(db.insert(inviteAttributions).values(entries));
    }
    await Promise.all(batches);
  }

  async removeInviteActivityEntries(guildId: string, userId: string, amount: number): Promise<number> {
    const invites = await db.select({ id: inviteAttributions.id })
      .from(inviteAttributions)
      .where(and(
        eq(inviteAttributions.guildId, guildId),
        eq(inviteAttributions.inviterId, userId)
      ))
      .orderBy(desc(inviteAttributions.createdAt));

    const idsToDelete = invites.slice(0, amount).map((i: any) => i.id);
    const BATCH_SIZE = 100;
    for (let i = 0; i < idsToDelete.length; i += BATCH_SIZE) {
      const batch = idsToDelete.slice(i, i + BATCH_SIZE);
      await db.delete(inviteAttributions).where(inArray(inviteAttributions.id, batch));
    }
    return idsToDelete.length;
  }

  async createInviteAttribution(attribution: InsertInviteAttribution): Promise<InviteAttribution> {
    const result = await db.insert(inviteAttributions).values(attribution).returning();
    return result[0];
  }

  async getInviteAttributionsByGuild(guildId: string): Promise<InviteAttribution[]> {
    return await db.select().from(inviteAttributions).where(eq(inviteAttributions.guildId, guildId));
  }

  async getInviteAttributionByInvitedUser(guildId: string, invitedUserId: string): Promise<InviteAttribution | undefined> {
    const result = await db.select().from(inviteAttributions)
      .where(and(
        eq(inviteAttributions.guildId, guildId),
        eq(inviteAttributions.invitedUserId, invitedUserId)
      ))
      .orderBy(desc(inviteAttributions.createdAt))
      .limit(1);
    return result[0];
  }

  async removeInviteAttribution(guildId: string, invitedUserId: string): Promise<number> {
    const result = await db.delete(inviteAttributions).where(and(
      eq(inviteAttributions.guildId, guildId),
      eq(inviteAttributions.invitedUserId, invitedUserId)
    )).returning({ id: inviteAttributions.id });
    return result.length;
  }

  async removeAppealActivityEntries(guildId: string, userId: string, amount: number): Promise<number> {
    const threads = await db.select().from(appealThreads)
      .where(and(
        eq(appealThreads.guildId, guildId),
        eq(appealThreads.closedById, userId),
        eq(appealThreads.status, "closed")
      ))
      .orderBy(desc(appealThreads.closedAt));

    const idsToDelete = threads.slice(0, amount).map((t: any) => t.id);
    const BATCH_SIZE = 100;
    for (let i = 0; i < idsToDelete.length; i += BATCH_SIZE) {
      const batch = idsToDelete.slice(i, i + BATCH_SIZE);
      await db.delete(appealThreads).where(inArray(appealThreads.id, batch));
    }
    return idsToDelete.length;
  }

  async getAppealStats(guildId: string, fromDays?: number, toDays?: number): Promise<{ userId: string; count: number }[]> {
    let threads = await db.select().from(appealThreads)
      .where(and(
        eq(appealThreads.guildId, guildId),
        eq(appealThreads.status, "closed")
      ));

    const now = new Date();
    if (fromDays !== undefined) {
      const fromDate = new Date(now.getTime() - fromDays * 24 * 60 * 60 * 1000);
      threads = threads.filter((t: any) => t.closedAt && t.closedAt >= fromDate);
    }
    if (toDays !== undefined) {
      const toDate = new Date(now.getTime() - toDays * 24 * 60 * 60 * 1000);
      threads = threads.filter((t: any) => t.closedAt && t.closedAt <= toDate);
    }

    const counts: { [userId: string]: number } = {};
    for (const t of threads) {
      if (t.closedById) {
        counts[t.closedById] = (counts[t.closedById] || 0) + 1;
      }
    }

    return Object.entries(counts)
      .map(([userId, count]) => ({ userId, count }))
      .sort((a, b) => b.count - a.count);
  }

  async getAppealStatsForUser(guildId: string, userId: string, fromDays?: number, toDays?: number): Promise<number> {
    let threads = await db.select().from(appealThreads)
      .where(and(
        eq(appealThreads.guildId, guildId),
        eq(appealThreads.closedById, userId),
        eq(appealThreads.status, "closed")
      ));

    const now = new Date();
    if (fromDays !== undefined) {
      const fromDate = new Date(now.getTime() - fromDays * 24 * 60 * 60 * 1000);
      threads = threads.filter((t: any) => t.closedAt && t.closedAt >= fromDate);
    }
    if (toDays !== undefined) {
      const toDate = new Date(now.getTime() - toDays * 24 * 60 * 60 * 1000);
      threads = threads.filter((t: any) => t.closedAt && t.closedAt <= toDate);
    }

    return threads.length;
  }

  async resetActivityStats(guildId: string, resetById: string, category?: string, userId?: string): Promise<number> {
    let count = 0;
    let banData: any[] = [];
    let unbanData: any[] = [];
    let modmailData: any[] = [];
    let appealData: any[] = [];
    let inviteData: any[] = [];
    let staffReportData: any[] = [];

    if (!category || category === "ban") {
      const conditions = [eq(banRequests.guildId, guildId)];
      if (userId) conditions.push(eq(banRequests.reviewedById, userId));
      banData = await db.select().from(banRequests).where(and(...conditions));
      const result = await db.delete(banRequests).where(and(...conditions)).returning();
      count += result.length;
    }

    if (!category || category === "unban") {
      const conditions = [eq(unbanRequests.guildId, guildId)];
      if (userId) conditions.push(eq(unbanRequests.reviewedById, userId));
      unbanData = await db.select().from(unbanRequests).where(and(...conditions));
      const result = await db.delete(unbanRequests).where(and(...conditions)).returning();
      count += result.length;
    }

    if (!category || category === "modmail") {
      const conditions = [eq(modmailThreads.guildId, guildId), eq(modmailThreads.status, "closed")];
      if (userId) conditions.push(eq(modmailThreads.closedById, userId));
      modmailData = await db.select().from(modmailThreads).where(and(...conditions));
      const result = await db.delete(modmailThreads).where(and(...conditions)).returning();
      count += result.length;
    }

    if (!category || category === "appeal") {
      const conditions = [eq(appealThreads.guildId, guildId), eq(appealThreads.status, "closed")];
      if (userId) conditions.push(eq(appealThreads.closedById, userId));
      appealData = await db.select().from(appealThreads).where(and(...conditions));
      const result = await db.delete(appealThreads).where(and(...conditions)).returning();
      count += result.length;
    }

    if (!category || category === "invites") {
      const conditions = [eq(inviteAttributions.guildId, guildId)];
      if (userId) conditions.push(eq(inviteAttributions.inviterId, userId));
      inviteData = await db.select().from(inviteAttributions).where(and(...conditions));
      const result = await db.delete(inviteAttributions).where(and(...conditions)).returning();
      count += result.length;
    }

    if (category === "staffreport") {
      await this.resetStaffReportStats(guildId, userId);
      const banConditions = [eq(banRequests.guildId, guildId)];
      const unbanConditions = [eq(unbanRequests.guildId, guildId)];
      if (userId) {
        banConditions.push(eq(banRequests.requestedById, userId));
        unbanConditions.push(eq(unbanRequests.requestedById, userId));
      }
      const banReqs = await db.select().from(banRequests).where(and(...banConditions));
      const unbanReqs = await db.select().from(unbanRequests).where(and(...unbanConditions));
      count = banReqs.length + unbanReqs.length;
      staffReportData = [...banReqs, ...unbanReqs];
    }

    if (count > 0) {
      await db.insert(activityResetBackups).values({
        guildId,
        resetById,
        category: category || null,
        targetUserId: userId || null,
        banRequestsData: banData.length > 0 ? JSON.stringify(banData) : null,
        unbanRequestsData: unbanData.length > 0 ? JSON.stringify(unbanData) : null,
        modmailThreadsData: modmailData.length > 0 ? JSON.stringify(modmailData) : null,
        appealThreadsData: appealData.length > 0 ? JSON.stringify(appealData) : null,
        inviteAttributionsData: inviteData.length > 0 ? JSON.stringify(inviteData) : null,
        entryCount: count.toString(),
      });
    }

    return count;
  }

  async getLatestActivityResetBackup(guildId: string): Promise<ActivityResetBackup | undefined> {
    const result = await db.select().from(activityResetBackups)
      .where(eq(activityResetBackups.guildId, guildId))
      .orderBy(desc(activityResetBackups.createdAt))
      .limit(1);
    return result[0];
  }

  async restoreActivityStats(guildId: string): Promise<number> {
    const backup = await this.getLatestActivityResetBackup(guildId);
    if (!backup) return 0;

    let restoredCount = 0;

    if (backup.banRequestsData) {
      const banData = JSON.parse(backup.banRequestsData);
      for (const item of banData) {
        delete item.id;
        await db.insert(banRequests).values(item);
        restoredCount++;
      }
    }

    if (backup.unbanRequestsData) {
      const unbanData = JSON.parse(backup.unbanRequestsData);
      for (const item of unbanData) {
        delete item.id;
        await db.insert(unbanRequests).values(item);
        restoredCount++;
      }
    }

    if (backup.modmailThreadsData) {
      const modmailData = JSON.parse(backup.modmailThreadsData);
      for (const item of modmailData) {
        delete item.id;
        await db.insert(modmailThreads).values(item);
        restoredCount++;
      }
    }

    if (backup.appealThreadsData) {
      const appealData = JSON.parse(backup.appealThreadsData);
      for (const item of appealData) {
        delete item.id;
        await db.insert(appealThreads).values(item);
        restoredCount++;
      }
    }

    if (backup.inviteAttributionsData) {
      const inviteData = JSON.parse(backup.inviteAttributionsData);
      for (const item of inviteData) {
        delete item.id;
        await db.insert(inviteAttributions).values(item);
        restoredCount++;
      }
    }

    await this.deleteActivityResetBackup(backup.id);

    return restoredCount;
  }

  async deleteActivityResetBackup(id: string): Promise<void> {
    await db.delete(activityResetBackups).where(eq(activityResetBackups.id, id));
  }

  // Appeal system implementations
  async createAppealThread(thread: InsertAppealThread): Promise<AppealThread> {
    const result = await db.insert(appealThreads).values(thread).returning();
    return result[0];
  }

  async getAppealThread(id: string): Promise<AppealThread | undefined> {
    const result = await db.select().from(appealThreads).where(eq(appealThreads.id, id));
    return result[0];
  }

  async getOpenAppealThread(guildId: string, userId: string): Promise<AppealThread | undefined> {
    const result = await db.select().from(appealThreads).where(
      and(
        eq(appealThreads.guildId, guildId),
        eq(appealThreads.userId, userId),
        eq(appealThreads.status, "open")
      )
    );
    const thread = result[0];
    // If thread exists but channel ID is missing, it's likely stuck - treat as closed
    if (thread && !thread.channelId) {
      try {
        await db.update(appealThreads).set({ status: "closed", closedAt: new Date() }).where(eq(appealThreads.id, thread.id));
      } catch (e) {
        console.log('[storage] Error auto-closing appeal thread without channel:', e);
      }
      return undefined;
    }
    return thread;
  }

  async getAppealThreadByChannel(channelId: string): Promise<AppealThread | undefined> {
    const result = await db.select().from(appealThreads).where(eq(appealThreads.channelId, channelId));
    return result[0];
  }

  async updateAppealThread(id: string, updates: { status?: string; claimedById?: string | null; closedById?: string; closeReason?: string; channelId?: string; closedAt?: Date; subscribedUserIds?: string[]; addedMemberIds?: string[] }): Promise<AppealThread> {
    const result = await db.update(appealThreads).set(updates).where(eq(appealThreads.id, id)).returning();
    return result[0];
  }

  async getAllAppealThreads(guildId: string): Promise<AppealThread[]> {
    return await db.select().from(appealThreads).where(eq(appealThreads.guildId, guildId)).orderBy(desc(appealThreads.createdAt));
  }

  async getAllAppealThreadsByUser(userId: string): Promise<AppealThread[]> {
    return await db.select().from(appealThreads).where(eq(appealThreads.userId, userId)).orderBy(desc(appealThreads.createdAt));
  }

  async addAppealMessage(message: InsertAppealMessage): Promise<AppealMessage> {
    const result = await db.insert(appealMessages).values(message).returning();
    return result[0];
  }

  async getAppealMessages(threadId: string): Promise<AppealMessage[]> {
    return await db.select().from(appealMessages).where(eq(appealMessages.threadId, threadId)).orderBy(appealMessages.createdAt);
  }

  async getAppealMessage(id: string): Promise<AppealMessage | undefined> {
    const result = await db.select().from(appealMessages).where(eq(appealMessages.id, id));
    return result[0];
  }

  async getAppealMessageByChannelMessageId(channelMessageId: string): Promise<AppealMessage | undefined> {
    const result = await db.select().from(appealMessages).where(eq(appealMessages.channelMessageId, channelMessageId));
    return result[0];
  }

  async updateAppealMessage(id: string, updates: { content?: string; channelMessageId?: string; dmMessageId?: string }): Promise<AppealMessage | undefined> {
    const result = await db.update(appealMessages).set(updates).where(eq(appealMessages.id, id)).returning();
    return result[0];
  }

  async deleteAppealMessage(id: string): Promise<void> {
    await db.delete(appealMessages).where(eq(appealMessages.id, id));
  }

  async getLatestStaffAppealMessage(threadId: string): Promise<AppealMessage | undefined> {
    const result = await db.select().from(appealMessages).where(
      and(
        eq(appealMessages.threadId, threadId),
        eq(appealMessages.isStaff, "true")
      )
    ).orderBy(desc(appealMessages.createdAt)).limit(1);
    return result[0];
  }

  async getLatestStaffRelayAppealMessage(threadId: string): Promise<AppealMessage | undefined> {
    const result = await db.select().from(appealMessages).where(
      and(
        eq(appealMessages.threadId, threadId),
        eq(appealMessages.isStaff, "true"),
        sql`${appealMessages.dmMessageId} IS NOT NULL`
      )
    ).orderBy(desc(appealMessages.createdAt)).limit(1);
    return result[0];
  }

  async createAppealBlock(block: InsertAppealBlock): Promise<AppealBlock> {
    const result = await db.insert(appealBlocks).values(block).returning();
    return result[0];
  }

  async getActiveAppealBlock(guildId: string, userId: string): Promise<AppealBlock | undefined> {
    const blocks = await db.select().from(appealBlocks).where(
      and(
        eq(appealBlocks.guildId, guildId),
        eq(appealBlocks.userId, userId)
      )
    );
    const now = new Date();
    for (const block of blocks) {
      if (!block.expiresAt || block.expiresAt > now) {
        return block;
      }
    }
    return undefined;
  }

  async removeAppealBlock(guildId: string, userId: string): Promise<void> {
    await db.delete(appealBlocks).where(
      and(
        eq(appealBlocks.guildId, guildId),
        eq(appealBlocks.userId, userId)
      )
    );
  }

  async getAllAppealBlocks(guildId: string): Promise<AppealBlock[]> {
    return await db.select().from(appealBlocks).where(eq(appealBlocks.guildId, guildId));
  }

  async getAllAppealBlocksGlobal(): Promise<AppealBlock[]> {
    return await db.select().from(appealBlocks);
  }

  async createAppealSnippet(snippet: InsertAppealSnippet): Promise<AppealSnippet> {
    const result = await db.insert(appealSnippets).values(snippet).returning();
    return result[0];
  }

  async getAppealSnippet(guildId: string, alias: string): Promise<AppealSnippet | undefined> {
    const result = await db.select().from(appealSnippets).where(
      and(
        eq(appealSnippets.guildId, guildId),
        eq(appealSnippets.alias, alias)
      )
    );
    return result[0];
  }

  async updateAppealSnippet(guildId: string, alias: string, content: string): Promise<AppealSnippet | undefined> {
    const result = await db.update(appealSnippets)
      .set({ content, updatedAt: new Date() })
      .where(
        and(
          eq(appealSnippets.guildId, guildId),
          eq(appealSnippets.alias, alias)
        )
      )
      .returning();
    return result[0];
  }

  async deleteAppealSnippet(guildId: string, alias: string): Promise<void> {
    await db.delete(appealSnippets).where(
      and(
        eq(appealSnippets.guildId, guildId),
        eq(appealSnippets.alias, alias)
      )
    );
  }

  async getAllAppealSnippets(guildId: string): Promise<AppealSnippet[]> {
    return await db.select().from(appealSnippets).where(eq(appealSnippets.guildId, guildId));
  }

  async createModerationAction(action: InsertModerationAction): Promise<ModerationAction> {
    const result = await db.insert(moderationActions).values(action).returning();
    return result[0];
  }

  async getModerationStats(guildId: string, fromDays?: number, toDays?: number, scopeGuildIds?: string[]): Promise<{ moderatorId: string; warns: number; mutes: number; unmutes: number; kicks: number; bans: number; unbans: number }[]> {
    const scopedGuildIds = normalizeScopeGuildIds(scopeGuildIds);
    const conditions = scopedGuildIds.length > 0
      ? [inArray(moderationActions.guildId, scopedGuildIds)]
      : [eq(moderationActions.guildId, guildId)];

    if (fromDays !== undefined) {
      const fromDate = new Date();
      fromDate.setDate(fromDate.getDate() - fromDays);
      conditions.push(gte(moderationActions.createdAt, fromDate));
    }
    if (toDays !== undefined) {
      const toDate = new Date();
      toDate.setDate(toDate.getDate() - toDays);
      conditions.push(lte(moderationActions.createdAt, toDate));
    }

    const results = await db.select({
      moderatorId: moderationActions.moderatorId,
      actionType: moderationActions.actionType,
    }).from(moderationActions).where(and(...conditions));

    // Aggregate by moderator
    const statsMap = new Map<string, { warns: number; mutes: number; unmutes: number; kicks: number; bans: number; unbans: number }>();
    for (const row of results) {
      if (!statsMap.has(row.moderatorId)) {
        statsMap.set(row.moderatorId, { warns: 0, mutes: 0, unmutes: 0, kicks: 0, bans: 0, unbans: 0 });
      }
      const stats = statsMap.get(row.moderatorId)!;
      switch (row.actionType) {
        case 'warn': stats.warns++; break;
        case 'mute': case 'timeout': stats.mutes++; break;
        case 'unmute': stats.unmutes++; break;
        case 'kick': stats.kicks++; break;
        case 'ban': stats.bans++; break;
        case 'unban': stats.unbans++; break;
      }
    }

    return Array.from(statsMap.entries()).map(([moderatorId, stats]) => ({
      moderatorId,
      ...stats
    }));
  }

  async getModerationActionExists(guildId: string, sourceMessageId: string): Promise<boolean> {
    const result = await db.select({ id: moderationActions.id })
      .from(moderationActions)
      .where(and(
        eq(moderationActions.guildId, guildId),
        eq(moderationActions.sourceMessageId, sourceMessageId)
      ))
      .limit(1);
    return result.length > 0;
  }

  async getModerationActionsByGuild(guildId: string): Promise<ModerationAction[]> {
    return await db.select().from(moderationActions)
      .where(eq(moderationActions.guildId, guildId))
      .orderBy(desc(moderationActions.createdAt));
  }

  async getModerationActionsByTarget(guildId: string, targetId: string): Promise<ModerationAction[]> {
    return await db.select().from(moderationActions)
      .where(and(
        eq(moderationActions.guildId, guildId),
        eq(moderationActions.targetId, targetId)
      ))
      .orderBy(desc(moderationActions.createdAt));
  }

  async getAllModerationActions(): Promise<ModerationAction[]> {
    return await db.select().from(moderationActions)
      .orderBy(desc(moderationActions.createdAt));
  }

  async getAllModerationActionsByTarget(targetId: string): Promise<ModerationAction[]> {
    return await db.select().from(moderationActions)
      .where(eq(moderationActions.targetId, targetId))
      .orderBy(desc(moderationActions.createdAt));
  }

  async updateModerationAction(id: string, updates: { reason?: string | null }): Promise<ModerationAction | undefined> {
    const result = await db.update(moderationActions)
      .set(updates)
      .where(eq(moderationActions.id, id))
      .returning();
    return result[0];
  }

  async deleteModerationAction(id: string): Promise<void> {
    await db.delete(moderationActions).where(eq(moderationActions.id, id));
  }

  // Roster management
  async createRosterConfig(roster: InsertRosterConfig): Promise<RosterConfig> {
    const result = await db.insert(rosterConfigs).values(roster).returning();
    return result[0];
  }

  async getRosterConfig(guildId: string, name: string): Promise<RosterConfig | undefined> {
    const normalizedName = String(name || "").trim().toLowerCase();
    const result = await db.select().from(rosterConfigs).where(
      and(
        eq(rosterConfigs.guildId, guildId),
        sql`lower(${rosterConfigs.name}) = ${normalizedName}`
      )
    );
    return result[0];
  }

  async updateRosterConfig(guildId: string, name: string, updates: { roleIds?: string[]; messageId?: string; channelId?: string }): Promise<RosterConfig | undefined> {
    const normalizedName = String(name || "").trim().toLowerCase();
    const result = await db.update(rosterConfigs)
      .set({ ...updates, updatedAt: new Date() })
      .where(
        and(
          eq(rosterConfigs.guildId, guildId),
          sql`lower(${rosterConfigs.name}) = ${normalizedName}`
        )
      )
      .returning();
    return result[0];
  }

  async deleteRosterConfig(guildId: string, name: string): Promise<void> {
    const normalizedName = String(name || "").trim().toLowerCase();
    await db.delete(rosterConfigs).where(
      and(
        eq(rosterConfigs.guildId, guildId),
        sql`lower(${rosterConfigs.name}) = ${normalizedName}`
      )
    );
  }

  async getAllRosterConfigs(guildId: string): Promise<RosterConfig[]> {
    return await db.select().from(rosterConfigs).where(eq(rosterConfigs.guildId, guildId));
  }
}

export const storage = new DatabaseStorage();
