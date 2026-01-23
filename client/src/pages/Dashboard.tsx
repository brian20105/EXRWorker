import { useState, useEffect } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Label } from "@/components/ui/label";
import { useToast } from "@/hooks/use-toast";
import { ArrowLeft, Save, Server, Hash, Shield, Settings } from "lucide-react";
import { Link } from "wouter";

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
  const { toast } = useToast();

  useEffect(() => {
    fetch("/api/guilds")
      .then((res) => res.json())
      .then((data) => {
        setGuilds(data);
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

  if (!selectedGuild) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-indigo-50 via-white to-purple-50 p-6">
        <div className="max-w-4xl mx-auto space-y-6">
          <div className="flex items-center gap-4">
            <Link href="/">
              <Button variant="ghost" size="sm" data-testid="button-back">
                <ArrowLeft className="w-4 h-4 mr-2" />
                Back
              </Button>
            </Link>
            <h1 className="text-2xl font-bold">Select a Server</h1>
          </div>

          {loading ? (
            <Card>
              <CardContent className="p-8 text-center text-muted-foreground">
                Loading servers...
              </CardContent>
            </Card>
          ) : guilds.length === 0 ? (
            <Card>
              <CardContent className="p-8 text-center text-muted-foreground">
                No servers found. Make sure the bot is added to at least one server.
              </CardContent>
            </Card>
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
