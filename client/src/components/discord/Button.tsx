import React from "react";
import { cn } from "@/lib/utils";

interface DiscordButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: "primary" | "secondary" | "destructive" | "success" | "link";
  size?: "sm" | "md";
}

export function DiscordButton({ className, variant = "primary", size = "md", ...props }: DiscordButtonProps) {
  const variants = {
    primary: "bg-[#5865F2] hover:bg-[#4752C4] text-white",
    secondary: "bg-[#4E5058] hover:bg-[#6D6F78] text-white",
    destructive: "bg-[#DA373C] hover:bg-[#A1282C] text-white",
    success: "bg-[#23A559] hover:bg-[#1E8E4C] text-white",
    link: "bg-transparent hover:underline text-white p-0 h-auto",
  };

  const sizes = {
    sm: "h-8 px-3 text-sm",
    md: "h-[38px] px-4 text-sm",
  };

  return (
    <button
      className={cn(
        "inline-flex items-center justify-center rounded-[3px] font-medium transition-colors focus-visible:outline-none focus-visible:ring-0 disabled:opacity-50 disabled:pointer-events-none",
        variants[variant],
        variant !== "link" && sizes[size],
        className
      )}
      {...props}
    />
  );
}
