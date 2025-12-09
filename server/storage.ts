import { type GuildConfig, type InsertGuildConfig, guildConfigs } from "@shared/schema";
import { db } from "./db";
import { eq } from "drizzle-orm";

export interface IStorage {
  getGuildConfig(guildId: string): Promise<GuildConfig | undefined>;
  upsertGuildConfig(config: InsertGuildConfig): Promise<GuildConfig>;
  updateRequestChannel(guildId: string, channelId: string): Promise<GuildConfig>;
  updateLogChannel(guildId: string, channelId: string): Promise<GuildConfig>;
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
}

export const storage = new DatabaseStorage();
