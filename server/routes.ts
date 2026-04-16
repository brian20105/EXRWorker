import type { Express, Request, Response } from "express";
import { createServer, type Server } from "http";
import { storage } from "./storage";
import { client } from "./bot";
import { guildConfigs, insertGuildConfigSchema } from "@shared/schema";
import crypto from "crypto";
import fs from "fs";
import path from "path";
import { spawn as spawnProcess, execFile as execFileAsync } from "child_process";
import { ActivityType, PermissionFlagsBits, EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle, Client, GatewayIntentBits, AuditLogEvent, StringSelectMenuBuilder, StringSelectMenuOptionBuilder } from "discord.js";
import { db } from "./sql";
import { promisify } from "util";
import { readOwnerGuildSnapshot } from "./owner-guild-snapshot";
import { readOwnerBotDesiredState, writeOwnerBotDesiredState } from "./owner-bot-state";

const execFile = promisify(execFileAsync);

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
const GUILD_ACCESS_COOKIE_NAME = "dashboard_guild_access";
const OAUTH_STATE_COOKIE = "dashboard_oauth_state";
const PRIVILEGED_DASHBOARD_USER_IDS = new Set(["948598563359817728", "944385000059600896"]);
const OWNER_BOT_PID_FILE = path.resolve(process.cwd(), ".owner-bot.pid");
const DASHBOARD_FEATURE_FLAGS_KEY = "__dashboardFeatureFlags";
const DASHBOARD_BOT_DISABLED_KEY = "__botDisabled";
const DASHBOARD_SECURITY_SETTINGS_KEY = "__dashboardSecuritySettings";
const DASHBOARD_BLACKLIST_USERS_KEY = "__dashboardBlacklistedUsers";
const DASHBOARD_FEATURE_POST_CHANNELS_KEY = "__dashboardFeaturePostChannels";
const DASHBOARD_REACTION_ROLE_SETUP_KEY = "__reactionRoleSetup";
const GUILDS_CACHE_TTL_MS = 60 * 1000;
const ACCESS_CACHE_TTL_MS = 5 * 60 * 1000;

let cachedGuildSummaries: DashboardGuildSummary[] = [];
let cachedGuildSummariesAt = 0;
const accessDecisionCache = new Map<string, { allowed: boolean; checkedAt: number }>();
const guildConfigMutationLocks = new Map<string, Promise<void>>();

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

type GuildAccessGrant = {
  userId: string;
  guildIds: string[];
  issuedAt: number;
};

function signGuildAccessGrant(grant: GuildAccessGrant): string {
  const payload = toBase64Url(JSON.stringify(grant));
  const signature = crypto.createHmac("sha256", getAuthSecret()).update(payload).digest("base64url");
  return `${payload}.${signature}`;
}

function verifyGuildAccessGrant(token: string | undefined): GuildAccessGrant | null {
  if (!token || !token.includes(".")) return null;
  const [payload, signature] = token.split(".");
  if (!payload || !signature) return null;

  const expected = crypto.createHmac("sha256", getAuthSecret()).update(payload).digest("base64url");
  if (signature !== expected) return null;

  try {
    const parsed = JSON.parse(fromBase64Url(payload));
    if (!parsed?.userId || !Array.isArray(parsed?.guildIds) || typeof parsed?.issuedAt !== "number") return null;
    return {
      userId: String(parsed.userId),
      guildIds: parsed.guildIds.map((entry: unknown) => String(entry || "").trim()).filter(Boolean),
      issuedAt: Number(parsed.issuedAt),
    };
  } catch {
    return null;
  }
}

function getGrantedGuildIds(req: Request, userId: string): string[] {
  const token = parseCookie(req, GUILD_ACCESS_COOKIE_NAME);
  const grant = verifyGuildAccessGrant(token);
  if (!grant || grant.userId !== userId) return [];
  const maxAgeMs = 12 * 60 * 60 * 1000;
  if ((Date.now() - grant.issuedAt) > maxAgeMs) return [];
  return grant.guildIds;
}

function rememberGuildAccess(req: Request, res: Response, userId: string, guildId: string) {
  const nextGuildIds = Array.from(new Set([...getGrantedGuildIds(req, userId), guildId]));
  const token = signGuildAccessGrant({ userId, guildIds: nextGuildIds, issuedAt: Date.now() });
  const secure = (req.headers["x-forwarded-proto"] || req.protocol) === "https";
  const cookie = `${GUILD_ACCESS_COOKIE_NAME}=${encodeURIComponent(token)}; Path=/; HttpOnly; SameSite=Lax; Max-Age=${60 * 60 * 12}${secure ? "; Secure" : ""}`;
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

function getDiscordBotToken(): string | null {
  const token = String(process.env.DISCORD_BOT_TOKEN || "").trim();
  return token || null;
}

async function discordBotApiRequest<T = any>(pathname: string, init?: RequestInit): Promise<T> {
  const token = getDiscordBotToken();
  if (!token) {
    throw new Error("DISCORD_BOT_TOKEN is not configured.");
  }

  const response = await fetch(`https://discord.com/api/v10${pathname}`, {
    method: init?.method || "GET",
    headers: {
      Authorization: `Bot ${token}`,
      "Content-Type": "application/json",
      ...(init?.headers || {}),
    },
    body: init?.body,
  });

  const rawText = await response.text().catch(() => "");
  const payload = rawText ? JSON.parse(rawText) : null;
  if (!response.ok) {
    throw new Error(String((payload as any)?.message || `Discord API request failed (HTTP ${response.status})`));
  }

  return payload as T;
}

function buildDiscordAvatarUrl(userId: string | null | undefined, avatarHash: string | null | undefined): string | null {
  if (!userId || !avatarHash) return null;
  const extension = avatarHash.startsWith("a_") ? "gif" : "png";
  return `https://cdn.discordapp.com/avatars/${userId}/${avatarHash}.${extension}?size=64`;
}

async function withGuildConfigMutationLock<T>(guildId: string, task: () => Promise<T>): Promise<T> {
  const previous = guildConfigMutationLocks.get(guildId) || Promise.resolve();
  let release!: () => void;
  const current = new Promise<void>((resolve) => {
    release = resolve;
  });

  guildConfigMutationLocks.set(guildId, previous.then(() => current));
  await previous;

  try {
    return await task();
  } finally {
    release();
  }
}

type StaffApplicationBlockEntry = {
  blockedById: string;
  reason: string | null;
  expiresAt: string | null;
};

type DashboardBlacklistEntry = {
  blacklistedById: string;
  reason: string | null;
  createdAt: string | null;
};

function getStaffApplicationBlocksFromConfig(raw: unknown): Record<string, StaffApplicationBlockEntry> {
  const root = parseDashboardConfigObject(raw);
  const blocksRaw = root.__staffApplicationBlocks;
  if (!blocksRaw || typeof blocksRaw !== "object" || Array.isArray(blocksRaw)) {
    return {};
  }

  const result: Record<string, StaffApplicationBlockEntry> = {};
  for (const [userId, value] of Object.entries(blocksRaw as Record<string, unknown>)) {
    if (!value || typeof value !== "object" || Array.isArray(value)) continue;
    const entry = value as Record<string, unknown>;
    result[userId] = {
      blockedById: String(entry.blockedById || ""),
      reason: typeof entry.reason === "string" ? entry.reason : null,
      expiresAt: typeof entry.expiresAt === "string" ? entry.expiresAt : null,
    };
  }

  return result;
}

function writeStaffApplicationBlockToConfig(
  existingCustomCategoryPings: string | null | undefined,
  userId: string,
  block: StaffApplicationBlockEntry,
): string {
  const root = parseDashboardConfigObject(existingCustomCategoryPings);
  const existing = getStaffApplicationBlocksFromConfig(existingCustomCategoryPings);
  root.__staffApplicationBlocks = {
    ...existing,
    [userId]: block,
  };
  return JSON.stringify(root);
}

function removeStaffApplicationBlockFromConfig(existingCustomCategoryPings: string | null | undefined, userId: string): string {
  const root = parseDashboardConfigObject(existingCustomCategoryPings);
  const existing = getStaffApplicationBlocksFromConfig(existingCustomCategoryPings);
  if (existing[userId]) {
    delete existing[userId];
  }
  root.__staffApplicationBlocks = existing;
  return JSON.stringify(root);
}

function getBlacklistedUsersFromConfig(raw: unknown): Record<string, DashboardBlacklistEntry> {
  const root = parseDashboardConfigObject(raw);
  const blacklistRaw = root[DASHBOARD_BLACKLIST_USERS_KEY];
  if (!blacklistRaw || typeof blacklistRaw !== "object" || Array.isArray(blacklistRaw)) {
    return {};
  }

  const result: Record<string, DashboardBlacklistEntry> = {};
  for (const [userId, value] of Object.entries(blacklistRaw as Record<string, unknown>)) {
    if (!value || typeof value !== "object" || Array.isArray(value)) continue;
    const entry = value as Record<string, unknown>;
    result[userId] = {
      blacklistedById: String(entry.blacklistedById || ""),
      reason: typeof entry.reason === "string" ? entry.reason : null,
      createdAt: typeof entry.createdAt === "string" ? entry.createdAt : null,
    };
  }

  return result;
}

function writeBlacklistedUserToConfig(
  existingCustomCategoryPings: string | null | undefined,
  userId: string,
  entry: DashboardBlacklistEntry,
): string {
  const root = parseDashboardConfigObject(existingCustomCategoryPings);
  const existing = getBlacklistedUsersFromConfig(existingCustomCategoryPings);
  root[DASHBOARD_BLACKLIST_USERS_KEY] = {
    ...existing,
    [userId]: entry,
  };
  return JSON.stringify(root);
}

function removeBlacklistedUserFromConfig(existingCustomCategoryPings: string | null | undefined, userId: string): string {
  const root = parseDashboardConfigObject(existingCustomCategoryPings);
  const existing = getBlacklistedUsersFromConfig(existingCustomCategoryPings);
  if (existing[userId]) {
    delete existing[userId];
  }
  root[DASHBOARD_BLACKLIST_USERS_KEY] = existing;
  return JSON.stringify(root);
}

function mergeProtectedCustomCategoryCollections(nextRaw: unknown, previousRaw: unknown): string {
  const next = parseDashboardConfigObject(nextRaw);
  const previous = parseDashboardConfigObject(previousRaw);
  const protectedKeys = [DASHBOARD_BLACKLIST_USERS_KEY, "__staffApplicationBlocks"];
  const mergedSecuritySettings = mergeDashboardSecuritySettings(
    previous[DASHBOARD_SECURITY_SETTINGS_KEY],
    next[DASHBOARD_SECURITY_SETTINGS_KEY],
  );

  if (mergedSecuritySettings) {
    next[DASHBOARD_SECURITY_SETTINGS_KEY] = mergedSecuritySettings;
  }

  for (const key of protectedKeys) {
    const previousValue = previous[key];
    const nextValue = next[key];
    if (previousValue && typeof previousValue === "object" && !Array.isArray(previousValue)) {
      next[key] = {
        ...(previousValue as Record<string, unknown>),
        ...(nextValue && typeof nextValue === "object" && !Array.isArray(nextValue)
          ? nextValue as Record<string, unknown>
          : {}),
      };
    }
  }

  return JSON.stringify(next, null, 2);
}

function isBlockStillActive(expiresAt: string | Date | null | undefined): boolean {
  if (!expiresAt) return true;
  const expiresMs = new Date(expiresAt).getTime();
  return Number.isFinite(expiresMs) && expiresMs > Date.now();
}

async function resolveDiscordUserSummary(userId: string | null | undefined, guildId?: string): Promise<{ userId: string | null; username: string; avatarUrl: string | null }> {
  const normalizedUserId = String(userId || "").trim();
  if (!normalizedUserId) {
    return { userId: null, username: "Unknown user", avatarUrl: null };
  }

  if (getDiscordBotToken()) {
    const member = guildId
      ? await discordBotApiRequest<any>(`/guilds/${guildId}/members/${normalizedUserId}`).catch(() => null)
      : null;
    const user = member?.user || await discordBotApiRequest<any>(`/users/${normalizedUserId}`).catch(() => null);

    if (user) {
      return {
        userId: normalizedUserId,
        username: String(member?.nick || user?.global_name || user?.username || normalizedUserId),
        avatarUrl: buildDiscordAvatarUrl(normalizedUserId, user?.avatar || null),
      };
    }
  }

  if (client.isReady()) {
    const guild = guildId ? client.guilds.cache.get(guildId) : null;
    const member = guild ? await guild.members.fetch(normalizedUserId).catch(() => null) : null;
    const user = member?.user || client.users.cache.get(normalizedUserId) || await client.users.fetch(normalizedUserId).catch(() => null);

    if (user) {
      return {
        userId: normalizedUserId,
        username: String(member?.displayName || user?.displayName || user?.globalName || user?.username || normalizedUserId),
        avatarUrl: typeof user.displayAvatarURL === "function" ? user.displayAvatarURL({ size: 64 }) : null,
      };
    }
  }

  return {
    userId: normalizedUserId,
    username: normalizedUserId,
    avatarUrl: null,
  };
}

function readOwnerBotPid(): number | null {
  try {
    const raw = fs.readFileSync(OWNER_BOT_PID_FILE, "utf8").trim();
    const parsed = Number(raw);
    return Number.isFinite(parsed) && parsed > 0 ? parsed : null;
  } catch {
    return null;
  }
}

function writeOwnerBotPid(pid: number) {
  try {
    fs.writeFileSync(OWNER_BOT_PID_FILE, String(pid), "utf8");
  } catch {
    // ignore pid write errors
  }
}

function clearOwnerBotPid() {
  try {
    fs.unlinkSync(OWNER_BOT_PID_FILE);
  } catch {
    // ignore if missing
  }
}

function isPidRunning(pid: number): boolean {
  try {
    process.kill(pid, 0);
    return true;
  } catch {
    return false;
  }
}

async function killOwnerBotPid(pid: number): Promise<void> {
  if (process.platform === "win32") {
    await new Promise<void>((resolve, reject) => {
      const killer = spawnProcess("taskkill", ["/PID", String(pid), "/T", "/F"], { stdio: "ignore" });
      killer.on("exit", (code) => {
        if (code === 0 || code === 128) resolve();
        else reject(new Error(`taskkill exited with code ${code}`));
      });
      killer.on("error", reject);
    });
    return;
  }

  process.kill(pid, "SIGTERM");
}

async function getBotRunnerPids(): Promise<number[]> {
  try {
    if (process.platform === "win32") {
      const psScript = [
        "$procs = Get-CimInstance Win32_Process | Where-Object { $_.CommandLine -like '*server/run-bot.ts*' } | Select-Object -ExpandProperty ProcessId",
        "if ($procs) { $procs -join ',' }",
      ].join("; ");

      const { stdout } = await execFile("powershell", ["-NoProfile", "-Command", psScript]);
      const output = String(stdout || "").trim();
      if (!output) return [];
      return output
        .split(",")
        .map((value) => Number(String(value).trim()))
        .filter((value) => Number.isFinite(value) && value > 0);
    }

    const { stdout } = await execFile("pgrep", ["-f", "server/run-bot.ts"]);
    return String(stdout || "")
      .split(/\s+/)
      .map((value) => Number(String(value).trim()))
      .filter((value) => Number.isFinite(value) && value > 0);
  } catch {
    return [];
  }
}

function requireOwnerAccess(req: Request, res: Response): DashboardSessionUser | null {
  const user = getCurrentUser(req);
  if (!user) {
    res.status(401).json({ error: "Unauthorized" });
    return null;
  }
  if (!PRIVILEGED_DASHBOARD_USER_IDS.has(user.id)) {
    res.status(403).json({ error: "Access denied. Owner dashboard only." });
    return null;
  }
  return user;
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
    const uniqueGuildIds: string[] = Array.from(new Set(
      configRows
        .map((row: { guildId: string | null }) => String(row.guildId || "").trim())
        .filter(Boolean),
    ));
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

function parseDashboardConfigObject(raw: unknown): Record<string, unknown> {
  if (typeof raw !== "string") return {};

  try {
    const parsed = JSON.parse(raw);
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
      return {};
    }
    return parsed as Record<string, unknown>;
  } catch {
    return {};
  }
}

function normalizeStringList(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return Array.from(new Set(value.map((entry) => String(entry || "").trim()).filter(Boolean)));
}

const DASHBOARD_SECURITY_RULE_KEYS = [
  "antiBan",
  "antiKick",
  "antiBotAdd",
  "antiRoleUpdate",
  "antiRoleAdd",
  "antiChannelCreate",
  "antiChannelDelete",
  "antiRoleCreate",
  "antiRoleDelete",
] as const;

function toRecordObject(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value)
    ? value as Record<string, unknown>
    : {};
}

function getSecuritySettingsUpdatedAtMs(value: unknown): number {
  const settings = toRecordObject(value);
  const timestamp = Date.parse(String(settings.updatedAt || ""));
  return Number.isFinite(timestamp) ? timestamp : 0;
}

