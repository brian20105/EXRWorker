import { useState, useEffect, useRef } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { DropdownMenu, DropdownMenuCheckboxItem, DropdownMenuContent, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Separator } from "@/components/ui/separator";
import { Switch } from "@/components/ui/switch";
import { useToast } from "@/hooks/use-toast";
import { ArrowLeft, Save, Server, Shield, ShieldAlert, CheckCircle2, AlertCircle, Copy, Hash, Braces, Moon, Sun, ChevronDown, Search, Settings, Palette, Users, Plus, Pencil, Trash2, X, SlidersHorizontal, Sparkles, ListTree, Mail } from "lucide-react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { useTheme } from "next-themes";
import { useLocation, useRoute } from "wouter";

interface Guild {
  id: string;
  name: string;
  icon: string | null;
  memberCount: number;
  isDisabled?: boolean;
}

interface Channel {
  id: string;
  name: string;
  type: number;
}

interface Role {
  id: string;
  name: string;
  color: string;
}

interface GuildConfig {
  commandPrefix?: string;
  requestChannelId?: string | null;
  logChannelId?: string | null;
  playerRosterChannelId?: string | null;
  playerRosterMessageId?: string | null;
  staffRosterChannelId?: string | null;
  staffRosterMessageId?: string | null;
  banChannelId?: string | null;
  unbanChannelId?: string | null;
  banLogChannelId?: string | null;
  unbanLogChannelId?: string | null;
  modmailCategoryId?: string | null;
  modmailLogChannelId?: string | null;
  modmailEmbedMessageId?: string | null;
  modmailEmbedChannelId?: string | null;
  appealCategoryId?: string | null;
  appealLogChannelId?: string | null;
  quizLogChannelId?: string | null;
  modLogChannelId?: string | null;
  commandLogChannelId?: string | null;
  staffIntroChannelId?: string | null;
  staffIntroSubmissionsChannelId?: string | null;
  inactivityChannelId?: string | null;
  inactivitySubmissionsChannelId?: string | null;
  inactivityLogChannelId?: string | null;
  allowedRoleIds?: string[];
  modRoleIds?: string[];
  modmailStaffRoleIds?: string[];
  modmailBlockRoleIds?: string[];
  modmailClaimRoleIds?: string[];
  appealStaffRoleIds?: string[];
  snippetRoleIds?: string[];
  activityRoleIds?: string[];
  messageCommandRoleIds?: string[];
  rosterCommandRoleIds?: string[];
  roleCommandRoleIds?: string[];
  activityTrackedRoleIds?: string[];
  activityResetRoleIds?: string[];
  inactivityPingRoleIds?: string[];
  modmailEmbedTitle?: string | null;
  modmailEmbedDescription?: string | null;
  appealEmbedTitle?: string | null;
  appealEmbedDescription?: string | null;
  staffIntroEmbedTitle?: string | null;
  staffIntroEmbedDescription?: string | null;
  inactivityEmbedTitle?: string | null;
  inactivityEmbedDescription?: string | null;
  customCategoryPings?: string | null;
  customModmailCategories?: string | null;
}

interface AuthUser {
  id: string;
  username: string;
  avatar: string | null;
}

type SettingsTabKey = "channels" | "roles" | "embeds" | "advanced";
type PrimaryTabKey = "settings" | "features" | "security" | "permissions" | "rosters" | "modmail" | "miscellaneous";

interface RosterConfig {
  id: string;
  guildId: string;
  name: string;
  roleIds: string[];
  channelId: string | null;
  messageId: string | null;
  embedConfig?: RosterEmbedConfig | null;
  createdAt: string;
  updatedAt: string;
}

type RosterEmbedButtonColor = "blue" | "green" | "red" | "grey";

interface RosterEmbedButtonConfig {
  rosterName: string;
  label: string;
  color: RosterEmbedButtonColor;
  emoji?: string;
}

interface RosterEmbedConfig {
  title: string;
  description: string;
  embedColor?: string;
  channelId?: string | null;
  messageId?: string | null;
  buttons: RosterEmbedButtonConfig[];
}

interface SavedRosterEmbedConfig extends RosterEmbedConfig {
  id: string;
  name: string;
}

interface RoleSyncItem {
  id: string;
  direction: "one-way" | "two-way";
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
}

interface MiscBanItem {
  userId: string;
  username: string;
  avatarUrl: string | null;
  reason: string | null;
}

type MiscBlockSystem = "staff_applications" | "modmail" | "appeal";

interface MiscBlockItem {
  system: MiscBlockSystem;
  userId: string;
  username: string;
  avatarUrl: string | null;
  blockedById: string | null;
  blockedByUsername: string | null;
  blockedByAvatarUrl: string | null;
  reason: string | null;
  expiresAt: string | null;
}

interface MiscBlacklistItem {
  userId: string;
  username: string;
  avatarUrl: string | null;
  blacklistedById: string | null;
  blacklistedByUsername: string | null;
  blacklistedByAvatarUrl: string | null;
  reason: string | null;
  createdAt: string | null;
}

interface MiscActivityItem {
  id: string;
  timestamp: string;
  userId: string | null;
  username: string;
  avatarUrl: string | null;
  action: string;
  source: "audit" | "commands" | "moderation";
}

interface SnippetItem {
  id: string;
  alias: string;
  content: string;
  createdById: string;
  createdAt: string;
  updatedAt: string;
}

interface ModmailMessage {
  id: string;
  authorId: string;
  content: string;
  isStaff: boolean;
  createdAt: string;
}

interface ModmailThread {
  id: string;
  userId: string;
  username: string;
  avatarUrl: string | null;
  status: string;
  category: string;
  channelId: string | null;
  createdAt: string;
  closedAt: string | null;
  closeReason: string | null;
  claimedById: string | null;
  claimedByUsername: string | null;
  claimedByAvatarUrl: string | null;
  messageCount: number;
  messages: ModmailMessage[];
  latestMessage: {
    content: string;
    authorUsername: string;
    isStaff: boolean;
    sentAt: string;
  } | null;
}

type FeaturePostChannelKey = "modmail" | "appeals" | "staff-intro" | "inactivity" | "payouts" | "reaction-roles";
type DashboardFeaturePostChannels = Partial<Record<FeaturePostChannelKey, string>>;

const PRIMARY_TAB_META: Record<PrimaryTabKey, { label: string; icon: typeof SlidersHorizontal }> = {
  settings: { label: "Dashboard Settings", icon: SlidersHorizontal },
  features: { label: "Bot Features", icon: Sparkles },
  security: { label: "Security", icon: ShieldAlert },
  permissions: { label: "Bot Role Permissions", icon: Shield },
  rosters: { label: "Rosters", icon: ListTree },
  modmail: { label: "Modmail Logs", icon: Mail },
  miscellaneous: { label: "Miscellaneous", icon: Braces },
};

interface DashboardQuickSettings {
  moderationPrefix: string;
  modmailPrefix: string;
  botNickname: string;
}

interface DashboardPermissionSettings {
  stickyCommandRoleIds: string[];
  roleRequestCommandRoleIds: string[];
  prefixBanRoleIds: string[];
  prefixMuteRoleIds: string[];
  prefixKickRoleIds: string[];
  prefixModlogsRoleIds: string[];
  prefixReasonRoleIds: string[];
  prefixRetimeRoleIds: string[];
}

interface DashboardWelcomeEmbedSettings {
  message: string;
  author: string;
  authorIcon: string;
  footer: string;
  footerIcon: string;
  color: string;
}

interface DashboardBotPresenceSettings {
  status: "online" | "idle" | "dnd" | "invisible";
  activityType: "playing" | "listening" | "watching" | "competing";
  activityText: string;
}

type AutoRoleMode = "add" | "remove";

interface AutoRoleRule {
  id: string;
  roleId: string;
  type: AutoRoleMode;
  delayMinutes: number;
}

type ReactionRoleMode = "both" | "add_only" | "remove_only";
type ReactionRolePickerStyle = "reactions" | "buttons" | "dropdown";

interface ReactionRoleItem {
  id: string;
  emoji: string;
  roleId: string;
  mode: ReactionRoleMode;
}

interface DashboardReactionRoleSetup {
  name: string;
  channelId: string;
  useExistingMessage: boolean;
  existingMessageInput: string;
  messageId: string | null;
  pickerStyle: ReactionRolePickerStyle;
  embedTitle: string;
  embedDescription: string;
  embedColor: string;
  authorName: string;
  authorIcon: string;
  footerText: string;
  footerIcon: string;
  thumbnailUrl: string;
  imageUrl: string;
  items: ReactionRoleItem[];
}

type SecurityPunishmentType = "ban" | "kick" | "clear_roles";
type SecurityRuleKey =
  | "antiBan"
  | "antiKick"
  | "antiBotAdd"
  | "antiRoleUpdate"
  | "antiRoleAdd"
  | "antiChannelCreate"
  | "antiChannelDelete"
  | "antiRoleCreate"
  | "antiRoleDelete";

interface SecurityRuleConfig {
  threshold: number;
  punishmentType: SecurityPunishmentType;
  timeWindowSeconds: number;
  enabled: boolean;
  whitelistedRoleIds: string[];
  whitelistedUserIds: string[];
}

interface DashboardSecuritySettings {
  rules: Record<SecurityRuleKey, SecurityRuleConfig>;
  logChannelId: string | null;
  whitelistedRoleIds: string[];
  whitelistedUserIds: string[];
  accessRoleIds: string[];
  accessUserIds: string[];
  blacklistAccessRoleIds: string[];
  blacklistAccessUserIds: string[];
  updatedAt: string | null;
}

interface OwnerSecurityAccessState {
  open: boolean;
  loaded: boolean;
  loading: boolean;
  saving: boolean;
  roles: Role[];
  config: GuildConfig | null;
  accessRoleIds: string[];
  accessUserIds: string[];
  blacklistAccessRoleIds: string[];
  blacklistAccessUserIds: string[];
  userIdInput: string;
  blacklistUserIdInput: string;
}

interface BotFeatureModule {
  id: string;
  name: string;
  description: string;
  area: FeatureAreaKey;
  includes: string[];
  tab: SettingsTabKey;
  enabled: boolean;
}

type FeatureAreaKey =
  | "support"
  | "applications"
  | "operations"
  | "permissions"
  | "messaging"
  | "advanced"
  | "logging";

const FEATURE_AREA_META: Record<FeatureAreaKey, { title: string; description: string }> = {
  support: {
    title: "Support & Tickets",
    description: "Ticket handling, appeal workflows, and request intake channels.",
  },
  applications: {
    title: "Applications & Onboarding",
    description: "Staff applications, intro quiz journeys, and submission pipelines.",
  },
  operations: {
    title: "Operations",
    description: "Daily staff tooling for payouts, inactivity requests, and automation.",
  },
  permissions: {
    title: "Permissions & Access",
    description: "Role-based access control for commands and operational actions.",
  },
  messaging: {
    title: "Embeds & Messaging",
    description: "User-facing embed templates, wording, and visual presentation.",
  },
  advanced: {
    title: "Advanced Behavior",
    description: "Custom category mappings and advanced server-specific behavior.",
  },
  logging: {
    title: "Logging & Audit",
    description: "Moderation and command-level logging, plus quiz/staff tracking visibility.",
  },
};

const GUILD_ROLE_CONFIG_KEYS: Array<keyof GuildConfig> = [
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

const PERMISSION_ROLE_KEYS: Array<keyof DashboardPermissionSettings> = [
  "stickyCommandRoleIds",
  "roleRequestCommandRoleIds",
  "prefixBanRoleIds",
  "prefixMuteRoleIds",
  "prefixKickRoleIds",
  "prefixModlogsRoleIds",
  "prefixReasonRoleIds",
  "prefixRetimeRoleIds",
];

const NONE_VALUE = "__none";
const CATEGORY_CHANNEL_TYPE = 4;
const TEXT_CHANNEL_TYPES = new Set([0, 5]);
const FEATURE_FLAGS_KEY = "__dashboardFeatureFlags";
const QUICK_SETTINGS_KEY = "__dashboardQuickSettings";
const FEATURE_POST_CHANNELS_KEY = "__dashboardFeaturePostChannels";
const SECURITY_SETTINGS_KEY = "__dashboardSecuritySettings";
const AUTO_ROLES_KEY = "__autoRoles";
const REACTION_ROLE_SETUP_KEY = "__reactionRoleSetup";
const PRIVILEGED_DASHBOARD_USER_IDS = new Set(["948598563359817728", "944385000059600896"]);
const DASHBOARD_COLOR_STORAGE_KEY = "dashboardColorOverrides";
const DASHBOARD_LAST_GUILD_STORAGE_KEY = "dashboardLastSelectedGuild";
const REACTION_ROLE_DRAFT_STORAGE_KEY = "dashboardReactionRoleDrafts";
const REACTION_ROLE_DRAFT_MAX_AGE_MS = 1000 * 60 * 60 * 24 * 7;
const DEFAULT_TOP_FADE_COLOR = "#5865f2";
const DEFAULT_ENABLED_STATUS_COLOR = "#00ff7b";
const DEFAULT_DISABLED_STATUS_COLOR = "#ff0000";
const DEFAULT_SECURITY_TIME_WINDOW_SECONDS = 60;
const BACKGROUND_COLOR_PRESETS = ["#ff0000", "#00ff7b", "#0000ff"];

function filterNamedItems<T extends { name: string }>(items: T[], rawQuery: string): T[] {
  const query = rawQuery.trim().toLowerCase();
  if (!query) {
    return items;
  }

  return items.filter((item) => item.name.toLowerCase().includes(query));
}

function createLocalDashboardId(prefix: string): string {
  if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") {
    return `${prefix}-${crypto.randomUUID()}`;
  }
  return `${prefix}-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
}

function createDefaultReactionRoleSetup(): DashboardReactionRoleSetup {
  return {
    name: "Reaction Roles",
    channelId: "",
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
}

const ROSTER_EMBED_BUTTON_COLORS: Array<{ value: RosterEmbedButtonColor; label: string }> = [
  { value: "blue", label: "Blue" },
  { value: "green", label: "Green" },
  { value: "red", label: "Red" },
  { value: "grey", label: "Grey" },
];

const SECURITY_RULE_META: Array<{ key: SecurityRuleKey; label: string; description: string }> = [
  { key: "antiBan", label: "Anti Ban", description: "Stops mass bans before they turn into a nuke." },
  { key: "antiKick", label: "Anti Kick", description: "Protects the server from repeated kicks." },
  { key: "antiBotAdd", label: "Anti Bot Add", description: "Blocks unauthorized bot additions." },
  { key: "antiRoleUpdate", label: "Anti Role Update", description: "Stops dangerous bulk role edits." },
  { key: "antiRoleAdd", label: "Anti Role Add", description: "Only reacts when someone gives a role with Administrator." },
  { key: "antiChannelCreate", label: "Anti Channel Create", description: "Catches rapid unwanted channel creation." },
  { key: "antiChannelDelete", label: "Anti Channel Delete", description: "Protects channels from mass deletion." },
  { key: "antiRoleCreate", label: "Anti Role Create", description: "Stops spammy or malicious role creation." },
  { key: "antiRoleDelete", label: "Anti Role Delete", description: "Protects important roles from deletion." },
];

function createDefaultSecuritySettings(): DashboardSecuritySettings {
  return {
    rules: {
      antiBan: { threshold: 3, punishmentType: "kick", timeWindowSeconds: DEFAULT_SECURITY_TIME_WINDOW_SECONDS, enabled: false, whitelistedRoleIds: [], whitelistedUserIds: [] },
      antiKick: { threshold: 3, punishmentType: "kick", timeWindowSeconds: DEFAULT_SECURITY_TIME_WINDOW_SECONDS, enabled: false, whitelistedRoleIds: [], whitelistedUserIds: [] },
      antiBotAdd: { threshold: 1, punishmentType: "ban", timeWindowSeconds: DEFAULT_SECURITY_TIME_WINDOW_SECONDS, enabled: false, whitelistedRoleIds: [], whitelistedUserIds: [] },
      antiRoleUpdate: { threshold: 3, punishmentType: "clear_roles", timeWindowSeconds: DEFAULT_SECURITY_TIME_WINDOW_SECONDS, enabled: false, whitelistedRoleIds: [], whitelistedUserIds: [] },
      antiRoleAdd: { threshold: 3, punishmentType: "clear_roles", timeWindowSeconds: DEFAULT_SECURITY_TIME_WINDOW_SECONDS, enabled: false, whitelistedRoleIds: [], whitelistedUserIds: [] },
      antiChannelCreate: { threshold: 3, punishmentType: "kick", timeWindowSeconds: DEFAULT_SECURITY_TIME_WINDOW_SECONDS, enabled: false, whitelistedRoleIds: [], whitelistedUserIds: [] },
      antiChannelDelete: { threshold: 2, punishmentType: "ban", timeWindowSeconds: DEFAULT_SECURITY_TIME_WINDOW_SECONDS, enabled: false, whitelistedRoleIds: [], whitelistedUserIds: [] },
      antiRoleCreate: { threshold: 3, punishmentType: "kick", timeWindowSeconds: DEFAULT_SECURITY_TIME_WINDOW_SECONDS, enabled: false, whitelistedRoleIds: [], whitelistedUserIds: [] },
      antiRoleDelete: { threshold: 2, punishmentType: "ban", timeWindowSeconds: DEFAULT_SECURITY_TIME_WINDOW_SECONDS, enabled: false, whitelistedRoleIds: [], whitelistedUserIds: [] },
    },
    logChannelId: null,
    whitelistedRoleIds: [],
    whitelistedUserIds: [],
    accessRoleIds: [],
    accessUserIds: [],
    blacklistAccessRoleIds: [],
    blacklistAccessUserIds: [],
    updatedAt: null,
  };
}

function createOwnerSecurityAccessState(): OwnerSecurityAccessState {
  return {
    open: false,
    loaded: false,
    loading: false,
    saving: false,
    roles: [],
    config: null,
    accessRoleIds: [],
    accessUserIds: [],
    blacklistAccessRoleIds: [],
    blacklistAccessUserIds: [],
    userIdInput: "",
    blacklistUserIdInput: "",
  };
}

function normalizeHexColor(input: string | null | undefined, fallback: string): string {
  const normalized = String(input || "").trim().toLowerCase();
  return /^#[0-9a-f]{6}$/.test(normalized) ? normalized : fallback;
}

function shiftHexColor(hex: string, shift: number): string {
  const parsed = normalizeHexColor(hex, "#5865f2").slice(1);
  const red = Math.max(0, Math.min(255, parseInt(parsed.slice(0, 2), 16) + shift));
  const green = Math.max(0, Math.min(255, parseInt(parsed.slice(2, 4), 16) + shift));
  const blue = Math.max(0, Math.min(255, parseInt(parsed.slice(4, 6), 16) + shift));
  return `#${red.toString(16).padStart(2, "0")}${green.toString(16).padStart(2, "0")}${blue.toString(16).padStart(2, "0")}`;
}

function applyDashboardColorOverrides(_backgroundHex: string, buttonHex: string) {
  const rootStyle = document.documentElement.style;
  const button = normalizeHexColor(buttonHex, "#5865f2");
  const buttonHover = shiftHexColor(button, -20);

  rootStyle.setProperty("--color-discord-blurple", button);
  rootStyle.setProperty("--color-discord-blurple-hover", buttonHover);
  rootStyle.setProperty("--color-primary", button);
  rootStyle.setProperty("--color-ring", button);
}

function readReactionRoleDrafts(): Record<string, { updatedAt: number; setup: DashboardReactionRoleSetup }> {
  if (typeof window === "undefined") return {};

  try {
    const raw = window.localStorage.getItem(REACTION_ROLE_DRAFT_STORAGE_KEY);
    if (!raw) return {};
    const parsed = JSON.parse(raw);
    return parsed && typeof parsed === "object" && !Array.isArray(parsed)
      ? parsed as Record<string, { updatedAt: number; setup: DashboardReactionRoleSetup }>
      : {};
  } catch {
    return {};
  }
}

function getReactionRoleDraft(guildId: string | null | undefined): DashboardReactionRoleSetup | null {
  const normalizedGuildId = String(guildId || "").trim();
  if (!normalizedGuildId) return null;

  const drafts = readReactionRoleDrafts();
  const draft = drafts[normalizedGuildId];
  if (!draft || typeof draft !== "object") return null;

  const updatedAt = Number(draft.updatedAt || 0);
  if (!Number.isFinite(updatedAt) || (Date.now() - updatedAt) > REACTION_ROLE_DRAFT_MAX_AGE_MS) {
    return null;
  }

  return draft.setup && typeof draft.setup === "object" ? draft.setup : null;
}

function writeReactionRoleDraft(guildId: string | null | undefined, setup: DashboardReactionRoleSetup): void {
  const normalizedGuildId = String(guildId || "").trim();
  if (!normalizedGuildId || typeof window === "undefined") return;

  const drafts = readReactionRoleDrafts();
  drafts[normalizedGuildId] = {
    updatedAt: Date.now(),
    setup,
  };
  window.localStorage.setItem(REACTION_ROLE_DRAFT_STORAGE_KEY, JSON.stringify(drafts));
}

function clearReactionRoleDraft(guildId: string | null | undefined): void {
  const normalizedGuildId = String(guildId || "").trim();
  if (!normalizedGuildId || typeof window === "undefined") return;

  const drafts = readReactionRoleDrafts();
  if (!drafts[normalizedGuildId]) return;
  delete drafts[normalizedGuildId];
  window.localStorage.setItem(REACTION_ROLE_DRAFT_STORAGE_KEY, JSON.stringify(drafts));
}

function getReadableTextColor(backgroundHex: string): string {
  const normalized = normalizeHexColor(backgroundHex, "#000000").slice(1);
  const red = parseInt(normalized.slice(0, 2), 16);
  const green = parseInt(normalized.slice(2, 4), 16);
  const blue = parseInt(normalized.slice(4, 6), 16);
  const luminance = (0.299 * red) + (0.587 * green) + (0.114 * blue);
  return luminance > 150 ? "#0f172a" : "#ffffff";
}

function toRgba(hexColor: string, alpha: number): string {
  const normalized = normalizeHexColor(hexColor, "#000000").slice(1);
  const red = parseInt(normalized.slice(0, 2), 16);
  const green = parseInt(normalized.slice(2, 4), 16);
  const blue = parseInt(normalized.slice(4, 6), 16);
  return `rgba(${red}, ${green}, ${blue}, ${alpha})`;
}

function normalizeRosterKey(name: string | null | undefined): string {
  return String(name || "").trim().toLowerCase();
}

function dedupeRosters(list: RosterConfig[]): RosterConfig[] {
  const deduped = new Map<string, RosterConfig>();
  for (const roster of list || []) {
    const key = normalizeRosterKey(roster?.name);
    if (!key) continue;
    deduped.set(key, roster);
  }
  return Array.from(deduped.values());
}

function upsertRoster(list: RosterConfig[], roster: RosterConfig): RosterConfig[] {
  const key = normalizeRosterKey(roster?.name);
  const next = (list || []).filter((entry) => normalizeRosterKey(entry?.name) !== key);
  next.push(roster);
  return dedupeRosters(next);
}

function dedupeRosterEmbeds(list: SavedRosterEmbedConfig[]): SavedRosterEmbedConfig[] {
  const deduped = new Map<string, SavedRosterEmbedConfig>();
  for (const entry of list || []) {
    if (!entry?.id) continue;
    deduped.set(entry.id, entry);
  }
  return Array.from(deduped.values());
}

function upsertRosterEmbed(list: SavedRosterEmbedConfig[], rosterEmbed: SavedRosterEmbedConfig): SavedRosterEmbedConfig[] {
  const next = (list || []).filter((entry) => entry.id !== rosterEmbed.id);
  next.push(rosterEmbed);
  return dedupeRosterEmbeds(next);
}

export default function Dashboard() {
  const fetchJsonWithTimeout = async (url: string, init?: RequestInit, timeoutMs = 12000) => {
    const controller = new AbortController();
    const timeoutId = window.setTimeout(() => controller.abort(), timeoutMs);

    try {
      const response = await fetch(url, { ...(init || {}), signal: controller.signal });
      const contentType = (response.headers.get("content-type") || "").toLowerCase();
      const payload = contentType.includes("application/json")
        ? await response.json().catch(() => ({}))
        : { error: await response.text().catch(() => "") };

      if (!response.ok) {
        const rawMessage = String(payload?.error || `Request failed (HTTP ${response.status})`);
        const lowered = rawMessage.toLowerCase();
        const looksLikeHtml = lowered.includes("<!doctype") || lowered.includes("<html") || lowered.includes("cloudflare");
        const isRateLimited = response.status === 429 || response.status === 503 || lowered.includes("1015") || lowered.includes("rate_limited") || lowered.includes("rate limited");
        const friendlyMessage = isRateLimited
          ? "Discord is temporarily rate-limited. Please retry in a few seconds."
          : (looksLikeHtml ? `Request failed (HTTP ${response.status})` : rawMessage.slice(0, 300));

        const requestError = new Error(friendlyMessage || `Request failed (HTTP ${response.status})`);
        (requestError as Error & { status?: number }).status = response.status;
        throw requestError;
      }

      return payload;
    } finally {
      window.clearTimeout(timeoutId);
    }
  };

  const [guilds, setGuilds] = useState<Guild[]>([]);
  const [selectedGuild, setSelectedGuild] = useState<string | null>(null);
  const [config, setConfig] = useState<GuildConfig>({ commandPrefix: "." });
  const [channels, setChannels] = useState<Channel[]>([]);
  const [roles, setRoles] = useState<Role[]>([]);
  const [guildName, setGuildName] = useState("");
  const [selectedGuildMemberCount, setSelectedGuildMemberCount] = useState<number | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [leavingGuildId, setLeavingGuildId] = useState<string | null>(null);
  const [botStatus, setBotStatus] = useState<"checking" | "online" | "offline" | "external">("checking");
  const [applicationId, setApplicationId] = useState<string | null>(null);
  const [themeMounted, setThemeMounted] = useState(false);
  const [backgroundColor, setBackgroundColor] = useState(DEFAULT_TOP_FADE_COLOR);
  const [buttonColor, setButtonColor] = useState("#5865f2");
  const [currentUser, setCurrentUser] = useState<AuthUser | null>(null);
  const [viewerRoleIds, setViewerRoleIds] = useState<string[]>([]);
  const [viewerIsAdmin, setViewerIsAdmin] = useState(false);
  const [viewerHasSecurityAccess, setViewerHasSecurityAccess] = useState(false);
  const [viewerHasBlacklistAccess, setViewerHasBlacklistAccess] = useState(false);
  const [featurePostChannels, setFeaturePostChannels] = useState<DashboardFeaturePostChannels>({});
  const [autoRoles, setAutoRoles] = useState<AutoRoleRule[]>([]);
  const [newAutoRole, setNewAutoRole] = useState<{ roleId: string; type: AutoRoleMode; delayMinutes: string }>({
    roleId: "",
    type: "add",
    delayMinutes: "0",
  });
  const [reactionRoleSetup, setReactionRoleSetup] = useState<DashboardReactionRoleSetup>(createDefaultReactionRoleSetup());
  const [newReactionRole, setNewReactionRole] = useState<{ emoji: string; roleId: string; mode: ReactionRoleMode }>({
    emoji: "",
    roleId: "",
    mode: "both",
  });
  const [securitySettings, setSecuritySettings] = useState<DashboardSecuritySettings>(createDefaultSecuritySettings());
  const [securityWhitelistUserInput, setSecurityWhitelistUserInput] = useState("");
  const [securityRuleWhitelistUserInputs, setSecurityRuleWhitelistUserInputs] = useState<Partial<Record<SecurityRuleKey, string>>>({});
  const isOwnerUser = !!currentUser?.id && PRIVILEGED_DASHBOARD_USER_IDS.has(currentUser.id);
  const [showOwnerDashboard, setShowOwnerDashboard] = useState(false);
  const [ownerBotStatus, setOwnerBotStatus] = useState<"online" | "offline" | "checking">("checking");
  const [ownerDesiredState, setOwnerDesiredState] = useState<"on" | "off">("off");
  const [ownerGuildCount, setOwnerGuildCount] = useState<number>(0);
  const [ownerGuilds, setOwnerGuilds] = useState<Guild[]>([]);
  const [ownerGuildsLoading, setOwnerGuildsLoading] = useState(false);
  const [ownerSecurityAccess, setOwnerSecurityAccess] = useState<Record<string, OwnerSecurityAccessState>>({});
  const [ownerUpdatingGuildId, setOwnerUpdatingGuildId] = useState<string | null>(null);
  const [ownerTurningOn, setOwnerTurningOn] = useState(false);
  const [ownerTurningOff, setOwnerTurningOff] = useState(false);
  const [ownerLeavingAll, setOwnerLeavingAll] = useState(false);
  const [roleSearches, setRoleSearches] = useState<Record<string, string>>({});
  const [channelSearches, setChannelSearches] = useState<Record<string, string>>({});
  const [moduleSearch, setModuleSearch] = useState("");
  const [activePrimaryTab, setActivePrimaryTab] = useState<PrimaryTabKey>("settings");
  const [activeSettingsTab, setActiveSettingsTab] = useState<SettingsTabKey>("channels");
  const [rosters, setRosters] = useState<RosterConfig[]>([]);
  const [rostersLoading, setRostersLoading] = useState(false);
  const [rosterModalOpen, setRosterModalOpen] = useState(false);
  const [rosterModalMode, setRosterModalMode] = useState<"create" | "edit">("create");
  const [rosterModalName, setRosterModalName] = useState("");
  const [rosterModalRoleIds, setRosterModalRoleIds] = useState<string[]>([]);
  const [rosterModalChannelId, setRosterModalChannelId] = useState("");
  const [rosterModalEditingName, setRosterModalEditingName] = useState("");
  const [rosterSaving, setRosterSaving] = useState(false);
  const [rosterDeleteConfirm, setRosterDeleteConfirm] = useState<string | null>(null);
  const [postingRosterId, setPostingRosterId] = useState<string | null>(null);
  const [postingRosterEmbedId, setPostingRosterEmbedId] = useState<string | null>(null);
  const [rosterChannelSearch, setRosterChannelSearch] = useState("");
  const [rosterEmbedChannelSearch, setRosterEmbedChannelSearch] = useState("");
  const [rosterEmbeds, setRosterEmbeds] = useState<SavedRosterEmbedConfig[]>([]);
  const [roleSyncs, setRoleSyncs] = useState<RoleSyncItem[]>([]);
  const [roleSyncLoading, setRoleSyncLoading] = useState(false);
  const [roleSyncSaving, setRoleSyncSaving] = useState(false);
  const [deletingRoleSyncId, setDeletingRoleSyncId] = useState<string | null>(null);
  const [roleSyncDirection, setRoleSyncDirection] = useState<"one-way" | "two-way">("one-way");
  const [roleSyncSourceGuildId, setRoleSyncSourceGuildId] = useState<string>("");
  const [roleSyncTargetGuildId, setRoleSyncTargetGuildId] = useState<string>("");
  const [roleSyncSourceRoleId, setRoleSyncSourceRoleId] = useState<string>("");
  const [roleSyncTargetRoleId, setRoleSyncTargetRoleId] = useState<string>("");
  const [roleSyncSourceRoleSearch, setRoleSyncSourceRoleSearch] = useState("");
  const [roleSyncTargetRoleSearch, setRoleSyncTargetRoleSearch] = useState("");
  const [roleSyncGuildRoles, setRoleSyncGuildRoles] = useState<Record<string, Role[]>>({});
  const [miscBans, setMiscBans] = useState<MiscBanItem[]>([]);
  const [miscBlacklistedUsers, setMiscBlacklistedUsers] = useState<MiscBlacklistItem[]>([]);
  const [miscBlocks, setMiscBlocks] = useState<MiscBlockItem[]>([]);
  const [miscActivity, setMiscActivity] = useState<MiscActivityItem[]>([]);
  const [miscOverviewLoading, setMiscOverviewLoading] = useState(false);
  const [miscOverviewError, setMiscOverviewError] = useState<string | null>(null);
  const [unbanningUserId, setUnbanningUserId] = useState<string | null>(null);
  const [unbanningAllBans, setUnbanningAllBans] = useState(false);
  const [miscBlacklistUserIdInput, setMiscBlacklistUserIdInput] = useState("");
  const [miscBlacklistReason, setMiscBlacklistReason] = useState("");
  const [blacklistingMiscUser, setBlacklistingMiscUser] = useState(false);
  const [unblacklistingMiscUserId, setUnblacklistingMiscUserId] = useState<string | null>(null);
  const [miscBlockUserIdInput, setMiscBlockUserIdInput] = useState("");
  const [miscBlockSystem, setMiscBlockSystem] = useState<MiscBlockSystem>("modmail");
  const [miscBlockDurationValue, setMiscBlockDurationValue] = useState("1");
  const [miscBlockDurationUnit, setMiscBlockDurationUnit] = useState<"minutes" | "hours" | "days" | "weeks" | "permanent">("days");
  const [miscBlockReason, setMiscBlockReason] = useState("");
  const [blockingMiscUser, setBlockingMiscUser] = useState(false);
  const [unblockingMiscKey, setUnblockingMiscKey] = useState<string | null>(null);
  const [snippetItems, setSnippetItems] = useState<SnippetItem[]>([]);
  const [snippetLoading, setSnippetLoading] = useState(false);
  const [snippetSaving, setSnippetSaving] = useState(false);
  const [snippetDeleteConfirm, setSnippetDeleteConfirm] = useState<string | null>(null);
  const [snippetAliasInput, setSnippetAliasInput] = useState("");
  const [snippetContentInput, setSnippetContentInput] = useState("");
  const [snippetEditingAlias, setSnippetEditingAlias] = useState<string | null>(null);
  const [modmailThreads, setModmailThreads] = useState<ModmailThread[]>([]);
  const [modmailLoading, setModmailLoading] = useState(false);
  const [modmailSelectedThreadId, setModmailSelectedThreadId] = useState<string | null>(null);
  const [modmailStatusFilter, setModmailStatusFilter] = useState<"all" | "open" | "closed">("all");
  const [modmailCategoryFilter, setModmailCategoryFilter] = useState<string>("all");
  const [modmailUserIdFilter, setModmailUserIdFilter] = useState("");
  const [modmailFromDate, setModmailFromDate] = useState("");
  const [modmailToDate, setModmailToDate] = useState("");
  const [modmailSearchQuery, setModmailSearchQuery] = useState("");
  const [postingFeatureEmbed, setPostingFeatureEmbed] = useState<string | null>(null);
  const [postingLatestUpdate, setPostingLatestUpdate] = useState(false);
  const [rosterEmbedDeleteConfirm, setRosterEmbedDeleteConfirm] = useState<string | null>(null);
  const [rosterEmbedModalOpen, setRosterEmbedModalOpen] = useState(false);
  const reactionRoleDraftReadyRef = useRef(false);
  const [rosterEmbedModalMode, setRosterEmbedModalMode] = useState<"create" | "edit">("create");
  const [rosterEmbedSaving, setRosterEmbedSaving] = useState(false);
  const [rosterEmbedEditingId, setRosterEmbedEditingId] = useState("");
  const [rosterEmbedName, setRosterEmbedName] = useState("");
  const [rosterEmbedConfig, setRosterEmbedConfig] = useState<RosterEmbedConfig>({
    title: "",
    description: "",
    embedColor: "5865f2",
    channelId: "",
    buttons: [],
  });
  const [moduleEnabledMap, setModuleEnabledMap] = useState<Record<string, boolean>>({});
  const [customCategoryPingsText, setCustomCategoryPingsText] = useState("{}");
  const [customModmailCategoriesText, setCustomModmailCategoriesText] = useState("[]");
  const [newCatLabel, setNewCatLabel] = useState("");
  const [newCatDescription, setNewCatDescription] = useState("");
  const [newCatEmoji, setNewCatEmoji] = useState("");
  const [quickSettings, setQuickSettings] = useState<DashboardQuickSettings>({
    moderationPrefix: "",
    modmailPrefix: "",
    botNickname: "",
  });
  const [permissionSettings, setPermissionSettings] = useState<DashboardPermissionSettings>({
    stickyCommandRoleIds: [],
    roleRequestCommandRoleIds: [],
    prefixBanRoleIds: [],
    prefixMuteRoleIds: [],
    prefixKickRoleIds: [],
    prefixModlogsRoleIds: [],
    prefixReasonRoleIds: [],
    prefixRetimeRoleIds: [],
  });
  const [welcomeEmbedSettings, setWelcomeEmbedSettings] = useState<DashboardWelcomeEmbedSettings>({
    message: "Welcome {user} to **{server}**!",
    author: "Welcome",
    authorIcon: "",
    footer: "Enjoy your stay",
    footerIcon: "",
    color: "57f287",
  });
  const [botPresenceSettings, setBotPresenceSettings] = useState<DashboardBotPresenceSettings>({
    status: "online",
    activityType: "listening",
    activityText: "Make A Ticket To Join!",
  });
  const { theme, setTheme } = useTheme();
  const { toast } = useToast();
  const [, setLocation] = useLocation();
  const [moduleRouteMatch, moduleRouteParams] = useRoute<{ moduleId: string }>("/dashboard/module/:moduleId");
  const dashboardGradientStyle = {
    backgroundImage: [
      `radial-gradient(70% 55% at 50% 0%, ${toRgba(backgroundColor, 0.38)} 0%, ${toRgba(backgroundColor, 0)} 70%)`,
    ].join(", "),
  } as const;

  const applyGuildConfigData = (data: any, preserveView = false) => {
    const nextConfig = (data.config || {}) as GuildConfig;
    const nextChannels = (data.channels || []) as Channel[];
    const nextRoles = (data.roles || []) as Role[];

    setChannels(nextChannels);
    setRoles(nextRoles);
    setGuildName(data.guildName || "");
    setViewerRoleIds(Array.isArray(data.viewerRoleIds) ? data.viewerRoleIds.map((entry: unknown) => String(entry || "")).filter(Boolean) : []);
    setViewerIsAdmin(data.viewerIsAdmin === true);
    setViewerHasSecurityAccess(data.viewerHasSecurityAccess === true);
    setViewerHasBlacklistAccess(data.viewerHasBlacklistAccess === true);

    const validRoleIds = new Set(nextRoles.map((role) => role.id));
    const sanitizeRoleIds = (value: unknown) => Array.isArray(value)
      ? value.map((entry) => String(entry || "")).filter((entry) => validRoleIds.has(entry))
      : [];

    const sanitizedConfig: GuildConfig = { ...nextConfig };
    for (const roleKey of GUILD_ROLE_CONFIG_KEYS) {
      if (roleKey in sanitizedConfig) {
        (sanitizedConfig as any)[roleKey] = sanitizeRoleIds((sanitizedConfig as any)[roleKey]);
      }
    }
    setConfig(sanitizedConfig);

    const nextMemberCount = typeof data.memberCount === "number" ? data.memberCount : null;
    setSelectedGuildMemberCount(nextMemberCount);
    if (selectedGuild && typeof data.memberCount === "number") {
      setGuilds((previous) => previous.map((guild) => (
        guild.id === selectedGuild
          ? { ...guild, memberCount: data.memberCount }
          : guild
      )));
    }

    setCustomCategoryPingsText(nextConfig.customCategoryPings || "{}");
    setCustomModmailCategoriesText(nextConfig.customModmailCategories || "[]");
    const nextFeaturePostChannels = getFeaturePostChannelsFromCustomCategoryPings(nextConfig.customCategoryPings || "{}");
    setFeaturePostChannels(nextFeaturePostChannels);
    setQuickSettings(getQuickSettingsFromCustomCategoryPings(nextConfig.customCategoryPings || "{}"));
    const nextPermissionSettings = getPermissionSettingsFromCustomCategoryPings(nextConfig.customCategoryPings || "{}");
    const sanitizedPermissionSettings: DashboardPermissionSettings = { ...nextPermissionSettings };
    for (const roleKey of PERMISSION_ROLE_KEYS) {
      sanitizedPermissionSettings[roleKey] = sanitizeRoleIds(nextPermissionSettings[roleKey]);
    }
    setPermissionSettings(sanitizedPermissionSettings);
    setWelcomeEmbedSettings(getWelcomeEmbedSettingsFromCustomCategoryPings(nextConfig.customCategoryPings || "{}"));
    setBotPresenceSettings(getBotPresenceSettingsFromCustomCategoryPings(nextConfig.customCategoryPings || "{}"));
    setAutoRoles(getAutoRolesFromCustomCategoryPings(nextConfig.customCategoryPings || "{}").filter((entry) => validRoleIds.has(entry.roleId)));
    const savedReactionRoleSetup = getReactionRoleSetupFromCustomCategoryPings(nextConfig.customCategoryPings || "{}");
    const draftReactionRoleSetup = getReactionRoleDraft(selectedGuild);
    const nextReactionRoleSetup = draftReactionRoleSetup
      ? {
          ...savedReactionRoleSetup,
          ...draftReactionRoleSetup,
          items: Array.isArray(draftReactionRoleSetup.items) ? draftReactionRoleSetup.items : savedReactionRoleSetup.items,
        }
      : savedReactionRoleSetup;
    setReactionRoleSetup({
      ...nextReactionRoleSetup,
      channelId: nextFeaturePostChannels["reaction-roles"] || nextReactionRoleSetup.channelId || "",
      items: nextReactionRoleSetup.items.filter((entry) => validRoleIds.has(entry.roleId)),
    });
    reactionRoleDraftReadyRef.current = true;
    const nextSecuritySettings = getSecuritySettingsFromCustomCategoryPings(nextConfig.customCategoryPings || "{}");
    setSecuritySettings({
      ...nextSecuritySettings,
      rules: SECURITY_RULE_META.reduce<Record<SecurityRuleKey, SecurityRuleConfig>>((acc, ruleMeta) => {
        const currentRule = nextSecuritySettings.rules[ruleMeta.key] || createDefaultSecuritySettings().rules[ruleMeta.key];
        acc[ruleMeta.key] = {
          ...currentRule,
          whitelistedRoleIds: sanitizeRoleIds(currentRule.whitelistedRoleIds),
          whitelistedUserIds: Array.from(new Set(currentRule.whitelistedUserIds || [])),
        };
        return acc;
      }, {} as Record<SecurityRuleKey, SecurityRuleConfig>),
      whitelistedRoleIds: sanitizeRoleIds(nextSecuritySettings.whitelistedRoleIds),
      accessRoleIds: sanitizeRoleIds(nextSecuritySettings.accessRoleIds),
      blacklistAccessRoleIds: sanitizeRoleIds(nextSecuritySettings.blacklistAccessRoleIds),
    });
    syncFeatureFlagsState(sanitizedConfig, nextConfig.customCategoryPings || "{}");

    if (!preserveView) {
      setActivePrimaryTab("settings");
      setActiveSettingsTab("channels");
      setModuleSearch("");
    }
  };

  useEffect(() => {
    setThemeMounted(true);

    const computedStyle = window.getComputedStyle(document.documentElement);
    const currentBackground = DEFAULT_TOP_FADE_COLOR;
    const currentButton = normalizeHexColor(computedStyle.getPropertyValue("--color-discord-blurple"), "#5865f2");

    const stored = window.localStorage.getItem(DASHBOARD_COLOR_STORAGE_KEY);
    if (!stored) {
      setBackgroundColor(currentBackground);
      setButtonColor(currentButton);
      return;
    }

    try {
      const parsed = JSON.parse(stored) as { background?: string; button?: string };
      const nextBackground = normalizeHexColor(parsed?.background, currentBackground);
      const nextButton = normalizeHexColor(parsed?.button, currentButton);
      setBackgroundColor(nextBackground);
      setButtonColor(nextButton);
      applyDashboardColorOverrides(nextBackground, nextButton);
    } catch {
      setBackgroundColor(currentBackground);
      setButtonColor(currentButton);
    }
  }, []);

  useEffect(() => {
    fetchJsonWithTimeout("/api/bot-status")
      .then((data) => {
        setBotStatus(data.status);
        setApplicationId(data.applicationId);
      })
      .catch(() => setBotStatus("offline"));
  }, []);

  useEffect(() => {
    fetchJsonWithTimeout("/api/auth/me")
      .then(async (res) => {
        if (!res?.authenticated) {
          setCurrentUser(null);
          return;
        }
        if (res?.user) {
          setCurrentUser(res.user as AuthUser);
        } else {
          setCurrentUser(null);
        }
      })
      .catch(() => setCurrentUser(null))
      .finally(() => undefined);
  }, []);

  useEffect(() => {
    if (!showOwnerDashboard || !isOwnerUser) return;
    refreshOwnerBotStatus().catch(() => undefined);
    refreshOwnerGuilds().catch(() => undefined);
  }, [showOwnerDashboard, isOwnerUser]);

  useEffect(() => {
    setLoading(true);
    const loadGuilds = async () => {
      let lastError: unknown;
      for (let attempt = 0; attempt < 2; attempt += 1) {
        try {
          const data = await fetchJsonWithTimeout("/api/guilds", undefined, 12000);
          if (Array.isArray(data)) {
            setGuilds(data);
          }
          return;
        } catch (error) {
          lastError = error;
        }
      }
      throw lastError;
    };

    loadGuilds()
      .then((data) => {
        setLoading(false);
      })
      .catch(() => setLoading(false));
  }, []);

  useEffect(() => {
    if (!selectedGuild) return;

    reactionRoleDraftReadyRef.current = false;
    setLoading(true);
    fetchJsonWithTimeout(`/api/guilds/${selectedGuild}/config`, undefined, 15000)
      .then((data) => {
        applyGuildConfigData(data);
        setLoading(false);
      })
      .catch((error: any) => {
        setLoading(false);
        setSelectedGuild(null);
        setSelectedGuildMemberCount(null);
        toast({
          title: "Access denied",
          description: error?.status === 401
            ? "Please login first to access the server."
            : (error?.message || "Login with Discord and make sure you have a manager role in this server."),
          variant: "destructive",
        });
      });
  }, [selectedGuild]);

  useEffect(() => {
    if (typeof window === "undefined" || selectedGuild || guilds.length === 0 || moduleRouteMatch) return;

    const storedGuildId = window.localStorage.getItem(DASHBOARD_LAST_GUILD_STORAGE_KEY);
    if (!storedGuildId) return;
    if (guilds.some((guild) => guild.id === storedGuildId)) {
      setSelectedGuild(storedGuildId);
    }
  }, [selectedGuild, guilds, moduleRouteMatch]);

  useEffect(() => {
    if (typeof window === "undefined") return;
    if (selectedGuild) {
      window.localStorage.setItem(DASHBOARD_LAST_GUILD_STORAGE_KEY, selectedGuild);
    } else {
      window.localStorage.removeItem(DASHBOARD_LAST_GUILD_STORAGE_KEY);
    }
  }, [selectedGuild]);

  useEffect(() => {
    if (!selectedGuild || !reactionRoleDraftReadyRef.current) return;
    writeReactionRoleDraft(selectedGuild, reactionRoleSetup);
  }, [selectedGuild, reactionRoleSetup]);

  useEffect(() => {
    if (!selectedGuild) return;

    const eventSource = new EventSource(`/api/guilds/${selectedGuild}/stream`);

    eventSource.onmessage = (event) => {
      try {
        const payload = JSON.parse(event.data || "{}");
        if (!payload || payload.guildId !== selectedGuild) return;

        if (payload.type === "config-updated") {
          fetchJsonWithTimeout(`/api/guilds/${selectedGuild}/config`, undefined, 15000)
            .then((data) => applyGuildConfigData(data, true))
            .catch(() => undefined);

          if (activePrimaryTab === "miscellaneous") {
            loadMiscOverview(selectedGuild, { silent: true }).catch(() => undefined);
          }
          return;
        }

        if (payload.type === "rosters-updated") {
          setRosters(dedupeRosters(Array.isArray(payload.rosters) ? payload.rosters : []));
          setRosterEmbeds(dedupeRosterEmbeds(Array.isArray(payload.rosterEmbeds) ? payload.rosterEmbeds : []));
        }
      } catch {
        // Ignore malformed events.
      }
    };

    return () => {
      eventSource.close();
    };
  }, [selectedGuild, activePrimaryTab]);

  // Fetch rosters when the rosters tab is active
  useEffect(() => {
    if (!selectedGuild || (activePrimaryTab !== "rosters" && activePrimaryTab !== "miscellaneous")) return;
    setRostersLoading(true);
    setRoleSyncLoading(true);
    fetchJsonWithTimeout(`/api/guilds/${selectedGuild}/rosters`, undefined, 12000)
      .then((rosterData) => {
        setRosters(dedupeRosters(Array.isArray(rosterData.rosters) ? rosterData.rosters : []));
        setRosterEmbeds(dedupeRosterEmbeds(Array.isArray(rosterData.rosterEmbeds) ? rosterData.rosterEmbeds : []));
        setRostersLoading(false);
      })
      .catch(() => setRostersLoading(false));

    fetchJsonWithTimeout(`/api/guilds/${selectedGuild}/role-syncs`, undefined, 12000)
      .then((data) => {
        setRoleSyncs(Array.isArray(data.roleSyncs) ? data.roleSyncs : []);
        setRoleSyncLoading(false);
      })
      .catch(() => setRoleSyncLoading(false));
  }, [selectedGuild, activePrimaryTab]);

  useEffect(() => {
    if (!selectedGuild) return;
    setRoleSyncSourceGuildId((previous) => previous || selectedGuild);
    setRoleSyncTargetGuildId((previous) => {
      if (previous) return previous;
      return guilds.find((guild) => guild.id !== selectedGuild)?.id || selectedGuild;
    });
  }, [selectedGuild, guilds]);

  useEffect(() => {
    const guildIdsToLoad = [roleSyncSourceGuildId, roleSyncTargetGuildId].filter(Boolean);
    guildIdsToLoad.forEach((guildId) => {
      if (roleSyncGuildRoles[guildId]) return;
      if (guildId === selectedGuild) {
        setRoleSyncGuildRoles((previous) => ({ ...previous, [guildId]: roles }));
        return;
      }

      fetchJsonWithTimeout(`/api/guilds/${guildId}/config`, undefined, 12000)
        .then((data) => {
          const nextRoles = Array.isArray(data.roles) ? data.roles as Role[] : [];
          setRoleSyncGuildRoles((previous) => ({ ...previous, [guildId]: nextRoles }));
        })
        .catch(() => undefined);
    });
  }, [roleSyncSourceGuildId, roleSyncTargetGuildId, roleSyncGuildRoles, selectedGuild, roles]);

  useEffect(() => {
    if (!selectedGuild || roleSyncs.length === 0) return;

    const guildIdsToLoad = new Set<string>();
    for (const syncItem of roleSyncs) {
      if (syncItem.sourceGuildId && !roleSyncGuildRoles[syncItem.sourceGuildId]) {
        guildIdsToLoad.add(syncItem.sourceGuildId);
      }
      if (syncItem.targetGuildId && !roleSyncGuildRoles[syncItem.targetGuildId]) {
        guildIdsToLoad.add(syncItem.targetGuildId);
      }
    }

    guildIdsToLoad.forEach((guildId) => {
      if (guildId === selectedGuild) {
        setRoleSyncGuildRoles((previous) => ({ ...previous, [guildId]: roles }));
        return;
      }

      fetchJsonWithTimeout(`/api/guilds/${guildId}/config`, undefined, 12000)
        .then((data) => {
          const nextRoles = Array.isArray(data.roles) ? data.roles as Role[] : [];
          setRoleSyncGuildRoles((previous) => ({ ...previous, [guildId]: nextRoles }));
        })
        .catch(() => undefined);
    });
  }, [selectedGuild, roleSyncs, roleSyncGuildRoles, roles]);

  const openCreateRosterModal = () => {
    setRosterModalMode("create");
    setRosterModalName("");
    setRosterModalRoleIds([]);
    setRosterModalChannelId("");
    setRosterModalEditingName("");
    setRosterChannelSearch("");
    setRosterModalOpen(true);
  };

  const openEditRosterModal = (roster: RosterConfig) => {
    setRosterModalMode("edit");
    setRosterModalName(roster.name);
    setRosterModalRoleIds(roster.roleIds || []);
    setRosterModalChannelId(roster.channelId || "");
    setRosterModalEditingName(roster.name);
    setRosterChannelSearch("");
    setRosterModalOpen(true);
  };

  const saveRosterModal = async () => {
    if (!selectedGuild) return;
    if (!rosterModalName.trim()) {
      toast({ title: "Name required", description: "Please enter a roster name.", variant: "destructive" });
      return;
    }
    if (rosterModalRoleIds.length === 0) {
      toast({ title: "Roles required", description: "Pick at least one role for the roster.", variant: "destructive" });
      return;
    }
    if (!rosterModalChannelId) {
      toast({ title: "Channel required", description: "Choose a channel where this roster should be posted.", variant: "destructive" });
      return;
    }
    setRosterSaving(true);
    try {
      if (rosterModalMode === "create") {
        const data = await fetchJsonWithTimeout(`/api/guilds/${selectedGuild}/rosters`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            name: rosterModalName.trim(),
            roleIds: rosterModalRoleIds,
            channelId: rosterModalChannelId || null,
          }),
        });
        setRosters((prev) => upsertRoster(prev, data.roster));
        toast({ title: "Roster created", description: `"${data.roster.name}" has been created.` });
      } else {
        const data = await fetchJsonWithTimeout(
          `/api/guilds/${selectedGuild}/rosters/${encodeURIComponent(rosterModalEditingName)}`,
          {
            method: "PUT",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              roleIds: rosterModalRoleIds,
              channelId: rosterModalChannelId || null,
            }),
          }
        );
        setRosters((prev) => upsertRoster(prev, data.roster));
        toast({ title: "Roster updated", description: `"${data.roster.name}" has been updated.` });
      }
      setRosterModalOpen(false);
    } catch (e: any) {
      toast({ title: "Error", description: e.message || "Failed to save roster.", variant: "destructive" });
    }
    setRosterSaving(false);
  };

  const deleteRoster = async (rosterName: string) => {
    if (!selectedGuild) return;
    try {
      await fetchJsonWithTimeout(
        `/api/guilds/${selectedGuild}/rosters/${encodeURIComponent(rosterName)}`,
        { method: "DELETE" }
      );
      setRosters((prev) => dedupeRosters(prev.filter((r) => normalizeRosterKey(r.name) !== normalizeRosterKey(rosterName))));
      setRosterDeleteConfirm(null);
      toast({ title: "Roster deleted", description: `"${rosterName}" has been deleted.` });
    } catch (e: any) {
      toast({ title: "Error", description: e.message || "Failed to delete roster.", variant: "destructive" });
    }
  };

  const toggleRosterRoleId = (roleId: string) => {
    setRosterModalRoleIds((prev) =>
      prev.includes(roleId) ? prev.filter((id) => id !== roleId) : [...prev, roleId]
    );
  };

  const postRoster = async (rosterName: string) => {
    if (!selectedGuild) return;
    setPostingRosterId(rosterName);
    try {
      const data = await fetchJsonWithTimeout(
        `/api/guilds/${selectedGuild}/rosters/${encodeURIComponent(rosterName)}/post`,
        { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({}) }
      );
      setRosters((prev) => upsertRoster(prev, data.roster));
      toast({ title: "Roster posted!", description: `"${rosterName}" has been sent to Discord.` });
    } catch (e: any) {
      toast({ title: "Error", description: e.message || "Failed to post roster.", variant: "destructive" });
    }
    setPostingRosterId(null);
  };

  const openCreateRosterEmbedModal = () => {
    setRosterEmbedModalMode("create");
    setRosterEmbedEditingId("");
    setRosterEmbedName("");
    setRosterEmbedConfig({
      title: "",
      description: "",
      embedColor: "5865f2",
      channelId: "",
      messageId: null,
      buttons: [],
    });
    setRosterEmbedChannelSearch("");
    setRosterEmbedModalOpen(true);
  };

  const openEditRosterEmbedModal = (rosterEmbed: SavedRosterEmbedConfig) => {
    setRosterEmbedModalMode("edit");
    setRosterEmbedEditingId(rosterEmbed.id);
    setRosterEmbedName(rosterEmbed.name);
    setRosterEmbedConfig({
      title: rosterEmbed.title || "",
      description: rosterEmbed.description || "",
      embedColor: (rosterEmbed.embedColor || "5865f2").replace(/^#/, ""),
      channelId: rosterEmbed.channelId || "",
      messageId: rosterEmbed.messageId || null,
      buttons: (rosterEmbed.buttons || []).slice(0, 5).map((button) => ({
        rosterName: button.rosterName || "",
        label: button.label || "",
        color: button.color || "blue",
        emoji: button.emoji || "",
      })),
    });
    setRosterEmbedChannelSearch("");
    setRosterEmbedModalOpen(true);
  };

  const addRosterEmbedButton = () => {
    setRosterEmbedConfig((prev) => {
      if ((prev.buttons || []).length >= 5) return prev;
      return {
        ...prev,
        buttons: [...(prev.buttons || []), { rosterName: "", label: "", color: "blue", emoji: "" }],
      };
    });
  };

  const updateRosterEmbedButton = (index: number, next: Partial<RosterEmbedButtonConfig>) => {
    setRosterEmbedConfig((prev) => ({
      ...prev,
      buttons: (prev.buttons || []).map((button, buttonIndex) => buttonIndex === index ? { ...button, ...next } : button),
    }));
  };

  const removeRosterEmbedButton = (index: number) => {
    setRosterEmbedConfig((prev) => ({
      ...prev,
      buttons: (prev.buttons || []).filter((_, buttonIndex) => buttonIndex !== index),
    }));
  };

  const saveRosterEmbedConfig = async () => {
    if (!selectedGuild) return;

    const name = rosterEmbedName.trim();
    const title = rosterEmbedConfig.title.trim();
    const description = rosterEmbedConfig.description.trim();
    const embedColor = (rosterEmbedConfig.embedColor || "").trim().replace(/^#/, "");
    const buttons = (rosterEmbedConfig.buttons || [])
      .map((button) => ({
        rosterName: String(button.rosterName || "").trim(),
        label: String(button.label || "").trim(),
        color: (button.color || "blue") as RosterEmbedButtonColor,
        emoji: String(button.emoji || "").trim(),
      }))
      .filter((button) => button.rosterName && button.label)
      .slice(0, 5);

    if (!name) {
      toast({ title: "Name required", description: "Enter an embed name.", variant: "destructive" });
      return;
    }
    if (!title) {
      toast({ title: "Title required", description: "Enter an embed title.", variant: "destructive" });
      return;
    }
    if (!description) {
      toast({ title: "Description required", description: "Enter an embed description.", variant: "destructive" });
      return;
    }
    if (!rosterEmbedConfig.channelId) {
      toast({ title: "Channel required", description: "Choose a channel for the embed message.", variant: "destructive" });
      return;
    }
    if (buttons.length === 0) {
      toast({ title: "Button required", description: "Add at least one valid embed button.", variant: "destructive" });
      return;
    }

    setRosterEmbedSaving(true);
    try {
      const payload = {
        name,
        title,
        description,
        embedColor,
        channelId: rosterEmbedConfig.channelId,
        buttons,
      };

      const data = await fetchJsonWithTimeout(
        rosterEmbedModalMode === "create"
          ? `/api/guilds/${selectedGuild}/roster-embeds`
          : `/api/guilds/${selectedGuild}/roster-embeds/${encodeURIComponent(rosterEmbedEditingId)}`,
        {
          method: rosterEmbedModalMode === "create" ? "POST" : "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(payload),
        }
      );

      if (data?.rosterEmbed) {
        setRosterEmbeds((prev) => upsertRosterEmbed(prev, data.rosterEmbed));
      }
      setRosterEmbedModalOpen(false);
      toast({ title: "Embed config saved", description: `Saved embed config for ${name}.` });
    } catch (e: any) {
      toast({ title: "Error", description: e.message || "Failed to save embed config.", variant: "destructive" });
    }
    setRosterEmbedSaving(false);
  };

  const deleteRosterEmbed = async (embedId: string) => {
    if (!selectedGuild) return;
    try {
      await fetchJsonWithTimeout(
        `/api/guilds/${selectedGuild}/roster-embeds/${encodeURIComponent(embedId)}`,
        { method: "DELETE" }
      );
      setRosterEmbeds((prev) => dedupeRosterEmbeds(prev.filter((entry) => entry.id !== embedId)));
      setRosterEmbedDeleteConfirm(null);
      toast({ title: "Roster embed deleted", description: "The roster embed was deleted." });
    } catch (e: any) {
      toast({ title: "Error", description: e.message || "Failed to delete roster embed.", variant: "destructive" });
    }
  };

  const postRosterEmbed = async (embedId: string) => {
    if (!selectedGuild) return;
    setPostingRosterEmbedId(embedId);
    try {
      const data = await fetchJsonWithTimeout(
        `/api/guilds/${selectedGuild}/roster-embeds/${encodeURIComponent(embedId)}/post`,
        { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({}) }
      );
      if (data?.rosterEmbed) {
        setRosterEmbeds((prev) => upsertRosterEmbed(prev, data.rosterEmbed));
      }
      toast({ title: "Roster embed posted", description: "Roster embed was sent to Discord." });
    } catch (e: any) {
      toast({ title: "Error", description: e.message || "Failed to post roster embed.", variant: "destructive" });
    }
    setPostingRosterEmbedId(null);
  };

  const loadMiscOverview = async (
    guildId: string | null = selectedGuild,
    options?: { silent?: boolean },
  ) => {
    if (!guildId) return;

    const silent = options?.silent === true;
    if (!silent) {
      setMiscOverviewLoading(true);
      setMiscOverviewError(null);
    }

    try {
      const data = await fetchJsonWithTimeout(`/api/guilds/${guildId}/misc-overview`, undefined, 15000);
      setMiscBans(Array.isArray(data?.bans) ? data.bans : []);
      setMiscBlacklistedUsers(Array.isArray(data?.blacklistedUsers) ? data.blacklistedUsers : []);
      setMiscBlocks(Array.isArray(data?.blocks) ? data.blocks : []);
      setMiscActivity(Array.isArray(data?.activity) ? data.activity : []);
      setMiscOverviewError(data?.unavailableReason ? String(data.unavailableReason) : null);
    } catch (e: any) {
      if (!silent) {
        setMiscBans([]);
        setMiscBlacklistedUsers([]);
        setMiscBlocks([]);
        setMiscActivity([]);
        setMiscOverviewError(e.message || "Failed to load server activity.");
      }
    }

    if (!silent) {
      setMiscOverviewLoading(false);
    }
  };

  const unbanUser = async (userId: string, username: string) => {
    if (!selectedGuild) return;
    if (!window.confirm(`Unban ${username}?`)) return;

    setUnbanningUserId(userId);
    try {
      await fetchJsonWithTimeout(`/api/guilds/${selectedGuild}/bans/${encodeURIComponent(userId)}`, { method: "DELETE" }, 15000);
      setMiscBans((prev) => prev.filter((ban) => ban.userId !== userId));
      toast({ title: "User unbanned", description: `${username} has been unbanned.` });
      loadMiscOverview(selectedGuild).catch(() => undefined);
    } catch (e: any) {
      toast({ title: "Error", description: e.message || "Failed to unban this user.", variant: "destructive" });
    }
    setUnbanningUserId(null);
  };

  const unbanAllUsers = async () => {
    if (!selectedGuild || miscBans.length === 0) return;
    if (!window.confirm(`Unban all ${miscBans.length} banned user(s) in this server?`)) return;

    setUnbanningAllBans(true);
    try {
      const data = await fetchJsonWithTimeout(`/api/guilds/${selectedGuild}/bans`, { method: "DELETE" }, 30000);
      const removedCount = Number(data?.count || miscBans.length);
      setMiscBans([]);
      toast({ title: "All users unbanned", description: `Removed ${removedCount} ban(s).` });
      loadMiscOverview(selectedGuild).catch(() => undefined);
    } catch (e: any) {
      toast({ title: "Error", description: e.message || "Failed to unban all users.", variant: "destructive" });
    }
    setUnbanningAllBans(false);
  };

  const blacklistMiscUser = async () => {
    if (!selectedGuild) return;

    const userId = miscBlacklistUserIdInput.trim();
    const reason = miscBlacklistReason.trim();
    if (!/^\d{17,20}$/.test(userId)) {
      toast({ title: "User ID required", description: "Enter a valid Discord user ID.", variant: "destructive" });
      return;
    }

    setBlacklistingMiscUser(true);
    try {
      const data = await fetchJsonWithTimeout(`/api/guilds/${selectedGuild}/blacklist`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          userId,
          reason,
        }),
      }, 15000);
      toast({
        title: "User blacklisted",
        description: data?.warning
          ? String(data.warning)
          : `User ${userId} will be re-banned until removed from the blacklist.`,
      });
      setMiscBlacklistUserIdInput("");
      setMiscBlacklistReason("");
      loadMiscOverview(selectedGuild).catch(() => undefined);
    } catch (e: any) {
      toast({ title: "Error", description: e.message || "Failed to blacklist this user.", variant: "destructive" });
    }
    setBlacklistingMiscUser(false);
  };

  const unblacklistMiscUser = async (userId: string, username?: string) => {
    if (!selectedGuild) return;
    const normalizedUserId = userId.trim();
    if (!/^\d{17,20}$/.test(normalizedUserId)) {
      toast({ title: "User ID required", description: "Enter a valid Discord user ID to remove from the blacklist.", variant: "destructive" });
      return;
    }

    const label = username || normalizedUserId;
    if (!window.confirm(`Remove ${label} from Blacklisted Users?`)) return;

    setUnblacklistingMiscUserId(normalizedUserId);
    try {
      await fetchJsonWithTimeout(`/api/guilds/${selectedGuild}/blacklist/${encodeURIComponent(normalizedUserId)}`, {
        method: "DELETE",
      }, 15000);
      toast({ title: "User removed", description: `${label} was removed from Blacklisted Users.` });
      if (miscBlacklistUserIdInput.trim() === normalizedUserId) {
        setMiscBlacklistUserIdInput("");
      }
      loadMiscOverview(selectedGuild).catch(() => undefined);
    } catch (e: any) {
      toast({ title: "Error", description: e.message || "Failed to remove this user from the blacklist.", variant: "destructive" });
    }
    setUnblacklistingMiscUserId(null);
  };

  const blockSystemLabels: Record<MiscBlockSystem, string> = {
    staff_applications: "Staff Applications",
    modmail: "Modmails",
    appeal: "Appeals",
  };

  const formatBlockDurationLabel = (expiresAt: string | null) => {
    if (!expiresAt) return "Permanent";
    const expiresMs = new Date(expiresAt).getTime();
    if (!Number.isFinite(expiresMs)) return "Custom";

    const diffMs = expiresMs - Date.now();
    if (diffMs <= 0) return `Expired (${new Date(expiresAt).toLocaleString()})`;

    const totalMinutes = Math.max(1, Math.round(diffMs / 60000));
    if (totalMinutes < 60) return `${totalMinutes} minute(s) remaining`;

    const totalHours = Math.round(totalMinutes / 60);
    if (totalHours < 48) return `${totalHours} hour(s) remaining`;

    const totalDays = Math.round(totalHours / 24);
    return `${totalDays} day(s) remaining`;
  };

  const blockUserFromMisc = async () => {
    if (!selectedGuild) return;

    const userId = miscBlockUserIdInput.trim();
    const reason = miscBlockReason.trim();
    if (!/^\d{17,20}$/.test(userId)) {
      toast({ title: "User ID required", description: "Enter a valid Discord user ID.", variant: "destructive" });
      return;
    }
    if (!reason) {
      toast({ title: "Reason required", description: "Enter a reason for the block.", variant: "destructive" });
      return;
    }
    if (miscBlockDurationUnit !== "permanent") {
      const amount = Number(miscBlockDurationValue);
      if (!Number.isFinite(amount) || amount <= 0) {
        toast({ title: "Duration required", description: "Enter a valid duration amount.", variant: "destructive" });
        return;
      }
    }

    setBlockingMiscUser(true);
    try {
      await fetchJsonWithTimeout(`/api/guilds/${selectedGuild}/blocks`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          userId,
          system: miscBlockSystem,
          duration: miscBlockDurationUnit === "permanent" ? null : Number(miscBlockDurationValue),
          timeUnit: miscBlockDurationUnit,
          reason,
        }),
      }, 15000);
      toast({ title: "User blocked", description: `Updated ${blockSystemLabels[miscBlockSystem]} block for ${userId}.` });
      setMiscBlockReason("");
      setMiscBlockUserIdInput("");
      setMiscBlockDurationValue("1");
      loadMiscOverview(selectedGuild).catch(() => undefined);
    } catch (e: any) {
      toast({ title: "Error", description: e.message || "Failed to block this user.", variant: "destructive" });
    }
    setBlockingMiscUser(false);
  };

  const unblockMiscUser = async (system: MiscBlockSystem, userId: string, username?: string) => {
    if (!selectedGuild) return;
    const normalizedUserId = userId.trim();
    if (!/^\d{17,20}$/.test(normalizedUserId)) {
      toast({ title: "User ID required", description: "Enter a valid Discord user ID to unblock.", variant: "destructive" });
      return;
    }

    const label = username || normalizedUserId;
    if (!window.confirm(`Unblock ${label} from ${blockSystemLabels[system]}?`)) return;

    const requestKey = `${system}:${normalizedUserId}`;
    setUnblockingMiscKey(requestKey);
    try {
      await fetchJsonWithTimeout(`/api/guilds/${selectedGuild}/blocks/${encodeURIComponent(system)}/${encodeURIComponent(normalizedUserId)}`, {
        method: "DELETE",
      }, 15000);
      toast({ title: "User unblocked", description: `${label} was removed from ${blockSystemLabels[system]}.` });
      if (miscBlockUserIdInput.trim() === normalizedUserId && miscBlockSystem === system) {
        setMiscBlockUserIdInput("");
      }
      loadMiscOverview(selectedGuild).catch(() => undefined);
    } catch (e: any) {
      toast({ title: "Error", description: e.message || "Failed to unblock this user.", variant: "destructive" });
    }
    setUnblockingMiscKey(null);
  };

  const loadModmailLogs = async (guildId: string | null = selectedGuild) => {
    if (!guildId) return;
    setModmailLoading(true);
    try {
      const params = new URLSearchParams();
      if (modmailStatusFilter && modmailStatusFilter !== "all") {
        params.append("status", modmailStatusFilter);
      }
      if (modmailCategoryFilter && modmailCategoryFilter !== "all") {
        params.append("category", modmailCategoryFilter);
      }
      if (modmailUserIdFilter.trim()) {
        params.append("userId", modmailUserIdFilter.trim());
      }
      if (modmailFromDate) {
        params.append("fromDate", modmailFromDate);
      }
      if (modmailToDate) {
        params.append("toDate", modmailToDate);
      }

      const queryString = params.toString();
      const url = `/api/guilds/${guildId}/modmail-logs${queryString ? `?${queryString}` : ""}`;
      const data = await fetchJsonWithTimeout(url, undefined, 15000);

      const threads = (Array.isArray(data?.threads) ? data.threads : [])
        .slice()
        .sort((a: ModmailThread, b: ModmailThread) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());

      setModmailThreads(threads);
      setModmailSelectedThreadId(null);
    } catch (e: any) {
      toast({ title: "Error", description: e.message || "Failed to load modmail logs.", variant: "destructive" });
      setModmailThreads([]);
    }
    setModmailLoading(false);
  };

  const loadSnippets = async (guildId: string | null = selectedGuild) => {
    if (!guildId) return;
    setSnippetLoading(true);
    try {
      const data = await fetchJsonWithTimeout(`/api/guilds/${guildId}/snippets`, undefined, 12000);
      setSnippetItems(
        (Array.isArray(data?.snippets) ? data.snippets : [])
          .slice()
          .sort((a: SnippetItem, b: SnippetItem) => a.alias.localeCompare(b.alias))
      );
    } catch (e: any) {
      toast({ title: "Error", description: e.message || "Failed to load snippets.", variant: "destructive" });
    }
    setSnippetLoading(false);
  };

  const saveSnippet = async () => {
    if (!selectedGuild) return;
    const alias = snippetAliasInput.trim().toLowerCase().replace(/\s+/g, "-");
    const content = snippetContentInput.trim();

    if (!alias) {
      toast({ title: "Alias required", description: "Enter a snippet alias.", variant: "destructive" });
      return;
    }
    if (!content) {
      toast({ title: "Content required", description: "Enter snippet content.", variant: "destructive" });
      return;
    }

    setSnippetSaving(true);
    try {
      const data = await fetchJsonWithTimeout(`/api/guilds/${selectedGuild}/snippets`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ alias, content }),
      });
      setSnippetItems((prev) => {
        const next = [...prev.filter((item) => item.alias !== alias), data.snippet];
        return next.sort((a, b) => a.alias.localeCompare(b.alias));
      });
      setSnippetAliasInput("");
      setSnippetContentInput("");
      setSnippetEditingAlias(null);
      toast({ title: snippetEditingAlias ? "Snippet updated" : "Snippet created", description: `/${alias} is ready to use.` });
    } catch (e: any) {
      toast({ title: "Error", description: e.message || "Failed to save snippet.", variant: "destructive" });
    }
    setSnippetSaving(false);
  };

  const deleteSnippet = async (alias: string) => {
    if (!selectedGuild) return;
    try {
      await fetchJsonWithTimeout(`/api/guilds/${selectedGuild}/snippets/${encodeURIComponent(alias)}`, { method: "DELETE" });
      setSnippetItems((prev) => prev.filter((item) => item.alias !== alias));
      setSnippetDeleteConfirm(null);
      if (snippetEditingAlias === alias) {
        setSnippetEditingAlias(null);
        setSnippetAliasInput("");
        setSnippetContentInput("");
      }
      toast({ title: "Snippet deleted", description: `/${alias} was removed.` });
    } catch (e: any) {
      toast({ title: "Error", description: e.message || "Failed to delete snippet.", variant: "destructive" });
    }
  };

  const postFeatureEmbed = async (featureKey: FeaturePostChannelKey) => {
    if (!selectedGuild) return;

    const selectedChannelId = (() => {
      if (featurePostChannels[featureKey]) return String(featurePostChannels[featureKey]);
      if (featureKey === "modmail") return String(config.modmailEmbedChannelId || "");
      if (featureKey === "staff-intro") return String(config.staffIntroChannelId || "");
      if (featureKey === "inactivity") return String(config.inactivityChannelId || "");
      if (featureKey === "payouts") return String(config.requestChannelId || "");
      if (featureKey === "reaction-roles") return String(reactionRoleSetup.channelId || "");
      return "";
    })().trim();

    const usingExistingReactionMessage = featureKey === "reaction-roles"
      && reactionRoleSetup.useExistingMessage
      && reactionRoleSetup.existingMessageInput.trim().length > 0;

    if (!selectedChannelId && !usingExistingReactionMessage) {
      toast({ title: "Channel required", description: "Select a channel for this embed first.", variant: "destructive" });
      return;
    }

    setPostingFeatureEmbed(featureKey);
    try {
      const data = await fetchJsonWithTimeout(`/api/guilds/${selectedGuild}/feature-embeds/${featureKey}/post`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          channelId: selectedChannelId,
          reactionRoleSetup: featureKey === "reaction-roles"
            ? {
                ...reactionRoleSetup,
                channelId: selectedChannelId,
              }
            : undefined,
        }),
      }, 15000);
      const postedChannelId = String(data?.channelId || selectedChannelId).trim();
      if (featureKey === "reaction-roles") {
        setReactionRoleSetup((prev) => ({
          ...prev,
          channelId: postedChannelId || prev.channelId,
          messageId: typeof data?.messageId === "string" ? data.messageId : prev.messageId,
        }));
        clearReactionRoleDraft(selectedGuild);
      }
      const note = typeof data?.note === "string" && data.note.trim()
        ? `${postedChannelId ? `Posted in <#${postedChannelId}>. ` : ""}${data.note.trim()}`.trim()
        : (postedChannelId ? `Posted in <#${postedChannelId}>.` : "Applied to the configured message.");
      toast({ title: "Embed posted", description: note });
    } catch (e: any) {
      toast({ title: "Error", description: e.message || "Failed to post embed.", variant: "destructive" });
    }
    setPostingFeatureEmbed(null);
  };

  const postLatestUpdate = async () => {
    if (!selectedGuild) return;

    const channelId = String(config.commandLogChannelId || "").trim();
    if (!channelId) {
      toast({ title: "Channel required", description: "Select an Updates Channel first.", variant: "destructive" });
      return;
    }

    setPostingLatestUpdate(true);
    try {
      const data = await fetchJsonWithTimeout(`/api/guilds/${selectedGuild}/updates/post-latest`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ channelId }),
      }, 15000);
      const postedChannelId = String(data?.channelId || channelId).trim();
      toast({ title: "Latest update posted", description: `Posted in <#${postedChannelId}>.` });
    } catch (e: any) {
      toast({ title: "Error", description: e.message || "Failed to post the latest update.", variant: "destructive" });
    }
    setPostingLatestUpdate(false);
  };

  useEffect(() => {
    if (!selectedGuild || activePrimaryTab !== "miscellaneous") return;

    loadMiscOverview(selectedGuild).catch(() => undefined);
    const intervalId = window.setInterval(() => {
      if (document.visibilityState !== "visible") {
        return;
      }
      loadMiscOverview(selectedGuild, { silent: true }).catch(() => undefined);
    }, 30000);

    return () => {
      window.clearInterval(intervalId);
    };
  }, [selectedGuild, activePrimaryTab]);

  useEffect(() => {
    if (!selectedGuild || activePrimaryTab !== "modmail") return;
    loadModmailLogs(selectedGuild).catch(() => undefined);
  }, [selectedGuild, activePrimaryTab, modmailStatusFilter, modmailCategoryFilter, modmailUserIdFilter, modmailFromDate, modmailToDate]);

  useEffect(() => {
    if (!selectedGuild || moduleRouteParams?.moduleId !== "snippets") return;
    loadSnippets(selectedGuild);
  }, [selectedGuild, moduleRouteParams?.moduleId]);

  const createRoleSync = async () => {
    if (!selectedGuild) return;
    if (!roleSyncSourceGuildId || !roleSyncTargetGuildId || !roleSyncSourceRoleId || !roleSyncTargetRoleId) {
      toast({ title: "Missing fields", description: "Choose both servers and both roles.", variant: "destructive" });
      return;
    }

    setRoleSyncSaving(true);
    try {
      const data = await fetchJsonWithTimeout(`/api/guilds/${selectedGuild}/role-syncs`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          direction: roleSyncDirection,
          sourceGuildId: roleSyncSourceGuildId,
          sourceRoleId: roleSyncSourceRoleId,
          targetGuildId: roleSyncTargetGuildId,
          targetRoleId: roleSyncTargetRoleId,
        }),
      });

      setRoleSyncs(Array.isArray(data.roleSyncs) ? data.roleSyncs : []);
      toast({ title: "Role sync created", description: `Created ${roleSyncDirection} role sync.` });
    } catch (e: any) {
      toast({ title: "Error", description: e.message || "Failed to create role sync.", variant: "destructive" });
    }
    setRoleSyncSaving(false);
  };

  const deleteRoleSync = async (syncId: string) => {
    if (!selectedGuild) return;
    setDeletingRoleSyncId(syncId);
    try {
      const data = await fetchJsonWithTimeout(`/api/guilds/${selectedGuild}/role-syncs/${encodeURIComponent(syncId)}`, {
        method: "DELETE",
      });
      setRoleSyncs(Array.isArray(data.roleSyncs) ? data.roleSyncs : []);
      toast({ title: "Role sync removed", description: "The role sync has been deleted." });
    } catch (e: any) {
      toast({ title: "Error", description: e.message || "Failed to delete role sync.", variant: "destructive" });
    }
    setDeletingRoleSyncId(null);
  };

  const copyToClipboard = (text: string, label: string) => {
    navigator.clipboard.writeText(text);
    toast({ title: "Copied", description: `${label} copied to clipboard.` });
  };

  const toggleTheme = () => {
    const isDark = (theme || "dark") === "dark";
    setTheme(isDark ? "light" : "dark");
  };

  const persistDashboardColors = (nextBackground: string, nextButton: string) => {
    const payload = {
      background: nextBackground,
      button: nextButton,
    };
    window.localStorage.setItem(DASHBOARD_COLOR_STORAGE_KEY, JSON.stringify(payload));
  };

  const updateBackgroundColor = (nextValue: string) => {
    const nextBackground = normalizeHexColor(nextValue, backgroundColor);
    setBackgroundColor(nextBackground);
    persistDashboardColors(nextBackground, buttonColor);
  };

  const updateButtonColor = (nextValue: string) => {
    const nextButton = normalizeHexColor(nextValue, buttonColor);
    setButtonColor(nextButton);
    applyDashboardColorOverrides(backgroundColor, nextButton);
    persistDashboardColors(backgroundColor, nextButton);
  };

  const resetDashboardColorsToDefault = () => {
    const defaultBackground = DEFAULT_TOP_FADE_COLOR;
    const defaultButton = "#5865f2";
    setBackgroundColor(defaultBackground);
    setButtonColor(defaultButton);
    applyDashboardColorOverrides(defaultBackground, defaultButton);
    persistDashboardColors(defaultBackground, defaultButton);
  };

  const applyBackgroundPresetColor = (hexColor: string) => {
    const nextColor = normalizeHexColor(hexColor, backgroundColor);
    setBackgroundColor(nextColor);
    persistDashboardColors(nextColor, buttonColor);
  };

  const renderBackgroundPresetControls = (idSuffix: string) => {
    const statusSuffix = idSuffix ? `-${idSuffix}` : "";

    return (
      <div className="flex items-center gap-2 rounded-md border border-border px-2 py-1" data-testid={`button-background-presets${statusSuffix}`}>
        <Button type="button" variant="outline" size="sm" onClick={resetDashboardColorsToDefault} data-testid={`button-background-default${statusSuffix}`}>
          Default
        </Button>
        {BACKGROUND_COLOR_PRESETS.map((preset) => (
          <button
            key={`${statusSuffix}-${preset}`}
            type="button"
            onClick={() => applyBackgroundPresetColor(preset)}
            className="h-6 w-6 rounded border border-border"
            style={{ backgroundColor: preset }}
            title={preset}
            data-testid={`button-background-preset-${preset.replace("#", "")}${statusSuffix}`}
          />
        ))}
      </div>
    );
  };

  const beginDiscordLogin = () => {
    window.location.href = "/api/auth/discord/login";
  };

  const logout = async () => {
    await fetch("/api/auth/logout", { method: "POST" }).catch(() => undefined);
    setCurrentUser(null);
    setSelectedGuild(null);
    toast({ title: "Signed out", description: "You have been logged out from dashboard access." });
  };

  const leaveServer = async (guild: Guild) => {
    const confirmed = window.confirm(`Make the bot leave ${guild.name}?`);
    if (!confirmed) return;

    setLeavingGuildId(guild.id);
    try {
      const res = await fetch(`/api/guilds/${guild.id}/leave`, { method: "POST" });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        toast({
          title: "Leave failed",
          description: data?.error || "Could not make the bot leave this server.",
          variant: "destructive",
        });
        return;
      }

      setGuilds((prev) => prev.filter((entry) => entry.id !== guild.id));
      setOwnerGuilds((prev) => prev.filter((entry) => entry.id !== guild.id));
      setOwnerGuildCount((prev) => Math.max(0, prev - 1));
      if (selectedGuild === guild.id) {
        setSelectedGuild(null);
        setLocation("/dashboard");
      }
      toast({ title: "Bot left server", description: `${guild.name} removed.` });
    } catch {
      toast({ title: "Leave failed", description: "Network error while leaving server.", variant: "destructive" });
    }
    setLeavingGuildId(null);
  };

  const refreshOwnerBotStatus = async () => {
    if (!isOwnerUser) return;
    try {
      const data = await fetchJsonWithTimeout("/api/owner/bot-control/status", undefined, 12000);
      setOwnerBotStatus(data?.status === "online" ? "online" : "offline");
      setOwnerDesiredState(data?.desiredState === "on" ? "on" : "off");
      setOwnerGuildCount(Number(data?.guildCount || ownerGuilds.length || 0));
    } catch (error: any) {
      setOwnerBotStatus("offline");
      setOwnerDesiredState("off");
      toast({ title: "Error", description: error?.message || "Failed to fetch owner bot status.", variant: "destructive" });
    }
  };

  const refreshOwnerGuilds = async () => {
    if (!isOwnerUser) return;
    setOwnerGuildsLoading(true);
    try {
      const data = await fetchJsonWithTimeout("/api/owner/guilds", undefined, 15000);
      const nextGuilds = Array.isArray(data)
        ? Array.from(
            new Map((data as Guild[]).map((guild) => [guild.id, guild])).values(),
          ).sort((left, right) => left.name.localeCompare(right.name))
        : [];
      setOwnerGuilds(nextGuilds);
      setOwnerGuildCount(nextGuilds.length);
    } catch (error: any) {
      toast({ title: "Error", description: error?.message || "Failed to fetch owner guilds.", variant: "destructive" });
    }
    setOwnerGuildsLoading(false);
  };

  const setOwnerGuildDisabled = async (guild: Guild, disabled: boolean) => {
    if (!isOwnerUser) {
      toast({ title: "Access denied", description: "Owner dashboard only.", variant: "destructive" });
      return;
    }

    setOwnerUpdatingGuildId(guild.id);
    try {
      await fetchJsonWithTimeout(`/api/owner/guilds/${guild.id}/disabled`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ disabled }),
      }, 15000);

      setOwnerGuilds((previous) => previous.map((entry) => (
        entry.id === guild.id
          ? { ...entry, isDisabled: disabled }
          : entry
      )));
      setGuilds((previous) => previous.map((entry) => (
        entry.id === guild.id
          ? { ...entry, isDisabled: disabled }
          : entry
      )));

      if (selectedGuild === guild.id) {
        setSelectedGuild(null);
        setLocation("/dashboard");
      }

      toast({ title: disabled ? "Server disabled" : "Server enabled", description: `${guild.name} has been ${disabled ? "disabled" : "re-enabled"}.` });
    } catch (error: any) {
      toast({ title: "Update failed", description: error?.message || "Failed to update this server.", variant: "destructive" });
    }
    setOwnerUpdatingGuildId(null);
  };

  const turnBotOn = async () => {
    if (!isOwnerUser) {
      toast({ title: "Access denied", description: "Owner dashboard only.", variant: "destructive" });
      return;
    }
    setOwnerTurningOn(true);
    try {
      await fetchJsonWithTimeout("/api/owner/bot-control/turn-on", { method: "POST" }, 20000);
      setOwnerDesiredState("on");
      await refreshOwnerBotStatus();
      await refreshOwnerGuilds();
      toast({ title: "Bot online", description: "Bot has been turned on." });
    } catch (error: any) {
      toast({ title: "Error", description: error?.message || "Failed to turn bot on.", variant: "destructive" });
    }
    setOwnerTurningOn(false);
  };

  const turnBotOff = async () => {
    if (!isOwnerUser) {
      toast({ title: "Access denied", description: "Owner dashboard only.", variant: "destructive" });
      return;
    }
    setOwnerTurningOff(true);
    try {
      await fetchJsonWithTimeout("/api/owner/bot-control/turn-off", { method: "POST" }, 20000);
      setOwnerDesiredState("off");
      await refreshOwnerBotStatus();
      toast({ title: "Bot offline", description: "Bot has been turned off." });
    } catch (error: any) {
      toast({ title: "Error", description: error?.message || "Failed to turn bot off.", variant: "destructive" });
    }
    setOwnerTurningOff(false);
  };

  const leaveAllServers = async () => {
    if (!isOwnerUser) {
      toast({ title: "Access denied", description: "Owner dashboard only.", variant: "destructive" });
      return;
    }

    const confirmed = window.confirm("LEAVE ALL SERVERS? This will make the bot leave every server immediately.");
    if (!confirmed) return;

    setOwnerLeavingAll(true);
    try {
      const data = await fetchJsonWithTimeout("/api/owner/bot-control/leave-all", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ guildIds: ownerGuilds.map((guild) => guild.id) }),
      }, 60000);
      const leftCount = Number(data?.leftCount || 0);
      const failedCount = Number(data?.failedCount || 0);
      toast({
        title: "Leave all completed",
        description: failedCount > 0
          ? `Left ${leftCount} server(s), failed ${failedCount}.`
          : `Left ${leftCount} server(s).`,
      });
      setGuilds([]);
      setOwnerGuilds([]);
      setOwnerGuildCount(0);
      await refreshOwnerBotStatus();
    } catch (error: any) {
      toast({ title: "Error", description: error?.message || "Failed to leave all servers.", variant: "destructive" });
    }
    setOwnerLeavingAll(false);
  };

  const inviteBotFromOwnerDashboard = () => {
    if (!isOwnerUser) {
      toast({ title: "Access denied", description: "Owner dashboard only.", variant: "destructive" });
      return;
    }

    if (!applicationId) {
      toast({ title: "Invite unavailable", description: "Bot application ID is not available yet.", variant: "destructive" });
      return;
    }

    const inviteUrl = `https://discord.com/api/oauth2/authorize?client_id=${encodeURIComponent(applicationId)}&permissions=8&scope=bot%20applications.commands`;
    window.open(inviteUrl, "_blank", "noopener,noreferrer");
  };

  const updateConfig = <K extends keyof GuildConfig>(key: K, value: GuildConfig[K]) => {
    setConfig((prev) => ({ ...prev, [key]: value }));
  };

  const getDefaultFeatureEnabledMap = (_guildConfig: GuildConfig): Record<string, boolean> => ({
    modmail: true,
    appeals: true,
    payouts: true,
    moderation: true,
    quiz: true,
    "staff-intro": true,
    inactivity: true,
    permissions: true,
    embeds: true,
    advanced: true,
    "role-requests": true,
    "ban-requests": true,
    activity: true,
    roster: true,
    snippets: true,
    sticky: true,
    "auto-roles": true,
    "reaction-roles": true,
  });

  const parseJsonObjectSafely = (raw: string | null | undefined) => {
    try {
      const parsed = JSON.parse((raw || "{}").trim() || "{}");
      if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) {
        return parsed as Record<string, unknown>;
      }
      return {};
    } catch {
      return {};
    }
  };

  const getFeatureFlagOverrides = (raw: string | null | undefined): Record<string, boolean> => {
    const parsed = parseJsonObjectSafely(raw);
    const flagsValue = parsed[FEATURE_FLAGS_KEY];
    if (!flagsValue || typeof flagsValue !== "object" || Array.isArray(flagsValue)) {
      return {};
    }

    const result: Record<string, boolean> = {};
    Object.entries(flagsValue as Record<string, unknown>).forEach(([key, value]) => {
      if (typeof value === "boolean") {
        result[key] = value;
      }
    });
    return result;
  };

  const getQuickSettingsFromCustomCategoryPings = (raw: string | null | undefined): DashboardQuickSettings => {
    const parsed = parseJsonObjectSafely(raw);
    const quickSettingsValue = parsed[QUICK_SETTINGS_KEY];
    if (!quickSettingsValue || typeof quickSettingsValue !== "object" || Array.isArray(quickSettingsValue)) {
      return {
        moderationPrefix: "",
        modmailPrefix: "",
        botNickname: "",
      };
    }

    const quickSettingsObject = quickSettingsValue as Record<string, unknown>;
    return {
      moderationPrefix: typeof quickSettingsObject.moderationPrefix === "string" ? quickSettingsObject.moderationPrefix : "",
      modmailPrefix: typeof quickSettingsObject.modmailPrefix === "string" ? quickSettingsObject.modmailPrefix : "",
      botNickname: typeof quickSettingsObject.botNickname === "string" ? quickSettingsObject.botNickname : "",
    };
  };

  const getFeaturePostChannelsFromCustomCategoryPings = (raw: string | null | undefined): DashboardFeaturePostChannels => {
    const parsed = parseJsonObjectSafely(raw);
    const value = parsed[FEATURE_POST_CHANNELS_KEY];
    if (!value || typeof value !== "object" || Array.isArray(value)) {
      return {};
    }

    const next: DashboardFeaturePostChannels = {};
    for (const key of ["modmail", "appeals", "staff-intro", "inactivity", "payouts", "reaction-roles"] as FeaturePostChannelKey[]) {
      const channelId = (value as Record<string, unknown>)[key];
      if (typeof channelId === "string" && channelId.trim()) {
        next[key] = channelId.trim();
      }
    }
    return next;
  };

  const getAutoRolesFromCustomCategoryPings = (raw: string | null | undefined): AutoRoleRule[] => {
    const parsed = parseJsonObjectSafely(raw);
    const value = parsed[AUTO_ROLES_KEY];
    if (!Array.isArray(value)) {
      return [];
    }

    return value
      .map((entry) => {
        if (!entry || typeof entry !== "object" || Array.isArray(entry)) return null;
        const item = entry as Record<string, unknown>;
        const roleId = typeof item.roleId === "string" ? item.roleId.trim() : "";
        const rawType = typeof item.type === "string" ? item.type.toLowerCase() : "add";
        const delayMinutes = Number(item.delayMinutes || 0);
        if (!roleId) return null;
        return {
          id: typeof item.id === "string" && item.id.trim() ? item.id.trim() : createLocalDashboardId("autorole"),
          roleId,
          type: rawType === "remove" ? "remove" : "add",
          delayMinutes: Number.isFinite(delayMinutes) ? Math.max(0, Math.min(10080, Math.round(delayMinutes))) : 0,
        } as AutoRoleRule;
      })
      .filter((entry): entry is AutoRoleRule => !!entry);
  };

  const getReactionRoleSetupFromCustomCategoryPings = (raw: string | null | undefined): DashboardReactionRoleSetup => {
    const parsed = parseJsonObjectSafely(raw);
    const value = parsed[REACTION_ROLE_SETUP_KEY];
    const defaultSetup = createDefaultReactionRoleSetup();
    if (!value || typeof value !== "object" || Array.isArray(value)) {
      return defaultSetup;
    }

    const setup = value as Record<string, unknown>;
    const items = Array.isArray(setup.items)
      ? setup.items
          .map((entry) => {
            if (!entry || typeof entry !== "object" || Array.isArray(entry)) return null;
            const item = entry as Record<string, unknown>;
            const roleId = typeof item.roleId === "string" ? item.roleId.trim() : "";
            const emoji = typeof item.emoji === "string" ? item.emoji.trim() : "";
            const rawMode = typeof item.mode === "string" ? item.mode.toLowerCase() : "both";
            if (!roleId) return null;
            return {
              id: typeof item.id === "string" && item.id.trim() ? item.id.trim() : createLocalDashboardId("reaction"),
              roleId,
              emoji,
              mode: rawMode === "add_only" || rawMode === "remove_only" ? rawMode : "both",
            } as ReactionRoleItem;
          })
          .filter((entry): entry is ReactionRoleItem => !!entry)
      : [];

    return {
      name: typeof setup.name === "string" && setup.name.trim() ? setup.name.trim() : defaultSetup.name,
      channelId: typeof setup.channelId === "string" ? setup.channelId.trim() : "",
      useExistingMessage: setup.useExistingMessage === true,
      existingMessageInput: typeof setup.existingMessageInput === "string" ? setup.existingMessageInput : "",
      messageId: typeof setup.messageId === "string" && setup.messageId.trim() ? setup.messageId.trim() : null,
      pickerStyle: setup.pickerStyle === "buttons" || setup.pickerStyle === "dropdown" ? setup.pickerStyle : "reactions",
      embedTitle: typeof setup.embedTitle === "string" && setup.embedTitle.trim() ? setup.embedTitle : defaultSetup.embedTitle,
      embedDescription: typeof setup.embedDescription === "string" && setup.embedDescription.trim() ? setup.embedDescription : defaultSetup.embedDescription,
      embedColor: typeof setup.embedColor === "string" ? setup.embedColor.replace(/[^0-9a-fA-F]/g, "").slice(0, 6) : defaultSetup.embedColor,
      authorName: typeof setup.authorName === "string" ? setup.authorName : defaultSetup.authorName,
      authorIcon: typeof setup.authorIcon === "string" ? setup.authorIcon : defaultSetup.authorIcon,
      footerText: typeof setup.footerText === "string" ? setup.footerText : defaultSetup.footerText,
      footerIcon: typeof setup.footerIcon === "string" ? setup.footerIcon : defaultSetup.footerIcon,
      thumbnailUrl: typeof setup.thumbnailUrl === "string" ? setup.thumbnailUrl : defaultSetup.thumbnailUrl,
      imageUrl: typeof setup.imageUrl === "string" ? setup.imageUrl : defaultSetup.imageUrl,
      items,
    };
  };

  const getSecuritySettingsFromCustomCategoryPings = (raw: string | null | undefined): DashboardSecuritySettings => {
    const parsed = parseJsonObjectSafely(raw);
    const value = parsed[SECURITY_SETTINGS_KEY];
    const securityObject = value && typeof value === "object" && !Array.isArray(value)
      ? value as Record<string, unknown>
      : {};
    const defaultSettings = createDefaultSecuritySettings();
    const rulesRaw = securityObject.rules && typeof securityObject.rules === "object" && !Array.isArray(securityObject.rules)
      ? securityObject.rules as Record<string, unknown>
      : {};

    const rules = SECURITY_RULE_META.reduce<Record<SecurityRuleKey, SecurityRuleConfig>>((acc, ruleMeta) => {
      const rawRule = rulesRaw[ruleMeta.key];
      const ruleObject = rawRule && typeof rawRule === "object" && !Array.isArray(rawRule)
        ? rawRule as Record<string, unknown>
        : {};
      const nextThreshold = Number(ruleObject.threshold);
      const nextTimeWindow = Number(ruleObject.timeWindowSeconds);
      const punishmentValue = typeof ruleObject.punishmentType === "string" ? ruleObject.punishmentType : defaultSettings.rules[ruleMeta.key].punishmentType;

      acc[ruleMeta.key] = {
        enabled: ruleObject.enabled === true,
        threshold: Number.isFinite(nextThreshold) && nextThreshold > 0
          ? Math.max(1, Math.min(50, Math.round(nextThreshold)))
          : defaultSettings.rules[ruleMeta.key].threshold,
        punishmentType: punishmentValue === "ban" || punishmentValue === "kick" || punishmentValue === "clear_roles"
          ? punishmentValue
          : defaultSettings.rules[ruleMeta.key].punishmentType,
        timeWindowSeconds: Number.isFinite(nextTimeWindow) && nextTimeWindow > 0
          ? Math.max(5, Math.min(3600, Math.round(nextTimeWindow)))
          : defaultSettings.rules[ruleMeta.key].timeWindowSeconds,
        whitelistedRoleIds: Array.from(new Set(normalizeStringArray(ruleObject.whitelistedRoleIds))),
        whitelistedUserIds: Array.from(new Set(normalizeStringArray(ruleObject.whitelistedUserIds))),
      };
      return acc;
    }, {} as Record<SecurityRuleKey, SecurityRuleConfig>);

    return {
      rules,
      logChannelId: typeof securityObject.logChannelId === "string" && securityObject.logChannelId.trim()
        ? securityObject.logChannelId.trim()
        : null,
      whitelistedRoleIds: Array.from(new Set(normalizeStringArray(securityObject.whitelistedRoleIds))),
      whitelistedUserIds: Array.from(new Set(normalizeStringArray(securityObject.whitelistedUserIds))),
      accessRoleIds: Array.from(new Set(normalizeStringArray(securityObject.accessRoleIds))),
      accessUserIds: Array.from(new Set(normalizeStringArray(securityObject.accessUserIds))),
      blacklistAccessRoleIds: Array.from(new Set(normalizeStringArray(securityObject.blacklistAccessRoleIds))),
      blacklistAccessUserIds: Array.from(new Set(normalizeStringArray(securityObject.blacklistAccessUserIds))),
      updatedAt: typeof securityObject.updatedAt === "string" && securityObject.updatedAt.trim()
        ? securityObject.updatedAt.trim()
        : null,
    };
  };

  const normalizeStringArray = (value: unknown): string[] => {
    if (!Array.isArray(value)) return [];
    return value
      .map((item) => String(item || "").trim())
      .filter(Boolean);
  };

  const filterToCurrentServerRoleIds = (roleIds: string[] | undefined) => {
    const validRoleIds = new Set(roles.map((role) => role.id));
    return (roleIds || []).filter((id) => validRoleIds.has(id));
  };

  const sanitizeSecuritySettings = (value: DashboardSecuritySettings): DashboardSecuritySettings => ({
    rules: SECURITY_RULE_META.reduce<Record<SecurityRuleKey, SecurityRuleConfig>>((acc, ruleMeta) => {
      const currentRule = value.rules[ruleMeta.key] || createDefaultSecuritySettings().rules[ruleMeta.key];
      acc[ruleMeta.key] = {
        enabled: currentRule.enabled === true,
        threshold: Math.max(1, Math.min(50, Math.round(Number(currentRule.threshold) || createDefaultSecuritySettings().rules[ruleMeta.key].threshold))),
        punishmentType: currentRule.punishmentType === "ban" || currentRule.punishmentType === "kick" || currentRule.punishmentType === "clear_roles"
          ? currentRule.punishmentType
          : createDefaultSecuritySettings().rules[ruleMeta.key].punishmentType,
        timeWindowSeconds: Math.max(5, Math.min(3600, Math.round(Number(currentRule.timeWindowSeconds) || createDefaultSecuritySettings().rules[ruleMeta.key].timeWindowSeconds))),
        whitelistedRoleIds: Array.from(new Set(filterToCurrentServerRoleIds(currentRule.whitelistedRoleIds))),
        whitelistedUserIds: Array.from(new Set(normalizeStringArray(currentRule.whitelistedUserIds))),
      };
      return acc;
    }, {} as Record<SecurityRuleKey, SecurityRuleConfig>),
    logChannelId: typeof value.logChannelId === "string" && value.logChannelId.trim()
      ? value.logChannelId.trim()
      : null,
    whitelistedRoleIds: Array.from(new Set(filterToCurrentServerRoleIds(value.whitelistedRoleIds))),
    whitelistedUserIds: Array.from(new Set(normalizeStringArray(value.whitelistedUserIds))),
    accessRoleIds: Array.from(new Set(filterToCurrentServerRoleIds(value.accessRoleIds))),
    accessUserIds: Array.from(new Set(normalizeStringArray(value.accessUserIds))),
    blacklistAccessRoleIds: Array.from(new Set(filterToCurrentServerRoleIds(value.blacklistAccessRoleIds))),
    blacklistAccessUserIds: Array.from(new Set(normalizeStringArray(value.blacklistAccessUserIds))),
    updatedAt: typeof value.updatedAt === "string" && value.updatedAt.trim()
      ? value.updatedAt.trim()
      : null,
  });

  const getPermissionSettingsFromCustomCategoryPings = (raw: string | null | undefined): DashboardPermissionSettings => {
    const parsed = parseJsonObjectSafely(raw);
    const moderationSetupRaw = parsed.__moderationSetup;
    const moderationSetup = moderationSetupRaw && typeof moderationSetupRaw === "object" && !Array.isArray(moderationSetupRaw)
      ? moderationSetupRaw as Record<string, unknown>
      : {};

    const rolePermissionsRaw = moderationSetup.rolePermissions;
    const rolePermissions = rolePermissionsRaw && typeof rolePermissionsRaw === "object" && !Array.isArray(rolePermissionsRaw)
      ? rolePermissionsRaw as Record<string, unknown>
      : {};

    return {
      stickyCommandRoleIds: normalizeStringArray(parsed.__stickyRoleIds),
      roleRequestCommandRoleIds: normalizeStringArray(parsed.__roleRequestRoleIds),
      prefixBanRoleIds: normalizeStringArray(rolePermissions.ban),
      prefixMuteRoleIds: normalizeStringArray(rolePermissions.mute),
      prefixKickRoleIds: normalizeStringArray(rolePermissions.kick),
      prefixModlogsRoleIds: normalizeStringArray(moderationSetup.modlogsRoleIds),
      prefixReasonRoleIds: normalizeStringArray(moderationSetup.reasonRoleIds),
      prefixRetimeRoleIds: normalizeStringArray(moderationSetup.retimeRoleIds),
    };
  };

  const getWelcomeEmbedSettingsFromCustomCategoryPings = (raw: string | null | undefined): DashboardWelcomeEmbedSettings => {
    const parsed = parseJsonObjectSafely(raw);
    const welcomeRaw = parsed.__welcomeSetup;
    const welcomeSetup = welcomeRaw && typeof welcomeRaw === "object" && !Array.isArray(welcomeRaw)
      ? welcomeRaw as Record<string, unknown>
      : {};

    const colorValue = typeof welcomeSetup.color === "number"
      ? welcomeSetup.color.toString(16)
      : typeof welcomeSetup.color === "string"
        ? welcomeSetup.color
        : "57f287";

    return {
      message: typeof welcomeSetup.message === "string" && welcomeSetup.message.trim().length > 0
        ? welcomeSetup.message
        : "Welcome {user} to **{server}**!",
      author: typeof welcomeSetup.author === "string" ? welcomeSetup.author : "Welcome",
      authorIcon: typeof welcomeSetup.authorIcon === "string" ? welcomeSetup.authorIcon : "",
      footer: typeof welcomeSetup.footer === "string" ? welcomeSetup.footer : "Enjoy your stay",
      footerIcon: typeof welcomeSetup.footerIcon === "string" ? welcomeSetup.footerIcon : "",
      color: colorValue.replace(/^#/, "") || "57f287",
    };
  };

  const getBotPresenceSettingsFromCustomCategoryPings = (raw: string | null | undefined): DashboardBotPresenceSettings => {
    const parsed = parseJsonObjectSafely(raw);
    const presenceRaw = parsed.__dashboardBotPresence;
    const presence = presenceRaw && typeof presenceRaw === "object" && !Array.isArray(presenceRaw)
      ? presenceRaw as Record<string, unknown>
      : {};

    const status = typeof presence.status === "string" ? presence.status.toLowerCase() : "online";
    const activityType = typeof presence.activityType === "string" ? presence.activityType.toLowerCase() : "listening";

    return {
      status: (status === "online" || status === "idle" || status === "dnd" || status === "invisible") ? status : "online",
      activityType: (activityType === "playing" || activityType === "listening" || activityType === "watching" || activityType === "competing")
        ? activityType
        : "listening",
      activityText: typeof presence.activityText === "string" ? presence.activityText : "Make A Ticket To Join!",
    };
  };

  const syncFeatureFlagsState = (guildConfig: GuildConfig, customCategoryPingsRaw: string | null | undefined) => {
    const defaults = getDefaultFeatureEnabledMap(guildConfig);
    const overrides = getFeatureFlagOverrides(customCategoryPingsRaw);
    setModuleEnabledMap({ ...defaults, ...overrides });
  };

  const setFeatureEnabled = (moduleId: string, enabled: boolean) => {
    setModuleEnabledMap((prev) => ({ ...prev, [moduleId]: enabled }));

    setCustomCategoryPingsText((previousText) => {
      const parsed = parseJsonObjectSafely(previousText || config.customCategoryPings || "{}");
      const currentFlagsValue = parsed[FEATURE_FLAGS_KEY];
      const currentFlags =
        currentFlagsValue && typeof currentFlagsValue === "object" && !Array.isArray(currentFlagsValue)
          ? ({ ...(currentFlagsValue as Record<string, unknown>) } as Record<string, unknown>)
          : {};

      currentFlags[moduleId] = enabled;
      parsed[FEATURE_FLAGS_KEY] = currentFlags;

      const nextText = JSON.stringify(parsed, null, 2);
      updateConfig("customCategoryPings", nextText);
      return nextText;
    });
  };

  const updateFeaturePostChannel = (featureKey: FeaturePostChannelKey, channelId: string) => {
    const normalized = channelId === NONE_VALUE ? "" : channelId;
    setFeaturePostChannels((prev) => {
      const next = normalized ? { ...prev, [featureKey]: normalized } : Object.fromEntries(Object.entries(prev).filter(([key]) => key !== featureKey));
      setCustomCategoryPingsText((previousText) => {
        const parsed = parseJsonObjectSafely(previousText || config.customCategoryPings || "{}");
        parsed[FEATURE_POST_CHANNELS_KEY] = next;
        const nextText = JSON.stringify(parsed, null, 2);
        updateConfig("customCategoryPings", nextText);
        return nextText;
      });
      return next as DashboardFeaturePostChannels;
    });
    if (featureKey === "reaction-roles") {
      setReactionRoleSetup((prev) => ({ ...prev, channelId: normalized }));
    }
  };

  const addAutoRoleRule = () => {
    const roleId = newAutoRole.roleId.trim();
    const delayMinutes = Number(newAutoRole.delayMinutes || 0);

    if (!roleId) {
      toast({ title: "Role required", description: "Choose a role for the auto role rule.", variant: "destructive" });
      return;
    }

    setAutoRoles((prev) => ([
      ...prev,
      {
        id: createLocalDashboardId("autorole"),
        roleId,
        type: newAutoRole.type,
        delayMinutes: Number.isFinite(delayMinutes) ? Math.max(0, Math.min(10080, Math.round(delayMinutes))) : 0,
      },
    ]));
    setNewAutoRole({ roleId: "", type: "add", delayMinutes: "0" });
  };

  const removeAutoRoleRule = (ruleId: string) => {
    setAutoRoles((prev) => prev.filter((entry) => entry.id !== ruleId));
  };

  const addReactionRoleItem = () => {
    const emoji = newReactionRole.emoji.trim();
    const roleId = newReactionRole.roleId.trim();

    if (!emoji && reactionRoleSetup.pickerStyle === "reactions") {
      toast({ title: "Emoji required", description: "Enter or paste the emoji to use for this role when using reactions.", variant: "destructive" });
      return;
    }

    if (!roleId) {
      toast({ title: "Role required", description: "Choose a role for this reaction role entry.", variant: "destructive" });
      return;
    }

    setReactionRoleSetup((prev) => ({
      ...prev,
      items: [
        ...prev.items,
        {
          id: createLocalDashboardId("reaction"),
          emoji,
          roleId,
          mode: newReactionRole.mode,
        },
      ],
    }));
    setNewReactionRole({ emoji: "", roleId: "", mode: "both" });
  };

  const removeReactionRoleItem = (itemId: string) => {
    setReactionRoleSetup((prev) => ({
      ...prev,
      items: prev.items.filter((entry) => entry.id !== itemId),
    }));
  };

  const togglePermissionRole = (key: keyof DashboardPermissionSettings, roleId: string) => {
    const validRoleIds = new Set(roles.map((role) => role.id));
    setPermissionSettings((prev) => {
      const current = (prev[key] || []).filter((id) => validRoleIds.has(id));
      if (current.includes(roleId)) {
        return { ...prev, [key]: current.filter((id) => id !== roleId) };
      }
      return { ...prev, [key]: [...current, roleId] };
    });
  };

  const toggleRole = (key: keyof GuildConfig, roleId: string) => {
    const validRoleIds = new Set(roles.map((role) => role.id));
    const current = ((config[key] as string[] | undefined) || []).filter((id) => validRoleIds.has(id));
    if (current.includes(roleId)) {
      updateConfig(key, current.filter((id) => id !== roleId));
      return;
    }
    updateConfig(key, [...current, roleId]);
  };

  const updateSecuritySettings = (updater: (prev: DashboardSecuritySettings) => DashboardSecuritySettings) => {
    setSecuritySettings((prev) => {
      const next = sanitizeSecuritySettings({
        ...updater(prev),
        updatedAt: new Date().toISOString(),
      });
      setCustomCategoryPingsText((previousText) => {
        const parsed = parseJsonObjectSafely(previousText || config.customCategoryPings || "{}");
        parsed[SECURITY_SETTINGS_KEY] = {
          ...next,
          logChannelId: next.logChannelId || null,
        };
        const nextText = JSON.stringify(parsed, null, 2);
        updateConfig("customCategoryPings", nextText);
        return nextText;
      });
      return next;
    });
  };

  const updateSecurityRule = (ruleKey: SecurityRuleKey, updates: Partial<SecurityRuleConfig>) => {
    updateSecuritySettings((prev) => ({
      ...prev,
      rules: {
        ...prev.rules,
        [ruleKey]: {
          ...prev.rules[ruleKey],
          ...updates,
        },
      },
    }));
  };

  const toggleSecurityRoleList = (key: "whitelistedRoleIds" | "accessRoleIds", roleId: string) => {
    updateSecuritySettings((prev) => {
      const current = prev[key] || [];
      return {
        ...prev,
        [key]: current.includes(roleId)
          ? current.filter((entry) => entry !== roleId)
          : [...current, roleId],
      };
    });
  };

  const addSecurityWhitelistedUser = () => {
    const userId = securityWhitelistUserInput.trim();
    if (!/^\d{5,}$/.test(userId)) {
      toast({ title: "Invalid user ID", description: "Enter a valid Discord user ID to whitelist.", variant: "destructive" });
      return;
    }

    updateSecuritySettings((prev) => ({
      ...prev,
      whitelistedUserIds: Array.from(new Set([...(prev.whitelistedUserIds || []), userId])),
    }));
    setSecurityWhitelistUserInput("");
  };

  const removeSecurityWhitelistedUser = (userId: string) => {
    updateSecuritySettings((prev) => ({
      ...prev,
      whitelistedUserIds: (prev.whitelistedUserIds || []).filter((entry) => entry !== userId),
    }));
  };

  const toggleSecurityRuleRoleList = (ruleKey: SecurityRuleKey, roleId: string) => {
    updateSecuritySettings((prev) => {
      const current = prev.rules[ruleKey]?.whitelistedRoleIds || [];
      return {
        ...prev,
        rules: {
          ...prev.rules,
          [ruleKey]: {
            ...prev.rules[ruleKey],
            whitelistedRoleIds: current.includes(roleId)
              ? current.filter((entry) => entry !== roleId)
              : [...current, roleId],
          },
        },
      };
    });
  };

  const addSecurityRuleWhitelistedUser = (ruleKey: SecurityRuleKey) => {
    const userId = String(securityRuleWhitelistUserInputs[ruleKey] || "").trim();
    if (!/^\d{5,}$/.test(userId)) {
      toast({ title: "Invalid user ID", description: "Enter a valid Discord user ID to whitelist for this rule.", variant: "destructive" });
      return;
    }

    updateSecuritySettings((prev) => ({
      ...prev,
      rules: {
        ...prev.rules,
        [ruleKey]: {
          ...prev.rules[ruleKey],
          whitelistedUserIds: Array.from(new Set([...(prev.rules[ruleKey]?.whitelistedUserIds || []), userId])),
        },
      },
    }));
    setSecurityRuleWhitelistUserInputs((prev) => ({ ...prev, [ruleKey]: "" }));
  };

  const removeSecurityRuleWhitelistedUser = (ruleKey: SecurityRuleKey, userId: string) => {
    updateSecuritySettings((prev) => ({
      ...prev,
      rules: {
        ...prev.rules,
        [ruleKey]: {
          ...prev.rules[ruleKey],
          whitelistedUserIds: (prev.rules[ruleKey]?.whitelistedUserIds || []).filter((entry) => entry !== userId),
        },
      },
    }));
  };

  const toggleOwnerSecurityPanel = async (guildId: string) => {
    const currentState = ownerSecurityAccess[guildId] || createOwnerSecurityAccessState();
    const nextOpen = !currentState.open;

    setOwnerSecurityAccess((prev) => ({
      ...prev,
      [guildId]: {
        ...createOwnerSecurityAccessState(),
        ...prev[guildId],
        open: nextOpen,
      },
    }));

    if (!nextOpen || currentState.loaded || currentState.loading) {
      return;
    }

    setOwnerSecurityAccess((prev) => ({
      ...prev,
      [guildId]: {
        ...createOwnerSecurityAccessState(),
        ...prev[guildId],
        open: true,
        loading: true,
      },
    }));

    try {
      const data = await fetchJsonWithTimeout(`/api/guilds/${guildId}/config`, undefined, 15000);
      const nextConfig = (data?.config || {}) as GuildConfig;
      const nextRoles = (data?.roles || []) as Role[];
      const validRoleIds = new Set(nextRoles.map((role) => role.id));
      const nextSecurity = getSecuritySettingsFromCustomCategoryPings(nextConfig.customCategoryPings || "{}");

      setOwnerSecurityAccess((prev) => ({
        ...prev,
        [guildId]: {
          ...createOwnerSecurityAccessState(),
          ...prev[guildId],
          open: true,
          loaded: true,
          loading: false,
          config: nextConfig,
          roles: nextRoles,
          accessRoleIds: nextSecurity.accessRoleIds.filter((roleId) => validRoleIds.has(roleId)),
          accessUserIds: nextSecurity.accessUserIds,
          blacklistAccessRoleIds: nextSecurity.blacklistAccessRoleIds.filter((roleId) => validRoleIds.has(roleId)),
          blacklistAccessUserIds: nextSecurity.blacklistAccessUserIds,
        },
      }));
    } catch (error: any) {
      setOwnerSecurityAccess((prev) => ({
        ...prev,
        [guildId]: {
          ...createOwnerSecurityAccessState(),
          ...prev[guildId],
          open: true,
          loading: false,
        },
      }));
      toast({ title: "Error", description: error?.message || "Failed to load security access for this server.", variant: "destructive" });
    }
  };

  const toggleOwnerSecurityAccessRole = (guildId: string, roleId: string) => {
    setOwnerSecurityAccess((prev) => {
      const currentState = prev[guildId] || createOwnerSecurityAccessState();
      const nextRoleIds = currentState.accessRoleIds.includes(roleId)
        ? currentState.accessRoleIds.filter((entry) => entry !== roleId)
        : [...currentState.accessRoleIds, roleId];

      return {
        ...prev,
        [guildId]: {
          ...currentState,
          accessRoleIds: Array.from(new Set(nextRoleIds)),
        },
      };
    });
  };

  const addOwnerSecurityAccessUser = (guildId: string) => {
    const currentState = ownerSecurityAccess[guildId] || createOwnerSecurityAccessState();
    const userId = currentState.userIdInput.trim();
    if (!/^\d{5,}$/.test(userId)) {
      toast({ title: "Invalid user ID", description: "Enter a valid Discord user ID for Security access.", variant: "destructive" });
      return;
    }

    setOwnerSecurityAccess((prev) => ({
      ...prev,
      [guildId]: {
        ...currentState,
        accessUserIds: Array.from(new Set([...(currentState.accessUserIds || []), userId])),
        userIdInput: "",
      },
    }));
  };

  const removeOwnerSecurityAccessUser = (guildId: string, userId: string) => {
    setOwnerSecurityAccess((prev) => {
      const currentState = prev[guildId] || createOwnerSecurityAccessState();
      return {
        ...prev,
        [guildId]: {
          ...currentState,
          accessUserIds: currentState.accessUserIds.filter((entry) => entry !== userId),
        },
      };
    });
  };

  const toggleOwnerBlacklistAccessRole = (guildId: string, roleId: string) => {
    setOwnerSecurityAccess((prev) => {
      const currentState = prev[guildId] || createOwnerSecurityAccessState();
      const nextRoleIds = currentState.blacklistAccessRoleIds.includes(roleId)
        ? currentState.blacklistAccessRoleIds.filter((entry) => entry !== roleId)
        : [...currentState.blacklistAccessRoleIds, roleId];

      return {
        ...prev,
        [guildId]: {
          ...currentState,
          blacklistAccessRoleIds: Array.from(new Set(nextRoleIds)),
        },
      };
    });
  };

  const addOwnerBlacklistAccessUser = (guildId: string) => {
    const currentState = ownerSecurityAccess[guildId] || createOwnerSecurityAccessState();
    const userId = currentState.blacklistUserIdInput.trim();
    if (!/^\d{5,}$/.test(userId)) {
      toast({ title: "Invalid user ID", description: "Enter a valid Discord user ID for blacklist access.", variant: "destructive" });
      return;
    }

    setOwnerSecurityAccess((prev) => ({
      ...prev,
      [guildId]: {
        ...currentState,
        blacklistAccessUserIds: Array.from(new Set([...(currentState.blacklistAccessUserIds || []), userId])),
        blacklistUserIdInput: "",
      },
    }));
  };

  const removeOwnerBlacklistAccessUser = (guildId: string, userId: string) => {
    setOwnerSecurityAccess((prev) => {
      const currentState = prev[guildId] || createOwnerSecurityAccessState();
      return {
        ...prev,
        [guildId]: {
          ...currentState,
          blacklistAccessUserIds: currentState.blacklistAccessUserIds.filter((entry) => entry !== userId),
        },
      };
    });
  };

  const saveOwnerSecurityAccess = async (guildId: string) => {
    const currentState = ownerSecurityAccess[guildId];
    if (!currentState?.config) return;

    setOwnerSecurityAccess((prev) => ({
      ...prev,
      [guildId]: {
        ...currentState,
        saving: true,
      },
    }));

    try {
      const parsed = parseJsonObjectSafely(currentState.config.customCategoryPings || "{}");
      const existingSecurity = getSecuritySettingsFromCustomCategoryPings(currentState.config.customCategoryPings || "{}");
      parsed[SECURITY_SETTINGS_KEY] = {
        ...existingSecurity,
        accessRoleIds: Array.from(new Set(currentState.accessRoleIds)),
        accessUserIds: Array.from(new Set(currentState.accessUserIds)),
        blacklistAccessRoleIds: Array.from(new Set(currentState.blacklistAccessRoleIds)),
        blacklistAccessUserIds: Array.from(new Set(currentState.blacklistAccessUserIds)),
        updatedAt: new Date().toISOString(),
      };

      const payload: GuildConfig = {
        ...currentState.config,
        commandPrefix: (currentState.config.commandPrefix || ".").trim() || ".",
        customCategoryPings: JSON.stringify(parsed, null, 2),
      };

      const data = await fetchJsonWithTimeout(`/api/guilds/${guildId}/config`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      }, 15000);

      const savedConfig = (data?.config || payload) as GuildConfig;
      const savedSecurity = getSecuritySettingsFromCustomCategoryPings(savedConfig.customCategoryPings || "{}");

      setOwnerSecurityAccess((prev) => ({
        ...prev,
        [guildId]: {
          ...(prev[guildId] || createOwnerSecurityAccessState()),
          open: true,
          loaded: true,
          loading: false,
          saving: false,
          config: savedConfig,
          roles: (prev[guildId]?.roles || currentState.roles || []),
          accessRoleIds: savedSecurity.accessRoleIds,
          accessUserIds: savedSecurity.accessUserIds,
          blacklistAccessRoleIds: savedSecurity.blacklistAccessRoleIds,
          blacklistAccessUserIds: savedSecurity.blacklistAccessUserIds,
          userIdInput: "",
          blacklistUserIdInput: "",
        },
      }));

      if (guildId === selectedGuild) {
        updateConfig("customCategoryPings", savedConfig.customCategoryPings || "{}");
        setCustomCategoryPingsText(savedConfig.customCategoryPings || "{}");
        setSecuritySettings(sanitizeSecuritySettings(savedSecurity));
      }

      toast({ title: "Saved", description: "Security and blacklist access updated for this server." });
    } catch (error: any) {
      setOwnerSecurityAccess((prev) => ({
        ...prev,
        [guildId]: {
          ...(prev[guildId] || createOwnerSecurityAccessState()),
          saving: false,
        },
      }));
      toast({ title: "Error", description: error?.message || "Failed to update security access.", variant: "destructive" });
    }
  };

  const parseJsonField = (raw: string, fieldName: string) => {
    const trimmed = raw.trim();
    if (!trimmed) return null;

    try {
      JSON.parse(trimmed);
      return trimmed;
    } catch {
      toast({
        title: "Invalid JSON",
        description: `${fieldName} must be valid JSON before saving.`,
        variant: "destructive",
      });
      return undefined;
    }
  };

  const saveConfig = async () => {
    if (!selectedGuild) return;

    const categoryPingsObject = parseJsonObjectSafely(customCategoryPingsText || config.customCategoryPings || "{}");
    categoryPingsObject[QUICK_SETTINGS_KEY] = {
      moderationPrefix: quickSettings.moderationPrefix.trim(),
      modmailPrefix: quickSettings.modmailPrefix.trim(),
      botNickname: quickSettings.botNickname.trim(),
    };
    categoryPingsObject[FEATURE_POST_CHANNELS_KEY] = featurePostChannels;

    const currentModerationSetupRaw = categoryPingsObject.__moderationSetup;
    const currentModerationSetup = currentModerationSetupRaw && typeof currentModerationSetupRaw === "object" && !Array.isArray(currentModerationSetupRaw)
      ? currentModerationSetupRaw as Record<string, unknown>
      : {};
    const currentRolePermissionsRaw = currentModerationSetup.rolePermissions;
    const currentRolePermissions = currentRolePermissionsRaw && typeof currentRolePermissionsRaw === "object" && !Array.isArray(currentRolePermissionsRaw)
      ? currentRolePermissionsRaw as Record<string, unknown>
      : {};

    categoryPingsObject.__moderationSetup = {
      ...currentModerationSetup,
      modlogsRoleIds: permissionSettings.prefixModlogsRoleIds,
      reasonRoleIds: permissionSettings.prefixReasonRoleIds,
      retimeRoleIds: permissionSettings.prefixRetimeRoleIds,
      rolePermissions: {
        ...currentRolePermissions,
        ban: permissionSettings.prefixBanRoleIds,
        mute: permissionSettings.prefixMuteRoleIds,
        kick: permissionSettings.prefixKickRoleIds,
      },
    };
    categoryPingsObject.__stickyRoleIds = permissionSettings.stickyCommandRoleIds;
    categoryPingsObject.__roleRequestRoleIds = permissionSettings.roleRequestCommandRoleIds;
    categoryPingsObject.__welcomeSetup = {
      ...(categoryPingsObject.__welcomeSetup && typeof categoryPingsObject.__welcomeSetup === "object" && !Array.isArray(categoryPingsObject.__welcomeSetup)
        ? categoryPingsObject.__welcomeSetup
        : {}),
      message: welcomeEmbedSettings.message,
      author: welcomeEmbedSettings.author,
      authorIcon: welcomeEmbedSettings.authorIcon,
      footer: welcomeEmbedSettings.footer,
      footerIcon: welcomeEmbedSettings.footerIcon,
      color: parseInt((welcomeEmbedSettings.color || "57f287").replace(/^#/, ""), 16) || 0x57f287,
    };
    categoryPingsObject.__dashboardBotPresence = {
      status: botPresenceSettings.status,
      activityType: botPresenceSettings.activityType,
      activityText: botPresenceSettings.activityText,
      updatedAt: Date.now(),
    };
    categoryPingsObject[AUTO_ROLES_KEY] = autoRoles.map((entry) => ({
      id: entry.id,
      roleId: entry.roleId,
      type: entry.type,
      delayMinutes: Math.max(0, Math.min(10080, Math.round(Number(entry.delayMinutes || 0)))),
    }));
    categoryPingsObject[REACTION_ROLE_SETUP_KEY] = {
      ...reactionRoleSetup,
      channelId: (featurePostChannels["reaction-roles"] || reactionRoleSetup.channelId || "").trim(),
      messageId: reactionRoleSetup.messageId || null,
      items: reactionRoleSetup.items
        .map((entry) => ({
          id: entry.id,
          emoji: entry.emoji.trim(),
          roleId: entry.roleId,
          mode: entry.mode,
        }))
        .filter((entry) => entry.roleId && (reactionRoleSetup.pickerStyle !== "reactions" || !!entry.emoji)),
    };

    const parsedCategoryPings = JSON.stringify(categoryPingsObject, null, 2);

    const parsedCustomCategories = parseJsonField(customModmailCategoriesText, "Custom Modmail Categories");
    if (parsedCustomCategories === undefined) return;

    const payload: GuildConfig = {
      ...config,
      commandPrefix: (config.commandPrefix || ".").trim() || ".",
      customCategoryPings: parsedCategoryPings,
      customModmailCategories: parsedCustomCategories,
    };

    setSaving(true);
    try {
      const res = await fetch(`/api/guilds/${selectedGuild}/config`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      const contentType = (res.headers.get("content-type") || "").toLowerCase();
      let data: any = {};

      if (contentType.includes("application/json")) {
        data = await res.json().catch(() => ({}));
      } else {
        const text = await res.text().catch(() => "");
        if (text) {
          data = { error: text.slice(0, 300) };
        }
      }

      if (!res.ok) {
        if (res.status === 401 || res.status === 403) {
          toast({ title: "Access denied", description: data.error || "Manager role required for dashboard access.", variant: "destructive" });
          setSelectedGuild(null);
          return;
        }
        toast({ title: "Save failed", description: data.error || `Could not save config (HTTP ${res.status}).`, variant: "destructive" });
      } else {
        setConfig((data.config || payload) as GuildConfig);
        clearReactionRoleDraft(selectedGuild);
        toast({ title: "Saved", description: "Dashboard configuration updated." });
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : "Network error while saving.";
      toast({ title: "Save failed", description: message, variant: "destructive" });
    }
    setSaving(false);
  };

  const categoryChannels = channels.filter((c) => c.type === CATEGORY_CHANNEL_TYPE);
  const textChannels = channels.filter((c) => TEXT_CHANNEL_TYPES.has(c.type));
  const voiceChannels = channels.filter((c) => c.type === 2 || c.type === 13);
  const selectedGuildSummary = guilds.find((guild) => guild.id === selectedGuild) || null;
  const visibleOwnerGuilds = ownerGuilds;
  const hasGeneralDashboardAccess = viewerIsAdmin || isOwnerUser || filterToCurrentServerRoleIds(config.modRoleIds || []).some((roleId) => viewerRoleIds.includes(roleId));
  const canAccessSecurityTab = isOwnerUser || viewerHasSecurityAccess;
  const canAccessMiscTab = hasGeneralDashboardAccess || isOwnerUser || viewerHasBlacklistAccess;
  const hasPrimaryTabAccess = (tab: PrimaryTabKey) => (
    tab === "security"
      ? canAccessSecurityTab
      : tab === "miscellaneous"
        ? canAccessMiscTab
        : hasGeneralDashboardAccess
  );
  const roleSyncSourceRoles = roleSyncSourceGuildId === selectedGuild
    ? roles
    : (roleSyncGuildRoles[roleSyncSourceGuildId] || []);
  const roleSyncTargetRoles = roleSyncTargetGuildId === selectedGuild
    ? roles
    : (roleSyncGuildRoles[roleSyncTargetGuildId] || []);

  const resolveRoleSyncRoleDisplay = (guildId: string, roleId: string, fallbackName: string) => {
    const guildRoles = guildId === selectedGuild ? roles : (roleSyncGuildRoles[guildId] || []);
    const matchedRole = guildRoles.find((role) => role.id === roleId);
    if (matchedRole?.name) return matchedRole.name;
    return fallbackName || roleId;
  };

  const getModuleAccessRoleIds = (moduleId: string): string[] => {
    const dedupe = (roleIds: string[]) => Array.from(new Set(filterToCurrentServerRoleIds(roleIds)));

    switch (moduleId) {
      case "modmail":
        return dedupe([...(config.modmailStaffRoleIds || []), ...(config.modmailClaimRoleIds || []), ...(config.modmailBlockRoleIds || [])]);
      case "appeals":
        return dedupe(config.appealStaffRoleIds || []);
      case "payouts":
        return dedupe(config.allowedRoleIds || []);
      case "moderation":
      case "ban-requests":
        return dedupe([...(config.modRoleIds || []), ...permissionSettings.prefixBanRoleIds, ...permissionSettings.prefixMuteRoleIds, ...permissionSettings.prefixKickRoleIds]);
      case "role-requests":
        return dedupe([...(config.roleCommandRoleIds || []), ...permissionSettings.roleRequestCommandRoleIds]);
      case "activity":
        return dedupe([...(config.activityRoleIds || []), ...(config.activityResetRoleIds || [])]);
      case "roster":
        return dedupe(config.rosterCommandRoleIds || []);
      case "snippets":
        return dedupe(config.snippetRoleIds || []);
      case "sticky":
        return dedupe(permissionSettings.stickyCommandRoleIds || []);
      default:
        return [];
    }
  };

  const hasFeatureAccess = (moduleId: string) => {
    if (viewerIsAdmin || isOwnerUser) return true;
    const requiredRoleIds = getModuleAccessRoleIds(moduleId);
    if (requiredRoleIds.length === 0) return true;
    return requiredRoleIds.some((roleId) => viewerRoleIds.includes(roleId));
  };

  useEffect(() => {
    if (!selectedGuild) return;
    if (hasPrimaryTabAccess(activePrimaryTab)) return;

    if (canAccessSecurityTab) {
      setActivePrimaryTab("security");
      return;
    }

    if (hasGeneralDashboardAccess) {
      setActivePrimaryTab("settings");
      return;
    }

    if (canAccessMiscTab) {
      setActivePrimaryTab("miscellaneous");
    }
  }, [selectedGuild, activePrimaryTab, canAccessSecurityTab, canAccessMiscTab, hasGeneralDashboardAccess]);

  const renderFeaturePostSection = (
    featureKey: FeaturePostChannelKey,
    label: string,
    description: string,
    buttonLabel: string,
  ) => {
    const currentChannelId = (
      featurePostChannels[featureKey]
      || (featureKey === "modmail" ? config.modmailEmbedChannelId : null)
      || (featureKey === "staff-intro" ? config.staffIntroChannelId : null)
      || (featureKey === "inactivity" ? config.inactivityChannelId : null)
      || (featureKey === "payouts" ? config.requestChannelId : null)
      || ""
    ) as string;
    const searchKey = `feature-post-${featureKey}`;
    const selectedChannel = textChannels.find((channel) => channel.id === currentChannelId);
    const filteredChannels = filterNamedItems(textChannels, channelSearches[searchKey] || "");

    return (
      <div className="rounded-md border border-border/60 bg-muted/10 p-3 space-y-3">
        <div>
          <h4 className="text-sm font-medium">{label}</h4>
          <p className="mt-1 text-xs text-muted-foreground">{description}</p>
        </div>
        <div className="grid gap-3 md:grid-cols-[1fr_auto] md:items-end">
          <div className="space-y-2">
            <Label>Post Channel</Label>
            <DropdownMenu modal={false} onOpenChange={focusDropdownSearchInput(searchKey)}>
              <DropdownMenuTrigger asChild>
                <Button variant="outline" className="w-full justify-between" data-testid={`feature-post-${featureKey}-trigger`}>
                  <span className="truncate text-left">
                    {selectedChannel ? `#${selectedChannel.name}` : "Select a channel"}
                  </span>
                  <ChevronDown className="h-4 w-4 opacity-70" />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent className="max-h-80 w-80 overflow-y-auto">
                <div className="px-1 pb-2">
                  <Input
                    ref={setDropdownSearchInputRef(searchKey)}
                    autoFocus
                    value={channelSearches[searchKey] || ""}
                    onChange={(event) => setChannelSearches((prev) => ({ ...prev, [searchKey]: event.target.value }))}
                    onPointerDown={stopDropdownSearchPointerPropagation}
                    onKeyDownCapture={stopDropdownSearchKeyPropagation}
                    onKeyDown={stopDropdownSearchKeyPropagation}
                    placeholder="Search channels..."
                    className="h-8"
                    data-testid={`feature-post-${featureKey}-search`}
                  />
                </div>
                <DropdownMenuCheckboxItem
                  checked={!currentChannelId}
                  onCheckedChange={() => updateFeaturePostChannel(featureKey, NONE_VALUE)}
                  onSelect={(event) => event.preventDefault()}
                  data-testid={`feature-post-${featureKey}-none`}
                >
                  No channel selected
                </DropdownMenuCheckboxItem>
                {filteredChannels.map((channel) => (
                  <DropdownMenuCheckboxItem
                    key={`${featureKey}-post-${channel.id}`}
                    checked={currentChannelId === channel.id}
                    onCheckedChange={() => updateFeaturePostChannel(featureKey, channel.id)}
                    onSelect={(event) => event.preventDefault()}
                    data-testid={`feature-post-${featureKey}-${channel.id}`}
                  >
                    #{channel.name}
                  </DropdownMenuCheckboxItem>
                ))}
                {filteredChannels.length === 0 && (
                  <p className="px-2 py-1 text-xs text-muted-foreground">No channels found.</p>
                )}
              </DropdownMenuContent>
            </DropdownMenu>
          </div>
          <Button size="sm" variant="outline" disabled={postingFeatureEmbed === featureKey} onClick={() => postFeatureEmbed(featureKey)}>
            {postingFeatureEmbed === featureKey ? "Posting…" : buttonLabel}
          </Button>
        </div>
      </div>
    );
  };

  const botFeatureDefinitions: Omit<BotFeatureModule, "enabled">[] = [
    {
      id: "modmail",
      name: "Modmail",
      description: "Ticket intake and staff response system.",
      area: "support",
      includes: ["Ticket category", "Log channel", "Staff roles", "Claims", "Blocks"],
      tab: "channels",
    },
    {
      id: "appeals",
      name: "Appeals",
      description: "Appeal workflows with dedicated channels and staff.",
      area: "support",
      includes: ["Appeal category", "Appeal log", "Appeal staff roles", "Claim & close flow"],
      tab: "channels",
    },
    {
      id: "payouts",
      name: "Payout Requests",
      description: "Payout intake and logging channels.",
      area: "operations",
      includes: ["Request channel", "Log channel", "Mass messaging", "Status workflow"],
      tab: "channels",
    },
    {
      id: "moderation",
      name: "Moderation & Command Logs",
      description: "Track moderation actions and command usage in dedicated channels.",
      area: "logging",
      includes: ["Moderation logs", "Command logs", "Audit visibility"],
      tab: "channels",
    },
    {
      id: "quiz",
      name: "Quiz Tracking",
      description: "Quiz start/progress/review flow and submission tracking.",
      area: "applications",
      includes: ["Quiz log channel", "Quiz submissions", "Approve/deny actions"],
      tab: "channels",
    },
    {
      id: "staff-intro",
      name: "Staff Intro",
      description: "Staff introduction prompts and submission pipeline.",
      area: "applications",
      includes: ["Intro embed", "Submissions channel", "Question setup", "Application flow"],
      tab: "channels",
    },
    {
      id: "inactivity",
      name: "Inactivity",
      description: "Inactivity requests, routing, and logging.",
      area: "operations",
      includes: ["Request channel", "Submissions", "Inactivity logs", "Approval workflow"],
      tab: "channels",
    },
    {
      id: "embeds",
      name: "Embed Templates",
      description: "Customize bot-facing embed messages and titles.",
      area: "messaging",
      includes: ["Modmail embeds", "Appeal embeds", "Welcome embed", "Presence text"],
      tab: "embeds",
    },
    {
      id: "advanced",
      name: "Advanced Categories",
      description: "Custom category mappings and advanced bot behavior.",
      area: "advanced",
      includes: ["Custom categories", "Category ping JSON", "Modmail routing JSON"],
      tab: "advanced",
    },
    {
      id: "role-requests",
      name: "Role Requests",
      description: "Player role review, approval, and onboarding pipeline.",
      area: "operations",
      includes: ["Role review", "Approve/Deny", "Pro role setup", "Player announcements"],
      tab: "roles",
    },
    {
      id: "ban-requests",
      name: "Ban & Unban Requests",
      description: "Ban, unban, and kick request approval workflow.",
      area: "operations",
      includes: ["Ban requests", "Unban requests", "Kick requests", "Approval buttons"],
      tab: "channels",
    },
    {
      id: "activity",
      name: "Activity Tracking",
      description: "Track member activity, invites, and leaderboards.",
      area: "logging",
      includes: ["Activity stats", "Invite tracking", "Leaderboards", "Role tracking"],
      tab: "roles",
    },
    {
      id: "roster",
      name: "Roster Management",
      description: "Create and manage member rosters with role-based embeds.",
      area: "operations",
      includes: ["Roster creation", "Role-based lists", "Embed posting"],
      tab: "channels",
    },
    {
      id: "snippets",
      name: "Snippets",
      description: "Save and use text snippets for quick modmail replies.",
      area: "support",
      includes: ["Custom snippets", "Quick replies", "Alias lookup"],
      tab: "roles",
    },
    {
      id: "sticky",
      name: "Sticky Messages",
      description: "Pin sticky messages that re-post after new messages.",
      area: "messaging",
      includes: ["Sticky setup", "Auto re-post", "Channel stickies"],
      tab: "roles",
    },
    {
      id: "auto-roles",
      name: "Auto Roles",
      description: "Give or remove roles automatically when members join.",
      area: "operations",
      includes: ["Join automation", "Add/remove roles", "Delayed role assignment"],
      tab: "roles",
    },
    {
      id: "reaction-roles",
      name: "Reaction Roles",
      description: "Let members react on a message to manage their server roles.",
      area: "messaging",
      includes: ["Emoji role mapping", "Both ways / add only / remove only", "Post configured embed"],
      tab: "embeds",
    },
  ];

  const featureDefaults = getDefaultFeatureEnabledMap(config);
  const botFeatureModules: BotFeatureModule[] = botFeatureDefinitions.map((module) => ({
    ...module,
    enabled: moduleEnabledMap[module.id] ?? featureDefaults[module.id] ?? false,
  }));

  const filteredModules = botFeatureModules.filter((module) => {
    const query = moduleSearch.trim().toLowerCase();
    if (!query) return true;
    return `${module.name} ${module.description} ${FEATURE_AREA_META[module.area].title} ${module.includes.join(" ")}`
      .toLowerCase()
      .includes(query);
  });

  const groupedFeatureModules = (Object.entries(FEATURE_AREA_META) as Array<[FeatureAreaKey, { title: string; description: string }]>)
    .map(([areaKey, areaMeta]) => ({
      areaKey,
      areaMeta,
      modules: filteredModules.filter((module) => module.area === areaKey),
    }))
    .filter((group) => group.modules.length > 0);

  const moduleById = botFeatureModules.reduce<Record<string, BotFeatureModule>>((acc, module) => {
    acc[module.id] = module;
    return acc;
  }, {});
  const activeModuleId = moduleRouteMatch ? (moduleRouteParams?.moduleId || "") : "";
  const activeModule = activeModuleId ? moduleById[activeModuleId] : null;

  useEffect(() => {
    if (!moduleRouteMatch) return;

    const searchParams = new URLSearchParams(window.location.search);
    const guildFromQuery = searchParams.get("guild");
    if (guildFromQuery && guildFromQuery !== selectedGuild) {
      setSelectedGuild(guildFromQuery);
      return;
    }

  }, [moduleRouteMatch, moduleRouteParams?.moduleId, selectedGuild, activeModule]);

  const renderActiveModuleSettings = () => {
    if (!activeModule) return null;

    const moduleId = activeModule.id;
    if (!hasFeatureAccess(moduleId)) {
      const requiredRoleIds = getModuleAccessRoleIds(moduleId);
      const requiredRoleNames = roles.filter((role) => requiredRoleIds.includes(role.id)).map((role) => role.name);

      return (
        <Card className="border-border/80 bg-card/90" data-testid={`card-module-settings-${moduleId}`}>
          <CardHeader className="space-y-1">
            <CardTitle className="text-sm font-semibold uppercase tracking-[0.2em] text-muted-foreground">{activeModule.name} Settings</CardTitle>
            <CardDescription>{activeModule.description}</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="rounded-lg border border-destructive/40 bg-destructive/5 p-4">
              <div className="flex items-start gap-3">
                <AlertCircle className="mt-0.5 h-5 w-5 text-destructive" />
                <div>
                  <p className="font-medium text-destructive">Access denied</p>
                  <p className="mt-1 text-sm text-muted-foreground">You do not have permission to manage this bot feature from the dashboard.</p>
                  {requiredRoleNames.length > 0 && (
                    <div className="mt-3 flex flex-wrap gap-1.5">
                      {requiredRoleNames.map((roleName) => (
                        <Badge key={`${moduleId}-${roleName}`} variant="outline">{roleName}</Badge>
                      ))}
                    </div>
                  )}
                </div>
              </div>
            </div>
          </CardContent>
        </Card>
      );
    }

    return (
      <Card className="border-border/80 bg-card/90" data-testid={`card-module-settings-${moduleId}`}>
        <CardHeader className="space-y-1">
          <CardTitle className="text-sm font-semibold uppercase tracking-[0.2em] text-muted-foreground">{activeModule.name} Settings</CardTitle>
          <CardDescription>{activeModule.description}</CardDescription>
        </CardHeader>
        <CardContent className="space-y-6">
          {moduleId === "modmail" && (
            <div className="space-y-6">
              <div className="rounded-lg border border-border/70 bg-muted/20 p-4">
                <h3 className="text-sm font-semibold uppercase tracking-[0.15em] text-muted-foreground">Setup Commands</h3>
                <p className="mt-2 text-xs text-muted-foreground">Run these slash commands in Discord to post the ticket embed and configure modmail:</p>
                <div className="mt-3 flex flex-wrap gap-2">
                  <Badge variant="outline">/setup_modmail</Badge>
                  <Badge variant="outline">/config_modmail</Badge>
                  <Badge variant="outline">/modmail-category add</Badge>
                  <Badge variant="outline">/modmail-category remove</Badge>
                  <Badge variant="outline">/modmail-category list</Badge>
                  <Badge variant="outline">/block</Badge>
                  <Badge variant="outline">/unblock</Badge>
                  <Badge variant="outline">/block_list</Badge>
                </div>
              </div>
              <div className="grid gap-4 md:grid-cols-2">
                {renderChannelSelect("Modmail Category", "modmailCategoryId", categoryChannels, "select-module-modmail-category")}
                {renderChannelSelect("Modmail Log Channel", "modmailLogChannelId", textChannels, "select-module-modmail-log")}
              </div>
              <div className="space-y-5">
                {renderRoleSection("Modmail Staff Roles", "modmailStaffRoleIds", "module-settings-modmail-staff-role")}
                {renderRoleSection("Modmail Block Roles", "modmailBlockRoleIds", "module-settings-modmail-block-role")}
                {renderRoleSection("Modmail Claim Roles", "modmailClaimRoleIds", "module-settings-modmail-claim-role")}
              </div>
              <Separator />
              <div>
                <div className="mb-3 flex items-center justify-between gap-3">
                  <h3 className="text-sm font-semibold uppercase tracking-[0.15em] text-muted-foreground">Ticket Embed</h3>
                  <Button size="sm" variant="outline" disabled={postingFeatureEmbed === "modmail"} onClick={() => postFeatureEmbed("modmail")}>
                    {postingFeatureEmbed === "modmail" ? "Posting…" : "Post Configured Embed"}
                  </Button>
                </div>
                <div className="grid gap-4 md:grid-cols-2">
                  <div className="space-y-2">
                    <Label>Modmail Embed Title</Label>
                    <Input value={config.modmailEmbedTitle || ""} onChange={(event) => updateConfig("modmailEmbedTitle", event.target.value)} />
                  </div>
                  <div className="space-y-2 md:col-span-2">
                    <Label>Modmail Embed Description</Label>
                    <Textarea value={config.modmailEmbedDescription || ""} onChange={(event) => updateConfig("modmailEmbedDescription", event.target.value)} />
                  </div>
                </div>
                <div className="mt-3">
                  {renderFeaturePostSection("modmail", "Post Ticket Embed", "Choose the channel where the modmail embed should be posted or refreshed.", "Post Modmail Embed")}
                </div>
              </div>
              <Separator />
              <div className="space-y-3">
                <h3 className="text-sm font-semibold uppercase tracking-[0.15em] text-muted-foreground">Modmail Categories</h3>
                <p className="text-xs text-muted-foreground">Categories appear as buttons when a user opens a new ticket.</p>
                {(() => {
                  let cats: { id: string; label: string; description?: string; emoji?: string }[] = [];
                  try { cats = JSON.parse(customModmailCategoriesText || "[]"); } catch { cats = []; }
                  return (
                    <div className="space-y-2">
                      {cats.length === 0 && (
                        <p className="text-xs italic text-muted-foreground">No categories yet — tickets open into a single thread.</p>
                      )}
                      {cats.map((cat) => (
                        <div key={cat.id} className="flex items-center gap-3 rounded-md border border-border/60 bg-muted/20 px-3 py-2">
                          {cat.emoji && <span className="text-base">{cat.emoji}</span>}
                          <div className="flex-1 min-w-0">
                            <p className="text-sm font-medium leading-none">{cat.label}</p>
                            {cat.description && <p className="mt-0.5 text-xs text-muted-foreground truncate">{cat.description}</p>}
                          </div>
                          <Button
                            variant="ghost"
                            size="icon"
                            className="h-7 w-7 shrink-0 text-destructive hover:text-destructive"
                            onClick={() => {
                              const next = cats.filter((c) => c.id !== cat.id);
                              const json = JSON.stringify(next);
                              setCustomModmailCategoriesText(json);
                              updateConfig("customModmailCategories", json);
                            }}
                          >
                            <Trash2 className="h-3.5 w-3.5" />
                          </Button>
                        </div>
                      ))}
                    </div>
                  );
                })()}
                <div className="rounded-md border border-border/60 bg-muted/10 p-3 space-y-3">
                  <p className="text-xs font-medium text-muted-foreground">Add New Category</p>
                  <div className="grid gap-2 sm:grid-cols-3">
                    <div className="space-y-1">
                      <Label className="text-xs">Label *</Label>
                      <Input
                        placeholder="e.g. General Support"
                        value={newCatLabel}
                        onChange={(e) => setNewCatLabel(e.target.value)}
                        className="h-8 text-sm"
                      />
                    </div>
                    <div className="space-y-1">
                      <Label className="text-xs">Description</Label>
                      <Input
                        placeholder="e.g. Questions & help"
                        value={newCatDescription}
                        onChange={(e) => setNewCatDescription(e.target.value)}
                        className="h-8 text-sm"
                      />
                    </div>
                    <div className="space-y-1">
                      <Label className="text-xs">Emoji</Label>
                      <Input
                        placeholder="e.g. 📩"
                        value={newCatEmoji}
                        onChange={(e) => setNewCatEmoji(e.target.value)}
                        className="h-8 text-sm"
                      />
                    </div>
                  </div>
                  <Button
                    size="sm"
                    disabled={!newCatLabel.trim()}
                    onClick={() => {
                      let cats: { id: string; label: string; description?: string; emoji?: string }[] = [];
                      try { cats = JSON.parse(customModmailCategoriesText || "[]"); } catch { cats = []; }
                      const newCat: { id: string; label: string; description?: string; emoji?: string } = {
                        id: `cat_${Date.now()}`,
                        label: newCatLabel.trim(),
                      };
                      if (newCatDescription.trim()) newCat.description = newCatDescription.trim();
                      if (newCatEmoji.trim()) newCat.emoji = newCatEmoji.trim();
                      const next = [...cats, newCat];
                      const json = JSON.stringify(next);
                      setCustomModmailCategoriesText(json);
                      updateConfig("customModmailCategories", json);
                      setNewCatLabel("");
                      setNewCatDescription("");
                      setNewCatEmoji("");
                    }}
                  >
                    <Plus className="mr-1.5 h-3.5 w-3.5" />
                    Add Category
                  </Button>
                </div>
              </div>
            </div>
          )}

          {moduleId === "appeals" && (
            <div className="space-y-6">
              <div className="rounded-lg border border-border/70 bg-muted/20 p-4">
                <h3 className="text-sm font-semibold uppercase tracking-[0.15em] text-muted-foreground">Setup Commands</h3>
                <p className="mt-2 text-xs text-muted-foreground">Run these slash commands in Discord to post the appeal embed and configure appeals:</p>
                <div className="mt-3 flex flex-wrap gap-2">
                  <Badge variant="outline">/setup_appeal</Badge>
                  <Badge variant="outline">/config_appeal</Badge>
                </div>
              </div>
              <div className="grid gap-4 md:grid-cols-2">
                {renderChannelSelect("Appeal Category", "appealCategoryId", categoryChannels, "select-module-appeal-category")}
                {renderChannelSelect("Appeal Log Channel", "appealLogChannelId", textChannels, "select-module-appeal-log")}
              </div>
              {renderRoleSection("Appeal Staff Roles", "appealStaffRoleIds", "module-settings-appeal-staff-role")}
              <Separator />
              <div>
                <h3 className="mb-3 text-sm font-semibold uppercase tracking-[0.15em] text-muted-foreground">Appeal Embed</h3>
                <div className="grid gap-4 md:grid-cols-2">
                  <div className="space-y-2">
                    <Label>Appeal Embed Title</Label>
                    <Input value={config.appealEmbedTitle || ""} onChange={(event) => updateConfig("appealEmbedTitle", event.target.value)} />
                  </div>
                  <div className="space-y-2 md:col-span-2">
                    <Label>Appeal Embed Description</Label>
                    <Textarea value={config.appealEmbedDescription || ""} onChange={(event) => updateConfig("appealEmbedDescription", event.target.value)} />
                  </div>
                </div>
                <div className="mt-3">
                  {renderFeaturePostSection("appeals", "Post Appeal Embed", "Choose where to post the ban appeal embed using these settings.", "Post Appeal Embed")}
                </div>
              </div>
            </div>
          )}

          {moduleId === "payouts" && (
            <div className="space-y-6">
              <div className="rounded-lg border border-border/70 bg-muted/20 p-4">
                <h3 className="text-sm font-semibold uppercase tracking-[0.15em] text-muted-foreground">Setup Commands</h3>
                <p className="mt-2 text-xs text-muted-foreground">Run these slash commands in Discord to post the payout request embed and configure channels:</p>
                <div className="mt-3 flex flex-wrap gap-2">
                  <Badge variant="outline">/setup_pay_request</Badge>
                  <Badge variant="outline">/setup_payment_logs</Badge>
                  <Badge variant="outline">/payout</Badge>
                  <Badge variant="outline">/list_payouts</Badge>
                  <Badge variant="outline">/message_all</Badge>
                  <Badge variant="outline">/message_role</Badge>
                </div>
              </div>
              <div className="grid gap-4 md:grid-cols-2">
                {renderChannelSelect("Payout Request Channel", "requestChannelId", textChannels, "select-module-payout-request")}
                {renderChannelSelect("Payout Log Channel", "logChannelId", textChannels, "select-module-payout-log")}
                {renderChannelSelect("Command Log Channel", "commandLogChannelId", textChannels, "select-module-payout-command-log")}
              </div>
              {renderRoleSection("Payout Approval Roles", "allowedRoleIds", "module-settings-payout-approval-role")}
              {renderFeaturePostSection("payouts", "Post Payout Embed", "Choose the channel where the payout request embed should be sent.", "Post Payout Embed")}
            </div>
          )}

          {moduleId === "moderation" && (
            <div className="space-y-6">
              <div className="rounded-lg border border-border/70 bg-muted/20 p-4">
                <h3 className="text-sm font-semibold uppercase tracking-[0.15em] text-muted-foreground">Setup Commands</h3>
                <p className="mt-2 text-xs text-muted-foreground">Configure moderation logs and prefix command permissions:</p>
                <div className="mt-3 flex flex-wrap gap-2">
                  <Badge variant="outline">/setup_moderation_logs</Badge>
                  <Badge variant="outline">/setup_command_logs</Badge>
                  <Badge variant="outline">/setup_moderation</Badge>
                </div>
              </div>
              <div className="grid gap-4 md:grid-cols-2">
                {renderChannelSelect("Moderation Log Channel", "modLogChannelId", textChannels, "select-module-mod-log")}
                {renderChannelSelect("Command Log Channel", "commandLogChannelId", textChannels, "select-module-command-log")}
              </div>
              <div className="space-y-5">
                {renderRoleSection("Ban/Unban + Kick Approval Roles", "modRoleIds", "module-settings-moderation-role")}
                {renderPermissionRoleSection("Prefix Ban/Fullban/Fakeban Roles", "prefixBanRoleIds", "module-settings-prefix-ban-role")}
                {renderPermissionRoleSection("Prefix Mute Roles", "prefixMuteRoleIds", "module-settings-prefix-mute-role")}
                {renderPermissionRoleSection("Prefix Kick Roles", "prefixKickRoleIds", "module-settings-prefix-kick-role")}
                {renderPermissionRoleSection("Prefix Modlogs/Clean Roles", "prefixModlogsRoleIds", "module-settings-prefix-modlogs-role")}
              </div>
            </div>
          )}

          {moduleId === "quiz" && (
            <div className="space-y-6">
              <div className="rounded-lg border border-border/70 bg-muted/20 p-4">
                <h3 className="text-sm font-semibold uppercase tracking-[0.15em] text-muted-foreground">Setup Commands</h3>
                <p className="mt-2 text-xs text-muted-foreground">Quizzes are started and reviewed directly from Discord. Configure the log channel below, then use these commands:</p>
                <div className="mt-3 flex flex-wrap gap-2">
                  <Badge variant="outline">/setup_quiz_log</Badge>
                  <Badge variant="outline">/terminate_quizzes</Badge>
                </div>
              </div>
              <div className="grid gap-4 md:grid-cols-2">
                {renderChannelSelect("Quiz Log Channel", "quizLogChannelId", textChannels, "select-module-quiz-log")}
                {renderChannelSelect("Command Log Channel", "commandLogChannelId", textChannels, "select-module-quiz-command-log")}
              </div>
            </div>
          )}

          {moduleId === "staff-intro" && (
            <div className="space-y-6">
              <div className="rounded-lg border border-border/70 bg-muted/20 p-4">
                <h3 className="text-sm font-semibold uppercase tracking-[0.15em] text-muted-foreground">Setup Commands</h3>
                <p className="mt-2 text-xs text-muted-foreground">Post the intro/application embeds in a channel, then set where submissions go:</p>
                <div className="mt-3 flex flex-wrap gap-2">
                  <Badge variant="outline">/setup_staff_intro</Badge>
                  <Badge variant="outline">/setup_staff_intro_submissions</Badge>
                  <Badge variant="outline">/setup_intro_questions</Badge>
                  <Badge variant="outline">/setup_staff_applications</Badge>
                  <Badge variant="outline">/setup_staff_app_submissions</Badge>
                  <Badge variant="outline">/setup_staff_app_questions</Badge>
                  <Badge variant="outline">/config_staff_intro</Badge>
                </div>
              </div>
              <div className="grid gap-4 md:grid-cols-2">
                {renderChannelSelect("Staff Intro Channel", "staffIntroChannelId", textChannels, "select-module-staff-intro")}
                {renderChannelSelect("Staff Intro Submissions", "staffIntroSubmissionsChannelId", textChannels, "select-module-staff-intro-submissions")}
              </div>
              <Separator />
              <div>
                <h3 className="mb-3 text-sm font-semibold uppercase tracking-[0.15em] text-muted-foreground">Intro Embed</h3>
                <div className="grid gap-4 md:grid-cols-2">
                  <div className="space-y-2">
                    <Label>Staff Intro Embed Title</Label>
                    <Input value={config.staffIntroEmbedTitle || ""} onChange={(event) => updateConfig("staffIntroEmbedTitle", event.target.value)} />
                  </div>
                  <div className="space-y-2 md:col-span-2">
                    <Label>Staff Intro Embed Description</Label>
                    <Textarea value={config.staffIntroEmbedDescription || ""} onChange={(event) => updateConfig("staffIntroEmbedDescription", event.target.value)} />
                  </div>
                </div>
                <div className="mt-3">
                  {renderFeaturePostSection("staff-intro", "Post Staff Intro Embed", "Choose where to post the staff intro quiz embed.", "Post Staff Intro Embed")}
                </div>
              </div>
            </div>
          )}

          {moduleId === "inactivity" && (
            <div className="space-y-6">
              <div className="rounded-lg border border-border/70 bg-muted/20 p-4">
                <h3 className="text-sm font-semibold uppercase tracking-[0.15em] text-muted-foreground">Setup Commands</h3>
                <p className="mt-2 text-xs text-muted-foreground">Post the inactivity request embed in a channel, then configure where submissions and logs go:</p>
                <div className="mt-3 flex flex-wrap gap-2">
                  <Badge variant="outline">/setup_inactivity</Badge>
                  <Badge variant="outline">/setup_inactivity_submissions</Badge>
                  <Badge variant="outline">/setup_inactivity_logs</Badge>
                </div>
              </div>
              <div className="grid gap-4 md:grid-cols-2">
                {renderChannelSelect("Inactivity Channel", "inactivityChannelId", textChannels, "select-module-inactivity")}
                {renderChannelSelect("Inactivity Submissions", "inactivitySubmissionsChannelId", textChannels, "select-module-inactivity-submissions")}
                {renderChannelSelect("Inactivity Log Channel", "inactivityLogChannelId", textChannels, "select-module-inactivity-log")}
              </div>
              {renderRoleSection("Inactivity Ping Roles", "inactivityPingRoleIds", "module-settings-inactivity-ping-role")}
              <Separator />
              <div>
                <h3 className="mb-3 text-sm font-semibold uppercase tracking-[0.15em] text-muted-foreground">Request Embed</h3>
                <div className="grid gap-4 md:grid-cols-2">
                  <div className="space-y-2">
                    <Label>Inactivity Embed Title</Label>
                    <Input value={config.inactivityEmbedTitle || ""} onChange={(event) => updateConfig("inactivityEmbedTitle", event.target.value)} />
                  </div>
                  <div className="space-y-2 md:col-span-2">
                    <Label>Inactivity Embed Description</Label>
                    <Textarea value={config.inactivityEmbedDescription || ""} onChange={(event) => updateConfig("inactivityEmbedDescription", event.target.value)} />
                  </div>
                </div>
                <div className="mt-3">
                  {renderFeaturePostSection("inactivity", "Post Inactivity Embed", "Choose where to post the inactivity request embed.", "Post Inactivity Embed")}
                </div>
              </div>
            </div>
          )}

          {moduleId === "permissions" && (
            renderBotPermissionSections()
          )}

          {moduleId === "embeds" && (
            <div className="space-y-6">
              <div className="grid gap-4 md:grid-cols-2">
                <div className="space-y-2">
                  <Label>Modmail Embed Title</Label>
                  <Input value={config.modmailEmbedTitle || ""} onChange={(event) => updateConfig("modmailEmbedTitle", event.target.value)} />
                </div>
                <div className="space-y-2">
                  <Label>Appeal Embed Title</Label>
                  <Input value={config.appealEmbedTitle || ""} onChange={(event) => updateConfig("appealEmbedTitle", event.target.value)} />
                </div>
                <div className="space-y-2">
                  <Label>Modmail Embed Description</Label>
                  <Textarea value={config.modmailEmbedDescription || ""} onChange={(event) => updateConfig("modmailEmbedDescription", event.target.value)} />
                </div>
                <div className="space-y-2">
                  <Label>Appeal Embed Description</Label>
                  <Textarea value={config.appealEmbedDescription || ""} onChange={(event) => updateConfig("appealEmbedDescription", event.target.value)} />
                </div>
              </div>

              <div className="grid gap-4 md:grid-cols-2">
                <div className="space-y-2">
                  <Label>Staff Intro Embed Title</Label>
                  <Input value={config.staffIntroEmbedTitle || ""} onChange={(event) => updateConfig("staffIntroEmbedTitle", event.target.value)} />
                </div>
                <div className="space-y-2">
                  <Label>Inactivity Embed Title</Label>
                  <Input value={config.inactivityEmbedTitle || ""} onChange={(event) => updateConfig("inactivityEmbedTitle", event.target.value)} />
                </div>
                <div className="space-y-2">
                  <Label>Staff Intro Embed Description</Label>
                  <Textarea value={config.staffIntroEmbedDescription || ""} onChange={(event) => updateConfig("staffIntroEmbedDescription", event.target.value)} />
                </div>
                <div className="space-y-2">
                  <Label>Inactivity Embed Description</Label>
                  <Textarea value={config.inactivityEmbedDescription || ""} onChange={(event) => updateConfig("inactivityEmbedDescription", event.target.value)} />
                </div>
              </div>

              <Separator />

              <div className="space-y-4">
                <h3 className="text-sm font-semibold uppercase tracking-[0.15em] text-muted-foreground">Welcome Embed</h3>
                <div className="grid gap-4 md:grid-cols-2">
                  <div className="space-y-2 md:col-span-2">
                    <Label>Welcome Message</Label>
                    <Textarea
                      value={welcomeEmbedSettings.message}
                      onChange={(event) => setWelcomeEmbedSettings((prev) => ({ ...prev, message: event.target.value }))}
                    />
                  </div>
                  <div className="space-y-2">
                    <Label>Author</Label>
                    <Input
                      value={welcomeEmbedSettings.author}
                      onChange={(event) => setWelcomeEmbedSettings((prev) => ({ ...prev, author: event.target.value }))}
                    />
                  </div>
                  <div className="space-y-2">
                    <Label>Author Icon URL</Label>
                    <Input
                      value={welcomeEmbedSettings.authorIcon}
                      onChange={(event) => setWelcomeEmbedSettings((prev) => ({ ...prev, authorIcon: event.target.value }))}
                    />
                  </div>
                  <div className="space-y-2">
                    <Label>Footer</Label>
                    <Input
                      value={welcomeEmbedSettings.footer}
                      onChange={(event) => setWelcomeEmbedSettings((prev) => ({ ...prev, footer: event.target.value }))}
                    />
                  </div>
                  <div className="space-y-2">
                    <Label>Footer Icon URL</Label>
                    <Input
                      value={welcomeEmbedSettings.footerIcon}
                      onChange={(event) => setWelcomeEmbedSettings((prev) => ({ ...prev, footerIcon: event.target.value }))}
                    />
                  </div>
                  <div className="space-y-2 md:col-span-2">
                    <Label>Color (hex)</Label>
                    <Input
                      value={welcomeEmbedSettings.color}
                      onChange={(event) => setWelcomeEmbedSettings((prev) => ({ ...prev, color: event.target.value.replace(/[^0-9a-fA-F]/g, "") }))}
                      placeholder="57f287"
                    />
                  </div>
                </div>
              </div>

              <div className="rounded-lg border border-border/70 bg-muted/20 p-4">
                <h3 className="text-sm font-semibold uppercase tracking-[0.15em] text-muted-foreground">Template Variables</h3>
                <p className="mt-2 text-sm text-muted-foreground">Use these placeholders in embed messages:</p>
                <div className="mt-3 flex flex-wrap gap-2">
                  <Badge variant="outline">{"{user}"}</Badge>
                  <Badge variant="outline">{"{mention}"}</Badge>
                  <Badge variant="outline">{"{username}"}</Badge>
                  <Badge variant="outline">{"{displayname}"}</Badge>
                  <Badge variant="outline">{"{userid}"}</Badge>
                  <Badge variant="outline">{"{server}"}</Badge>
                  <Badge variant="outline">{"{serverid}"}</Badge>
                  <Badge variant="outline">{"{membercount}"}</Badge>
                  <Badge variant="outline">{"{member_count}"}</Badge>
                  <Badge variant="outline">{"{joinedat}"}</Badge>
                  <Badge variant="outline">{"{joined_at}"}</Badge>
                  <Badge variant="outline">{"{createdat}"}</Badge>
                  <Badge variant="outline">{"{created_at}"}</Badge>
                </div>
              </div>
            </div>
          )}

          {moduleId === "advanced" && (
            <div className="space-y-4">
              <div className="grid gap-4 md:grid-cols-2">
                <div className="space-y-2">
                  <Label>Command Prefix</Label>
                  <Input
                    value={config.commandPrefix || "."}
                    onChange={(event) => updateConfig("commandPrefix", event.target.value)}
                    placeholder="."
                    data-testid="input-module-command-prefix"
                  />
                </div>
              </div>
              <div className="space-y-2">
                <Label>customCategoryPings (JSON object)</Label>
                <Textarea
                  value={customCategoryPingsText}
                  onChange={(event) => {
                    setCustomCategoryPingsText(event.target.value);
                    updateConfig("customCategoryPings", event.target.value);
                  }}
                  className="min-h-[180px] font-mono text-xs"
                  data-testid="textarea-module-custom-category-pings"
                />
              </div>
              <div className="space-y-2">
                <Label>customModmailCategories (JSON array)</Label>
                <Textarea
                  value={customModmailCategoriesText}
                  onChange={(event) => setCustomModmailCategoriesText(event.target.value)}
                  className="min-h-[180px] font-mono text-xs"
                  data-testid="textarea-module-custom-modmail-categories"
                />
              </div>
            </div>
          )}

          {moduleId === "ban-requests" && (
            <div className="space-y-6">
              <div className="rounded-lg border border-border/70 bg-muted/20 p-4">
                <h3 className="text-sm font-semibold uppercase tracking-[0.15em] text-muted-foreground">Setup Commands</h3>
                <p className="mt-2 text-xs text-muted-foreground">Post the ban/unban/kick request embeds in their respective channels:</p>
                <div className="mt-3 flex flex-wrap gap-2">
                  <Badge variant="outline">/setup_ban</Badge>
                  <Badge variant="outline">/setup_unban</Badge>
                  <Badge variant="outline">/setup_kick</Badge>
                  <Badge variant="outline">/setup_ban_log</Badge>
                  <Badge variant="outline">/setup_unban_log</Badge>
                </div>
              </div>
              <div className="grid gap-4 md:grid-cols-2">
                {renderChannelSelect("Ban Request Channel", "banChannelId", textChannels, "select-module-ban-channel")}
                {renderChannelSelect("Unban Request Channel", "unbanChannelId", textChannels, "select-module-unban-channel")}
                {renderChannelSelect("Ban Log Channel", "banLogChannelId", textChannels, "select-module-ban-log")}
                {renderChannelSelect("Unban Log Channel", "unbanLogChannelId", textChannels, "select-module-unban-log")}
              </div>
              {renderRoleSection("Ban/Unban + Kick Approval Roles", "modRoleIds", "module-settings-ban-mod-role")}
            </div>
          )}

          {moduleId === "role-requests" && (
            <div className="space-y-6">
              <div className="rounded-lg border border-border/70 bg-muted/20 p-4">
                <h3 className="text-sm font-semibold uppercase tracking-[0.15em] text-muted-foreground">Setup Commands</h3>
                <p className="mt-2 text-xs text-muted-foreground">Use these commands to post role request embeds and configure the pro role pipeline:</p>
                <div className="mt-3 flex flex-wrap gap-2">
                  <Badge variant="outline">/setup_role_requests</Badge>
                  <Badge variant="outline">/setup_pro_role_requests</Badge>
                  <Badge variant="outline">/set_pro_roles</Badge>
                </div>
              </div>
              <div className="space-y-5">
                {renderRoleSection("Role Command Roles", "roleCommandRoleIds", "module-settings-role-command-role")}
                {renderPermissionRoleSection("Role Request Command Roles", "roleRequestCommandRoleIds", "module-settings-role-request-command-role")}
              </div>
            </div>
          )}

          {moduleId === "activity" && (
            <div className="space-y-6">
              <div className="rounded-lg border border-border/70 bg-muted/20 p-4">
                <h3 className="text-sm font-semibold uppercase tracking-[0.15em] text-muted-foreground">Setup Commands</h3>
                <p className="mt-2 text-xs text-muted-foreground">Configure activity tracking, leaderboard roles, group assignments, and partnership tracking:</p>
                <div className="mt-3 flex flex-wrap gap-2">
                  <Badge variant="outline">/activity_role</Badge>
                  <Badge variant="outline">/activity leaderboard</Badge>
                  <Badge variant="outline">/activity check</Badge>
                  <Badge variant="outline">/pick roles</Badge>
                  <Badge variant="outline">/partnership_channel</Badge>
                  <Badge variant="outline">/add_activity</Badge>
                  <Badge variant="outline">/remove_activity</Badge>
                  <Badge variant="outline">/reset_activity</Badge>
                  <Badge variant="outline">/restore_activity</Badge>
                </div>
              </div>
              <div className="space-y-5">
                {renderRoleSection("Activity Command Roles", "activityRoleIds", "module-settings-activity-role")}
                {renderRoleSection("Activity Reset Roles", "activityResetRoleIds", "module-settings-activity-reset-role")}
                {renderRoleSection("Activity Tracked Roles", "activityTrackedRoleIds", "module-settings-activity-tracked-role")}
              </div>
            </div>
          )}

          {moduleId === "roster" && (
            <div className="space-y-6">
              <div className="rounded-lg border border-border/70 bg-muted/20 p-4">
                <h3 className="text-sm font-semibold uppercase tracking-[0.15em] text-muted-foreground">Setup Commands</h3>
                <p className="mt-2 text-xs text-muted-foreground">Create rosters and post them to the configured channels:</p>
                <div className="mt-3 flex flex-wrap gap-2">
                  <Badge variant="outline">/setup_player_roster</Badge>
                  <Badge variant="outline">/setup_staff_roster</Badge>
                  <Badge variant="outline">/create_roster</Badge>
                  <Badge variant="outline">/delete_roster</Badge>
                  <Badge variant="outline">/roster</Badge>
                </div>
              </div>
              <div className="grid gap-4 md:grid-cols-2">
                {renderChannelSelect("Player Roster Channel", "playerRosterChannelId", textChannels, "select-module-player-roster")}
                {renderChannelSelect("Staff Roster Channel", "staffRosterChannelId", textChannels, "select-module-staff-roster")}
              </div>
              {renderRoleSection("Roster Command Roles", "rosterCommandRoleIds", "module-settings-roster-command-role")}
            </div>
          )}

          {moduleId === "snippets" && (
            <div className="space-y-6">
              <div className="rounded-lg border border-border/70 bg-muted/20 p-4">
                <h3 className="text-sm font-semibold uppercase tracking-[0.15em] text-muted-foreground">Setup Commands</h3>
                <p className="mt-2 text-xs text-muted-foreground">You can now manage snippets here in the dashboard too. Discord commands still work as backups:</p>
                <div className="mt-3 flex flex-wrap gap-2">
                  <Badge variant="outline">/add_snippet</Badge>
                  <Badge variant="outline">/delete_snippet</Badge>
                  <Badge variant="outline">/list_snippets</Badge>
                  <Badge variant="outline">/snippet</Badge>
                </div>
              </div>
              {renderRoleSection("Snippet Roles", "snippetRoleIds", "module-settings-snippet-role")}
              <Separator />
              <div className="space-y-4">
                <div className="flex items-center justify-between gap-3">
                  <div>
                    <h3 className="text-sm font-semibold uppercase tracking-[0.15em] text-muted-foreground">Snippet Manager</h3>
                    <p className="mt-1 text-xs text-muted-foreground">Create, edit, and delete quick replies used in modmail.</p>
                  </div>
                  <Button variant="outline" size="sm" onClick={() => loadSnippets()} disabled={snippetLoading}>
                    {snippetLoading ? "Refreshing…" : "Refresh"}
                  </Button>
                </div>

                <div className="rounded-md border border-border/60 bg-muted/10 p-3 space-y-3">
                  <p className="text-xs font-medium text-muted-foreground">{snippetEditingAlias ? `Editing /${snippetEditingAlias}` : "Add New Snippet"}</p>
                  <div className="grid gap-3 md:grid-cols-[220px,1fr]">
                    <div className="space-y-1">
                      <Label className="text-xs">Alias</Label>
                      <Input
                        placeholder="e.g. rules"
                        value={snippetAliasInput}
                        onChange={(event) => setSnippetAliasInput(event.target.value.toLowerCase())}
                        disabled={!!snippetEditingAlias}
                      />
                    </div>
                    <div className="space-y-1">
                      <Label className="text-xs">Snippet Content</Label>
                      <Textarea
                        placeholder="Type the quick reply message here..."
                        value={snippetContentInput}
                        onChange={(event) => setSnippetContentInput(event.target.value)}
                        className="min-h-[96px]"
                      />
                    </div>
                  </div>
                  <div className="flex flex-wrap gap-2">
                    <Button size="sm" onClick={saveSnippet} disabled={snippetSaving}>
                      {snippetSaving ? "Saving…" : snippetEditingAlias ? "Update Snippet" : "Create Snippet"}
                    </Button>
                    {snippetEditingAlias && (
                      <Button
                        size="sm"
                        variant="ghost"
                        onClick={() => {
                          setSnippetEditingAlias(null);
                          setSnippetAliasInput("");
                          setSnippetContentInput("");
                        }}
                      >
                        Cancel
                      </Button>
                    )}
                  </div>
                </div>

                {snippetLoading ? (
                  <p className="text-sm text-muted-foreground">Loading snippets…</p>
                ) : snippetItems.length === 0 ? (
                  <p className="text-sm text-muted-foreground">No snippets yet. Create one above to get started.</p>
                ) : (
                  <div className="space-y-2">
                    {snippetItems.map((snippet) => (
                      <div key={snippet.id} className="rounded-md border border-border/60 bg-muted/20 p-3">
                        <div className="flex items-start justify-between gap-3">
                          <div className="min-w-0 flex-1">
                            <div className="flex items-center gap-2">
                              <Badge variant="outline">/{snippet.alias}</Badge>
                              <span className="text-[11px] text-muted-foreground">Updated {new Date(snippet.updatedAt).toLocaleString()}</span>
                            </div>
                            <p className="mt-2 whitespace-pre-wrap text-sm text-muted-foreground">{snippet.content}</p>
                          </div>
                          <div className="flex gap-1 shrink-0">
                            <Button
                              variant="ghost"
                              size="icon"
                              className="h-7 w-7"
                              onClick={() => {
                                setSnippetEditingAlias(snippet.alias);
                                setSnippetAliasInput(snippet.alias);
                                setSnippetContentInput(snippet.content);
                              }}
                            >
                              <Pencil className="h-3.5 w-3.5" />
                            </Button>
                            {snippetDeleteConfirm === snippet.alias ? (
                              <>
                                <Button variant="destructive" size="icon" className="h-7 w-7" onClick={() => deleteSnippet(snippet.alias)}>
                                  <Trash2 className="h-3.5 w-3.5" />
                                </Button>
                                <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => setSnippetDeleteConfirm(null)}>
                                  <X className="h-3.5 w-3.5" />
                                </Button>
                              </>
                            ) : (
                              <Button
                                variant="ghost"
                                size="icon"
                                className="h-7 w-7 text-destructive hover:text-destructive"
                                onClick={() => setSnippetDeleteConfirm(snippet.alias)}
                              >
                                <Trash2 className="h-3.5 w-3.5" />
                              </Button>
                            )}
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>
          )}

          {moduleId === "auto-roles" && (
            <div className="space-y-6">
              <div className="rounded-lg border border-border/70 bg-muted/20 p-4">
                <h3 className="text-sm font-semibold uppercase tracking-[0.15em] text-muted-foreground">Join Role Automation</h3>
                <p className="mt-2 text-xs text-muted-foreground">Automatically add or remove roles when someone joins the server. Delays are set in minutes.</p>
              </div>

              <div className="grid gap-4 xl:grid-cols-2">
                <div className="rounded-md border border-border/60 bg-muted/10 p-4 space-y-4">
                  <div>
                    <h4 className="text-sm font-medium">Add Rule</h4>
                    <p className="mt-1 text-xs text-muted-foreground">Choose a role, delay, and whether it should be added or removed on join.</p>
                  </div>
                  {renderSingleRoleSelect(
                    "Role",
                    newAutoRole.roleId || "",
                    (roleId) => setNewAutoRole((prev) => ({ ...prev, roleId })),
                    "auto-role-picker",
                  )}
                  <div className="space-y-2">
                    <Label>Delay (minutes)</Label>
                    <Input
                      type="number"
                      min="0"
                      step="1"
                      value={newAutoRole.delayMinutes}
                      onChange={(event) => setNewAutoRole((prev) => ({ ...prev, delayMinutes: event.target.value.replace(/[^0-9]/g, "") || "0" }))}
                    />
                  </div>
                  <div className="space-y-2">
                    <Label>Type</Label>
                    <Select value={newAutoRole.type} onValueChange={(value) => setNewAutoRole((prev) => ({ ...prev, type: value as AutoRoleMode }))}>
                      <SelectTrigger>
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="add">Add Role</SelectItem>
                        <SelectItem value="remove">Remove Role</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                  <Button onClick={addAutoRoleRule} className="w-fit">Add</Button>
                </div>

                <div className="rounded-md border border-border/60 bg-muted/10 p-4 space-y-3">
                  <div>
                    <h4 className="text-sm font-medium">Auto Role List</h4>
                    <p className="mt-1 text-xs text-muted-foreground">These rules run whenever a member joins this server.</p>
                  </div>
                  {autoRoles.length === 0 ? (
                    <p className="text-sm text-muted-foreground">No auto role rules yet.</p>
                  ) : (
                    <div className="space-y-2">
                      {autoRoles.map((entry) => {
                        const roleName = roles.find((role) => role.id === entry.roleId)?.name || entry.roleId;
                        return (
                          <div key={entry.id} className="flex items-center justify-between gap-3 rounded-md border border-border/60 bg-background/40 px-3 py-2">
                            <div className="min-w-0 flex-1">
                              <p className="text-sm font-medium truncate">{roleName}</p>
                              <p className="text-xs text-muted-foreground">
                                {entry.type === "add" ? "Add" : "Remove"} • {entry.delayMinutes} minute{entry.delayMinutes === 1 ? "" : "s"}
                              </p>
                            </div>
                            <Button variant="destructive" size="sm" onClick={() => removeAutoRoleRule(entry.id)}>Remove</Button>
                          </div>
                        );
                      })}
                    </div>
                  )}
                </div>
              </div>
            </div>
          )}

          {moduleId === "reaction-roles" && (
            <div className="space-y-6">
              <div className="rounded-lg border border-border/70 bg-muted/20 p-4">
                <h3 className="text-sm font-semibold uppercase tracking-[0.15em] text-muted-foreground">Reaction Role Message</h3>
                <p className="mt-2 text-xs text-muted-foreground">Create a reaction role embed or attach these roles to an existing message, then use the post button below to publish/apply it.</p>
              </div>

              <div className="rounded-md border border-border/60 bg-muted/10 p-4 space-y-4">
                <div className="grid gap-4 md:grid-cols-2">
                  <div className="space-y-2">
                    <Label>Panel Name</Label>
                    <Input value={reactionRoleSetup.name} onChange={(event) => setReactionRoleSetup((prev) => ({ ...prev, name: event.target.value }))} placeholder="Reaction Roles" />
                  </div>
                  <div className="space-y-2">
                    <Label>Embed Title</Label>
                    <Input value={reactionRoleSetup.embedTitle} onChange={(event) => setReactionRoleSetup((prev) => ({ ...prev, embedTitle: event.target.value }))} placeholder="Reaction Roles" />
                  </div>
                  <div className="space-y-2 md:col-span-2">
                    <Label>Embed Description</Label>
                    <Textarea value={reactionRoleSetup.embedDescription} onChange={(event) => setReactionRoleSetup((prev) => ({ ...prev, embedDescription: event.target.value }))} placeholder="Use the controls below to manage your roles." />
                  </div>
                  <div className="space-y-2">
                    <Label>Embed Color (hex)</Label>
                    <Input
                      value={reactionRoleSetup.embedColor}
                      onChange={(event) => setReactionRoleSetup((prev) => ({
                        ...prev,
                        embedColor: event.target.value.replace(/[^0-9a-fA-F]/g, "").slice(0, 6),
                      }))}
                      placeholder="5865f2"
                    />
                  </div>
                  <div className="space-y-2">
                    <Label>Author Name</Label>
                    <Input
                      value={reactionRoleSetup.authorName}
                      onChange={(event) => setReactionRoleSetup((prev) => ({ ...prev, authorName: event.target.value }))}
                      placeholder="Role Selection"
                    />
                  </div>
                  <div className="space-y-2">
                    <Label>Author Icon URL</Label>
                    <Input
                      value={reactionRoleSetup.authorIcon}
                      onChange={(event) => setReactionRoleSetup((prev) => ({ ...prev, authorIcon: event.target.value }))}
                      placeholder="https://..."
                    />
                  </div>
                  <div className="space-y-2">
                    <Label>Footer Text</Label>
                    <Input
                      value={reactionRoleSetup.footerText}
                      onChange={(event) => setReactionRoleSetup((prev) => ({ ...prev, footerText: event.target.value }))}
                      placeholder="Pick your roles below"
                    />
                  </div>
                  <div className="space-y-2">
                    <Label>Footer Icon URL</Label>
                    <Input
                      value={reactionRoleSetup.footerIcon}
                      onChange={(event) => setReactionRoleSetup((prev) => ({ ...prev, footerIcon: event.target.value }))}
                      placeholder="https://..."
                    />
                  </div>
                  <div className="space-y-2">
                    <Label>Thumbnail URL</Label>
                    <Input
                      value={reactionRoleSetup.thumbnailUrl}
                      onChange={(event) => setReactionRoleSetup((prev) => ({ ...prev, thumbnailUrl: event.target.value }))}
                      placeholder="https://..."
                    />
                  </div>
                  <div className="space-y-2 md:col-span-2">
                    <Label>Image URL</Label>
                    <Input
                      value={reactionRoleSetup.imageUrl}
                      onChange={(event) => setReactionRoleSetup((prev) => ({ ...prev, imageUrl: event.target.value }))}
                      placeholder="https://..."
                    />
                    <p className="text-xs text-muted-foreground">Use direct image links. Leave the icon and thumbnail fields blank to automatically use the server icon.</p>
                  </div>
                  <div className="space-y-2 md:col-span-2">
                    <div className="flex items-center justify-between rounded-md border border-border/60 bg-background/40 px-3 py-2">
                      <div>
                        <p className="text-sm font-medium">Use Existing Message</p>
                        <p className="text-xs text-muted-foreground">Turn this on if you want to attach the role picker to a message ID or Discord message link.</p>
                      </div>
                      <Switch checked={reactionRoleSetup.useExistingMessage} onCheckedChange={(checked) => setReactionRoleSetup((prev) => ({ ...prev, useExistingMessage: checked }))} />
                    </div>
                  </div>
                  <div className={`gap-4 md:col-span-2 ${reactionRoleSetup.useExistingMessage ? "grid md:grid-cols-2" : "space-y-2"}`}>
                    {reactionRoleSetup.useExistingMessage && (
                      <div className="space-y-2">
                        <Label>Message ID or Message Link</Label>
                        <Input
                          value={reactionRoleSetup.existingMessageInput}
                          onChange={(event) => setReactionRoleSetup((prev) => ({ ...prev, existingMessageInput: event.target.value }))}
                          placeholder="Message ID / Message Link"
                        />
                        <p className="text-xs text-muted-foreground">Buttons and dropdown menus need a message the bot can edit.</p>
                      </div>
                    )}
                    <div className="space-y-2">
                      <Label>Role Picker Type</Label>
                      <Select value={reactionRoleSetup.pickerStyle} onValueChange={(value) => setReactionRoleSetup((prev) => ({ ...prev, pickerStyle: value as ReactionRolePickerStyle }))}>
                        <SelectTrigger>
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="reactions">Reactions</SelectItem>
                          <SelectItem value="buttons">Buttons</SelectItem>
                          <SelectItem value="dropdown">Dropdown Menu</SelectItem>
                        </SelectContent>
                      </Select>
                      <p className="text-xs text-muted-foreground">
                        {reactionRoleSetup.pickerStyle === "reactions"
                          ? "Reaction mode works best for emoji roles, but Discord only allows up to 20 unique reactions on one message."
                          : reactionRoleSetup.pickerStyle === "buttons"
                            ? "Buttons are more reliable for quick taps and support up to 25 role options."
                            : "Dropdown mode keeps the message compact and supports up to 25 role options."}
                      </p>
                    </div>
                  </div>
                </div>

                <div>
                  {renderFeaturePostSection("reaction-roles", "Post Channel", "Choose the channel for a new reaction role embed. If you are using an existing message, this channel is only needed when you enter a raw message ID instead of a full Discord link.", reactionRoleSetup.useExistingMessage ? "Apply To Message" : "Post Configured Embed")}
                </div>

                {reactionRoleSetup.messageId && (
                  <p className="text-xs text-muted-foreground">Current linked message ID: <code>{reactionRoleSetup.messageId}</code></p>
                )}
              </div>

              <div className="rounded-md border border-border/60 bg-muted/10 p-4 space-y-4">
                <div>
                  <h4 className="text-sm font-medium">Reaction Settings</h4>
                  <p className="mt-1 text-xs text-muted-foreground">
                    {reactionRoleSetup.pickerStyle === "reactions"
                      ? "Map each emoji to a role and choose whether reacting should add, remove, or fully toggle the role."
                      : "Map each role option and choose whether using it should add, remove, or toggle the role."}
                    {" "}Custom emoji formats like <code>✅</code>, <code>{"<:name:id>"}</code>, and <code>name:id</code> are supported.
                  </p>
                </div>

                <div className="grid gap-4 md:grid-cols-[140px_1fr_180px_auto] md:items-end">
                  <div className="space-y-2">
                    <Label>{reactionRoleSetup.pickerStyle === "reactions" ? "Reaction Emoji" : "Emoji (optional)"}</Label>
                    <Input
                      value={newReactionRole.emoji}
                      onChange={(event) => setNewReactionRole((prev) => ({ ...prev, emoji: event.target.value }))}
                      placeholder={reactionRoleSetup.pickerStyle === "reactions" ? "✅ or <:exr:123456789012345678>" : "Optional icon like ✅ or <:exr:123456789012345678>"}
                    />
                  </div>
                  {renderSingleRoleSelect(
                    "Role",
                    newReactionRole.roleId || "",
                    (roleId) => setNewReactionRole((prev) => ({ ...prev, roleId })),
                    "reaction-role-picker",
                  )}
                  <div className="space-y-2">
                    <Label>Type</Label>
                    <Select value={newReactionRole.mode} onValueChange={(value) => setNewReactionRole((prev) => ({ ...prev, mode: value as ReactionRoleMode }))}>
                      <SelectTrigger>
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="both">Both Ways</SelectItem>
                        <SelectItem value="add_only">Add Only</SelectItem>
                        <SelectItem value="remove_only">Remove Only</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                  <Button onClick={addReactionRoleItem}>{reactionRoleSetup.pickerStyle === "reactions" ? "Add Reaction" : "Add Role Option"}</Button>
                </div>

                {reactionRoleSetup.items.length === 0 ? (
                  <p className="text-sm text-muted-foreground">No reaction role mappings yet.</p>
                ) : (
                  <div className="space-y-2">
                    {reactionRoleSetup.items.map((entry) => {
                      const roleName = roles.find((role) => role.id === entry.roleId)?.name || entry.roleId;
                      const typeLabel = entry.mode === "both" ? "Both Ways" : entry.mode === "add_only" ? "Add Only" : "Remove Only";
                      return (
                        <div key={entry.id} className="flex items-center justify-between gap-3 rounded-md border border-border/60 bg-background/40 px-3 py-2">
                          <div className="min-w-0 flex-1">
                            <p className="text-sm font-medium">{entry.emoji ? `${entry.emoji} → ${roleName}` : roleName}</p>
                            <p className="text-xs text-muted-foreground">{typeLabel}</p>
                          </div>
                          <Button variant="destructive" size="sm" onClick={() => removeReactionRoleItem(entry.id)}>Remove</Button>
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>
            </div>
          )}

          {moduleId === "sticky" && (
            <div className="space-y-6">
              <div className="rounded-lg border border-border/70 bg-muted/20 p-4">
                <h3 className="text-sm font-semibold uppercase tracking-[0.15em] text-muted-foreground">Setup Commands</h3>
                <p className="mt-2 text-xs text-muted-foreground">Run these in any channel to pin a sticky message that re-posts itself after new messages:</p>
                <div className="mt-3 flex flex-wrap gap-2">
                  <Badge variant="outline">/sticky</Badge>
                  <Badge variant="outline">/unsticky</Badge>
                </div>
              </div>
              {renderPermissionRoleSection("Sticky Command Roles", "stickyCommandRoleIds", "module-settings-sticky-command-role")}
            </div>
          )}
        </CardContent>
      </Card>
    );
  };

  const renderBotPermissionSections = () => (
    <div className="space-y-5">
      {renderRoleSection("Payout Approval Roles", "allowedRoleIds", "module-payout-approval-role")}
      {renderRoleSection("Ban/Unban + Kick Approval Roles", "modRoleIds", "module-moderation-approval-role")}
      {renderRoleSection("Modmail Staff Roles", "modmailStaffRoleIds", "module-modmail-staff-role")}
      {renderRoleSection("Modmail Block Roles", "modmailBlockRoleIds", "module-modmail-block-role")}
      {renderRoleSection("Modmail Claim Roles", "modmailClaimRoleIds", "module-modmail-claim-role")}
      {renderRoleSection("Appeal Staff Roles", "appealStaffRoleIds", "module-appeal-staff-role")}
      {renderRoleSection("Activity Reset Roles", "activityResetRoleIds", "module-activity-reset-role")}
      {renderRoleSection("Snippet Roles", "snippetRoleIds", "module-snippet-role")}
      {renderRoleSection("Activity Command Roles", "activityRoleIds", "module-activity-role")}
      {renderRoleSection("Message Command Roles", "messageCommandRoleIds", "module-message-command-role")}
      {renderRoleSection("Roster Command Roles", "rosterCommandRoleIds", "module-roster-command-role")}
      {renderRoleSection("Role Command Roles", "roleCommandRoleIds", "module-role-command-role")}
      {renderPermissionRoleSection("Sticky Command Roles", "stickyCommandRoleIds", "module-sticky-command-role")}
      {renderPermissionRoleSection("Role Request Command Roles", "roleRequestCommandRoleIds", "module-role-request-command-role")}
      {renderPermissionRoleSection("Prefix Ban/Fullban/Fakeban Roles", "prefixBanRoleIds", "module-prefix-ban-role")}
      {renderPermissionRoleSection("Prefix Mute Roles", "prefixMuteRoleIds", "module-prefix-mute-role")}
      {renderPermissionRoleSection("Prefix Kick Roles", "prefixKickRoleIds", "module-prefix-kick-role")}
      {renderPermissionRoleSection("Prefix Modlogs/Clean Roles", "prefixModlogsRoleIds", "module-prefix-modlogs-role")}
      {renderPermissionRoleSection("Prefix Reason Roles", "prefixReasonRoleIds", "module-prefix-reason-role")}
      {renderPermissionRoleSection("Prefix Retime Roles", "prefixRetimeRoleIds", "module-prefix-retime-role")}
    </div>
  );

  const dropdownSearchInputRefs = useRef<Record<string, HTMLInputElement | null>>({});

  const setDropdownSearchInputRef = (key: string) => (node: HTMLInputElement | null) => {
    dropdownSearchInputRefs.current[key] = node;
  };

  const focusDropdownSearchInput = (key: string) => (open: boolean) => {
    if (!open) return;
    requestAnimationFrame(() => {
      const input = dropdownSearchInputRefs.current[key];
      input?.focus();
      input?.select();
    });
  };

  const stopDropdownSearchKeyPropagation = (event: any) => {
    if (event.key === "Escape") {
      return;
    }
    event.stopPropagation();
    event.nativeEvent?.stopImmediatePropagation?.();
  };

  const stopDropdownSearchPointerPropagation = (event: React.PointerEvent<HTMLInputElement>) => {
    event.stopPropagation();
  };

  const renderChannelSelect = (
    label: string,
    key: keyof GuildConfig,
    options: Channel[],
    testId: string,
  ) => {
    const value = (config[key] as string | null | undefined) || NONE_VALUE;
    const filteredChannels = filterNamedItems(options, channelSearches[String(key)] || "");
    const selectedChannel = options.find((channel) => channel.id === value);

    return (
      <div className="space-y-2">
        <Label>{label}</Label>
        <DropdownMenu modal={false} onOpenChange={focusDropdownSearchInput(testId)}>
          <DropdownMenuTrigger asChild>
            <Button variant="outline" className="w-full justify-between" data-testid={testId}>
              <span className="truncate text-left">
                {selectedChannel ? `#${selectedChannel.name}` : "Select channel"}
              </span>
              <ChevronDown className="h-4 w-4 opacity-70" />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent className="max-h-80 w-80 overflow-y-auto">
            <div className="px-1 pb-2">
              <Input
                ref={setDropdownSearchInputRef(testId)}
                autoFocus
                value={channelSearches[String(key)] || ""}
                onChange={(event) =>
                  setChannelSearches((prev) => ({ ...prev, [String(key)]: event.target.value }))
                }
                onPointerDown={stopDropdownSearchPointerPropagation}
                onKeyDownCapture={stopDropdownSearchKeyPropagation}
                onKeyDown={stopDropdownSearchKeyPropagation}
                placeholder="Search channels..."
                className="h-8"
                data-testid={`${testId}-search`}
              />
            </div>
            <DropdownMenuCheckboxItem
              checked={value === NONE_VALUE}
              onCheckedChange={() => updateConfig(key, null as GuildConfig[typeof key])}
              onSelect={(event) => event.preventDefault()}
              data-testid={`${testId}-none`}
            >
              Not set
            </DropdownMenuCheckboxItem>
            {filteredChannels.map((channel) => (
              <DropdownMenuCheckboxItem
                key={channel.id}
                checked={value === channel.id}
                onCheckedChange={() => updateConfig(key, channel.id as GuildConfig[typeof key])}
                onSelect={(event) => event.preventDefault()}
                data-testid={`${testId}-${channel.id}`}
              >
                #{channel.name}
              </DropdownMenuCheckboxItem>
            ))}
            {filteredChannels.length === 0 && (
              <p className="px-2 py-1 text-xs text-muted-foreground">No channels found.</p>
            )}
          </DropdownMenuContent>
        </DropdownMenu>
      </div>
    );
  };

  const renderSingleRoleSelect = (
    label: string,
    selectedRoleId: string | null | undefined,
    onSelect: (roleId: string) => void,
    testIdPrefix: string,
  ) => {
    const matchedRoles = filterNamedItems(roles, roleSearches[testIdPrefix] || "");
    const selectedRole = roles.find((role) => role.id === selectedRoleId);

    return (
      <div className="space-y-2">
        <Label>{label}</Label>
        <DropdownMenu modal={false} onOpenChange={focusDropdownSearchInput(testIdPrefix)}>
          <DropdownMenuTrigger asChild>
            <Button variant="outline" className="w-full justify-between" data-testid={`${testIdPrefix}-trigger`}>
              <span className="truncate text-left">
                {selectedRole ? selectedRole.name : "Select role"}
              </span>
              <ChevronDown className="h-4 w-4 opacity-70" />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent className="max-h-72 w-80 overflow-y-auto">
            <div className="px-1 pb-2">
              <Input
                ref={setDropdownSearchInputRef(testIdPrefix)}
                autoFocus
                value={roleSearches[testIdPrefix] || ""}
                onChange={(event) =>
                  setRoleSearches((prev) => ({ ...prev, [testIdPrefix]: event.target.value }))
                }
                onPointerDown={stopDropdownSearchPointerPropagation}
                onKeyDownCapture={stopDropdownSearchKeyPropagation}
                onKeyDown={stopDropdownSearchKeyPropagation}
                placeholder="Search roles..."
                className="h-8"
                data-testid={`${testIdPrefix}-search`}
              />
            </div>
            <DropdownMenuCheckboxItem
              checked={!selectedRoleId}
              onCheckedChange={() => onSelect("")}
              onSelect={(event) => event.preventDefault()}
              data-testid={`${testIdPrefix}-none`}
            >
              Select role
            </DropdownMenuCheckboxItem>
            {matchedRoles.map((role) => (
              <DropdownMenuCheckboxItem
                key={role.id}
                checked={selectedRoleId === role.id}
                onCheckedChange={() => onSelect(role.id)}
                onSelect={(event) => event.preventDefault()}
                data-testid={`${testIdPrefix}-${role.id}`}
              >
                {role.name}
              </DropdownMenuCheckboxItem>
            ))}
            {matchedRoles.length === 0 && (
              <p className="px-2 py-1 text-xs text-muted-foreground">No roles found.</p>
            )}
          </DropdownMenuContent>
        </DropdownMenu>
      </div>
    );
  };

  const renderCustomRoleSection = (
    label: string,
    availableRoles: Role[],
    selectedRoleIds: string[],
    onToggle: (roleId: string) => void,
    testIdPrefix: string,
  ) => {
    const matchedRoles = filterNamedItems(availableRoles, roleSearches[testIdPrefix] || "");

    return (
      <div className="space-y-3">
        <Label>{label}</Label>
        <div className="space-y-2">
          <DropdownMenu modal={false} onOpenChange={focusDropdownSearchInput(testIdPrefix)}>
            <DropdownMenuTrigger asChild>
              <Button variant="outline" className="w-full justify-between" data-testid={`${testIdPrefix}-trigger`}>
                <span className="truncate text-left">
                  {selectedRoleIds.length > 0 ? `${selectedRoleIds.length} role(s) selected` : "Select roles"}
                </span>
                <ChevronDown className="h-4 w-4 opacity-70" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent className="max-h-72 w-80 overflow-y-auto">
              <div className="px-1 pb-2">
                <Input
                  ref={setDropdownSearchInputRef(testIdPrefix)}
                  autoFocus
                  value={roleSearches[testIdPrefix] || ""}
                  onChange={(event) =>
                    setRoleSearches((prev) => ({ ...prev, [testIdPrefix]: event.target.value }))
                  }
                  onPointerDown={stopDropdownSearchPointerPropagation}
                  onKeyDownCapture={stopDropdownSearchKeyPropagation}
                  onKeyDown={stopDropdownSearchKeyPropagation}
                  placeholder="Search roles..."
                  className="h-8"
                  data-testid={`${testIdPrefix}-search`}
                />
              </div>
              {matchedRoles.map((role) => {
                const selected = selectedRoleIds.includes(role.id);
                return (
                  <DropdownMenuCheckboxItem
                    key={role.id}
                    checked={selected}
                    onCheckedChange={() => onToggle(role.id)}
                    onSelect={(event) => event.preventDefault()}
                    data-testid={`${testIdPrefix}-${role.id}`}
                  >
                    {role.name}
                  </DropdownMenuCheckboxItem>
                );
              })}
              {matchedRoles.length === 0 && (
                <p className="px-2 py-1 text-xs text-muted-foreground">No roles found.</p>
              )}
            </DropdownMenuContent>
          </DropdownMenu>

          <div className="flex flex-wrap gap-2">
            {availableRoles
              .filter((role) => selectedRoleIds.includes(role.id))
              .slice(0, 10)
              .map((role) => (
                <Badge key={role.id} variant="secondary" className="max-w-[220px] truncate" title={role.name}>
                  {role.name}
                </Badge>
              ))}
            {selectedRoleIds.length > 10 && (
              <Badge variant="outline">+{selectedRoleIds.length - 10} more</Badge>
            )}
          </div>
        </div>
      </div>
    );
  };

  const renderCustomChannelSection = (
    label: string,
    availableChannels: Channel[],
    selectedChannelId: string | null | undefined,
    onSelect: (channelId: string | null) => void,
    testIdPrefix: string,
  ) => {
    const value = selectedChannelId || NONE_VALUE;
    const filteredChannels = filterNamedItems(availableChannels, channelSearches[testIdPrefix] || "");
    const selectedChannel = availableChannels.find((channel) => channel.id === selectedChannelId);

    return (
      <div className="space-y-3">
        <Label>{label}</Label>
        <DropdownMenu modal={false} onOpenChange={focusDropdownSearchInput(testIdPrefix)}>
          <DropdownMenuTrigger asChild>
            <Button variant="outline" className="w-full justify-between" data-testid={`${testIdPrefix}-trigger`}>
              <span className="truncate text-left">{selectedChannel ? `#${selectedChannel.name}` : "Select channel"}</span>
              <ChevronDown className="h-4 w-4 opacity-70" />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent className="max-h-80 w-80 overflow-y-auto">
            <div className="px-1 pb-2">
              <Input
                ref={setDropdownSearchInputRef(testIdPrefix)}
                autoFocus
                value={channelSearches[testIdPrefix] || ""}
                onChange={(event) => setChannelSearches((prev) => ({ ...prev, [testIdPrefix]: event.target.value }))}
                onPointerDown={stopDropdownSearchPointerPropagation}
                onKeyDownCapture={stopDropdownSearchKeyPropagation}
                onKeyDown={stopDropdownSearchKeyPropagation}
                placeholder="Search channels..."
                className="h-8"
                data-testid={`${testIdPrefix}-search`}
              />
            </div>
            <DropdownMenuCheckboxItem
              checked={value === NONE_VALUE}
              onCheckedChange={() => onSelect(null)}
              onSelect={(event) => event.preventDefault()}
              data-testid={`${testIdPrefix}-none`}
            >
              Not set
            </DropdownMenuCheckboxItem>
            {filteredChannels.map((channel) => (
              <DropdownMenuCheckboxItem
                key={channel.id}
                checked={value === channel.id}
                onCheckedChange={() => onSelect(channel.id)}
                onSelect={(event) => event.preventDefault()}
                data-testid={`${testIdPrefix}-${channel.id}`}
              >
                #{channel.name}
              </DropdownMenuCheckboxItem>
            ))}
            {filteredChannels.length === 0 && (
              <p className="px-2 py-1 text-xs text-muted-foreground">No channels found.</p>
            )}
          </DropdownMenuContent>
        </DropdownMenu>
      </div>
    );
  };

  const renderRoleSection = (label: string, key: keyof GuildConfig, testIdPrefix: string) => {
    const selectedRoleIds = filterToCurrentServerRoleIds((config[key] as string[] | undefined) || []);
    const matchedRoles = filterNamedItems(roles, roleSearches[String(key)] || "");

    return (
    <div className="space-y-3">
      <Label>{label}</Label>
      <div className="space-y-2">
        <DropdownMenu modal={false} onOpenChange={focusDropdownSearchInput(testIdPrefix)}>
          <DropdownMenuTrigger asChild>
            <Button variant="outline" className="w-full justify-between" data-testid={`${testIdPrefix}-trigger`}>
              <span className="truncate text-left">
                {(selectedRoleIds.length || 0) > 0
                  ? `${selectedRoleIds.length} role(s) selected`
                  : "Select roles"}
              </span>
              <ChevronDown className="h-4 w-4 opacity-70" />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent className="max-h-72 w-80 overflow-y-auto">
            <div className="px-1 pb-2">
              <Input
                ref={setDropdownSearchInputRef(testIdPrefix)}
                autoFocus
                value={roleSearches[String(key)] || ""}
                onChange={(event) =>
                  setRoleSearches((prev) => ({ ...prev, [String(key)]: event.target.value }))
                }
                onPointerDown={stopDropdownSearchPointerPropagation}
                onKeyDownCapture={stopDropdownSearchKeyPropagation}
                onKeyDown={stopDropdownSearchKeyPropagation}
                placeholder="Search roles..."
                className="h-8"
                data-testid={`${testIdPrefix}-search`}
              />
            </div>
            {matchedRoles.map((role) => {
              const selected = selectedRoleIds.includes(role.id);
              return (
                <DropdownMenuCheckboxItem
                  key={role.id}
                  checked={selected}
                  onCheckedChange={() => toggleRole(key, role.id)}
                  onSelect={(event) => event.preventDefault()}
                  data-testid={`${testIdPrefix}-${role.id}`}
                >
                  {role.name}
                </DropdownMenuCheckboxItem>
              );
            })}
            {matchedRoles.length === 0 && (
              <p className="px-2 py-1 text-xs text-muted-foreground">No roles found.</p>
            )}
          </DropdownMenuContent>
        </DropdownMenu>

        <div className="flex flex-wrap gap-2">
          {roles
            .filter((role) => selectedRoleIds.includes(role.id))
            .slice(0, 8)
            .map((role) => (
              <Badge key={role.id} variant="secondary" className="max-w-[220px] truncate" title={role.name}>
                {role.name}
              </Badge>
            ))}
          {(selectedRoleIds.length || 0) > 8 && (
            <Badge variant="outline">+{selectedRoleIds.length - 8} more</Badge>
          )}
        </div>
      </div>
    </div>
  );
  };

  const renderPermissionRoleSection = (label: string, key: keyof DashboardPermissionSettings, testIdPrefix: string) => {
    const selectedRoleIds = filterToCurrentServerRoleIds(permissionSettings[key] || []);
    const matchedRoles = filterNamedItems(roles, roleSearches[String(key)] || "");

    return (
    <div className="space-y-3">
      <Label>{label}</Label>
      <div className="space-y-2">
        <DropdownMenu modal={false} onOpenChange={focusDropdownSearchInput(testIdPrefix)}>
          <DropdownMenuTrigger asChild>
            <Button variant="outline" className="w-full justify-between" data-testid={`${testIdPrefix}-trigger`}>
              <span className="truncate text-left">
                {(selectedRoleIds.length || 0) > 0
                  ? `${selectedRoleIds.length} role(s) selected`
                  : "Select roles"}
              </span>
              <ChevronDown className="h-4 w-4 opacity-70" />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent className="max-h-72 w-80 overflow-y-auto">
            <div className="px-1 pb-2">
              <Input
                ref={setDropdownSearchInputRef(testIdPrefix)}
                autoFocus
                value={roleSearches[String(key)] || ""}
                onChange={(event) =>
                  setRoleSearches((prev) => ({ ...prev, [String(key)]: event.target.value }))
                }
                onPointerDown={stopDropdownSearchPointerPropagation}
                onKeyDownCapture={stopDropdownSearchKeyPropagation}
                onKeyDown={stopDropdownSearchKeyPropagation}
                placeholder="Search roles..."
                className="h-8"
                data-testid={`${testIdPrefix}-search`}
              />
            </div>
            {matchedRoles.map((role) => {
              const selected = selectedRoleIds.includes(role.id);
              return (
                <DropdownMenuCheckboxItem
                  key={role.id}
                  checked={selected}
                  onCheckedChange={() => togglePermissionRole(key, role.id)}
                  onSelect={(event) => event.preventDefault()}
                  data-testid={`${testIdPrefix}-${role.id}`}
                >
                  {role.name}
                </DropdownMenuCheckboxItem>
              );
            })}
            {matchedRoles.length === 0 && (
              <p className="px-2 py-1 text-xs text-muted-foreground">No roles found.</p>
            )}
          </DropdownMenuContent>
        </DropdownMenu>

        <div className="flex flex-wrap gap-2">
          {roles
            .filter((role) => selectedRoleIds.includes(role.id))
            .slice(0, 8)
            .map((role) => (
              <Badge key={role.id} variant="secondary" className="max-w-[220px] truncate" title={role.name}>
                {role.name}
              </Badge>
            ))}
          {(selectedRoleIds.length || 0) > 8 && (
            <Badge variant="outline">+{selectedRoleIds.length - 8} more</Badge>
          )}
        </div>
      </div>
    </div>
  );
  };

  if (!selectedGuild) {
    return (
      <div className="min-h-screen bg-background px-3 py-6 sm:px-6 sm:py-8" style={dashboardGradientStyle}>
        <div className="mx-auto max-w-6xl space-y-8">
          <Card data-testid="card-bot-status">
            <CardHeader>
              <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                <div>
                  <CardTitle className="text-xl sm:text-2xl">Bot Control Center</CardTitle>
                  <CardDescription>Manage all setup from dashboard and slash commands together.</CardDescription>
                  {currentUser && (
                    <p className="mt-2 text-sm text-muted-foreground">Signed in as {currentUser.username}</p>
                  )}
                </div>
                <div className="flex flex-wrap items-center justify-start gap-2 sm:justify-end">
                  <Button variant="outline" size="sm" onClick={toggleTheme} data-testid="button-toggle-theme">
                    {themeMounted && theme === "light" ? <Moon className="mr-1 h-4 w-4 sm:mr-2" /> : <Sun className="mr-1 h-4 w-4 sm:mr-2" />}
                    <span className="hidden sm:inline">{themeMounted && theme === "light" ? "Dark Mode" : "Light Mode"}</span>
                  </Button>
                  <div className="hidden sm:flex items-center gap-2 rounded-md border border-border px-2 py-1" data-testid="button-color-controls">
                    <Palette className="h-4 w-4 text-muted-foreground" />
                    <Label htmlFor="background-color" className="hidden text-xs text-muted-foreground sm:inline">Background</Label>
                    <input
                      id="background-color"
                      type="color"
                      value={backgroundColor}
                      onChange={(event) => updateBackgroundColor(event.target.value)}
                      className="h-7 w-7 cursor-pointer rounded border border-border bg-transparent p-0"
                      data-testid="input-background-color"
                    />
                    <Label htmlFor="button-color" className="hidden text-xs text-muted-foreground sm:inline">Buttons</Label>
                    <input
                      id="button-color"
                      type="color"
                      value={buttonColor}
                      onChange={(event) => updateButtonColor(event.target.value)}
                      className="h-7 w-7 cursor-pointer rounded border border-border bg-transparent p-0"
                      data-testid="input-button-color"
                    />
                  </div>
                  <div className="hidden sm:block">{renderBackgroundPresetControls("list")}</div>
                  {currentUser ? (
                    <Button variant="outline" size="sm" onClick={logout} data-testid="button-logout">
                      Sign Out
                    </Button>
                  ) : (
                    <Button size="sm" onClick={beginDiscordLogin} data-testid="button-login">
                      Login with Discord
                    </Button>
                  )}
                  {botStatus === "online" && (
                    <Badge className="bg-green-500" data-testid="badge-status-online">
                      <CheckCircle2 className="mr-1 h-3 w-3" />
                      Online
                    </Badge>
                  )}
                  {botStatus === "offline" && (
                    <Badge variant="destructive" data-testid="badge-status-offline">
                      <AlertCircle className="mr-1 h-3 w-3" />
                      Offline
                    </Badge>
                  )}
                  {botStatus === "external" && (
                    <Badge variant="secondary" data-testid="badge-status-external">
                      <Settings className="mr-1 h-3 w-3" />
                      Bot in VS Code
                    </Badge>
                  )}
                  {botStatus === "checking" && <Badge variant="secondary">Checking</Badge>}
                </div>
              </div>
            </CardHeader>
          </Card>

          <Card>
            <CardHeader>
              <div className="flex items-start justify-between gap-3">
                <div>
                  <CardTitle className="text-4xl font-semibold tracking-tight">Servers</CardTitle>
                  <CardDescription>Servers you're in ({guilds.length} servers)</CardDescription>
                </div>
                {isOwnerUser && (
                  <Button
                    variant={showOwnerDashboard ? "secondary" : "outline"}
                    onClick={() => {
                      if (!isOwnerUser) {
                        toast({ title: "Access denied", description: "Owner dashboard only.", variant: "destructive" });
                        return;
                      }
                      const nextValue = !showOwnerDashboard;
                      setShowOwnerDashboard(nextValue);
                      if (nextValue) {
                        refreshOwnerBotStatus().catch(() => undefined);
                        refreshOwnerGuilds().catch(() => undefined);
                      }
                    }}
                    data-testid="button-owners-dashboard"
                  >
                    Owner's Dashboard
                  </Button>
                )}
              </div>
            </CardHeader>
            <CardContent>
              {showOwnerDashboard ? (
                isOwnerUser ? (
                  <div className="space-y-6">
                    <div className="rounded-xl border border-border/70 bg-card/70 p-5">
                      <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
                        <div>
                          <p className="text-lg font-semibold">Owner&apos;s Dashboard</p>
                          <p className="mt-1 text-sm text-muted-foreground">Bot-wide controls and per-server enable or disable controls.</p>
                          <div className="mt-3 flex flex-wrap gap-2 text-sm">
                            <Badge variant={ownerBotStatus === "online" ? "default" : "secondary"}>Live: {ownerBotStatus}</Badge>
                            <Badge variant={ownerDesiredState === "on" ? "default" : "secondary"}>Saved Default: {ownerDesiredState}</Badge>
                            <Badge variant="outline">Servers: {ownerGuildCount}</Badge>
                          </div>
                        </div>

                        <div className="flex flex-wrap gap-3">
                          <Button
                            variant="outline"
                            onClick={() => {
                              refreshOwnerBotStatus().catch(() => undefined);
                              refreshOwnerGuilds().catch(() => undefined);
                            }}
                            disabled={ownerGuildsLoading || ownerTurningOn || ownerTurningOff || ownerLeavingAll || ownerUpdatingGuildId !== null}
                            data-testid="button-owner-refresh"
                          >
                            Refresh Servers
                          </Button>
                        </div>
                      </div>
                    </div>

                    <div className="flex flex-wrap gap-3">
                      <Button
                        onClick={inviteBotFromOwnerDashboard}
                        disabled={ownerTurningOn || ownerTurningOff || ownerLeavingAll || ownerGuildsLoading || ownerUpdatingGuildId !== null || !applicationId}
                        variant="outline"
                        data-testid="button-owner-invite-bot"
                      >
                        Invite Bot
                      </Button>
                      <Button
                        onClick={turnBotOn}
                        disabled={ownerTurningOn || ownerTurningOff || ownerLeavingAll || ownerGuildsLoading || ownerUpdatingGuildId !== null}
                        variant={ownerDesiredState === "on" ? "default" : "outline"}
                        className={ownerDesiredState === "on" ? "bg-green-600 text-white hover:bg-green-700" : ""}
                        data-testid="button-owner-turn-bot-on"
                      >
                        {ownerTurningOn ? "Turning On..." : "Turn Bot On"}
                      </Button>
                      <Button
                        onClick={turnBotOff}
                        disabled={ownerTurningOn || ownerTurningOff || ownerLeavingAll || ownerGuildsLoading || ownerUpdatingGuildId !== null}
                        variant={ownerDesiredState === "off" ? "destructive" : "outline"}
                        className={ownerDesiredState === "off" ? "bg-red-600 text-white hover:bg-red-700" : ""}
                        data-testid="button-owner-turn-bot-off"
                      >
                        {ownerTurningOff ? "Turning Off..." : "Turn Bot Off"}
                      </Button>
                      <Button
                        onClick={leaveAllServers}
                        disabled={ownerTurningOn || ownerTurningOff || ownerLeavingAll || ownerGuildsLoading || ownerUpdatingGuildId !== null}
                        className="bg-red-800 text-white hover:bg-red-900"
                        data-testid="button-owner-leave-all-servers"
                      >
                        {ownerLeavingAll ? "Leaving All..." : "LEAVE ALL SERVERS"}
                      </Button>
                    </div>

                    <div className="space-y-3 rounded-xl border border-border/70 bg-card/40 p-5">
                      <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
                        <div>
                          <p className="text-sm font-semibold uppercase tracking-wide text-muted-foreground">Bot Servers</p>
                          <p className="text-sm text-muted-foreground">These are the servers the bot is in. Use the controls on each row to disable or re-enable that server.</p>
                        </div>
                      </div>

                      {ownerGuildsLoading ? (
                        <p className="py-4 text-center text-muted-foreground">Loading bot servers...</p>
                      ) : visibleOwnerGuilds.length === 0 ? (
                        <div className="rounded-lg border border-dashed border-border p-6 text-center">
                          <p className="text-sm text-muted-foreground">No bot servers are available yet.</p>
                          <p className="mt-1 text-xs text-muted-foreground">Click Refresh Servers after the bot is online.</p>
                        </div>
                      ) : (
                        <div className="space-y-3">
                        {visibleOwnerGuilds.map((guild) => {
                          const accessState = ownerSecurityAccess[guild.id] || createOwnerSecurityAccessState();
                          const accessRoleNames = accessState.roles
                            .filter((role) => accessState.accessRoleIds.includes(role.id))
                            .map((role) => role.name);
                          const blacklistAccessRoleNames = accessState.roles
                            .filter((role) => accessState.blacklistAccessRoleIds.includes(role.id))
                            .map((role) => role.name);

                          return (
                            <div key={`owner-${guild.id}`} className="space-y-3 rounded-xl border border-border bg-card/60 p-4" data-testid={`owner-guild-${guild.id}`}>
                              <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
                                <div className="flex items-start gap-3 min-w-0">
                                  <div className="h-14 w-14 shrink-0 overflow-hidden rounded-lg bg-muted">
                                    {guild.icon ? (
                                      <img src={guild.icon} alt={guild.name} className="h-full w-full object-cover" />
                                    ) : (
                                      <div className="flex h-full w-full items-center justify-center">
                                        <Server className="h-6 w-6 text-muted-foreground" />
                                      </div>
                                    )}
                                  </div>
                                  <div className="min-w-0 flex-1">
                                    <p className="line-clamp-2 font-medium leading-tight">{guild.name}</p>
                                    <p className="mt-1 text-xs text-muted-foreground">{guild.memberCount} members</p>
                                    <div className="mt-2 flex flex-wrap gap-2">
                                      <Badge variant={guild.isDisabled ? "destructive" : "outline"}>
                                        {guild.isDisabled ? "Disabled" : "Enabled"}
                                      </Badge>
                                      <Badge variant="outline">{guild.id}</Badge>
                                    </div>
                                    <p className="mt-2 text-xs text-muted-foreground">
                                      Security access: {accessState.loaded
                                        ? `${accessRoleNames.length} role(s) • ${accessState.accessUserIds.length} user ID(s)`
                                        : "Click Security Access to manage"}
                                    </p>
                                    <p className="mt-1 text-xs text-muted-foreground">
                                      Blacklist access: {accessState.loaded
                                        ? `${blacklistAccessRoleNames.length} role(s) • ${accessState.blacklistAccessUserIds.length} user ID(s)`
                                        : "Click Security Access to manage"}
                                    </p>
                                  </div>
                                </div>

                                <div className="flex flex-col gap-2 sm:flex-row lg:justify-end">
                                  <Button
                                    variant="outline"
                                    className="flex-1"
                                    onClick={() => toggleOwnerSecurityPanel(guild.id)}
                                    disabled={ownerGuildsLoading || ownerUpdatingGuildId === guild.id}
                                    data-testid={`button-owner-security-access-${guild.id}`}
                                  >
                                    {accessState.open ? "Hide Access Controls" : "Access Controls"}
                                  </Button>
                                  <Button
                                    className="flex-1 bg-red-600 text-white hover:bg-red-700"
                                    onClick={() => setOwnerGuildDisabled(guild, true)}
                                    disabled={ownerTurningOn || ownerTurningOff || ownerLeavingAll || ownerGuildsLoading || ownerUpdatingGuildId === guild.id || guild.isDisabled}
                                    data-testid={`button-owner-disable-guild-${guild.id}`}
                                  >
                                    {ownerUpdatingGuildId === guild.id && !guild.isDisabled ? "Disabling..." : "Disable"}
                                  </Button>
                                  <Button
                                    className="flex-1 bg-green-600 text-white hover:bg-green-700"
                                    onClick={() => setOwnerGuildDisabled(guild, false)}
                                    disabled={ownerTurningOn || ownerTurningOff || ownerLeavingAll || ownerGuildsLoading || ownerUpdatingGuildId === guild.id || !guild.isDisabled}
                                    data-testid={`button-owner-enable-guild-${guild.id}`}
                                  >
                                    {ownerUpdatingGuildId === guild.id && !!guild.isDisabled ? "Enabling..." : "Enable"}
                                  </Button>

                                  <Button
                                    variant="destructive"
                                    size="sm"
                                    className="w-full sm:w-auto"
                                    onClick={() => leaveServer(guild)}
                                    disabled={leavingGuildId === guild.id || ownerUpdatingGuildId === guild.id}
                                    data-testid={`button-leave-guild-${guild.id}`}
                                  >
                                    {leavingGuildId === guild.id ? "Leaving..." : "Leave Server"}
                                  </Button>
                                </div>
                              </div>

                              {accessState.open && (
                                <div className="rounded-xl border border-border/70 bg-background/40 p-4">
                                  <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
                                    <div>
                                      <p className="font-medium">Security & Blacklist Access</p>
                                      <p className="text-xs text-muted-foreground">Choose which roles or user IDs can open Security and who can manage the server blacklist.</p>
                                    </div>
                                    <Button
                                      size="sm"
                                      onClick={() => saveOwnerSecurityAccess(guild.id)}
                                      disabled={accessState.loading || accessState.saving}
                                      data-testid={`button-owner-security-access-save-${guild.id}`}
                                    >
                                      {accessState.saving ? "Saving..." : "Update Access"}
                                    </Button>
                                  </div>

                                  {accessState.loading ? (
                                    <p className="mt-4 text-sm text-muted-foreground">Loading roles...</p>
                                  ) : (
                                    <div className="mt-4 space-y-6">
                                      <div className="grid gap-4 xl:grid-cols-2">
                                        <div className="space-y-4">
                                          {renderCustomRoleSection(
                                            "Security Allowed Roles",
                                            accessState.roles,
                                            accessState.accessRoleIds,
                                            (roleId) => toggleOwnerSecurityAccessRole(guild.id, roleId),
                                            `owner-security-access-${guild.id}`,
                                          )}
                                        </div>

                                        <div className="space-y-3">
                                          <Label>Security Allowed Users</Label>
                                          <div className="flex flex-col gap-2 sm:flex-row">
                                            <Input
                                              value={accessState.userIdInput}
                                              onChange={(event) => setOwnerSecurityAccess((prev) => ({
                                                ...prev,
                                                [guild.id]: {
                                                  ...(prev[guild.id] || createOwnerSecurityAccessState()),
                                                  userIdInput: event.target.value,
                                                },
                                              }))}
                                              placeholder="Enter a user ID"
                                              data-testid={`input-owner-security-user-${guild.id}`}
                                            />
                                            <Button
                                              type="button"
                                              onClick={() => addOwnerSecurityAccessUser(guild.id)}
                                              data-testid={`button-owner-security-user-add-${guild.id}`}
                                            >
                                              Add User
                                            </Button>
                                          </div>

                                          <div className="flex flex-wrap gap-2">
                                            {accessState.accessUserIds.length === 0 ? (
                                              <p className="text-sm text-muted-foreground">No extra user IDs are allowed yet.</p>
                                            ) : (
                                              accessState.accessUserIds.map((userId) => (
                                                <Badge key={`owner-security-${guild.id}-${userId}`} variant="secondary" className="gap-2 pr-1">
                                                  {userId}
                                                  <button
                                                    type="button"
                                                    onClick={() => removeOwnerSecurityAccessUser(guild.id, userId)}
                                                    className="rounded p-0.5 hover:bg-background/60"
                                                    aria-label={`Remove ${userId}`}
                                                  >
                                                    <X className="h-3 w-3" />
                                                  </button>
                                                </Badge>
                                              ))
                                            )}
                                          </div>
                                        </div>
                                      </div>

                                      <div className="grid gap-4 xl:grid-cols-2 rounded-lg border border-border/60 bg-card/40 p-4">
                                        <div className="space-y-4">
                                          {renderCustomRoleSection(
                                            "Blacklist Allowed Roles",
                                            accessState.roles,
                                            accessState.blacklistAccessRoleIds,
                                            (roleId) => toggleOwnerBlacklistAccessRole(guild.id, roleId),
                                            `owner-blacklist-access-${guild.id}`,
                                          )}
                                        </div>

                                        <div className="space-y-3">
                                          <Label>Blacklist Allowed Users</Label>
                                          <div className="flex flex-col gap-2 sm:flex-row">
                                            <Input
                                              value={accessState.blacklistUserIdInput}
                                              onChange={(event) => setOwnerSecurityAccess((prev) => ({
                                                ...prev,
                                                [guild.id]: {
                                                  ...(prev[guild.id] || createOwnerSecurityAccessState()),
                                                  blacklistUserIdInput: event.target.value,
                                                },
                                              }))}
                                              placeholder="Enter a user ID"
                                              data-testid={`input-owner-blacklist-user-${guild.id}`}
                                            />
                                            <Button
                                              type="button"
                                              onClick={() => addOwnerBlacklistAccessUser(guild.id)}
                                              data-testid={`button-owner-blacklist-user-add-${guild.id}`}
                                            >
                                              Add User
                                            </Button>
                                          </div>

                                          <div className="flex flex-wrap gap-2">
                                            {accessState.blacklistAccessUserIds.length === 0 ? (
                                              <p className="text-sm text-muted-foreground">No extra user IDs can manage the blacklist yet.</p>
                                            ) : (
                                              accessState.blacklistAccessUserIds.map((userId) => (
                                                <Badge key={`owner-blacklist-${guild.id}-${userId}`} variant="secondary" className="gap-2 pr-1">
                                                  {userId}
                                                  <button
                                                    type="button"
                                                    onClick={() => removeOwnerBlacklistAccessUser(guild.id, userId)}
                                                    className="rounded p-0.5 hover:bg-background/60"
                                                    aria-label={`Remove ${userId}`}
                                                  >
                                                    <X className="h-3 w-3" />
                                                  </button>
                                                </Badge>
                                              ))
                                            )}
                                          </div>
                                        </div>
                                      </div>
                                    </div>
                                  )}
                                </div>
                              )}
                            </div>
                          );
                        })}
                        </div>
                      )}
                    </div>
                  </div>
                ) : (
                  <p className="py-4 text-center text-destructive">Access denied.</p>
                )
              ) : loading ? (
                <p className="py-4 text-center text-muted-foreground">Loading servers...</p>
              ) : guilds.length === 0 ? (
                <p className="py-4 text-center text-muted-foreground">No servers found. Invite the bot first.</p>
              ) : (
                <div className="grid grid-cols-2 gap-5 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5">
                  {guilds.map((guild) => (
                    <div key={guild.id} className="group text-left" data-testid={`card-guild-${guild.id}`}>
                      <button
                        type="button"
                        className="w-full"
                        onClick={() => {
                          if (!currentUser) {
                            toast({
                              title: "Login required",
                              description: "Please login first to access the server.",
                              variant: "destructive",
                            });
                            return;
                          }
                          setSelectedGuild(guild.id);
                          setLocation("/dashboard");
                        }}
                      >
                        <div className="overflow-hidden rounded-xl border border-border bg-card/60 transition-all duration-200 ease-out group-hover:-translate-y-1 group-hover:border-primary/60">
                          <div className="aspect-square w-full overflow-hidden">
                            {guild.icon ? (
                              <img src={guild.icon} alt={guild.name} className="h-full w-full object-cover" />
                            ) : (
                              <div className="flex h-full w-full items-center justify-center bg-muted">
                                <Server className="h-12 w-12 text-muted-foreground" />
                              </div>
                            )}
                          </div>
                        </div>
                        <div className="mt-3 space-y-1 text-center">
                          <p className="line-clamp-2 font-medium leading-tight group-hover:text-primary">{guild.name}</p>
                          <p className="text-xs text-muted-foreground">{guild.memberCount} members</p>
                        </div>
                      </button>
                      {isOwnerUser && (
                        <Button
                          variant="destructive"
                          size="sm"
                          className="mt-2 w-full"
                          onClick={() => leaveServer(guild)}
                          disabled={leavingGuildId === guild.id}
                          data-testid={`button-leave-guild-${guild.id}`}
                        >
                          {leavingGuildId === guild.id ? "Leaving..." : "Leave Server"}
                        </Button>
                      )}
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background px-3 py-6 sm:px-6 sm:py-8" style={dashboardGradientStyle}>
      <div className="mx-auto max-w-7xl space-y-6">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex items-center gap-3 min-w-0">
            <Button
              variant="ghost"
              size="sm"
              onClick={() => {
                setSelectedGuild(null);
                setLocation("/dashboard");
              }}
              data-testid="button-back-guilds"
            >
              <ArrowLeft className="mr-1 h-4 w-4 sm:mr-2" />
              <span className="hidden sm:inline">Servers</span>
            </Button>
            <h1 className="truncate text-lg font-semibold sm:text-xl">{guildName}</h1>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <Button variant="outline" size="sm" onClick={toggleTheme} data-testid="button-toggle-theme-selected">
              {themeMounted && theme === "light" ? <Moon className="mr-1 h-4 w-4 sm:mr-2" /> : <Sun className="mr-1 h-4 w-4 sm:mr-2" />}
              <span className="hidden sm:inline">{themeMounted && theme === "light" ? "Dark Mode" : "Light Mode"}</span>
            </Button>
            <div className="hidden sm:flex items-center gap-2 rounded-md border border-border px-2 py-1" data-testid="button-color-controls-selected">
              <Palette className="h-4 w-4 text-muted-foreground" />
              <Label htmlFor="background-color-selected" className="hidden text-xs text-muted-foreground sm:inline">Background</Label>
              <input
                id="background-color-selected"
                type="color"
                value={backgroundColor}
                onChange={(event) => updateBackgroundColor(event.target.value)}
                className="h-7 w-7 cursor-pointer rounded border border-border bg-transparent p-0"
                data-testid="input-background-color-selected"
              />
              <Label htmlFor="button-color-selected" className="hidden text-xs text-muted-foreground sm:inline">Buttons</Label>
              <input
                id="button-color-selected"
                type="color"
                value={buttonColor}
                onChange={(event) => updateButtonColor(event.target.value)}
                className="h-7 w-7 cursor-pointer rounded border border-border bg-transparent p-0"
                data-testid="input-button-color-selected"
              />
            </div>
            <div className="hidden sm:block">{renderBackgroundPresetControls("selected")}</div>
            <Button onClick={saveConfig} disabled={saving} data-testid="button-save">
              <Save className="mr-2 h-4 w-4" />
              {saving ? "Saving..." : "Save Changes"}
            </Button>
          </div>
        </div>

        {loading ? (
          <Card>
            <CardContent className="py-10 text-center text-muted-foreground">Loading configuration...</CardContent>
          </Card>
        ) : activeModule ? (
          <div className="space-y-4">
            <div className="flex items-center gap-2">
              <Button
                variant="outline"
                size="sm"
                onClick={() => {
                  setActivePrimaryTab("features");
                  setLocation("/dashboard");
                }}
                data-testid="button-back-to-features"
              >
                <ArrowLeft className="mr-2 h-4 w-4" />
                Back to Bot Features
              </Button>
            </div>
            {renderActiveModuleSettings()}
          </div>
        ) : (
          <>
          <Tabs
            value={activePrimaryTab}
            onValueChange={(value) => {
              const nextTab = value as PrimaryTabKey;
              if (!hasPrimaryTabAccess(nextTab)) {
                toast({
                  title: "Access denied",
                  description: nextTab === "security"
                    ? "You do not have permission to access the Security category for this server."
                    : "You do not have permission to manage this part of the dashboard.",
                  variant: "destructive",
                });
                return;
              }
              setActivePrimaryTab(nextTab);
            }}
            className="grid grid-cols-[84px_minmax(0,1fr)] gap-4 sm:grid-cols-[240px_minmax(0,1fr)] lg:grid-cols-[280px_minmax(0,1fr)] lg:gap-6"
          >
            <TabsList className="flex h-fit w-full flex-col gap-2 rounded-2xl border border-border/70 bg-card/85 p-2 shadow-sm backdrop-blur sm:p-3">
              {(Object.entries(PRIMARY_TAB_META) as Array<[PrimaryTabKey, { label: string; icon: typeof SlidersHorizontal }]>)
                .map(([tabKey, meta]) => {
                  const Icon = meta.icon;
                  const canOpenTab = hasPrimaryTabAccess(tabKey);
                  return (
                    <TabsTrigger
                      key={tabKey}
                      value={tabKey}
                      disabled={!canOpenTab}
                      data-testid={tabKey === "settings"
                        ? "tab-settings"
                        : tabKey === "features"
                          ? "tab-bot-features"
                          : tabKey === "security"
                            ? "tab-security"
                            : tabKey === "permissions"
                              ? "tab-permissions"
                              : tabKey === "rosters"
                                ? "tab-rosters"
                                : "tab-miscellaneous"}
                      className="group flex min-h-14 w-full items-center justify-center gap-3 rounded-xl border border-transparent px-3 py-3 text-left text-muted-foreground transition-all data-[state=active]:border-primary/30 data-[state=active]:bg-primary/15 data-[state=active]:text-foreground data-[state=active]:shadow-sm disabled:cursor-not-allowed disabled:opacity-45 sm:justify-start"
                    >
                      <span className="flex h-9 w-9 items-center justify-center rounded-xl border border-border/60 bg-background/80 text-primary transition-transform group-data-[state=active]:scale-105 group-data-[state=active]:border-primary/40 group-data-[state=active]:bg-primary/10">
                        <Icon className="h-4 w-4" />
                      </span>
                      <span className="hidden text-sm font-medium sm:inline">{meta.label}</span>
                    </TabsTrigger>
                  );
                })}
            </TabsList>

            <div className="min-w-0">
            <TabsContent value="settings" className="mt-0 space-y-6">
              <Card className="border-border/80 bg-card/90" data-testid="card-server-info">
                <CardHeader>
                  <CardTitle className="text-sm font-semibold uppercase tracking-[0.2em] text-muted-foreground">Server Info</CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-5">
                    <div>
                      <p className="text-xs uppercase tracking-wide text-muted-foreground">Members</p>
                      <p className="mt-1 text-lg font-semibold">{selectedGuildMemberCount ?? selectedGuildSummary?.memberCount ?? 0}</p>
                    </div>
                    <div>
                      <p className="text-xs uppercase tracking-wide text-muted-foreground">Categories</p>
                      <p className="mt-1 text-lg font-semibold">{categoryChannels.length}</p>
                    </div>
                    <div>
                      <p className="text-xs uppercase tracking-wide text-muted-foreground">Text Channels</p>
                      <p className="mt-1 text-lg font-semibold">{textChannels.length}</p>
                    </div>
                    <div>
                      <p className="text-xs uppercase tracking-wide text-muted-foreground">Voice Channels</p>
                      <p className="mt-1 text-lg font-semibold">{voiceChannels.length}</p>
                    </div>
                    <div>
                      <p className="text-xs uppercase tracking-wide text-muted-foreground">Roles</p>
                      <p className="mt-1 text-lg font-semibold">{roles.length}</p>
                    </div>
                  </div>
                  <div className="mt-4 flex justify-start">
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => copyToClipboard(selectedGuild || "", "Server ID")}
                      data-testid="button-copy-server-id"
                    >
                      <Copy className="mr-2 h-4 w-4" />
                      Copy Server ID
                    </Button>
                  </div>
                </CardContent>
              </Card>

              <Card className="border-border/80 bg-card/90" data-testid="card-website-access">
                <CardHeader className="space-y-1">
                  <CardTitle className="text-sm font-semibold uppercase tracking-[0.2em] text-muted-foreground">Website Access</CardTitle>
                  <CardDescription>These manager roles can access and edit this server in the dashboard website.</CardDescription>
                </CardHeader>
                <CardContent className="space-y-3">
                  {renderRoleSection("Manager Roles", "modRoleIds", "settings-manager-role")}
                </CardContent>
              </Card>

              <Card className="border-border/80 bg-card/90" data-testid="card-bot-settings-simple">
                <CardHeader className="space-y-1">
                  <CardTitle className="text-sm font-semibold uppercase tracking-[0.2em] text-muted-foreground">Bot Settings</CardTitle>
                  <CardDescription>Configure moderation commands, modmail commands, nickname, and bot status.</CardDescription>
                </CardHeader>
                <CardContent className="space-y-6">
                  <div className="grid gap-4 md:grid-cols-2">
                    <div className="space-y-2">
                      <Label>Bot Moderation Prefix</Label>
                      <Input
                        value={quickSettings.moderationPrefix}
                        onChange={(event) => setQuickSettings((prev) => ({ ...prev, moderationPrefix: event.target.value }))}
                        placeholder="!"
                        data-testid="input-bot-moderation-prefix"
                      />
                    </div>
                    <div className="space-y-2">
                      <Label>Modmail Prefix</Label>
                      <Input
                        value={quickSettings.modmailPrefix}
                        onChange={(event) => setQuickSettings((prev) => ({ ...prev, modmailPrefix: event.target.value }))}
                        placeholder="?"
                        data-testid="input-modmail-prefix"
                      />
                    </div>
                  </div>

                  <div className="max-w-xl space-y-2">
                    <Label>Bot Nickname</Label>
                    <Input
                      value={quickSettings.botNickname}
                      onChange={(event) => setQuickSettings((prev) => ({ ...prev, botNickname: event.target.value }))}
                      placeholder="Expert Helper Bot"
                      data-testid="input-bot-nickname"
                    />
                  </div>

                  <div className="grid gap-4 md:grid-cols-3">
                    <div className="space-y-2">
                      <Label>Bot Status</Label>
                      <Select
                        value={botPresenceSettings.status}
                        onValueChange={(value) => setBotPresenceSettings((prev) => ({
                          ...prev,
                          status: value as DashboardBotPresenceSettings["status"],
                        }))}
                      >
                        <SelectTrigger data-testid="select-bot-status">
                          <SelectValue placeholder="Select status" />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="online">Online</SelectItem>
                          <SelectItem value="idle">Idle</SelectItem>
                          <SelectItem value="dnd">Do Not Disturb</SelectItem>
                          <SelectItem value="invisible">Invisible</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                    <div className="space-y-2">
                      <Label>Activity Type</Label>
                      <Select
                        value={botPresenceSettings.activityType}
                        onValueChange={(value) => setBotPresenceSettings((prev) => ({
                          ...prev,
                          activityType: value as DashboardBotPresenceSettings["activityType"],
                        }))}
                      >
                        <SelectTrigger data-testid="select-bot-activity-type">
                          <SelectValue placeholder="Select type" />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="playing">Playing</SelectItem>
                          <SelectItem value="listening">Listening</SelectItem>
                          <SelectItem value="watching">Watching</SelectItem>
                          <SelectItem value="competing">Competing</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                    <div className="space-y-2">
                      <Label>Activity Text</Label>
                      <Input
                        value={botPresenceSettings.activityText}
                        onChange={(event) => setBotPresenceSettings((prev) => ({ ...prev, activityText: event.target.value }))}
                        placeholder="you"
                        data-testid="input-bot-activity-text"
                      />
                    </div>
                  </div>
                </CardContent>
              </Card>

              <Card className="border-border/80 bg-card/90" data-testid="card-updates-channel-settings">
                <CardHeader className="space-y-1">
                  <CardTitle className="text-base">Updates Channel</CardTitle>
                  <CardDescription>
                    Choose where dashboard update notices are sent and use the button below to post the latest update manually.
                  </CardDescription>
                </CardHeader>
                <CardContent className="space-y-4">
                  <div className="grid gap-4 md:grid-cols-[minmax(0,1fr)_auto] md:items-end">
                    <div>
                      {renderChannelSelect("Updates Channel", "commandLogChannelId", textChannels, "select-updates-channel")}
                    </div>
                    <Button
                      onClick={postLatestUpdate}
                      disabled={postingLatestUpdate || !String(config.commandLogChannelId || "").trim()}
                      data-testid="button-post-latest-update"
                    >
                      <Sparkles className="mr-2 h-4 w-4" />
                      {postingLatestUpdate ? "Posting..." : "Post Latest Update"}
                    </Button>
                  </div>
                  <p className="text-xs text-muted-foreground">
                    This replaces the duplicate permissions card here and lets you test the updates feed directly.
                  </p>
                </CardContent>
              </Card>
            </TabsContent>

            <TabsContent value="features" className="mt-0 space-y-0">
              <Card className="border-border/80 bg-card/90" data-testid="card-bot-features">
                <CardHeader className="space-y-1">
                  <CardTitle className="text-sm font-semibold uppercase tracking-[0.2em] text-muted-foreground">Bot Features</CardTitle>
                  <CardDescription>Enable or disable feature modules for this server.</CardDescription>
                </CardHeader>
                <CardContent className="space-y-4">
                  <div className="relative">
                    <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                    <Input
                      value={moduleSearch}
                      onChange={(event) => setModuleSearch(event.target.value)}
                      placeholder="Search features..."
                      className="pl-9"
                      data-testid="input-module-search"
                    />
                  </div>

                  <div className="space-y-5">
                    {groupedFeatureModules.map((group) => (
                      <div key={`feature-area-${group.areaKey}`} className="space-y-3">
                        <div>
                          <p className="text-sm font-semibold uppercase tracking-[0.2em] text-muted-foreground">{group.areaMeta.title}</p>
                          <p className="mt-1 text-sm text-muted-foreground">{group.areaMeta.description}</p>
                        </div>

                        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
                          {group.modules.map((module) => {
                            const canManageModule = hasFeatureAccess(module.id);
                            return (
                            <div key={module.id} className="rounded-lg border border-border/70 bg-card/40 p-4">
                              <div className="mb-3 flex items-start justify-between gap-3">
                                <div>
                                  <p className="font-semibold">{module.name}</p>
                                  <p className="mt-1 text-sm text-muted-foreground">{module.description}</p>
                                </div>
                                <Switch
                                  checked={module.enabled}
                                  disabled={!canManageModule}
                                  onCheckedChange={(nextChecked) => setFeatureEnabled(module.id, nextChecked)}
                                  data-testid={`switch-module-${module.id}`}
                                />
                              </div>

                              <div className="mb-3 flex flex-wrap gap-1.5">
                                {module.includes.map((item) => (
                                  <Badge key={`${module.id}-${item}`} variant="outline" className="text-[11px]">
                                    {item}
                                  </Badge>
                                ))}
                              </div>

                              <Badge
                                variant="outline"
                                style={{
                                  backgroundColor: module.enabled ? DEFAULT_ENABLED_STATUS_COLOR : DEFAULT_DISABLED_STATUS_COLOR,
                                  borderColor: module.enabled ? DEFAULT_ENABLED_STATUS_COLOR : DEFAULT_DISABLED_STATUS_COLOR,
                                  color: getReadableTextColor(module.enabled ? DEFAULT_ENABLED_STATUS_COLOR : DEFAULT_DISABLED_STATUS_COLOR),
                                }}
                              >
                                {module.enabled ? "Enabled" : "Disabled"}
                              </Badge>
                              {!canManageModule && (
                                <Badge variant="destructive" className="ml-2">Access denied</Badge>
                              )}
                              <Button
                                variant="outline"
                                size="sm"
                                className="ml-2"
                                onClick={() => {
                                  if (!selectedGuild) return;
                                  if (!canManageModule) {
                                    toast({ title: "Access denied", description: `You do not have permission to manage ${module.name}.`, variant: "destructive" });
                                    return;
                                  }
                                  setLocation(`/dashboard/module/${module.id}?guild=${selectedGuild}`);
                                }}
                                data-testid={`button-module-settings-${module.id}`}
                              >
                                <Settings className="mr-2 h-3.5 w-3.5" />
                                Settings
                              </Button>
                            </div>
                          );})}
                        </div>
                      </div>
                    ))}
                  </div>
                </CardContent>
              </Card>
            </TabsContent>

            <TabsContent value="security" className="mt-0 space-y-4">
              <div>
                <h3 className="text-sm font-semibold uppercase tracking-[0.2em] text-muted-foreground">Security</h3>
                <p className="mt-1 text-sm text-muted-foreground">Configure anti-nuke thresholds, punishments, and protected roles or users for this server.</p>
              </div>

              {!canAccessSecurityTab ? (
                <Card className="border-border/80 bg-card/90">
                  <CardContent className="py-6">
                    <div className="rounded-lg border border-destructive/40 bg-destructive/5 p-4">
                      <div className="flex items-start gap-3">
                        <AlertCircle className="mt-0.5 h-5 w-5 text-destructive" />
                        <div>
                          <p className="font-medium text-destructive">Access denied</p>
                          <p className="mt-1 text-sm text-muted-foreground">Only explicitly allowed users or roles can open this Security category.</p>
                        </div>
                      </div>
                    </div>
                  </CardContent>
                </Card>
              ) : (
                <>
                  <Card className="border-border/80 bg-card/90" data-testid="card-security-log-channel">
                    <CardHeader className="space-y-1">
                      <CardTitle className="text-base">Security Log</CardTitle>
                      <CardDescription>Choose the channel where Security warning and punishment messages should be posted.</CardDescription>
                    </CardHeader>
                    <CardContent className="space-y-4">
                      {renderCustomChannelSection(
                        "Security Log Channel",
                        textChannels,
                        securitySettings.logChannelId,
                        (channelId) => updateSecuritySettings((prev) => ({ ...prev, logChannelId: channelId })),
                        "security-log-channel",
                      )}
                    </CardContent>
                  </Card>

                  <Card className="border-border/80 bg-card/90" data-testid="card-security-rules">
                    <CardHeader className="space-y-1">
                      <CardTitle className="text-base">Anti-Nuke Protection</CardTitle>
                      <CardDescription>
                        Set how many times someone can do an action before Security responds with the selected punishment. If they stop before the timer expires, their count resets.
                      </CardDescription>
                    </CardHeader>
                    <CardContent className="space-y-3">
                      {SECURITY_RULE_META.map((ruleMeta) => {
                        const rule = securitySettings.rules[ruleMeta.key];
                        return (
                          <div
                            key={ruleMeta.key}
                            className="space-y-4 rounded-xl border border-border/70 bg-card/40 p-4"
                          >
                            <div className="grid gap-3 md:grid-cols-[minmax(0,1fr)_110px_190px_120px_auto] md:items-center">
                              <div>
                                <p className="font-semibold uppercase tracking-wide">{ruleMeta.label}</p>
                                <p className="mt-1 text-sm text-muted-foreground">{ruleMeta.description}</p>
                              </div>

                              <div className="space-y-2">
                                <Label className="text-xs uppercase tracking-wide text-muted-foreground">Threshold</Label>
                                <Input
                                  type="number"
                                  min={1}
                                  max={50}
                                  value={String(rule.threshold)}
                                  onChange={(event) => updateSecurityRule(ruleMeta.key, {
                                    threshold: Math.max(1, Math.min(50, Number(event.target.value) || 1)),
                                  })}
                                  data-testid={`input-security-threshold-${ruleMeta.key}`}
                                />
                              </div>

                              <div className="space-y-2">
                                <Label className="text-xs uppercase tracking-wide text-muted-foreground">Punishment Type</Label>
                                <Select
                                  value={rule.punishmentType}
                                  onValueChange={(value) => updateSecurityRule(ruleMeta.key, {
                                    punishmentType: value as SecurityPunishmentType,
                                  })}
                                >
                                  <SelectTrigger data-testid={`select-security-punishment-${ruleMeta.key}`}>
                                    <SelectValue placeholder="Select punishment" />
                                  </SelectTrigger>
                                  <SelectContent>
                                    <SelectItem value="ban">Ban</SelectItem>
                                    <SelectItem value="kick">Kick</SelectItem>
                                    <SelectItem value="clear_roles">Clear Roles</SelectItem>
                                  </SelectContent>
                                </Select>
                              </div>

                              <div className="space-y-2">
                                <Label className="text-xs uppercase tracking-wide text-muted-foreground">Time</Label>
                                <Input
                                  type="number"
                                  min={5}
                                  max={3600}
                                  value={String(rule.timeWindowSeconds)}
                                  onChange={(event) => updateSecurityRule(ruleMeta.key, {
                                    timeWindowSeconds: Math.max(5, Math.min(3600, Number(event.target.value) || DEFAULT_SECURITY_TIME_WINDOW_SECONDS)),
                                  })}
                                  data-testid={`input-security-time-${ruleMeta.key}`}
                                />
                                <p className="text-[11px] text-muted-foreground">seconds</p>
                              </div>

                              <div className="space-y-2">
                                <Label className="text-xs uppercase tracking-wide text-muted-foreground">Status</Label>
                                <Button
                                  type="button"
                                  size="icon"
                                  onClick={() => updateSecurityRule(ruleMeta.key, { enabled: !rule.enabled })}
                                  className={rule.enabled
                                    ? "h-11 w-11 bg-primary text-primary-foreground hover:bg-primary/90"
                                    : "h-11 w-11 border border-border bg-muted/40 text-muted-foreground hover:bg-muted"}
                                  data-testid={`button-security-toggle-${ruleMeta.key}`}
                                >
                                  {rule.enabled ? <CheckCircle2 className="h-5 w-5" /> : <X className="h-5 w-5" />}
                                </Button>
                              </div>
                            </div>

                            <div className="grid gap-4 xl:grid-cols-2">
                              <div className="space-y-3 rounded-lg border border-border/60 bg-background/20 p-3">
                                {renderCustomRoleSection(
                                  `Whitelisted Roles for ${ruleMeta.label}`,
                                  roles,
                                  rule.whitelistedRoleIds || [],
                                  (roleId) => toggleSecurityRuleRoleList(ruleMeta.key, roleId),
                                  `security-rule-whitelisted-roles-${ruleMeta.key}`,
                                )}
                              </div>

                              <div className="space-y-3 rounded-lg border border-border/60 bg-background/20 p-3">
                                <Label>{`Whitelisted Users for ${ruleMeta.label}`}</Label>
                                <div className="flex flex-col gap-2 sm:flex-row">
                                  <Input
                                    value={securityRuleWhitelistUserInputs[ruleMeta.key] || ""}
                                    onChange={(event) => setSecurityRuleWhitelistUserInputs((prev) => ({ ...prev, [ruleMeta.key]: event.target.value }))}
                                    placeholder="Enter a user ID"
                                    data-testid={`input-security-rule-whitelisted-user-${ruleMeta.key}`}
                                  />
                                  <Button
                                    type="button"
                                    onClick={() => addSecurityRuleWhitelistedUser(ruleMeta.key)}
                                    data-testid={`button-security-rule-whitelisted-user-add-${ruleMeta.key}`}
                                  >
                                    Add User
                                  </Button>
                                </div>

                                <div className="flex flex-wrap gap-2">
                                  {(rule.whitelistedUserIds || []).length === 0 ? (
                                    <p className="text-sm text-muted-foreground">No users are whitelisted for this rule yet.</p>
                                  ) : (
                                    (rule.whitelistedUserIds || []).map((userId) => (
                                      <Badge key={`security-rule-user-${ruleMeta.key}-${userId}`} variant="secondary" className="gap-2 pr-1">
                                        {userId}
                                        <button
                                          type="button"
                                          onClick={() => removeSecurityRuleWhitelistedUser(ruleMeta.key, userId)}
                                          className="rounded p-0.5 hover:bg-background/60"
                                          aria-label={`Remove ${userId}`}
                                        >
                                          <X className="h-3 w-3" />
                                        </button>
                                      </Badge>
                                    ))
                                  )}
                                </div>
                              </div>
                            </div>
                          </div>
                        );
                      })}
                    </CardContent>
                  </Card>

                  <div className="grid gap-4 xl:grid-cols-2">
                    <Card className="border-border/80 bg-card/90" data-testid="card-security-whitelisted-roles">
                      <CardHeader className="space-y-1">
                        <CardTitle className="text-base">WhiteListed Roles</CardTitle>
                        <CardDescription>Members with these roles are never punished by Security.</CardDescription>
                      </CardHeader>
                      <CardContent className="space-y-4">
                        {renderCustomRoleSection(
                          "Protected Roles",
                          roles,
                          securitySettings.whitelistedRoleIds,
                          (roleId) => toggleSecurityRoleList("whitelistedRoleIds", roleId),
                          "security-whitelisted-roles",
                        )}
                      </CardContent>
                    </Card>

                    <Card className="border-border/80 bg-card/90" data-testid="card-security-whitelisted-users">
                      <CardHeader className="space-y-1">
                        <CardTitle className="text-base">WhiteListed Users</CardTitle>
                        <CardDescription>Add or remove specific Discord user IDs that Security should never affect.</CardDescription>
                      </CardHeader>
                      <CardContent className="space-y-4">
                        <div className="flex flex-col gap-2 sm:flex-row">
                          <Input
                            value={securityWhitelistUserInput}
                            onChange={(event) => setSecurityWhitelistUserInput(event.target.value)}
                            placeholder="Enter a user ID"
                            data-testid="input-security-whitelisted-user"
                          />
                          <Button type="button" onClick={addSecurityWhitelistedUser} data-testid="button-security-whitelisted-user-add">
                            Add User
                          </Button>
                        </div>

                        <div className="flex flex-wrap gap-2">
                          {securitySettings.whitelistedUserIds.length === 0 ? (
                            <p className="text-sm text-muted-foreground">No users are whitelisted yet.</p>
                          ) : (
                            securitySettings.whitelistedUserIds.map((userId) => (
                              <Badge key={`security-user-${userId}`} variant="secondary" className="gap-2 pr-1">
                                {userId}
                                <button
                                  type="button"
                                  onClick={() => removeSecurityWhitelistedUser(userId)}
                                  className="rounded p-0.5 hover:bg-background/60"
                                  aria-label={`Remove ${userId}`}
                                >
                                  <X className="h-3 w-3" />
                                </button>
                              </Badge>
                            ))
                          )}
                        </div>
                      </CardContent>
                    </Card>
                  </div>
                </>
              )}
            </TabsContent>

            <TabsContent value="permissions" className="mt-0 space-y-4">
              <div>
                <h3 className="text-sm font-semibold uppercase tracking-[0.2em] text-muted-foreground">Bot Role Permissions</h3>
                <p className="mt-1 text-sm text-muted-foreground">Configure which roles can use each bot feature or prefix command.</p>
              </div>
              <Card className="border-border/80 bg-card/90">
                <CardHeader className="space-y-1">
                  <CardTitle className="text-base">Approval & Staff Roles</CardTitle>
                  <CardDescription>Roles that can approve actions, handle tickets, or access staff features.</CardDescription>
                </CardHeader>
                <CardContent className="space-y-5">
                  {renderRoleSection("Payout Approval Roles", "allowedRoleIds", "perm-tab-payout-approval-role")}
                  {renderRoleSection("Ban/Unban + Kick Approval Roles", "modRoleIds", "perm-tab-moderation-approval-role")}
                  {renderRoleSection("Modmail Staff Roles", "modmailStaffRoleIds", "perm-tab-modmail-staff-role")}
                  {renderRoleSection("Modmail Block Roles", "modmailBlockRoleIds", "perm-tab-modmail-block-role")}
                  {renderRoleSection("Modmail Claim Roles", "modmailClaimRoleIds", "perm-tab-modmail-claim-role")}
                  {renderRoleSection("Appeal Staff Roles", "appealStaffRoleIds", "perm-tab-appeal-staff-role")}
                </CardContent>
              </Card>
              <Card className="border-border/80 bg-card/90">
                <CardHeader className="space-y-1">
                  <CardTitle className="text-base">Command Access Roles</CardTitle>
                  <CardDescription>Roles that can run slash or prefix commands for specific features.</CardDescription>
                </CardHeader>
                <CardContent className="space-y-5">
                  {renderRoleSection("Activity Command Roles", "activityRoleIds", "perm-tab-activity-role")}
                  {renderRoleSection("Activity Reset Roles", "activityResetRoleIds", "perm-tab-activity-reset-role")}
                  {renderRoleSection("Snippet Roles", "snippetRoleIds", "perm-tab-snippet-role")}
                  {renderRoleSection("Message Command Roles", "messageCommandRoleIds", "perm-tab-message-command-role")}
                  {renderRoleSection("Roster Command Roles", "rosterCommandRoleIds", "perm-tab-roster-command-role")}
                  {renderRoleSection("Role Command Roles", "roleCommandRoleIds", "perm-tab-role-command-role")}
                  {renderPermissionRoleSection("Sticky Command Roles", "stickyCommandRoleIds", "perm-tab-sticky-command-role")}
                  {renderPermissionRoleSection("Role Request Command Roles", "roleRequestCommandRoleIds", "perm-tab-role-request-command-role")}
                </CardContent>
              </Card>
              <Card className="border-border/80 bg-card/90">
                <CardHeader className="space-y-1">
                  <CardTitle className="text-base">Prefix Command Roles</CardTitle>
                  <CardDescription>Roles that can use prefix-based moderation commands (ban, mute, kick, etc.).</CardDescription>
                </CardHeader>
                <CardContent className="space-y-5">
                  {renderPermissionRoleSection("Prefix Ban/Fullban/Fakeban Roles", "prefixBanRoleIds", "perm-tab-prefix-ban-role")}
                  {renderPermissionRoleSection("Prefix Mute Roles", "prefixMuteRoleIds", "perm-tab-prefix-mute-role")}
                  {renderPermissionRoleSection("Prefix Kick Roles", "prefixKickRoleIds", "perm-tab-prefix-kick-role")}
                  {renderPermissionRoleSection("Prefix Modlogs/Clean Roles", "prefixModlogsRoleIds", "perm-tab-prefix-modlogs-role")}
                  {renderPermissionRoleSection("Prefix Reason Roles", "prefixReasonRoleIds", "perm-tab-prefix-reason-role")}
                  {renderPermissionRoleSection("Prefix Retime Roles", "prefixRetimeRoleIds", "perm-tab-prefix-retime-role")}
                </CardContent>
              </Card>
            </TabsContent>

            <TabsContent value="rosters" className="mt-0 space-y-4">
              <div className="flex items-center justify-between">
                <div>
                  <h3 className="text-sm font-semibold uppercase tracking-[0.2em] text-muted-foreground">Rosters</h3>
                  <p className="mt-1 text-sm text-muted-foreground">Manage rosters and see who is on each one.</p>
                </div>
                <Button size="sm" onClick={openCreateRosterModal}>
                  <Plus className="mr-2 h-4 w-4" /> New Roster
                </Button>
              </div>

              {/* Legacy Player / Staff rosters from guild config */}
              {(config.playerRosterChannelId || config.staffRosterChannelId) && (
                <div className="space-y-2">
                  <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">Legacy Rosters</p>
                  <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
                    {config.playerRosterChannelId && (() => {
                      const ch = textChannels.find((c) => c.id === config.playerRosterChannelId);
                      return (
                        <Card className="border-border/80 bg-card/90 opacity-90">
                          <CardHeader className="pb-2">
                            <div className="flex items-center gap-2">
                              <Users className="h-4 w-4 text-muted-foreground" />
                              <CardTitle className="text-base">Player Roster</CardTitle>
                              <Badge variant="outline" className="text-xs">Legacy</Badge>
                            </div>
                            {ch && <p className="text-xs text-muted-foreground">Posted in #{ch.name}</p>}
                          </CardHeader>
                          <CardContent className="pt-0">
                            <p className="text-xs text-muted-foreground">Managed via <code>/refresh_roster</code> bot command.</p>
                          </CardContent>
                        </Card>
                      );
                    })()}
                    {config.staffRosterChannelId && (() => {
                      const ch = textChannels.find((c) => c.id === config.staffRosterChannelId);
                      return (
                        <Card className="border-border/80 bg-card/90 opacity-90">
                          <CardHeader className="pb-2">
                            <div className="flex items-center gap-2">
                              <Users className="h-4 w-4 text-muted-foreground" />
                              <CardTitle className="text-base">Staff Roster</CardTitle>
                              <Badge variant="outline" className="text-xs">Legacy</Badge>
                            </div>
                            {ch && <p className="text-xs text-muted-foreground">Posted in #{ch.name}</p>}
                          </CardHeader>
                          <CardContent className="pt-0">
                            <p className="text-xs text-muted-foreground">Managed via <code>/refresh_roster</code> bot command.</p>
                          </CardContent>
                        </Card>
                      );
                    })()}
                  </div>
                </div>
              )}

              <div className="space-y-3">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">Roster Embeds</p>
                    <p className="text-sm text-muted-foreground">Create shared embed panels that link multiple rosters with buttons.</p>
                  </div>
                  <Button size="sm" variant="outline" onClick={openCreateRosterEmbedModal}>
                    <Plus className="mr-2 h-4 w-4" /> New Roster Embed
                  </Button>
                </div>

                {rosterEmbeds.length === 0 ? (
                  <Card className="border-border/80 bg-card/90">
                    <CardContent className="py-6 text-sm text-muted-foreground">
                      No roster embeds yet. Create one to send a single embed with buttons for multiple rosters.
                    </CardContent>
                  </Card>
                ) : (
                  <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
                    {rosterEmbeds.map((rosterEmbed) => {
                      const embedChannel = textChannels.find((channel) => channel.id === rosterEmbed.channelId);
                      const isPostingEmbed = postingRosterEmbedId === rosterEmbed.id;
                      return (
                        <Card key={rosterEmbed.id} className="border-border/80 bg-card/90">
                          <CardHeader className="pb-3">
                            <div className="flex items-start justify-between gap-2">
                              <div>
                                <CardTitle className="text-base">{rosterEmbed.name}</CardTitle>
                                <p className="mt-1 text-xs text-muted-foreground">{rosterEmbed.buttons.length} button(s)</p>
                              </div>
                              <div className="flex gap-1 shrink-0">
                                <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => openEditRosterEmbedModal(rosterEmbed)}>
                                  <Pencil className="h-3.5 w-3.5" />
                                </Button>
                                {rosterEmbedDeleteConfirm === rosterEmbed.id ? (
                                  <>
                                    <Button variant="destructive" size="icon" className="h-7 w-7" onClick={() => deleteRosterEmbed(rosterEmbed.id)}>
                                      <Trash2 className="h-3.5 w-3.5" />
                                    </Button>
                                    <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => setRosterEmbedDeleteConfirm(null)}>
                                      <X className="h-3.5 w-3.5" />
                                    </Button>
                                  </>
                                ) : (
                                  <Button variant="ghost" size="icon" className="h-7 w-7 text-destructive hover:text-destructive" onClick={() => setRosterEmbedDeleteConfirm(rosterEmbed.id)}>
                                    <Trash2 className="h-3.5 w-3.5" />
                                  </Button>
                                )}
                              </div>
                            </div>
                            <p className="text-xs text-muted-foreground">{embedChannel ? `Channel: #${embedChannel.name}` : "No channel set"}{rosterEmbed.messageId ? " • posted" : ""}</p>
                          </CardHeader>
                          <CardContent className="space-y-3 pt-0">
                            <p className="line-clamp-2 text-sm text-muted-foreground">{rosterEmbed.description}</p>
                            <div className="flex flex-wrap gap-1.5">
                              {rosterEmbed.buttons.map((button, index) => (
                                <Badge key={`${rosterEmbed.id}-${index}`} variant="outline">{button.label}</Badge>
                              ))}
                            </div>
                            <Button className="w-full" size="sm" variant="outline" disabled={isPostingEmbed} onClick={() => postRosterEmbed(rosterEmbed.id)}>
                              {isPostingEmbed ? "Posting Embed…" : rosterEmbed.messageId ? "Refresh Roster Embed" : "Post Roster Embed"}
                            </Button>
                          </CardContent>
                        </Card>
                      );
                    })}
                  </div>
                )}
              </div>

              {rostersLoading ? (
                <div className="flex items-center justify-center py-16 text-muted-foreground">
                  <span>Loading rosters…</span>
                </div>
              ) : rosters.length === 0 ? (
                <Card className="border-border/80 bg-card/90">
                  <CardContent className="flex flex-col items-center justify-center py-16 text-center">
                    <Users className="mb-3 h-10 w-10 text-muted-foreground" />
                    <p className="text-muted-foreground">No custom rosters yet. Create one to get started.</p>
                    <Button className="mt-4" onClick={openCreateRosterModal}>
                      <Plus className="mr-2 h-4 w-4" /> New Roster
                    </Button>
                  </CardContent>
                </Card>
              ) : (
                <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
                  {rosters.map((roster) => {
                    const rosterRoles = roles.filter((r) => roster.roleIds.includes(r.id));
                    const postedChannel = textChannels.find((ch) => ch.id === roster.channelId);
                    const isPosting = postingRosterId === roster.name;
                    return (
                      <Card key={roster.id} className="border-border/80 bg-card/90">
                        <CardHeader className="pb-3">
                          <div className="flex items-start justify-between gap-2">
                            <div className="flex items-center gap-2">
                              <Users className="h-4 w-4 text-muted-foreground shrink-0" />
                              <CardTitle className="text-base">{roster.name}</CardTitle>
                            </div>
                            <div className="flex gap-1 shrink-0">
                              <Button
                                variant="ghost"
                                size="icon"
                                className="h-7 w-7"
                                onClick={() => openEditRosterModal(roster)}
                                title="Edit roster"
                              >
                                <Pencil className="h-3.5 w-3.5" />
                              </Button>
                              {rosterDeleteConfirm === roster.name ? (
                                <>
                                  <Button
                                    variant="destructive"
                                    size="icon"
                                    className="h-7 w-7"
                                    onClick={() => deleteRoster(roster.name)}
                                    title="Confirm delete"
                                  >
                                    <Trash2 className="h-3.5 w-3.5" />
                                  </Button>
                                  <Button
                                    variant="ghost"
                                    size="icon"
                                    className="h-7 w-7"
                                    onClick={() => setRosterDeleteConfirm(null)}
                                    title="Cancel"
                                  >
                                    <X className="h-3.5 w-3.5" />
                                  </Button>
                                </>
                              ) : (
                                <Button
                                  variant="ghost"
                                  size="icon"
                                  className="h-7 w-7 text-destructive hover:text-destructive"
                                  onClick={() => setRosterDeleteConfirm(roster.name)}
                                  title="Delete roster"
                                >
                                  <Trash2 className="h-3.5 w-3.5" />
                                </Button>
                              )}
                            </div>
                          </div>
                          {postedChannel ? (
                            <p className="text-xs text-muted-foreground ml-6">Channel: #{postedChannel.name}{roster.messageId ? " • posted" : ""}</p>
                          ) : (
                            <p className="text-xs text-muted-foreground/60 ml-6 italic">No channel set — edit to add one</p>
                          )}
                        </CardHeader>
                        <CardContent className="pt-0 space-y-3">
                          {rosterRoles.length === 0 ? (
                            <p className="text-sm text-muted-foreground italic">No roles assigned.</p>
                          ) : (
                            <div className="flex flex-wrap gap-1.5">
                              {rosterRoles.map((role) => (
                                <Badge
                                  key={role.id}
                                  variant="outline"
                                  style={{
                                    borderColor: role.color !== "#000000" ? role.color : undefined,
                                    color: role.color !== "#000000" ? role.color : undefined,
                                  }}
                                >
                                  {role.name}
                                </Badge>
                              ))}
                            </div>
                          )}
                          <Button
                            size="sm"
                            variant="outline"
                            className="w-full"
                            disabled={!roster.channelId || isPosting}
                            onClick={() => postRoster(roster.name)}
                            title={roster.channelId ? "Post or refresh this roster in Discord" : "Edit the roster and set a channel first"}
                          >
                            {isPosting ? "Posting…" : roster.messageId ? "Refresh Roster" : "Post Roster"}
                          </Button>
                        </CardContent>
                      </Card>
                    );
                  })}
                </div>
              )}
            </TabsContent>

            <TabsContent value="modmail" className="mt-0 space-y-4">
              <div>
                <h3 className="text-sm font-semibold uppercase tracking-[0.2em] text-muted-foreground">Modmail Logs</h3>
                <p className="mt-1 text-sm text-muted-foreground">View modmail transcripts, messages, and access full conversation history.</p>
              </div>

              <Card className="border-border/80 bg-card/90">
                <CardHeader>
                  <CardTitle className="text-base">Filters</CardTitle>
                </CardHeader>
                <CardContent className="space-y-4">
                  <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
                    <div>
                      <Label className="text-xs">Status</Label>
                      <Select value={modmailStatusFilter} onValueChange={(val) => setModmailStatusFilter(val as "all" | "open" | "closed")}>
                        <SelectTrigger className="mt-1 h-9">
                          <SelectValue placeholder="Filter by status" />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="all">All</SelectItem>
                          <SelectItem value="open">Open</SelectItem>
                          <SelectItem value="closed">Closed</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>

                    <div>
                      <Label className="text-xs">Category</Label>
                      <Select value={modmailCategoryFilter} onValueChange={setModmailCategoryFilter}>
                        <SelectTrigger className="mt-1 h-9">
                          <SelectValue placeholder="Filter by category" />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="all">All</SelectItem>
                          <SelectItem value="modmail">Modmail</SelectItem>
                          <SelectItem value="appeal">Appeal</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>

                    <div>
                      <Label className="text-xs">User ID</Label>
                      <Input
                        placeholder="Filter by user ID"
                        value={modmailUserIdFilter}
                        onChange={(e) => setModmailUserIdFilter(e.target.value)}
                        className="mt-1 h-9"
                      />
                    </div>

                    <div>
                      <Label className="text-xs">Search Messages</Label>
                      <Input
                        placeholder="Search transcripts"
                        value={modmailSearchQuery}
                        onChange={(e) => setModmailSearchQuery(e.target.value.toLowerCase())}
                        className="mt-1 h-9"
                      />
                    </div>
                  </div>

                  <div className="grid gap-3 sm:grid-cols-2">
                    <div>
                      <Label className="text-xs">From Date</Label>
                      <Input
                        type="date"
                        value={modmailFromDate}
                        onChange={(e) => setModmailFromDate(e.target.value)}
                        className="mt-1 h-9"
                      />
                    </div>
                    <div>
                      <Label className="text-xs">To Date</Label>
                      <Input
                        type="date"
                        value={modmailToDate}
                        onChange={(e) => setModmailToDate(e.target.value)}
                        className="mt-1 h-9"
                      />
                    </div>
                  </div>
                </CardContent>
              </Card>

              <div className="grid gap-4 lg:grid-cols-[300px_minmax(0,1fr)]">
                <Card className="border-border/80 bg-card/90 lg:max-h-[600px] lg:overflow-y-auto">
                  <CardHeader>
                    <CardTitle className="text-sm">Threads ({modmailThreads.length})</CardTitle>
                  </CardHeader>
                  <CardContent>
                    {modmailLoading ? (
                      <div className="flex justify-center py-4">
                        <div className="text-sm text-muted-foreground">Loading...</div>
                      </div>
                    ) : modmailThreads.length === 0 ? (
                      <div className="text-sm text-muted-foreground">No modmail threads found</div>
                    ) : (
                      <div className="space-y-2">
                        {modmailThreads.map((thread) => (
                          <button
                            key={thread.id}
                            onClick={() => setModmailSelectedThreadId(thread.id)}
                            className={`w-full rounded-lg border p-3 text-left transition-all ${
                              modmailSelectedThreadId === thread.id
                                ? "border-primary/50 bg-primary/10"
                                : "border-border/50 hover:border-border/80 hover:bg-secondary/50"
                            }`}
                          >
                            <div className="flex items-center gap-2">
                              <img
                                src={thread.avatarUrl || "https://via.placeholder.com/32"}
                                alt={thread.username}
                                className="h-8 w-8 rounded-full"
                              />
                              <div className="min-w-0 flex-1">
                                <p className="truncate text-xs font-medium">{thread.username}</p>
                                <p className="truncate text-xs text-muted-foreground">
                                  {thread.messageCount} message{thread.messageCount !== 1 ? "s" : ""}
                                </p>
                              </div>
                            </div>
                            <div className="mt-2 flex items-center justify-between gap-2">
                              <Badge
                                variant="outline"
                                className={`text-xs ${
                                  thread.status === "open"
                                    ? "border-green-500/30 bg-green-500/10 text-green-600 dark:text-green-400"
                                    : "border-gray-500/30 bg-gray-500/10 text-gray-600 dark:text-gray-400"
                                }`}
                              >
                                {thread.status}
                              </Badge>
                              <span className="text-xs text-muted-foreground">
                                {new Date(thread.createdAt).toLocaleDateString()}
                              </span>
                            </div>
                          </button>
                        ))}
                      </div>
                    )}
                  </CardContent>
                </Card>

                {modmailSelectedThreadId && modmailThreads.find((t) => t.id === modmailSelectedThreadId) ? (
                  (() => {
                    const selectedThread = modmailThreads.find((t) => t.id === modmailSelectedThreadId)!;
                    const filteredMessages = modmailSearchQuery
                      ? selectedThread.messages.filter((msg) =>
                          msg.content.toLowerCase().includes(modmailSearchQuery)
                        )
                      : selectedThread.messages;

                    return (
                      <Card className="border-border/80 bg-card/90">
                        <CardHeader>
                          <div className="flex items-center justify-between gap-4">
                            <div>
                              <CardTitle className="text-base">{selectedThread.username}'s Conversation</CardTitle>
                              <CardDescription className="mt-1">
                                {selectedThread.messageCount} total messages
                                {selectedThread.claimedByUsername && ` • Claimed by ${selectedThread.claimedByUsername}`}
                              </CardDescription>
                            </div>
                            <Button
                              variant="outline"
                              size="sm"
                              onClick={() => {
                                const transcript = selectedThread.messages
                                  .map((msg) =>
                                    `[${new Date(msg.createdAt).toLocaleString()}] ${msg.isStaff ? "[STAFF]" : "[USER]"} ${msg.content}`
                                  )
                                  .join("\n\n");
                                const element = document.createElement("a");
                                element.setAttribute(
                                  "href",
                                  `data:text/plain;charset=utf-8,${encodeURIComponent(transcript)}`
                                );
                                element.setAttribute("download", `modmail-${selectedThread.id}.txt`);
                                element.style.display = "none";
                                document.body.appendChild(element);
                                element.click();
                                document.body.removeChild(element);
                                toast({ title: "Downloaded", description: "Transcript downloaded successfully." });
                              }}
                            >
                              Download Transcript
                            </Button>
                          </div>
                        </CardHeader>
                        <CardContent>
                          <div className="space-y-4">
                            <div className="rounded-lg border border-border/50 bg-secondary/30 p-3">
                              <div className="grid gap-2 text-sm">
                                <div>
                                  <span className="text-muted-foreground">Status:</span>{" "}
                                  <Badge
                                    variant="outline"
                                    className={`ml-2 text-xs ${
                                      selectedThread.status === "open"
                                        ? "border-green-500/30 bg-green-500/10 text-green-600 dark:text-green-400"
                                        : "border-gray-500/30 bg-gray-500/10 text-gray-600 dark:text-gray-400"
                                    }`}
                                  >
                                    {selectedThread.status}
                                  </Badge>
                                </div>
                                <div>
                                  <span className="text-muted-foreground">Category:</span>{" "}
                                  <span className="ml-2 font-medium">{selectedThread.category}</span>
                                </div>
                                <div>
                                  <span className="text-muted-foreground">Created:</span>{" "}
                                  <span className="ml-2 text-xs">{new Date(selectedThread.createdAt).toLocaleString()}</span>
                                </div>
                                {selectedThread.closedAt && (
                                  <div>
                                    <span className="text-muted-foreground">Closed:</span>{" "}
                                    <span className="ml-2 text-xs">{new Date(selectedThread.closedAt).toLocaleString()}</span>
                                  </div>
                                )}
                                {selectedThread.closeReason && (
                                  <div>
                                    <span className="text-muted-foreground">Close Reason:</span>{" "}
                                    <span className="ml-2 text-xs">{selectedThread.closeReason}</span>
                                  </div>
                                )}
                              </div>
                            </div>

                            <div className="max-h-[400px] space-y-3 overflow-y-auto rounded-lg border border-border/50 bg-secondary/10 p-4">
                              {filteredMessages.length === 0 ? (
                                <div className="flex justify-center py-8">
                                  <p className="text-sm text-muted-foreground">
                                    {modmailSearchQuery ? "No matching messages" : "No messages"}
                                  </p>
                                </div>
                              ) : (
                                filteredMessages.map((msg) => (
                                  <div
                                    key={msg.id}
                                    className={`rounded-lg p-3 ${
                                      msg.isStaff
                                        ? "border-l-2 border-blue-500 bg-blue-500/5"
                                        : "border-l-2 border-green-500 bg-green-500/5"
                                    }`}
                                  >
                                    <div className="flex items-center justify-between gap-2">
                                      <div className="flex items-center gap-2">
                                        <Badge
                                          variant="outline"
                                          className={`text-xs ${
                                            msg.isStaff
                                              ? "border-blue-500/30 bg-blue-500/10 text-blue-600 dark:text-blue-400"
                                              : "border-green-500/30 bg-green-500/10 text-green-600 dark:text-green-400"
                                          }`}
                                        >
                                          {msg.isStaff ? "STAFF" : "USER"}
                                        </Badge>
                                      </div>
                                      <span className="text-xs text-muted-foreground">
                                        {new Date(msg.createdAt).toLocaleString()}
                                      </span>
                                    </div>
                                    <p className="mt-2 break-words text-sm">{msg.content}</p>
                                  </div>
                                ))
                              )}
                            </div>
                          </div>
                        </CardContent>
                      </Card>
                    );
                  })()
                ) : (
                  <Card className="border-border/80 bg-card/90">
                    <CardContent className="flex items-center justify-center py-16">
                      <p className="text-muted-foreground">Select a thread to view conversation</p>
                    </CardContent>
                  </Card>
                )}
              </div>
            </TabsContent>

            <TabsContent value="miscellaneous" className="mt-0 space-y-4">
              <div>
                <h3 className="text-sm font-semibold uppercase tracking-[0.2em] text-muted-foreground">Miscellaneous</h3>
                <p className="mt-1 text-sm text-muted-foreground">Manage role sync, review banned members, control blocked users, and inspect recent server activity.</p>
              </div>

              <Card className="border-border/80 bg-card/90">
                <CardHeader className="space-y-1">
                  <CardTitle className="text-base">Role Sync</CardTitle>
                  <CardDescription>
                    One way keeps the source server authoritative. If the role is manually given in the target server, it gets removed unless the member has the source role.
                  </CardDescription>
                </CardHeader>
                <CardContent className="space-y-4">
                  <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-5">
                    <div className="space-y-2">
                      <Label>Mode</Label>
                      <Select value={roleSyncDirection} onValueChange={(value) => setRoleSyncDirection(value as "one-way" | "two-way")}>
                        <SelectTrigger>
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="one-way">One way</SelectItem>
                          <SelectItem value="two-way">Two way</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>

                    <div className="space-y-2">
                      <Label>Source Server</Label>
                      <Select value={roleSyncSourceGuildId} onValueChange={(value) => { setRoleSyncSourceGuildId(value); setRoleSyncSourceRoleId(""); setRoleSyncSourceRoleSearch(""); }}>
                        <SelectTrigger>
                          <SelectValue placeholder="Select source server" />
                        </SelectTrigger>
                        <SelectContent>
                          {guilds.map((guild) => (
                            <SelectItem key={`role-sync-source-${guild.id}`} value={guild.id}>{guild.name}</SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>

                    <div className="space-y-2">
                      <Label>Source Role</Label>
                      <DropdownMenu>
                        <DropdownMenuTrigger asChild>
                          <Button variant="outline" className="w-full justify-between">
                            <span className="truncate text-left">
                              {roleSyncSourceRoleId
                                ? (roleSyncSourceRoles.find((r) => r.id === roleSyncSourceRoleId)?.name || roleSyncSourceRoleId)
                                : "Select source role"}
                            </span>
                            <ChevronDown className="h-4 w-4 opacity-70" />
                          </Button>
                        </DropdownMenuTrigger>
                        <DropdownMenuContent className="max-h-80 w-72 overflow-y-auto">
                          <div className="px-1 pb-2">
                            <Input
                              ref={setDropdownSearchInputRef("role-sync-source-search")}
                              autoFocus
                              value={roleSyncSourceRoleSearch}
                              onChange={(e) => setRoleSyncSourceRoleSearch(e.target.value)}
                              onKeyDownCapture={stopDropdownSearchKeyPropagation}
                              onKeyDown={stopDropdownSearchKeyPropagation}
                              placeholder="Search roles…"
                              className="h-8"
                            />
                          </div>
                          {filterNamedItems(roleSyncSourceRoles, roleSyncSourceRoleSearch).map((role) => (
                            <DropdownMenuCheckboxItem
                              key={`role-sync-source-role-${role.id}`}
                              checked={roleSyncSourceRoleId === role.id}
                              onCheckedChange={() => setRoleSyncSourceRoleId(role.id)}
                              onSelect={(e) => e.preventDefault()}
                            >
                              {role.name}
                            </DropdownMenuCheckboxItem>
                          ))}
                          {filterNamedItems(roleSyncSourceRoles, roleSyncSourceRoleSearch).length === 0 && (
                            <p className="px-2 py-1 text-xs text-muted-foreground">No roles found.</p>
                          )}
                        </DropdownMenuContent>
                      </DropdownMenu>
                    </div>

                    <div className="space-y-2">
                      <Label>Target Server</Label>
                      <Select value={roleSyncTargetGuildId} onValueChange={(value) => { setRoleSyncTargetGuildId(value); setRoleSyncTargetRoleId(""); setRoleSyncTargetRoleSearch(""); }}>
                        <SelectTrigger>
                          <SelectValue placeholder="Select target server" />
                        </SelectTrigger>
                        <SelectContent>
                          {guilds.map((guild) => (
                            <SelectItem key={`role-sync-target-${guild.id}`} value={guild.id}>{guild.name}</SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>

                    <div className="space-y-2">
                      <Label>Target Role</Label>
                      <DropdownMenu>
                        <DropdownMenuTrigger asChild>
                          <Button variant="outline" className="w-full justify-between">
                            <span className="truncate text-left">
                              {roleSyncTargetRoleId
                                ? (roleSyncTargetRoles.find((r) => r.id === roleSyncTargetRoleId)?.name || roleSyncTargetRoleId)
                                : "Select target role"}
                            </span>
                            <ChevronDown className="h-4 w-4 opacity-70" />
                          </Button>
                        </DropdownMenuTrigger>
                        <DropdownMenuContent className="max-h-80 w-72 overflow-y-auto">
                          <div className="px-1 pb-2">
                            <Input
                              ref={setDropdownSearchInputRef("role-sync-target-search")}
                              autoFocus
                              value={roleSyncTargetRoleSearch}
                              onChange={(e) => setRoleSyncTargetRoleSearch(e.target.value)}
                              onKeyDownCapture={stopDropdownSearchKeyPropagation}
                              onKeyDown={stopDropdownSearchKeyPropagation}
                              placeholder="Search roles…"
                              className="h-8"
                            />
                          </div>
                          {filterNamedItems(roleSyncTargetRoles, roleSyncTargetRoleSearch).map((role) => (
                            <DropdownMenuCheckboxItem
                              key={`role-sync-target-role-${role.id}`}
                              checked={roleSyncTargetRoleId === role.id}
                              onCheckedChange={() => setRoleSyncTargetRoleId(role.id)}
                              onSelect={(e) => e.preventDefault()}
                            >
                              {role.name}
                            </DropdownMenuCheckboxItem>
                          ))}
                          {filterNamedItems(roleSyncTargetRoles, roleSyncTargetRoleSearch).length === 0 && (
                            <p className="px-2 py-1 text-xs text-muted-foreground">No roles found.</p>
                          )}
                        </DropdownMenuContent>
                      </DropdownMenu>
                    </div>
                  </div>

                  <Button onClick={createRoleSync} disabled={roleSyncSaving}>
                    {roleSyncSaving ? "Creating…" : "Create Role Sync"}
                  </Button>

                  {roleSyncLoading ? (
                    <p className="text-sm text-muted-foreground">Loading role syncs…</p>
                  ) : roleSyncs.length === 0 ? (
                    <p className="text-sm text-muted-foreground">No role sync pairs yet.</p>
                  ) : (
                    <div className="grid gap-4 md:grid-cols-2">
                      {roleSyncs.map((syncItem) => (
                        <Card key={syncItem.id} className="border-border/70 bg-card/50 overflow-hidden">
                          <CardContent className="p-4">
                            <div className="flex items-center gap-3">
                              {/* Source */}
                              <div className="flex min-w-0 flex-1 flex-col items-center text-center">
                                <p className="mb-2 text-xs uppercase tracking-wide text-muted-foreground">Source</p>
                                {syncItem.sourceGuildIcon ? (
                                  <img src={syncItem.sourceGuildIcon} alt={syncItem.sourceGuildName} className="mb-2 h-12 w-12 rounded-full object-cover" />
                                ) : (
                                  <div className="mb-2 flex h-12 w-12 items-center justify-center rounded-full bg-muted text-xs font-semibold">
                                    {syncItem.sourceGuildName.slice(0, 2).toUpperCase()}
                                  </div>
                                )}
                                <p className="w-full break-words text-xs font-medium leading-tight">{syncItem.sourceGuildName}</p>
                                <span
                                  className="mt-1.5 inline-block max-w-full truncate rounded border px-1.5 py-0.5 text-xs"
                                  style={{
                                    borderColor: syncItem.sourceRoleColor && syncItem.sourceRoleColor !== "#000000" ? syncItem.sourceRoleColor : undefined,
                                    color: syncItem.sourceRoleColor && syncItem.sourceRoleColor !== "#000000" ? syncItem.sourceRoleColor : undefined,
                                  }}
                                  title={resolveRoleSyncRoleDisplay(syncItem.sourceGuildId, syncItem.sourceRoleId, syncItem.sourceRoleName)}
                                >
                                  {resolveRoleSyncRoleDisplay(syncItem.sourceGuildId, syncItem.sourceRoleId, syncItem.sourceRoleName)}
                                </span>
                              </div>

                              {/* Arrow */}
                              <div className="shrink-0 text-center">
                                <div className="text-lg">{syncItem.direction === "two-way" ? "⇄" : "→"}</div>
                                <p className="mt-1 text-xs font-semibold text-muted-foreground">{syncItem.direction === "two-way" ? "Two way" : "One way"}</p>
                              </div>

                              {/* Target */}
                              <div className="flex min-w-0 flex-1 flex-col items-center text-center">
                                <p className="mb-2 text-xs uppercase tracking-wide text-muted-foreground">Target</p>
                                {syncItem.targetGuildIcon ? (
                                  <img src={syncItem.targetGuildIcon} alt={syncItem.targetGuildName} className="mb-2 h-12 w-12 rounded-full object-cover" />
                                ) : (
                                  <div className="mb-2 flex h-12 w-12 items-center justify-center rounded-full bg-muted text-xs font-semibold">
                                    {syncItem.targetGuildName.slice(0, 2).toUpperCase()}
                                  </div>
                                )}
                                <p className="w-full break-words text-xs font-medium leading-tight">{syncItem.targetGuildName}</p>
                                <span
                                  className="mt-1.5 inline-block max-w-full truncate rounded border px-1.5 py-0.5 text-xs"
                                  style={{
                                    borderColor: syncItem.targetRoleColor && syncItem.targetRoleColor !== "#000000" ? syncItem.targetRoleColor : undefined,
                                    color: syncItem.targetRoleColor && syncItem.targetRoleColor !== "#000000" ? syncItem.targetRoleColor : undefined,
                                  }}
                                  title={resolveRoleSyncRoleDisplay(syncItem.targetGuildId, syncItem.targetRoleId, syncItem.targetRoleName)}
                                >
                                  {resolveRoleSyncRoleDisplay(syncItem.targetGuildId, syncItem.targetRoleId, syncItem.targetRoleName)}
                                </span>
                              </div>
                            </div>
                          </CardContent>
                          <Button variant="destructive" className="w-full rounded-none" onClick={() => deleteRoleSync(syncItem.id)} disabled={deletingRoleSyncId === syncItem.id}>
                            {deletingRoleSyncId === syncItem.id ? "Deleting…" : "Delete"}
                          </Button>
                        </Card>
                      ))}
                    </div>
                  )}
                </CardContent>
              </Card>

              <div className="space-y-4">
                <Card className="border-border/80 bg-card/90">
                  <CardHeader className="flex flex-row items-start justify-between space-y-0 gap-3">
                    <div className="space-y-1">
                      <CardTitle className="text-base">Banned Members</CardTitle>
                      <CardDescription>All users currently banned in the selected server.</CardDescription>
                    </div>
                    <div className="flex flex-wrap items-center gap-2">
                      <Button variant="destructive" size="sm" onClick={unbanAllUsers} disabled={miscOverviewLoading || unbanningAllBans || miscBans.length === 0}>
                        {unbanningAllBans ? "Unbanning All…" : "Unban All"}
                      </Button>
                      <Button variant="outline" size="sm" onClick={() => loadMiscOverview()} disabled={miscOverviewLoading || unbanningAllBans}>
                        {miscOverviewLoading ? "Refreshing…" : "Refresh"}
                      </Button>
                    </div>
                  </CardHeader>
                  <CardContent>
                    {miscOverviewError && (
                      <p className="mb-3 text-xs text-muted-foreground">{miscOverviewError}</p>
                    )}

                    {miscOverviewLoading ? (
                      <p className="text-sm text-muted-foreground">Loading banned members…</p>
                    ) : miscOverviewError ? (
                      <p className="text-sm text-muted-foreground">Start the bot to load the live ban list for this server.</p>
                    ) : miscBans.length === 0 ? (
                      <p className="text-sm text-muted-foreground">No banned members found for this server.</p>
                    ) : (
                      <div className="max-h-[420px] space-y-2 overflow-y-auto pr-1">
                        {miscBans.map((ban) => (
                          <div key={ban.userId} className="flex items-start justify-between gap-3 rounded-md border border-border/60 bg-muted/20 px-3 py-2">
                            <div className="flex min-w-0 flex-1 items-start gap-3">
                              {ban.avatarUrl ? (
                                <img src={ban.avatarUrl} alt={ban.username} className="h-9 w-9 rounded-full object-cover" />
                              ) : (
                                <div className="flex h-9 w-9 items-center justify-center rounded-full bg-muted text-xs font-semibold">
                                  {ban.username.slice(0, 2).toUpperCase()}
                                </div>
                              )}
                              <div className="min-w-0 flex-1">
                                <p className="truncate text-sm font-medium">{ban.username}</p>
                                <p className="text-[11px] text-muted-foreground">ID: {ban.userId}</p>
                                <p className="mt-1 text-xs text-muted-foreground">{ban.reason || "No ban reason provided."}</p>
                              </div>
                            </div>
                            <Button
                              size="sm"
                              variant="destructive"
                              className="shrink-0"
                              disabled={unbanningAllBans || unbanningUserId === ban.userId}
                              onClick={() => unbanUser(ban.userId, ban.username)}
                            >
                              {unbanningUserId === ban.userId ? "Unbanning…" : "Unban"}
                            </Button>
                          </div>
                        ))}
                      </div>
                    )}
                  </CardContent>
                </Card>

                <Card className="border-border/80 bg-card/90">
                  <CardHeader className="space-y-1">
                    <CardTitle className="text-base">Blacklisted Users</CardTitle>
                    <CardDescription>Any user listed here will be re-banned instantly until you remove them from the website blacklist.</CardDescription>
                  </CardHeader>
                  <CardContent className="space-y-5">
                    {!viewerHasBlacklistAccess && (
                      <p className="text-xs text-muted-foreground">Only the owner-approved roles or user IDs can edit this server blacklist.</p>
                    )}
                    <div className="grid gap-4 md:grid-cols-2">
                      <div className="space-y-2">
                        <Label>User ID</Label>
                        <Input
                          value={miscBlacklistUserIdInput}
                          onChange={(event) => setMiscBlacklistUserIdInput(event.target.value)}
                          placeholder="123456789012345678"
                          disabled={!viewerHasBlacklistAccess}
                          data-testid="input-misc-blacklist-user-id"
                        />
                      </div>
                      <div className="space-y-2">
                        <Label>Reason</Label>
                        <Input
                          value={miscBlacklistReason}
                          onChange={(event) => setMiscBlacklistReason(event.target.value)}
                          placeholder="Chargeback / alt account / ban evasion"
                          disabled={!viewerHasBlacklistAccess}
                          data-testid="input-misc-blacklist-reason"
                        />
                      </div>
                    </div>

                    <div className="flex flex-wrap gap-2">
                      <Button onClick={blacklistMiscUser} disabled={!viewerHasBlacklistAccess || blacklistingMiscUser || miscOverviewLoading} data-testid="button-misc-blacklist-user">
                        {blacklistingMiscUser ? "Blacklisting…" : "Blacklist User"}
                      </Button>
                      <Button
                        variant="outline"
                        onClick={() => unblacklistMiscUser(miscBlacklistUserIdInput.trim())}
                        disabled={!viewerHasBlacklistAccess || blacklistingMiscUser || miscOverviewLoading || !miscBlacklistUserIdInput.trim()}
                        data-testid="button-misc-unblacklist-user-id"
                      >
                        Remove from Blacklist
                      </Button>
                    </div>

                    {miscOverviewLoading ? (
                      <p className="text-sm text-muted-foreground">Loading blacklisted users…</p>
                    ) : miscBlacklistedUsers.length === 0 ? (
                      <p className="text-sm text-muted-foreground">No users are currently on the instant re-ban blacklist.</p>
                    ) : (
                      <div className="space-y-2">
                        {miscBlacklistedUsers.map((entry) => (
                          <div key={`misc-blacklist-${entry.userId}`} className="flex items-start justify-between gap-3 rounded-md border border-border/60 bg-muted/20 px-3 py-3">
                            <div className="flex min-w-0 flex-1 items-start gap-3">
                              {entry.avatarUrl ? (
                                <img src={entry.avatarUrl} alt={entry.username} className="h-9 w-9 rounded-full object-cover" />
                              ) : (
                                <div className="flex h-9 w-9 items-center justify-center rounded-full bg-muted text-xs font-semibold">
                                  {entry.username.slice(0, 2).toUpperCase()}
                                </div>
                              )}
                              <div className="min-w-0 flex-1 text-sm">
                                <p className="truncate font-medium">{entry.username}</p>
                                <p className="text-[11px] text-muted-foreground">User ID: {entry.userId}</p>
                                <p className="mt-1 text-xs text-muted-foreground">
                                  <span className="font-medium text-foreground">Blacklisted by:</span>{" "}
                                  {entry.blacklistedByUsername || entry.blacklistedById || "Unknown user"}
                                  {entry.blacklistedById ? ` (${entry.blacklistedById})` : ""}
                                </p>
                                {entry.createdAt && (
                                  <p className="text-xs text-muted-foreground">
                                    <span className="font-medium text-foreground">Added:</span>{" "}
                                    {new Date(entry.createdAt).toLocaleString()}
                                  </p>
                                )}
                                <p className="mt-1 text-xs text-muted-foreground">
                                  <span className="font-medium text-foreground">Reason:</span>{" "}
                                  {entry.reason || "No reason provided."}
                                </p>
                              </div>
                            </div>
                            <Button
                              size="sm"
                              variant="destructive"
                              className="shrink-0"
                              disabled={!viewerHasBlacklistAccess || unblacklistingMiscUserId === entry.userId}
                              onClick={() => unblacklistMiscUser(entry.userId, entry.username)}
                            >
                              {unblacklistingMiscUserId === entry.userId ? "Removing…" : "Remove"}
                            </Button>
                          </div>
                        ))}
                      </div>
                    )}
                  </CardContent>
                </Card>

                <Card className="border-border/80 bg-card/90">
                  <CardHeader className="space-y-1">
                    <CardTitle className="text-base">Blocked Users</CardTitle>
                    <CardDescription>Manage active blocks for Staff Applications, Modmails, and Appeals.</CardDescription>
                  </CardHeader>
                  <CardContent className="space-y-5">
                    <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
                      <div className="space-y-2 xl:col-span-1">
                        <Label>User ID</Label>
                        <Input
                          value={miscBlockUserIdInput}
                          onChange={(event) => setMiscBlockUserIdInput(event.target.value)}
                          placeholder="123456789012345678"
                          data-testid="input-misc-block-user-id"
                        />
                      </div>
                      <div className="space-y-2">
                        <Label>Section</Label>
                        <Select value={miscBlockSystem} onValueChange={(value) => setMiscBlockSystem(value as MiscBlockSystem)}>
                          <SelectTrigger data-testid="select-misc-block-system">
                            <SelectValue placeholder="Choose section" />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="staff_applications">Staff Applications</SelectItem>
                            <SelectItem value="modmail">Modmails</SelectItem>
                            <SelectItem value="appeal">Appeals</SelectItem>
                          </SelectContent>
                        </Select>
                      </div>
                      <div className="space-y-2">
                        <Label>Duration</Label>
                        <Input
                          type="number"
                          min="1"
                          value={miscBlockDurationUnit === "permanent" ? "" : miscBlockDurationValue}
                          onChange={(event) => setMiscBlockDurationValue(event.target.value)}
                          placeholder={miscBlockDurationUnit === "permanent" ? "Permanent" : "1"}
                          disabled={miscBlockDurationUnit === "permanent"}
                          data-testid="input-misc-block-duration"
                        />
                      </div>
                      <div className="space-y-2">
                        <Label>Duration Unit</Label>
                        <Select value={miscBlockDurationUnit} onValueChange={(value) => setMiscBlockDurationUnit(value as "minutes" | "hours" | "days" | "weeks" | "permanent")}>
                          <SelectTrigger data-testid="select-misc-block-duration-unit">
                            <SelectValue placeholder="Select duration" />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="minutes">Minutes</SelectItem>
                            <SelectItem value="hours">Hours</SelectItem>
                            <SelectItem value="days">Days</SelectItem>
                            <SelectItem value="weeks">Weeks</SelectItem>
                            <SelectItem value="permanent">Permanent</SelectItem>
                          </SelectContent>
                        </Select>
                      </div>
                    </div>

                    <div className="space-y-2">
                      <Label>Reason</Label>
                      <Textarea
                        value={miscBlockReason}
                        onChange={(event) => setMiscBlockReason(event.target.value)}
                        placeholder="Explain why this user is blocked."
                        rows={3}
                        data-testid="textarea-misc-block-reason"
                      />
                    </div>

                    <div className="flex flex-wrap gap-2">
                      <Button onClick={blockUserFromMisc} disabled={blockingMiscUser || miscOverviewLoading} data-testid="button-misc-block-user">
                        {blockingMiscUser ? "Blocking…" : "Block User"}
                      </Button>
                      <Button
                        variant="outline"
                        onClick={() => unblockMiscUser(miscBlockSystem, miscBlockUserIdInput.trim())}
                        disabled={blockingMiscUser || miscOverviewLoading || !miscBlockUserIdInput.trim()}
                        data-testid="button-misc-unblock-user-id"
                      >
                        Unblock by User ID
                      </Button>
                    </div>

                    <div className="space-y-4">
                      {(["staff_applications", "modmail", "appeal"] as MiscBlockSystem[]).map((systemKey) => {
                        const items = miscBlocks.filter((block) => block.system === systemKey);
                        return (
                          <div key={`misc-block-section-${systemKey}`} className="space-y-2">
                            <div className="flex items-center justify-between">
                              <p className="text-sm font-semibold">{blockSystemLabels[systemKey]}</p>
                              <Badge variant="outline">{items.length}</Badge>
                            </div>

                            {miscOverviewLoading ? (
                              <p className="text-sm text-muted-foreground">Loading blocked users…</p>
                            ) : items.length === 0 ? (
                              <p className="text-sm text-muted-foreground">No users are currently blocked in this section.</p>
                            ) : (
                              <div className="space-y-2">
                                {items.map((block) => {
                                  const requestKey = `${block.system}:${block.userId}`;
                                  return (
                                    <div key={requestKey} className="flex items-start justify-between gap-3 rounded-md border border-border/60 bg-muted/20 px-3 py-3">
                                      <div className="flex min-w-0 flex-1 items-start gap-3">
                                        {block.avatarUrl ? (
                                          <img src={block.avatarUrl} alt={block.username} className="h-9 w-9 rounded-full object-cover" />
                                        ) : (
                                          <div className="flex h-9 w-9 items-center justify-center rounded-full bg-muted text-xs font-semibold">
                                            {block.username.slice(0, 2).toUpperCase()}
                                          </div>
                                        )}
                                        <div className="min-w-0 flex-1 text-sm">
                                          <p className="truncate font-medium">{block.username}</p>
                                          <p className="text-[11px] text-muted-foreground">User ID: {block.userId}</p>
                                          <p className="mt-1 text-xs text-muted-foreground">
                                            <span className="font-medium text-foreground">Blocked by:</span>{" "}
                                            {block.blockedByUsername || block.blockedById || "Unknown user"}
                                            {block.blockedById ? ` (${block.blockedById})` : ""}
                                          </p>
                                          <p className="text-xs text-muted-foreground">
                                            <span className="font-medium text-foreground">Duration:</span>{" "}
                                            {formatBlockDurationLabel(block.expiresAt)}
                                          </p>
                                          {block.expiresAt && (
                                            <p className="text-xs text-muted-foreground">
                                              <span className="font-medium text-foreground">Expires:</span>{" "}
                                              {new Date(block.expiresAt).toLocaleString()}
                                            </p>
                                          )}
                                          <p className="mt-1 text-xs text-muted-foreground">
                                            <span className="font-medium text-foreground">Reason:</span>{" "}
                                            {block.reason || "No reason provided."}
                                          </p>
                                        </div>
                                      </div>
                                      <Button
                                        size="sm"
                                        variant="destructive"
                                        className="shrink-0"
                                        disabled={unblockingMiscKey === requestKey}
                                        onClick={() => unblockMiscUser(block.system, block.userId, block.username)}
                                      >
                                        {unblockingMiscKey === requestKey ? "Unblocking…" : "Unblock"}
                                      </Button>
                                    </div>
                                  );
                                })}
                              </div>
                            )}
                          </div>
                        );
                      })}
                    </div>
                  </CardContent>
                </Card>

                <Card className="border-border/80 bg-card/90">
                  <CardHeader className="space-y-1">
                    <CardTitle className="text-base">Recent Activity</CardTitle>
                    <CardDescription>Recent audit log events plus command and moderation activity from this server.</CardDescription>
                  </CardHeader>
                  <CardContent>
                    {miscOverviewLoading ? (
                      <p className="text-sm text-muted-foreground">Loading recent activity…</p>
                    ) : miscOverviewError ? (
                      <p className="text-sm text-muted-foreground">Start the bot to view live audit and command activity here.</p>
                    ) : miscActivity.length === 0 ? (
                      <p className="text-sm text-muted-foreground">No recent activity was found yet.</p>
                    ) : (
                      <div className="overflow-hidden rounded-md border border-border/60">
                        <div className="hidden grid-cols-[190px,190px,1fr] bg-muted/30 px-3 py-2 text-[11px] font-semibold uppercase tracking-[0.15em] text-muted-foreground md:grid">
                          <span>Date</span>
                          <span>User</span>
                          <span>Action</span>
                        </div>
                        <div className="max-h-[420px] overflow-y-auto">
                          {miscActivity.map((entry) => (
                            <div key={entry.id} className="grid gap-2 border-t border-border/50 px-3 py-3 text-sm first:border-t-0 md:grid-cols-[190px,190px,1fr] md:items-center">
                              <div className="text-xs text-muted-foreground">
                                {new Date(entry.timestamp).toLocaleString()}
                              </div>
                              <div className="flex items-center gap-2 min-w-0">
                                {entry.avatarUrl ? (
                                  <img src={entry.avatarUrl} alt={entry.username} className="h-8 w-8 rounded-full object-cover" />
                                ) : (
                                  <div className="flex h-8 w-8 items-center justify-center rounded-full bg-muted text-[10px] font-semibold">
                                    {entry.username.slice(0, 2).toUpperCase()}
                                  </div>
                                )}
                                <div className="min-w-0">
                                  <p className="truncate text-sm font-medium">{entry.username}</p>
                                  <p className="text-[11px] text-muted-foreground">{entry.userId || "Unknown user"}</p>
                                </div>
                              </div>
                              <div className="min-w-0">
                                <div className="flex flex-wrap items-center gap-2">
                                  <span className="text-sm">{entry.action}</span>
                                  <Badge variant="outline" className="text-[10px] uppercase">
                                    {entry.source === "commands" ? "Command" : entry.source}
                                  </Badge>
                                </div>
                              </div>
                            </div>
                          ))}
                        </div>
                      </div>
                    )}
                  </CardContent>
                </Card>
              </div>
            </TabsContent>
            </div>
          </Tabs>

          <Dialog open={rosterEmbedModalOpen} onOpenChange={setRosterEmbedModalOpen}>
            <DialogContent className="max-w-2xl">
              <DialogHeader>
                <DialogTitle>{rosterEmbedModalMode === "create" ? "Create Roster Embed" : `Edit Roster Embed – ${rosterEmbedName || "Embed"}`}</DialogTitle>
              </DialogHeader>
              <div className="space-y-4 py-2">
                <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
                  <div className="space-y-2 md:col-span-2">
                    <Label>Embed Name *</Label>
                    <Input
                      value={rosterEmbedName}
                      onChange={(event) => setRosterEmbedName(event.target.value)}
                      placeholder="Main roster selector"
                    />
                  </div>
                  <div className="space-y-2">
                    <Label>Embed Title *</Label>
                    <Input
                      value={rosterEmbedConfig.title}
                      onChange={(event) => setRosterEmbedConfig((prev) => ({ ...prev, title: event.target.value }))}
                      placeholder="Roster Selection"
                    />
                  </div>
                  <div className="space-y-2">
                    <Label>Embed Color (hex)</Label>
                    <Input
                      value={rosterEmbedConfig.embedColor || ""}
                      onChange={(event) => setRosterEmbedConfig((prev) => ({
                        ...prev,
                        embedColor: event.target.value.replace(/[^0-9a-fA-F]/g, "").slice(0, 6),
                      }))}
                      placeholder="5865f2"
                    />
                  </div>
                  <div className="space-y-2 md:col-span-2">
                    <Label>Description *</Label>
                    <Textarea
                      value={rosterEmbedConfig.description}
                      onChange={(event) => setRosterEmbedConfig((prev) => ({ ...prev, description: event.target.value }))}
                      placeholder="Pick a roster button below."
                      className="min-h-[90px]"
                    />
                  </div>
                  <div className="space-y-2 md:col-span-2">
                    <Label>Embed Channel *</Label>
                    <div className="relative">
                      <Search className="pointer-events-none absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
                      <Input
                        value={rosterEmbedChannelSearch}
                        onChange={(event) => setRosterEmbedChannelSearch(event.target.value)}
                        placeholder="Search embed channel…"
                        className="h-8 pl-8 text-sm"
                      />
                    </div>
                    <div className="max-h-36 overflow-y-auto rounded-md border border-border bg-background p-1 space-y-0.5">
                      {filterNamedItems(textChannels, rosterEmbedChannelSearch).map((channel) => (
                        <button
                          key={channel.id}
                          type="button"
                          className={`w-full rounded px-2 py-1 text-left text-sm transition-colors hover:bg-accent ${rosterEmbedConfig.channelId === channel.id ? "bg-accent font-medium" : ""}`}
                          onClick={() => setRosterEmbedConfig((prev) => ({ ...prev, channelId: channel.id }))}
                        >
                          #{channel.name}
                        </button>
                      ))}
                      {filterNamedItems(textChannels, rosterEmbedChannelSearch).length === 0 && (
                        <p className="px-2 py-1 text-sm text-muted-foreground">No channels match.</p>
                      )}
                    </div>
                    {rosterEmbedConfig.channelId && (
                      <p className="text-xs text-muted-foreground">
                        Selected: #{textChannels.find((channel) => channel.id === rosterEmbedConfig.channelId)?.name || rosterEmbedConfig.channelId}
                      </p>
                    )}
                  </div>
                </div>

                <div className="space-y-3 rounded-md border border-border p-3">
                  <div className="flex items-center justify-between">
                    <p className="text-sm font-medium">Embed Buttons (max 5)</p>
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={addRosterEmbedButton}
                      disabled={(rosterEmbedConfig.buttons || []).length >= 5}
                    >
                      <Plus className="mr-2 h-4 w-4" /> Add Button
                    </Button>
                  </div>

                  {(rosterEmbedConfig.buttons || []).length === 0 ? (
                    <p className="text-sm text-muted-foreground">No buttons yet. Add at least one button.</p>
                  ) : (
                    <div className="space-y-3">
                      {(rosterEmbedConfig.buttons || []).map((button, buttonIndex) => (
                        <div key={`embed-btn-${buttonIndex}`} className="rounded-md border border-border p-3">
                          <div className="mb-2 flex items-center justify-between">
                            <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Button {buttonIndex + 1}</p>
                            <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => removeRosterEmbedButton(buttonIndex)}>
                              <Trash2 className="h-3.5 w-3.5" />
                            </Button>
                          </div>
                          <div className="grid grid-cols-1 gap-2 md:grid-cols-2">
                            <div className="space-y-1">
                              <Label>Target Roster *</Label>
                              <Select
                                value={button.rosterName || ""}
                                onValueChange={(value) => updateRosterEmbedButton(buttonIndex, { rosterName: value })}
                              >
                                <SelectTrigger>
                                  <SelectValue placeholder="Select roster" />
                                </SelectTrigger>
                                <SelectContent>
                                  {rosters.map((roster) => (
                                    <SelectItem key={`embed-target-${roster.id}`} value={roster.name.toLowerCase()}>{roster.name}</SelectItem>
                                  ))}
                                </SelectContent>
                              </Select>
                            </div>
                            <div className="space-y-1">
                              <Label>Button Label *</Label>
                              <Input
                                value={button.label || ""}
                                onChange={(event) => updateRosterEmbedButton(buttonIndex, { label: event.target.value })}
                                placeholder="View Staff"
                              />
                            </div>
                            <div className="space-y-1">
                              <Label>Button Color *</Label>
                              <Select
                                value={button.color || "blue"}
                                onValueChange={(value) => updateRosterEmbedButton(buttonIndex, { color: value as RosterEmbedButtonColor })}
                              >
                                <SelectTrigger>
                                  <SelectValue placeholder="Select color" />
                                </SelectTrigger>
                                <SelectContent>
                                  {ROSTER_EMBED_BUTTON_COLORS.map((colorOption) => (
                                    <SelectItem key={colorOption.value} value={colorOption.value}>{colorOption.label}</SelectItem>
                                  ))}
                                </SelectContent>
                              </Select>
                            </div>
                            <div className="space-y-1">
                              <Label>Emoji (optional)</Label>
                              <Input
                                value={button.emoji || ""}
                                onChange={(event) => updateRosterEmbedButton(buttonIndex, { emoji: event.target.value })}
                                placeholder="📝 or <:name:id>"
                              />
                            </div>
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              </div>
              <DialogFooter>
                <Button variant="outline" onClick={() => setRosterEmbedModalOpen(false)}>Cancel</Button>
                <Button onClick={saveRosterEmbedConfig} disabled={rosterEmbedSaving}>
                  {rosterEmbedSaving ? "Saving…" : "Save Embed Config"}
                </Button>
              </DialogFooter>
            </DialogContent>
          </Dialog>

          {/* Roster create/edit modal */}
          <Dialog open={rosterModalOpen} onOpenChange={setRosterModalOpen}>
            <DialogContent className="max-w-lg">
              <DialogHeader>
                <DialogTitle>{rosterModalMode === "create" ? "Create Roster" : `Edit Roster – ${rosterModalEditingName}`}</DialogTitle>
              </DialogHeader>
              <div className="space-y-4 py-2">
                {rosterModalMode === "create" && (
                  <div className="space-y-2">
                    <Label>Roster Name</Label>
                    <Input
                      value={rosterModalName}
                      onChange={(e) => setRosterModalName(e.target.value)}
                      placeholder="e.g. Staff, Players, Coaches"
                    />
                  </div>
                )}
                <div className="space-y-2">
                  <Label>Roles on this Roster *</Label>
                  <p className="text-xs text-muted-foreground">Members with these roles will appear on the roster. At least one role is required.</p>
                  <div className="relative">
                    <Search className="pointer-events-none absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
                    <Input
                      value={roleSearches["roster-modal-roles"] || ""}
                      onChange={(event) => setRoleSearches((prev) => ({ ...prev, ["roster-modal-roles"]: event.target.value }))}
                      placeholder="Search roster roles…"
                      className="h-8 pl-8 text-sm"
                    />
                  </div>
                  <div className="max-h-48 overflow-y-auto rounded-md border border-border p-2 space-y-1">
                    {roles.length === 0 ? (
                      <p className="text-sm text-muted-foreground">No roles available.</p>
                    ) : (
                      filterNamedItems(
                        roles.filter((role) => role.name !== "@everyone"),
                        roleSearches["roster-modal-roles"] || "",
                      ).map((role) => (
                        <label key={role.id} className="flex items-center gap-2 cursor-pointer rounded px-1 py-0.5 hover:bg-accent">
                          <input
                            type="checkbox"
                            className="accent-primary"
                            checked={rosterModalRoleIds.includes(role.id)}
                            onChange={() => toggleRosterRoleId(role.id)}
                          />
                          <span
                            className="text-sm font-medium"
                            style={{ color: role.color !== "#000000" ? role.color : undefined }}
                          >
                            {role.name}
                          </span>
                        </label>
                      ))
                    )}
                    {roles.length > 0 && filterNamedItems(
                      roles.filter((role) => role.name !== "@everyone"),
                      roleSearches["roster-modal-roles"] || "",
                    ).length === 0 && (
                      <p className="text-sm text-muted-foreground">No roles found.</p>
                    )}
                  </div>
                </div>
                <div className="space-y-2">
                  <Label>Posted Channel *</Label>
                  <div className="relative">
                    <Search className="pointer-events-none absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
                    <Input
                      value={rosterChannelSearch}
                      onChange={(e) => setRosterChannelSearch(e.target.value)}
                      placeholder="Search required channel…"
                      className="pl-8 h-8 text-sm"
                    />
                  </div>
                  <div className="max-h-36 overflow-y-auto rounded-md border border-border bg-background p-1 space-y-0.5">
                    {filterNamedItems(textChannels, rosterChannelSearch).map((ch) => (
                      <button
                        key={ch.id}
                        type="button"
                        className={`w-full text-left px-2 py-1 text-sm rounded transition-colors hover:bg-accent ${rosterModalChannelId === ch.id ? "bg-accent font-medium" : ""}`}
                        onClick={() => setRosterModalChannelId(ch.id)}
                      >
                        #{ch.name}
                      </button>
                    ))}
                    {filterNamedItems(textChannels, rosterChannelSearch).length === 0 && (
                      <p className="px-2 py-1 text-sm text-muted-foreground">No channels match.</p>
                    )}
                  </div>
                  {rosterModalChannelId && (
                    <p className="text-xs text-muted-foreground">
                      Selected: #{textChannels.find((ch) => ch.id === rosterModalChannelId)?.name || rosterModalChannelId}
                    </p>
                  )}
                </div>
              </div>
              <DialogFooter>
                <Button variant="outline" onClick={() => setRosterModalOpen(false)}>Cancel</Button>
                <Button onClick={saveRosterModal} disabled={rosterSaving}>
                  {rosterSaving ? "Saving…" : rosterModalMode === "create" ? "Create" : "Save Changes"}
                </Button>
              </DialogFooter>
            </DialogContent>
          </Dialog>
          </>
        )}
      </div>
    </div>
  );
}
