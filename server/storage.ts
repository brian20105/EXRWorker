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
  guildConfigs,
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
  appealSnippets
} from "@shared/schema";
import { db, withRetry } from "./db";
import { eq, and, desc, or, sql, gte, lte, count, inArray } from "drizzle-orm";

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
  removeActivityEntries(guildId: string, userId: string, category: string, amount: number): Promise<number>;
  createStaffIntroSubmission(submission: InsertStaffIntroSubmission): Promise<StaffIntroSubmission>;
  getStaffIntroSubmission(id: string): Promise<StaffIntroSubmission | undefined>;
  updateStaffIntroSubmission(id: string, updates: { status?: string; reviewedById?: string; reviewReason?: string; messageId?: string }): Promise<StaffIntroSubmission>;
  
  createInactivityRequest(request: InsertInactivityRequest): Promise<InactivityRequest>;
  getInactivityRequest(id: string): Promise<InactivityRequest | undefined>;
  updateInactivityRequest(id: string, updates: { status?: string; reviewedById?: string; reviewReason?: string; messageId?: string }): Promise<InactivityRequest>;
  
  createModmailThread(thread: InsertModmailThread): Promise<ModmailThread>;
  getModmailThread(id: string): Promise<ModmailThread | undefined>;
  getOpenModmailThread(guildId: string, userId: string): Promise<ModmailThread | undefined>;
  getModmailThreadByChannel(channelId: string): Promise<ModmailThread | undefined>;
  updateModmailThread(id: string, updates: { status?: string; claimedById?: string; closedById?: string; closeReason?: string; channelId?: string; closedAt?: Date; subscribedUserIds?: string[]; ignoreInactivity?: string }): Promise<ModmailThread>;
  getAllModmailThreads(guildId: string): Promise<ModmailThread[]>;
  
  addModmailMessage(message: InsertModmailMessage): Promise<ModmailMessage>;
  getModmailMessages(threadId: string): Promise<ModmailMessage[]>;
  getModmailMessage(id: string): Promise<ModmailMessage | undefined>;
  getModmailMessageByChannelMessageId(channelMessageId: string): Promise<ModmailMessage | undefined>;
  updateModmailMessage(id: string, updates: { content?: string; channelMessageId?: string; dmMessageId?: string }): Promise<ModmailMessage | undefined>;
  deleteModmailMessage(id: string): Promise<void>;
  getLatestStaffModmailMessage(threadId: string): Promise<ModmailMessage | undefined>;
  getModmailStats(guildId: string, fromDays?: number, toDays?: number): Promise<{ userId: string; count: number }[]>;
  getModmailStatsByCategory(guildId: string, fromDays?: number, toDays?: number): Promise<{ category: string; count: number }[]>;
  getActivityStatsForUser(guildId: string, userId: string, category: string, fromDays?: number, toDays?: number): Promise<number>;
  getModmailStatsForUser(guildId: string, userId: string, fromDays?: number, toDays?: number): Promise<number>;
  getModmailStatsByCategoryForUser(guildId: string, userId: string, fromDays?: number, toDays?: number): Promise<{ category: string; count: number }[]>;
  
  createModmailBlock(block: InsertModmailBlock): Promise<ModmailBlock>;
  getActiveModmailBlock(guildId: string, userId: string): Promise<ModmailBlock | undefined>;
  removeModmailBlock(guildId: string, userId: string): Promise<void>;
  getAllModmailBlocks(guildId: string): Promise<ModmailBlock[]>;
  
  createSnippet(snippet: InsertSnippet): Promise<Snippet>;
  getSnippet(guildId: string, alias: string): Promise<Snippet | undefined>;
  updateSnippet(guildId: string, alias: string, content: string): Promise<Snippet | undefined>;
  deleteSnippet(guildId: string, alias: string): Promise<void>;
  getAllSnippets(guildId: string): Promise<Snippet[]>;
  
  addModmailActivityEntries(guildId: string, userId: string, amount: number): Promise<void>;
  removeModmailActivityEntries(guildId: string, userId: string, amount: number): Promise<number>;
  addAppealActivityEntries(guildId: string, userId: string, amount: number): Promise<void>;
  removeAppealActivityEntries(guildId: string, userId: string, amount: number): Promise<number>;
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
  updateAppealThread(id: string, updates: { status?: string; claimedById?: string | null; closedById?: string; closeReason?: string; channelId?: string; closedAt?: Date; subscribedUserIds?: string[] }): Promise<AppealThread>;
  getAllAppealThreads(guildId: string): Promise<AppealThread[]>;
  
  addAppealMessage(message: InsertAppealMessage): Promise<AppealMessage>;
  getAppealMessages(threadId: string): Promise<AppealMessage[]>;
  getAppealMessage(id: string): Promise<AppealMessage | undefined>;
  getAppealMessageByChannelMessageId(channelMessageId: string): Promise<AppealMessage | undefined>;
  updateAppealMessage(id: string, updates: { content?: string; channelMessageId?: string; dmMessageId?: string }): Promise<AppealMessage | undefined>;
  deleteAppealMessage(id: string): Promise<void>;
  getLatestStaffAppealMessage(threadId: string): Promise<AppealMessage | undefined>;
  
  createAppealBlock(block: InsertAppealBlock): Promise<AppealBlock>;
  getActiveAppealBlock(guildId: string, userId: string): Promise<AppealBlock | undefined>;
  removeAppealBlock(guildId: string, userId: string): Promise<void>;
  getAllAppealBlocks(guildId: string): Promise<AppealBlock[]>;
  
  createAppealSnippet(snippet: InsertAppealSnippet): Promise<AppealSnippet>;
  getAppealSnippet(guildId: string, alias: string): Promise<AppealSnippet | undefined>;
  updateAppealSnippet(guildId: string, alias: string, content: string): Promise<AppealSnippet | undefined>;
  deleteAppealSnippet(guildId: string, alias: string): Promise<void>;
  getAllAppealSnippets(guildId: string): Promise<AppealSnippet[]>;
}