function mergeDashboardSecuritySettings(previousValue: unknown, nextValue: unknown): Record<string, unknown> | null {
  const previous = toRecordObject(previousValue);
  const next = toRecordObject(nextValue);

  if (Object.keys(previous).length === 0 && Object.keys(next).length === 0) {
    return null;
  }

  if (Object.keys(previous).length === 0) {
    return next;
  }

  if (Object.keys(next).length === 0) {
    return previous;
  }

  const previousUpdatedAtMs = getSecuritySettingsUpdatedAtMs(previous);
  const nextUpdatedAtMs = getSecuritySettingsUpdatedAtMs(next);

  if (previousUpdatedAtMs > nextUpdatedAtMs) {
    return previous;
  }

  const previousRules = toRecordObject(previous.rules);
  const nextRules = toRecordObject(next.rules);
  const mergedRules: Record<string, unknown> = { ...previousRules, ...nextRules };

  for (const ruleKey of DASHBOARD_SECURITY_RULE_KEYS) {
    const previousRule = toRecordObject(previousRules[ruleKey]);
    const nextRule = toRecordObject(nextRules[ruleKey]);
    if (Object.keys(previousRule).length === 0 && Object.keys(nextRule).length === 0) {
      continue;
    }
    mergedRules[ruleKey] = {
      ...previousRule,
      ...nextRule,
    };
  }

  return {
    ...previous,
    ...next,
    rules: mergedRules,
  };
}

function getDashboardSecurityAccessSettings(raw: unknown): { accessRoleIds: string[]; accessUserIds: string[] } {
  const parsed = parseDashboardConfigObject(raw);
  const securityRaw = parsed[DASHBOARD_SECURITY_SETTINGS_KEY];
  const security = securityRaw && typeof securityRaw === "object" && !Array.isArray(securityRaw)
    ? securityRaw as Record<string, unknown>
    : {};

  return {
    accessRoleIds: normalizeStringList(security.accessRoleIds),
    accessUserIds: normalizeStringList(security.accessUserIds),
  };
}

function getDashboardBlacklistAccessSettings(raw: unknown): { blacklistAccessRoleIds: string[]; blacklistAccessUserIds: string[] } {
  const parsed = parseDashboardConfigObject(raw);
  const securityRaw = parsed[DASHBOARD_SECURITY_SETTINGS_KEY];
  const security = securityRaw && typeof securityRaw === "object" && !Array.isArray(securityRaw)
    ? securityRaw as Record<string, unknown>
    : {};

  return {
    blacklistAccessRoleIds: normalizeStringList(security.blacklistAccessRoleIds),
    blacklistAccessUserIds: normalizeStringList(security.blacklistAccessUserIds),
  };
}

function hasDashboardSecurityAccess(userId: string, roleIds: string[], raw: unknown, fallbackAllowed = false): boolean {
  const settings = getDashboardSecurityAccessSettings(raw);
  const hasExplicitAccess = settings.accessUserIds.length > 0 || settings.accessRoleIds.length > 0;
  if (!hasExplicitAccess) {
    return fallbackAllowed;
  }
  return settings.accessUserIds.includes(userId) || settings.accessRoleIds.some((roleId) => roleIds.includes(roleId));
}

function hasDashboardBlacklistAccess(userId: string, roleIds: string[], raw: unknown, fallbackAllowed = false): boolean {
  const settings = getDashboardBlacklistAccessSettings(raw);
  const hasExplicitAccess = settings.blacklistAccessUserIds.length > 0 || settings.blacklistAccessRoleIds.length > 0;
  if (!hasExplicitAccess) {
    return fallbackAllowed;
  }
  return settings.blacklistAccessUserIds.includes(userId) || settings.blacklistAccessRoleIds.some((roleId) => roleIds.includes(roleId));
}

function stripSecuritySettingsFromDashboardConfig(raw: unknown): string {
  const parsed = parseDashboardConfigObject(raw);
  delete parsed[DASHBOARD_SECURITY_SETTINGS_KEY];
  return JSON.stringify(parsed);
}

function compareConfigValue(left: unknown, right: unknown): boolean {
  if (Array.isArray(left) || Array.isArray(right)) {
    return JSON.stringify(normalizeStringList(left)) === JSON.stringify(normalizeStringList(right));
  }

  if (left instanceof Date || right instanceof Date) {
    const leftValue = left instanceof Date ? left.toISOString() : (left == null ? null : String(left));
    const rightValue = right instanceof Date ? right.toISOString() : (right == null ? null : String(right));
    return leftValue === rightValue;
  }

  return JSON.stringify(left ?? null) === JSON.stringify(right ?? null);
}

function didSecuritySettingsChange(previousConfig: any, nextConfig: any): boolean {
  const previousParsed = parseDashboardConfigObject(previousConfig?.customCategoryPings);
  const nextParsed = parseDashboardConfigObject(nextConfig?.customCategoryPings);
  return JSON.stringify(previousParsed[DASHBOARD_SECURITY_SETTINGS_KEY] ?? null) !== JSON.stringify(nextParsed[DASHBOARD_SECURITY_SETTINGS_KEY] ?? null);
}

function hasOnlySecurityConfigChanges(previousConfig: any, nextConfig: any): boolean {
  const previous = previousConfig || {};
  const next = nextConfig || {};
  const ignoredKeys = new Set(["id", "guildId", "updatedAt", "customCategoryPings"]);
  const topLevelKeys = Array.from(new Set([...Object.keys(previous), ...Object.keys(next)])).filter((key) => !ignoredKeys.has(key));

  for (const key of topLevelKeys) {
    if (!compareConfigValue(previous[key], next[key])) {
      return false;
    }
  }

  return stripSecuritySettingsFromDashboardConfig(previous.customCategoryPings) === stripSecuritySettingsFromDashboardConfig(next.customCategoryPings);
}

function isGuildDisabledFromCustomCategoryPings(raw: unknown): boolean {
  const parsed = parseDashboardConfigObject(raw);
  return parsed[DASHBOARD_BOT_DISABLED_KEY] === true;
}

function writeGuildDisabledToCustomCategoryPings(raw: unknown, disabled: boolean): string {
  const parsed = parseDashboardConfigObject(raw);
  parsed[DASHBOARD_BOT_DISABLED_KEY] = disabled;
  return JSON.stringify(parsed, null, 2);
}

async function canManageGuildDashboard(userId: string, guildId: string): Promise<boolean> {
  if (PRIVILEGED_DASHBOARD_USER_IDS.has(userId)) {
    return true;
  }

  if (client.isReady()) {
    const guild = client.guilds.cache.get(guildId);
    if (!guild) return false;

    if (guild.ownerId === userId) {
      return true;
    }

    const member = await guild.members.fetch(userId).catch(() => null);
    if (!member) return false;

    if (member.permissions.has(PermissionFlagsBits.Administrator)) {
      return true;
    }

    const config = await storage.getGuildConfig(guildId);
    const managerRoleIds = (config?.modRoleIds || []).filter(Boolean);
    return managerRoleIds.length > 0 && managerRoleIds.some((roleId) => member.roles.cache.has(roleId));
  }

  if (!getBotToken()) return false;

  const guildResponse = await discordApiRequest(`/guilds/${guildId}`);
  const guild = (await guildResponse.json().catch(() => ({}))) as DiscordRestGuildDetails;
  if (String(guild.owner_id || "") === userId) {
    return true;
  }

  const memberResponse = await discordApiRequest(`/guilds/${guildId}/members/${userId}`);
  const member = (await memberResponse.json().catch(() => ({}))) as DiscordRestGuildMember;
  if (hasAdministratorPermission(member.permissions)) {
    return true;
  }

  const config = await storage.getGuildConfig(guildId);
  const managerRoleIds = (config?.modRoleIds || []).filter(Boolean);
  const roleIds = Array.isArray(member.roles) ? member.roles : [];
  return managerRoleIds.length > 0 && managerRoleIds.some((roleId) => roleIds.includes(roleId));
}

async function canManageSecurityDashboard(userId: string, guildId: string): Promise<boolean> {
  if (PRIVILEGED_DASHBOARD_USER_IDS.has(userId)) {
    return true;
  }

  const config = await storage.getGuildConfig(guildId);

  if (client.isReady()) {
    const guild = client.guilds.cache.get(guildId);
    if (!guild) return false;

    const member = await guild.members.fetch(userId).catch(() => null);
    if (!member) return false;

    const hasGeneralAccess = guild.ownerId === userId || member.permissions.has(PermissionFlagsBits.Administrator) || ((config?.modRoleIds || []).filter(Boolean).some((roleId) => member.roles.cache.has(roleId)));
    return hasDashboardSecurityAccess(userId, Array.from(member.roles.cache.keys()), config?.customCategoryPings, hasGeneralAccess);
  }

  if (!getBotToken()) return false;

  const guildResponse = await discordApiRequest(`/guilds/${guildId}`);
  const guild = (await guildResponse.json().catch(() => ({}))) as DiscordRestGuildDetails;
  const memberResponse = await discordApiRequest(`/guilds/${guildId}/members/${userId}`);
  const member = (await memberResponse.json().catch(() => ({}))) as DiscordRestGuildMember;
  const roleIds = Array.isArray(member.roles) ? member.roles : [];
  const hasGeneralAccess = String(guild.owner_id || "") === userId || hasAdministratorPermission(member.permissions) || ((config?.modRoleIds || []).filter(Boolean).some((roleId) => roleIds.includes(roleId)));
  return hasDashboardSecurityAccess(userId, roleIds, config?.customCategoryPings, hasGeneralAccess);
}

