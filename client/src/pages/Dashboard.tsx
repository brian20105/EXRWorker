import { useState, useEffect } from "react";
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
import { ArrowLeft, Save, Server, Shield, CheckCircle2, AlertCircle, Copy, Hash, Braces, Moon, Sun, ChevronDown, Search, Settings, Palette, Users, Plus, Pencil, Trash2, X, SlidersHorizontal, Sparkles, ListTree } from "lucide-react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { useTheme } from "next-themes";
import { useLocation, useRoute } from "wouter";

interface Guild {
  id: string;
  name: string;
  icon: string | null;
  memberCount: number;
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
  modmailCategoryId?: string | null;
  modmailLogChannelId?: string | null;
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
type PrimaryTabKey = "settings" | "features" | "rosters";

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

const PRIMARY_TAB_META: Record<PrimaryTabKey, { label: string; icon: typeof SlidersHorizontal }> = {
  settings: { label: "Dashboard Settings", icon: SlidersHorizontal },
  features: { label: "Bot Features", icon: Sparkles },
  rosters: { label: "Rosters", icon: ListTree },
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

interface BotFeatureModule {
  id: string;
  name: string;
  description: string;
  tab: SettingsTabKey;
  enabled: boolean;
}

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
const PRIVILEGED_DASHBOARD_USER_IDS = new Set(["948598563359817728", "944385000059600896"]);
const DASHBOARD_COLOR_STORAGE_KEY = "dashboardColorOverrides";
const DEFAULT_TOP_FADE_COLOR = "#5865f2";
const DEFAULT_ENABLED_STATUS_COLOR = "#00ff7b";
const DEFAULT_DISABLED_STATUS_COLOR = "#ff0000";
const BACKGROUND_COLOR_PRESETS = ["#ff0000", "#00ff7b", "#0000ff"];

const ROSTER_EMBED_BUTTON_COLORS: Array<{ value: RosterEmbedButtonColor; label: string }> = [
  { value: "blue", label: "Blue" },
  { value: "green", label: "Green" },
  { value: "red", label: "Red" },
  { value: "grey", label: "Grey" },
];

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
  const [rosterEmbedDeleteConfirm, setRosterEmbedDeleteConfirm] = useState<string | null>(null);
  const [rosterEmbedModalOpen, setRosterEmbedModalOpen] = useState(false);
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
    setQuickSettings(getQuickSettingsFromCustomCategoryPings(nextConfig.customCategoryPings || "{}"));
    const nextPermissionSettings = getPermissionSettingsFromCustomCategoryPings(nextConfig.customCategoryPings || "{}");
    const sanitizedPermissionSettings: DashboardPermissionSettings = { ...nextPermissionSettings };
    for (const roleKey of PERMISSION_ROLE_KEYS) {
      sanitizedPermissionSettings[roleKey] = sanitizeRoleIds(nextPermissionSettings[roleKey]);
    }
    setPermissionSettings(sanitizedPermissionSettings);
    setWelcomeEmbedSettings(getWelcomeEmbedSettingsFromCustomCategoryPings(nextConfig.customCategoryPings || "{}"));
    setBotPresenceSettings(getBotPresenceSettingsFromCustomCategoryPings(nextConfig.customCategoryPings || "{}"));
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
  }, [selectedGuild]);

  // Fetch rosters when the rosters tab is active
  useEffect(() => {
    if (!selectedGuild || activePrimaryTab !== "rosters") return;
    setRostersLoading(true);
    fetchJsonWithTimeout(`/api/guilds/${selectedGuild}/rosters`, undefined, 12000)
      .then((rosterData) => {
        setRosters(dedupeRosters(Array.isArray(rosterData.rosters) ? rosterData.rosters : []));
        setRosterEmbeds(dedupeRosterEmbeds(Array.isArray(rosterData.rosterEmbeds) ? rosterData.rosterEmbeds : []));
        setRostersLoading(false);
      })
      .catch(() => setRostersLoading(false));
  }, [selectedGuild, activePrimaryTab]);

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

  const updateConfig = <K extends keyof GuildConfig>(key: K, value: GuildConfig[K]) => {
    setConfig((prev) => ({ ...prev, [key]: value }));
  };

  const getDefaultFeatureEnabledMap = (guildConfig: GuildConfig): Record<string, boolean> => ({
    modmail: !!(guildConfig.modmailCategoryId || guildConfig.modmailLogChannelId),
    appeals: !!(guildConfig.appealCategoryId || guildConfig.appealLogChannelId),
    payouts: !!(guildConfig.requestChannelId || guildConfig.logChannelId),
    moderation: !!guildConfig.modLogChannelId,
    quiz: !!guildConfig.quizLogChannelId,
    "staff-intro": !!(guildConfig.staffIntroChannelId || guildConfig.staffIntroSubmissionsChannelId),
    inactivity: !!(
      guildConfig.inactivityChannelId
      || guildConfig.inactivitySubmissionsChannelId
      || guildConfig.inactivityLogChannelId
    ),
    permissions: !!(
      (guildConfig.modRoleIds?.length || 0)
      || (guildConfig.modmailStaffRoleIds?.length || 0)
      || (guildConfig.appealStaffRoleIds?.length || 0)
    ),
    embeds: !!(
      guildConfig.modmailEmbedTitle
      || guildConfig.modmailEmbedDescription
      || guildConfig.appealEmbedTitle
      || guildConfig.appealEmbedDescription
    ),
    advanced: !!(
      ((guildConfig.customCategoryPings || "").trim().length > 0 && (guildConfig.customCategoryPings || "").trim() !== "{}")
      || ((guildConfig.customModmailCategories || "").trim().length > 0 && (guildConfig.customModmailCategories || "").trim() !== "[]")
    ),
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

  const botFeatureDefinitions: Omit<BotFeatureModule, "enabled">[] = [
    {
      id: "modmail",
      name: "Modmail",
      description: "Ticket intake and staff response system.",
      tab: "channels",
    },
    {
      id: "appeals",
      name: "Appeals",
      description: "Appeal workflows with dedicated channels and staff.",
      tab: "channels",
    },
    {
      id: "payouts",
      name: "Payout Requests",
      description: "Payout intake and logging channels.",
      tab: "channels",
    },
    {
      id: "moderation",
      name: "Moderation Logs",
      description: "Track moderation actions in a configured log channel.",
      tab: "channels",
    },
    {
      id: "quiz",
      name: "Quiz Tracking",
      description: "Store quiz progress and outcomes in a log channel.",
      tab: "channels",
    },
    {
      id: "staff-intro",
      name: "Staff Intro",
      description: "Staff introduction prompts and submission pipeline.",
      tab: "channels",
    },
    {
      id: "inactivity",
      name: "Inactivity",
      description: "Inactivity requests, routing, and logging.",
      tab: "channels",
    },
    {
      id: "permissions",
      name: "Role Permissions",
      description: "Grant feature access with role-based permissions.",
      tab: "roles",
    },
    {
      id: "embeds",
      name: "Embed Templates",
      description: "Customize bot-facing embed messages and titles.",
      tab: "embeds",
    },
    {
      id: "advanced",
      name: "Advanced Categories",
      description: "Custom category mappings and advanced bot behavior.",
      tab: "advanced",
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
    return `${module.name} ${module.description}`.toLowerCase().includes(query);
  });

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
    return (
      <Card className="border-border/80 bg-card/90" data-testid={`card-module-settings-${moduleId}`}>
        <CardHeader className="space-y-1">
          <CardTitle className="text-sm font-semibold uppercase tracking-[0.2em] text-muted-foreground">{activeModule.name} Settings</CardTitle>
          <CardDescription>{activeModule.description}</CardDescription>
        </CardHeader>
        <CardContent className="space-y-6">
          {moduleId === "modmail" && (
            <div className="grid gap-4 md:grid-cols-2">
              {renderChannelSelect("Modmail Category", "modmailCategoryId", categoryChannels, "select-module-modmail-category")}
              {renderChannelSelect("Modmail Log Channel", "modmailLogChannelId", textChannels, "select-module-modmail-log")}
            </div>
          )}

          {moduleId === "appeals" && (
            <div className="grid gap-4 md:grid-cols-2">
              {renderChannelSelect("Appeal Category", "appealCategoryId", categoryChannels, "select-module-appeal-category")}
              {renderChannelSelect("Appeal Log Channel", "appealLogChannelId", textChannels, "select-module-appeal-log")}
            </div>
          )}

          {moduleId === "payouts" && (
            <div className="grid gap-4 md:grid-cols-2">
              {renderChannelSelect("Payout Request Channel", "requestChannelId", textChannels, "select-module-payout-request")}
              {renderChannelSelect("Payout Log Channel", "logChannelId", textChannels, "select-module-payout-log")}
            </div>
          )}

          {moduleId === "moderation" && (
            <div className="grid gap-4 md:grid-cols-2">
              {renderChannelSelect("Moderation Log Channel", "modLogChannelId", textChannels, "select-module-mod-log")}
            </div>
          )}

          {moduleId === "quiz" && (
            <div className="grid gap-4 md:grid-cols-2">
              {renderChannelSelect("Quiz Log Channel", "quizLogChannelId", textChannels, "select-module-quiz-log")}
            </div>
          )}

          {moduleId === "staff-intro" && (
            <div className="grid gap-4 md:grid-cols-2">
              {renderChannelSelect("Staff Intro Channel", "staffIntroChannelId", textChannels, "select-module-staff-intro")}
              {renderChannelSelect("Staff Intro Submissions", "staffIntroSubmissionsChannelId", textChannels, "select-module-staff-intro-submissions")}
            </div>
          )}

          {moduleId === "inactivity" && (
            <div className="grid gap-4 md:grid-cols-2">
              {renderChannelSelect("Inactivity Channel", "inactivityChannelId", textChannels, "select-module-inactivity")}
              {renderChannelSelect("Inactivity Submissions", "inactivitySubmissionsChannelId", textChannels, "select-module-inactivity-submissions")}
              {renderChannelSelect("Inactivity Log Channel", "inactivityLogChannelId", textChannels, "select-module-inactivity-log")}
            </div>
          )}

          {moduleId === "permissions" && (
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
        </CardContent>
      </Card>
    );
  };

  const renderChannelSelect = (
    label: string,
    key: keyof GuildConfig,
    options: Channel[],
    testId: string,
  ) => {
    const value = (config[key] as string | null | undefined) || NONE_VALUE;
    const query = (channelSearches[String(key)] || "").trim().toLowerCase();
    const filteredChannels = options.filter((channel) => {
      if (!query) return true;
      return channel.name.toLowerCase().includes(query);
    });
    const selectedChannel = options.find((channel) => channel.id === value);

    return (
      <div className="space-y-2">
        <Label>{label}</Label>
        <DropdownMenu>
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
                value={channelSearches[String(key)] || ""}
                onChange={(event) =>
                  setChannelSearches((prev) => ({ ...prev, [String(key)]: event.target.value }))
                }
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

  const renderRoleSection = (label: string, key: keyof GuildConfig, testIdPrefix: string) => {
    const selectedRoleIds = filterToCurrentServerRoleIds((config[key] as string[] | undefined) || []);

    return (
    <div className="space-y-3">
      <Label>{label}</Label>
      <div className="space-y-2">
        <DropdownMenu>
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
          <DropdownMenuContent className="max-h-72 w-80">
            <div className="px-1 pb-2">
              <Input
                value={roleSearches[String(key)] || ""}
                onChange={(event) =>
                  setRoleSearches((prev) => ({ ...prev, [String(key)]: event.target.value }))
                }
                placeholder="Search roles..."
                className="h-8"
                data-testid={`${testIdPrefix}-search`}
              />
            </div>
            {roles
              .filter((role) => {
                const query = (roleSearches[String(key)] || "").trim().toLowerCase();
                if (!query) return true;
                return role.name.toLowerCase().includes(query);
              })
              .map((role) => {
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

    return (
    <div className="space-y-3">
      <Label>{label}</Label>
      <div className="space-y-2">
        <DropdownMenu>
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
          <DropdownMenuContent className="max-h-72 w-80">
            <div className="px-1 pb-2">
              <Input
                value={roleSearches[String(key)] || ""}
                onChange={(event) =>
                  setRoleSearches((prev) => ({ ...prev, [String(key)]: event.target.value }))
                }
                placeholder="Search roles..."
                className="h-8"
                data-testid={`${testIdPrefix}-search`}
              />
            </div>
            {roles
              .filter((role) => {
                const query = (roleSearches[String(key)] || "").trim().toLowerCase();
                if (!query) return true;
                return role.name.toLowerCase().includes(query);
              })
              .map((role) => {
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
      <div className="min-h-screen bg-background px-6 py-8" style={dashboardGradientStyle}>
        <div className="mx-auto max-w-6xl space-y-8">
          <Card data-testid="card-bot-status">
            <CardHeader>
              <div className="flex items-center justify-between gap-4">
                <div>
                  <CardTitle className="text-2xl">Bot Control Center</CardTitle>
                  <CardDescription>Manage all setup from dashboard and slash commands together.</CardDescription>
                  {currentUser && (
                    <p className="mt-2 text-sm text-muted-foreground">Signed in as {currentUser.username}</p>
                  )}
                </div>
                <div className="flex items-center gap-2">
                  <Button variant="outline" size="sm" onClick={toggleTheme} data-testid="button-toggle-theme">
                    {themeMounted && theme === "light" ? <Moon className="mr-2 h-4 w-4" /> : <Sun className="mr-2 h-4 w-4" />}
                    {themeMounted && theme === "light" ? "Dark Mode" : "Light Mode"}
                  </Button>
                  <div className="flex items-center gap-2 rounded-md border border-border px-2 py-1" data-testid="button-color-controls">
                    <Palette className="h-4 w-4 text-muted-foreground" />
                    <Label htmlFor="background-color" className="text-xs text-muted-foreground">Background</Label>
                    <input
                      id="background-color"
                      type="color"
                      value={backgroundColor}
                      onChange={(event) => updateBackgroundColor(event.target.value)}
                      className="h-7 w-7 cursor-pointer rounded border border-border bg-transparent p-0"
                      data-testid="input-background-color"
                    />
                    <Label htmlFor="button-color" className="text-xs text-muted-foreground">Buttons</Label>
                    <input
                      id="button-color"
                      type="color"
                      value={buttonColor}
                      onChange={(event) => updateButtonColor(event.target.value)}
                      className="h-7 w-7 cursor-pointer rounded border border-border bg-transparent p-0"
                      data-testid="input-button-color"
                    />
                  </div>
                  {renderBackgroundPresetControls("list")}
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
              <CardTitle className="text-4xl font-semibold tracking-tight">Servers</CardTitle>
              <CardDescription>Servers you're in ({guilds.length} servers)</CardDescription>
            </CardHeader>
            <CardContent>
              {loading ? (
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
                      {currentUser?.id && PRIVILEGED_DASHBOARD_USER_IDS.has(currentUser.id) && (
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
    <div className="min-h-screen bg-background px-6 py-8" style={dashboardGradientStyle}>
      <div className="mx-auto max-w-7xl space-y-6">
        <div className="flex items-center justify-between gap-3">
          <div className="flex items-center gap-3">
            <Button
              variant="ghost"
              size="sm"
              onClick={() => {
                setSelectedGuild(null);
                setLocation("/dashboard");
              }}
              data-testid="button-back-guilds"
            >
              <ArrowLeft className="mr-2 h-4 w-4" />
              Servers
            </Button>
            <h1 className="text-xl font-semibold">{guildName}</h1>
          </div>
          <div className="flex items-center gap-2">
            <Button variant="outline" size="sm" onClick={toggleTheme} data-testid="button-toggle-theme-selected">
              {themeMounted && theme === "light" ? <Moon className="mr-2 h-4 w-4" /> : <Sun className="mr-2 h-4 w-4" />}
              {themeMounted && theme === "light" ? "Dark Mode" : "Light Mode"}
            </Button>
            <div className="flex items-center gap-2 rounded-md border border-border px-2 py-1" data-testid="button-color-controls-selected">
              <Palette className="h-4 w-4 text-muted-foreground" />
              <Label htmlFor="background-color-selected" className="text-xs text-muted-foreground">Background</Label>
              <input
                id="background-color-selected"
                type="color"
                value={backgroundColor}
                onChange={(event) => updateBackgroundColor(event.target.value)}
                className="h-7 w-7 cursor-pointer rounded border border-border bg-transparent p-0"
                data-testid="input-background-color-selected"
              />
              <Label htmlFor="button-color-selected" className="text-xs text-muted-foreground">Buttons</Label>
              <input
                id="button-color-selected"
                type="color"
                value={buttonColor}
                onChange={(event) => updateButtonColor(event.target.value)}
                className="h-7 w-7 cursor-pointer rounded border border-border bg-transparent p-0"
                data-testid="input-button-color-selected"
              />
            </div>
            {renderBackgroundPresetControls("selected")}
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
            onValueChange={(value) => setActivePrimaryTab(value as PrimaryTabKey)}
            className="grid grid-cols-[84px_minmax(0,1fr)] gap-4 sm:grid-cols-[240px_minmax(0,1fr)] lg:grid-cols-[280px_minmax(0,1fr)] lg:gap-6"
          >
            <TabsList className="flex h-fit w-full flex-col gap-2 rounded-2xl border border-border/70 bg-card/85 p-2 shadow-sm backdrop-blur sm:p-3">
              {(Object.entries(PRIMARY_TAB_META) as Array<[PrimaryTabKey, { label: string; icon: typeof SlidersHorizontal }]>)
                .map(([tabKey, meta]) => {
                  const Icon = meta.icon;
                  return (
                    <TabsTrigger
                      key={tabKey}
                      value={tabKey}
                      data-testid={tabKey === "settings" ? "tab-settings" : tabKey === "features" ? "tab-bot-features" : "tab-rosters"}
                      className="group flex min-h-14 w-full items-center justify-center gap-3 rounded-xl border border-transparent px-3 py-3 text-left text-muted-foreground transition-all data-[state=active]:border-primary/30 data-[state=active]:bg-primary/15 data-[state=active]:text-foreground data-[state=active]:shadow-sm sm:justify-start"
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
                  <CardDescription>Configure moderation commands, modmail commands, nickname, update channel, and bot status.</CardDescription>
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

                  <div className="grid gap-4 md:grid-cols-2">
                    <div className="space-y-2">
                      <Label>Bot Nickname</Label>
                      <Input
                        value={quickSettings.botNickname}
                        onChange={(event) => setQuickSettings((prev) => ({ ...prev, botNickname: event.target.value }))}
                        placeholder="Expert Helper Bot"
                        data-testid="input-bot-nickname"
                      />
                    </div>
                    <div className="space-y-2">
                      {renderChannelSelect("Updates Channel", "commandLogChannelId", textChannels, "select-updates-channel")}
                    </div>
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

                  <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
                    {filteredModules.map((module) => (
                      <div key={module.id} className="rounded-lg border border-border/70 bg-card/40 p-4">
                        <div className="mb-3 flex items-start justify-between gap-3">
                          <div>
                            <p className="font-semibold">{module.name}</p>
                            <p className="mt-1 text-sm text-muted-foreground">{module.description}</p>
                          </div>
                          <Switch
                            checked={module.enabled}
                            onCheckedChange={(nextChecked) => setFeatureEnabled(module.id, nextChecked)}
                            data-testid={`switch-module-${module.id}`}
                          />
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
                        <Button
                          variant="outline"
                          size="sm"
                          className="ml-2"
                          onClick={() => {
                            if (!selectedGuild) return;
                            setLocation(`/dashboard/module/${module.id}?guild=${selectedGuild}`);
                          }}
                          data-testid={`button-module-settings-${module.id}`}
                        >
                          <Settings className="mr-2 h-3.5 w-3.5" />
                          Settings
                        </Button>
                      </div>
                    ))}
                  </div>
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
                      {textChannels
                        .filter((channel) => !rosterEmbedChannelSearch || channel.name.toLowerCase().includes(rosterEmbedChannelSearch.toLowerCase()))
                        .map((channel) => (
                          <button
                            key={channel.id}
                            type="button"
                            className={`w-full rounded px-2 py-1 text-left text-sm transition-colors hover:bg-accent ${rosterEmbedConfig.channelId === channel.id ? "bg-accent font-medium" : ""}`}
                            onClick={() => setRosterEmbedConfig((prev) => ({ ...prev, channelId: channel.id }))}
                          >
                            #{channel.name}
                          </button>
                        ))}
                      {textChannels.filter((channel) => !rosterEmbedChannelSearch || channel.name.toLowerCase().includes(rosterEmbedChannelSearch.toLowerCase())).length === 0 && (
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
                  <div className="max-h-48 overflow-y-auto rounded-md border border-border p-2 space-y-1">
                    {roles.length === 0 ? (
                      <p className="text-sm text-muted-foreground">No roles available.</p>
                    ) : (
                      roles.filter((r) => r.name !== "@everyone").map((role) => (
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
                    {textChannels
                      .filter((ch) => !rosterChannelSearch || ch.name.toLowerCase().includes(rosterChannelSearch.toLowerCase()))
                      .map((ch) => (
                        <button
                          key={ch.id}
                          type="button"
                          className={`w-full text-left px-2 py-1 text-sm rounded transition-colors hover:bg-accent ${rosterModalChannelId === ch.id ? "bg-accent font-medium" : ""}`}
                          onClick={() => setRosterModalChannelId(ch.id)}
                        >
                          #{ch.name}
                        </button>
                      ))}
                    {textChannels.filter((ch) => !rosterChannelSearch || ch.name.toLowerCase().includes(rosterChannelSearch.toLowerCase())).length === 0 && (
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