export class DatabaseStorage implements IStorage {
  async getGuildConfig(guildId: string): Promise<GuildConfig | undefined> {
    return withRetry(async () => {
      const result = await db
        .select()
        .from(guildConfigs)
        .where(eq(guildConfigs.guildId, guildId))
        .limit(1);
      return result[0];
    });
  }

  async upsertGuildConfig(config: InsertGuildConfig): Promise<GuildConfig> {
    return withRetry(async () => {
      const existing = await this.getGuildConfig(config.guildId);
      
      if (existing) {
        const updated = await db
          .update(guildConfigs)
          .set({ ...config, updatedAt: new Date() })
          .where(eq(guildConfigs.guildId, config.guildId))
          .returning();
        return updated[0];
      } else {
        const inserted = await db.insert(guildConfigs).values(config).returning();
        return inserted[0];
      }
    });
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
    const table = category === "ban" ? banRequests : unbanRequests;
    let requests = await db.select().from(table).where(eq(table.guildId, guildId));
    
    const now = new Date();
    if (fromDays !== undefined) {
      const fromDate = new Date(now.getTime() - fromDays * 24 * 60 * 60 * 1000);
      requests = requests.filter(r => r.createdAt >= fromDate);
    }
    if (toDays !== undefined) {
      const toDate = new Date(now.getTime() - toDays * 24 * 60 * 60 * 1000);
      requests = requests.filter(r => r.createdAt <= toDate);
    }
    
    const counts: { [userId: string]: number } = {};
    for (const r of requests) {
      if (r.reviewedById && r.status !== "pending") {
        counts[r.reviewedById] = (counts[r.reviewedById] || 0) + 1;
      }
    }
    
    return Object.entries(counts)
      .map(([userId, count]) => ({ userId, count }))
      .sort((a, b) => b.count - a.count);
  }

  async removeActivityEntries(guildId: string, userId: string, category: string, amount: number): Promise<number> {
    const table = category === "ban" ? banRequests : unbanRequests;
    const requests = await db.select().from(table)
      .where(and(eq(table.guildId, guildId), eq(table.reviewedById, userId)))
      .orderBy(desc(table.createdAt));
    
    const idsToDelete = requests.slice(0, amount).map(r => r.id);
    if (idsToDelete.length > 0) {
      await db.delete(table).where(inArray(table.id, idsToDelete));
    }
    return idsToDelete.length;
  }

