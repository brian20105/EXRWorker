import React from "react";
import { cn } from "@/lib/utils";

interface EmbedField {
  name: string;
  value: string;
  inline?: boolean;
}

interface DiscordEmbedProps {
  title?: string;
  description?: string;
  fields?: EmbedField[];
  color?: string; // Hex color
  footer?: string;
  timestamp?: string;
  thumbnail?: string;
  author?: {
    name: string;
    icon_url?: string;
  };
}

export function DiscordEmbed({
  title,
  description,
  fields,
  color = "#2B2D31",
  footer,
  timestamp,
  thumbnail,
  author,
}: DiscordEmbedProps) {
  return (
    <div
      className="bg-[#2B2D31] rounded-[4px] max-w-[520px] flex overflow-hidden border-l-[4px]"
      style={{ borderLeftColor: color }}
    >
      <div className="p-4 flex-1 min-w-0 grid gap-2">
        {author && (
          <div className="flex items-center text-sm font-medium text-white mb-1">
            {author.icon_url && <img src={author.icon_url} className="w-6 h-6 rounded-full mr-2" alt="" />}
            {author.name}
          </div>
        )}
        
        {title && <div className="font-bold text-white text-base mb-1">{title}</div>}
        
        {description && (
          <div className="text-discord-text-normal text-sm whitespace-pre-wrap mb-2">
            {description}
          </div>
        )}

        {fields && fields.length > 0 && (
          <div className="grid grid-cols-12 gap-2 mt-1">
            {fields.map((field, idx) => (
              <div
                key={idx}
                className={cn(
                  "col-span-12",
                  field.inline && "col-span-4" // Simplified grid for inline fields
                )}
              >
                <div className="font-bold text-discord-text-header text-xs mb-1">{field.name}</div>
                <div className="text-discord-text-normal text-sm whitespace-pre-wrap">{field.value}</div>
              </div>
            ))}
          </div>
        )}

        {footer && (
          <div className="text-[12px] text-discord-text-muted mt-2 flex items-center">
             {footer}
             {timestamp && <span className="mx-1">•</span>}
             {timestamp && <span>{timestamp}</span>}
          </div>
        )}
      </div>
      {thumbnail && (
         <div className="p-4 pl-0">
             <img src={thumbnail} className="w-[80px] h-[80px] rounded object-cover" alt="thumbnail" />
         </div>
      )}
    </div>
  );
}
