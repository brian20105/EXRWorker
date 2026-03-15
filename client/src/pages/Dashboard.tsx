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
import { useToast } from "@/hooks/use-toast";
import { ArrowLeft, Save, Server, Shield, CheckCircle2, AlertCircle, ExternalLink, Copy, Hash, Braces, Moon, Sun, ChevronDown } from "lucide-react";
import { useTheme } from "next-themes";

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

const NONE_VALUE = "__none";
const CATEGORY_CHANNEL_TYPE = 4;
const TEXT_CHANNEL_TYPES = new Set([0, 5]);

export default function Dashboard() {
  const [guilds, setGuilds] = useState<Guild[]>([]);
  const [selectedGuild, setSelectedGuild] = useState<string | null>(null);
  const [config, setConfig] = useState<GuildConfig>({ commandPrefix: "." });
  const [channels, setChannels] = useState<Channel[]>([]);
  const [roles, setRoles] = useState<Role[]>([]);
  const [guildName, setGuildName] = useState("");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [botStatus, setBotStatus] = useState<"checking" | "online" | "offline">("checking");
  const [applicationId, setApplicationId] = useState<string | null>(null);
  const [themeMounted, setThemeMounted] = useState(false);
  const [currentUser, setCurrentUser] = useState<AuthUser | null>(null);
  const [roleSearches, setRoleSearches] = useState<Record<string, string>>({});
  const [customCategoryPingsText, setCustomCategoryPingsText] = useState("{}");
  const [customModmailCategoriesText, setCustomModmailCategoriesText] = useState("[]");
  const { theme, setTheme } = useTheme();
  const { toast } = useToast();

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

  const inviteUrl = applicationId
    ? `https://discord.com/api/oauth2/authorize?client_id=${applicationId}&permissions=2147486720&scope=bot%20applications.commands`
    : null;

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

  const updateConfig = <K extends keyof GuildConfig>(key: K, value: GuildConfig[K]) => {
    setConfig((prev) => ({ ...prev, [key]: value }));
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

    const parsedCategoryPings = parseJsonField(customCategoryPingsText, "Custom Category Pings");
    if (parsedCategoryPings === undefined) return;

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

  const renderChannelSelect = (
    label: string,
    key: keyof GuildConfig,
    options: Channel[],
    testId: string,
  ) => {
    const value = (config[key] as string | null | undefined) || NONE_VALUE;
    return (
      <div className="space-y-2">
        <Label>{label}</Label>
        <Select
          value={value}
          onValueChange={(next) => updateConfig(key, (next === NONE_VALUE ? null : next) as GuildConfig[typeof key])}
        >
          <SelectTrigger data-testid={testId}>
            <SelectValue placeholder="Select channel" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value={NONE_VALUE}>Not set</SelectItem>
            {options.map((channel) => (
              <SelectItem key={channel.id} value={channel.id}>#{channel.name}</SelectItem>
            ))}
          </SelectContent>
        </Select>
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
                  {botStatus === "checking" && <Badge variant="secondary">Checking</Badge>}
                </div>
              </div>
            </CardHeader>
            {inviteUrl && (
              <CardContent className="flex flex-wrap gap-2 pt-0">
                <Button asChild className="min-w-[220px] flex-1" data-testid="button-invite-bot">
                  <a href={inviteUrl} target="_blank" rel="noopener noreferrer">
                    <ExternalLink className="mr-2 h-4 w-4" />
                    Add Bot to Server
                  </a>
                </Button>
                <Button variant="outline" onClick={() => copyToClipboard(inviteUrl, "Invite link")} data-testid="button-copy-invite">
                  <Copy className="h-4 w-4" />
                </Button>
              </CardContent>
            )}
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
                    <button
                      key={guild.id}
                      type="button"
                      className="group text-left"
                      onClick={() => setSelectedGuild(guild.id)}
                      data-testid={`card-guild-${guild.id}`}
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
            <Button variant="ghost" size="sm" onClick={() => setSelectedGuild(null)} data-testid="button-back-guilds">
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
        ) : (
          <Card className="border-border/80 bg-card/90" data-testid="card-bot-settings">
            <CardHeader className="space-y-1">
              <CardTitle className="text-sm font-semibold uppercase tracking-[0.2em] text-muted-foreground">Bot Settings</CardTitle>
              <CardDescription>Configure from web and slash commands using the same settings store.</CardDescription>
            </CardHeader>
            <CardContent className="space-y-8">
              <section className="grid gap-6 lg:grid-cols-2">
                <div className="space-y-6 rounded-lg border border-border/70 bg-muted/20 p-4">
                  <div className="space-y-2">
                    <Label>Command Prefix</Label>
                    <Input
                      value={config.commandPrefix || "."}
                      maxLength={3}
                      onChange={(e) => updateConfig("commandPrefix", e.target.value)}
                      placeholder="?"
                      data-testid="input-command-prefix"
                    />
                  </div>
                  {renderChannelSelect("Command Log Channel", "commandLogChannelId", textChannels, "select-command-log-channel")}
                  {renderChannelSelect("Moderation Log Channel", "modLogChannelId", textChannels, "select-mod-log-channel")}
                  {renderChannelSelect("Quiz Log Channel", "quizLogChannelId", textChannels, "select-quiz-log-channel")}
                </div>

                <div className="space-y-6 rounded-lg border border-border/70 bg-muted/20 p-4">
                  {renderRoleSection("Manager Roles (Owner/Administrator)", "modRoleIds", "badge-mod-role")}
                  {renderRoleSection("Modmail Staff Roles", "modmailStaffRoleIds", "badge-modmail-staff-role")}
                  {renderRoleSection("Appeal Staff Roles", "appealStaffRoleIds", "badge-appeal-staff-role")}
                </div>
              </section>

              <Tabs defaultValue="channels" className="space-y-4">
                <TabsList className="grid h-auto w-full grid-cols-2 gap-2 p-1 md:grid-cols-4">
                  <TabsTrigger value="channels"><Hash className="mr-2 h-4 w-4" />Channels</TabsTrigger>
                  <TabsTrigger value="roles"><Shield className="mr-2 h-4 w-4" />Role Access</TabsTrigger>
                  <TabsTrigger value="embeds">Embeds</TabsTrigger>
                  <TabsTrigger value="advanced"><Braces className="mr-2 h-4 w-4" />Advanced</TabsTrigger>
                </TabsList>

                <TabsContent value="channels">
                  <div className="grid gap-4 rounded-lg border border-border/70 bg-muted/20 p-4 md:grid-cols-2">
                    {renderChannelSelect("Payout Request Channel", "requestChannelId", textChannels, "select-request-channel")}
                    {renderChannelSelect("Payout Log Channel", "logChannelId", textChannels, "select-log-channel")}
                    {renderChannelSelect("Modmail Category", "modmailCategoryId", categoryChannels, "select-modmail-category")}
                    {renderChannelSelect("Modmail Log Channel", "modmailLogChannelId", textChannels, "select-modmail-log-channel")}
                    {renderChannelSelect("Appeal Category", "appealCategoryId", categoryChannels, "select-appeal-category")}
                    {renderChannelSelect("Appeal Log Channel", "appealLogChannelId", textChannels, "select-appeal-log-channel")}
                    {renderChannelSelect("Staff Intro Channel", "staffIntroChannelId", textChannels, "select-staff-intro-channel")}
                    {renderChannelSelect("Staff Intro Submission Channel", "staffIntroSubmissionsChannelId", textChannels, "select-staff-intro-submissions-channel")}
                    {renderChannelSelect("Inactivity Channel", "inactivityChannelId", textChannels, "select-inactivity-channel")}
                    {renderChannelSelect("Inactivity Submission Channel", "inactivitySubmissionsChannelId", textChannels, "select-inactivity-submissions-channel")}
                    {renderChannelSelect("Inactivity Log Channel", "inactivityLogChannelId", textChannels, "select-inactivity-log-channel")}
                  </div>
                </TabsContent>

                <TabsContent value="roles">
                  <div className="space-y-6 rounded-lg border border-border/70 bg-muted/20 p-4">
                    {renderRoleSection("Payout Approval Roles", "allowedRoleIds", "badge-payout-role")}
                    {renderRoleSection("Modmail Block Roles", "modmailBlockRoleIds", "badge-modmail-block-role")}
                    {renderRoleSection("Modmail Claim Roles", "modmailClaimRoleIds", "badge-modmail-claim-role")}
                    {renderRoleSection("Snippet Roles", "snippetRoleIds", "badge-snippet-role")}
                    {renderRoleSection("Activity Command Roles", "activityRoleIds", "badge-activity-role")}
                    {renderRoleSection("Message Command Roles", "messageCommandRoleIds", "badge-message-role")}
                    {renderRoleSection("Roster Command Roles", "rosterCommandRoleIds", "badge-roster-role")}
                    {renderRoleSection("Role Command Roles", "roleCommandRoleIds", "badge-rolecmd-role")}
                    {renderRoleSection("Tracked Activity Roles", "activityTrackedRoleIds", "badge-tracked-role")}
                    {renderRoleSection("Activity Reset Roles", "activityResetRoleIds", "badge-reset-role")}
                    {renderRoleSection("Inactivity Ping Roles", "inactivityPingRoleIds", "badge-inactivity-role")}
                  </div>
                </TabsContent>

                <TabsContent value="embeds">
                  <div className="space-y-6 rounded-lg border border-border/70 bg-muted/20 p-4">
                    <div className="grid gap-4 md:grid-cols-2">
                      <div className="space-y-2">
                        <Label>Modmail Embed Title</Label>
                        <Input value={config.modmailEmbedTitle || ""} onChange={(e) => updateConfig("modmailEmbedTitle", e.target.value)} />
                      </div>
                      <div className="space-y-2">
                        <Label>Appeal Embed Title</Label>
                        <Input value={config.appealEmbedTitle || ""} onChange={(e) => updateConfig("appealEmbedTitle", e.target.value)} />
                      </div>
                    </div>
                    <div className="grid gap-4 md:grid-cols-2">
                      <div className="space-y-2">
                        <Label>Modmail Embed Description</Label>
                        <Textarea value={config.modmailEmbedDescription || ""} onChange={(e) => updateConfig("modmailEmbedDescription", e.target.value)} />
                      </div>
                      <div className="space-y-2">
                        <Label>Appeal Embed Description</Label>
                        <Textarea value={config.appealEmbedDescription || ""} onChange={(e) => updateConfig("appealEmbedDescription", e.target.value)} />
                      </div>
                    </div>

                    <Separator />

                    <div className="grid gap-4 md:grid-cols-2">
                      <div className="space-y-2">
                        <Label>Staff Intro Embed Title</Label>
                        <Input value={config.staffIntroEmbedTitle || ""} onChange={(e) => updateConfig("staffIntroEmbedTitle", e.target.value)} />
                      </div>
                      <div className="space-y-2">
                        <Label>Inactivity Embed Title</Label>
                        <Input value={config.inactivityEmbedTitle || ""} onChange={(e) => updateConfig("inactivityEmbedTitle", e.target.value)} />
                      </div>
                    </div>
                    <div className="grid gap-4 md:grid-cols-2">
                      <div className="space-y-2">
                        <Label>Staff Intro Embed Description</Label>
                        <Textarea value={config.staffIntroEmbedDescription || ""} onChange={(e) => updateConfig("staffIntroEmbedDescription", e.target.value)} />
                      </div>
                      <div className="space-y-2">
                        <Label>Inactivity Embed Description</Label>
                        <Textarea value={config.inactivityEmbedDescription || ""} onChange={(e) => updateConfig("inactivityEmbedDescription", e.target.value)} />
                      </div>
                    </div>
                  </div>
                </TabsContent>

                <TabsContent value="advanced">
                  <div className="space-y-6 rounded-lg border border-border/70 bg-muted/20 p-4">
                    <div className="space-y-2">
                      <Label>customCategoryPings (JSON object)</Label>
                      <Textarea
                        value={customCategoryPingsText}
                        onChange={(e) => setCustomCategoryPingsText(e.target.value)}
                        className="min-h-[180px] font-mono text-xs"
                        data-testid="textarea-custom-category-pings"
                      />
                    </div>
                    <div className="space-y-2">
                      <Label>customModmailCategories (JSON array)</Label>
                      <Textarea
                        value={customModmailCategoriesText}
                        onChange={(e) => setCustomModmailCategoriesText(e.target.value)}
                        className="min-h-[180px] font-mono text-xs"
                        data-testid="textarea-custom-modmail-categories"
                      />
                    </div>
                  </div>
                </TabsContent>
              </Tabs>
            </CardContent>
          </Card>
        )}
      </div>
    </div>
  );
}
