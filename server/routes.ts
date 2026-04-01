import type { Express, Request, Response } from "express";
import { createServer, type Server } from "http";
import { storage } from "./storage";
import { client } from "./bot";
import { insertGuildConfigSchema } from "@shared/schema";
import crypto from "crypto";
import { ActivityType, PermissionFlagsBits } from "discord.js";

type DashboardSessionUser = {
  id: string;
  username: string;
  avatar: string | null;
};

type DiscordRestGuild = {
  id: string;
  name: string;
  icon: string | null;
  owner?: boolean;
  permissions?: string;
  approximate_member_count?: number;
};

type DiscordRestGuildMember = {
  user?: { id?: string };
  roles?: string[];
  permissions?: string;
};

const AUTH_COOKIE_NAME = "dashboard_auth";
const OAUTH_STATE_COOKIE = "dashboard_oauth_state";
const LEAVE_SERVER_OWNER_ID = "948598563359817728";

function getAuthSecret(): string {
  return (process.env.DASHBOARD_AUTH_SECRET || process.env.DISCORD_CLIENT_SECRET || "change-me").trim();
}

function toBase64Url(input: string): string {
  return Buffer.from(input, "utf8").toString("base64url");
}

function fromBase64Url(input: string): string {
  return Buffer.from(input, "base64url").toString("utf8");
}

function signSession(user: DashboardSessionUser): string {
  const payload = toBase64Url(JSON.stringify(user));
  const signature = crypto.createHmac("sha256", getAuthSecret()).update(payload).digest("base64url");
  return `${payload}.${signature}`;
}

function verifySession(token: string | undefined): DashboardSessionUser | null {
  if (!token || !token.includes(".")) return null;
  const [payload, signature] = token.split(".");
  if (!payload || !signature) return null;

  const expected = crypto.createHmac("sha256", getAuthSecret()).update(payload).digest("base64url");
  if (signature !== expected) return null;

  try {
    const parsed = JSON.parse(fromBase64Url(payload));
    if (!parsed?.id || !parsed?.username) return null;
    return {
      id: String(parsed.id),
      username: String(parsed.username),
      avatar: parsed.avatar ? String(parsed.avatar) : null,
    };
  } catch {
    return null;
  }
}

function parseCookie(req: Request, name: string): string | undefined {
  const raw = req.headers.cookie;
  if (!raw) return undefined;

  const chunks = raw.split(";");
  for (const chunk of chunks) {
    const [cookieName, ...rest] = chunk.trim().split("=");
    if (cookieName !== name) continue;
    return decodeURIComponent(rest.join("="));
  }
  return undefined;
}

function appendCookie(res: Response, cookie: string) {
  const current = res.getHeader("Set-Cookie");
  if (!current) {
    res.setHeader("Set-Cookie", [cookie]);
    return;
  }

  const next = Array.isArray(current) ? current : [String(current)];
  next.push(cookie);
  res.setHeader("Set-Cookie", next);
}

function setSessionCookie(req: Request, res: Response, token: string) {
  const secure = (req.headers["x-forwarded-proto"] || req.protocol) === "https";
  const cookie = `${AUTH_COOKIE_NAME}=${encodeURIComponent(token)}; Path=/; HttpOnly; SameSite=Lax; Max-Age=${60 * 60 * 24 * 7}${secure ? "; Secure" : ""}`;
  appendCookie(res, cookie);
}

function clearSessionCookie(req: Request, res: Response) {
  const secure = (req.headers["x-forwarded-proto"] || req.protocol) === "https";
  const cookie = `${AUTH_COOKIE_NAME}=; Path=/; HttpOnly; SameSite=Lax; Max-Age=0${secure ? "; Secure" : ""}`;
  appendCookie(res, cookie);
}

function getRequestOrigin(req: Request): string {
  const proto = String(req.headers["x-forwarded-proto"] || req.protocol || "http").split(",")[0].trim();
  const host = String(req.headers["x-forwarded-host"] || req.headers.host || "localhost:2000").split(",")[0].trim();
  return `${proto}://${host}`;
}

