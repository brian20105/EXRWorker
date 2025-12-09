import { useState, useEffect } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { CheckCircle2, Copy, ExternalLink, Terminal, AlertCircle } from "lucide-react";
import { useToast } from "@/hooks/use-toast";

export default function BotSetup() {
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

  const copyToClipboard = (text: string, label: string) => {
    navigator.clipboard.writeText(text);
    toast({
      title: "Copied!",
      description: `${label} copied to clipboard`,
    });
  };

  const inviteUrl = applicationId
    ? `https://discord.com/api/oauth2/authorize?client_id=${applicationId}&permissions=2147486720&scope=bot%20applications.commands`
    : null;

  return (
    <div className="min-h-screen bg-gradient-to-br from-indigo-50 via-white to-purple-50 p-6">
      <div className="max-w-4xl mx-auto space-y-6">
        <div className="text-center space-y-2 pt-8 pb-4">
          <h1 className="text-4xl font-bold bg-gradient-to-r from-indigo-600 to-purple-600 bg-clip-text text-transparent">
            Discord Payout Bot
          </h1>
          <p className="text-gray-600">Manage payout requests in your Discord server</p>
        </div>

        {/* Bot Status Card */}
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
                ? "Your bot is running and ready to accept requests"
                : botStatus === "offline"
                ? "Bot is not responding. Check your credentials."
                : "Checking bot connection..."}
            </CardDescription>
          </CardHeader>
        </Card>

        {/* Invite Bot Card */}
        {inviteUrl && (
          <Card data-testid="card-invite">
            <CardHeader>
              <CardTitle>Step 1: Invite Bot to Your Server</CardTitle>
              <CardDescription>Add the bot to your Discord server with the required permissions</CardDescription>
            </CardHeader>
            <CardContent className="space-y-3">
              <div className="flex gap-2">
                <Button
                  asChild
                  className="flex-1"
                  data-testid="button-invite-bot"
                >
                  <a href={inviteUrl} target="_blank" rel="noopener noreferrer">
                    <ExternalLink className="w-4 h-4 mr-2" />
                    Invite Bot to Server
                  </a>
                </Button>
                <Button
                  variant="outline"
                  onClick={() => copyToClipboard(inviteUrl, "Invite link")}
                  data-testid="button-copy-invite"
                >
                  <Copy className="w-4 h-4" />
                </Button>
              </div>
              <p className="text-xs text-muted-foreground">
                Required permissions: Send Messages, Embed Links, Manage Messages
              </p>
            </CardContent>
          </Card>
        )}

        {/* Setup Instructions Card */}
        <Card data-testid="card-setup-instructions">
          <CardHeader>
            <CardTitle>Step 2: Configure Channels</CardTitle>
            <CardDescription>Set up where payout requests and logs should be sent</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="space-y-2">
              <h4 className="font-semibold flex items-center">
                <Terminal className="w-4 h-4 mr-2 text-indigo-600" />
                Configure Request Channel
              </h4>
              <div className="bg-gray-900 rounded-lg p-4 font-mono text-sm text-gray-100">
                <code>/setup_pay_request channel:#payout-requests</code>
              </div>
              <p className="text-sm text-muted-foreground">
                This sets the channel where payout request forms will be sent after users submit them.
              </p>
            </div>

            <div className="space-y-2">
              <h4 className="font-semibold flex items-center">
                <Terminal className="w-4 h-4 mr-2 text-indigo-600" />
                Configure Log Channel
              </h4>
              <div className="bg-gray-900 rounded-lg p-4 font-mono text-sm text-gray-100">
                <code>/setup_payment_logs channel:#payment-logs</code>
              </div>
              <p className="text-sm text-muted-foreground">
                This sets the channel where approved payment logs will be sent automatically.
              </p>
            </div>

            <div className="space-y-2">
              <h4 className="font-semibold flex items-center">
                <Terminal className="w-4 h-4 mr-2 text-indigo-600" />
                Set Approval Permissions
              </h4>
              <div className="bg-gray-900 rounded-lg p-4 font-mono text-sm text-gray-100">
                <code>/payout_permission role1:@Moderators role2:@Admins</code>
              </div>
              <p className="text-sm text-muted-foreground">
                Sets which roles can approve or deny payout requests. Up to 5 roles can be specified.
              </p>
            </div>
          </CardContent>
        </Card>

        {/* How It Works Card */}
        <Card data-testid="card-how-it-works">
          <CardHeader>
            <CardTitle>How It Works</CardTitle>
            <CardDescription>Payout request workflow</CardDescription>
          </CardHeader>
          <CardContent>
            <ol className="space-y-3 list-decimal list-inside">
              <li className="text-sm">
                <span className="font-medium">User clicks "Request Payout" button</span>
                <p className="ml-6 text-muted-foreground">A modal form appears asking for User ID, Reason, and PayPal details</p>
              </li>
              <li className="text-sm">
                <span className="font-medium">Request is submitted to the configured channel</span>
                <p className="ml-6 text-muted-foreground">The request appears with Approve/Deny buttons for moderators</p>
              </li>
              <li className="text-sm">
                <span className="font-medium">Moderator reviews and takes action</span>
                <p className="ml-6 text-muted-foreground">Only users with permitted roles can approve or deny requests</p>
              </li>
              <li className="text-sm">
                <span className="font-medium">User receives a DM notification</span>
                <p className="ml-6 text-muted-foreground">The requested user gets a direct message when their request is approved or denied</p>
              </li>
              <li className="text-sm">
                <span className="font-medium">Approved requests are logged automatically</span>
                <p className="ml-6 text-muted-foreground">A payment log is sent to the configured log channel</p>
              </li>
            </ol>
          </CardContent>
        </Card>

        {/* Commands Reference Card */}
        <Card data-testid="card-commands">
          <CardHeader>
            <CardTitle>Available Commands</CardTitle>
            <CardDescription>All slash commands for this bot</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="space-y-3">
              <div className="border-l-4 border-indigo-500 pl-4">
                <code className="text-sm font-mono">/setup_pay_request</code>
                <p className="text-sm text-muted-foreground mt-1">Configure the channel for payout requests</p>
              </div>
              <div className="border-l-4 border-purple-500 pl-4">
                <code className="text-sm font-mono">/setup_payment_logs</code>
                <p className="text-sm text-muted-foreground mt-1">Configure the channel for payment logs</p>
              </div>
              <div className="border-l-4 border-green-500 pl-4">
                <code className="text-sm font-mono">/payout_permission</code>
                <p className="text-sm text-muted-foreground mt-1">Set which roles can approve or deny payout requests</p>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
