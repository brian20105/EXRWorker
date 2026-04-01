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
import { ArrowLeft, Save, Server, Shield, CheckCircle2, AlertCircle, Copy, Hash, Braces, Moon, Sun, ChevronDown, Search, Settings } from "lucide-react";
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
type PrimaryTabKey = "settings" | "features";

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

const NONE_VALUE = "__none";
const CATEGORY_CHANNEL_TYPE = 4;
const TEXT_CHANNEL_TYPES = new Set([0, 5]);
const FEATURE_FLAGS_KEY = "__dashboardFeatureFlags";
const QUICK_SETTINGS_KEY = "__dashboardQuickSettings";
const LEAVE_SERVER_OWNER_ID = "948598563359817728";

export default function Dashboard() {
  const [guilds, setGuilds] = useState<Guild[]>([]);
  const [selectedGuild, setSelectedGuild] = useState<string | null>(null);
  const [config, setConfig] = useState<GuildConfig>({ commandPrefix: "." });
  const [channels, setChannels] = useState<Channel[]>([]);
  const [roles, setRoles] = useState<Role[]>([]);
  const [guildName, setGuildName] = useState("");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [leavingGuildId, setLeavingGuildId] = useState<string | null>(null);
  const [botStatus, setBotStatus] = useState<"checking" | "online" | "offline" | "external">("checking");
  const [applicationId, setApplicationId] = useState<string | null>(null);
  const [themeMounted, setThemeMounted] = useState(false);
  const [currentUser, setCurrentUser] = useState<AuthUser | null>(null);
  const [roleSearches, setRoleSearches] = useState<Record<string, string>>({});
  const [channelSearches, setChannelSearches] = useState<Record<string, string>>({});
  const [moduleSearch, setModuleSearch] = useState("");
  const [activePrimaryTab, setActivePrimaryTab] = useState<PrimaryTabKey>("settings");
  const [activeSettingsTab, setActiveSettingsTab] = useState<SettingsTabKey>("channels");
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
    activityType: "playing",
    activityText: "",
  });
  const { theme, setTheme } = useTheme();
  const { toast } = useToast();
  const [, setLocation] = useLocation();
  const [moduleRouteMatch, moduleRouteParams] = useRoute<{ moduleId: string }>("/dashboard/module/:moduleId");

  useEffect(() => {
    setThemeMounted(true);
  }, []);

  useEffect(() => {
    fetch("/api/bot-status")
      .then((res) => res.json())
      .then((data) => {
        setBotStatus(data.status);
        setApplicationId(data.applicationId);
      })
      .catch(() => setBotStatus("offline"));
  }, []);

  useEffect(() => {
    fetch("/api/auth/me")
      .then(async (res) => {
        if (!res.ok) {
          setCurrentUser(null);
          return;
        }
        const data = await res.json();
        if (data?.authenticated && data?.user) {
          setCurrentUser(data.user as AuthUser);
        } else {
          setCurrentUser(null);
        }
      })
      .catch(() => setCurrentUser(null))
      .finally(() => undefined);
  }, []);

  useEffect(() => {
    setLoading(true);
    fetch("/api/guilds")
      .then((res) => res.json())
      .then((data) => {
        if (Array.isArray(data)) {
          setGuilds(data);
        }
        setLoading(false);
      })
      .catch(() => setLoading(false));
  }, []);

  useEffect(() => {
    if (!selectedGuild) return;

    setLoading(true);
    fetch(`/api/guilds/${selectedGuild}/config`)
      .then(async (res) => {
        const data = await res.json();
        if (!res.ok) {
          throw new Error(data?.error || "Unable to load server config");
        }
        return data;
      })
      .then((data) => {
        const nextConfig = (data.config || {}) as GuildConfig;
        setConfig(nextConfig);
        setChannels(data.channels || []);
        setRoles(data.roles || []);
        setGuildName(data.guildName || "");
        setCustomCategoryPingsText(nextConfig.customCategoryPings || "{}");
        setCustomModmailCategoriesText(nextConfig.customModmailCategories || "[]");
        setQuickSettings(getQuickSettingsFromCustomCategoryPings(nextConfig.customCategoryPings || "{}"));
        setPermissionSettings(getPermissionSettingsFromCustomCategoryPings(nextConfig.customCategoryPings || "{}"));
        setWelcomeEmbedSettings(getWelcomeEmbedSettingsFromCustomCategoryPings(nextConfig.customCategoryPings || "{}"));
        setBotPresenceSettings(getBotPresenceSettingsFromCustomCategoryPings(nextConfig.customCategoryPings || "{}"));
        setActivePrimaryTab("settings");
        setActiveSettingsTab("channels");
        setModuleSearch("");
        syncFeatureFlagsState(nextConfig, nextConfig.customCategoryPings || "{}");
        setLoading(false);
      })
      .catch((error: any) => {
        setLoading(false);
        setSelectedGuild(null);
        toast({
          title: "Access denied",
          description: error?.message || "Login with Discord and make sure you have a manager role in this server.",
          variant: "destructive",
        });
      });
  }, [selectedGuild]);

  const copyToClipboard = (text: string, label: string) => {
    navigator.clipboard.writeText(text);
    toast({ title: "Copied", description: `${label} copied to clipboard.` });
  };

  const toggleTheme = () => {
    const isDark = (theme || "dark") === "dark";
    setTheme(isDark ? "light" : "dark");
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
    const activityType = typeof presence.activityType === "string" ? presence.activityType.toLowerCase() : "playing";

    return {
      status: (status === "online" || status === "idle" || status === "dnd" || status === "invisible") ? status : "online",
      activityType: (activityType === "playing" || activityType === "listening" || activityType === "watching" || activityType === "competing")
        ? activityType
        : "playing",
      activityText: typeof presence.activityText === "string" ? presence.activityText : "",
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
    setPermissionSettings((prev) => {
      const current = prev[key] || [];
      if (current.includes(roleId)) {
        return { ...prev, [key]: current.filter((id) => id !== roleId) };
      }
      return { ...prev, [key]: [...current, roleId] };
    });
  };

  const toggleRole = (key: keyof GuildConfig, roleId: string) => {
    const current = (config[key] as string[] | undefined) || [];
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
      const data = await res.json();

      if (!res.ok) {
        if (res.status === 401 || res.status === 403) {
          toast({ title: "Access denied", description: data.error || "Manager role required for dashboard access.", variant: "destructive" });
          setSelectedGuild(null);
          return;
        }
        toast({ title: "Save failed", description: data.error || "Could not save config.", variant: "destructive" });
      } else {
        setConfig((data.config || payload) as GuildConfig);
        toast({ title: "Saved", description: "Dashboard configuration updated." });
      }
    } catch {
      toast({ title: "Save failed", description: "Network error while saving.", variant: "destructive" });
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
              {renderRoleSection("Manager Roles", "modRoleIds", "module-manager-role")}
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

  const renderRoleSection = (label: string, key: keyof GuildConfig, testIdPrefix: string) => (
    <div className="space-y-3">
      <Label>{label}</Label>
      <div className="space-y-2">
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant="outline" className="w-full justify-between" data-testid={`${testIdPrefix}-trigger`}>
              <span className="truncate text-left">
                {(((config[key] as string[] | undefined) || []).length || 0) > 0
                  ? `${((config[key] as string[] | undefined) || []).length} role(s) selected`
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
              const selected = ((config[key] as string[] | undefined) || []).includes(role.id);
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
            .filter((role) => ((config[key] as string[] | undefined) || []).includes(role.id))
            .slice(0, 8)
            .map((role) => (
              <Badge key={role.id} variant="secondary" className="max-w-[220px] truncate" title={role.name}>
                {role.name}
              </Badge>
            ))}
          {(((config[key] as string[] | undefined) || []).length || 0) > 8 && (
            <Badge variant="outline">+{(((config[key] as string[] | undefined) || []).length || 0) - 8} more</Badge>
          )}
        </div>
      </div>
    </div>
  );

  const renderPermissionRoleSection = (label: string, key: keyof DashboardPermissionSettings, testIdPrefix: string) => (
    <div className="space-y-3">
      <Label>{label}</Label>
      <div className="space-y-2">
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant="outline" className="w-full justify-between" data-testid={`${testIdPrefix}-trigger`}>
              <span className="truncate text-left">
                {(permissionSettings[key]?.length || 0) > 0
                  ? `${permissionSettings[key].length} role(s) selected`
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
                const selected = (permissionSettings[key] || []).includes(role.id);
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
            .filter((role) => (permissionSettings[key] || []).includes(role.id))
            .slice(0, 8)
            .map((role) => (
              <Badge key={role.id} variant="secondary" className="max-w-[220px] truncate" title={role.name}>
                {role.name}
              </Badge>
            ))}
          {(permissionSettings[key]?.length || 0) > 8 && (
            <Badge variant="outline">+{permissionSettings[key].length - 8} more</Badge>
          )}
        </div>
      </div>
    </div>
  );

  if (!selectedGuild) {
    return (
      <div className="min-h-screen bg-background px-6 py-8">
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
                      {currentUser?.id === LEAVE_SERVER_OWNER_ID && (
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
    <div className="min-h-screen bg-background px-6 py-8">
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
          <Tabs value={activePrimaryTab} onValueChange={(value) => setActivePrimaryTab(value as PrimaryTabKey)} className="space-y-4">
            <TabsList className="grid h-auto w-full grid-cols-2 gap-2 p-1 md:w-[420px]">
              <TabsTrigger value="settings" data-testid="tab-settings">Dashboard Settings</TabsTrigger>
              <TabsTrigger value="features" data-testid="tab-bot-features">Bot Features</TabsTrigger>
            </TabsList>

            <TabsContent value="settings" className="space-y-6">
              <Card className="border-border/80 bg-card/90" data-testid="card-server-info">
                <CardHeader>
                  <CardTitle className="text-sm font-semibold uppercase tracking-[0.2em] text-muted-foreground">Server Info</CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-5">
                    <div>
                      <p className="text-xs uppercase tracking-wide text-muted-foreground">Members</p>
                      <p className="mt-1 text-lg font-semibold">{selectedGuildSummary?.memberCount ?? 0}</p>
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

            <TabsContent value="features" className="space-y-0">
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
                        <Badge variant={module.enabled ? "default" : "secondary"}>
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
          </Tabs>
        )}
      </div>
    </div>
  );
}
