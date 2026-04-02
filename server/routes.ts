import type { Express, Request, Response } from "express";
import { createServer, type Server } from "http";
import { storage } from "./storage";
import { client } from "./bot";
import { guildConfigs, insertGuildConfigSchema } from "@shared/schema";
import crypto from "crypto";
import { ActivityType, PermissionFlagsBits, EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle } from "discord.js";
import { db } from "./sql";

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

type DiscordRestGuildDetails = {
  id?: string;
  owner_id?: string;
};

type DashboardGuildSummary = {
  id: string;
  name: string;
  icon: string | null;
  memberCount: number;
};

const AUTH_COOKIE_NAME = "dashboard_auth";
const OAUTH_STATE_COOKIE = "dashboard_oauth_state";
const PRIVILEGED_DASHBOARD_USER_IDS = new Set(["948598563359817728", "944385000059600896"]);
const DASHBOARD_FEATURE_FLAGS_KEY = "__dashboardFeatureFlags";
const GUILDS_CACHE_TTL_MS = 60 * 1000;
const ACCESS_CACHE_TTL_MS = 5 * 60 * 1000;

let cachedGuildSummaries: DashboardGuildSummary[] = [];
let cachedGuildSummariesAt = 0;
const accessDecisionCache = new Map<string, { allowed: boolean; checkedAt: number }>();

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
    const compactText = String(text || "").replace(/\s+/g, " ").trim();
    const isRateLimited = response.status === 429 || compactText.includes("1015") || compactText.toLowerCase().includes("rate limited");
    const safeMessage = isRateLimited
      ? `Discord API ${path} failed (${response.status}): rate_limited`
      : `Discord API ${path} failed (${response.status}): ${(compactText || "unknown_error").slice(0, 300)}`;
    const error = new Error(safeMessage) as Error & { status?: number };
    error.status = response.status;
    throw error;
  }

  return response;
}

function getCachedGuildSummaryById(guildId: string): DashboardGuildSummary | null {
  const fromCache = cachedGuildSummaries.find((guild) => guild.id === guildId);
  return fromCache || null;
}

function getCachedAccessDecision(userId: string, guildId: string): boolean | null {
  const key = `${userId}:${guildId}`;
  const cached = accessDecisionCache.get(key);
  if (!cached) return null;
  if ((Date.now() - cached.checkedAt) > ACCESS_CACHE_TTL_MS) {
    accessDecisionCache.delete(key);
    return null;
  }
  return cached.allowed;
}

function setCachedAccessDecision(userId: string, guildId: string, allowed: boolean): void {
  const key = `${userId}:${guildId}`;
  accessDecisionCache.set(key, { allowed, checkedAt: Date.now() });
}

function getCachedGuildSummaries(): DashboardGuildSummary[] | null {
  if (!cachedGuildSummaries.length) return null;
  if ((Date.now() - cachedGuildSummariesAt) > GUILDS_CACHE_TTL_MS) return null;
  return cachedGuildSummaries;
}

function setCachedGuildSummaries(value: DashboardGuildSummary[]) {
  cachedGuildSummaries = value;
  cachedGuildSummariesAt = Date.now();
}

