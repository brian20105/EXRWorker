import { sql } from "drizzle-orm";
import { pgTable, text, varchar, timestamp } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod";

export const guildConfigs = pgTable("guild_configs", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  guildId: text("guild_id").notNull().unique(),
  requestChannelId: text("request_channel_id"),
  logChannelId: text("log_channel_id"),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
});

export const insertGuildConfigSchema = createInsertSchema(guildConfigs).omit({
  id: true,
  updatedAt: true,
});

export type InsertGuildConfig = z.infer<typeof insertGuildConfigSchema>;
export type GuildConfig = typeof guildConfigs.$inferSelect;
