import React, { useState, useEffect, useRef } from "react";
import { DiscordLayout } from "@/components/discord/DiscordLayout";
import { DiscordMessage } from "@/components/discord/Message";
import { DiscordEmbed } from "@/components/discord/Embed";
import { DiscordModal } from "@/components/discord/Modal";
import { DiscordButton } from "@/components/discord/Button";
import { PlusCircle, Hash } from "lucide-react";

type MessageData = {
  id: string;
  author: string;
  avatar?: string;
  content?: string;
  timestamp: string;
  isBot?: boolean;
  channelId: string;
  embeds?: any[]; // Simplified
  components?: any; // Simplified
};

type Channel = {
  id: string;
  name: string;
  type: "text" | "voice";
};

export default function DiscordPrototype() {
  const [channels, setChannels] = useState<Channel[]>([
    { id: "general", name: "general", type: "text" },
    { id: "payout-requests", name: "payout-requests", type: "text" },
    { id: "logs", name: "logs", type: "text" },
  ]);
  const [activeChannelId, setActiveChannelId] = useState("general");
  const [inputValue, setInputValue] = useState("");
  const [messages, setMessages] = useState<MessageData[]>([
    {
      id: "1",
      author: "Thrill Worker",
      isBot: true,
      timestamp: "Today at 12:00 PM",
      content: "Bot is online. Type `/setup pay request #channel` to start.",
      channelId: "general",
      avatar: "https://api.dicebear.com/7.x/bottts/svg?seed=ThrillWorker",
    },
  ]);

  const [isPayoutModalOpen, setIsPayoutModalOpen] = useState(false);
  const [modalData, setModalData] = useState({ userId: "", reason: "", paypal: "" });

  // Config State
  const [requestChannel, setRequestChannel] = useState<string | null>(null);
  const [logChannel, setLogChannel] = useState<string | null>(null);

  const scrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [messages, activeChannelId]);

  const handleSendMessage = (e?: React.FormEvent) => {
    e?.preventDefault();
    if (!inputValue.trim()) return;

    const newMessage: MessageData = {
      id: Date.now().toString(),
      author: "User",
      avatar: "https://api.dicebear.com/7.x/avataaars/svg?seed=Felix",
      content: inputValue,
      timestamp: `Today at ${new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}`,
      channelId: activeChannelId,
      isBot: false,
    };

    setMessages((prev) => [...prev, newMessage]);
    const command = inputValue.trim();
    setInputValue("");

    // Command Simulation
    if (command.startsWith("/setup pay request")) {
      const parts = command.split(" ");
      const channelPart = parts.find((p) => p.startsWith("#"));
      const targetChannelName = channelPart ? channelPart.substring(1) : activeChannelId;
      const targetChannelId = channels.find((c) => c.name === targetChannelName)?.id || activeChannelId;

      setRequestChannel(targetChannelId);

      setTimeout(() => {
        setMessages((prev) => [
          ...prev,
          {
            id: Date.now().toString(),
            author: "Thrill Worker",
            isBot: true,
            timestamp: `Today at ${new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}`,
            content: `Configuration saved! Payout requests will be sent to <#${targetChannelId}>.`,
            channelId: activeChannelId,
            avatar: "https://api.dicebear.com/7.x/bottts/svg?seed=ThrillWorker",
          },
        ]);

        // Also send the "Request Payout" embed to the CURRENT channel (as per prompt "sends an embed in the channel you used")
        setMessages((prev) => [
          ...prev,
          {
            id: (Date.now() + 1).toString(),
            author: "Thrill Worker",
            isBot: true,
            timestamp: `Today at ${new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}`,
            channelId: activeChannelId, // Channel used
            avatar: "https://api.dicebear.com/7.x/bottts/svg?seed=ThrillWorker",
            embeds: [
              <DiscordEmbed
                key="req-embed"
                title="Payout Request System"
                description="Click the button below to request a payout."
                color="#5865F2"
              />,
            ],
            components: (
              <DiscordButton onClick={() => setIsPayoutModalOpen(true)}>Request Payout</DiscordButton>
            ),
          },
        ]);
      }, 500);
    } else if (command.startsWith("/setup payment logs")) {
       const parts = command.split(" ");
       const channelPart = parts.find((p) => p.startsWith("#"));
       const targetChannelName = channelPart ? channelPart.substring(1) : activeChannelId;
       const targetChannelId = channels.find((c) => c.name === targetChannelName)?.id || activeChannelId;

       setLogChannel(targetChannelId);
       
       setTimeout(() => {
        setMessages((prev) => [
          ...prev,
          {
            id: Date.now().toString(),
            author: "Thrill Worker",
            isBot: true,
            timestamp: `Today at ${new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}`,
            content: `Configuration saved! Payment logs will be sent to <#${targetChannelId}>.`,
            channelId: activeChannelId,
            avatar: "https://api.dicebear.com/7.x/bottts/svg?seed=ThrillWorker",
          },
        ]);
      }, 500);
    }
  };

  const handleModalSubmit = () => {
    setIsPayoutModalOpen(false);
    
    // 1. Show confirmation to user (Ephemeral-like)
    setMessages((prev) => [
        ...prev,
        {
          id: Date.now().toString(),
          author: "Thrill Worker",
          isBot: true,
          timestamp: `Today at ${new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}`,
          content: "Your payout request has been submitted!",
          channelId: activeChannelId,
          avatar: "https://api.dicebear.com/7.x/bottts/svg?seed=ThrillWorker",
        },
    ]);

    // 2. Send request to Request Channel
    if (requestChannel) {
        const requestId = Date.now().toString();
        const requestMessage: MessageData = {
            id: requestId,
            author: "Thrill Worker",
            isBot: true,
            timestamp: `Today at ${new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}`,
            channelId: requestChannel,
            avatar: "https://api.dicebear.com/7.x/bottts/svg?seed=ThrillWorker",
            embeds: [
                <DiscordEmbed
                    key={requestId}
                    title="Payout Request"
                    color="#F0B232" // Pending Yellow
                    fields={[
                        { name: "User ID", value: modalData.userId, inline: true },
                        { name: "Requested by", value: "@User", inline: true }, // Simulating user tag
                        { name: "Status", value: "⏳ Pending", inline: true },
                        { name: "Reason", value: modalData.reason, inline: false },
                        { name: "Paypal", value: modalData.paypal, inline: false },
                    ]}
                    footer={`Request ID: ${requestId}`}
                    timestamp={new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}
                />
            ],
            components: (
                <div className="flex gap-2">
                    <DiscordButton 
                        variant="success" 
                        onClick={() => handleRequestAction(requestId, "approve", modalData)}
                    >
                        Approve
                    </DiscordButton>
                    <DiscordButton 
                        variant="destructive"
                        onClick={() => handleRequestAction(requestId, "deny", modalData)}
                    >
                        Deny
                    </DiscordButton>
                </div>
            )
        };
        setMessages((prev) => [...prev, requestMessage]);
    }
    setModalData({ userId: "", reason: "", paypal: "" });
  };

  const handleRequestAction = (msgId: string, action: "approve" | "deny", data: any) => {
      // Update the message in the state
      setMessages((prev) => prev.map(msg => {
          if (msg.id === msgId) {
              const status = action === "approve" ? "✅ Approved" : "❌ Denied";
              const color = action === "approve" ? "#23A559" : "#DA373C";
              
              return {
                  ...msg,
                  embeds: [
                    <DiscordEmbed
                        key={msgId}
                        title="Payout Request"
                        color={color}
                        fields={[
                            { name: "User ID", value: data.userId, inline: true },
                            { name: "Requested by", value: "@User", inline: true },
                            { name: "Status", value: status, inline: true },
                            { name: "Reason", value: data.reason, inline: false },
                            { name: "Paypal", value: data.paypal, inline: false },
                            { name: "Actioned by", value: "@Admin User", inline: false }
                        ]}
                        footer={`Request ID: ${msgId}`}
                        timestamp={new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}
                    />
                  ],
                  components: (
                      <div className="text-sm text-discord-text-muted italic">
                          Request {action === "approve" ? "approved" : "denied"} by @Admin User
                      </div>
                  )
              };
          }
          return msg;
      }));

      // Log if enabled
      if (logChannel && action === "approve") {
          setMessages((prev) => [
              ...prev,
              {
                id: Date.now().toString(),
                author: "Thrill Worker",
                isBot: true,
                timestamp: `Today at ${new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}`,
                channelId: logChannel,
                avatar: "https://api.dicebear.com/7.x/bottts/svg?seed=ThrillWorker",
                embeds: [
                    <DiscordEmbed
                        key="log"
                        title="Payment Logged"
                        color="#23A559"
                        description={`Payment successfully processed for User ID: ${data.userId}`}
                        fields={[
                            { name: "Amount", value: "$0.00 (Example)", inline: true },
                            { name: "Recipient", value: data.paypal, inline: true },
                        ]}
                        timestamp={new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}
                    />
                ]
              }
          ]);
      }
  };

  const activeMessages = messages.filter((m) => m.channelId === activeChannelId);

  return (
    <>
      <DiscordLayout
        channelName={activeChannelId}
        channels={channels}
        activeChannelId={activeChannelId}
        onChannelSelect={setActiveChannelId}
      >
        <div className="flex-1 p-4 pb-0 flex flex-col min-h-0">
          <div className="flex-1 overflow-y-auto custom-scrollbar pr-2" ref={scrollRef}>
             {activeMessages.length === 0 ? (
                 <div className="h-full flex flex-col items-center justify-center text-discord-text-muted opacity-50">
                     <div className="bg-[#41434A] p-4 rounded-full mb-4">
                         <Hash className="w-12 h-12 text-white" />
                     </div>
                     <h3 className="text-2xl font-bold text-white mb-2">Welcome to #{activeChannelId}!</h3>
                     <p>This is the start of the #{activeChannelId} channel.</p>
                 </div>
             ) : (
                activeMessages.map((msg) => (
                    <DiscordMessage
                    key={msg.id}
                    id={msg.id}
                    author={msg.author}
                    avatar={msg.avatar}
                    content={msg.content}
                    timestamp={msg.timestamp}
                    isBot={msg.isBot}
                    embeds={msg.embeds}
                    components={msg.components}
                    />
                ))
             )}
          </div>
        </div>

        {/* Input Area */}
        <div className="p-4 pt-2">
          <form onSubmit={handleSendMessage} className="bg-discord-chat-input rounded-[8px] flex items-center px-4 py-2.5">
            <div className="bg-discord-text-muted rounded-full p-0.5 mr-3 cursor-pointer hover:text-white transition-colors">
              <PlusCircle className="w-5 h-5 text-discord-bg fill-current" />
            </div>
            <input
              type="text"
              value={inputValue}
              onChange={(e) => setInputValue(e.target.value)}
              placeholder={`Message #${activeChannelId}`}
              className="bg-transparent border-none focus:ring-0 text-discord-text-normal placeholder-discord-text-muted flex-1 h-full outline-none font-medium"
            />
          </form>
          <div className="text-[10px] text-discord-text-muted mt-1 ml-1 text-center">
             Tip: Type <code className="bg-black/20 p-0.5 rounded">/setup pay request #payout-requests</code> to configure the bot.
          </div>
        </div>
      </DiscordLayout>

      <DiscordModal
        isOpen={isPayoutModalOpen}
        onClose={() => setIsPayoutModalOpen(false)}
        title="Request Payout"
        footer={
          <div className="flex justify-end gap-2 w-full">
            <DiscordButton variant="link" onClick={() => setIsPayoutModalOpen(false)}>
              Cancel
            </DiscordButton>
            <DiscordButton onClick={handleModalSubmit}>Submit</DiscordButton>
          </div>
        }
      >
        <div className="space-y-4">
          <div className="space-y-1.5">
            <label className="text-xs font-bold text-discord-text-muted uppercase tracking-wide">
              User ID <span className="text-red-400">*</span>
            </label>
            <input
              className="w-full bg-[#1E1F22] border-none rounded-[3px] p-2.5 text-discord-text-normal focus:outline-none focus:ring-0"
              placeholder="Enter the user ID"
              value={modalData.userId}
              onChange={(e) => setModalData({ ...modalData, userId: e.target.value })}
            />
          </div>
          <div className="space-y-1.5">
            <label className="text-xs font-bold text-discord-text-muted uppercase tracking-wide">
              Reason <span className="text-red-400">*</span>
            </label>
            <textarea
              className="w-full bg-[#1E1F22] border-none rounded-[3px] p-2.5 text-discord-text-normal focus:outline-none focus:ring-0 min-h-[80px]"
              placeholder="Why?"
              value={modalData.reason}
              onChange={(e) => setModalData({ ...modalData, reason: e.target.value })}
            />
          </div>
          <div className="space-y-1.5">
            <label className="text-xs font-bold text-discord-text-muted uppercase tracking-wide">
              Paypal Username/Email <span className="text-red-400">*</span>
            </label>
            <input
              className="w-full bg-[#1E1F22] border-none rounded-[3px] p-2.5 text-discord-text-normal focus:outline-none focus:ring-0"
              placeholder="email@example.com"
              value={modalData.paypal}
              onChange={(e) => setModalData({ ...modalData, paypal: e.target.value })}
            />
          </div>
        </div>
      </DiscordModal>
    </>
  );
}
