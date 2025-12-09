import React from "react";
import * as DialogPrimitive from "@radix-ui/react-dialog";
import { X } from "lucide-react";
import { cn } from "@/lib/utils";

interface DiscordModalProps {
  isOpen: boolean;
  onClose: () => void;
  title: string;
  children: React.ReactNode;
  footer?: React.ReactNode;
}

export function DiscordModal({ isOpen, onClose, title, children, footer }: DiscordModalProps) {
  return (
    <DialogPrimitive.Root open={isOpen} onOpenChange={onClose}>
      <DialogPrimitive.Portal>
        <DialogPrimitive.Overlay className="fixed inset-0 z-50 bg-black/70 animate-in fade-in duration-200" />
        <DialogPrimitive.Content className="fixed left-[50%] top-[50%] z-50 grid w-full max-w-[440px] translate-x-[-50%] translate-y-[-50%] gap-4 bg-[#313338] shadow-lg duration-200 animate-in zoom-in-95 sm:rounded-[5px] flex flex-col p-0 overflow-hidden">
          <div className="flex flex-col space-y-1.5 px-4 pt-6 pb-2">
            <h2 className="text-xl font-bold leading-none tracking-tight text-white">{title}</h2>
          </div>
          <div className="px-4 py-2">
            {children}
          </div>
          {footer && (
            <div className="bg-[#2B2D31] p-4 flex justify-end space-x-2">
              {footer}
            </div>
          )}
          {/* Close button not usually on discord modals like this, but good for UX */}
        </DialogPrimitive.Content>
      </DialogPrimitive.Portal>
    </DialogPrimitive.Root>
  );
}