async function canManageBlacklistDashboard(userId: string, guildId: string): Promise<boolean> {
  if (PRIVILEGED_DASHBOARD_USER_IDS.has(userId)) {
    return true;
  }

  const config = await storage.getGuildConfig(guildId);

  if (client.isReady()) {
    const guild = client.guilds.cache.get(guildId);
    if (!guild) return false;

    const member = await guild.members.fetch(userId).catch(() => null);
    if (!member) return false;

    const roleIds = Array.from(member.roles.cache.keys());
    const hasGeneralAccess = guild.ownerId === userId || member.permissions.has(PermissionFlagsBits.Administrator) || ((config?.modRoleIds || []).filter(Boolean).some((roleId) => member.roles.cache.has(roleId)));
    const hasSecurityAccess = hasDashboardSecurityAccess(userId, roleIds, config?.customCategoryPings, hasGeneralAccess);
    return hasDashboardBlacklistAccess(userId, roleIds, config?.customCategoryPings, hasGeneralAccess || hasSecurityAccess);
  }

  if (!getBotToken()) return false;

  const guildResponse = await discordApiRequest(`/guilds/${guildId}`);
  const guild = (await guildResponse.json().catch(() => ({}))) as DiscordRestGuildDetails;
  const memberResponse = await discordApiRequest(`/guilds/${guildId}/members/${userId}`);
  const member = (await memberResponse.json().catch(() => ({}))) as DiscordRestGuildMember;
  const roleIds = Array.isArray(member.roles) ? member.roles : [];
  const hasGeneralAccess = String(guild.owner_id || "") === userId || hasAdministratorPermission(member.permissions) || ((config?.modRoleIds || []).filter(Boolean).some((roleId) => roleIds.includes(roleId)));
  const hasSecurityAccess = hasDashboardSecurityAccess(userId, roleIds, config?.customCategoryPings, hasGeneralAccess);
  return hasDashboardBlacklistAccess(userId, roleIds, config?.customCategoryPings, hasGeneralAccess || hasSecurityAccess);
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
    const hasManagerAccess = managerRoleIds.length > 0 && managerRoleIds.some((roleId) => member.roles.cache.has(roleId));
    const roleIds = Array.from(member.roles.cache.keys());
    const hasSecurityAccess = hasDashboardSecurityAccess(userId, roleIds, config?.customCategoryPings);
    const hasBlacklistAccess = hasDashboardBlacklistAccess(userId, roleIds, config?.customCategoryPings, hasSecurityAccess || hasManagerAccess);
    const allowed = hasManagerAccess || hasSecurityAccess || hasBlacklistAccess;

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
  const hasManagerAccess = managerRoleIds.length > 0 && managerRoleIds.some((roleId) => roleIds.includes(roleId));
  const hasSecurityAccess = hasDashboardSecurityAccess(userId, roleIds, config?.customCategoryPings);
  const hasBlacklistAccess = hasDashboardBlacklistAccess(userId, roleIds, config?.customCategoryPings, hasSecurityAccess || hasManagerAccess);
  const allowed = hasManagerAccess || hasSecurityAccess || hasBlacklistAccess;

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

  const config = await storage.getGuildConfig(guildId).catch(() => undefined);
  if (isGuildDisabledFromCustomCategoryPings(config?.customCategoryPings)) {
    res.status(423).json({ error: "This is current disabled, please contact the server owner to resolve the issue." });
    return null;
  }

  const grantedGuildIds = getGrantedGuildIds(req, user.id);
  if (grantedGuildIds.includes(guildId)) {
    return { user, guildId };
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

  rememberGuildAccess(req, res, user.id, guildId);

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
  "role-requests": "Role Requests",
  "ban-requests": "Ban & Unban Requests",
  activity: "Activity Tracking",
  roster: "Roster Management",
  snippets: "Snippets",
  sticky: "Sticky Messages",
  "auto-roles": "Auto Roles",
  "reaction-roles": "Reaction Roles",
};

const LATEST_BOT_UPDATE_HIGHLIGHTS = [
  "New dashboard feature: `Auto Roles` can add or remove roles when members join, with optional delays.",
  "New dashboard feature: `Reaction Roles` lets members react to get or remove server roles.",
  "Reaction Roles now support `Both Ways`, `Add Only`, and `Remove Only`, plus `Reactions`, `Buttons`, and `Dropdown Menu` picker styles.",
  "The dashboard can now publish reaction-role posts as emoji reactions, clickable buttons, or a compact dropdown role picker.",
];

function getNewlyEnabledFeatureLabels(previousRaw: unknown, currentRaw: unknown): string[] {
  const previousFlags = getDashboardFeatureFlags(previousRaw);
  const currentFlags = getDashboardFeatureFlags(currentRaw);

  return Object.entries(currentFlags)
    .filter(([key, enabled]) => enabled && !previousFlags[key])
    .map(([key]) => FEATURE_LABELS[key] || key)
    .sort((a, b) => a.localeCompare(b));
}

function getEnabledFeatureLabels(raw: unknown): string[] {
  const flags = getDashboardFeatureFlags(raw);

  return Object.entries(FEATURE_LABELS)
    .filter(([key]) => flags[key] !== false)
    .map(([, label]) => label)
    .sort((a, b) => a.localeCompare(b));
}

function getFeatureToggleChanges(previousRaw: unknown, currentRaw: unknown): { enabled: string[]; disabled: string[] } {
  const previousFlags = getDashboardFeatureFlags(previousRaw);
  const currentFlags = getDashboardFeatureFlags(currentRaw);

  const enabled = getNewlyEnabledFeatureLabels(previousRaw, currentRaw);
  const disabled = Object.entries(currentFlags)
    .filter(([key, enabled]) => !enabled && previousFlags[key] === true)
    .map(([key]) => FEATURE_LABELS[key] || key)
    .sort((a, b) => a.localeCompare(b));

  return { enabled, disabled };
}

function getDashboardQuickSettingsSummary(raw: unknown): { moderationPrefix: string; modmailPrefix: string; botNickname: string } {
  const parsed = parseDashboardConfigObject(raw);
  const value = parsed["__dashboardQuickSettings"];
  const quickSettings = value && typeof value === "object" && !Array.isArray(value)
    ? value as Record<string, unknown>
    : {};

  return {
    moderationPrefix: typeof quickSettings.moderationPrefix === "string" ? quickSettings.moderationPrefix.trim() : "",
    modmailPrefix: typeof quickSettings.modmailPrefix === "string" ? quickSettings.modmailPrefix.trim() : "",
    botNickname: typeof quickSettings.botNickname === "string" ? quickSettings.botNickname.trim() : "",
  };
}

function normalizeComparableStringArray(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return value.map((entry) => String(entry || "").trim()).filter(Boolean).sort((a, b) => a.localeCompare(b));
}

function getDashboardConfigChangeSummary(previousConfig: any, nextConfig: any): string[] {
  const previous = previousConfig || {};
  const next = nextConfig || {};
  const changes: string[] = [];

  const pushStringChange = (label: string, previousValue: unknown, nextValue: unknown, formatter?: (value: unknown) => string) => {
    const format = formatter || ((value: unknown) => String(value || "").trim());
    const before = format(previousValue);
    const after = format(nextValue);
    if (before === after) return;
    changes.push(`${label}: ${after || "cleared"}`);
  };

  const pushArrayChange = (label: string, previousValue: unknown, nextValue: unknown) => {
    const before = normalizeComparableStringArray(previousValue);
    const after = normalizeComparableStringArray(nextValue);
    if (JSON.stringify(before) === JSON.stringify(after)) return;
    changes.push(`${label}: ${after.length} role${after.length === 1 ? "" : "s"} selected`);
  };

  const channelFormatter = (value: unknown) => {
    const channelId = String(value || "").trim();
    return channelId ? `<#${channelId}>` : "cleared";
  };

  pushStringChange("Updates channel", previous.commandLogChannelId, next.commandLogChannelId, channelFormatter);
  pushStringChange("Payout request channel", previous.requestChannelId, next.requestChannelId, channelFormatter);
  pushStringChange("Payout log channel", previous.logChannelId, next.logChannelId, channelFormatter);
  pushStringChange("Modmail category", previous.modmailCategoryId, next.modmailCategoryId, channelFormatter);
  pushStringChange("Modmail log channel", previous.modmailLogChannelId, next.modmailLogChannelId, channelFormatter);
  pushStringChange("Appeal category", previous.appealCategoryId, next.appealCategoryId, channelFormatter);
  pushStringChange("Appeal log channel", previous.appealLogChannelId, next.appealLogChannelId, channelFormatter);
  pushStringChange("Quiz log channel", previous.quizLogChannelId, next.quizLogChannelId, channelFormatter);
  pushStringChange("Moderation log channel", previous.modLogChannelId, next.modLogChannelId, channelFormatter);
  pushStringChange("Staff intro channel", previous.staffIntroChannelId, next.staffIntroChannelId, channelFormatter);
  pushStringChange("Staff intro submissions", previous.staffIntroSubmissionsChannelId, next.staffIntroSubmissionsChannelId, channelFormatter);
  pushStringChange("Inactivity channel", previous.inactivityChannelId, next.inactivityChannelId, channelFormatter);
  pushStringChange("Inactivity submissions", previous.inactivitySubmissionsChannelId, next.inactivitySubmissionsChannelId, channelFormatter);
  pushStringChange("Inactivity logs", previous.inactivityLogChannelId, next.inactivityLogChannelId, channelFormatter);
  pushStringChange("Command prefix", previous.commandPrefix, next.commandPrefix, (value) => String(value || ".").trim() || ".");

  pushArrayChange("Manager roles", previous.modRoleIds, next.modRoleIds);
  pushArrayChange("Payout approval roles", previous.allowedRoleIds, next.allowedRoleIds);
  pushArrayChange("Modmail staff roles", previous.modmailStaffRoleIds, next.modmailStaffRoleIds);
  pushArrayChange("Appeal staff roles", previous.appealStaffRoleIds, next.appealStaffRoleIds);

  const previousQuickSettings = getDashboardQuickSettingsSummary(previous.customCategoryPings);
  const nextQuickSettings = getDashboardQuickSettingsSummary(next.customCategoryPings);
  pushStringChange("Moderation prefix", previousQuickSettings.moderationPrefix, nextQuickSettings.moderationPrefix, (value) => String(value || "default").trim() || "default");
  pushStringChange("Modmail prefix", previousQuickSettings.modmailPrefix, nextQuickSettings.modmailPrefix, (value) => String(value || "default").trim() || "default");
  pushStringChange("Bot nickname", previousQuickSettings.botNickname, nextQuickSettings.botNickname, (value) => String(value || "cleared").trim() || "cleared");

  const featureChanges = getFeatureToggleChanges(previous.customCategoryPings, next.customCategoryPings);
  if (featureChanges.enabled.length > 0) {
    changes.push(`Enabled features: ${featureChanges.enabled.join(", ")}`);
  }
  if (featureChanges.disabled.length > 0) {
    changes.push(`Disabled features: ${featureChanges.disabled.join(", ")}`);
  }

  return changes.slice(0, 12);
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

type SavedRosterEmbedConfig = RosterEmbedConfig & {
  id: string;
  name: string;
};

const ROSTER_EMBED_CONFIGS_KEY = "__rosterEmbedConfigs";
const ROSTER_EMBEDS_KEY = "__rosterEmbeds";

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

function normalizeSavedRosterEmbedConfig(input: unknown): SavedRosterEmbedConfig | null {
  if (!input || typeof input !== "object" || Array.isArray(input)) return null;
  const value = input as Record<string, unknown>;
  const id = String(value.id || "").trim();
  const name = String(value.name || "").trim();
  const baseConfig = normalizeRosterEmbedConfig(value);
  if (!id || !name || !baseConfig) return null;
  return {
    id,
    name,
    ...baseConfig,
  };
}

function getSavedRosterEmbeds(raw: unknown): SavedRosterEmbedConfig[] {
  const parsed = parseJsonObject(raw);
  const rawEmbeds = parsed[ROSTER_EMBEDS_KEY];
  if (!Array.isArray(rawEmbeds)) return [];
  return rawEmbeds
    .map((entry) => normalizeSavedRosterEmbedConfig(entry))
    .filter(Boolean) as SavedRosterEmbedConfig[];
}

function writeSavedRosterEmbeds(raw: unknown, embeds: SavedRosterEmbedConfig[]): string {
  const parsed = parseJsonObject(raw);
  parsed[ROSTER_EMBEDS_KEY] = embeds;
  return JSON.stringify(parsed);
}

type DashboardReactionRoleMode = "both" | "add_only" | "remove_only";
type DashboardReactionRolePickerStyle = "reactions" | "buttons" | "dropdown";

type DashboardReactionRoleItem = {
  id: string;
  emoji: string;
  roleId: string;
  mode: DashboardReactionRoleMode;
};

type DashboardReactionRoleSetup = {
  name: string;
  channelId: string | null;
  useExistingMessage: boolean;
  existingMessageInput: string;
  messageId: string | null;
  pickerStyle: DashboardReactionRolePickerStyle;
  embedTitle: string;
  embedDescription: string;
  embedColor: string;
  authorName: string;
  authorIcon: string;
  footerText: string;
  footerIcon: string;
  thumbnailUrl: string;
  imageUrl: string;
  items: DashboardReactionRoleItem[];
};

const DEFAULT_REACTION_ROLE_SETUP: DashboardReactionRoleSetup = {
  name: "Reaction Roles",
  channelId: null,
  useExistingMessage: false,
  existingMessageInput: "",
  messageId: null,
  pickerStyle: "reactions",
  embedTitle: "Reaction Roles",
  embedDescription: "Use the controls below to manage your roles.",
  embedColor: "5865f2",
  authorName: "",
  authorIcon: "",
  footerText: "",
  footerIcon: "",
  thumbnailUrl: "",
  imageUrl: "",
  items: [],
};

function normalizeReactionRoleSetup(input: unknown): DashboardReactionRoleSetup {
  if (!input || typeof input !== "object" || Array.isArray(input)) {
    return { ...DEFAULT_REACTION_ROLE_SETUP };
  }

  const value = input as Record<string, unknown>;
  const items = Array.isArray(value.items)
    ? value.items.map((entry) => {
        if (!entry || typeof entry !== "object" || Array.isArray(entry)) return null;
        const item = entry as Record<string, unknown>;
        const emoji = String(item.emoji || "").trim();
        const roleId = String(item.roleId || "").trim();
        const rawMode = String(item.mode || "both").toLowerCase();
        if (!roleId) return null;
        return {
          id: String(item.id || `${roleId}-${emoji || "role"}`).trim() || `${roleId}-${emoji || "role"}`,
          emoji,
          roleId,
          mode: rawMode === "add_only" || rawMode === "remove_only" ? rawMode : "both",
        } as DashboardReactionRoleItem;
      }).filter(Boolean) as DashboardReactionRoleItem[]
    : [];

  return {
    name: String(value.name || DEFAULT_REACTION_ROLE_SETUP.name).trim() || DEFAULT_REACTION_ROLE_SETUP.name,
    channelId: String(value.channelId || "").trim() || null,
    useExistingMessage: value.useExistingMessage === true,
    existingMessageInput: typeof value.existingMessageInput === "string" ? value.existingMessageInput : "",
    messageId: String(value.messageId || "").trim() || null,
    pickerStyle: value.pickerStyle === "buttons" || value.pickerStyle === "dropdown" ? value.pickerStyle : "reactions",
    embedTitle: String(value.embedTitle || DEFAULT_REACTION_ROLE_SETUP.embedTitle).trim() || DEFAULT_REACTION_ROLE_SETUP.embedTitle,
    embedDescription: String(value.embedDescription || DEFAULT_REACTION_ROLE_SETUP.embedDescription).trim() || DEFAULT_REACTION_ROLE_SETUP.embedDescription,
    embedColor: String(value.embedColor || DEFAULT_REACTION_ROLE_SETUP.embedColor).trim().replace(/[^0-9a-f]/gi, "").slice(0, 6) || DEFAULT_REACTION_ROLE_SETUP.embedColor,
    authorName: typeof value.authorName === "string" ? value.authorName.trim() : DEFAULT_REACTION_ROLE_SETUP.authorName,
    authorIcon: typeof value.authorIcon === "string" ? value.authorIcon.trim() : DEFAULT_REACTION_ROLE_SETUP.authorIcon,
    footerText: typeof value.footerText === "string" ? value.footerText.trim() : DEFAULT_REACTION_ROLE_SETUP.footerText,
    footerIcon: typeof value.footerIcon === "string" ? value.footerIcon.trim() : DEFAULT_REACTION_ROLE_SETUP.footerIcon,
    thumbnailUrl: typeof value.thumbnailUrl === "string" ? value.thumbnailUrl.trim() : DEFAULT_REACTION_ROLE_SETUP.thumbnailUrl,
    imageUrl: typeof value.imageUrl === "string" ? value.imageUrl.trim() : DEFAULT_REACTION_ROLE_SETUP.imageUrl,
    items,
  };
}

function getReactionRoleSetup(raw: unknown): DashboardReactionRoleSetup {
  const parsed = parseJsonObject(raw);
  return normalizeReactionRoleSetup(parsed[DASHBOARD_REACTION_ROLE_SETUP_KEY]);
}

function writeReactionRoleSetup(raw: unknown, setup: DashboardReactionRoleSetup, channelId?: string | null): string {
  const parsed = parseJsonObject(raw);
  const normalizedChannelId = String(channelId || setup.channelId || "").trim() || null;
  parsed[DASHBOARD_REACTION_ROLE_SETUP_KEY] = {
    ...setup,
    channelId: normalizedChannelId,
    messageId: String(setup.messageId || "").trim() || null,
    items: setup.items,
  };

  const currentPostChannels = parsed[DASHBOARD_FEATURE_POST_CHANNELS_KEY];
  const nextPostChannels = currentPostChannels && typeof currentPostChannels === "object" && !Array.isArray(currentPostChannels)
    ? { ...(currentPostChannels as Record<string, unknown>) }
    : {};

  if (normalizedChannelId) {
    nextPostChannels["reaction-roles"] = normalizedChannelId;
    parsed[DASHBOARD_FEATURE_POST_CHANNELS_KEY] = nextPostChannels;
  }

  return JSON.stringify(parsed);
}

function extractDiscordMessageTarget(value?: string | null): { channelId: string | null; messageId: string | null } {
  const trimmed = String(value || "").trim();
  if (!trimmed) return { channelId: null, messageId: null };

  const linkMatch = trimmed.match(/^https?:\/\/(?:canary\.)?discord(?:app)?\.com\/channels\/\d+\/(\d{17,20})\/(\d{17,20})$/i);
  if (linkMatch) {
    return {
      channelId: linkMatch[1] || null,
      messageId: linkMatch[2] || null,
    };
  }

  if (/^\d{17,20}$/.test(trimmed)) {
    return { channelId: null, messageId: trimmed };
  }

  return { channelId: null, messageId: null };
}

function normalizeReactionEmojiValue(value?: string | null): string {
  const trimmed = String(value || "").trim();
  if (!trimmed) return "";

  const customMatch = trimmed.match(/^<a?:([^:>]+):(\d{17,20})>$/);
  if (customMatch) {
    return `${customMatch[1]}:${customMatch[2]}`;
  }

  const emojiById = trimmed.match(/^(\d{17,20})$/);
  if (emojiById?.[1]) {
    const emoji = client.emojis.cache.get(emojiById[1]);
    if (emoji?.name) {
      return `${emoji.name}:${emoji.id}`;
    }
  }

  return trimmed;
}

function getReactionRoleModeLabel(mode: DashboardReactionRoleMode): string {
  return mode === "add_only" ? "Add only" : mode === "remove_only" ? "Remove only" : "Toggle";
}

function getReactionRoleButtonStyle(mode: DashboardReactionRoleMode): ButtonStyle {
  return mode === "add_only" ? ButtonStyle.Success : mode === "remove_only" ? ButtonStyle.Danger : ButtonStyle.Primary;
}

function trySetReactionRoleComponentEmoji(component: any, emojiValue?: string | null): void {
  const trimmed = String(emojiValue || "").trim();
  if (!trimmed) return;

  const normalizedCustom = trimmed
    .replace(/^<a?:/, "")
    .replace(/^a:/, "")
    .replace(/^</, "")
    .replace(/>$/, "");
  const customMatch = normalizedCustom.match(/^([^:>]+):(\d{17,20})$/);

  try {
    if (customMatch) {
      component.setEmoji({
        name: customMatch[1],
        id: customMatch[2],
        animated: /^<a:/.test(trimmed) || /^a:/.test(trimmed),
      });
      return;
    }
    component.setEmoji(trimmed);
  } catch {
    // Ignore invalid emoji on component labels.
  }
}

function normalizeReactionRoleAssetUrl(value?: string | null): string | undefined {
  const trimmed = String(value || "").trim();
  if (!trimmed) return undefined;

  try {
    const parsed = new URL(trimmed);
    if (parsed.protocol === "http:" || parsed.protocol === "https:") {
      return parsed.toString();
    }
  } catch {
    // Ignore invalid embed asset URLs.
  }

  return undefined;
}

async function buildReactionRoleComponents(
  guildId: string,
  items: DashboardReactionRoleItem[],
  pickerStyle: DashboardReactionRolePickerStyle,
): Promise<{ components: any[]; note: string | null }> {
  if (pickerStyle === "reactions") {
    return { components: [], note: null };
  }

  const guild = client.guilds.cache.get(guildId) ?? await client.guilds.fetch(guildId).catch(() => null);
  await guild?.roles.fetch().catch(() => null);

  const roleLabelFor = (roleId: string) => {
    const roleName = guild?.roles?.cache?.get(roleId)?.name || `Role ${roleId}`;
    return roleName.slice(0, 80);
  };

  const limitedItems = items.slice(0, 25);
  const skippedCount = Math.max(0, items.length - limitedItems.length);

  if (pickerStyle === "buttons") {
    const rows: ActionRowBuilder<ButtonBuilder>[] = [];
    for (let index = 0; index < limitedItems.length; index += 5) {
      const row = new ActionRowBuilder<ButtonBuilder>().addComponents(
        ...limitedItems.slice(index, index + 5).map((entry) => {
          const button = new ButtonBuilder()
            .setCustomId(`rrbtn:${guildId}:${entry.roleId}:${entry.mode}`)
            .setLabel(roleLabelFor(entry.roleId))
            .setStyle(getReactionRoleButtonStyle(entry.mode));
          trySetReactionRoleComponentEmoji(button, entry.emoji);
          return button;
        }),
      );
      rows.push(row);
    }

    return {
      components: rows,
      note: skippedCount > 0 ? `Buttons support up to 25 role options per message. ${skippedCount} extra entr${skippedCount === 1 ? "y was" : "ies were"} skipped.` : null,
    };
  }

  const selectMenu = new StringSelectMenuBuilder()
    .setCustomId(`rrselect:${guildId}`)
    .setPlaceholder("Choose your roles")
    .setMinValues(0)
    .setMaxValues(Math.max(1, Math.min(limitedItems.length, 25)))
    .addOptions(
      limitedItems.map((entry) => {
        const option = new StringSelectMenuOptionBuilder()
          .setLabel(roleLabelFor(entry.roleId).slice(0, 100))
          .setDescription(getReactionRoleModeLabel(entry.mode))
          .setValue(`rr:${entry.roleId}:${entry.mode}`);
        trySetReactionRoleComponentEmoji(option, entry.emoji);
        return option;
      }),
    );

  return {
    components: [new ActionRowBuilder<StringSelectMenuBuilder>().addComponents(selectMenu)],
    note: skippedCount > 0 ? `Dropdown menus support up to 25 role options per message. ${skippedCount} extra entr${skippedCount === 1 ? "y was" : "ies were"} skipped.` : null,
  };
}

function convertLegacyRosterEmbedConfigsToSaved(raw: unknown): SavedRosterEmbedConfig[] {
  const legacyConfigs = getRosterEmbedConfigs(raw);
  return Object.entries(legacyConfigs).map(([rosterName, config]) => ({
    id: `legacy-${rosterName}`,
    name: `${rosterName.charAt(0).toUpperCase()}${rosterName.slice(1)} Embed`,
    ...config,
  }));
}

function dedupeRostersByName<T extends { name?: unknown; updatedAt?: unknown; createdAt?: unknown }>(rosters: T[]): T[] {
  const deduped = new Map<string, T>();
  for (const roster of rosters) {
    const key = String(roster.name || "").trim().toLowerCase();
    if (!key) continue;

    const existing = deduped.get(key);
    if (!existing) {
      deduped.set(key, roster);
      continue;
    }

    const existingTime = new Date(String(existing.updatedAt || existing.createdAt || 0)).getTime() || 0;
    const nextTime = new Date(String(roster.updatedAt || roster.createdAt || 0)).getTime() || 0;
    if (nextTime >= existingTime) {
      deduped.set(key, roster);
    }
  }
  return Array.from(deduped.values());
}

async function getRostersWithEmbedConfigs(guildId: string): Promise<Array<Record<string, unknown>>> {
  const rosters = dedupeRostersByName(await storage.getAllRosterConfigs(guildId));
  const config = await storage.getGuildConfig(guildId);
  const embedConfigs = getRosterEmbedConfigs(config?.customCategoryPings);

  return rosters.map((roster) => ({
    ...roster,
    embedConfig: embedConfigs[String(roster.name || "").toLowerCase()] || null,
  }));
}

async function getRosterEmbedsForGuild(guildId: string): Promise<SavedRosterEmbedConfig[]> {
  const config = await storage.getGuildConfig(guildId);
  const savedEmbeds = getSavedRosterEmbeds(config?.customCategoryPings);
  const legacyEmbeds = convertLegacyRosterEmbedConfigsToSaved(config?.customCategoryPings);

  if (legacyEmbeds.length === 0) {
    return savedEmbeds;
  }

  const merged = [...savedEmbeds];
  const existingNames = new Set(savedEmbeds.map((entry) => entry.name.trim().toLowerCase()));
  let changed = false;

  for (const legacyEmbed of legacyEmbeds) {
    const nameKey = legacyEmbed.name.trim().toLowerCase();
    if (existingNames.has(nameKey)) continue;
    merged.push({ ...legacyEmbed, id: crypto.randomUUID() });
    existingNames.add(nameKey);
    changed = true;
  }

  if (changed) {
    await storage.upsertGuildConfig({
      guildId,
      customCategoryPings: writeSavedRosterEmbeds(config?.customCategoryPings, merged),
    });
  }

  return merged;
}

async function sendEmbedToChannel(channelId: string, embed: EmbedBuilder): Promise<boolean> {
  if (!channelId) return false;

  try {
    if (getBotToken()) {
      await discordBotApiRequest(`/channels/${channelId}/messages`, {
        method: "POST",
        body: JSON.stringify({ embeds: [embed.toJSON()] }),
      });
      return true;
    }

    if (!client.isReady()) return false;
    const channel = await client.channels.fetch(channelId).catch(() => null);
    if (!channel || !("send" in channel)) return false;
    await channel.send({ embeds: [embed] });
    return true;
  } catch {
    // Best-effort announcement
    return false;
  }
}

async function postFeatureUpdateToChannel(guildId: string, channelId: string, featureLabels: string[]): Promise<boolean> {
  if (!channelId || featureLabels.length === 0) return false;

  const embed = new EmbedBuilder()
    .setTitle("New Bot Features Enabled")
    .setDescription(featureLabels.map((label) => `• ${label}`).join("\n"))
    .setColor(0x5865f2)
    .setFooter({ text: `Server ID: ${guildId}` })
    .setTimestamp();

  return await sendEmbedToChannel(channelId, embed);
}

async function postDashboardUpdateToChannel(
  guildId: string,
  channelId: string,
  editorId: string,
  changes: string[],
  options?: { title?: string; description?: string }
): Promise<boolean> {
  if (!channelId || changes.length === 0) return false;

  const embed = new EmbedBuilder()
    .setTitle(options?.title || "Dashboard Updated")
    .setDescription(options?.description || `Updated by <@${editorId}>`)
    .addFields({
      name: "Changes",
      value: changes.map((change) => `• ${change}`).join("\n").slice(0, 1024) || "No detailed changes provided.",
    })
    .setColor(0x5865f2)
    .setFooter({ text: `Server ID: ${guildId}` })
    .setTimestamp();

  return await sendEmbedToChannel(channelId, embed);
}

type GuildUpdatePayload = {
  type: "config-updated" | "rosters-updated";
  guildId: string;
  config?: unknown;
  rosters?: unknown[];
  rosterEmbeds?: unknown[];
  editorId?: string;
};

type RoleSyncDirection = "one-way" | "two-way";

type RoleSyncDashboardItem = {
  id: string;
  direction: RoleSyncDirection;
  sourceGuildId: string;
  sourceGuildName: string;
  sourceGuildIcon: string | null;
  sourceRoleId: string;
  sourceRoleName: string;
  sourceRoleColor: string | null;
  targetGuildId: string;
  targetGuildName: string;
  targetGuildIcon: string | null;
  targetRoleId: string;
  targetRoleName: string;
  targetRoleColor: string | null;
  reciprocalPairId?: string;
};

async function findGuildAndRoleMeta(guildId: string, roleId: string): Promise<{
  guildName: string;
  guildIcon: string | null;
  roleName: string;
  roleColor: string | null;
}> {
  let cachedGuild = client.guilds.cache.get(guildId);
  if (!cachedGuild) {
    try {
      cachedGuild = await client.guilds.fetch(guildId) as any;
    } catch {
      cachedGuild = null as any;
    }
  }
  const summary = getCachedGuildSummaryById(guildId);
  const guildName = cachedGuild?.name || summary?.name || guildId;
  const guildIcon = cachedGuild?.iconURL() || summary?.icon || null;
  let cachedRole = cachedGuild?.roles.cache.get(roleId) || null;
  if (cachedGuild && !cachedRole) {
    try {
      cachedRole = await cachedGuild.roles.fetch(roleId) as any;
    } catch {
      cachedRole = null;
    }
  }

  return {
    guildName,
    guildIcon,
    roleName: cachedRole?.name || roleId,
    roleColor: cachedRole?.hexColor || null,
  };
}

async function getRoleSyncItemsByGuild(guildId: string): Promise<RoleSyncDashboardItem[]> {
  const pairs = await storage.getRoleSyncPairsByGuild(guildId);
  const pairMap = new Map<string, typeof pairs[number]>();
  for (const pair of pairs) {
    pairMap.set(pair.id, pair);
  }

  // Ensure role caches are populated for all involved guilds
  const involvedGuildIds = new Set<string>();
  for (const pair of pairs) {
    involvedGuildIds.add(pair.sourceGuildId);
    involvedGuildIds.add(pair.targetGuildId);
  }
  await Promise.all(Array.from(involvedGuildIds).map(async (gid) => {
    let g = client.guilds.cache.get(gid);
    if (!g) {
      try { g = await client.guilds.fetch(gid) as any; } catch { return; }
    }
    if (g && !g.roles.cache.size) {
      try { await g.roles.fetch(); } catch { /* ignore */ }
    }
  }));

  const seen = new Set<string>();
  const result: RoleSyncDashboardItem[] = [];

  for (const pair of pairs) {
    if (seen.has(pair.id)) continue;

    const reciprocal = pairs.find((candidate) => (
      candidate.id !== pair.id
      && candidate.sourceGuildId === pair.targetGuildId
      && candidate.sourceRoleId === pair.targetRoleId
      && candidate.targetGuildId === pair.sourceGuildId
      && candidate.targetRoleId === pair.sourceRoleId
    ));

    let displayPair = pair;
    if (reciprocal && pair.sourceGuildId !== guildId && reciprocal.sourceGuildId === guildId) {
      displayPair = reciprocal;
    }

    seen.add(pair.id);
    if (reciprocal) seen.add(reciprocal.id);

    const sourceMeta = await findGuildAndRoleMeta(displayPair.sourceGuildId, displayPair.sourceRoleId);
    const targetMeta = await findGuildAndRoleMeta(displayPair.targetGuildId, displayPair.targetRoleId);

    result.push({
      id: displayPair.id,
      direction: reciprocal ? "two-way" : "one-way",
      sourceGuildId: displayPair.sourceGuildId,
      sourceGuildName: sourceMeta.guildName,
      sourceGuildIcon: sourceMeta.guildIcon,
      sourceRoleId: displayPair.sourceRoleId,
      sourceRoleName: sourceMeta.roleName,
      sourceRoleColor: sourceMeta.roleColor,
      targetGuildId: displayPair.targetGuildId,
      targetGuildName: targetMeta.guildName,
      targetGuildIcon: targetMeta.guildIcon,
      targetRoleId: displayPair.targetRoleId,
      targetRoleName: targetMeta.roleName,
      targetRoleColor: targetMeta.roleColor,
      reciprocalPairId: reciprocal?.id,
    });
  }

  return result;
}

const guildUpdateSubscribers = new Map<string, Set<Response>>();
const pendingRosterCreates = new Set<string>();

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
  app.get("/api/health", (_req, res) => {
    res.json({ ok: true, service: "expertworker", timestamp: new Date().toISOString() });
  });

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
    const secure = (req.headers["x-forwarded-proto"] || req.protocol) === "https";
    appendCookie(res, `${GUILD_ACCESS_COOKIE_NAME}=; Path=/; HttpOnly; SameSite=Lax; Max-Age=0${secure ? "; Secure" : ""}`);
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

  app.get("/api/owner/bot-control/status", async (req, res) => {
    if (!requireOwnerAccess(req, res)) return;

    const pid = readOwnerBotPid();
    const pidRunning = !!pid && isPidRunning(pid);
    if (pid && !pidRunning) {
      clearOwnerBotPid();
    }

    const status = pidRunning ? "online" : "offline";
    const persistedGuilds = readOwnerGuildSnapshot();
    const guildCount = client.isReady()
      ? client.guilds.cache.size
      : (persistedGuilds.length || cachedGuildSummaries.length);
    res.json({ success: true, status, desiredState: readOwnerBotDesiredState(), guildCount, botTag: client.user?.tag || null });
  });

  app.get("/api/owner/guilds", async (req, res) => {
    if (!requireOwnerAccess(req, res)) return;

    try {
      const liveSummaries = client.isReady()
        ? client.guilds.cache.map((guild) => ({
            id: guild.id,
            name: guild.name,
            icon: guild.iconURL(),
            memberCount: guild.memberCount,
          }))
        : [];
      const persistedSummaries = readOwnerGuildSnapshot();
      const storedSummaries = await getGuildSummariesFromStoredConfigs();

      // Always fetch the full bot guild list from Discord so the owner dashboard
      // shows all servers even when the bot process is not running in-process.
      let apiBotGuilds: DashboardGuildSummary[] = [];
      try {
        const guildsResponse = await discordApiRequest("/users/@me/guilds?with_counts=true");
        const guildsJson = (await guildsResponse.json().catch(() => [])) as DiscordRestGuild[];
        apiBotGuilds = guildsJson.map((g) => ({
          id: String(g.id),
          name: String(g.name || `Server ${g.id}`),
          icon: toGuildIconUrl(String(g.id), g.icon),
          memberCount: Number(g.approximate_member_count || 0),
        }));
      } catch {
        // Ignore - other sources will cover it
      }

      const primarySummaries = apiBotGuilds.length > 0
        ? apiBotGuilds
        : (liveSummaries.length > 0 ? liveSummaries : []);
      const fallbackSummaries = primarySummaries.length > 0
        ? [...persistedSummaries, ...cachedGuildSummaries]
        : [...liveSummaries, ...persistedSummaries, ...cachedGuildSummaries, ...storedSummaries];

      const mergedSummaryMap = new Map<string, DashboardGuildSummary>();
      for (const guild of [...primarySummaries, ...fallbackSummaries]) {
        const guildId = String(guild?.id || "").trim();
        if (!guildId) continue;

        if (primarySummaries.length > 0 && !primarySummaries.some((entry) => entry.id === guildId)) {
          continue;
        }

        mergedSummaryMap.set(guildId, {
          id: guildId,
          name: String(guild?.name || `Server ${guildId}`),
          icon: guild?.icon ? String(guild.icon) : null,
          memberCount: Number(guild?.memberCount || 0),
        });
      }

      const resolvedSummaries = Array.from(mergedSummaryMap.values());

      const guilds = await Promise.all(
        resolvedSummaries.map(async (guild) => {
          const config = await storage.getGuildConfig(guild.id).catch(() => undefined);
          return {
            ...guild,
            isDisabled: isGuildDisabledFromCustomCategoryPings(config?.customCategoryPings),
          };
        }),
      );

      setCachedGuildSummaries(guilds.map(({ id, name, icon, memberCount }) => ({ id, name, icon, memberCount })));
      res.json(guilds);
    } catch (e: any) {
      res.status(500).json({ error: e?.message || "Failed to load owner guilds." });
    }
  });

  app.post("/api/owner/guilds/:guildId/disabled", async (req, res) => {
    const user = requireOwnerAccess(req, res);
    if (!user) return;

    try {
      const guildId = String(req.params.guildId || "").trim();
      if (!guildId) {
        return res.status(400).json({ error: "Missing guildId" });
      }

      const disabled = req.body?.disabled === true;
      const currentConfig = await storage.getGuildConfig(guildId).catch(() => undefined);
      const customCategoryPings = writeGuildDisabledToCustomCategoryPings(currentConfig?.customCategoryPings, disabled);
      await storage.upsertGuildConfig({ guildId, customCategoryPings });
      const updatedConfig = await storage.getGuildConfig(guildId).catch(() => undefined);

      broadcastGuildUpdate(guildId, {
        type: "config-updated",
        guildId,
        config: updatedConfig || { guildId, customCategoryPings },
        editorId: user.id,
      });

      res.json({
        success: true,
        guildId,
        disabled,
        config: updatedConfig || { guildId, customCategoryPings },
      });
    } catch (e: any) {
      res.status(500).json({ error: e?.message || "Failed to update disabled state." });
    }
  });

  app.post("/api/owner/bot-control/turn-on", async (req, res) => {
    if (!requireOwnerAccess(req, res)) return;

    try {
      const existingPid = readOwnerBotPid();
      const runnerPids = await getBotRunnerPids();
      if (existingPid && isPidRunning(existingPid)) {
        return res.json({ success: true, status: "online", message: "Bot process is already running." });
      }
      if (runnerPids.length > 0) {
        return res.status(409).json({ error: "A separate bot runner is already active (outside Owner Dashboard). Stop it first to avoid duplicate sessions." });
      }

      const token = getBotToken();
      if (!token) {
        return res.status(500).json({ error: "DISCORD_BOT_TOKEN is not configured." });
      }

      const npmCmd = process.platform === "win32" ? "npm.cmd" : "npm";
      const child = spawnProcess(npmCmd, ["run", "bot", "--", "--owner-dashboard-managed"], {
        cwd: process.cwd(),
        detached: true,
        stdio: "ignore",
      });
      child.unref();
      if (typeof child.pid === "number") {
        writeOwnerBotPid(child.pid);
      }
      writeOwnerBotDesiredState("on");

      return res.json({ success: true, status: "online", message: "Bot start requested." });
    } catch (e: any) {
      return res.status(500).json({ error: e?.message || "Failed to turn bot on." });
    }
  });

  app.post("/api/owner/bot-control/turn-off", async (req, res) => {
    if (!requireOwnerAccess(req, res)) return;

    try {
      writeOwnerBotDesiredState("off");
      const pid = readOwnerBotPid();
      if (pid && isPidRunning(pid)) {
        await killOwnerBotPid(pid);
      }
      clearOwnerBotPid();

      if (client.isReady()) {
        await client.destroy();
      }
      return res.json({ success: true, status: "offline" });
    } catch (e: any) {
      return res.status(500).json({ error: e?.message || "Failed to turn bot off." });
    }
  });

  app.post("/api/owner/bot-control/leave-all", async (req, res) => {
    if (!requireOwnerAccess(req, res)) return;

    try {
      const left: string[] = [];
      const failed: Array<{ guildId: string; reason: string }> = [];
      const requestedGuildIds = Array.isArray(req.body?.guildIds)
        ? req.body.guildIds.map((entry: unknown) => String(entry || "").trim()).filter(Boolean)
        : [];
      const guildIds = requestedGuildIds.length > 0
        ? requestedGuildIds
        : cachedGuildSummaries.map((guild) => guild.id);

      if (guildIds.length === 0) {
        return res.json({ success: true, leftCount: 0, failedCount: 0, failed: [] });
      }

      if (client.isReady()) {
        for (const guildId of guildIds) {
          try {
            const guild = client.guilds.cache.get(guildId) || await client.guilds.fetch(guildId).catch(() => null);
            if (!guild) throw new Error("guild_not_found");
            await guild.leave();
            left.push(guildId);
          } catch (error: any) {
            failed.push({ guildId, reason: error?.message || "leave_failed" });
          }
        }
      } else {
        const token = getBotToken();
        if (!token) {
          return res.status(500).json({ error: "DISCORD_BOT_TOKEN is not configured." });
        }

        const tempClient = new Client({ intents: [GatewayIntentBits.Guilds] });
        try {
          await tempClient.login(token);

          for (const guildId of guildIds) {
            try {
              const guild = tempClient.guilds.cache.get(guildId) || await tempClient.guilds.fetch(guildId).catch(() => null);
              if (!guild) throw new Error("guild_not_found");
              await guild.leave();
              left.push(guildId);
            } catch (error: any) {
              failed.push({ guildId, reason: error?.message || "leave_failed" });
            }
          }
        } finally {
          await tempClient.destroy();
        }
      }

      return res.json({ success: true, leftCount: left.length, failedCount: failed.length, failed });
    } catch (e: any) {
      return res.status(500).json({ error: e?.message || "Failed to leave all servers." });
    }
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
      const { guildId, user } = auth;
      const config = await storage.getGuildConfig(guildId);

      if (client.isReady()) {
        const guild = client.guilds.cache.get(guildId);
        const member = guild ? await guild.members.fetch(user.id).catch(() => null) : null;
        const channels = guild?.channels.cache
          .map(c => ({ id: c.id, name: c.name, type: c.type })) || [];
        const roles = guild?.roles.cache
          .filter(r => r.name !== "@everyone")
          .map(r => ({ id: r.id, name: r.name, color: r.hexColor })) || [];
        const viewerRoleIds = member ? Array.from(member.roles.cache.keys()) : [];
        const viewerIsAdmin = member ? member.permissions.has(PermissionFlagsBits.Administrator) : false;
        const managerRoleIds = (config?.modRoleIds || []).filter(Boolean);
        const hasGeneralAccess = !!member && (viewerIsAdmin || guild?.ownerId === user.id || managerRoleIds.some((roleId) => member.roles.cache.has(roleId)));
        const viewerHasSecurityAccess = hasDashboardSecurityAccess(user.id, viewerRoleIds, config?.customCategoryPings, hasGeneralAccess);
        const viewerHasBlacklistAccess = hasDashboardBlacklistAccess(user.id, viewerRoleIds, config?.customCategoryPings, hasGeneralAccess || viewerHasSecurityAccess);

        return res.json({
          config: config || {},
          channels,
          roles,
          guildName: guild?.name || "Unknown",
          memberCount: guild?.memberCount ?? 0,
          viewerRoleIds,
          viewerIsAdmin,
          viewerHasSecurityAccess,
          viewerHasBlacklistAccess,
        });
      }

      let guildResponse: globalThis.Response;
      let channelsResponse: globalThis.Response;
      let rolesResponse: globalThis.Response;
      let memberResponse: globalThis.Response;

      try {
        [guildResponse, channelsResponse, rolesResponse, memberResponse] = await Promise.all([
          discordApiRequest(`/guilds/${guildId}?with_counts=true`),
          discordApiRequest(`/guilds/${guildId}/channels`),
          discordApiRequest(`/guilds/${guildId}/roles`),
          discordApiRequest(`/guilds/${guildId}/members/${user.id}`),
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
      const memberRaw = await memberResponse.json().catch(() => ({} as DiscordRestGuildMember));

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

      const viewerRoleIds = Array.isArray(memberRaw?.roles) ? memberRaw.roles.map((entry: unknown) => String(entry || "")).filter(Boolean) : [];
      const viewerIsAdmin = hasAdministratorPermission(memberRaw?.permissions);
      const managerRoleIds = (config?.modRoleIds || []).filter(Boolean);
      const hasGeneralAccess = viewerIsAdmin || String((guild as any)?.owner_id || "") === user.id || managerRoleIds.some((roleId) => viewerRoleIds.includes(roleId));
      const viewerHasSecurityAccess = hasDashboardSecurityAccess(user.id, viewerRoleIds, config?.customCategoryPings, hasGeneralAccess);
      const viewerHasBlacklistAccess = hasDashboardBlacklistAccess(user.id, viewerRoleIds, config?.customCategoryPings, hasGeneralAccess || viewerHasSecurityAccess);

      res.json({ 
        config: config || {},
        channels,
        roles,
        guildName: String((guild as any)?.name || "Unknown"),
        memberCount: Number((guild as any)?.approximate_member_count ?? (guild as any)?.member_count ?? 0),
        viewerRoleIds,
        viewerIsAdmin,
        viewerHasSecurityAccess,
        viewerHasBlacklistAccess,
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

  app.get("/api/guilds/:guildId/misc-overview", async (req, res) => {
    try {
      const auth = await requireGuildAccess(req, res);
      if (!auth) return;
      const { guildId } = auth;

      const config = await storage.getGuildConfig(guildId);
      const hasBotToken = !!getDiscordBotToken();
      const canUseGatewayClient = client.isReady();
      const unavailableReason = !hasBotToken && !canUseGatewayClient
        ? "Bot is offline right now."
        : null;
      const cleanText = (value: unknown) => String(value || "")
        .replace(/`/g, "")
        .replace(/\*\*/g, "")
        .replace(/\n+/g, ", ")
        .replace(/\s+/g, " ")
        .trim();

      const formatTargetName = (target: any) => {
        if (!target) return "server settings";
        if (typeof target?.username === "string") return `@${target.username}`;
        if (typeof target?.name === "string" && target.name.trim()) return target.name;
        if (typeof target?.id === "string" && target.id.trim()) return target.id;
        return "server settings";
      };

      const summarizeAuditChanges = (entry: any) => {
        const changes = Array.isArray(entry?.changes) ? entry.changes : [];
        if (changes.length === 0) return "";

        const changeLabelMap: Record<string, string> = {
          name: "name",
          nick: "nickname",
          topic: "topic",
          permissions: "permissions",
          color: "color",
          hoist: "display setting",
          mentionable: "mentionable setting",
          rate_limit_per_user: "slowmode",
          nsfw: "NSFW setting",
          bitrate: "bitrate",
          user_limit: "user limit",
          icon_hash: "icon",
          banner_hash: "banner",
          description: "description",
          rules_channel_id: "rules channel",
          public_updates_channel_id: "updates channel",
          preferred_locale: "locale",
          verification_level: "verification level",
          explicit_content_filter: "content filter",
          default_message_notifications: "message notifications",
          afk_channel_id: "AFK channel",
          afk_timeout: "AFK timeout",
          owner_id: "owner",
          mfa_level: "2FA requirement",
          code: "invite code",
          channel_id: "channel",
          max_age: "max age",
          max_uses: "max uses",
          temporary: "temporary invite",
        };

        return changes.slice(0, 3).map((change: any) => {
          const key = String(change?.key || "").trim();
          if (key === "$add" || key === "$remove") {
            const roles = Array.isArray(change?.new_value)
              ? change.new_value.map((role: any) => String(role?.name || "")).filter(Boolean).join(", ")
              : "roles";
            return key === "$add" ? `added ${roles}` : `removed ${roles}`;
          }

          const label = changeLabelMap[key] || key.replace(/_/g, " ");
          const oldValue = cleanText(change?.old_value ?? "");
          const newValue = cleanText(change?.new_value ?? "");
          if (oldValue || newValue) {
            return `${label}: ${oldValue || "none"} → ${newValue || "none"}`;
          }
          return `updated ${label}`;
        }).join(" • ");
      };

      const formatAuditAction = (entry: any) => {
        const targetName = formatTargetName(entry?.target);
        const details = summarizeAuditChanges(entry);
        const withDetails = (text: string) => details ? `${text} — ${details}` : text;

        switch (entry?.action) {
          case AuditLogEvent.MemberBanAdd:
            return withDetails(`Banned ${targetName}`);
          case AuditLogEvent.MemberBanRemove:
            return `Unbanned ${targetName}`;
          case AuditLogEvent.MemberKick:
            return withDetails(`Kicked ${targetName}`);
          case AuditLogEvent.MemberRoleUpdate:
            return withDetails(`Updated roles for ${targetName}`);
          case AuditLogEvent.MemberUpdate:
            return withDetails(`Updated member ${targetName}`);
          case AuditLogEvent.ChannelCreate:
            return withDetails(`Created channel ${targetName}`);
          case AuditLogEvent.ChannelUpdate:
            return withDetails(`Updated channel ${targetName}`);
          case AuditLogEvent.ChannelDelete:
            return `Deleted channel ${targetName}`;
          case AuditLogEvent.ChannelOverwriteCreate:
            return withDetails(`Created channel permissions for ${targetName}`);
          case AuditLogEvent.ChannelOverwriteUpdate:
            return withDetails(`Updated channel permissions for ${targetName}`);
          case AuditLogEvent.ChannelOverwriteDelete:
            return `Deleted channel permissions for ${targetName}`;
          case AuditLogEvent.RoleCreate:
            return withDetails(`Created role ${targetName}`);
          case AuditLogEvent.RoleUpdate:
            return withDetails(`Updated role ${targetName}`);
          case AuditLogEvent.RoleDelete:
            return `Deleted role ${targetName}`;
          case AuditLogEvent.InviteCreate:
            return withDetails(`Created invite ${targetName}`);
          case AuditLogEvent.InviteUpdate:
            return withDetails(`Updated invite ${targetName}`);
          case AuditLogEvent.InviteDelete:
            return `Deleted invite ${targetName}`;
          case AuditLogEvent.EmojiCreate:
            return withDetails(`Created emoji ${targetName}`);
          case AuditLogEvent.EmojiUpdate:
            return withDetails(`Updated emoji ${targetName}`);
          case AuditLogEvent.EmojiDelete:
            return `Deleted emoji ${targetName}`;
          case AuditLogEvent.MessageDelete:
          case AuditLogEvent.MessageBulkDelete:
            return withDetails(`Deleted messages in ${targetName}`);
          case AuditLogEvent.MessagePin:
            return `Pinned a message in ${targetName}`;
          case AuditLogEvent.MessageUnpin:
            return `Unpinned a message in ${targetName}`;
          case AuditLogEvent.GuildUpdate:
            return withDetails("Updated server settings");
          case AuditLogEvent.WebhookCreate:
            return `Created webhook ${targetName}`;
          case AuditLogEvent.WebhookUpdate:
            return withDetails(`Updated webhook ${targetName}`);
          case AuditLogEvent.WebhookDelete:
            return `Deleted webhook ${targetName}`;
          default:
            return details ? `Updated ${targetName} — ${details}` : `Audit action on ${targetName}`;
        }
      };

      const collectChannelActivity = async (channelId: string | null | undefined, source: "commands" | "moderation") => {
        if (!channelId) return [] as Array<{ id: string; timestamp: string; userId: string | null; username: string; avatarUrl: string | null; action: string; source: "commands" | "moderation" }>;

        let messages: any[] = [];
        if (hasBotToken) {
          messages = await discordBotApiRequest<any[]>(`/channels/${channelId}/messages?limit=20`).catch(() => []);
        } else if (canUseGatewayClient) {
          const channel = await client.channels.fetch(channelId).catch(() => null);
          if (channel && "messages" in channel) {
            const fetched = await (channel as any).messages.fetch({ limit: 20 }).catch(() => null);
            messages = fetched ? Array.from((fetched as any).values()) as any[] : [];
          }
        }

        const items = [] as Array<{ id: string; timestamp: string; userId: string | null; username: string; avatarUrl: string | null; action: string; source: "commands" | "moderation" }>;
        for (const message of messages) {
          const embed = Array.isArray(message.embeds) ? message.embeds[0] : undefined;
          const userField = embed?.fields?.find((field: any) => /^(user|moderator)$/i.test(String(field?.name || "")));
          const commandField = embed?.fields?.find((field: any) => /^command$/i.test(String(field?.name || "")));
          const optionsField = embed?.fields?.find((field: any) => /^options$/i.test(String(field?.name || "")));

          const userFieldValue = String(userField?.value || "");
          const userId = userFieldValue.match(/<@!?(\d+)>/)?.[1] || null;
          const username = userFieldValue.match(/\(([^)]+)\)/)?.[1] || cleanText(userFieldValue.replace(/<@!?(\d+)>/g, "")) || "Unknown";
          const cachedUser = userId && canUseGatewayClient ? client.users.cache.get(userId) : null;
          const avatarUrl = cachedUser?.displayAvatarURL?.({ size: 64 }) || null;

          let action = cleanText(embed?.title || embed?.description || message.content || "Logged activity");
          if (commandField) {
            action = `Used ${cleanText(commandField.value)}`;
            const optionText = cleanText(optionsField?.value || "");
            if (optionText && optionText.toLowerCase() !== "none") {
              action = `${action} — ${optionText}`.slice(0, 220);
            }
          }

          items.push({
            id: `${source}-${message.id}`,
            timestamp: String(message.createdAt?.toISOString?.() || message.timestamp || new Date().toISOString()),
            userId,
            username,
            avatarUrl,
            action,
            source,
          });
        }

        return items;
      };

      const [banCollection, auditLogs, commandActivity, moderationActivity, modmailBlockRows, appealBlockRows] = await Promise.all([
        hasBotToken
          ? discordBotApiRequest<any[]>(`/guilds/${guildId}/bans?limit=1000`).catch(() => [])
          : Promise.resolve([]),
        hasBotToken
          ? discordBotApiRequest<any>(`/guilds/${guildId}/audit-logs?limit=20`).catch(() => null)
          : Promise.resolve(null),
        collectChannelActivity(config?.commandLogChannelId, "commands"),
        collectChannelActivity(config?.modLogChannelId, "moderation"),
        storage.getAllModmailBlocks(guildId).catch(() => []),
        storage.getAllAppealBlocks(guildId).catch(() => []),
      ]);

      const bans = Array.isArray(banCollection)
        ? banCollection
            .map((ban: any) => ({
              userId: String(ban.user?.id || ""),
              username: String(ban.user?.username || ban.user?.global_name || ban.user?.tag || "Unknown User"),
              avatarUrl: buildDiscordAvatarUrl(String(ban.user?.id || ""), ban.user?.avatar || null),
              reason: ban.reason ? String(ban.reason) : null,
            }))
            .filter((ban) => ban.userId)
            .sort((a, b) => a.username.localeCompare(b.username))
        : [];

      const userSummaryCache = new Map<string, { userId: string | null; username: string; avatarUrl: string | null }>();
      const getCachedUserSummary = async (userId: string | null | undefined) => {
        const normalizedUserId = String(userId || "").trim();
        if (!normalizedUserId) {
          return { userId: null, username: "Unknown user", avatarUrl: null };
        }
        const cached = userSummaryCache.get(normalizedUserId);
        if (cached) return cached;
        const resolved = await resolveDiscordUserSummary(normalizedUserId, guildId);
        userSummaryCache.set(normalizedUserId, resolved);
        return resolved;
      };

      const rawBlocks = [
        ...(Array.isArray(modmailBlockRows)
          ? modmailBlockRows
              .filter((block: any) => isBlockStillActive(block?.expiresAt || null))
              .map((block: any) => ({
                system: "modmail" as const,
                userId: String(block?.userId || ""),
                blockedById: block?.blockedById ? String(block.blockedById) : null,
                reason: block?.reason ? String(block.reason) : null,
                expiresAt: block?.expiresAt ? new Date(block.expiresAt).toISOString() : null,
              }))
          : []),
        ...(Array.isArray(appealBlockRows)
          ? appealBlockRows
              .filter((block: any) => isBlockStillActive(block?.expiresAt || null))
              .map((block: any) => ({
                system: "appeal" as const,
                userId: String(block?.userId || ""),
                blockedById: block?.blockedById ? String(block.blockedById) : null,
                reason: block?.reason ? String(block.reason) : null,
                expiresAt: block?.expiresAt ? new Date(block.expiresAt).toISOString() : null,
              }))
          : []),
        ...Object.entries(getStaffApplicationBlocksFromConfig(config?.customCategoryPings))
          .filter(([, block]) => isBlockStillActive(block?.expiresAt || null))
          .map(([userId, block]) => ({
            system: "staff_applications" as const,
            userId: String(userId || ""),
            blockedById: block?.blockedById ? String(block.blockedById) : null,
            reason: block?.reason ? String(block.reason) : null,
            expiresAt: block?.expiresAt || null,
          })),
      ].filter((block) => block.userId);

      const rawBlacklistedUsers = Object.entries(getBlacklistedUsersFromConfig(config?.customCategoryPings))
        .map(([userId, entry]) => ({
          userId: String(userId || ""),
          blacklistedById: entry?.blacklistedById ? String(entry.blacklistedById) : null,
          reason: entry?.reason ? String(entry.reason) : null,
          createdAt: entry?.createdAt || null,
        }))
        .filter((entry) => entry.userId);

      const [blocks, blacklistedUsers] = await Promise.all([
        Promise.all(rawBlocks.map(async (block) => {
          const blockedUser = await getCachedUserSummary(block.userId);
          const blockedByUser = block.blockedById ? await getCachedUserSummary(block.blockedById) : null;
          return {
            system: block.system,
            userId: block.userId,
            username: blockedUser.username || block.userId,
            avatarUrl: blockedUser.avatarUrl,
            blockedById: block.blockedById || null,
            blockedByUsername: blockedByUser?.username || null,
            blockedByAvatarUrl: blockedByUser?.avatarUrl || null,
            reason: block.reason,
            expiresAt: block.expiresAt,
          };
        })),
        Promise.all(rawBlacklistedUsers.map(async (entry) => {
          const blacklistedUser = await getCachedUserSummary(entry.userId);
          const blacklistedByUser = entry.blacklistedById ? await getCachedUserSummary(entry.blacklistedById) : null;
          return {
            userId: entry.userId,
            username: blacklistedUser.username || entry.userId,
            avatarUrl: blacklistedUser.avatarUrl,
            blacklistedById: entry.blacklistedById || null,
            blacklistedByUsername: blacklistedByUser?.username || null,
            blacklistedByAvatarUrl: blacklistedByUser?.avatarUrl || null,
            reason: entry.reason,
            createdAt: entry.createdAt,
          };
        })),
      ]);

      const auditActivity = Array.isArray(auditLogs?.audit_log_entries)
        ? auditLogs.audit_log_entries.map((entry: any) => {
            const executor = Array.isArray(auditLogs?.users)
              ? auditLogs.users.find((user: any) => String(user?.id || "") === String(entry?.user_id || ""))
              : null;
            const target = Array.isArray(auditLogs?.users)
              ? auditLogs.users.find((user: any) => String(user?.id || "") === String(entry?.target_id || ""))
              : null;
            return {
              id: `audit-${entry.id}`,
              timestamp: new Date(entry.id ? Number((BigInt(entry.id) >> 22n) + 1420070400000n) : Date.now()).toISOString(),
              userId: executor?.id ? String(executor.id) : null,
              username: executor?.username ? String(executor.username) : "Unknown",
              avatarUrl: buildDiscordAvatarUrl(executor?.id ? String(executor.id) : null, executor?.avatar || null),
              action: formatAuditAction({ action: Number(entry?.action_type), target }),
              source: "audit" as const,
            };
          })
        : [];

      const activity = [...auditActivity, ...commandActivity, ...moderationActivity]
        .filter((entry) => String(entry.action || "").trim().length > 0)
        .sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime())
        .slice(0, 40);

      res.json({ bans, blacklistedUsers, blocks, activity, unavailableReason });
    } catch (e: any) {
      res.status(500).json({ error: e.message });
    }
  });

  app.get("/api/guilds/:guildId/modmail-logs", async (req, res) => {
    try {
      const auth = await requireGuildAccess(req, res);
      if (!auth) return;
      const { guildId } = auth;

      const statusFilter = String(req.query.status || "").trim().toLowerCase();
      const userIdFilter = String(req.query.userId || "").trim();
      const categoryFilter = String(req.query.category || "").trim().toLowerCase();
      const fromDateStr = String(req.query.fromDate || "").trim();
      const toDateStr = String(req.query.toDate || "").trim();

      const fromDate = fromDateStr ? new Date(fromDateStr) : new Date("2000-01-01");
      const toDate = toDateStr ? new Date(toDateStr) : new Date();

      const allModmailThreads = await storage.getAllModmailThreads(guildId).catch(() => []);
      const allAppealThreads = await storage.getAllAppealThreads(guildId).catch(() => []);

      const normalizedThreadRows: Array<{ thread: any; category: "modmail" | "appeal" }> = [
        ...allModmailThreads.map((thread) => ({ thread, category: "modmail" as const })),
        ...allAppealThreads.map((thread) => ({ thread, category: "appeal" as const })),
      ];

      let filtered = normalizedThreadRows;

      if (statusFilter && statusFilter !== "all") {
        filtered = filtered.filter(({ thread }) => String(thread.status || "open").toLowerCase() === statusFilter);
      }

      if (userIdFilter) {
        filtered = filtered.filter(({ thread }) => String(thread.userId || "") === userIdFilter);
      }

      if (categoryFilter && categoryFilter !== "all") {
        const validCategories = ["modmail", "appeal"];
        if (validCategories.includes(categoryFilter)) {
          filtered = filtered.filter(({ category }) => category === categoryFilter);
        }
      }

      if (fromDate && Number.isFinite(fromDate.getTime())) {
        filtered = filtered.filter(({ thread }) => {
          const createdAt = thread.createdAt ? new Date(thread.createdAt) : null;
          return !createdAt || createdAt >= fromDate;
        });
      }

      if (toDate && Number.isFinite(toDate.getTime())) {
        filtered = filtered.filter(({ thread }) => {
          const createdAt = thread.createdAt ? new Date(thread.createdAt) : null;
          return !createdAt || createdAt <= toDate;
        });
      }

      const threads = await Promise.all(
        filtered.map(async ({ thread, category }) => {
          const messages = category === "appeal"
            ? await storage.getAppealMessages(thread.id).catch(() => [])
            : await storage.getModmailMessages(thread.id).catch(() => []);
          const creatorInfo = await resolveDiscordUserSummary(thread.userId, guildId);
          const claimedByInfo = thread.claimedById
            ? await resolveDiscordUserSummary(thread.claimedById, guildId)
            : null;

          const latestMessage = messages.length > 0 ? messages[messages.length - 1] : null;
          const latestMessageAuthorInfo = latestMessage
            ? await resolveDiscordUserSummary(latestMessage.authorId, guildId)
            : null;

          return {
            id: thread.id,
            userId: thread.userId,
            username: creatorInfo.username,
            avatarUrl: creatorInfo.avatarUrl,
            status: thread.status,
            category,
            channelId: thread.channelId,
            createdAt: thread.createdAt?.toISOString() || new Date().toISOString(),
            closedAt: thread.closedAt?.toISOString() || null,
            closeReason: thread.closeReason,
            claimedById: thread.claimedById,
            claimedByUsername: claimedByInfo?.username || null,
            claimedByAvatarUrl: claimedByInfo?.avatarUrl || null,
            messageCount: messages.length,
            messages: messages.map((msg) => ({
              id: msg.id,
              authorId: msg.authorId,
              content: msg.content,
              isStaff: String(msg.isStaff || "").toLowerCase() === "true",
              createdAt: msg.createdAt?.toISOString() || new Date().toISOString(),
            })),
            latestMessage: latestMessage
              ? {
                  content: latestMessage.content,
                  authorUsername: latestMessageAuthorInfo?.username || "Unknown",
                  isStaff: String(latestMessage.isStaff || "").toLowerCase() === "true",
                  sentAt: latestMessage.createdAt?.toISOString() || new Date().toISOString(),
                }
              : null,
          };
        }),
      );

      const sorted = threads.sort((a, b) => {
        const aTime = new Date(a.createdAt).getTime();
        const bTime = new Date(b.createdAt).getTime();
        return bTime - aTime;
      });

      res.json({ threads: sorted });
    } catch (e: any) {
      res.status(500).json({ error: e.message });
    }
  });

  app.delete("/api/guilds/:guildId/bans/:userId", async (req, res) => {
    try {
      const auth = await requireGuildAccess(req, res);
      if (!auth) return;
      const { guildId, user } = auth;
      const canManageBlacklist = await canManageBlacklistDashboard(user.id, guildId).catch(() => false);
      if (!canManageBlacklist) {
        return res.status(403).json({ error: "You do not have permission to manage the blacklist for this server." });
      }
      const userId = String(req.params.userId || "").trim();

      if (!/^\d{17,20}$/.test(userId)) {
        return res.status(400).json({ error: "A valid user ID is required." });
      }

      const config = await storage.getGuildConfig(guildId);
      if (getBlacklistedUsersFromConfig(config?.customCategoryPings)[userId]) {
        return res.status(400).json({ error: "Remove this user from Blacklisted Users before unbanning them." });
      }

      if (getBotToken()) {
        await discordApiRequest(`/guilds/${guildId}/bans/${userId}`, { method: "DELETE" });
      } else if (client.isReady()) {
        const guild = client.guilds.cache.get(guildId) || await client.guilds.fetch(guildId).catch(() => null);
        if (!guild) return res.status(404).json({ error: "Server not found." });
        await guild.bans.remove(userId, "Unbanned from dashboard");
      } else {
        return res.status(503).json({ error: "Bot is offline right now." });
      }

      res.json({ success: true, userId });
    } catch (e: any) {
      res.status(500).json({ error: e.message || "Failed to unban user." });
    }
  });

  app.delete("/api/guilds/:guildId/bans", async (req, res) => {
    try {
      const auth = await requireGuildAccess(req, res);
      if (!auth) return;
      const { guildId } = auth;

      if (!getBotToken() && !client.isReady()) {
        return res.status(503).json({ error: "Bot is offline right now." });
      }

      const config = await storage.getGuildConfig(guildId);
      const blacklistedUserIds = new Set(Object.keys(getBlacklistedUsersFromConfig(config?.customCategoryPings)));

      let banUserIds: string[] = [];
      if (getBotToken()) {
        const bans = await discordBotApiRequest<any[]>(`/guilds/${guildId}/bans?limit=1000`).catch(() => []);
        banUserIds = Array.isArray(bans)
          ? bans.map((ban: any) => String(ban?.user?.id || "")).filter(Boolean)
          : [];
      } else {
        const guild = client.guilds.cache.get(guildId) || await client.guilds.fetch(guildId).catch(() => null);
        if (!guild) return res.status(404).json({ error: "Server not found." });
        const bans = await guild.bans.fetch().catch(() => null);
        banUserIds = bans ? Array.from(bans.keys()) : [];
      }

      let count = 0;
      const failed: string[] = [];
      const skipped: string[] = [];
      for (const userId of banUserIds) {
        if (blacklistedUserIds.has(userId)) {
          skipped.push(userId);
          continue;
        }

        try {
          if (getBotToken()) {
            await discordApiRequest(`/guilds/${guildId}/bans/${userId}`, { method: "DELETE" });
          } else {
            const guild = client.guilds.cache.get(guildId) || await client.guilds.fetch(guildId).catch(() => null);
            if (!guild) throw new Error("Server not found.");
            await guild.bans.remove(userId, "Bulk unban from dashboard");
          }
          count += 1;
        } catch {
          failed.push(userId);
        }
      }

      res.json({ success: failed.length === 0, count, failed, skipped });
    } catch (e: any) {
      res.status(500).json({ error: e.message || "Failed to unban all users." });
    }
  });

  app.post("/api/guilds/:guildId/blacklist", async (req, res) => {
    try {
      const auth = await requireGuildAccess(req, res);
      if (!auth) return;
      const { guildId, user } = auth;
      const canManageBlacklist = await canManageBlacklistDashboard(user.id, guildId).catch(() => false);
      if (!canManageBlacklist) {
        return res.status(403).json({ error: "You do not have permission to manage the blacklist for this server." });
      }

      const userId = String(req.body?.userId || "").trim();
      const reason = String(req.body?.reason || "").trim();

      if (!/^\d{17,20}$/.test(userId)) {
        return res.status(400).json({ error: "A valid Discord user ID is required." });
      }

      const updatedConfig = await withGuildConfigMutationLock(guildId, async () => {
        const config = await storage.getGuildConfig(guildId);
        return await storage.upsertGuildConfig({
          guildId,
          customCategoryPings: writeBlacklistedUserToConfig(
            config?.customCategoryPings,
            userId,
            {
              blacklistedById: user.id,
              reason: reason || "Blacklisted from dashboard",
              createdAt: new Date().toISOString(),
            },
          ),
        });
      }).catch(() => undefined);

      broadcastGuildUpdate(guildId, {
        type: "config-updated",
        config: updatedConfig || { guildId },
      });

      let enforced = false;
      let warning: string | null = null;
      const auditReason = `Dashboard blacklist enforcement${reason ? `: ${reason}` : ""}`.slice(0, 512);

      try {
        if (client.isReady()) {
          const guild = client.guilds.cache.get(guildId) || await client.guilds.fetch(guildId).catch(() => null);
          if (guild) {
            await guild.members.ban(userId, { reason: auditReason, deleteMessageSeconds: 0 });
            enforced = true;
          }
        } else if (getBotToken()) {
          await discordApiRequest(`/guilds/${guildId}/bans/${userId}`, {
            method: "PUT",
            headers: {
              "Content-Type": "application/json",
              "X-Audit-Log-Reason": auditReason,
            },
            body: JSON.stringify({ delete_message_seconds: 0 }),
          });
          enforced = true;
        } else {
          warning = "The user was saved to the blacklist, but the bot is offline so the instant re-ban could not run yet.";
        }
      } catch (banError: any) {
        warning = banError?.message || "The user was saved to the blacklist, but the instant re-ban failed.";
      }

      res.json({ success: true, userId, enforced, warning });
    } catch (e: any) {
      res.status(500).json({ error: e.message || "Failed to blacklist this user." });
    }
  });

  app.delete("/api/guilds/:guildId/blacklist/:userId", async (req, res) => {
    try {
      const auth = await requireGuildAccess(req, res);
      if (!auth) return;
      const { guildId, user } = auth;
      const canManageBlacklist = await canManageBlacklistDashboard(user.id, guildId).catch(() => false);
      if (!canManageBlacklist) {
        return res.status(403).json({ error: "You do not have permission to manage the blacklist for this server." });
      }

      const userId = String(req.params.userId || "").trim();
      if (!/^\d{17,20}$/.test(userId)) {
        return res.status(400).json({ error: "A valid Discord user ID is required." });
      }

      const updatedConfig = await withGuildConfigMutationLock(guildId, async () => {
        const config = await storage.getGuildConfig(guildId);
        return await storage.upsertGuildConfig({
          guildId,
          customCategoryPings: removeBlacklistedUserFromConfig(config?.customCategoryPings, userId),
        });
      }).catch(() => undefined);

      broadcastGuildUpdate(guildId, {
        type: "config-updated",
        config: updatedConfig || { guildId },
      });

      res.json({ success: true, userId });
    } catch (e: any) {
      res.status(500).json({ error: e.message || "Failed to remove this user from the blacklist." });
    }
  });

  app.post("/api/guilds/:guildId/blocks", async (req, res) => {
    try {
      const auth = await requireGuildAccess(req, res);
      if (!auth) return;
      const { guildId, user } = auth;

      const userId = String(req.body?.userId || "").trim();
      const system = String(req.body?.system || "").trim() as "staff_applications" | "modmail" | "appeal";
      const timeUnit = String(req.body?.timeUnit || "").trim().toLowerCase();
      const reason = String(req.body?.reason || "").trim();
      const duration = Number(req.body?.duration || 0);

      if (!/^\d{17,20}$/.test(userId)) {
        return res.status(400).json({ error: "A valid Discord user ID is required." });
      }
      if (!["staff_applications", "modmail", "appeal"].includes(system)) {
        return res.status(400).json({ error: "Choose a valid block section." });
      }
      if (!reason) {
        return res.status(400).json({ error: "A block reason is required." });
      }

      let expiresAt: Date | undefined;
      if (timeUnit !== "permanent") {
        const multipliers: Record<string, number> = {
          minutes: 60 * 1000,
          hours: 60 * 60 * 1000,
          days: 24 * 60 * 60 * 1000,
          weeks: 7 * 24 * 60 * 60 * 1000,
        };
        if (!Number.isFinite(duration) || duration <= 0 || !multipliers[timeUnit]) {
          return res.status(400).json({ error: "Enter a valid block duration." });
        }
        expiresAt = new Date(Date.now() + duration * multipliers[timeUnit]);
      }

      const config = await storage.getGuildConfig(guildId);
      if (system === "appeal") {
        await storage.removeAppealBlock(guildId, userId);
        await storage.createAppealBlock({
          guildId,
          userId,
          blockedById: user.id,
          reason,
          expiresAt,
        });
      } else if (system === "staff_applications") {
        await storage.upsertGuildConfig({
          guildId,
          customCategoryPings: writeStaffApplicationBlockToConfig(
            config?.customCategoryPings,
            userId,
            {
              blockedById: user.id,
              reason,
              expiresAt: expiresAt ? expiresAt.toISOString() : null,
            },
          ),
        });
      } else {
        await storage.removeModmailBlock(guildId, userId);
        await storage.createModmailBlock({
          guildId,
          userId,
          blockedById: user.id,
          reason,
          expiresAt,
        });
      }

      const updatedConfig = await storage.getGuildConfig(guildId).catch(() => undefined);
      broadcastGuildUpdate(guildId, {
        type: "config-updated",
        config: updatedConfig || { guildId },
      });

      res.json({ success: true, userId, system, expiresAt: expiresAt ? expiresAt.toISOString() : null });
    } catch (e: any) {
      res.status(500).json({ error: e.message || "Failed to block this user." });
    }
  });

  app.delete("/api/guilds/:guildId/blocks/:system/:userId", async (req, res) => {
    try {
      const auth = await requireGuildAccess(req, res);
      if (!auth) return;
      const { guildId } = auth;

      const system = String(req.params.system || "").trim() as "staff_applications" | "modmail" | "appeal";
      const userId = String(req.params.userId || "").trim();
      if (!/^\d{17,20}$/.test(userId)) {
        return res.status(400).json({ error: "A valid Discord user ID is required." });
      }
      if (!["staff_applications", "modmail", "appeal"].includes(system)) {
        return res.status(400).json({ error: "Choose a valid block section." });
      }

      if (system === "appeal") {
        await storage.removeAppealBlock(guildId, userId);
      } else if (system === "staff_applications") {
        const config = await storage.getGuildConfig(guildId);
        await storage.upsertGuildConfig({
          guildId,
          customCategoryPings: removeStaffApplicationBlockFromConfig(config?.customCategoryPings, userId),
        });
      } else {
        await storage.removeModmailBlock(guildId, userId);
      }

      const updatedConfig = await storage.getGuildConfig(guildId).catch(() => undefined);
      broadcastGuildUpdate(guildId, {
        type: "config-updated",
        config: updatedConfig || { guildId },
      });

      res.json({ success: true, userId, system });
    } catch (e: any) {
      res.status(500).json({ error: e.message || "Failed to unblock this user." });
    }
  });

  app.get("/api/guilds/:guildId/snippets", async (req, res) => {
    try {
      const auth = await requireGuildAccess(req, res);
      if (!auth) return;
      const { guildId } = auth;
      const snippets = await storage.getAllSnippets(guildId);
      res.json({ snippets });
    } catch (e: any) {
      res.status(500).json({ error: e.message });
    }
  });

  app.post("/api/guilds/:guildId/snippets", async (req, res) => {
    try {
      const auth = await requireGuildAccess(req, res);
      if (!auth) return;
      const { guildId, user } = auth;

      const alias = String(req.body?.alias || "").trim().toLowerCase();
      const content = String(req.body?.content || "").trim();
      if (!alias) return res.status(400).json({ error: "Snippet alias is required." });
      if (!content) return res.status(400).json({ error: "Snippet content is required." });

      const existing = await storage.getSnippet(guildId, alias);
      const snippet = existing
        ? await storage.updateSnippet(guildId, alias, content)
        : await storage.createSnippet({ guildId, alias, content, createdById: user.id });

      if (!snippet) return res.status(500).json({ error: "Failed to save snippet." });
      res.json({ success: true, snippet });
    } catch (e: any) {
      res.status(500).json({ error: e.message });
    }
  });

  app.delete("/api/guilds/:guildId/snippets/:alias", async (req, res) => {
    try {
      const auth = await requireGuildAccess(req, res);
      if (!auth) return;
      const { guildId } = auth;
      const alias = String(req.params.alias || "").trim().toLowerCase();
      if (!alias) return res.status(400).json({ error: "Snippet alias is required." });

      await storage.deleteSnippet(guildId, alias);
      res.json({ success: true });
    } catch (e: any) {
      res.status(500).json({ error: e.message });
    }
  });

  app.post("/api/guilds/:guildId/feature-embeds/:featureKey/post", async (req, res) => {
    try {
      const auth = await requireGuildAccess(req, res);
      if (!auth) return;
      const { guildId } = auth;
      const featureKey = String(req.params.featureKey || "").trim().toLowerCase();
      const hasBotToken = !!getDiscordBotToken();

      if (!hasBotToken && !client.isReady()) {
        return res.status(503).json({ error: "Bot token is not available, so the dashboard cannot post embeds right now." });
      }

      const config = await storage.getGuildConfig(guildId);
      let targetChannelId = String(req.body?.channelId || "").trim();
      let messagePayload: any = null;
      let sentMessage: any = null;
      let reactionRoleResultNote: string | null = null;

      if (featureKey === "modmail") {
        targetChannelId = targetChannelId || String(config?.modmailEmbedChannelId || "").trim();
        if (!targetChannelId) {
          return res.status(400).json({ error: "No modmail embed channel has been saved yet. Post it once after setup so the dashboard can refresh it." });
        }

        const embedTitle = config?.modmailEmbedTitle || "Support Tickets";
        const embedDescription = config?.modmailEmbedDescription || "Select a category below to create a ticket.";
        const ticketEmbed = new EmbedBuilder()
          .setTitle(embedTitle)
          .setDescription(embedDescription)
          .setColor(0x2f3136);

        let customCategories: { id: string; label: string; description: string; emoji?: string; modalQuestions?: string[] }[] = [];
        if (config?.customModmailCategories) {
          try {
            customCategories = JSON.parse(config.customModmailCategories);
          } catch {
            customCategories = [];
          }
        }

        const builtInCategories = [
          { id: "general", label: "General Inquiries", description: "General questions or support", emoji: "📥" },
          { id: "competitive", label: "Apply For Competitive", description: "Apply to join the competitive team", emoji: "🖥️" },
          { id: "contentcreator", label: "Apply For Content Creator", description: "Apply to become a content creator", emoji: "📷" },
          { id: "report", label: "User Reports", description: "Report a user", emoji: "🚨" },
          { id: "partnerships", label: "Partnerships", description: "Partnership inquiries", emoji: "📋" },
        ];

        const categoriesToUse = customCategories.length > 0 ? customCategories : builtInCategories;
        const options = categoriesToUse.map((cat) => {
          const hasModal = "modalQuestions" in cat && Array.isArray(cat.modalQuestions) && cat.modalQuestions.length > 0;
          const option = new StringSelectMenuOptionBuilder()
            .setLabel(String(cat.label || "Category").slice(0, 100))
            .setDescription(String(cat.description || "Open a ticket").slice(0, 100))
            .setValue(hasModal ? `${cat.id}::modal` : String(cat.id || "general"));
          if (cat.emoji) option.setEmoji(cat.emoji);
          return option;
        });

        const selectMenu = new StringSelectMenuBuilder()
          .setCustomId(`ticket_select_${guildId}`)
          .setPlaceholder("Select a ticket category...")
          .addOptions(options);

        const row = new ActionRowBuilder<StringSelectMenuBuilder>().addComponents(selectMenu);
        messagePayload = { embeds: [ticketEmbed], components: [row] };
      } else if (featureKey === "appeals") {
        if (!targetChannelId) {
          return res.status(400).json({ error: "Choose an appeal embed channel first." });
        }

        const appealEmbed = new EmbedBuilder()
          .setTitle(config?.appealEmbedTitle || "Ban Appeals")
          .setDescription(config?.appealEmbedDescription || "Click the button below to submit a ban appeal.")
          .setColor(0x2f3136);

        const row = new ActionRowBuilder<ButtonBuilder>().addComponents(
          new ButtonBuilder()
            .setCustomId(`appeal_start_${guildId}`)
            .setLabel("Submit Ban Appeal")
            .setStyle(ButtonStyle.Primary)
            .setEmoji("📝")
        );
        messagePayload = { embeds: [appealEmbed], components: [row] };
      } else if (featureKey === "staff-intro") {
        if (!targetChannelId) {
          return res.status(400).json({ error: "Choose a staff intro embed channel first." });
        }

        const embed = new EmbedBuilder()
          .setTitle(config?.staffIntroEmbedTitle || "Staff Introduction Quiz")
          .setDescription(config?.staffIntroEmbedDescription || "Welcome to the staff introduction quiz! This quiz will help you understand our policies and procedures.")
          .setColor(0x5865f2)
          .setFooter({ text: "Make sure your DMs are open!" });

        const row = new ActionRowBuilder<ButtonBuilder>().addComponents(
          new ButtonBuilder().setCustomId(`start_quiz_${guildId}`).setLabel("Start Quiz").setStyle(ButtonStyle.Primary).setEmoji("📝"),
          new ButtonBuilder().setCustomId(`terminate_quizzes_${guildId}`).setLabel("Terminate Quiz").setStyle(ButtonStyle.Danger).setEmoji("✖️")
        );
        messagePayload = { embeds: [embed], components: [row] };
      } else if (featureKey === "inactivity") {
        if (!targetChannelId) {
          return res.status(400).json({ error: "Choose an inactivity embed channel first." });
        }

        const embed = new EmbedBuilder()
          .setTitle(config?.inactivityEmbedTitle || "Inactivity Request")
          .setDescription(config?.inactivityEmbedDescription || "Need to take a break? Click the button below to submit an inactivity request.")
          .setColor(0x5865f2)
          .setFooter({ text: "All requests require approval" });

        const row = new ActionRowBuilder<ButtonBuilder>().addComponents(
          new ButtonBuilder().setCustomId(`request_inactivity_${guildId}`).setLabel("Request Inactivity").setStyle(ButtonStyle.Primary).setEmoji("📋")
        );
        messagePayload = { embeds: [embed], components: [row] };
      } else if (featureKey === "payouts") {
        if (!targetChannelId) {
          return res.status(400).json({ error: "Choose a payout embed channel first." });
        }

        const embed = new EmbedBuilder()
          .setTitle("Payout Request System")
          .setDescription("Click the button below to request a payout.")
          .setColor(0x5865f2);

        const row = new ActionRowBuilder<ButtonBuilder>().addComponents(
          new ButtonBuilder().setCustomId("request_payout").setLabel("Request Payout").setStyle(ButtonStyle.Primary)
        );
        messagePayload = { embeds: [embed], components: [row] };
      } else if (featureKey === "reaction-roles") {
        const hasOverride = req.body?.reactionRoleSetup && typeof req.body.reactionRoleSetup === "object" && !Array.isArray(req.body.reactionRoleSetup);
        const reactionRoleSetup = hasOverride
          ? normalizeReactionRoleSetup(req.body.reactionRoleSetup)
          : getReactionRoleSetup(config?.customCategoryPings);
        const configuredItems = reactionRoleSetup.items.filter((entry) => entry.roleId && (reactionRoleSetup.pickerStyle !== "reactions" || entry.emoji));

        if (configuredItems.length === 0) {
          return res.status(400).json({
            error: reactionRoleSetup.pickerStyle === "reactions"
              ? "Add at least one reaction role entry with an emoji first."
              : "Add at least one role option first.",
          });
        }

        const linkedMessage = extractDiscordMessageTarget(reactionRoleSetup.existingMessageInput);
        const linkedChannelId = linkedMessage.channelId || reactionRoleSetup.channelId || targetChannelId;
        const linkedMessageId = linkedMessage.messageId || reactionRoleSetup.messageId;
        const managedMessageId = !reactionRoleSetup.useExistingMessage
          ? String(reactionRoleSetup.messageId || "").trim()
          : "";
        const { components: reactionRoleComponents, note: componentNote } = await buildReactionRoleComponents(guildId, configuredItems, reactionRoleSetup.pickerStyle);
        const guildForEmbed = client.guilds.cache.get(guildId) ?? await client.guilds.fetch(guildId).catch(() => null);
        const guildIconUrl = normalizeReactionRoleAssetUrl(guildForEmbed?.iconURL({ size: 256 }) || undefined);
        const embedInstruction = reactionRoleSetup.pickerStyle === "buttons"
          ? "\n\nUse the buttons below to add or remove your roles."
          : reactionRoleSetup.pickerStyle === "dropdown"
            ? "\n\nUse the dropdown menu below to choose your roles."
            : "";

        let embedColor = 0x5865f2;
        if (reactionRoleSetup.embedColor) {
          const parsedColor = parseInt(reactionRoleSetup.embedColor.replace("#", ""), 16);
          if (!Number.isNaN(parsedColor) && parsedColor >= 0 && parsedColor <= 0xffffff) {
            embedColor = parsedColor;
          }
        }

        const reactionRoleEmbed = new EmbedBuilder()
          .setTitle(reactionRoleSetup.embedTitle || DEFAULT_REACTION_ROLE_SETUP.embedTitle)
          .setDescription(`${reactionRoleSetup.embedDescription || DEFAULT_REACTION_ROLE_SETUP.embedDescription}${embedInstruction}`)
          .setColor(embedColor)
          .setFooter({
            text: reactionRoleSetup.footerText || reactionRoleSetup.name || DEFAULT_REACTION_ROLE_SETUP.name,
            iconURL: normalizeReactionRoleAssetUrl(reactionRoleSetup.footerIcon) || guildIconUrl,
          });

        if (reactionRoleSetup.authorName || reactionRoleSetup.authorIcon || guildIconUrl) {
          reactionRoleEmbed.setAuthor({
            name: reactionRoleSetup.authorName || reactionRoleSetup.name || DEFAULT_REACTION_ROLE_SETUP.name,
            iconURL: normalizeReactionRoleAssetUrl(reactionRoleSetup.authorIcon) || guildIconUrl,
          });
        }

        const thumbnailUrl = normalizeReactionRoleAssetUrl(reactionRoleSetup.thumbnailUrl) || guildIconUrl;
        if (thumbnailUrl) {
          reactionRoleEmbed.setThumbnail(thumbnailUrl);
        }

        const imageUrl = normalizeReactionRoleAssetUrl(reactionRoleSetup.imageUrl);
        if (imageUrl) {
          reactionRoleEmbed.setImage(imageUrl);
        }

        const shouldUpdateLinkedMessage = !reactionRoleSetup.useExistingMessage && !!managedMessageId;

        if (reactionRoleSetup.useExistingMessage || shouldUpdateLinkedMessage) {
          const targetMessageId = reactionRoleSetup.useExistingMessage ? linkedMessageId : managedMessageId;
          const targetMessageChannelId = reactionRoleSetup.useExistingMessage
            ? linkedChannelId
            : (targetChannelId || reactionRoleSetup.channelId || "");

          if (!targetMessageId && reactionRoleSetup.useExistingMessage) {
            return res.status(400).json({ error: "Enter a valid message ID or Discord message link first." });
          }

          if (!targetMessageChannelId) {
            return res.status(400).json({ error: "Choose the channel that contains the existing message." });
          }

          targetChannelId = String(targetMessageChannelId).trim();
          if (targetMessageId) {
            sentMessage = hasBotToken
              ? await discordBotApiRequest<any>(`/channels/${targetChannelId}/messages/${targetMessageId}`, {
                  method: "GET",
                }).catch(() => null)
              : await (async () => {
                  const channel = await client.channels.fetch(targetChannelId).catch(() => null);
                  if (!channel || !("messages" in channel)) {
                    return null;
                  }
                  return await (channel as any).messages.fetch(targetMessageId).catch(() => null);
                })();
          }

          const botUserId = String((sentMessage as any)?.application_id || client.user?.id || "").trim();
          const messageAuthorId = String((sentMessage as any)?.author?.id || "").trim();
          const canEditExistingMessage = !!botUserId && messageAuthorId === botUserId;
          if (reactionRoleSetup.useExistingMessage && reactionRoleSetup.pickerStyle !== "reactions" && !canEditExistingMessage) {
            return res.status(400).json({ error: "Buttons and dropdown menus can only be attached to a message sent by the bot. Use reactions or post a new embed instead." });
          }

          if (sentMessage && canEditExistingMessage) {
            sentMessage = hasBotToken
              ? await discordBotApiRequest<any>(`/channels/${targetChannelId}/messages/${targetMessageId}`, {
                  method: "PATCH",
                  body: JSON.stringify({
                    embeds: [reactionRoleEmbed.toJSON()],
                    components: reactionRoleComponents.map((component: any) => typeof component?.toJSON === "function" ? component.toJSON() : component),
                  }),
                })
              : await (sentMessage as any).edit({ embeds: [reactionRoleEmbed], components: reactionRoleComponents });

            if (reactionRoleSetup.pickerStyle !== "reactions") {
              try {
                if (hasBotToken) {
                  await discordBotApiRequest(`/channels/${targetChannelId}/messages/${targetMessageId}/reactions`, {
                    method: "DELETE",
                  });
                } else if (typeof (sentMessage as any)?.reactions?.removeAll === "function") {
                  await (sentMessage as any).reactions.removeAll();
                }
              } catch {
                // Ignore stale reaction cleanup failures when switching picker styles.
              }
            }
          } else if (reactionRoleSetup.useExistingMessage && !sentMessage) {
            return res.status(404).json({ error: "Could not find the existing reaction role message to update." });
          } else {
            sentMessage = null;
          }
        }

        if (!sentMessage) {
          targetChannelId = targetChannelId || reactionRoleSetup.channelId || "";
          if (!targetChannelId) {
            return res.status(400).json({ error: "Choose a channel for the reaction role embed first." });
          }

          messagePayload = { embeds: [reactionRoleEmbed], components: reactionRoleComponents };
        }

        reactionRoleResultNote = componentNote;
      } else {
        return res.status(400).json({ error: "That embed type is not supported yet from the dashboard." });
      }

      if (!sentMessage) {
        sentMessage = hasBotToken
          ? await discordBotApiRequest<any>(`/channels/${targetChannelId}/messages`, {
              method: "POST",
              body: JSON.stringify({
                embeds: (messagePayload?.embeds || []).map((embed: any) => typeof embed?.toJSON === "function" ? embed.toJSON() : embed),
                components: (messagePayload?.components || []).map((component: any) => typeof component?.toJSON === "function" ? component.toJSON() : component),
              }),
            })
          : await (async () => {
              const channel = await client.channels.fetch(targetChannelId).catch(() => null);
              if (!channel || !("send" in channel)) {
                throw new Error("Could not access the target channel.");
              }
              return await (channel as any).send(messagePayload);
            })();
      }

      if (featureKey === "reaction-roles") {
        const hasOverride = req.body?.reactionRoleSetup && typeof req.body.reactionRoleSetup === "object" && !Array.isArray(req.body.reactionRoleSetup);
        const reactionRoleSetup = hasOverride
          ? normalizeReactionRoleSetup(req.body.reactionRoleSetup)
          : getReactionRoleSetup(config?.customCategoryPings);
        const configuredItems = reactionRoleSetup.items.filter((entry) => entry.roleId && (reactionRoleSetup.pickerStyle !== "reactions" || entry.emoji));

        if (reactionRoleSetup.pickerStyle === "reactions") {
          try {
            if (hasBotToken) {
              await discordBotApiRequest(`/channels/${targetChannelId}/messages/${sentMessage.id}/reactions`, {
                method: "DELETE",
              });
            } else if (typeof (sentMessage as any)?.reactions?.removeAll === "function") {
              await (sentMessage as any).reactions.removeAll();
            }
          } catch {
            // Ignore cleanup failures before reapplying the configured reaction set.
          }

          const uniqueReactionValues = Array.from(new Set(
            configuredItems
              .map((entry) => normalizeReactionEmojiValue(entry.emoji))
              .filter(Boolean),
          ));
          const reactionValuesToApply = uniqueReactionValues.slice(0, 20);
          const skippedForLimit = Math.max(0, uniqueReactionValues.length - reactionValuesToApply.length);
          let reactionFailures = 0;

          for (const reactionValue of reactionValuesToApply) {
            try {
              if (hasBotToken) {
                await discordBotApiRequest(`/channels/${targetChannelId}/messages/${sentMessage.id}/reactions/${encodeURIComponent(reactionValue)}/@me`, {
                  method: "PUT",
                });
              } else if (typeof (sentMessage as any)?.react === "function") {
                await (sentMessage as any).react(reactionValue);
              }
            } catch {
              reactionFailures += 1;
            }
          }

          const reactionNotes: string[] = [];
          if (reactionValuesToApply.length > 0) {
            const appliedCount = reactionValuesToApply.length - reactionFailures;
            reactionNotes.push(`Applied ${appliedCount}/${reactionValuesToApply.length} reaction emoji${reactionValuesToApply.length === 1 ? "" : "s"}.`);
          }
          if (skippedForLimit > 0) {
            reactionNotes.push(`Discord only allows 20 unique reactions on one message, so ${skippedForLimit} extra entr${skippedForLimit === 1 ? "y was" : "ies were"} skipped. Use buttons or the dropdown menu for larger role sets.`);
          }
          if (reactionFailures > 0) {
            reactionNotes.push(`${reactionFailures} reaction emoji couldn't be added. Check the emoji format or the bot's access to external emoji.`);
          }

          reactionRoleResultNote = [reactionRoleResultNote, ...reactionNotes].filter(Boolean).join(" ").trim() || null;
        }

        await storage.upsertGuildConfig({
          guildId,
          customCategoryPings: writeReactionRoleSetup(config?.customCategoryPings, {
            ...reactionRoleSetup,
            channelId: targetChannelId,
            messageId: String(sentMessage.id || "").trim() || null,
          }, targetChannelId),
        });
      }

      if (featureKey === "modmail") {
        await storage.upsertGuildConfig({
          guildId,
          modmailEmbedChannelId: targetChannelId,
          modmailEmbedMessageId: sentMessage.id,
        });
      }

      res.json({ success: true, channelId: targetChannelId, messageId: sentMessage.id, note: reactionRoleResultNote });
    } catch (e: any) {
      res.status(500).json({ error: e.message });
    }
  });

  app.post("/api/guilds/:guildId/updates/post-latest", async (req, res) => {
    try {
      const auth = await requireGuildAccess(req, res);
      if (!auth) return;
      const { guildId, user } = auth;

      const config = await storage.getGuildConfig(guildId);
      const targetChannelId = String(req.body?.channelId || config?.commandLogChannelId || "").trim();
      if (!targetChannelId) {
        return res.status(400).json({ error: "Choose an Updates Channel first." });
      }

      const enabledFeatures = getEnabledFeatureLabels(config?.customCategoryPings);
      const summaryLines = [
        ...LATEST_BOT_UPDATE_HIGHLIGHTS,
        `Enabled modules right now: ${enabledFeatures.length > 0 ? `${enabledFeatures.slice(0, 6).join(", ")}${enabledFeatures.length > 6 ? ` +${enabledFeatures.length - 6} more` : ""}` : "None"}`,
      ];

      const posted = await postDashboardUpdateToChannel(guildId, targetChannelId, user.id, summaryLines, {
        title: "Latest Bot Update",
        description: `Posted by <@${user.id}>`,
      });
      if (!posted) {
        return res.status(500).json({ error: "Failed to post the latest update to that channel." });
      }

      res.json({ success: true, channelId: targetChannelId });
    } catch (e: any) {
      res.status(500).json({ error: e.message || "Failed to post the latest update." });
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

      if (typeof updates.customCategoryPings === "string") {
        updates.customCategoryPings = mergeProtectedCustomCategoryCollections(
          updates.customCategoryPings,
          previousConfig?.customCategoryPings,
        );
      }

      const hasManagerAccess = await canManageGuildDashboard(user.id, guildId).catch(() => false);
      const hasSecurityAccess = await canManageSecurityDashboard(user.id, guildId).catch(() => false);
      const nextComparableConfig = {
        ...(previousConfig || {}),
        ...updates,
        guildId,
      };
      const securityChanged = didSecuritySettingsChange(previousConfig || {}, nextComparableConfig);

      if (securityChanged && !hasSecurityAccess) {
        return res.status(403).json({ error: "You do not have permission to edit the Security category for this server." });
      }

      if (!hasManagerAccess) {
        if (!hasOnlySecurityConfigChanges(previousConfig || {}, nextComparableConfig)) {
          return res.status(403).json({ error: "You can only edit the Security category for this server." });
        }
      }
      
      await withGuildConfigMutationLock(guildId, async () => {
        await storage.upsertGuildConfig({ guildId, ...updates });
      });
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

      const configChangeSummary = getDashboardConfigChangeSummary(previousConfig, config);
      if (configChangeSummary.length > 0 && config?.commandLogChannelId) {
        await postDashboardUpdateToChannel(guildId, config.commandLogChannelId, user.id, configChangeSummary);
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
      const rosterEmbeds = await getRosterEmbedsForGuild(guildId);
      res.json({ rosters, rosterEmbeds });
    } catch (e: any) {
      res.status(500).json({ error: e.message });
    }
  });

  app.get("/api/guilds/:guildId/roster-embeds", async (req, res) => {
    try {
      const auth = await requireGuildAccess(req, res);
      if (!auth) return;
      const { guildId } = auth;
      const rosterEmbeds = await getRosterEmbedsForGuild(guildId);
      res.json({ rosterEmbeds });
    } catch (e: any) {
      res.status(500).json({ error: e.message });
    }
  });

  app.get("/api/guilds/:guildId/role-syncs", async (req, res) => {
    try {
      const auth = await requireGuildAccess(req, res);
      if (!auth) return;
      const { guildId } = auth;
      const roleSyncs = await getRoleSyncItemsByGuild(guildId);
      res.json({ roleSyncs });
    } catch (e: any) {
      res.status(500).json({ error: e.message });
    }
  });

  app.post("/api/guilds/:guildId/role-syncs", async (req, res) => {
    try {
      const auth = await requireGuildAccess(req, res);
      if (!auth) return;
      const { user, guildId } = auth;
      const direction = String(req.body?.direction || "one-way").trim().toLowerCase() === "two-way" ? "two-way" : "one-way";
      const sourceGuildId = String(req.body?.sourceGuildId || "").trim();
      const sourceRoleId = String(req.body?.sourceRoleId || "").trim();
      const targetGuildId = String(req.body?.targetGuildId || "").trim();
      const targetRoleId = String(req.body?.targetRoleId || "").trim();

      const snowflakeRegex = /^\d{17,19}$/;
      if (![sourceGuildId, sourceRoleId, targetGuildId, targetRoleId].every((value) => snowflakeRegex.test(value))) {
        return res.status(400).json({ error: "All server and role IDs must be valid Discord snowflakes." });
      }
      if (sourceGuildId === targetGuildId && sourceRoleId === targetRoleId) {
        return res.status(400).json({ error: "Choose different source and target roles." });
      }

      const sourceAllowed = await canAccessGuild(user.id, sourceGuildId);
      const targetAllowed = await canAccessGuild(user.id, targetGuildId);
      if (!sourceAllowed || !targetAllowed) {
        return res.status(403).json({ error: "You need dashboard access to both servers to manage role sync." });
      }

      // Best-effort guild presence check — only block if guild is definitely absent after fetch
      let sourceGuild = client.guilds.cache.get(sourceGuildId);
      if (!sourceGuild) {
        try { sourceGuild = await client.guilds.fetch(sourceGuildId) as any; } catch { /* not in guild */ }
      }
      let targetGuild = client.guilds.cache.get(targetGuildId);
      if (!targetGuild) {
        try { targetGuild = await client.guilds.fetch(targetGuildId) as any; } catch { /* not in guild */ }
      }
      // Skip hard guild check — roles were already loaded from bot guild config on client
      // Only warn but don't block so stale cache doesn't cause false errors

      const existingPairs = await storage.getAllRoleSyncPairs();
      let existingForward = existingPairs.find((pair) => (
        pair.sourceGuildId === sourceGuildId
        && pair.sourceRoleId === sourceRoleId
        && pair.targetGuildId === targetGuildId
        && pair.targetRoleId === targetRoleId
      ));
      let existingReverse = existingPairs.find((pair) => (
        pair.sourceGuildId === targetGuildId
        && pair.sourceRoleId === targetRoleId
        && pair.targetGuildId === sourceGuildId
        && pair.targetRoleId === sourceRoleId
      ));

      // Idempotent + self-healing: create only missing directions and avoid
      // returning "already exists" for partially created historical state.
      let createdForwardId: string | null = null;
      if (!existingForward) {
        const created = await storage.addRoleSyncPair({ sourceGuildId, sourceRoleId, targetGuildId, targetRoleId });
        createdForwardId = created.id;
        existingForward = created;
      }

      if (direction === "two-way" && !existingReverse) {
        try {
          const createdReverse = await storage.addRoleSyncPair({
            sourceGuildId: targetGuildId,
            sourceRoleId: targetRoleId,
            targetGuildId: sourceGuildId,
            targetRoleId: sourceRoleId,
          });
          existingReverse = createdReverse;
        } catch (error) {
          // Roll back forward insert so the operation is all-or-nothing.
          if (createdForwardId) {
            await storage.removeRoleSyncPair(createdForwardId).catch(() => undefined);
          }
          throw error;
        }
      }

      const roleSyncs = await getRoleSyncItemsByGuild(guildId);
      res.json({ success: true, roleSyncs });
    } catch (e: any) {
      res.status(500).json({ error: e.message });
    }
  });

  app.delete("/api/guilds/:guildId/role-syncs/:syncId", async (req, res) => {
    try {
      const auth = await requireGuildAccess(req, res);
      if (!auth) return;
      const { guildId } = auth;
      const syncId = String(req.params.syncId || "").trim();
      if (!syncId) return res.status(400).json({ error: "Sync id is required." });

      const allPairs = await storage.getAllRoleSyncPairs();
      const pair = allPairs.find((entry) => entry.id === syncId);
      if (!pair) return res.status(404).json({ error: "Role sync not found." });

      await storage.removeRoleSyncPair(pair.id);
      const reciprocal = allPairs.find((candidate) => (
        candidate.id !== pair.id
        && candidate.sourceGuildId === pair.targetGuildId
        && candidate.sourceRoleId === pair.targetRoleId
        && candidate.targetGuildId === pair.sourceGuildId
        && candidate.targetRoleId === pair.sourceRoleId
      ));
      if (reciprocal) {
        await storage.removeRoleSyncPair(reciprocal.id);
      }

      const roleSyncs = await getRoleSyncItemsByGuild(guildId);
      res.json({ success: true, roleSyncs });
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

      const normalizedName = String(name || "").trim().toLowerCase();
      const createKey = `${guildId}:${normalizedName}`;
      if (pendingRosterCreates.has(createKey)) {
        return res.status(409).json({ error: "That roster is already being created. Please wait a moment." });
      }
      pendingRosterCreates.add(createKey);

      const existing = await storage.getRosterConfig(guildId, normalizedName);
      if (existing) {
        pendingRosterCreates.delete(createKey);
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
      const rosterEmbeds = await getRosterEmbedsForGuild(guildId);
      broadcastGuildUpdate(guildId, {
        type: "rosters-updated",
        guildId,
        rosters,
        rosterEmbeds,
        editorId: user.id,
      });
      res.json({ success: true, roster });
    } catch (e: any) {
      res.status(500).json({ error: e.message });
    } finally {
      const pendingName = String(req.body?.name || "").trim().toLowerCase();
      const guildId = String(req.params.guildId || "").trim();
      if (guildId && pendingName) {
        pendingRosterCreates.delete(`${guildId}:${pendingName}`);
      }
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
      const rosterEmbeds = await getRosterEmbedsForGuild(guildId);
      broadcastGuildUpdate(guildId, {
        type: "rosters-updated",
        guildId,
        rosters,
        rosterEmbeds,
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
      const rosterEmbeds = await getRosterEmbedsForGuild(guildId);
      broadcastGuildUpdate(guildId, {
        type: "rosters-updated",
        guildId,
        rosters,
        rosterEmbeds,
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
      const rosterEmbeds = await getRosterEmbedsForGuild(guildId);
      broadcastGuildUpdate(guildId, {
        type: "rosters-updated",
        guildId,
        rosters,
        rosterEmbeds,
        editorId: user.id,
      });

      res.json({ success: true, roster: updated });
    } catch (e: any) {
      res.status(500).json({ error: e.message });
    }
  });

  app.post("/api/guilds/:guildId/roster-embeds", async (req, res) => {
    try {
      const auth = await requireGuildAccess(req, res);
      if (!auth) return;
      const { guildId, user } = auth;

      const normalizedConfig = normalizeRosterEmbedConfig(req.body || {});
      const name = String(req.body?.name || "").trim();
      if (!name || !normalizedConfig) {
        return res.status(400).json({ error: "Embed name, title, description, and at least one valid button are required." });
      }

      const existingConfig = await storage.getGuildConfig(guildId);
      const rosterEmbeds = getSavedRosterEmbeds(existingConfig?.customCategoryPings);
      const normalizedName = name.toLowerCase();
      if (rosterEmbeds.some((entry) => entry.name.trim().toLowerCase() === normalizedName)) {
        return res.status(400).json({ error: "A roster embed with that name already exists." });
      }

      const created: SavedRosterEmbedConfig = { id: crypto.randomUUID(), name, ...normalizedConfig };
      const nextEmbeds = [...rosterEmbeds, created];

      await storage.upsertGuildConfig({
        guildId,
        customCategoryPings: writeSavedRosterEmbeds(existingConfig?.customCategoryPings, nextEmbeds),
      });

      const rosters = await getRostersWithEmbedConfigs(guildId);
      broadcastGuildUpdate(guildId, {
        type: "rosters-updated",
        guildId,
        rosters,
        rosterEmbeds: nextEmbeds,
        editorId: user.id,
      });

      res.json({ success: true, rosterEmbed: created });
    } catch (e: any) {
      res.status(500).json({ error: e.message });
    }
  });

  app.put("/api/guilds/:guildId/roster-embeds/:embedId", async (req, res) => {
    try {
      const auth = await requireGuildAccess(req, res);
      if (!auth) return;
      const { guildId, user } = auth;
      const embedId = String(req.params.embedId || "").trim();
      if (!embedId) return res.status(400).json({ error: "Embed id is required." });

      const normalizedConfig = normalizeRosterEmbedConfig(req.body || {});
      const name = String(req.body?.name || "").trim();
      if (!name || !normalizedConfig) {
        return res.status(400).json({ error: "Embed name, title, description, and at least one valid button are required." });
      }

      const existingConfig = await storage.getGuildConfig(guildId);
      const rosterEmbeds = getSavedRosterEmbeds(existingConfig?.customCategoryPings);
      const currentEmbed = rosterEmbeds.find((entry) => entry.id === embedId);
      if (!currentEmbed) return res.status(404).json({ error: "Roster embed not found." });

      const normalizedName = name.toLowerCase();
      if (rosterEmbeds.some((entry) => entry.id !== embedId && entry.name.trim().toLowerCase() === normalizedName)) {
        return res.status(400).json({ error: "A roster embed with that name already exists." });
      }

      const updated: SavedRosterEmbedConfig = {
        id: currentEmbed.id,
        name,
        ...normalizedConfig,
        messageId: currentEmbed.messageId || normalizedConfig.messageId || null,
      };

      const nextEmbeds = rosterEmbeds.map((entry) => entry.id === embedId ? updated : entry);
      await storage.upsertGuildConfig({
        guildId,
        customCategoryPings: writeSavedRosterEmbeds(existingConfig?.customCategoryPings, nextEmbeds),
      });

      const rosters = await getRostersWithEmbedConfigs(guildId);
      broadcastGuildUpdate(guildId, {
        type: "rosters-updated",
        guildId,
        rosters,
        rosterEmbeds: nextEmbeds,
        editorId: user.id,
      });

      res.json({ success: true, rosterEmbed: updated });
    } catch (e: any) {
      res.status(500).json({ error: e.message });
    }
  });

  app.delete("/api/guilds/:guildId/roster-embeds/:embedId", async (req, res) => {
    try {
      const auth = await requireGuildAccess(req, res);
      if (!auth) return;
      const { guildId, user } = auth;
      const embedId = String(req.params.embedId || "").trim();
      if (!embedId) return res.status(400).json({ error: "Embed id is required." });

      const existingConfig = await storage.getGuildConfig(guildId);
      const rosterEmbeds = getSavedRosterEmbeds(existingConfig?.customCategoryPings);
      const nextEmbeds = rosterEmbeds.filter((entry) => entry.id !== embedId);

      await storage.upsertGuildConfig({
        guildId,
        customCategoryPings: writeSavedRosterEmbeds(existingConfig?.customCategoryPings, nextEmbeds),
      });

      const rosters = await getRostersWithEmbedConfigs(guildId);
      broadcastGuildUpdate(guildId, {
        type: "rosters-updated",
        guildId,
        rosters,
        rosterEmbeds: nextEmbeds,
        editorId: user.id,
      });

      res.json({ success: true });
    } catch (e: any) {
      res.status(500).json({ error: e.message });
    }
  });

  app.post("/api/guilds/:guildId/roster-embeds/:embedId/post", async (req, res) => {
    try {
      const auth = await requireGuildAccess(req, res);
      if (!auth) return;
      const { guildId, user } = auth;
      const embedId = String(req.params.embedId || "").trim();
      if (!embedId) return res.status(400).json({ error: "Embed id is required." });

      if (!client.isReady()) return res.status(503).json({ error: "Bot is not online. Start the bot before posting roster embeds." });

      const guild = client.guilds.cache.get(guildId);
      if (!guild) return res.status(400).json({ error: "Bot is not in this server." });

      const existingConfig = await storage.getGuildConfig(guildId);
      const rosterEmbeds = getSavedRosterEmbeds(existingConfig?.customCategoryPings);
      const targetEmbed = rosterEmbeds.find((entry) => entry.id === embedId);
      if (!targetEmbed) return res.status(404).json({ error: "Roster embed not found." });

      const targetChannelId = String(req.body?.channelId || "").trim() || String(targetEmbed.channelId || "").trim();
      if (!targetChannelId) return res.status(400).json({ error: "No channel configured for this roster embed." });

      let embedColor = 0x5865f2;
      if (targetEmbed.embedColor) {
        const parsed = parseInt(targetEmbed.embedColor.replace("#", ""), 16);
        if (!Number.isNaN(parsed) && parsed >= 0 && parsed <= 0xffffff) embedColor = parsed;
      }

      const missingRosters: string[] = [];
      const buttons: ButtonBuilder[] = [];
      for (const buttonConfig of targetEmbed.buttons) {
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
          if (customEmojiMatch) button.setEmoji({ name: customEmojiMatch[1], id: customEmojiMatch[2] });
          else button.setEmoji(buttonConfig.emoji);
        }

        buttons.push(button);
      }

      if (missingRosters.length > 0) return res.status(400).json({ error: `The following rosters don't exist: ${missingRosters.join(", ")}.` });
      if (buttons.length === 0) return res.status(400).json({ error: "No valid embed buttons to post." });

      const targetChannel = await client.channels.fetch(targetChannelId).catch(() => null);
      if (!targetChannel || !("send" in targetChannel)) return res.status(400).json({ error: "Could not find the embed channel. Make sure the bot has access." });

      const embed = new EmbedBuilder().setTitle(targetEmbed.title).setDescription(targetEmbed.description).setColor(embedColor);
      const row = new ActionRowBuilder<ButtonBuilder>().addComponents(buttons.slice(0, 5));

      let postedMessageId = String(targetEmbed.messageId || "").trim() || null;
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

      const nextEmbeds = rosterEmbeds.map((entry) => entry.id === embedId ? { ...entry, channelId: targetChannelId, messageId: postedMessageId } : entry);
      await storage.upsertGuildConfig({
        guildId,
        customCategoryPings: writeSavedRosterEmbeds(existingConfig?.customCategoryPings, nextEmbeds),
      });

      const rosters = await getRostersWithEmbedConfigs(guildId);
      const updatedEmbed = nextEmbeds.find((entry) => entry.id === embedId) || null;
      broadcastGuildUpdate(guildId, {
        type: "rosters-updated",
        guildId,
        rosters,
        rosterEmbeds: nextEmbeds,
        editorId: user.id,
      });

      res.json({ success: true, rosterEmbed: updatedEmbed });
    } catch (e: any) {
      res.status(500).json({ error: e.message });
    }
  });

  return httpServer;
}
