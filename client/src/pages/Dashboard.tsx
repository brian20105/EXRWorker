import { useState, useEffect } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Label } from "@/components/ui/label";
import { useToast } from "@/hooks/use-toast";
import { ArrowLeft, Save, Server, Hash, Shield, CheckCircle2, AlertCircle, ExternalLink, Copy } from "lucide-react";

interface Guild {
  id: string;
  name: string;
  icon: string | null;
  memberCount: number;
}

interface Channel {
  id: string;
  name: string;
}

interface Role {
  id: string;
  name: string;
  color: string;
}

interface GuildConfig {
  requestChannelId?: string;
  logChannelId?: string;
  modmailChannelId?: string;
  modmailLogChannelId?: string;
  appealChannelId?: string;
  quizLogChannelId?: string;
  allowedRoleIds?: string[];
  modRoleIds?: string[];
  modmailBlockRoleIds?: string[];
  modmailClaimRoleIds?: string[];
  snippetRoleIds?: string[];
  activityRoleIds?: string[];
}

export default function Dashboard() {
  const [guilds, setGuilds] = useState<Guild[]>([]);
  const [selectedGuild, setSelectedGuild] = useState<string | null>(null);
  const [config, setConfig] = useState<GuildConfig>({});
  const [channels, setChannels] = useState<Channel[]>([]);
  const [roles, setRoles] = useState<Role[]>([]);
  const [guildName, setGuildName] = useState("");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [botStatus, setBotStatus] = useState<"checking" | "online" | "offline">("checking");
  const [applicationId, setApplicationId] = useState<string | null>(null);
  const { toast } = useToast();

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
    fetch("/api/guilds")
      .then((res) => res.json())
      .then((data) => {
        // Only set guilds if data is an array (handles error responses)
        if (Array.isArray(data)) {
          setGuilds(data);
        }
        setLoading(false);
      })
      .catch(() => setLoading(false));
  }, []);

  useEffect(() => {
    if (selectedGuild) {
      setLoading(true);
      fetch(`/api/guilds/${selectedGuild}/config`)
        .then((res) => res.json())
        .then((data) => {
          setConfig(data.config || {});
          setChannels(data.channels || []);
          setRoles(data.roles || []);
          setGuildName(data.guildName || "");
          setLoading(false);
        })
        .catch(() => setLoading(false));
    }
  }, [selectedGuild]);

  const saveConfig = async () => {
    if (!selectedGuild) return;
    setSaving(true);
    try {
      const res = await fetch(`/api/guilds/${selectedGuild}/config`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(config),
      });
      const data = await res.json();
      if (data.success) {
        toast({ title: "Saved!", description: "Configuration updated successfully" });
      } else {
        toast({ title: "Error", description: data.error, variant: "destructive" });
      }
    } catch (e) {
      toast({ title: "Error", description: "Failed to save configuration", variant: "destructive" });
    }
    setSaving(false);
  };

  const updateConfig = (key: keyof GuildConfig, value: any) => {
    setConfig((prev) => ({ ...prev, [key]: value }));
  };

  const toggleRole = (key: keyof GuildConfig, roleId: string) => {
    const current = (config[key] as string[]) || [];
    if (current.includes(roleId)) {
      updateConfig(key, current.filter((id) => id !== roleId));
    } else {
      updateConfig(key, [...current, roleId]);
    }
  };

  const inviteUrl = applicationId
    ? `https://discord.com/api/oauth2/authorize?client_id=${applicationId}&permissions=2147486720&scope=bot%20applications.commands`
    : null;

  const copyToClipboard = (text: string, label: string) => {
    navigator.clipboard.writeText(text);
    toast({ title: "Copied!", description: `${label} copied to clipboard` });
  };

  if (!selectedGuild) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-indigo-50 via-white to-purple-50 p-6">
        <div className="max-w-4xl mx-auto space-y-6">
          <div className="text-center space-y-2 pt-8 pb-4">
            <h1 className="text-4xl font-bold bg-gradient-to-r from-indigo-600 to-purple-600 bg-clip-text text-transparent">
              Discord Bot Dashboard
            </h1>
            <p className="text-gray-600">Configure your bot settings from here</p>
          </div>

          <Card data-testid="card-bot-status">
            <CardHeader>
              <div className="flex items-center justify-between">
                <CardTitle>Bot Status</CardTitle>
                {botStatus === "online" && (
                  <Badge variant="default" className="bg-green-500" data-testid="badge-status-online">
                    <CheckCircle2 className="w-3 h-3 mr-1" />
                    Online
                  </Badge>
                )}
                {botStatus === "offline" && (
                  <Badge variant="destructive" data-testid="badge-status-offline">
                    <AlertCircle className="w-3 h-3 mr-1" />
                    Offline
                  </Badge>
                )}
                {botStatus === "checking" && (
                  <Badge variant="secondary" data-testid="badge-status-checking">
                    Checking...
                  </Badge>
                )}
              </div>
              <CardDescription>
                {botStatus === "online"
                  ? "Your bot is running and ready"
                  : botStatus === "offline"
                  ? "Bot is not responding. Check your credentials."
                  : "Checking bot connection..."}
              </CardDescription>
            </CardHeader>
            {inviteUrl && (
              <CardContent className="pt-0">
                <div className="flex gap-2">
                  <Button asChild className="flex-1" data-testid="button-invite-bot">
                    <a href={inviteUrl} target="_blank" rel="noopener noreferrer">
                      <ExternalLink className="w-4 h-4 mr-2" />
                      Add Bot to Server
                    </a>
                  </Button>
                  <Button variant="outline" onClick={() => copyToClipboard(inviteUrl, "Invite link")} data-testid="button-copy-invite">
                    <Copy className="w-4 h-4" />
                  </Button>
                </div>
              </CardContent>
            )}
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Select a Server to Configure</CardTitle>
              <CardDescription>Choose a server to manage its bot settings</CardDescription>
            </CardHeader>
            <CardContent>
              {loading ? (
                <p className="text-center text-muted-foreground py-4">Loading servers...</p>
              ) : guilds.length === 0 ? (
                <p className="text-center text-muted-foreground py-4">
                  No servers found. Add the bot to a server first using the invite link above.
                </p>
              ) : (
                <div className="grid gap-4 md:grid-cols-2">
                  {guilds.map((guild) => (
                    <Card
                      key={guild.id}
                      className="cursor-pointer hover:border-indigo-300 transition-colors"
                      onClick={() => setSelectedGuild(guild.id)}
                      data-testid={`card-guild-${guild.id}`}
                    >
                      <CardContent className="p-4 flex items-center gap-4">
                        {guild.icon ? (
                          <img src={guild.icon} alt={guild.name} className="w-12 h-12 rounded-full" />
                        ) : (
                          <div className="w-12 h-12 rounded-full bg-indigo-100 flex items-center justify-center">
                            <Server className="w-6 h-6 text-indigo-600" />
                          </div>
                        )}
                        <div>
                          <h3 className="font-semibold">{guild.name}</h3>
                          <p className="text-sm text-muted-foreground">{guild.memberCount} members</p>
                        </div>
                      </CardContent>
                    </Card>
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
    <div className="min-h-screen bg-gradient-to-br from-indigo-50 via-white to-purple-50 p-6">
      <div className="max-w-4xl mx-auto space-y-6">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-4">
            <Button variant="ghost" size="sm" onClick={() => setSelectedGuild(null)} data-testid="button-back-guilds">
              <ArrowLeft className="w-4 h-4 mr-2" />
              Servers
            </Button>
            <h1 className="text-2xl font-bold">{guildName}</h1>
          </div>
          <Button onClick={saveConfig} disabled={saving} data-testid="button-save">
            <Save className="w-4 h-4 mr-2" />
            {saving ? "Saving..." : "Save Changes"}
          </Button>
        </div>

        <Card data-testid="card-channels">
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Hash className="w-5 h-5" />
              Channel Configuration
            </CardTitle>
            <CardDescription>Set which channels the bot uses for different features</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid gap-4 md:grid-cols-2">
              <div className="space-y-2">
                <Label>Payout Request Channel</Label>
                <Select
                  value={config.requestChannelId || ""}
                  onValueChange={(v) => updateConfig("requestChannelId", v)}
                >
                  <SelectTrigger data-testid="select-request-channel">
                    <SelectValue placeholder="Select channel" />
                  </SelectTrigger>
                  <SelectContent>
                    {channels.map((c) => (
                      <SelectItem key={c.id} value={c.id}>#{c.name}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-2">
                <Label>Payment Log Channel</Label>
                <Select
                  value={config.logChannelId || ""}
                  onValueChange={(v) => updateConfig("logChannelId", v)}
                >
                  <SelectTrigger data-testid="select-log-channel">
                    <SelectValue placeholder="Select channel" />
                  </SelectTrigger>
                  <SelectContent>
                    {channels.map((c) => (
                      <SelectItem key={c.id} value={c.id}>#{c.name}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-2">
                <Label>Modmail Category/Channel</Label>
                <Select
                  value={config.modmailChannelId || ""}
                  onValueChange={(v) => updateConfig("modmailChannelId", v)}
                >
                  <SelectTrigger data-testid="select-modmail-channel">
                    <SelectValue placeholder="Select channel" />
                  </SelectTrigger>
                  <SelectContent>
                    {channels.map((c) => (
                      <SelectItem key={c.id} value={c.id}>#{c.name}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-2">
                <Label>Modmail Log Channel</Label>
                <Select
                  value={config.modmailLogChannelId || ""}
                  onValueChange={(v) => updateConfig("modmailLogChannelId", v)}
                >
                  <SelectTrigger data-testid="select-modmail-log-channel">
                    <SelectValue placeholder="Select channel" />
                  </SelectTrigger>
                  <SelectContent>
                    {channels.map((c) => (
                      <SelectItem key={c.id} value={c.id}>#{c.name}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-2">
                <Label>Appeal Channel</Label>
                <Select
                  value={config.appealChannelId || ""}
                  onValueChange={(v) => updateConfig("appealChannelId", v)}
                >
                  <SelectTrigger data-testid="select-appeal-channel">
                    <SelectValue placeholder="Select channel" />
                  </SelectTrigger>
                  <SelectContent>
                    {channels.map((c) => (
                      <SelectItem key={c.id} value={c.id}>#{c.name}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-2">
                <Label>Quiz Log Channel</Label>
                <Select
                  value={config.quizLogChannelId || ""}
                  onValueChange={(v) => updateConfig("quizLogChannelId", v)}
                >
                  <SelectTrigger data-testid="select-quiz-log-channel">
                    <SelectValue placeholder="Select channel" />
                  </SelectTrigger>
                  <SelectContent>
                    {channels.map((c) => (
                      <SelectItem key={c.id} value={c.id}>#{c.name}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>
          </CardContent>
        </Card>

        <Card data-testid="card-permissions">
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Shield className="w-5 h-5" />
              Permission Roles
            </CardTitle>
            <CardDescription>Configure which roles can use different features</CardDescription>
          </CardHeader>
          <CardContent className="space-y-6">
            <div className="space-y-3">
              <Label>Payout Approval Roles</Label>
              <div className="flex flex-wrap gap-2">
                {roles.map((role) => (
                  <Badge
                    key={role.id}
                    variant={(config.allowedRoleIds || []).includes(role.id) ? "default" : "outline"}
                    className="cursor-pointer"
                    style={{
                      backgroundColor: (config.allowedRoleIds || []).includes(role.id) ? role.color : undefined,
                      borderColor: role.color,
                    }}
                    onClick={() => toggleRole("allowedRoleIds", role.id)}
                    data-testid={`badge-payout-role-${role.id}`}
                  >
                    {role.name}
                  </Badge>
                ))}
              </div>
            </div>

            <div className="space-y-3">
              <Label>Moderation Roles (Ban/Unban Approval)</Label>
              <div className="flex flex-wrap gap-2">
                {roles.map((role) => (
                  <Badge
                    key={role.id}
                    variant={(config.modRoleIds || []).includes(role.id) ? "default" : "outline"}
                    className="cursor-pointer"
                    style={{
                      backgroundColor: (config.modRoleIds || []).includes(role.id) ? role.color : undefined,
                      borderColor: role.color,
                    }}
                    onClick={() => toggleRole("modRoleIds", role.id)}
                    data-testid={`badge-mod-role-${role.id}`}
                  >
                    {role.name}
                  </Badge>
                ))}
              </div>
            </div>

            <div className="space-y-3">
              <Label>Modmail Block Roles</Label>
              <div className="flex flex-wrap gap-2">
                {roles.map((role) => (
                  <Badge
                    key={role.id}
                    variant={(config.modmailBlockRoleIds || []).includes(role.id) ? "default" : "outline"}
                    className="cursor-pointer"
                    style={{
                      backgroundColor: (config.modmailBlockRoleIds || []).includes(role.id) ? role.color : undefined,
                      borderColor: role.color,
                    }}
                    onClick={() => toggleRole("modmailBlockRoleIds", role.id)}
                    data-testid={`badge-block-role-${role.id}`}
                  >
                    {role.name}
                  </Badge>
                ))}
              </div>
            </div>

            <div className="space-y-3">
              <Label>Modmail Claim Roles</Label>
              <div className="flex flex-wrap gap-2">
                {roles.map((role) => (
                  <Badge
                    key={role.id}
                    variant={(config.modmailClaimRoleIds || []).includes(role.id) ? "default" : "outline"}
                    className="cursor-pointer"
                    style={{
                      backgroundColor: (config.modmailClaimRoleIds || []).includes(role.id) ? role.color : undefined,
                      borderColor: role.color,
                    }}
                    onClick={() => toggleRole("modmailClaimRoleIds", role.id)}
                    data-testid={`badge-claim-role-${role.id}`}
                  >
                    {role.name}
                  </Badge>
                ))}
              </div>
            </div>

            <div className="space-y-3">
              <Label>Snippet Roles</Label>
              <div className="flex flex-wrap gap-2">
                {roles.map((role) => (
                  <Badge
                    key={role.id}
                    variant={(config.snippetRoleIds || []).includes(role.id) ? "default" : "outline"}
                    className="cursor-pointer"
                    style={{
                      backgroundColor: (config.snippetRoleIds || []).includes(role.id) ? role.color : undefined,
                      borderColor: role.color,
                    }}
                    onClick={() => toggleRole("snippetRoleIds", role.id)}
                    data-testid={`badge-snippet-role-${role.id}`}
                  >
                    {role.name}
                  </Badge>
                ))}
              </div>
            </div>

            <div className="space-y-3">
              <Label>Activity Command Roles</Label>
              <div className="flex flex-wrap gap-2">
                {roles.map((role) => (
                  <Badge
                    key={role.id}
                    variant={(config.activityRoleIds || []).includes(role.id) ? "default" : "outline"}
                    className="cursor-pointer"
                    style={{
                      backgroundColor: (config.activityRoleIds || []).includes(role.id) ? role.color : undefined,
                      borderColor: role.color,
                    }}
                    onClick={() => toggleRole("activityRoleIds", role.id)}
                    data-testid={`badge-activity-role-${role.id}`}
                  >
                    {role.name}
                  </Badge>
                ))}
              </div>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