function getDiscordRedirectUri(req?: Request): string {
  if (req) {
    const configured = (process.env.DISCORD_REDIRECT_URI || "").replace(/\s+/g, "").trim();
    if (configured) return configured;
    return `${getRequestOrigin(req)}/api/auth/discord/callback`;
  }

  const configured = (process.env.DISCORD_REDIRECT_URI || "").replace(/\s+/g, "").trim();
  if (configured) return configured;

  const base = getDashboardUrl().replace(/\/dashboard\/?$/i, "");
  return `${base}/api/auth/discord/callback`;
}

function getCurrentUser(req: Request): DashboardSessionUser | null {
  const token = parseCookie(req, AUTH_COOKIE_NAME);
  return verifySession(token);
}

function getBotToken(): string {
  return (process.env.DISCORD_BOT_TOKEN || "").trim();
}

function getBotAuthHeaders(): Record<string, string> {
  const token = getBotToken();
  return token ? { Authorization: `Bot ${token}` } : {};
}

async function discordApiRequest(path: string, init?: RequestInit) {
  const token = getBotToken();
  if (!token) {
    throw new Error("DISCORD_BOT_TOKEN is not configured");
  }

  const response = await fetch(`https://discord.com/api/v10${path}`, {
    ...init,
    headers: {
      ...getBotAuthHeaders(),
      ...(init?.headers || {}),
    },
  });

  if (!response.ok) {
    const text = await response.text().catch(() => "");
    throw new Error(`Discord API ${path} failed (${response.status}): ${text || "unknown_error"}`);
  }

  return response;
}

function hasAdministratorPermission(permissionValue: string | undefined): boolean {
  if (!permissionValue) return false;
  try {
    return (BigInt(permissionValue) & BigInt(PermissionFlagsBits.Administrator)) !== 0n;
  } catch {
    return false;
  }
}

function toGuildIconUrl(guildId: string, icon: string | null | undefined): string | null {
  if (!icon) return null;
  return `https://cdn.discordapp.com/icons/${guildId}/${icon}.png?size=128`;
}

function toRoleHexColor(color: number | undefined): string {
  const normalized = Number.isFinite(color) ? Math.max(0, Math.min(0xffffff, Number(color))) : 0;
  return `#${normalized.toString(16).padStart(6, "0")}`;
}

async function canAccessGuild(userId: string, guildId: string): Promise<boolean> {
  if (client.isReady()) {
    const guild = client.guilds.cache.get(guildId);
    if (!guild) return false;

    const member = await guild.members.fetch(userId).catch(() => null);
    if (!member) return false;

    if (member.permissions.has(PermissionFlagsBits.Administrator)) {
      return true;
    }

    const config = await storage.getGuildConfig(guildId);
    const managerRoleIds = (config?.modRoleIds || []).filter(Boolean);
    if (managerRoleIds.length === 0) return false;

    return managerRoleIds.some((roleId) => member.roles.cache.has(roleId));
  }

  if (!getBotToken()) return false;

  const guildsResponse = await discordApiRequest("/users/@me/guilds");
  const guilds = (await guildsResponse.json().catch(() => [])) as DiscordRestGuild[];
  const guild = guilds.find((entry) => String(entry?.id || "") === guildId);
  if (!guild) return false;

  const memberResponse = await discordApiRequest(`/guilds/${guildId}/members/${userId}`);
  const member = (await memberResponse.json().catch(() => ({}))) as DiscordRestGuildMember;
  const roleIds = Array.isArray(member.roles) ? member.roles : [];

  if (hasAdministratorPermission(member.permissions || guild.permissions)) {
    return true;
  }

  const config = await storage.getGuildConfig(guildId);
  const managerRoleIds = (config?.modRoleIds || []).filter(Boolean);
  if (managerRoleIds.length === 0) return false;

  return managerRoleIds.some((roleId) => roleIds.includes(roleId));
}

