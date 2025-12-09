import React from "react";
import { cn } from "@/lib/utils";

interface DiscordMessageProps {
  id: string;
  author: string;
  avatar?: string;
  content?: string;
  timestamp: string;
  isBot?: boolean;
  embeds?: React.ReactNode[];
  components?: React.ReactNode; // Buttons, etc.
}

export function DiscordMessage({
  author,
  avatar,
  content,
  timestamp,
  isBot,
  embeds,
  components,
}: DiscordMessageProps) {
  return (
    <div className="group flex px-4 py-[2px] hover:bg-[#2e3035] mt-[17px] first:mt-[10px] mb-[2px]">
      <div className="w-10 h-10 rounded-full bg-gray-600 mr-4 flex-shrink-0 overflow-hidden mt-0.5 cursor-pointer hover:opacity-80 transition-opacity">
        {avatar ? (
          <img src={avatar} alt={author} className="w-full h-full object-cover" />
        ) : (
          <div className="w-full h-full flex items-center justify-center text-white font-bold text-sm">
            {author.substring(0, 2).toUpperCase()}
          </div>
        )}
      </div>
      <div className="flex-1 min-w-0">
        <div className="flex items-center mb-1">
          <span className={cn("font-medium mr-2 cursor-pointer hover:underline", isBot ? "text-white" : "text-white")}>
            {author}
          </span>
          {isBot && (
            <span className="bg-[#5865F2] text-white text-[10px] px-1.5 rounded-[3px] py-[1px] mr-2 flex items-center h-[15px] font-medium">
              BOT
              <span className="ml-1 text-[8px]">✓</span>
            </span>
          )}
          <span className="text-xs text-discord-text-muted">{timestamp}</span>
        </div>
        {content && <div className="text-discord-text-normal whitespace-pre-wrap leading-[1.375rem]">{content}</div>}
        {embeds && <div className="mt-2 space-y-2">{embeds}</div>}
        {components && <div className="mt-2">{components}</div>}
      </div>
    </div>
  );
}
