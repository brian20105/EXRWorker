import type { Express } from "express";
import { createServer, type Server } from "http";
import { storage } from "./storage";
import { client } from "./bot";

export async function registerRoutes(
  httpServer: Server,
  app: Express
): Promise<Server> {
  app.get("/api/bot-status", (req, res) => {
    const status = client.isReady() ? "online" : "offline";
    const applicationId = process.env.DISCORD_APPLICATION_ID || null;
    
    res.json({ 
      status,
      applicationId,
      botTag: client.user?.tag || null
    });
  });

  app.get("/api/guilds", async (req, res) => {
    try {
      if (!client.isReady()) {
        return res.status(503).json({ error: "Bot not ready" });
      }
      const guilds = client.guilds.cache.map(g => ({
        id: g.id,
        name: g.name,
        icon: g.iconURL(),
        memberCount: g.memberCount
      }));
      res.json(guilds);
    } catch (e: any) {
      res.status(500).json({ error: e.message });
    }
  });

  app.get("/api/guilds/:guildId/config", async (req, res) => {
    try {
      const { guildId } = req.params;
      const config = await storage.getGuildConfig(guildId);
      
      const guild = client.guilds.cache.get(guildId);
      const channels = guild?.channels.cache
        .filter(c => c.type === 0)
        .map(c => ({ id: c.id, name: c.name })) || [];
      const roles = guild?.roles.cache
        .filter(r => r.name !== "@everyone")
        .map(r => ({ id: r.id, name: r.name, color: r.hexColor })) || [];
      
      res.json({ 
        config: config || {},
        channels,
        roles,
        guildName: guild?.name || "Unknown"
      });
    } catch (e: any) {
      res.status(500).json({ error: e.message });
    }
  });

  app.post("/api/guilds/:guildId/config", async (req, res) => {
    try {
      const { guildId } = req.params;
      const updates = req.body;
      
      await storage.upsertGuildConfig({ guildId, ...updates });
      const config = await storage.getGuildConfig(guildId);
      
      res.json({ success: true, config });
    } catch (e: any) {
      res.status(500).json({ error: e.message });
    }
  });

  // API endpoint for external bots to log moderation actions (mutes, bans)
  app.post("/api/modaction", async (req, res) => {
    try {
      const { type, guildId, targetUserId, moderatorId, reason, duration, apiKey } = req.body;

      // Simple API key validation (set via environment variable)
      const expectedKey = process.env.MODACTION_API_KEY;
      if (expectedKey && apiKey !== expectedKey) {
        return res.status(401).json({ error: "Invalid API key" });
      }

      if (!type || !guildId || !targetUserId || !moderatorId) {
        return res.status(400).json({ error: "Missing required fields: type, guildId, targetUserId, moderatorId" });
      }

      if (type === "mute") {
        await storage.addMuteActivityEntry(guildId, targetUserId, moderatorId, reason || "Muted", duration);
        res.json({ success: true, message: "Mute logged successfully" });
      } else if (type === "ban") {
        await storage.addBanActionEntry(guildId, targetUserId, moderatorId, reason || "Banned");
        res.json({ success: true, message: "Ban logged successfully" });
      } else if (type === "unban") {
        await storage.addUnbanActivityEntries(guildId, moderatorId, 1);
        res.json({ success: true, message: "Unban logged successfully" });
      } else {
        res.status(400).json({ error: "Invalid type. Use: mute, ban, or unban" });
      }
    } catch (e: any) {
      res.status(500).json({ error: e.message });
    }
  });

  return httpServer;
}