async function getGuildSummariesFromStoredConfigs(): Promise<DashboardGuildSummary[]> {
  try {
    const configRows = await db.select({ guildId: guildConfigs.guildId }).from(guildConfigs);
    const uniqueGuildIds = Array.from(new Set(configRows.map((row) => String(row.guildId || "").trim()).filter(Boolean)));
    if (uniqueGuildIds.length === 0) {
      return [];
    }

    const summaries: DashboardGuildSummary[] = [];
    for (const guildId of uniqueGuildIds) {
      try {
        const guildResponse = await discordApiRequest(`/guilds/${guildId}?with_counts=true`);
        const guild = await guildResponse.json().catch(() => ({} as any));
        summaries.push({
          id: guildId,
          name: String((guild as any)?.name || `Server ${guildId}`),
          icon: toGuildIconUrl(guildId, (guild as any)?.icon ?? null),
          memberCount: Number((guild as any)?.approximate_member_count ?? (guild as any)?.member_count ?? 0),
        });
      } catch {
        summaries.push({
          id: guildId,
          name: `Server ${guildId}`,
          icon: null,
          memberCount: 0,
        });
      }
    }

    return summaries;
  } catch {
    return [];
  }
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
  if (PRIVILEGED_DASHBOARD_USER_IDS.has(userId)) {
    setCachedAccessDecision(userId, guildId, true);
    return true;
  }

  if (client.isReady()) {
    const guild = client.guilds.cache.get(guildId);
    if (!guild) return false;

    if (guild.ownerId === userId) {
      setCachedAccessDecision(userId, guildId, true);
      return true;
    }

    const member = await guild.members.fetch(userId).catch(() => null);
    if (!member) return false;

    if (member.permissions.has(PermissionFlagsBits.Administrator)) {
      setCachedAccessDecision(userId, guildId, true);
      return true;
    }

    const config = await storage.getGuildConfig(guildId);
    const managerRoleIds = (config?.modRoleIds || []).filter(Boolean);
    if (managerRoleIds.length === 0) return false;

    const allowed = managerRoleIds.some((roleId) => member.roles.cache.has(roleId));
    setCachedAccessDecision(userId, guildId, allowed);
    return allowed;
  }

  if (!getBotToken()) return false;

  const guildResponse = await discordApiRequest(`/guilds/${guildId}`);
  const guild = (await guildResponse.json().catch(() => ({}))) as DiscordRestGuildDetails;
  if (String(guild.owner_id || "") === userId) {
    setCachedAccessDecision(userId, guildId, true);
    return true;
  }

  const memberResponse = await discordApiRequest(`/guilds/${guildId}/members/${userId}`);
  const member = (await memberResponse.json().catch(() => ({}))) as DiscordRestGuildMember;
  const roleIds = Array.isArray(member.roles) ? member.roles : [];

  if (hasAdministratorPermission(member.permissions)) {
    setCachedAccessDecision(userId, guildId, true);
    return true;
  }

  const config = await storage.getGuildConfig(guildId);
  const managerRoleIds = (config?.modRoleIds || []).filter(Boolean);
  if (managerRoleIds.length === 0) return false;

  const allowed = managerRoleIds.some((roleId) => roleIds.includes(roleId));
  setCachedAccessDecision(userId, guildId, allowed);
  return allowed;
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

  let allowed = false;
  try {
    allowed = await canAccessGuild(user.id, guildId);
  } catch (error: any) {
    const isRateLimited = error?.status === 429 || String(error?.message || "").includes("1015");
    if (isRateLimited) {
      const cachedAllowed = getCachedAccessDecision(user.id, guildId);
      if (cachedAllowed === true) {
        return { user, guildId };
      }

      const knownGuild = getCachedGuildSummaryById(guildId);
      if (knownGuild) {
        return { user, guildId };
      }

      res.status(503).json({ error: "Discord is temporarily rate-limited. Please retry in a few seconds." });
      return null;
    }
    res.status(500).json({ error: "Could not verify server access right now. Please retry." });
    return null;
  }

  if (!allowed) {
    res.status(403).json({ error: "You do not have manager role access for this server." });
    return null;
  }

  return { user, guildId };
}

function getDashboardUrl(): string {
  const configuredBase = (process.env.DASHBOARD_URL || "").trim().replace(/\/+$/, "");
  if (configuredBase) {
    return /\/dashboard$/i.test(configuredBase) ? configuredBase : `${configuredBase}/dashboard`;
  }

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
    return { status: "online", activityType: "listening", activityText: "Make A Ticket To Join!" };
  }

  try {
    const parsed = JSON.parse(raw);
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
      return { status: "online", activityType: "listening", activityText: "Make A Ticket To Join!" };
    }

    const presenceRaw = (parsed as Record<string, unknown>).__dashboardBotPresence;
    const presence = presenceRaw && typeof presenceRaw === "object" && !Array.isArray(presenceRaw)
      ? presenceRaw as Record<string, unknown>
      : {};

    const status = typeof presence.status === "string" ? presence.status.toLowerCase() : "online";
    const activityType = typeof presence.activityType === "string" ? presence.activityType.toLowerCase() : "listening";
    const activityText = typeof presence.activityText === "string" ? presence.activityText : "Make A Ticket To Join!";

    return {
      status: (status === "online" || status === "idle" || status === "dnd" || status === "invisible") ? status : "online",
      activityType: (activityType === "playing" || activityType === "listening" || activityType === "watching" || activityType === "competing")
        ? activityType
        : "listening",
      activityText,
    };
  } catch {
    return { status: "online", activityType: "listening", activityText: "Make A Ticket To Join!" };
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

function parseDashboardBotPresenceForPropagation(raw: unknown): {
  status: "online" | "idle" | "dnd" | "invisible";
  activityType: "playing" | "listening" | "watching" | "competing";
  activityText: string;
  updatedAt: number;
} | null {
  if (typeof raw !== "string") return null;

  try {
    const parsed = JSON.parse(raw);
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) return null;

    const presenceRaw = (parsed as Record<string, unknown>).__dashboardBotPresence;
    if (!presenceRaw || typeof presenceRaw !== "object" || Array.isArray(presenceRaw)) return null;

    const presence = presenceRaw as Record<string, unknown>;
    const status = typeof presence.status === "string" ? presence.status.toLowerCase() : "online";
    const activityType = typeof presence.activityType === "string" ? presence.activityType.toLowerCase() : "playing";
    const activityText = typeof presence.activityText === "string" ? presence.activityText : "";
    const updatedAt = typeof presence.updatedAt === "number" && Number.isFinite(presence.updatedAt)
      ? presence.updatedAt
      : Date.now();

    return {
      status: (status === "online" || status === "idle" || status === "dnd" || status === "invisible") ? status : "online",
      activityType: (activityType === "playing" || activityType === "listening" || activityType === "watching" || activityType === "competing")
        ? activityType
        : "playing",
      activityText,
      updatedAt,
    };
  } catch {
    return null;
  }
}