async function requireGuildAccess(req: Request, res: Response): Promise<{ user: DashboardSessionUser; guildId: string } | null> {
  const user = getCurrentUser(req);
  if (!user) {
    res.status(401).json({ error: "Unauthorized" });
    return null;
  }

  const guildId = String(req.params.guildId || "").trim();
  if (!guildId) {
    res.status(400).json({ error: "Missing guildId" });
    return null;
  }

  const allowed = await canAccessGuild(user.id, guildId);
  if (!allowed) {
    res.status(403).json({ error: "You do not have manager role access for this server." });
    return null;
  }

  return { user, guildId };
}

function getDashboardUrl(): string {
  const dashboardPort = process.env.DASHBOARD_PORT || process.env.PORT || "2000";
  return `http://localhost:${dashboardPort}/dashboard`;
}

function getBotNicknameFromCustomCategoryPings(raw: unknown): { hasBotNickname: boolean; botNickname: string | null } {
  if (typeof raw !== "string") {
    return { hasBotNickname: false, botNickname: null };
  }

  try {
    const parsed = JSON.parse(raw);
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
      return { hasBotNickname: false, botNickname: null };
    }

    const quickSettings = (parsed as Record<string, unknown>)["__dashboardQuickSettings"];
    if (!quickSettings || typeof quickSettings !== "object" || Array.isArray(quickSettings)) {
      return { hasBotNickname: false, botNickname: null };
    }

    const nicknameRaw = (quickSettings as Record<string, unknown>).botNickname;
    if (typeof nicknameRaw !== "string") {
      return { hasBotNickname: false, botNickname: null };
    }

    const normalized = nicknameRaw.trim();
    return {
      hasBotNickname: true,
      botNickname: normalized.length > 0 ? normalized.slice(0, 32) : null,
    };
  } catch {
    return { hasBotNickname: false, botNickname: null };
  }
}

async function applyGuildBotNickname(guildId: string, nickname: string | null): Promise<void> {
  if (!client.isReady() || !client.user) return;

  const guild = client.guilds.cache.get(guildId) || await client.guilds.fetch(guildId).catch(() => null);
  if (!guild) return;

  const me = guild.members.me || await guild.members.fetchMe().catch(() => null);
  if (!me) return;

  const currentNickname = me.nickname || null;
  if (currentNickname === nickname) return;

  await me.setNickname(nickname).catch(() => undefined);
}

function getBotPresenceSettingsFromCustomCategoryPings(raw: unknown): {
  status: "online" | "idle" | "dnd" | "invisible";
  activityType: "playing" | "listening" | "watching" | "competing";
  activityText: string;
} {
  if (typeof raw !== "string") {
    return { status: "online", activityType: "playing", activityText: "" };
  }

  try {
    const parsed = JSON.parse(raw);
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
      return { status: "online", activityType: "playing", activityText: "" };
    }

    const presenceRaw = (parsed as Record<string, unknown>).__dashboardBotPresence;
    const presence = presenceRaw && typeof presenceRaw === "object" && !Array.isArray(presenceRaw)
      ? presenceRaw as Record<string, unknown>
      : {};

    const status = typeof presence.status === "string" ? presence.status.toLowerCase() : "online";
    const activityType = typeof presence.activityType === "string" ? presence.activityType.toLowerCase() : "playing";
    const activityText = typeof presence.activityText === "string" ? presence.activityText : "";

    return {
      status: (status === "online" || status === "idle" || status === "dnd" || status === "invisible") ? status : "online",
      activityType: (activityType === "playing" || activityType === "listening" || activityType === "watching" || activityType === "competing")
        ? activityType
        : "playing",
      activityText,
    };
  } catch {
    return { status: "online", activityType: "playing", activityText: "" };
  }
}

function applyBotPresenceFromCustomCategoryPings(raw: unknown): void {
  if (!client.isReady() || !client.user) return;

  const settings = getBotPresenceSettingsFromCustomCategoryPings(raw);
  const activityTypeMap: Record<string, ActivityType> = {
    playing: ActivityType.Playing,
    listening: ActivityType.Listening,
    watching: ActivityType.Watching,
    competing: ActivityType.Competing,
  };

  const activityText = settings.activityText.trim();
  if (!activityText) {
    client.user.setPresence({
      status: settings.status,
      activities: [],
    });
    return;
  }

  client.user.setPresence({
    status: settings.status,
    activities: [
      {
        name: activityText,
        type: activityTypeMap[settings.activityType] ?? ActivityType.Playing,
      },
    ],
  });
}

