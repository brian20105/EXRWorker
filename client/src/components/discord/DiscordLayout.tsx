import React from "react";
import { cn } from "@/lib/utils";
import { Hash, Volume2, Settings, Mic, Headphones } from "lucide-react";

interface DiscordLayoutProps {
  children: React.ReactNode;
  channelName: string;
  channels: { id: string; name: string; type: "text" | "voice" }[];
  activeChannelId: string;
  onChannelSelect: (id: string) => void;
}

export function DiscordLayout({
  children,
  channelName,
  channels,
  activeChannelId,
  onChannelSelect,
}: DiscordLayoutProps) {
  return (
    <div className="flex h-screen w-full overflow-hidden bg-discord-bg text-discord-text-normal font-sans">
      {/* Server Rail - Static for now */}
      <div className="w-[72px] flex flex-col items-center py-3 space-y-2 bg-discord-server-rail flex-shrink-0">
        <div className="w-12 h-12 rounded-[24px] hover:rounded-[16px] transition-all duration-200 bg-discord-blurple flex items-center justify-center text-white cursor-pointer mb-2">
          <img src="https://assets.stickpng.com/images/580b57fcd9996e24bc43c526.png" className="w-8 h-8 invert" alt="Home" />
        </div>
        <div className="w-8 h-[2px] bg-discord-bg rounded-full opacity-50 mb-2" />
        <div className="w-12 h-12 rounded-[24px] bg-discord-bg hover:bg-discord-blurple hover:rounded-[16px] transition-all duration-200 flex items-center justify-center cursor-pointer group relative">
          <div className="absolute left-0 w-1 h-8 bg-white rounded-r-full -ml-4 opacity-100" />
          <span className="font-bold text-discord-text-header">TW</span>
        </div>
      </div>

      {/* Sidebar */}
      <div className="w-60 flex flex-col bg-discord-sidebar flex-shrink-0">
        {/* Header */}
        <div className="h-12 border-b border-discord-divider px-4 flex items-center shadow-sm font-bold text-discord-text-header hover:bg-white/5 cursor-pointer transition-colors">
          Thrill Worker
        </div>

        {/* Channels */}
        <div className="flex-1 overflow-y-auto py-3 px-2 space-y-[2px]">
          {channels.map((channel) => (
            <div
              key={channel.id}
              onClick={() => onChannelSelect(channel.id)}
              className={cn(
                "group flex items-center px-2 py-[6px] rounded-[4px] cursor-pointer mx-2 transition-colors",
                activeChannelId === channel.id
                  ? "bg-white/10 text-discord-text-header"
                  : "text-discord-text-muted hover:bg-white/5 hover:text-discord-text-header"
              )}
            >
              <Hash className="w-5 h-5 mr-1.5 opacity-60" />
              <span className="font-medium truncate">{channel.name}</span>
            </div>
          ))}
        </div>

        {/* User Area */}
        <div className="h-[52px] bg-[#232428] px-2 flex items-center flex-shrink-0">
          <div className="flex items-center p-1 rounded hover:bg-white/5 cursor-pointer mr-auto">
            <div className="w-8 h-8 rounded-full bg-discord-blurple mr-2 relative">
              <div className="absolute bottom-0 right-0 w-2.5 h-2.5 bg-discord-green rounded-full border-[2px] border-[#232428]" />
            </div>
            <div className="text-sm">
              <div className="font-bold text-white text-xs leading-tight">Admin User</div>
              <div className="text-[10px] text-discord-text-muted">#1234</div>
            </div>
          </div>
          <div className="flex items-center">
            <div className="p-1.5 hover:bg-white/10 rounded cursor-pointer">
              <Mic className="w-4 h-4 text-discord-text-normal" />
            </div>
            <div className="p-1.5 hover:bg-white/10 rounded cursor-pointer">
              <Headphones className="w-4 h-4 text-discord-text-normal" />
            </div>
            <div className="p-1.5 hover:bg-white/10 rounded cursor-pointer">
              <Settings className="w-4 h-4 text-discord-text-normal" />
            </div>
          </div>
        </div>
      </div>

      {/* Main Chat Area */}
      <div className="flex-1 flex flex-col min-w-0 bg-discord-bg">
        {/* Header */}
        <div className="h-12 border-b border-discord-divider px-4 flex items-center flex-shrink-0 shadow-sm">
          <Hash className="w-6 h-6 text-discord-text-muted mr-2" />
          <span className="font-bold text-white mr-4">{channelName}</span>
          <div className="border-l border-discord-divider h-6 mx-2" />
          <span className="text-xs text-discord-text-muted truncate">
            Simulated environment for bot testing
          </span>
        </div>

        {/* Messages */}
        <div className="flex-1 overflow-y-auto flex flex-col custom-scrollbar">
            {children}
        </div>
      </div>
    </div>
  );
}
