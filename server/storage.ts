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
  guildConfigs,
  payoutRequests,
  roleSyncPairs,
  banRequests,
  unbanRequests
} from "@shared/schema";
import { db } from "./db";
import { eq, and, desc, or } from "drizzle-orm";

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
}

export class DatabaseStorage implements IStorage {
  async getGuildConfig(guildId: string): Promise<GuildConfig | undefined> {
    const result = await db
      .select()
      .from(guildConfigs)
      .where(eq(guildConfigs.guildId, guildId))
      .limit(1);
    return result[0];
  }

  async upsertGuildConfig(config: InsertGuildConfig): Promise<GuildConfig> {
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
    return db
      .select()
      .from(payoutRequests)
      .where(eq(payoutRequests.guildId, guildId))
      .orderBy(desc(payoutRequests.createdAt));
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
    
    let removed = 0;
    for (const request of requests) {
      if (removed >= amount) break;
      await db.delete(table).where(eq(table.id, request.id));
      removed++;
    }
    return removed;
  }
}

export const storage = new DatabaseStorage();