export async function registerRoutes(
  httpServer: Server,
  app: Express
): Promise<Server> {
  app.get("/api/auth/discord/login", (req, res) => {
    const clientId = (process.env.DISCORD_CLIENT_ID || process.env.DISCORD_APPLICATION_ID || "").trim();
    if (!clientId) {
      return res.status(500).send("Missing DISCORD_CLIENT_ID or DISCORD_APPLICATION_ID.");
    }

    const state = crypto.randomBytes(16).toString("hex");
    const secure = (req.headers["x-forwarded-proto"] || req.protocol) === "https";
    appendCookie(res, `${OAUTH_STATE_COOKIE}=${state}; Path=/; HttpOnly; SameSite=Lax; Max-Age=600${secure ? "; Secure" : ""}`);

    const redirectUri = encodeURIComponent(getDiscordRedirectUri(req));
    const scope = encodeURIComponent("identify");
    const authorizeUrl = `https://discord.com/oauth2/authorize?client_id=${encodeURIComponent(clientId)}&response_type=code&redirect_uri=${redirectUri}&scope=${scope}&state=${state}`;
    res.redirect(authorizeUrl);
  });

  app.get("/api/auth/discord/callback", async (req, res) => {
    try {
      const code = String(req.query.code || "").trim();
      const state = String(req.query.state || "").trim();
      const storedState = parseCookie(req, OAUTH_STATE_COOKIE);
      if (!code || !state || !storedState || state !== storedState) {
        return res.status(400).send("Discord login failed (invalid state).");
      }

      const clientId = (process.env.DISCORD_CLIENT_ID || process.env.DISCORD_APPLICATION_ID || "").trim();
      const clientSecret = (process.env.DISCORD_CLIENT_SECRET || "").trim();
      if (!clientId || !clientSecret) {
        return res.status(500).send("Missing DISCORD_CLIENT_ID/APPLICATION_ID or DISCORD_CLIENT_SECRET.");
      }

      const tokenRes = await fetch("https://discord.com/api/v10/oauth2/token", {
        method: "POST",
        headers: { "Content-Type": "application/x-www-form-urlencoded" },
        body: new URLSearchParams({
          client_id: clientId,
          client_secret: clientSecret,
          grant_type: "authorization_code",
          code,
          redirect_uri: getDiscordRedirectUri(req),
        }),
      });

      if (!tokenRes.ok) {
        const errorText = await tokenRes.text().catch(() => "token_exchange_failed");
        return res.status(400).send(`Discord token exchange failed: ${errorText}`);
      }

      const tokenJson: any = await tokenRes.json();
      const accessToken = String(tokenJson?.access_token || "");
      if (!accessToken) {
        return res.status(400).send("Discord token exchange failed: no access token.");
      }

      const meRes = await fetch("https://discord.com/api/v10/users/@me", {
        headers: { Authorization: `Bearer ${accessToken}` },
      });

      if (!meRes.ok) {
        return res.status(400).send("Failed to fetch Discord profile.");
      }

      const meJson: any = await meRes.json();
      const user: DashboardSessionUser = {
        id: String(meJson.id || ""),
        username: String(meJson.global_name || meJson.username || "Discord User"),
        avatar: meJson.avatar ? String(meJson.avatar) : null,
      };

      if (!user.id) {
        return res.status(400).send("Invalid Discord user profile.");
      }

      setSessionCookie(req, res, signSession(user));
      const secure = (req.headers["x-forwarded-proto"] || req.protocol) === "https";
      appendCookie(res, `${OAUTH_STATE_COOKIE}=; Path=/; HttpOnly; SameSite=Lax; Max-Age=0${secure ? "; Secure" : ""}`);
      res.redirect("/dashboard");
    } catch (e: any) {
      res.status(500).send(`Discord login callback failed: ${e?.message || "unknown_error"}`);
    }
  });

  app.get("/api/auth/me", (req, res) => {
    const user = getCurrentUser(req);
    if (!user) return res.status(401).json({ authenticated: false });
    res.json({ authenticated: true, user });
  });

  app.post("/api/auth/logout", (req, res) => {
    clearSessionCookie(req, res);
    res.json({ success: true });
  });

  app.get("/api/bot-status", (req, res) => {
    const runBot = (process.env.RUN_BOT || "false").trim().toLowerCase() === "true";
    const status = runBot ? (client.isReady() ? "online" : "offline") : "external";
    const applicationId = process.env.DISCORD_APPLICATION_ID || null;
    
    res.json({ 
      status,
      applicationId,
      botTag: client.user?.tag || null,
      dashboardUrl: getDashboardUrl(),
    });
  });

  app.get("/api/guilds", async (req, res) => {
    try {
      if (client.isReady()) {
        const guilds = client.guilds.cache.map((g) => ({
          id: g.id,
          name: g.name,
          icon: g.iconURL(),
          memberCount: g.memberCount,
        }));
        return res.json(guilds);
      }

      const guildsResponse = await discordApiRequest("/users/@me/guilds");
      const guilds = (await guildsResponse.json().catch(() => [])) as DiscordRestGuild[];
      const normalized = guilds.map((guild) => ({
        id: String(guild.id),
        name: String(guild.name || "Unknown"),
        icon: toGuildIconUrl(String(guild.id), guild.icon),
        memberCount: Number(guild.approximate_member_count || 0),
      }));

      res.json(normalized);
    } catch (e: any) {
      res.status(500).json({ error: e.message });
    }
  });

  app.post("/api/guilds/:guildId/leave", async (req, res) => {
    try {
      const user = getCurrentUser(req);
      if (!user) {
        return res.status(401).json({ error: "Unauthorized" });
      }

      if (user.id !== LEAVE_SERVER_OWNER_ID) {
        return res.status(403).json({ error: "Only the bot owner can use leave server." });
      }

      const guildId = String(req.params.guildId || "").trim();
      if (!guildId) {
        return res.status(400).json({ error: "Missing guildId" });
      }

      if (client.isReady()) {
        const guild = client.guilds.cache.get(guildId) || await client.guilds.fetch(guildId).catch(() => null);
        if (!guild) {
          return res.status(404).json({ error: "Server not found." });
        }

        await guild.leave();
        return res.json({ success: true });
      }

      await discordApiRequest(`/users/@me/guilds/${guildId}`, { method: "DELETE" });
      res.json({ success: true });
    } catch (e: any) {
      res.status(500).json({ error: e.message || "Failed to leave server." });
    }
  });

  app.get("/api/guilds/:guildId/config", async (req, res) => {
    try {
      const auth = await requireGuildAccess(req, res);
      if (!auth) return;
      const { guildId } = auth;
      const config = await storage.getGuildConfig(guildId);

      if (client.isReady()) {
        const guild = client.guilds.cache.get(guildId);
        const channels = guild?.channels.cache
          .map(c => ({ id: c.id, name: c.name, type: c.type })) || [];
        const roles = guild?.roles.cache
          .filter(r => r.name !== "@everyone")
          .map(r => ({ id: r.id, name: r.name, color: r.hexColor })) || [];

        return res.json({
          config: config || {},
          channels,
          roles,
          guildName: guild?.name || "Unknown"
        });
      }

      const [guildResponse, channelsResponse, rolesResponse] = await Promise.all([
        discordApiRequest(`/guilds/${guildId}`),
        discordApiRequest(`/guilds/${guildId}/channels`),
        discordApiRequest(`/guilds/${guildId}/roles`),
      ]);

      const guild = await guildResponse.json().catch(() => ({}));
      const channelsRaw = await channelsResponse.json().catch(() => []);
      const rolesRaw = await rolesResponse.json().catch(() => []);

      const channels = Array.isArray(channelsRaw)
        ? channelsRaw.map((channel: any) => ({
            id: String(channel?.id || ""),
            name: String(channel?.name || ""),
            type: Number(channel?.type ?? 0),
          })).filter((channel: any) => channel.id)
        : [];

      const roles = Array.isArray(rolesRaw)
        ? rolesRaw
            .filter((role: any) => String(role?.name || "") !== "@everyone")
            .map((role: any) => ({
              id: String(role?.id || ""),
              name: String(role?.name || ""),
              color: toRoleHexColor(Number(role?.color ?? 0)),
            }))
            .filter((role: any) => role.id)
        : [];

      res.json({ 
        config: config || {},
        channels,
        roles,
        guildName: String((guild as any)?.name || "Unknown")
      });
    } catch (e: any) {
      res.status(500).json({ error: e.message });
    }
  });

  app.post("/api/guilds/:guildId/config", async (req, res) => {
    try {
      const auth = await requireGuildAccess(req, res);
      if (!auth) return;
      const { guildId } = auth;
      const rawUpdates = req.body || {};
      const parsed = insertGuildConfigSchema.partial().safeParse({
        ...rawUpdates,
        guildId,
      });

      if (!parsed.success) {
        return res.status(400).json({
          error: "Invalid config payload",
          details: parsed.error.issues,
        });
      }

      const updates = parsed.data;
      updates.guildId = guildId;

      const normalizeArray = (value: unknown) => Array.isArray(value)
        ? value.map((entry) => String(entry)).filter(Boolean)
        : undefined;

      const normalizeString = (value: unknown) => {
        if (typeof value !== "string") return undefined;
        const trimmed = value.trim();
        return trimmed.length > 0 ? trimmed : null;
      };

      const arrayKeys: Array<keyof typeof updates> = [
        "allowedRoleIds",
        "modRoleIds",
        "modmailStaffRoleIds",
        "modmailBlockRoleIds",
        "modmailClaimRoleIds",
        "appealStaffRoleIds",
        "snippetRoleIds",
        "activityRoleIds",
        "messageCommandRoleIds",
        "rosterCommandRoleIds",
        "roleCommandRoleIds",
        "activityTrackedRoleIds",
        "activityResetRoleIds",
        "inactivityPingRoleIds",
      ];

      const channelLikeKeys: Array<keyof typeof updates> = [
        "requestChannelId",
        "logChannelId",
        "modmailCategoryId",
        "modmailLogChannelId",
        "appealCategoryId",
        "appealLogChannelId",
        "quizLogChannelId",
        "modLogChannelId",
        "commandLogChannelId",
        "staffIntroChannelId",
        "staffIntroSubmissionsChannelId",
        "inactivityChannelId",
        "inactivitySubmissionsChannelId",
        "inactivityLogChannelId",
      ];

      for (const key of arrayKeys) {
        if (key in updates) {
          (updates as any)[key] = normalizeArray((updates as any)[key]);
        }
      }

      for (const key of channelLikeKeys) {
        if (key in updates) {
          (updates as any)[key] = normalizeString((updates as any)[key]);
        }
      }

      if (typeof updates.commandPrefix === "string") {
        const trimmedPrefix = updates.commandPrefix.trim();
        if (trimmedPrefix.length === 0 || trimmedPrefix.length > 3) {
          return res.status(400).json({ error: "commandPrefix must be 1-3 characters." });
        }
        updates.commandPrefix = trimmedPrefix;
      }
      
      await storage.upsertGuildConfig({ guildId, ...updates });
      const config = await storage.getGuildConfig(guildId);

      const nicknameInput = getBotNicknameFromCustomCategoryPings(
        typeof updates.customCategoryPings === "string"
          ? updates.customCategoryPings
          : config?.customCategoryPings
      );
      if (nicknameInput.hasBotNickname) {
        await applyGuildBotNickname(guildId, nicknameInput.botNickname);
      }

      applyBotPresenceFromCustomCategoryPings(
        typeof updates.customCategoryPings === "string"
          ? updates.customCategoryPings
          : config?.customCategoryPings
      );
      
      res.json({ success: true, config });
    } catch (e: any) {
      res.status(500).json({ error: e.message });
    }
  });

  return httpServer;
}
