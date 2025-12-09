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

  return httpServer;
}
