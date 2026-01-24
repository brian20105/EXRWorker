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

  return httpServer;
}