function writeDashboardBotPresence(raw: unknown, presence: {
  status: "online" | "idle" | "dnd" | "invisible";
  activityType: "playing" | "listening" | "watching" | "competing";
  activityText: string;
  updatedAt: number;
}): string {
  let root: Record<string, unknown> = {};

  if (typeof raw === "string") {
    try {
      const parsed = JSON.parse(raw);
      if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) {
        root = parsed as Record<string, unknown>;
      }
    } catch {
      root = {};
    }
  }

  root.__dashboardBotPresence = presence;
  return JSON.stringify(root);
}

async function propagateDashboardBotPresenceToAllGuildConfigs(presence: {
  status: "online" | "idle" | "dnd" | "invisible";
  activityType: "playing" | "listening" | "watching" | "competing";
  activityText: string;
  updatedAt: number;
}): Promise<void> {
  try {
    const rows = await db
      .select({ guildId: guildConfigs.guildId, customCategoryPings: guildConfigs.customCategoryPings })
      .from(guildConfigs);

    for (const row of rows) {
      const guildId = String(row.guildId || "").trim();
      if (!guildId) continue;

      const mergedCustomCategoryPings = writeDashboardBotPresence(row.customCategoryPings, presence);
      await storage.upsertGuildConfig({ guildId, customCategoryPings: mergedCustomCategoryPings });
    }
  } catch {
    // Best-effort propagation
  }
}

function getDashboardFeatureFlags(raw: unknown): Record<string, boolean> {
  if (typeof raw !== "string") return {};

  try {
    const parsed = JSON.parse(raw);
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) return {};

    const flagsRaw = (parsed as Record<string, unknown>)[DASHBOARD_FEATURE_FLAGS_KEY];
    if (!flagsRaw || typeof flagsRaw !== "object" || Array.isArray(flagsRaw)) return {};

    const result: Record<string, boolean> = {};
    for (const [key, value] of Object.entries(flagsRaw as Record<string, unknown>)) {
      if (typeof value === "boolean") {
        result[key] = value;
      }
    }
    return result;
  } catch {
    return {};
  }
}

const FEATURE_LABELS: Record<string, string> = {
  modmail: "Modmail",
  appeals: "Appeals",
  payouts: "Payout Requests",
  moderation: "Moderation Logs",
  quiz: "Quiz Tracking",
  "staff-intro": "Staff Intro",
  inactivity: "Inactivity",
  permissions: "Role Permissions",
  embeds: "Embed Templates",
  advanced: "Advanced Categories",
};

function getNewlyEnabledFeatureLabels(previousRaw: unknown, currentRaw: unknown): string[] {
  const previousFlags = getDashboardFeatureFlags(previousRaw);
  const currentFlags = getDashboardFeatureFlags(currentRaw);

  return Object.entries(currentFlags)
    .filter(([key, enabled]) => enabled && !previousFlags[key])
    .map(([key]) => FEATURE_LABELS[key] || key)
    .sort((a, b) => a.localeCompare(b));
}

type RosterEmbedButtonConfig = {
  rosterName: string;
  label: string;
  color: "blue" | "green" | "red" | "grey";
  emoji?: string;
};

type RosterEmbedConfig = {
  title: string;
  description: string;
  embedColor?: string;
  channelId?: string | null;
  messageId?: string | null;
  buttons: RosterEmbedButtonConfig[];
};

const ROSTER_EMBED_CONFIGS_KEY = "__rosterEmbedConfigs";

function parseJsonObject(raw: unknown): Record<string, unknown> {
  if (typeof raw !== "string") return {};
  try {
    const parsed = JSON.parse(raw);
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) return {};
    return parsed as Record<string, unknown>;
  } catch {
    return {};
  }
}