  async addBanActivityEntries(guildId: string, userId: string, amount: number): Promise<void> {
    const BATCH_SIZE = 100;
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
      await db.insert(banRequests).values(entries);
    }
  }

  async addUnbanActivityEntries(guildId: string, userId: string, amount: number): Promise<void> {
    const BATCH_SIZE = 100;
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
      await db.insert(unbanRequests).values(entries);
    }
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

  async updateInactivityRequest(id: string, updates: { status?: string; reviewedById?: string; reviewReason?: string; messageId?: string }): Promise<InactivityRequest> {
    const result = await db.update(inactivityRequests).set({ ...updates, updatedAt: new Date() }).where(eq(inactivityRequests.id, id)).returning();
    return result[0];
  }

  async createModmailThread(thread: InsertModmailThread): Promise<ModmailThread> {
    const result = await db.insert(modmailThreads).values(thread).returning();
    return result[0];
  }

  async getModmailThread(id: string): Promise<ModmailThread | undefined> {
    const result = await db.select().from(modmailThreads).where(eq(modmailThreads.id, id));
    return result[0];
  }

  async getOpenModmailThread(guildId: string, userId: string): Promise<ModmailThread | undefined> {
    const result = await db.select().from(modmailThreads).where(
      and(
        eq(modmailThreads.guildId, guildId),
        eq(modmailThreads.userId, userId),
        eq(modmailThreads.status, "open")
      )
    );
    return result[0];
  }

  async getModmailThreadByChannel(channelId: string): Promise<ModmailThread | undefined> {
    const result = await db.select().from(modmailThreads).where(eq(modmailThreads.channelId, channelId));
    return result[0];
  }

  async updateModmailThread(id: string, updates: { status?: string; claimedById?: string | null; closedById?: string; closeReason?: string; channelId?: string; closedAt?: Date; subscribedUserIds?: string[]; ignoreInactivity?: string }): Promise<ModmailThread> {
    const result = await db.update(modmailThreads).set(updates).where(eq(modmailThreads.id, id)).returning();
    return result[0];
  }

  async getAllModmailThreads(guildId: string): Promise<ModmailThread[]> {
    return await db.select().from(modmailThreads).where(eq(modmailThreads.guildId, guildId)).orderBy(desc(modmailThreads.createdAt));
  }

  async addModmailMessage(message: InsertModmailMessage): Promise<ModmailMessage> {
    const result = await db.insert(modmailMessages).values(message).returning();
    return result[0];
  }

  async getModmailMessages(threadId: string): Promise<ModmailMessage[]> {
    return await db.select().from(modmailMessages).where(eq(modmailMessages.threadId, threadId)).orderBy(modmailMessages.createdAt);
  }

  async getModmailMessage(id: string): Promise<ModmailMessage | undefined> {
    const result = await db.select().from(modmailMessages).where(eq(modmailMessages.id, id));
    return result[0];
  }

  async getModmailMessageByChannelMessageId(channelMessageId: string): Promise<ModmailMessage | undefined> {
    const result = await db.select().from(modmailMessages).where(eq(modmailMessages.channelMessageId, channelMessageId));
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
      threads = threads.filter(t => t.closedAt && t.closedAt >= fromDate);
    }
    if (toDays !== undefined) {
      const toDate = new Date(now.getTime() - toDays * 24 * 60 * 60 * 1000);
      threads = threads.filter(t => t.closedAt && t.closedAt <= toDate);
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
        threads = threads.filter(t => t.closedAt && t.closedAt >= fromDate);
      }
      if (toDays !== undefined) {
        const toDate = new Date(now.getTime() - toDays * 24 * 60 * 60 * 1000);
        threads = threads.filter(t => t.closedAt && t.closedAt <= toDate);
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

  async getStaffReportStats(guildId: string, fromDays?: number, toDays?: number): Promise<{ userId: string; count: number }[]> {
    const now = new Date();
    
    let banReqs = await db.select().from(banRequests).where(eq(banRequests.guildId, guildId));
    let unbanReqs = await db.select().from(unbanRequests).where(eq(unbanRequests.guildId, guildId));
    
    if (fromDays !== undefined) {
      const fromDate = new Date(now.getTime() - fromDays * 24 * 60 * 60 * 1000);
      banReqs = banReqs.filter(r => r.createdAt >= fromDate);
      unbanReqs = unbanReqs.filter(r => r.createdAt >= fromDate);
    }
    if (toDays !== undefined) {
      const toDate = new Date(now.getTime() - toDays * 24 * 60 * 60 * 1000);
      banReqs = banReqs.filter(r => r.createdAt <= toDate);
      unbanReqs = unbanReqs.filter(r => r.createdAt <= toDate);
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

  async addStaffReportEntries(guildId: string, userId: string, amount: number): Promise<void> {
    const BATCH_SIZE = 100;
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
      await db.insert(banRequests).values(entries);
    }
  }

  async removeStaffReportEntries(guildId: string, userId: string, amount: number): Promise<number> {
    const banReqs = await db.select().from(banRequests)
      .where(and(eq(banRequests.guildId, guildId), eq(banRequests.requestedById, userId)))
      .orderBy(desc(banRequests.createdAt));
    const unbanReqs = await db.select().from(unbanRequests)
      .where(and(eq(unbanRequests.guildId, guildId), eq(unbanRequests.requestedById, userId)))
      .orderBy(desc(unbanRequests.createdAt));
    
    const allReqs = [...banReqs.map(r => ({ ...r, type: 'ban' as const })), ...unbanReqs.map(r => ({ ...r, type: 'unban' as const }))]
      .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())
      .slice(0, amount);
    
    const banIdsToDelete = allReqs.filter(r => r.type === 'ban').map(r => r.id);
    const unbanIdsToDelete = allReqs.filter(r => r.type === 'unban').map(r => r.id);
    
    if (banIdsToDelete.length > 0) {
      await db.delete(banRequests).where(inArray(banRequests.id, banIdsToDelete));
    }
    if (unbanIdsToDelete.length > 0) {
      await db.delete(unbanRequests).where(inArray(unbanRequests.id, unbanIdsToDelete));
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
      threads = threads.filter(t => t.closedAt && t.closedAt >= fromDate);
    }
    if (toDays !== undefined) {
      const toDate = new Date(now.getTime() - toDays * 24 * 60 * 60 * 1000);
      threads = threads.filter(t => t.closedAt && t.closedAt <= toDate);
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
        threads = threads.filter(t => t.closedAt && t.closedAt >= fromDate);
      }
      if (toDays !== undefined) {
        const toDate = new Date(now.getTime() - toDays * 24 * 60 * 60 * 1000);
        threads = threads.filter(t => t.closedAt && t.closedAt <= toDate);
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
    const BATCH_SIZE = 100;
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
      await db.insert(modmailThreads).values(entries);
    }
  }

  async removeModmailActivityEntries(guildId: string, userId: string, amount: number): Promise<number> {
    const threads = await db.select().from(modmailThreads)
      .where(and(
        eq(modmailThreads.guildId, guildId),
        eq(modmailThreads.closedById, userId),
        eq(modmailThreads.status, "closed")
      ))
      .orderBy(desc(modmailThreads.closedAt));
    
    const idsToDelete = threads.slice(0, amount).map(t => t.id);
    if (idsToDelete.length > 0) {
      await db.delete(modmailThreads).where(inArray(modmailThreads.id, idsToDelete));
    }
    return idsToDelete.length;
  }

  async addAppealActivityEntries(guildId: string, userId: string, amount: number): Promise<void> {
    const BATCH_SIZE = 100;
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
      await db.insert(appealThreads).values(entries);
    }
  }

  async removeAppealActivityEntries(guildId: string, userId: string, amount: number): Promise<number> {
    const threads = await db.select().from(appealThreads)
      .where(and(
        eq(appealThreads.guildId, guildId),
        eq(appealThreads.closedById, userId),
        eq(appealThreads.status, "closed")
      ))
      .orderBy(desc(appealThreads.closedAt));
    
    const idsToDelete = threads.slice(0, amount).map(t => t.id);
    if (idsToDelete.length > 0) {
      await db.delete(appealThreads).where(inArray(appealThreads.id, idsToDelete));
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
      threads = threads.filter(t => t.closedAt && t.closedAt >= fromDate);
    }
    if (toDays !== undefined) {
      const toDate = new Date(now.getTime() - toDays * 24 * 60 * 60 * 1000);
      threads = threads.filter(t => t.closedAt && t.closedAt <= toDate);
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
      threads = threads.filter(t => t.closedAt && t.closedAt >= fromDate);
    }
    if (toDays !== undefined) {
      const toDate = new Date(now.getTime() - toDays * 24 * 60 * 60 * 1000);
      threads = threads.filter(t => t.closedAt && t.closedAt <= toDate);
    }
    
    return threads.length;
  }

  async resetActivityStats(guildId: string, resetById: string, category?: string, userId?: string): Promise<number> {
    let count = 0;
    let banData: any[] = [];
    let unbanData: any[] = [];
    let modmailData: any[] = [];
    let appealData: any[] = [];
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
    return result[0];
  }

  async getAppealThreadByChannel(channelId: string): Promise<AppealThread | undefined> {
    const result = await db.select().from(appealThreads).where(eq(appealThreads.channelId, channelId));
    return result[0];
  }

  async updateAppealThread(id: string, updates: { status?: string; claimedById?: string | null; closedById?: string; closeReason?: string; channelId?: string; closedAt?: Date; subscribedUserIds?: string[] }): Promise<AppealThread> {
    const result = await db.update(appealThreads).set(updates).where(eq(appealThreads.id, id)).returning();
    return result[0];
  }

  async getAllAppealThreads(guildId: string): Promise<AppealThread[]> {
    return await db.select().from(appealThreads).where(eq(appealThreads.guildId, guildId)).orderBy(desc(appealThreads.createdAt));
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
}

export const storage = new DatabaseStorage();