function normalizeRosterEmbedButton(input: unknown): RosterEmbedButtonConfig | null {
  if (!input || typeof input !== "object" || Array.isArray(input)) return null;
  const value = input as Record<string, unknown>;
  const rosterName = String(value.rosterName || "").trim().toLowerCase();
  const label = String(value.label || "").trim();
  const rawColor = String(value.color || "").toLowerCase();
  const color = rawColor === "green" || rawColor === "red" || rawColor === "grey" || rawColor === "blue"
    ? rawColor
    : "blue";
  const emoji = typeof value.emoji === "string" ? value.emoji.trim() : "";

  if (!rosterName || !label) return null;
  return {
    rosterName,
    label,
    color,
    emoji: emoji || undefined,
  };
}

function normalizeRosterEmbedConfig(input: unknown): RosterEmbedConfig | null {
  if (!input || typeof input !== "object" || Array.isArray(input)) return null;
  const value = input as Record<string, unknown>;
  const title = String(value.title || "").trim();
  const description = String(value.description || "").trim();
  const embedColor = String(value.embedColor || "").trim().replace(/^#/, "").slice(0, 6);
  const channelId = typeof value.channelId === "string" ? value.channelId.trim() : "";
  const messageId = typeof value.messageId === "string" ? value.messageId.trim() : "";
  const rawButtons = Array.isArray(value.buttons) ? value.buttons : [];
  const buttons = rawButtons
    .map((entry) => normalizeRosterEmbedButton(entry))
    .filter(Boolean)
    .slice(0, 5) as RosterEmbedButtonConfig[];

  if (!title || !description || buttons.length === 0) return null;
  return {
    title,
    description,
    embedColor: embedColor || undefined,
    channelId: channelId || null,
    messageId: messageId || null,
    buttons,
  };
}

function getRosterEmbedConfigs(raw: unknown): Record<string, RosterEmbedConfig> {
  const parsed = parseJsonObject(raw);
  const rawConfigs = parsed[ROSTER_EMBED_CONFIGS_KEY];
  if (!rawConfigs || typeof rawConfigs !== "object" || Array.isArray(rawConfigs)) return {};

  const result: Record<string, RosterEmbedConfig> = {};
  for (const [key, value] of Object.entries(rawConfigs as Record<string, unknown>)) {
    const normalized = normalizeRosterEmbedConfig(value);
    if (normalized) {
      result[String(key || "").toLowerCase()] = normalized;
    }
  }
  return result;
}

function writeRosterEmbedConfigs(raw: unknown, nextConfigs: Record<string, RosterEmbedConfig>): string {
  const parsed = parseJsonObject(raw);
  parsed[ROSTER_EMBED_CONFIGS_KEY] = nextConfigs;
  return JSON.stringify(parsed);
}

async function getRostersWithEmbedConfigs(guildId: string): Promise<Array<Record<string, unknown>>> {
  const rosters = await storage.getAllRosterConfigs(guildId);
  const config = await storage.getGuildConfig(guildId);
  const embedConfigs = getRosterEmbedConfigs(config?.customCategoryPings);

  return rosters.map((roster) => ({
    ...roster,
    embedConfig: embedConfigs[String(roster.name || "").toLowerCase()] || null,
  }));
}

async function postFeatureUpdateToChannel(guildId: string, channelId: string, featureLabels: string[]): Promise<void> {
  if (!client.isReady() || !client.user) return;
  if (!channelId || featureLabels.length === 0) return;

  try {
    const channel = await client.channels.fetch(channelId).catch(() => null);
    if (!channel || !("send" in channel)) return;

    const embed = new EmbedBuilder()
      .setTitle("New Bot Features Enabled")
      .setDescription(featureLabels.map((label) => `• ${label}`).join("\n"))
      .setColor(0x5865f2)
      .setFooter({ text: `Server ID: ${guildId}` })
      .setTimestamp();

    await channel.send({ embeds: [embed] });
  } catch {
    // Best-effort announcement
  }
}

type GuildUpdatePayload = {
  type: "config-updated" | "rosters-updated";
  guildId: string;
  config?: unknown;
  rosters?: unknown[];
  editorId?: string;
};

const guildUpdateSubscribers = new Map<string, Set<Response>>();

function subscribeToGuildUpdates(guildId: string, res: Response): () => void {
  const subscribers = guildUpdateSubscribers.get(guildId) || new Set<Response>();
  subscribers.add(res);
  guildUpdateSubscribers.set(guildId, subscribers);

  return () => {
    const current = guildUpdateSubscribers.get(guildId);
    if (!current) return;
    current.delete(res);
    if (current.size === 0) {
      guildUpdateSubscribers.delete(guildId);
    }
  };
}

function broadcastGuildUpdate(guildId: string, payload: GuildUpdatePayload): void {
  const subscribers = guildUpdateSubscribers.get(guildId);
  if (!subscribers || subscribers.size === 0) return;

  const serialized = `data: ${JSON.stringify(payload)}\n\n`;
  for (const subscriber of subscribers) {
    try {
      subscriber.write(serialized);
    } catch {
      // Ignore dead connections; cleanup happens on close.
    }
  }
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
        setCachedGuildSummaries(guilds);
        return res.json(guilds);
      }

      const freshCache = getCachedGuildSummaries();
      if (freshCache) {
        return res.json(freshCache);
      }

      const guildsResponse = await discordApiRequest("/users/@me/guilds?with_counts=true");
      const guilds = (await guildsResponse.json().catch(() => [])) as DiscordRestGuild[];
      const normalized = guilds.map((guild) => ({
        id: String(guild.id),
        name: String(guild.name || "Unknown"),
        icon: toGuildIconUrl(String(guild.id), guild.icon),
        memberCount: Number(guild.approximate_member_count || 0),
      }));

      setCachedGuildSummaries(normalized);

      res.json(normalized);
    } catch (e: any) {
      const fallbackCache = cachedGuildSummaries.length ? cachedGuildSummaries : null;
      if (fallbackCache && (e?.status === 429 || String(e?.message || "").includes("1015"))) {
        return res.json(fallbackCache);
      }

      if (e?.status === 429 || String(e?.message || "").includes("1015")) {
        const storedFallback = await getGuildSummariesFromStoredConfigs();
        if (storedFallback.length > 0) {
          setCachedGuildSummaries(storedFallback);
          return res.json(storedFallback);
        }
      }

      res.status(500).json({ error: e.message });
    }
  });

  app.post("/api/guilds/:guildId/leave", async (req, res) => {
    try {
      const user = getCurrentUser(req);
      if (!user) {
        return res.status(401).json({ error: "Unauthorized" });
      }

      if (!PRIVILEGED_DASHBOARD_USER_IDS.has(user.id)) {
        return res.status(403).json({ error: "Only authorized owner accounts can use leave server." });
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
          guildName: guild?.name || "Unknown",
          memberCount: guild?.memberCount ?? 0,
        });
      }

      let guildResponse: Response;
      let channelsResponse: Response;
      let rolesResponse: Response;

      try {
        [guildResponse, channelsResponse, rolesResponse] = await Promise.all([
          discordApiRequest(`/guilds/${guildId}?with_counts=true`),
          discordApiRequest(`/guilds/${guildId}/channels`),
          discordApiRequest(`/guilds/${guildId}/roles`),
        ]);
      } catch (error: any) {
        const isRateLimited = error?.status === 429 || String(error?.message || "").includes("1015") || String(error?.message || "").includes("rate_limited");
        if (isRateLimited) {
          const fallbackSummary = getCachedGuildSummaryById(guildId);
          return res.json({
            config: config || {},
            channels: [],
            roles: [],
            guildName: fallbackSummary?.name || "Unknown",
            memberCount: fallbackSummary?.memberCount ?? 0,
            warning: "Discord is temporarily rate-limited. Channel and role lists may be temporarily unavailable.",
          });
        }
        throw error;
      }

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
        guildName: String((guild as any)?.name || "Unknown"),
        memberCount: Number((guild as any)?.approximate_member_count ?? (guild as any)?.member_count ?? 0),
      });
    } catch (e: any) {
      res.status(500).json({ error: e.message });
    }
  });

  app.get("/api/guilds/:guildId/stream", async (req, res) => {
    try {
      const auth = await requireGuildAccess(req, res);
      if (!auth) return;
      const { guildId } = auth;

      res.setHeader("Content-Type", "text/event-stream");
      res.setHeader("Cache-Control", "no-cache, no-transform");
      res.setHeader("Connection", "keep-alive");
      res.setHeader("X-Accel-Buffering", "no");
      res.flushHeaders?.();
      res.write(`data: ${JSON.stringify({ type: "connected", guildId })}\n\n`);

      const unsubscribe = subscribeToGuildUpdates(guildId, res);
      const keepAlive = setInterval(() => {
        try {
          res.write(": keep-alive\n\n");
        } catch {
          // noop
        }
      }, 25000);

      req.on("close", () => {
        clearInterval(keepAlive);
        unsubscribe();
        res.end();
      });
    } catch (e: any) {
      if (!res.headersSent) {
        res.status(500).json({ error: e.message });
      }
    }
  });

  app.post("/api/guilds/:guildId/config", async (req, res) => {
    try {
      const auth = await requireGuildAccess(req, res);
      if (!auth) return;
      const { guildId, user } = auth;
      const previousConfig = await storage.getGuildConfig(guildId);
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
      let config = await storage.getGuildConfig(guildId);

      const presenceSource = typeof updates.customCategoryPings === "string"
        ? updates.customCategoryPings
        : config?.customCategoryPings;
      const propagatedPresence = parseDashboardBotPresenceForPropagation(presenceSource);
      if (propagatedPresence) {
        await propagateDashboardBotPresenceToAllGuildConfigs(propagatedPresence);
        config = await storage.getGuildConfig(guildId);
      }

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

      const newlyEnabledFeatureLabels = getNewlyEnabledFeatureLabels(
        previousConfig?.customCategoryPings,
        config?.customCategoryPings
      );
      if (newlyEnabledFeatureLabels.length > 0 && config?.commandLogChannelId) {
        await postFeatureUpdateToChannel(guildId, config.commandLogChannelId, newlyEnabledFeatureLabels);
      }

      broadcastGuildUpdate(guildId, {
        type: "config-updated",
        guildId,
        config: config || {},
        editorId: user.id,
      });
      
      res.json({ success: true, config });
    } catch (e: any) {
      res.status(500).json({ error: e.message });
    }
  });

  // ── Roster CRUD ───────────────────────────────────────────────────────────

  // GET all rosters for a guild
  app.get("/api/guilds/:guildId/rosters", async (req, res) => {
    try {
      const auth = await requireGuildAccess(req, res);
      if (!auth) return;
      const { guildId } = auth;
      const rosters = await getRostersWithEmbedConfigs(guildId);
      res.json({ rosters });
    } catch (e: any) {
      res.status(500).json({ error: e.message });
    }
  });

  // POST create roster
  app.post("/api/guilds/:guildId/rosters", async (req, res) => {
    try {
      const auth = await requireGuildAccess(req, res);
      if (!auth) return;
      const { guildId, user } = auth;
      const { name, roleIds, channelId } = req.body || {};
      if (!name || typeof name !== "string" || !name.trim()) {
        return res.status(400).json({ error: "Roster name is required." });
      }

      const existing = await storage.getRosterConfig(guildId, name.trim());
      if (existing) {
        return res.status(400).json({ error: "A roster with that name already exists." });
      }

      const roster = await storage.createRosterConfig({
        guildId,
        name: name.trim(),
        roleIds: Array.isArray(roleIds) ? roleIds.map(String).filter(Boolean) : [],
        channelId: channelId || null,
        messageId: null,
      });
      const rosters = await getRostersWithEmbedConfigs(guildId);
      broadcastGuildUpdate(guildId, {
        type: "rosters-updated",
        guildId,
        rosters,
        editorId: user.id,
      });
      res.json({ success: true, roster });
    } catch (e: any) {
      res.status(500).json({ error: e.message });
    }
  });

  // PUT update roster
  app.put("/api/guilds/:guildId/rosters/:rosterName", async (req, res) => {
    try {
      const auth = await requireGuildAccess(req, res);
      if (!auth) return;
      const { guildId, user } = auth;
      const { rosterName } = req.params;
      const { roleIds, channelId, messageId } = req.body || {};
      const updated = await storage.updateRosterConfig(guildId, rosterName, {
        roleIds: Array.isArray(roleIds) ? roleIds.map(String).filter(Boolean) : undefined,
        channelId: channelId !== undefined ? (channelId || null) : undefined,
        messageId: messageId !== undefined ? (messageId || null) : undefined,
      });
      if (!updated) {
        return res.status(404).json({ error: "Roster not found." });
      }
      const rosters = await getRostersWithEmbedConfigs(guildId);
      broadcastGuildUpdate(guildId, {
        type: "rosters-updated",
        guildId,
        rosters,
        editorId: user.id,
      });
      res.json({ success: true, roster: updated });
    } catch (e: any) {
      res.status(500).json({ error: e.message });
    }
  });

  // DELETE roster
  app.delete("/api/guilds/:guildId/rosters/:rosterName", async (req, res) => {
    try {
      const auth = await requireGuildAccess(req, res);
      if (!auth) return;
      const { guildId, user } = auth;
      const { rosterName } = req.params;
      await storage.deleteRosterConfig(guildId, rosterName);

      const existingConfig = await storage.getGuildConfig(guildId);
      const embedConfigs = getRosterEmbedConfigs(existingConfig?.customCategoryPings);
      delete embedConfigs[String(rosterName || "").toLowerCase()];
      await storage.upsertGuildConfig({
        guildId,
        customCategoryPings: writeRosterEmbedConfigs(existingConfig?.customCategoryPings, embedConfigs),
      });

      const rosters = await getRostersWithEmbedConfigs(guildId);
      broadcastGuildUpdate(guildId, {
        type: "rosters-updated",
        guildId,
        rosters,
        editorId: user.id,
      });
      res.json({ success: true });
    } catch (e: any) {
      res.status(500).json({ error: e.message });
    }
  });

  // POST /rosters/:rosterName/post — send/refresh roster message to its channel
  app.post("/api/guilds/:guildId/rosters/:rosterName/post", async (req, res) => {
    try {
      const auth = await requireGuildAccess(req, res);
      if (!auth) return;
      const { guildId, user } = auth;
      const { rosterName } = req.params;
      const { channelId: overrideChannelId } = req.body || {};

      const roster = await storage.getRosterConfig(guildId, rosterName);
      if (!roster) return res.status(404).json({ error: "Roster not found." });

      const channelId = overrideChannelId || roster.channelId;
      if (!channelId) return res.status(400).json({ error: "No channel configured for this roster. Edit the roster and set a channel first." });

      if (!client.isReady()) return res.status(503).json({ error: "Bot is not online. Start the bot before posting rosters." });

      const guild = client.guilds.cache.get(guildId);
      if (!guild) return res.status(400).json({ error: "Bot is not in this server." });

      // Fetch members so the role member lists are fresh
      try { await guild.members.fetch({ time: 15000 }); } catch { /* use cached */ }

      // Build roster content
      const displayName = roster.name.charAt(0).toUpperCase() + roster.name.slice(1);
      let content = `**${displayName} Roster**\n\n`;
      for (const roleId of roster.roleIds) {
        const role = guild.roles.cache.get(roleId);
        if (!role) continue;
        content += `<@&${roleId}>\n`;
        const members = role.members.map((m: any) => `<@${m.id}>`);
        content += (members.length === 0 ? "N/A" : members.join("\n")) + "\n\n";
      }

      const channel = await client.channels.fetch(channelId).catch(() => null);
      if (!channel || !("send" in channel)) return res.status(400).json({ error: "Could not find the channel. Make sure the bot has access to it." });

      let postedMessageId = roster.messageId;

      if (postedMessageId) {
        try {
          const existing = await (channel as any).messages.fetch(postedMessageId);
          await existing.edit({ content });
        } catch {
          // old message gone — post fresh
          const newMsg = await (channel as any).send({ content });
          postedMessageId = newMsg.id;
        }
      } else {
        const newMsg = await (channel as any).send({ content });
        postedMessageId = newMsg.id;
      }

      // Save channelId + messageId back to DB
      const updated = await storage.updateRosterConfig(guildId, rosterName, {
        messageId: postedMessageId ?? undefined,
        channelId,
      });

      const rosters = await getRostersWithEmbedConfigs(guildId);
      broadcastGuildUpdate(guildId, {
        type: "rosters-updated",
        guildId,
        rosters,
        editorId: user.id,
      });

      res.json({ success: true, roster: updated });
    } catch (e: any) {
      res.status(500).json({ error: e.message });
    }
  });

  app.put("/api/guilds/:guildId/rosters/:rosterName/embed-config", async (req, res) => {
    try {
      const auth = await requireGuildAccess(req, res);
      if (!auth) return;
      const { guildId, user } = auth;
      const { rosterName } = req.params;
      const normalizedRosterName = String(rosterName || "").trim().toLowerCase();
      if (!normalizedRosterName) return res.status(400).json({ error: "Roster name is required." });

      const roster = await storage.getRosterConfig(guildId, normalizedRosterName);
      if (!roster) return res.status(404).json({ error: "Roster not found." });

      const normalizedConfig = normalizeRosterEmbedConfig(req.body || {});
      if (!normalizedConfig) {
        return res.status(400).json({ error: "Embed config requires title, description, and at least one valid button." });
      }

      const existingConfig = await storage.getGuildConfig(guildId);
      const embedConfigs = getRosterEmbedConfigs(existingConfig?.customCategoryPings);
      embedConfigs[normalizedRosterName] = {
        ...normalizedConfig,
        messageId: embedConfigs[normalizedRosterName]?.messageId || null,
      };

      await storage.upsertGuildConfig({
        guildId,
        customCategoryPings: writeRosterEmbedConfigs(existingConfig?.customCategoryPings, embedConfigs),
      });

      const rosters = await getRostersWithEmbedConfigs(guildId);
      const updatedRoster = rosters.find((entry) => String((entry as any).name || "").toLowerCase() === normalizedRosterName) || null;

      broadcastGuildUpdate(guildId, {
        type: "rosters-updated",
        guildId,
        rosters,
        editorId: user.id,
      });

      res.json({ success: true, roster: updatedRoster });
    } catch (e: any) {
      res.status(500).json({ error: e.message });
    }
  });

  app.post("/api/guilds/:guildId/rosters/:rosterName/post-embed", async (req, res) => {
    try {
      const auth = await requireGuildAccess(req, res);
      if (!auth) return;
      const { guildId, user } = auth;
      const { rosterName } = req.params;
      const normalizedRosterName = String(rosterName || "").trim().toLowerCase();
      if (!normalizedRosterName) return res.status(400).json({ error: "Roster name is required." });

      if (!client.isReady()) return res.status(503).json({ error: "Bot is not online. Start the bot before posting roster embeds." });

      const guild = client.guilds.cache.get(guildId);
      if (!guild) return res.status(400).json({ error: "Bot is not in this server." });

      const existingConfig = await storage.getGuildConfig(guildId);
      const embedConfigs = getRosterEmbedConfigs(existingConfig?.customCategoryPings);
      const embedConfig = embedConfigs[normalizedRosterName];
      if (!embedConfig) return res.status(400).json({ error: "No embed config found for this roster. Save embed config first." });

      const targetChannelId = String(req.body?.channelId || "").trim() || String(embedConfig.channelId || "").trim();
      if (!targetChannelId) return res.status(400).json({ error: "No channel configured for this roster embed." });

      let embedColor = 0x5865f2;
      if (embedConfig.embedColor) {
        const parsed = parseInt(embedConfig.embedColor.replace("#", ""), 16);
        if (!Number.isNaN(parsed) && parsed >= 0 && parsed <= 0xffffff) {
          embedColor = parsed;
        }
      }

      const missingRosters: string[] = [];
      const buttons: ButtonBuilder[] = [];
      for (const buttonConfig of embedConfig.buttons) {
        const targetRosterName = String(buttonConfig.rosterName || "").trim().toLowerCase();
        if (!targetRosterName) continue;
        const targetRoster = await storage.getRosterConfig(guildId, targetRosterName);
        if (!targetRoster) {
          missingRosters.push(targetRosterName);
          continue;
        }

        const style = buttonConfig.color === "green"
          ? ButtonStyle.Success
          : buttonConfig.color === "red"
            ? ButtonStyle.Danger
            : buttonConfig.color === "grey"
              ? ButtonStyle.Secondary
              : ButtonStyle.Primary;

        const button = new ButtonBuilder()
          .setCustomId(`roster_btn_${targetRosterName}`)
          .setLabel(buttonConfig.label)
          .setStyle(style);

        if (buttonConfig.emoji) {
          const customEmojiMatch = buttonConfig.emoji.match(/<a?:(.+):(\d+)>/);
          if (customEmojiMatch) {
            button.setEmoji({ name: customEmojiMatch[1], id: customEmojiMatch[2] });
          } else {
            button.setEmoji(buttonConfig.emoji);
          }
        }

        buttons.push(button);
      }

      if (missingRosters.length > 0) {
        return res.status(400).json({ error: `The following rosters don't exist: ${missingRosters.join(", ")}.` });
      }

      if (buttons.length === 0) {
        return res.status(400).json({ error: "No valid embed buttons to post." });
      }

      const targetChannel = await client.channels.fetch(targetChannelId).catch(() => null);
      if (!targetChannel || !("send" in targetChannel)) {
        return res.status(400).json({ error: "Could not find the embed channel. Make sure the bot has access." });
      }

      const embed = new EmbedBuilder()
        .setTitle(embedConfig.title)
        .setDescription(embedConfig.description)
        .setColor(embedColor);
      const row = new ActionRowBuilder<ButtonBuilder>().addComponents(buttons.slice(0, 5));

      let postedMessageId = String(embedConfig.messageId || "").trim() || null;
      if (postedMessageId) {
        try {
          const existing = await (targetChannel as any).messages.fetch(postedMessageId);
          await existing.edit({ embeds: [embed], components: [row] });
        } catch {
          const newMessage = await (targetChannel as any).send({ embeds: [embed], components: [row] });
          postedMessageId = newMessage.id;
        }
      } else {
        const newMessage = await (targetChannel as any).send({ embeds: [embed], components: [row] });
        postedMessageId = newMessage.id;
      }

      embedConfigs[normalizedRosterName] = {
        ...embedConfig,
        channelId: targetChannelId,
        messageId: postedMessageId,
      };

      await storage.upsertGuildConfig({
        guildId,
        customCategoryPings: writeRosterEmbedConfigs(existingConfig?.customCategoryPings, embedConfigs),
      });

      const rosters = await getRostersWithEmbedConfigs(guildId);
      const updatedRoster = rosters.find((entry) => String((entry as any).name || "").toLowerCase() === normalizedRosterName) || null;

      broadcastGuildUpdate(guildId, {
        type: "rosters-updated",
        guildId,
        rosters,
        editorId: user.id,
      });

      res.json({ success: true, roster: updatedRoster });
    } catch (e: any) {
      res.status(500).json({ error: e.message });
    }
  });

  return httpServer;
}
