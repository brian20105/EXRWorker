import {
  Client,
  GatewayIntentBits,
  Partials,
  REST,
  Routes,
  SlashCommandBuilder,
  EmbedBuilder,
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  ModalBuilder,
  TextInputBuilder,
  TextInputStyle,
  StringSelectMenuBuilder,
  StringSelectMenuOptionBuilder,
  ChannelType,
  AttachmentBuilder,
} from "discord.js";
import { storage } from "./storage";

if (!process.env.DISCORD_BOT_TOKEN) {
  console.error("⚠️  DISCORD_BOT_TOKEN is not set. The bot will not start.");
  console.log("Please add your Discord bot token to start the bot.");
}

const APPLICATION_ID = process.env.DISCORD_APPLICATION_ID;

export const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.GuildMembers,
    GatewayIntentBits.DirectMessages,
    GatewayIntentBits.MessageContent,
  ],
  partials: [Partials.Channel, Partials.Message],
});

interface QuizState {
  guildId: string;
  currentQuestion: number;
  answers: string[];
  startedAt: number;
}
const activeQuizzes = new Map<string, QuizState>();

// Prevent duplicate Start Quiz button processing
const processingQuizStart = new Set<string>();

// DM message cache for tracking edits/deletions (stores last 50 messages per user)
interface CachedDMMessage {
  id: string;
  content: string;
  authorId: string;
  authorTag: string;
  authorAvatar: string;
  timestamp: number;
}
const dmMessageCache = new Map<string, CachedDMMessage[]>();
const MAX_CACHED_MESSAGES_PER_USER = 50;

function cacheDMMessage(userId: string, message: any) {
  if (!message.author || message.author.bot) return;
  
  const cached: CachedDMMessage = {
    id: message.id,
    content: message.content || "",
    authorId: message.author.id,
    authorTag: message.author.tag,
    authorAvatar: message.author.displayAvatarURL(),
    timestamp: Date.now(),
  };
  
  let userCache = dmMessageCache.get(userId) || [];
  userCache.push(cached);
  if (userCache.length > MAX_CACHED_MESSAGES_PER_USER) {
    userCache = userCache.slice(-MAX_CACHED_MESSAGES_PER_USER);
  }
  dmMessageCache.set(userId, userCache);
}

function getCachedDMMessage(userId: string, messageId: string): CachedDMMessage | undefined {
  const userCache = dmMessageCache.get(userId);
  if (!userCache) return undefined;
  return userCache.find(m => m.id === messageId);
}

function updateCachedDMMessage(userId: string, messageId: string, newContent: string) {
  const userCache = dmMessageCache.get(userId);
  if (!userCache) return;
  const msg = userCache.find(m => m.id === messageId);
  if (msg) msg.content = newContent;
}

// Track users with pending DM ticket category selection (userId -> messageId)
const pendingDMTickets = new Map<string, { messageId: string; guildId: string; sentAt: number }>();
const pendingServerSelections = new Map<string, { messageContent: string; attachments: any[]; tickets: any[]; sentAt: number; originalMessageId: string; originalChannelId: string }>();

// Clean up expired DM ticket selections and server selections (5 minutes)
setInterval(() => {
  const now = Date.now();
  const FIVE_MINUTES = 5 * 60 * 1000;
  for (const [userId, data] of Array.from(pendingDMTickets.entries())) {
    if (now - data.sentAt > FIVE_MINUTES) {
      pendingDMTickets.delete(userId);
    }
  }
  for (const [userId, data] of Array.from(pendingServerSelections.entries())) {
    if (now - data.sentAt > FIVE_MINUTES) {
      pendingServerSelections.delete(userId);
    }
  }
}, 60 * 1000);

// Clean up expired quiz sessions (30 minutes)
setInterval(() => {
  const now = Date.now();
  const THIRTY_MINUTES = 30 * 60 * 1000;
  for (const [userId, quizState] of Array.from(activeQuizzes.entries())) {
    if (now - quizState.startedAt > THIRTY_MINUTES) {
      activeQuizzes.delete(userId);
      console.log(`[QUIZ] Cleaned up expired quiz session for user ${userId}`);
    }
  }

  // Safety cleanup for processingQuizStart
  if (processingQuizStart.size > 20) {
    console.log(`[CLEANUP] Clearing ${processingQuizStart.size} stale quiz starts`);
    processingQuizStart.clear();
  }
}, 5 * 60 * 1000); // Check every 5 minutes

const QUIZ_QUESTIONS = [
  { text: "**Question 1:** How do you warn/mute somebody?", type: "text" },
  { text: "**Question 2:** If something is bannable, where do you go to ban them?", type: "text" },
  { text: "**Question 3:** If you are unsure about a situation, who should you ask?", type: "text" },
  { text: "**Question 4:** If somebody makes a partnership ticket, who do you bring to handle it?", type: "text" },
  { text: "**Question 5:** You understand that this is a paid position and any unprofessionalism/arguing will get you removed?", type: "text" }
];

const FULL_QUESTIONS = [
  "How do you warn/mute somebody?",
  "If something is bannable, where do you go to ban them?",
  "If you are unsure about a situation, who should you ask?",
  "If somebody makes a partnership ticket, who do you bring to handle it?",
  "You understand that this is a paid position and any unprofessionalism/arguing will get you removed?"
];

// Parse moderation log messages from TRL | Moderator or similar bots
async function parseModLogMessage(msg: any, guildId: string): Promise<{ guildId: string; moderatorId: string; targetId: string | null; actionType: string; reason: string | null; sourceType: string; sourceMessageId: string } | null> {
  try {
    const content = msg.content?.toLowerCase() || "";
    const embedTitle = msg.embeds?.[0]?.title?.toLowerCase() || "";
    const embedDesc = msg.embeds?.[0]?.description?.toLowerCase() || "";
    const embedFields = msg.embeds?.[0]?.fields || [];
    const fullText = `${content} ${embedTitle} ${embedDesc}`;

    let actionType: string | null = null;
    let moderatorId: string | null = null;
    let targetId: string | null = null;
    let reason: string | null = null;

    // Detect action type from various common formats
    if (fullText.includes("warn") && !fullText.includes("unwarned")) actionType = "warn";
    else if (fullText.includes("mute") && !fullText.includes("unmute")) actionType = "mute";
    else if (fullText.includes("timeout") && !fullText.includes("removed")) actionType = "timeout";
    else if (fullText.includes("kick") && !fullText.includes("unkick")) actionType = "kick";
    else if (fullText.includes("ban") && !fullText.includes("unban")) actionType = "ban";
    else if (fullText.includes("unban")) actionType = "unban";
    else if (fullText.includes("unmute")) actionType = "unmute";

    if (!actionType) return null;

    // Extract user IDs from mentions or field values
    const idRegex = /<@!?(\d{17,19})>|ID:\s*(\d{17,19})|User ID:\s*(\d{17,19})|(\d{17,19})/gi;
    const fullContent = `${msg.content || ""} ${msg.embeds?.[0]?.description || ""} ${embedFields.map((f: any) => `${f.name} ${f.value}`).join(" ")}`;
    const matches = [...fullContent.matchAll(idRegex)];

    // Try to find moderator from embed fields
    for (const field of embedFields) {
      const fieldName = field.name.toLowerCase();
      const fieldValue = field.value;

      if (fieldName.includes("moderator") || fieldName.includes("staff") || fieldName.includes("by") || fieldName.includes("executor")) {
        const modMatch = fieldValue.match(/<@!?(\d{17,19})>|(\d{17,19})/);
        if (modMatch) moderatorId = modMatch[1] || modMatch[2];
      }
      if (fieldName.includes("user") || fieldName.includes("target") || fieldName.includes("member")) {
        const targetMatch = fieldValue.match(/<@!?(\d{17,19})>|(\d{17,19})/);
        if (targetMatch) targetId = targetMatch[1] || targetMatch[2];
      }
      if (fieldName.includes("reason")) {
        reason = fieldValue;
      }
    }

    // If we still don't have moderator/target, try to extract from author/footer
    if (!moderatorId) {
      const footerText = msg.embeds?.[0]?.footer?.text || "";
      const footerMatch = footerText.match(/ID:\s*(\d{17,19})|(\d{17,19})/);
      if (footerMatch) {
        // Footer usually has moderator ID in some bots
        const potentialId = footerMatch[1] || footerMatch[2];
        if (!targetId) targetId = potentialId;
        else moderatorId = potentialId;
      }
    }

    // Try to get from embed author
    if (!targetId && msg.embeds?.[0]?.author?.name) {
      const authorText = msg.embeds[0].author.name;
      const authorMatch = authorText.match(/\((\d{17,19})\)/);
      if (authorMatch) targetId = authorMatch[1];
    }

    // If no moderator found but we have IDs, try to infer from message structure
    if (!moderatorId && matches.length >= 1) {
      // First ID is usually the target, second might be moderator
      if (matches.length >= 2) {
        targetId = targetId || matches[0][1] || matches[0][2] || matches[0][3] || matches[0][4];
        moderatorId = matches[1][1] || matches[1][2] || matches[1][3] || matches[1][4];
      } else if (!targetId) {
        targetId = matches[0][1] || matches[0][2] || matches[0][3] || matches[0][4];
      }
    }

    // Need at least moderator ID to track stats
    if (!moderatorId) return null;

    return {
      guildId,
      moderatorId,
      targetId,
      actionType,
      reason,
      sourceType: "log_channel",
      sourceMessageId: msg.id,
    };
  } catch (e) {
    console.log("[MODLOG PARSE] Error parsing message:", e);
    return null;
  }
}

// Helper to safely defer replies - returns false if interaction expired
async function safeDeferReply(interaction: any, ephemeral: boolean = true): Promise<boolean> {
  const age = Date.now() - interaction.createdTimestamp;
  try {
    await interaction.deferReply({ flags: ephemeral ? 64 : undefined });
    console.log(`[safeDeferReply] Success for ${interaction.commandName || interaction.customId} (age: ${age}ms)`);
    return true;
  } catch (e: any) {
    console.error(`[safeDeferReply] Failed for ${interaction.commandName || interaction.customId} (age: ${age}ms): ${e.message}`);
    return false;
  }
}

// Helper to safely reply to interactions - returns false if interaction expired
async function safeReply(interaction: any, options: any): Promise<boolean> {
  try {
    await interaction.reply(options);
    return true;
  } catch (e: any) {
    // Silently ignore expired interactions (code 10062)
    if (e.code !== 10062) console.log("Error replying to interaction:", e);
    return false;
  }
}

// Helper to safely defer update for button interactions - returns false if interaction expired
async function safeDeferUpdate(interaction: any): Promise<boolean> {
  try {
    await interaction.deferUpdate();
    return true;
  } catch (e) {
    // Silently ignore - interaction expired
    return false;
  }
}

interface QuizQuestion {
  text: string;
}

function getQuizQuestions(config: any): QuizQuestion[] {
  const q1Text = config?.quizQuestion1 || "How do you warn/mute somebody?";
  const q2Text = config?.quizQuestion2 || "If something is bannable, where do you go to ban them?";
  const q3Text = config?.quizQuestion3 || "If you are unsure about a situation, who should you ask?";
  const q4Text = config?.quizQuestion4 || "If somebody makes a partnership ticket, who do you bring to handle it?";
  const q5Text = config?.quizQuestion5 || "You understand that this is a paid position and any unprofessionalism/arguing will get you removed?";

  return [
    { text: `**Question 1:** ${q1Text}` },
    { text: `**Question 2:** ${q2Text}` },
    { text: `**Question 3:** ${q3Text}` },
    { text: `**Question 4:** ${q4Text}` },
    { text: `**Question 5:** ${q5Text}` }
  ];
}

function getFullQuestions(config: any): string[] {
  return [
    config?.quizQuestion1 || "How do you warn/mute somebody?",
    config?.quizQuestion2 || "If something is bannable, where do you go to ban them?",
    config?.quizQuestion3 || "If you are unsure about a situation, who should you ask?",
    config?.quizQuestion4 || "If somebody makes a partnership ticket, who do you bring to handle it?",
    config?.quizQuestion5 || "You understand that this is a paid position and any unprofessionalism/arguing will get you removed?"
  ];
}

async function logQuizProgress(guildId: string, userId: string, action: "started" | "question" | "completed", questionNumber?: number): Promise<void> {
  try {
    const config = await storage.getGuildConfig(guildId);
    if (!config?.quizLogChannelId) return;

    const logChannel = await client.channels.fetch(config.quizLogChannelId);
    if (!logChannel || !("send" in logChannel)) return;

    const user = await client.users.fetch(userId).catch(() => null);
    const userTag = user?.tag || userId;

    let embed: EmbedBuilder;
    
    if (action === "started") {
      embed = new EmbedBuilder()
        .setTitle("📝 Quiz Started")
        .setColor(0x57F287)
        .setDescription(`<@${userId}> (${userTag}) started the staff intro quiz`)
        .setTimestamp();
    } else if (action === "question") {
      const questions = getQuizQuestions(config);
      embed = new EmbedBuilder()
        .setTitle("📋 Quiz Progress")
        .setColor(0x5865F2)
        .setDescription(`<@${userId}> is now on **Question ${questionNumber}** of ${questions.length}`)
        .setTimestamp();
    } else {
      embed = new EmbedBuilder()
        .setTitle("✅ Quiz Completed")
        .setColor(0xFEE75C)
        .setDescription(`<@${userId}> (${userTag}) completed the staff intro quiz`)
        .setTimestamp();
    }

    await (logChannel as any).send({ embeds: [embed] });
  } catch (e) {
    console.log("[QUIZ LOG] Error logging quiz progress:", e);
  }
}

async function sendQuizQuestion(userId: string, dmChannel: any, isFirst: boolean = false): Promise<void> {
  const quizState = activeQuizzes.get(userId);
  if (!quizState) return;

  const config = await storage.getGuildConfig(quizState.guildId);
  const questions = getQuizQuestions(config);
  const question = questions[quizState.currentQuestion];

  const content = isFirst 
    ? `**Staff Introduction Quiz**\n\nPlease answer all 5 questions.\n\n${question.text}`
    : question.text;

  console.log(`[QUIZ] Sending message to ${userId}: "${content.substring(0, 50)}..."`);

  // Log quiz progress
  if (isFirst) {
    await logQuizProgress(quizState.guildId, userId, "started");
  }
  await logQuizProgress(quizState.guildId, userId, "question", quizState.currentQuestion + 1);

  await dmChannel.send({
    content: content,
  });
}

async function processQuizAnswer(userId: string, answer: string, dmChannel: any): Promise<void> {
  const quizState = activeQuizzes.get(userId);
  if (!quizState) return;

  quizState.answers.push(answer);
  quizState.currentQuestion++;

  const config = await storage.getGuildConfig(quizState.guildId);
  const questions = getQuizQuestions(config);

  if (quizState.currentQuestion < questions.length) {
    await sendQuizQuestion(userId, dmChannel);
  } else {
    // Log quiz completion
    await logQuizProgress(quizState.guildId, userId, "completed");
    activeQuizzes.delete(userId);

    if (!config?.staffIntroSubmissionsChannelId) {
      await dmChannel.send({
        content: "Thank you for completing the quiz! Your answers have been recorded, but the submissions channel hasn't been set up yet. Please contact an admin.",
      });
      return;
    }

    const submission = await storage.createStaffIntroSubmission({
      guildId: quizState.guildId,
      userId: userId,
      answer1: quizState.answers[0] || "",
      answer2: quizState.answers[1] || "",
      answer3: quizState.answers[2] || "",
      answer4: quizState.answers[3] || "",
      answer5: quizState.answers[4] || "",
      status: "pending",
    });

    const fullQuestions = getFullQuestions(config);

    try {
      const submissionsChannel = await client.channels.fetch(config.staffIntroSubmissionsChannelId);
      if (submissionsChannel && "send" in submissionsChannel) {
        const embed = new EmbedBuilder()
          .setTitle("Staff Intro Quiz Submission")
          .setColor(0xf0b232)
          .setDescription(`**Submitted by:** <@${userId}>`)
          .addFields([
            { name: `Q1: ${fullQuestions[0]}`, value: quizState.answers[0] || "No answer", inline: false },
            { name: `Q2: ${fullQuestions[1]}`, value: quizState.answers[1] || "No answer", inline: false },
            { name: `Q3: ${fullQuestions[2]}`, value: quizState.answers[2] || "No answer", inline: false },
            { name: `Q4: ${fullQuestions[3]}`, value: quizState.answers[3] || "No answer", inline: false },
            { name: `Q5: ${fullQuestions[4]}`, value: quizState.answers[4] || "No answer", inline: false }
          ])
          .setFooter({ text: `Submission ID: ${submission.id}` })
          .setTimestamp();

        const row = new ActionRowBuilder<ButtonBuilder>().addComponents(
          new ButtonBuilder()
            .setCustomId(`quiz_approve_${submission.id}`)
            .setLabel("Approve")
            .setStyle(ButtonStyle.Success)
            .setEmoji("✅"),
          new ButtonBuilder()
            .setCustomId(`quiz_deny_${submission.id}`)
            .setLabel("Deny")
            .setStyle(ButtonStyle.Danger)
            .setEmoji("❌")
        );

        const sentMessage = await submissionsChannel.send({
          embeds: [embed],
          components: [row],
        });

        await storage.updateStaffIntroSubmission(submission.id, {
          messageId: sentMessage.id,
        });
      }
    } catch (error) {
      console.log("Could not send submission to channel:", error);
    }

    await dmChannel.send({
      content: "✅ Thank you for completing the quiz! Your submission has been sent for review. You will receive a DM once it has been reviewed.",
    });
  }
}


const commands = [
  new SlashCommandBuilder()
    .setName("setup_pay_request")
    .setDescription("Set the channel for payout requests")
    .addChannelOption((option) =>
      option
        .setName("channel")
        .setDescription("The channel where requests will be sent")
        .setRequired(true)
    ),
  new SlashCommandBuilder()
    .setName("setup_payment_logs")
    .setDescription("Set the channel for payment logs")
    .addChannelOption((option) =>
      option
        .setName("channel")
        .setDescription("The channel where logs will be sent")
        .setRequired(true)
    ),
  new SlashCommandBuilder()
    .setName("list_payouts")
    .setDescription("List all payout requests (pending, approved, denied)")
    .setDefaultMemberPermissions(0)
    .addBooleanOption((option) =>
      option
        .setName("private")
        .setDescription("Make the response only visible to you (default: true)")
        .setRequired(false)
    ),
  new SlashCommandBuilder()
    .setName("user_payouts")
    .setDescription("Get payout info for a specific user")
    .setDefaultMemberPermissions(0)
    .addUserOption((option) =>
      option
        .setName("user")
        .setDescription("The user to check payouts for")
        .setRequired(true)
    ),
  new SlashCommandBuilder()
    .setName("refresh_roster")
    .setDescription("Manually refresh roster displays")
    .setDefaultMemberPermissions(0),
  new SlashCommandBuilder()
    .setName("payout")
    .setDescription("Add, edit, or remove a payout request")
    .setDefaultMemberPermissions(0)
    .addStringOption((option) =>
      option
        .setName("action")
        .setDescription("Add, edit, or remove a payout")
        .setRequired(true)
        .addChoices(
          { name: "Add", value: "add" },
          { name: "Edit", value: "edit" },
          { name: "Remove", value: "remove" }
        )
    )
    .addUserOption((option) =>
      option
        .setName("user")
        .setDescription("The user for the payout")
        .setRequired(false)
    )
    .addStringOption((option) =>
      option
        .setName("payout_id")
        .setDescription("Payout ID (optional - will use user's latest if not provided)")
        .setRequired(false)
    )
    .addStringOption((option) =>
      option
        .setName("amount")
        .setDescription("Amount owed")
        .setRequired(false)
    )
    .addStringOption((option) =>
      option
        .setName("email")
        .setDescription("PayPal email")
        .setRequired(false)
    )
    .addStringOption((option) =>
      option
        .setName("reason")
        .setDescription("Reason for payout")
        .setRequired(false)
    )
    .addStringOption((option) =>
      option
        .setName("status")
        .setDescription("New status (for edit only)")
        .setRequired(false)
        .addChoices(
          { name: "Pending", value: "pending" },
          { name: "Approved", value: "approved" },
          { name: "Denied", value: "denied" }
        )
    )
    .addBooleanOption((option) =>
      option
        .setName("remove_all")
        .setDescription("Remove ALL payouts (for user if specified, or everyone)")
        .setRequired(false)
    ),
  new SlashCommandBuilder()
    .setName("sync_roles")
    .setDescription("Manage role sync pairs between servers")
    .setDefaultMemberPermissions(0)
    .addStringOption((option) =>
      option
        .setName("action")
        .setDescription("Add, remove, or list sync pairs")
        .setRequired(true)
        .addChoices(
          { name: "List", value: "list" },
          { name: "Add", value: "add" },
          { name: "Remove", value: "remove" }
        )
    )
    .addStringOption((option) =>
      option
        .setName("source_role_id")
        .setDescription("Role ID in source server (for add)")
        .setRequired(false)
    )
    .addStringOption((option) =>
      option
        .setName("target_role_id")
        .setDescription("Role ID in target server (for add)")
        .setRequired(false)
    )
    .addStringOption((option) =>
      option
        .setName("source_guild_id")
        .setDescription("Source server ID (for add)")
        .setRequired(false)
    )
    .addStringOption((option) =>
      option
        .setName("target_guild_id")
        .setDescription("Target server ID (for add)")
        .setRequired(false)
    )
    .addStringOption((option) =>
      option
        .setName("pair_id")
        .setDescription("Sync pair ID to remove (for remove)")
        .setRequired(false)
    ),
  new SlashCommandBuilder()
    .setName("members")
    .setDescription("View all members with a specific role")
    .addRoleOption((option) =>
      option
        .setName("role")
        .setDescription("The role to list members for")
        .setRequired(true)
    ),
  new SlashCommandBuilder()
    .setName("setup_moderation")
    .setDescription("Set the channel for moderation requests (ban/unban)")
    .setDefaultMemberPermissions(0)
    .addChannelOption((option) =>
      option
        .setName("channel")
        .setDescription("The channel where moderation requests will be sent")
        .setRequired(true)
    ),
  new SlashCommandBuilder()
    .setName("setup_moderation_logs")
    .setDescription("Set the channel for moderation request logs")
    .setDefaultMemberPermissions(0)
    .addChannelOption((option) =>
      option
        .setName("channel")
        .setDescription("The channel where moderation logs will be sent")
        .setRequired(true)
    ),
  new SlashCommandBuilder()
    .setName("prefix")
    .setDescription("Change the command prefix for modmail and snip commands")
    .setDefaultMemberPermissions(0)
    .addStringOption((option) =>
      option
        .setName("new_prefix")
        .setDescription("The new prefix (e.g., !, ?, .)")
        .setRequired(true)
    ),
  new SlashCommandBuilder()
    .setName("activity")
    .setDescription("View the activity leaderboard")
    .addUserOption((option) =>
      option
        .setName("member")
        .setDescription("View activity for a specific member")
        .setRequired(false)
    )
    .addStringOption((option) =>
      option
        .setName("category")
        .setDescription("Filter by request type")
        .setRequired(false)
        .addChoices(
          { name: "Ban Requests", value: "ban" },
          { name: "Unban Requests", value: "unban" },
          { name: "Modmails handled", value: "modmail" },
          { name: "Appeals handled", value: "appeal" },
          { name: "Staff Reports", value: "staffreport" }
        )
    )
    .addStringOption((option) =>
      option
        .setName("scope")
        .setDescription("Show stats from this server only or all servers")
        .setRequired(false)
        .addChoices(
          { name: "All Servers", value: "all" },
          { name: "This Server Only", value: "guild" }
        )
    )
    .addIntegerOption((option) =>
      option
        .setName("from")
        .setDescription("Start time in days ago (e.g., 7 for last week)")
        .setRequired(false)
    )
    .addIntegerOption((option) =>
      option
        .setName("to")
        .setDescription("End time in days ago (e.g., 0 for today, leave empty for all time)")
        .setRequired(false)
    )
    .addIntegerOption((option) =>
      option
        .setName("page")
        .setDescription("Page number (for leaderboard)")
        .setRequired(false)
    ),
  new SlashCommandBuilder()
    .setName("clear-role")
    .setDescription("Clear all members from a role")
    .setDefaultMemberPermissions(0)
    .addRoleOption((option) =>
      option
        .setName("role")
        .setDescription("The role to clear members from")
        .setRequired(true)
    ),
  new SlashCommandBuilder()
    .setName("activity_add")
    .setDescription("Add amount of log entries to a staff member")
    .setDefaultMemberPermissions(0)
    .addUserOption((option) =>
      option
        .setName("user")
        .setDescription("The staff member to add entries to")
        .setRequired(true)
    )
    .addIntegerOption((option) =>
      option
        .setName("amount")
        .setDescription("Number of log entries to add")
        .setRequired(true)
    )
    .addStringOption((option) =>
      option
        .setName("category")
        .setDescription("Category of entries")
        .setRequired(true)
        .addChoices(
          { name: "Ban Requests", value: "ban" },
          { name: "Unban Requests", value: "unban" },
          { name: "Modmails Handled", value: "modmail" },
          { name: "Appeals Handled", value: "appeal" },
          { name: "Staff Reports", value: "staffreport" }
        )
    )
    .addStringOption((option) =>
      option
        .setName("server")
        .setDescription("Which server to add entries for (default: current)")
        .setRequired(false)
        .addChoices(
          { name: "This Server", value: "current" },
          { name: "All Servers (Global)", value: "global" }
        )
    ),
  new SlashCommandBuilder()
    .setName("activity_remove")
    .setDescription("Remove amount of log entries from a staff member")
    .setDefaultMemberPermissions(0)
    .addUserOption((option) =>
      option
        .setName("user")
        .setDescription("The staff member to remove entries from")
        .setRequired(true)
    )
    .addIntegerOption((option) =>
      option
        .setName("amount")
        .setDescription("Number of log entries to remove")
        .setRequired(true)
    )
    .addStringOption((option) =>
      option
        .setName("category")
        .setDescription("Category of entries")
        .setRequired(true)
        .addChoices(
          { name: "Ban Requests", value: "ban" },
          { name: "Unban Requests", value: "unban" },
          { name: "Modmails Handled", value: "modmail" },
          { name: "Appeals Handled", value: "appeal" },
          { name: "Staff Reports", value: "staffreport" }
        )
    )
    .addStringOption((option) =>
      option
        .setName("server")
        .setDescription("Which server to remove entries from (default: current)")
        .setRequired(false)
        .addChoices(
          { name: "This Server", value: "current" },
          { name: "All Servers (Global)", value: "global" }
        )
    ),
  new SlashCommandBuilder()
    .setName("activity_reset")
    .setDescription("Reset activity stats for a user or everyone")
    .setDefaultMemberPermissions(0)
    .addStringOption((option) =>
      option
        .setName("category")
        .setDescription("Category to reset (leave empty for all)")
        .setRequired(false)
        .addChoices(
          { name: "Ban Requests", value: "ban" },
          { name: "Unban Requests", value: "unban" },
          { name: "Modmails Handled", value: "modmail" },
          { name: "Appeals Handled", value: "appeal" },
          { name: "Staff Reports", value: "staffreport" }
        )
    )
    .addUserOption((option) =>
      option
        .setName("user")
        .setDescription("User to reset (leave empty for everyone)")
        .setRequired(false)
    ),
  new SlashCommandBuilder()
    .setName("activity_check")
    .setDescription("Check activity stats for members with a specific role (private/ephemeral)")
    .setDefaultMemberPermissions(0)
    .addRoleOption((option) =>
      option
        .setName("role")
        .setDescription("The role to check activity for")
        .setRequired(true)
    )
    .addIntegerOption((option) =>
      option
        .setName("from")
        .setDescription("Start time in days ago (e.g., 7 for last week)")
        .setRequired(false)
    )
    .addIntegerOption((option) =>
      option
        .setName("to")
        .setDescription("End time in days ago (e.g., 0 for today)")
        .setRequired(false)
    ),
  new SlashCommandBuilder()
    .setName("restore_activity")
    .setDescription("Restore activity stats from the last reset")
    .setDefaultMemberPermissions(0),
  new SlashCommandBuilder()
    .setName("activity_role")
    .setDescription("Set roles to track on activity leaderboard (all members show even with 0 stats)")
    .setDefaultMemberPermissions(0)
    .addRoleOption((option) => option.setName("role1").setDescription("Role to track").setRequired(false))
    .addRoleOption((option) => option.setName("role2").setDescription("Role to track").setRequired(false))
    .addRoleOption((option) => option.setName("role3").setDescription("Role to track").setRequired(false))
    .addRoleOption((option) => option.setName("role4").setDescription("Role to track").setRequired(false))
    .addRoleOption((option) => option.setName("role5").setDescription("Role to track").setRequired(false))
    .addRoleOption((option) => option.setName("role6").setDescription("Role to track").setRequired(false))
    .addRoleOption((option) => option.setName("role7").setDescription("Role to track").setRequired(false))
    .addRoleOption((option) => option.setName("role8").setDescription("Role to track").setRequired(false))
    .addRoleOption((option) => option.setName("role9").setDescription("Role to track").setRequired(false))
    .addRoleOption((option) => option.setName("role10").setDescription("Role to track").setRequired(false))
    .addRoleOption((option) => option.setName("role11").setDescription("Role to track").setRequired(false))
    .addRoleOption((option) => option.setName("role12").setDescription("Role to track").setRequired(false))
    .addRoleOption((option) => option.setName("role13").setDescription("Role to track").setRequired(false))
    .addRoleOption((option) => option.setName("role14").setDescription("Role to track").setRequired(false))
    .addRoleOption((option) => option.setName("role15").setDescription("Role to track").setRequired(false))
    .addRoleOption((option) => option.setName("role16").setDescription("Role to track").setRequired(false))
    .addRoleOption((option) => option.setName("role17").setDescription("Role to track").setRequired(false))
    .addRoleOption((option) => option.setName("role18").setDescription("Role to track").setRequired(false))
    .addRoleOption((option) => option.setName("role19").setDescription("Role to track").setRequired(false))
    .addRoleOption((option) => option.setName("role20").setDescription("Role to track").setRequired(false)),
  new SlashCommandBuilder()
    .setName("modstats")
    .setDescription("Moderation stats commands")
    .setDefaultMemberPermissions(0)
    .addSubcommand((sub) =>
      sub.setName("list").setDescription("Get copyable *ms commands for a role")
        .addRoleOption((option) => option.setName("role").setDescription("Role to check stats for").setRequired(true))
    )
    .addSubcommand((sub) =>
      sub.setName("check").setDescription("Scan channel for moderation stats responses")
        .addIntegerOption((option) => option.setName("messages").setDescription("Number of messages to scan (default: 100)").setRequired(false))
    ),
  new SlashCommandBuilder()
    .setName("setup_staff_intro")
    .setDescription("Post the staff introduction quiz in the current channel")
    .setDefaultMemberPermissions(0),
  new SlashCommandBuilder()
    .setName("setup_quiz_log")
    .setDescription("Set the channel for quiz progress logging")
    .setDefaultMemberPermissions(0)
    .addChannelOption((option) =>
      option
        .setName("channel")
        .setDescription("The channel where quiz progress will be logged")
        .setRequired(true)
    ),
  new SlashCommandBuilder()
    .setName("setup_staff_intro_submissions")
    .setDescription("Set the channel for staff intro quiz submissions")
    .setDefaultMemberPermissions(0)
    .addChannelOption((option) =>
      option
        .setName("channel")
        .setDescription("The channel where submissions will be sent")
        .setRequired(true)
    ),
  new SlashCommandBuilder()
    .setName("setup_intro_questions")
    .setDescription("Customize the staff intro quiz questions")
    .setDefaultMemberPermissions(0)
    .addStringOption((option) =>
      option
        .setName("question1")
        .setDescription("Question 1")
        .setRequired(false)
    )
    .addStringOption((option) =>
      option
        .setName("question2")
        .setDescription("Question 2")
        .setRequired(false)
    )
    .addStringOption((option) =>
      option
        .setName("question3")
        .setDescription("Question 3")
        .setRequired(false)
    )
    .addStringOption((option) =>
      option
        .setName("question4")
        .setDescription("Question 4")
        .setRequired(false)
    )
    .addStringOption((option) =>
      option
        .setName("question5")
        .setDescription("Question 5")
        .setRequired(false)
    ),
  new SlashCommandBuilder()
    .setName("config_staff_intro")
    .setDescription("Configure the staff intro embed title and description")
    .setDefaultMemberPermissions(0)
    .addStringOption((option) =>
      option
        .setName("title")
        .setDescription("The embed title")
        .setRequired(false)
    )
    .addStringOption((option) =>
      option
        .setName("description")
        .setDescription("The embed description")
        .setRequired(false)
    ),
  new SlashCommandBuilder()
    .setName("setup_inactivity")
    .setDescription("Post the inactivity request embed in the current channel")
    .setDefaultMemberPermissions(0),
  new SlashCommandBuilder()
    .setName("setup_inactivity_submissions")
    .setDescription("Set the channel for inactivity request submissions")
    .setDefaultMemberPermissions(0)
    .addChannelOption((option) =>
      option
        .setName("channel")
        .setDescription("The channel where submissions will be sent")
        .setRequired(true)
    ),
  new SlashCommandBuilder()
    .setName("setup_inactivity_logs")
    .setDescription("Set the channel for inactivity request logs (approved/denied)")
    .setDefaultMemberPermissions(0)
    .addChannelOption((option) =>
      option
        .setName("channel")
        .setDescription("The channel where logs will be sent")
        .setRequired(true)
    ),
  new SlashCommandBuilder()
    .setName("setup_inactivity_ping")
    .setDescription("Set roles to ping when inactivity is submitted (up to 5)")
    .setDefaultMemberPermissions(0)
    .addRoleOption((option) => option.setName("role1").setDescription("Role 1 to ping").setRequired(false))
    .addRoleOption((option) => option.setName("role2").setDescription("Role 2 to ping").setRequired(false))
    .addRoleOption((option) => option.setName("role3").setDescription("Role 3 to ping").setRequired(false))
    .addRoleOption((option) => option.setName("role4").setDescription("Role 4 to ping").setRequired(false))
    .addRoleOption((option) => option.setName("role5").setDescription("Role 5 to ping").setRequired(false)),
  new SlashCommandBuilder()
    .setName("terminate_quizzes")
    .setDescription("Terminate all active staff intro quizzes")
    .setDefaultMemberPermissions(0),
  new SlashCommandBuilder()
    .setName("setup_modmail")
    .setDescription("Post the modmail ticket embed in the current channel")
    .setDefaultMemberPermissions(0)
    .addChannelOption((option) =>
      option
        .setName("category")
        .setDescription("Category channel for modmail threads")
        .setRequired(true)
    )
    .addChannelOption((option) =>
      option
        .setName("log_channel")
        .setDescription("Channel for modmail logs")
        .setRequired(true)
    )
    .addRoleOption((option) =>
      option
        .setName("staff_role")
        .setDescription("Role that can respond to modmail")
        .setRequired(true)
    ),
  new SlashCommandBuilder()
    .setName("config_modmail")
    .setDescription("Configure the modmail ticket embed title and description (opens a form)")
    .setDefaultMemberPermissions(0),
  new SlashCommandBuilder()
    .setName("edit_embed")
    .setDescription("Edit system embeds with line breaks support")
    .setDefaultMemberPermissions(0)
    .addStringOption((option) =>
      option
        .setName("type")
        .setDescription("Which embed to edit")
        .setRequired(true)
        .addChoices(
          { name: "Modmail", value: "modmail" },
          { name: "Appeal", value: "appeal" },
          { name: "Staff Intro", value: "staffintro" },
          { name: "Inactivity", value: "inactivity" }
        )
    )
    .addStringOption((option) =>
      option
        .setName("message_id")
        .setDescription("Message ID of the embed to update (right-click message > Copy ID)")
        .setRequired(false)
    ),
  new SlashCommandBuilder()
    .setName("setup_appeal")
    .setDescription("Post the ban appeal ticket embed in the current channel")
    .setDefaultMemberPermissions(0)
    .addChannelOption((option) =>
      option
        .setName("category")
        .setDescription("Category channel for appeal threads")
        .setRequired(true)
    )
    .addChannelOption((option) =>
      option
        .setName("log_channel")
        .setDescription("Channel for appeal logs")
        .setRequired(true)
    )
    .addRoleOption((option) =>
      option
        .setName("staff_role")
        .setDescription("Role that can respond to appeals")
        .setRequired(true)
    ),
  new SlashCommandBuilder()
    .setName("config_appeal")
    .setDescription("Configure the ban appeal embed title and description (opens a form)")
    .setDefaultMemberPermissions(0),
  new SlashCommandBuilder()
    .setName("block")
    .setDescription("Block a user from opening modmail tickets")
    .setDefaultMemberPermissions(0)
    .addStringOption((option) =>
      option.setName("system").setDescription("Which system to block from").setRequired(true)
        .addChoices(
          { name: "Modmail", value: "modmail" },
          { name: "Ban Appeal", value: "appeal" }
        )
    )
    .addUserOption((option) =>
      option.setName("user").setDescription("User to block").setRequired(true)
    )
    .addIntegerOption((option) =>
      option.setName("duration").setDescription("Duration amount").setRequired(true)
    )
    .addStringOption((option) =>
      option.setName("time").setDescription("Time unit").setRequired(true)
        .addChoices(
          { name: "Minutes", value: "minutes" },
          { name: "Hours", value: "hours" },
          { name: "Days", value: "days" },
          { name: "Weeks", value: "weeks" },
          { name: "Permanent", value: "permanent" }
        )
    )
    .addStringOption((option) =>
      option.setName("reason").setDescription("Reason for block").setRequired(false)
    ),
  new SlashCommandBuilder()
    .setName("unblock")
    .setDescription("Unblock a user from modmail or appeals")
    .setDefaultMemberPermissions(0)
    .addUserOption((option) =>
      option.setName("user").setDescription("User to unblock").setRequired(true)
    )
    .addStringOption((option) =>
      option.setName("system").setDescription("Which system to unblock from").setRequired(true)
        .addChoices(
          { name: "Modmail", value: "modmail" },
          { name: "Ban Appeal", value: "appeal" }
        )
    ),
  new SlashCommandBuilder()
    .setName("permissions")
    .setDescription("Set permission roles for various features")
    .setDefaultMemberPermissions(0)
    .addStringOption((option) =>
      option.setName("type").setDescription("Permission type").setRequired(true)
        .addChoices(
          { name: "Payout Approval", value: "payout" },
          { name: "Ban/Unban Approval", value: "moderation" },
          { name: "Inactivity Approval", value: "inactivity" },
          { name: "Modmail Block", value: "block" },
          { name: "Modmail Claim", value: "claim" },
          { name: "Activity Reset", value: "activity_reset" },
          { name: "Appeal Claim", value: "appeal_claim" }
        )
    )
    .addRoleOption((option) => option.setName("role1").setDescription("Role 1").setRequired(false))
    .addRoleOption((option) => option.setName("role2").setDescription("Role 2").setRequired(false))
    .addRoleOption((option) => option.setName("role3").setDescription("Role 3").setRequired(false))
    .addRoleOption((option) => option.setName("role4").setDescription("Role 4").setRequired(false))
    .addRoleOption((option) => option.setName("role5").setDescription("Role 5").setRequired(false))
    .addRoleOption((option) => option.setName("role6").setDescription("Role 6").setRequired(false))
    .addRoleOption((option) => option.setName("role7").setDescription("Role 7").setRequired(false))
    .addRoleOption((option) => option.setName("role8").setDescription("Role 8").setRequired(false))
    .addRoleOption((option) => option.setName("role9").setDescription("Role 9").setRequired(false))
    .addRoleOption((option) => option.setName("role10").setDescription("Role 10").setRequired(false))
    .addRoleOption((option) => option.setName("role11").setDescription("Role 11").setRequired(false))
    .addRoleOption((option) => option.setName("role12").setDescription("Role 12").setRequired(false))
    .addRoleOption((option) => option.setName("role13").setDescription("Role 13").setRequired(false))
    .addRoleOption((option) => option.setName("role14").setDescription("Role 14").setRequired(false))
    .addRoleOption((option) => option.setName("role15").setDescription("Role 15").setRequired(false))
    .addRoleOption((option) => option.setName("role16").setDescription("Role 16").setRequired(false))
    .addRoleOption((option) => option.setName("role17").setDescription("Role 17").setRequired(false))
    .addRoleOption((option) => option.setName("role18").setDescription("Role 18").setRequired(false))
    .addRoleOption((option) => option.setName("role19").setDescription("Role 19").setRequired(false))
    .addRoleOption((option) => option.setName("role20").setDescription("Role 20").setRequired(false)),
  new SlashCommandBuilder()
    .setName("category_ping")
    .setDescription("Set which roles get pinged for each ticket category")
    .setDefaultMemberPermissions(0)
    .addStringOption((option) =>
      option.setName("category").setDescription("Category ID (use /modmail-category list to see IDs)").setRequired(true)
    )
    .addRoleOption((option) => option.setName("role1").setDescription("Role 1 to ping").setRequired(false))
    .addRoleOption((option) => option.setName("role2").setDescription("Role 2 to ping").setRequired(false))
    .addRoleOption((option) => option.setName("role3").setDescription("Role 3 to ping").setRequired(false))
    .addRoleOption((option) => option.setName("role4").setDescription("Role 4 to ping").setRequired(false))
    .addRoleOption((option) => option.setName("role5").setDescription("Role 5 to ping").setRequired(false)),
  new SlashCommandBuilder()
    .setName("close_all_tickets")
    .setDescription("Close all open modmail tickets (even if channels are deleted)")
    .setDefaultMemberPermissions(0),
  new SlashCommandBuilder()
    .setName("modmail-category")
    .setDescription("Manage modmail ticket categories")
    .setDefaultMemberPermissions(0)
    .addSubcommand((sub) =>
      sub.setName("add").setDescription("Add a new custom category")
        .addStringOption((option) => option.setName("label").setDescription("Display name").setRequired(true))
        .addStringOption((option) => option.setName("description").setDescription("Short description").setRequired(true))
        .addStringOption((option) => option.setName("emoji").setDescription("Emoji for the category").setRequired(false))
    )
    .addSubcommand((sub) =>
      sub.setName("remove").setDescription("Remove a category (shows selection menu)")
    )
    .addSubcommand((sub) =>
      sub.setName("list").setDescription("List all modmail categories")
    ),
  new SlashCommandBuilder()
    .setName("setup_command_logs")
    .setDescription("Set the channel for bot command activity logs")
    .setDefaultMemberPermissions(0)
    .addChannelOption((option) =>
      option
        .setName("channel")
        .setDescription("The channel where command logs will be sent")
        .setRequired(true)
    ),
  new SlashCommandBuilder()
    .setName("roster-embed")
    .setDescription("Post a roster embed with buttons (up to 5 buttons)")
    .setDefaultMemberPermissions(0)
    .addStringOption((option) => option.setName("title").setDescription("Embed title").setRequired(true))
    .addStringOption((option) => option.setName("description").setDescription("Embed description").setRequired(true))
    .addStringOption((option) => option.setName("roster1").setDescription("First roster name").setRequired(true).setAutocomplete(true))
    .addStringOption((option) => option.setName("label1").setDescription("First button label").setRequired(true))
    .addStringOption((option) => option.setName("color1").setDescription("First button color").setRequired(true)
      .addChoices({ name: "Blue", value: "blue" }, { name: "Green", value: "green" }, { name: "Red", value: "red" }, { name: "Grey", value: "grey" }))
    .addStringOption((option) => option.setName("emoji1").setDescription("First button emoji (optional)").setRequired(false))
    .addStringOption((option) => option.setName("roster2").setDescription("Second roster name").setRequired(false).setAutocomplete(true))
    .addStringOption((option) => option.setName("label2").setDescription("Second button label").setRequired(false))
    .addStringOption((option) => option.setName("color2").setDescription("Second button color").setRequired(false)
      .addChoices({ name: "Blue", value: "blue" }, { name: "Green", value: "green" }, { name: "Red", value: "red" }, { name: "Grey", value: "grey" }))
    .addStringOption((option) => option.setName("emoji2").setDescription("Second button emoji (optional)").setRequired(false))
    .addStringOption((option) => option.setName("roster3").setDescription("Third roster name").setRequired(false).setAutocomplete(true))
    .addStringOption((option) => option.setName("label3").setDescription("Third button label").setRequired(false))
    .addStringOption((option) => option.setName("color3").setDescription("Third button color").setRequired(false)
      .addChoices({ name: "Blue", value: "blue" }, { name: "Green", value: "green" }, { name: "Red", value: "red" }, { name: "Grey", value: "grey" }))
    .addStringOption((option) => option.setName("emoji3").setDescription("Third button emoji (optional)").setRequired(false))
    .addStringOption((option) => option.setName("roster4").setDescription("Fourth roster name").setRequired(false).setAutocomplete(true))
    .addStringOption((option) => option.setName("label4").setDescription("Fourth button label").setRequired(false))
    .addStringOption((option) => option.setName("color4").setDescription("Fourth button color").setRequired(false)
      .addChoices({ name: "Blue", value: "blue" }, { name: "Green", value: "green" }, { name: "Red", value: "red" }, { name: "Grey", value: "grey" }))
    .addStringOption((option) => option.setName("emoji4").setDescription("Fourth button emoji (optional)").setRequired(false))
    .addStringOption((option) => option.setName("roster5").setDescription("Fifth roster name").setRequired(false).setAutocomplete(true))
    .addStringOption((option) => option.setName("label5").setDescription("Fifth button label").setRequired(false))
    .addStringOption((option) => option.setName("color5").setDescription("Fifth button color").setRequired(false)
      .addChoices({ name: "Blue", value: "blue" }, { name: "Green", value: "green" }, { name: "Red", value: "red" }, { name: "Grey", value: "grey" }))
    .addStringOption((option) => option.setName("emoji5").setDescription("Fifth button emoji (optional)").setRequired(false))
    .addStringOption((option) => option.setName("embed_color").setDescription("Embed color (hex without #, e.g. 5865f2)").setRequired(false)),
  new SlashCommandBuilder()
    .setName("roster")
    .setDescription("Manage roster configurations")
    .setDefaultMemberPermissions(0)
    .addSubcommand((sub) =>
      sub.setName("add").setDescription("Create a new roster configuration")
        .addStringOption((option) => option.setName("name").setDescription("Roster name").setRequired(true))
        .addRoleOption((option) => option.setName("role1").setDescription("Role 1 (top)").setRequired(true))
        .addRoleOption((option) => option.setName("role2").setDescription("Role 2").setRequired(false))
        .addRoleOption((option) => option.setName("role3").setDescription("Role 3").setRequired(false))
        .addRoleOption((option) => option.setName("role4").setDescription("Role 4").setRequired(false))
        .addRoleOption((option) => option.setName("role5").setDescription("Role 5").setRequired(false))
        .addRoleOption((option) => option.setName("role6").setDescription("Role 6").setRequired(false))
        .addRoleOption((option) => option.setName("role7").setDescription("Role 7").setRequired(false))
        .addRoleOption((option) => option.setName("role8").setDescription("Role 8").setRequired(false))
        .addRoleOption((option) => option.setName("role9").setDescription("Role 9").setRequired(false))
        .addRoleOption((option) => option.setName("role10").setDescription("Role 10").setRequired(false))
        .addRoleOption((option) => option.setName("role11").setDescription("Role 11").setRequired(false))
        .addRoleOption((option) => option.setName("role12").setDescription("Role 12").setRequired(false))
        .addRoleOption((option) => option.setName("role13").setDescription("Role 13").setRequired(false))
        .addRoleOption((option) => option.setName("role14").setDescription("Role 14").setRequired(false))
        .addRoleOption((option) => option.setName("role15").setDescription("Role 15").setRequired(false))
        .addRoleOption((option) => option.setName("role16").setDescription("Role 16").setRequired(false))
        .addRoleOption((option) => option.setName("role17").setDescription("Role 17").setRequired(false))
        .addRoleOption((option) => option.setName("role18").setDescription("Role 18").setRequired(false))
        .addRoleOption((option) => option.setName("role19").setDescription("Role 19").setRequired(false))
        .addRoleOption((option) => option.setName("role20").setDescription("Role 20 (bottom)").setRequired(false))
    )
    .addSubcommand((sub) =>
      sub.setName("edit").setDescription("Edit an existing roster configuration")
        .addStringOption((option) => option.setName("name").setDescription("Roster name").setRequired(true).setAutocomplete(true))
        .addRoleOption((option) => option.setName("role1").setDescription("Role 1 (top)").setRequired(true))
        .addRoleOption((option) => option.setName("role2").setDescription("Role 2").setRequired(false))
        .addRoleOption((option) => option.setName("role3").setDescription("Role 3").setRequired(false))
        .addRoleOption((option) => option.setName("role4").setDescription("Role 4").setRequired(false))
        .addRoleOption((option) => option.setName("role5").setDescription("Role 5").setRequired(false))
        .addRoleOption((option) => option.setName("role6").setDescription("Role 6").setRequired(false))
        .addRoleOption((option) => option.setName("role7").setDescription("Role 7").setRequired(false))
        .addRoleOption((option) => option.setName("role8").setDescription("Role 8").setRequired(false))
        .addRoleOption((option) => option.setName("role9").setDescription("Role 9").setRequired(false))
        .addRoleOption((option) => option.setName("role10").setDescription("Role 10").setRequired(false))
        .addRoleOption((option) => option.setName("role11").setDescription("Role 11").setRequired(false))
        .addRoleOption((option) => option.setName("role12").setDescription("Role 12").setRequired(false))
        .addRoleOption((option) => option.setName("role13").setDescription("Role 13").setRequired(false))
        .addRoleOption((option) => option.setName("role14").setDescription("Role 14").setRequired(false))
        .addRoleOption((option) => option.setName("role15").setDescription("Role 15").setRequired(false))
        .addRoleOption((option) => option.setName("role16").setDescription("Role 16").setRequired(false))
        .addRoleOption((option) => option.setName("role17").setDescription("Role 17").setRequired(false))
        .addRoleOption((option) => option.setName("role18").setDescription("Role 18").setRequired(false))
        .addRoleOption((option) => option.setName("role19").setDescription("Role 19").setRequired(false))
        .addRoleOption((option) => option.setName("role20").setDescription("Role 20 (bottom)").setRequired(false))
    )
    .addSubcommand((sub) =>
      sub.setName("delete").setDescription("Delete a roster configuration")
        .addStringOption((option) => option.setName("name").setDescription("Roster name to delete").setRequired(true).setAutocomplete(true))
    )
    .addSubcommand((sub) =>
      sub.setName("list").setDescription("List all roster configurations")
    ),
  new SlashCommandBuilder()
    .setName("setup_roster")
    .setDescription("Post a roster display in the current channel")
    .setDefaultMemberPermissions(0)
    .addStringOption((option) =>
      option.setName("name").setDescription("Roster name to display").setRequired(true).setAutocomplete(true)
    ),
].map((command) => command.toJSON());

async function hasPayoutPermission(
  memberRoles: string[] | undefined,
  memberPermissions: bigint | string | undefined,
  guildId: string
): Promise<boolean> {
  const config = await storage.getGuildConfig(guildId);

  if (!config?.allowedRoleIds || config.allowedRoleIds.length === 0) {
    const permBits = typeof memberPermissions === 'string' 
      ? BigInt(memberPermissions) 
      : (memberPermissions ?? BigInt(0));
    const ADMINISTRATOR = BigInt(1) << BigInt(3);
    return (permBits & ADMINISTRATOR) === ADMINISTRATOR;
  }

  if (!memberRoles) return false;
  return config.allowedRoleIds.some(roleId => memberRoles.includes(roleId));
}

async function sendDMToUser(userId: string, status: "approved" | "denied", reason: string, moneyOwed: string, paypal: string, actionReason?: string): Promise<void> {
  try {
    // Validate user ID format (Discord snowflake IDs are 17-19 digits)
    if (!/^\d{17,19}$/.test(userId)) {
      console.log(`Invalid user ID format: ${userId}`);
      return;
    }

    const user = await client.users.fetch(userId);
    const statusEmoji = status === "approved" ? "✅" : "❌";
    const statusText = status === "approved" ? "Approved" : "Denied";
    const color = status === "approved" ? 0x23a559 : 0xda373c;

    const fields: any[] = [
      { name: "Status", value: `${statusEmoji} ${statusText}`, inline: true },
      { name: "Money Owed", value: `$${moneyOwed}`, inline: true },
      { name: "PayPal", value: paypal, inline: false },
      { name: "Request Reason", value: reason, inline: false }
    ];

    if (actionReason) {
      fields.push({ name: status === "approved" ? "Approval Note" : "Denial Reason", value: actionReason, inline: false });
    }

    const embed = new EmbedBuilder()
      .setTitle(`Payout Request ${statusText}`)
      .setDescription(`Your payout request has been ${statusText.toLowerCase()}.`)
      .setColor(color)
      .addFields(fields)
      .setTimestamp();

    await user.send({ embeds: [embed] });
  } catch (error) {
    console.log(`Could not DM user ${userId}:`, error);
  }
}

async function sendDMToStaff(staffUserId: string, status: "approved" | "denied", targetUserId: string, moneyOwed: string, paypal: string, actionReason?: string): Promise<void> {
  try {
    // Validate staff user ID format
    if (!/^\d{17,19}$/.test(staffUserId)) {
      console.log(`Invalid staff user ID format: ${staffUserId}`);
      return;
    }

    const user = await client.users.fetch(staffUserId);
    const statusEmoji = status === "approved" ? "✅" : "❌";
    const statusText = status === "approved" ? "Approved" : "Denied";
    const color = status === "approved" ? 0x23a559 : 0xda373c;

    const fields: any[] = [
      { name: "Status", value: `${statusEmoji} ${statusText}`, inline: true },
      { name: "User to be Paid", value: `<@${targetUserId}>`, inline: true },
      { name: "Money Owed", value: `$${moneyOwed}`, inline: true },
      { name: "PayPal", value: paypal, inline: false }
    ];

    if (actionReason) {
      fields.push({ name: status === "approved" ? "Approval Note" : "Denial Reason", value: actionReason, inline: false });
    }

    const embed = new EmbedBuilder()
      .setTitle(`Payout Request ${statusText}`)
      .setDescription(`The payout request you submitted has been ${statusText.toLowerCase()}.`)
      .setColor(color)
      .addFields(fields)
      .setTimestamp();

    await user.send({ embeds: [embed] });
  } catch (error) {
    console.log(`Could not DM staff ${staffUserId}:`, error);
  }
}

async function logCommand(guildId: string, commandName: string, userId: string, username: string, options?: any): Promise<void> {
  try {
    const config = await storage.getGuildConfig(guildId);
    if (!config?.commandLogChannelId) return;

    const logChannel = await client.channels.fetch(config.commandLogChannelId);
    if (!logChannel || !("send" in logChannel)) return;

    let optionsText = "None";
    if (options) {
      const optionsList: string[] = [];
      for (const [key, value] of Object.entries(options)) {
        if (value) {
          optionsList.push(`**${key}:** ${value}`);
        }
      }
      if (optionsList.length > 0) {
        optionsText = optionsList.join("\n");
      }
    }

    const embed = new EmbedBuilder()
      .setTitle("Command Used")
      .setColor(0x5865f2)
      .addFields(
        { name: "Command", value: `\`/${commandName}\``, inline: true },
        { name: "User", value: `<@${userId}> (${username})`, inline: true },
        { name: "Options", value: optionsText, inline: false }
      )
      .setTimestamp();

    await logChannel.send({ embeds: [embed] });
  } catch (error) {
    console.log("Could not log command:", error);
  }
}

const PLAYER_ROLE_IDS = [
  "1447116161866137601",
  "1447116037358358598",
  "1447115944349663314",
  "1447139335785943050",
  "1447116224432570469",
  "1447416759266050108",
  "1447144088054005761",
  "1449540579791863971", // VFX Editor
];

const STAFF_ROLE_IDS = [
  "1447070054960332871",
  "1447118813022781554",
  "1449681628417884291",
  "1449682067771363450",
  "1449682048355930142",
  "1449681215438327910",
  "1449689742768738304",
  "1447070441058336789",
  "1448101236342522008",
  "1447070950750294026",
  "1447118712183459882",
  "1447071053334708406",
  "1449683081316270153",
];


function getMembersWithRole(guild: any, roleId: string): string[] {
  const role = guild.roles.cache.get(roleId);
  if (!role) return [];
  return role.members.map((m: any) => `<@${m.id}>`);
}

async function generatePlayerRoster(guild: any): Promise<string> {
  let playerRoster = "**Competitive Roster**\n\n";

  for (const roleId of PLAYER_ROLE_IDS) {
    const members = getMembersWithRole(guild, roleId);
    playerRoster += `<@&${roleId}>\n\n`;
    if (members.length === 0) {
      playerRoster += "N/A\n";
    } else {
      playerRoster += members.join("\n") + "\n";
    }
  }

  return playerRoster;
}

async function generateStaffRoster(guild: any): Promise<string> {
  let staffRoster = "**Staff Roster**\n\n";

  for (const roleId of STAFF_ROLE_IDS) {
    const members = getMembersWithRole(guild, roleId);
    staffRoster += `<@&${roleId}>\n\n`;
    if (members.length === 0) {
      staffRoster += "N/A\n";
    } else {
      staffRoster += members.join("\n") + "\n";
    }
  }

  return staffRoster;
}

async function updateRosterMessages(guildId: string): Promise<void> {
  try {
    let config = null;
    for (let attempt = 1; attempt <= 3; attempt++) {
      try {
        config = await storage.getGuildConfig(guildId);
        break;
      } catch (dbError: any) {
        const isConnError = dbError.message?.includes('searchParams') || 
                           dbError.code === 'ECONNRESET' || 
                           dbError.message?.includes('ECONNREFUSED') ||
                           dbError.message?.includes('Connection terminated');

        if (attempt < 3 && isConnError) {
          console.log(`[ROSTER] Database connection attempt ${attempt} failed, retrying...`);
          await new Promise(r => setTimeout(r, 1000 * attempt));
        } else if (isConnError) {
          // console.log("[ROSTER] Database unavailable after 3 attempts, skipping roster update");
          return;
        } else {
          throw dbError;
        }
      }
    }
    if (!config) {
      // console.log("[ROSTER] No config found for guild", guildId);
      return;
    }

    const guild = client.guilds.cache.get(guildId);
    if (!guild) {
      // console.log("[ROSTER] Guild not in cache", guildId);
      return;
    }

    // Always fetch fresh member data
    try {
      await guild.members.fetch({ time: 30000 });
      // console.log("[ROSTER] Fetched all members for roster update");
    } catch (error) {
      // console.log("[ROSTER] Could not fetch all members, using cached");
    }

    // Update player roster
    if (config.playerRosterChannelId) {
      // console.log("[ROSTER] Updating player roster...", config.playerRosterChannelId, config.playerRosterMessageId);
      try {
        const channel = await client.channels.fetch(config.playerRosterChannelId);
        if (channel && "send" in channel) {
          const newContent = await generatePlayerRoster(guild);

          // Only update existing message - never create new ones automatically
          if (config.playerRosterMessageId) {
            try {
              const message = await (channel as any).messages.fetch(config.playerRosterMessageId);
              await message.edit({ content: newContent });
              // console.log("[ROSTER] Updated player roster successfully");
            } catch (fetchError: any) {
              // Message deleted - don't create new one, require manual setup
              console.log("[ROSTER] Player roster message not found, skipping auto-update (use /roster to re-setup)");
            }
          }
          // If no message ID, skip - require explicit /roster command to set up
        } else {
          // console.log("[ROSTER] Channel not a text channel");
        }
      } catch (error: any) {
        // console.log("[ROSTER] Could not update player roster:", error.message || error);
      }
    } else {
      // console.log("[ROSTER] No player roster channel configured");
    }

    // Update staff roster
    if (config.staffRosterChannelId) {
      // console.log("[ROSTER] Updating staff roster...", config.staffRosterChannelId, config.staffRosterMessageId);
      try {
        const channel = await client.channels.fetch(config.staffRosterChannelId);
        if (channel && "send" in channel) {
          const newContent = await generateStaffRoster(guild);

          // Only update existing message - never create new ones automatically
          if (config.staffRosterMessageId) {
            try {
              const message = await (channel as any).messages.fetch(config.staffRosterMessageId);
              await message.edit({ content: newContent });
              // console.log("[ROSTER] Updated staff roster successfully");
            } catch (fetchError: any) {
              // Message deleted - don't create new one, require manual setup
              console.log("[ROSTER] Staff roster message not found, skipping auto-update (use /roster to re-setup)");
            }
          }
          // If no message ID, skip - require explicit /roster command to set up
        } else {
          // console.log("[ROSTER] Channel not a text channel");
        }
      } catch (error: any) {
        // console.log("[ROSTER] Could not update staff roster:", error.message || error);
      }
    } else {
      // console.log("[ROSTER] No staff roster channel configured");
    }

    // Update custom rosters
    try {
      const customRosters = await storage.getAllRosterConfigs(guildId);
      for (const roster of customRosters) {
        if (!roster.messageId || !roster.channelId) continue;

        try {
          const channel = await client.channels.fetch(roster.channelId);
          if (channel && "send" in channel) {
            // Generate roster content
            let rosterContent = `**${roster.name.charAt(0).toUpperCase() + roster.name.slice(1)} Roster**\n\n`;

            for (const roleId of roster.roleIds) {
              const role = guild.roles.cache.get(roleId);
              if (!role) continue;

              rosterContent += `<@&${roleId}>\n\n`;
              const members = role.members.map((m: any) => `<@${m.id}>`);
              if (members.length === 0) {
                rosterContent += "N/A\n";
              } else {
                rosterContent += members.join("\n") + "\n";
              }
              rosterContent += "\n";
            }

            try {
              const message = await (channel as any).messages.fetch(roster.messageId);
              await message.edit({ content: rosterContent });
            } catch (fetchError: any) {
              // Message deleted - clear the message ID
              await storage.updateRosterConfig(guildId, roster.name, { messageId: undefined, channelId: undefined });
            }
          }
        } catch (error: any) {
          // Channel not found or other error
        }
      }
    } catch (error: any) {
      // Could not fetch custom rosters
    }
  } catch (error) {
    console.error("[ROSTER] Error updating roster messages:", error);
  }
}

client.once("clientReady", async () => {
  console.log(`✅ Bot logged in as ${client.user?.tag}`);

  if (!APPLICATION_ID) {
    console.warn("⚠️  DISCORD_APPLICATION_ID not set. Skipping command registration.");
    return;
  }

  // Register commands in background with timeout to not block bot startup
  (async () => {
    try {
      const rest = new REST({ version: "10" }).setToken(process.env.DISCORD_BOT_TOKEN!);
      console.log("🔄 Registering slash commands...");

      const timeoutPromise = new Promise((_, reject) => 
        setTimeout(() => reject(new Error("Command registration timed out after 30s")), 30000)
      );

      await Promise.race([
        rest.put(Routes.applicationCommands(APPLICATION_ID), { body: commands }),
        timeoutPromise
      ]);

      console.log("✅ Slash commands registered successfully!");
    } catch (error: any) {
      console.error("❌ Error registering commands:", error.message || error);
      console.log("⚠️ Bot will continue running with existing commands");
    }
  })();
});

client.on("interactionCreate", async (interaction) => {
  try {
    // Check interaction age - Discord interactions expire after 3 seconds
    const interactionAge = Date.now() - interaction.createdTimestamp;
    if (interactionAge > 2500) {
      console.log(`[INTERACTION] Skipping stale interaction (age: ${interactionAge}ms): ${interaction.id}`);
      return;
    }

    // Check if interaction is still valid
    if (interaction.isRepliable() && interaction.replied) {
      console.log('Interaction already replied to:', interaction.id);
      return;
    }

    // Handle autocomplete interactions
    if (interaction.isAutocomplete()) {
      const { commandName } = interaction;
      const focusedOption = interaction.options.getFocused(true);

      // Handle roster name autocomplete
      if ((commandName === "roster" || commandName === "setup_roster") && focusedOption.name === "name") {
        try {
          const guildId = interaction.guildId;
          if (!guildId) {
            await interaction.respond([]);
            return;
          }

          const rosters = await storage.getAllRosterConfigs(guildId);
          const filtered = rosters
            .filter(r => r.name.toLowerCase().includes(focusedOption.value.toLowerCase()))
            .slice(0, 25)
            .map(r => ({ name: r.name, value: r.name }));

          await interaction.respond(filtered);
        } catch (e) {
          console.log("Roster autocomplete error:", e);
          await interaction.respond([]).catch(() => {});
        }
        return;
      }

      // Handle roster-embed roster autocomplete
      if (commandName === "roster-embed" && focusedOption.name.startsWith("roster")) {
        try {
          const guildId = interaction.guildId;
          if (!guildId) {
            await interaction.respond([]);
            return;
          }

          const rosters = await storage.getAllRosterConfigs(guildId);
          const filtered = rosters
            .filter(r => r.name.toLowerCase().includes(focusedOption.value.toLowerCase()))
            .slice(0, 25)
            .map(r => ({ name: r.name.charAt(0).toUpperCase() + r.name.slice(1), value: r.name }));

          await interaction.respond(filtered);
        } catch (e) {
          console.log("Roster-embed autocomplete error:", e);
          await interaction.respond([]).catch(() => {});
        }
        return;
      }

      return;
    }

    if (interaction.isChatInputCommand()) {
      const { commandName } = interaction;

      // Log command usage (fire-and-forget, no await)
      if (interaction.guildId) {
        const optionsData: any = {};
        for (const option of interaction.options.data) {
          if (option.value !== undefined) {
            optionsData[option.name] = option.value;
          } else if (option.channel) {
            optionsData[option.name] = `#${option.channel.name}`;
          } else if (option.role) {
            optionsData[option.name] = `@${option.role.name}`;
          } else if (option.user) {
            optionsData[option.name] = `@${option.user.username}`;
          }
        }
        logCommand(interaction.guildId, commandName, interaction.user.id, interaction.user.username, optionsData).catch(() => {});
      }

      if (commandName === "setup_pay_request") {
        if (!await safeDeferReply(interaction)) return;
        try {
          const channel = interaction.options.getChannel("channel", true);

          await storage.updateRequestChannel(interaction.guildId!, channel.id);

          const embed = new EmbedBuilder()
            .setTitle("Payout Request System")
            .setDescription("Click the button below to request a payout.")
            .setColor(0x5865f2);

          const row = new ActionRowBuilder<ButtonBuilder>().addComponents(
            new ButtonBuilder()
              .setCustomId("request_payout")
              .setLabel("Request Payout")
              .setStyle(ButtonStyle.Primary)
          );

          if (interaction.channel && "send" in interaction.channel) {
            await interaction.channel.send({
              embeds: [embed],
              components: [row],
            });
          }

          await interaction.editReply({
            content: `Configuration saved! Payout requests will be sent to <#${channel.id}>.`,
          });
        } catch (error: any) {
          console.log("Error in setup_pay_request:", error.message);
          await interaction.editReply({ content: "Failed to set up payout request. Please try again." }).catch(() => {});
        }
      } else if (commandName === "setup_payment_logs") {
        if (!await safeDeferReply(interaction)) return;

        try {
          const channel = interaction.options.getChannel("channel", true);

          await storage.updateLogChannel(interaction.guildId!, channel.id);

          await interaction.editReply({
            content: `Configuration saved! Payment logs will be sent to <#${channel.id}>.`,
          });
        } catch (error: any) {
          console.log("Error in setup_payment_logs:", error.message);
          await interaction.editReply({ content: "Failed to set up payment logs. Please try again." }).catch(() => {});
        }
      } else if (commandName === "list_payouts") {
        const isPrivate = interaction.options.getBoolean("private") ?? true;
        if (!await safeDeferReply(interaction, isPrivate)) return;

        try {
          const member = interaction.member;
          const memberRoles = member && 'roles' in member 
            ? (Array.isArray(member.roles) ? member.roles : Array.from(member.roles.cache.keys()))
            : undefined;
          const memberPermissions = member && 'permissions' in member 
            ? (typeof member.permissions === 'string' ? member.permissions : member.permissions?.bitfield)
            : undefined;

          const hasPermission = await hasPayoutPermission(memberRoles, memberPermissions, interaction.guildId!);
          if (!hasPermission) {
            await interaction.editReply({
              content: "You don't have permission to view payout requests.",
            });
            return;
          }

          const allPayouts = await storage.getAllPayouts(interaction.guildId!);

          if (allPayouts.length === 0) {
            await interaction.editReply({
              content: "No payout requests found.",
            });
            return;
          }

          const pending = allPayouts.filter(p => p.status === "pending");
          const approved = allPayouts.filter(p => p.status === "approved");
          const denied = allPayouts.filter(p => p.status === "denied");

          const totalPending = pending.reduce((sum, p) => sum + parseFloat(p.moneyOwed || "0"), 0);
          const totalApproved = approved.reduce((sum, p) => sum + parseFloat(p.moneyOwed || "0"), 0);
          const totalDenied = denied.reduce((sum, p) => sum + parseFloat(p.moneyOwed || "0"), 0);

          const embeds: EmbedBuilder[] = [];

          const summaryEmbed = new EmbedBuilder()
            .setTitle("All Payout Requests")
            .setColor(0x5865f2)
            .setDescription(`Total: **${allPayouts.length}** requests`)
            .addFields(
              { name: "Pending", value: `**${pending.length}** requests\n$${totalPending.toFixed(2)}`, inline: true },
              { name: "Approved", value: `**${approved.length}** requests\n$${totalApproved.toFixed(2)}`, inline: true },
              { name: "Denied", value: `**${denied.length}** requests\n$${totalDenied.toFixed(2)}`, inline: true }
            )
            .setTimestamp();
          embeds.push(summaryEmbed);

          const formatPayoutList = (payouts: typeof allPayouts, title: string, emoji: string, color: number) => {
            if (payouts.length === 0) return null;

            let description = "";
            payouts.forEach((payout, index) => {
              const line = `**${index + 1}.)** <@${payout.userId}>\n> **ID:** ${payout.userId}\n> **Reason:** ${payout.reason || "No reason"}\n> **Amount:** $${payout.moneyOwed}\n> **Email:** ${payout.email}\n\n`;
              if (description.length + line.length < 4000) {
                description += line;
              }
            });

            return new EmbedBuilder()
              .setTitle(`${emoji} ${title}`)
              .setColor(color)
              .setDescription(description || "None");
          };

          const pendingEmbed = formatPayoutList(pending, "Pending Requests", "", 0xf0b232);
          const approvedEmbed = formatPayoutList(approved, "Approved Requests", "", 0x23a559);
          const deniedEmbed = formatPayoutList(denied, "Denied Requests", "", 0xda373c);

          if (pendingEmbed) embeds.push(pendingEmbed);
          if (approvedEmbed) embeds.push(approvedEmbed);
          if (deniedEmbed) embeds.push(deniedEmbed);

          await interaction.editReply({ embeds: embeds.slice(0, 10) });
        } catch (error: any) {
          console.log("Error in list_payouts:", error.message);
          await interaction.editReply({ content: "Failed to list payouts. Please try again." }).catch(() => {});
        }
      } else if (commandName === "refresh_roster") {
        if (!await safeDeferReply(interaction)) return;

        await updateRosterMessages(interaction.guildId!);

        try {
          await interaction.editReply({
            content: "✅ Rosters have been refreshed!",
          });
        } catch (e) {}
      } else if (commandName === "user_payouts") {
        if (!await safeDeferReply(interaction)) return;

        const member = interaction.member;
        const memberRoles = member && 'roles' in member 
          ? (Array.isArray(member.roles) ? member.roles : Array.from(member.roles.cache.keys()))
          : undefined;
        const memberPermissions = member && 'permissions' in member 
          ? (typeof member.permissions === 'string' ? member.permissions : member.permissions?.bitfield)
          : undefined;

        const hasPermission = await hasPayoutPermission(memberRoles, memberPermissions, interaction.guildId!);
        if (!hasPermission) {
          await interaction.editReply({
            content: "❌ You don't have permission to view payout requests.",
          });
          return;
        }

        const targetUser = interaction.options.getUser("user", true);
        const userPayouts = await storage.getUserPayouts(interaction.guildId!, targetUser.id);

        if (userPayouts.length === 0) {
          await interaction.editReply({
            content: `No payout requests found for <@${targetUser.id}>.`,
          });
          return;
        }

        const pending = userPayouts.filter(p => p.status === "pending");
        const approved = userPayouts.filter(p => p.status === "approved");
        const denied = userPayouts.filter(p => p.status === "denied");

        const totalOwed = pending.reduce((sum, p) => sum + parseFloat(p.moneyOwed || "0"), 0);
        const totalPaid = approved.reduce((sum, p) => sum + parseFloat(p.moneyOwed || "0"), 0);

        const embed = new EmbedBuilder()
          .setTitle(`Payout History for ${targetUser.username}`)
          .setColor(0x5865f2)
          .addFields(
            { name: "Total Requests", value: userPayouts.length.toString(), inline: true },
            { name: "Pending", value: pending.length.toString(), inline: true },
            { name: "Approved", value: approved.length.toString(), inline: true },
            { name: "Denied", value: denied.length.toString(), inline: true },
            { name: "Pending Amount", value: `$${totalOwed.toFixed(2)}`, inline: true },
            { name: "Total Paid", value: `$${totalPaid.toFixed(2)}`, inline: true }
          )
          .setTimestamp();

        await interaction.editReply({
          embeds: [embed],
        });
      } else if (commandName === "payout") {
        if (!await safeDeferReply(interaction)) return;

        const member = interaction.member;
        const memberRoles = member && 'roles' in member 
          ? (Array.isArray(member.roles) ? member.roles : Array.from(member.roles.cache.keys()))
          : undefined;
        const memberPermissions = member && 'permissions' in member 
          ? (typeof member.permissions === 'string' ? member.permissions : member.permissions?.bitfield)
          : undefined;

        const hasPermission = await hasPayoutPermission(memberRoles, memberPermissions, interaction.guildId!);
        if (!hasPermission) {
          await interaction.editReply({
            content: "❌ You don't have permission to manage payout requests.",
          });
          return;
        }

        const action = interaction.options.getString("action", true);
        const targetUser = interaction.options.getUser("user");
        const payoutId = interaction.options.getString("payout_id");

        if (action === "add") {
          if (!targetUser) {
            await interaction.editReply({
              content: "❌ You must specify a user for the Add action.",
            });
            return;
          }
          const amount = interaction.options.getString("amount") || "0.00";
          const email = interaction.options.getString("email") || "Not provided";
          const reason = interaction.options.getString("reason") || "Added via command";
          const status = interaction.options.getString("status") || "pending";

          const payoutRequest = await storage.createPayoutRequest({
            guildId: interaction.guildId!,
            userId: targetUser.id,
            requestedById: interaction.user.id,
            reason,
            moneyOwed: amount,
            email,
            status,
          });

          const config = await storage.getGuildConfig(interaction.guildId!);
          if (config?.requestChannelId) {
            try {
              const requestChannel = await client.channels.fetch(config.requestChannelId);
              if (requestChannel && "send" in requestChannel) {
                const statusEmoji = status === "pending" ? "⏳" : status === "approved" ? "✅" : "❌";
                const statusText = status.charAt(0).toUpperCase() + status.slice(1);
                const embedColor = status === "pending" ? 0xf0b232 : status === "approved" ? 0x57f287 : 0xed4245;

                const embed = new EmbedBuilder()
                  .setTitle("Payout Request")
                  .setColor(embedColor)
                  .addFields(
                    { name: "User ID", value: `${targetUser.id} (<@${targetUser.id}>)`, inline: true },
                    { name: "Requested by", value: `<@${interaction.user.id}>`, inline: true },
                    { name: "Status", value: `${statusEmoji} ${statusText}`, inline: true },
                    { name: "Reason", value: reason, inline: false },
                    { name: "Money Owed", value: `$${amount}`, inline: false },
                    { name: "Paypal", value: email, inline: false }
                  )
                  .setFooter({ text: `Request ID: ${payoutRequest.id}` })
                  .setTimestamp();

                if (status === "pending") {
                  const row = new ActionRowBuilder<ButtonBuilder>().addComponents(
                    new ButtonBuilder()
                      .setCustomId(`approve_${payoutRequest.id}`)
                      .setLabel("Approve")
                      .setStyle(ButtonStyle.Success),
                    new ButtonBuilder()
                      .setCustomId(`deny_${payoutRequest.id}`)
                      .setLabel("Deny")
                      .setStyle(ButtonStyle.Danger)
                  );

                  const sentMessage = await requestChannel.send({
                    embeds: [embed],
                    components: [row],
                  });
                  await storage.updatePayoutMessageId(payoutRequest.id, sentMessage.id);
                } else {
                  const sentMessage = await requestChannel.send({
                    embeds: [embed],
                  });
                  await storage.updatePayoutMessageId(payoutRequest.id, sentMessage.id);
                }
              }
            } catch (error) {
              console.log("Could not send to request channel:", error);
            }
          }

          await interaction.editReply({
            content: `✅ Payout request added for <@${targetUser.id}> - $${amount}`,
          });
        } else if (action === "edit") {
          let payout;

          if (payoutId) {
            payout = await storage.getPayoutRequest(payoutId);
            if (!payout) {
              await interaction.editReply({
                content: `Payout request with ID \`${payoutId}\` not found.`,
              });
              return;
            }
          } else if (targetUser) {
            const userPayouts = await storage.getUserPayouts(interaction.guildId!, targetUser.id);
            if (userPayouts.length === 0) {
              await interaction.editReply({
                content: `No payout requests found for <@${targetUser.id}>.`,
              });
              return;
            }
            payout = userPayouts[0]; // Get most recent
          } else {
            await interaction.editReply({
              content: "Please provide either a user or payout_id to edit.",
            });
            return;
          }

          const amount = interaction.options.getString("amount");
          const email = interaction.options.getString("email");
          const reason = interaction.options.getString("reason");
          const status = interaction.options.getString("status");

          if (!amount && !email && !reason && !status) {
            await interaction.editReply({
              content: `❌ Please provide at least one field to update (amount, email, reason, or status).`,
            });
            return;
          }

          const updates: { moneyOwed?: string; email?: string; reason?: string; status?: string } = {};
          if (amount) updates.moneyOwed = amount;
          if (email) updates.email = email;
          if (reason) updates.reason = reason;
          if (status) updates.status = status;

          const updatedPayout = await storage.updatePayoutRequest(payout.id, updates);

          if (payout.messageId) {
            try {
              const config = await storage.getGuildConfig(interaction.guildId!);
              if (config?.requestChannelId) {
                const channel = await client.channels.fetch(config.requestChannelId);
                if (channel && "messages" in channel) {
                  const message = await channel.messages.fetch(payout.messageId);

                  const statusEmoji = updatedPayout.status === "pending" ? "⏳" : updatedPayout.status === "approved" ? "✅" : "❌";
                  const statusText = updatedPayout.status!.charAt(0).toUpperCase() + updatedPayout.status!.slice(1);
                  const embedColor = updatedPayout.status === "pending" ? 0xf0b232 : updatedPayout.status === "approved" ? 0x57f287 : 0xed4245;

                  const updatedEmbed = new EmbedBuilder()
                    .setTitle("Payout Request")
                    .setColor(embedColor)
                    .addFields(
                      { name: "User ID", value: `${payout.userId} (<@${payout.userId}>)`, inline: true },
                      { name: "Requested by", value: `<@${updatedPayout.requestedById}>`, inline: true },
                      { name: "Status", value: `${statusEmoji} ${statusText}`, inline: true },
                      { name: "Reason", value: updatedPayout.reason || "No reason", inline: false },
                      { name: "Money Owed", value: `$${updatedPayout.moneyOwed}`, inline: false },
                      { name: "Paypal", value: updatedPayout.email || "Not provided", inline: false }
                    )
                    .setFooter({ text: `Request ID: ${payout.id} (Edited)` })
                    .setTimestamp();

                  if (updatedPayout.status === "pending") {
                    const row = new ActionRowBuilder<ButtonBuilder>().addComponents(
                      new ButtonBuilder()
                        .setCustomId(`approve_${payout.id}`)
                        .setLabel("Approve")
                        .setStyle(ButtonStyle.Success),
                      new ButtonBuilder()
                        .setCustomId(`deny_${payout.id}`)
                        .setLabel("Deny")
                        .setStyle(ButtonStyle.Danger)
                    );
                    await message.edit({
                      embeds: [updatedEmbed],
                      components: [row],
                    });
                  } else {
                    await message.edit({
                      embeds: [updatedEmbed],
                      components: [],
                    });
                  }
                }
              }
            } catch (error) {
              console.log("Could not update payout message:", error);
            }
          }

          const changedFields = [];
          if (amount) changedFields.push(`Amount: $${amount}`);
          if (email) changedFields.push(`Email: ${email}`);
          if (reason) changedFields.push(`Reason: ${reason}`);
          if (status) changedFields.push(`Status: ${status}`);

          await interaction.editReply({
            content: `✅ Updated payout request for <@${payout.userId}>.\n**Changes:** ${changedFields.join(", ")}`,
          });
        } else if (action === "remove") {
          const removeAll = interaction.options.getBoolean("remove_all") ?? false;

          if (removeAll) {
            if (targetUser) {
              const userPayouts = await storage.getUserPayouts(interaction.guildId!, targetUser.id);
              if (userPayouts.length === 0) {
                await interaction.editReply({
                  content: `No payout requests found for <@${targetUser.id}>.`,
                });
                return;
              }

              const config = await storage.getGuildConfig(interaction.guildId!);
              for (const payout of userPayouts) {
                if (payout.messageId && config?.requestChannelId) {
                  try {
                    const channel = await client.channels.fetch(config.requestChannelId);
                    if (channel && "messages" in channel) {
                      const message = await channel.messages.fetch(payout.messageId);
                      await message.delete();
                    }
                  } catch (error) {
                    console.log("Could not delete payout message:", error);
                  }
                }
              }

              const count = await storage.deleteUserPayouts(interaction.guildId!, targetUser.id);
              await interaction.editReply({
                content: `✅ Removed all ${count} payout request(s) for <@${targetUser.id}>.`,
              });
            } else {
              const allPayouts = await storage.getAllPayouts(interaction.guildId!);
              if (allPayouts.length === 0) {
                await interaction.editReply({
                  content: "No payout requests found in this server.",
                });
                return;
              }

              const config = await storage.getGuildConfig(interaction.guildId!);
              for (const payout of allPayouts) {
                if (payout.messageId && config?.requestChannelId) {
                  try {
                    const channel = await client.channels.fetch(config.requestChannelId);
                    if (channel && "messages" in channel) {
                      const message = await channel.messages.fetch(payout.messageId);
                      await message.delete();
                    }
                  } catch (error) {
                    console.log("Could not delete payout message:", error);
                  }
                }
              }

              const count = await storage.deleteAllPayouts(interaction.guildId!);
              await interaction.editReply({
                content: `✅ Removed all ${count} payout request(s) from this server.`,
              });
            }
          } else {
            let payout;

            if (payoutId) {
              payout = await storage.getPayoutRequest(payoutId);
              if (!payout) {
                await interaction.editReply({
                  content: `Payout request with ID \`${payoutId}\` not found.`,
                });
                return;
              }
            } else if (targetUser) {
              const userPayouts = await storage.getUserPayouts(interaction.guildId!, targetUser.id);
              if (userPayouts.length === 0) {
                await interaction.editReply({
                  content: `No payout requests found for <@${targetUser.id}>.`,
                });
                return;
              }
              payout = userPayouts[0];
            } else {
              await interaction.editReply({
                content: "Please provide either a user or payout_id to remove.",
              });
              return;
            }

            await storage.deletePayoutRequest(payout.id);

            if (payout.messageId) {
              try {
                const config = await storage.getGuildConfig(interaction.guildId!);
                if (config?.requestChannelId) {
                  const channel = await client.channels.fetch(config.requestChannelId);
                  if (channel && "messages" in channel) {
                    const message = await channel.messages.fetch(payout.messageId);
                    await message.delete();
                  }
                }
              } catch (error) {
                console.log("Could not delete payout message:", error);
              }
            }

            await interaction.editReply({
              content: `✅ Removed payout request for <@${payout.userId}>.`,
            });
          }
        }
      } else if (commandName === "sync_roles") {
        if (!await safeDeferReply(interaction)) return;

        const member = interaction.member;
        const memberPermissions = member && 'permissions' in member 
          ? (typeof member.permissions === 'string' ? member.permissions : member.permissions?.bitfield)
          : undefined;

        const permBits = typeof memberPermissions === 'string' 
          ? BigInt(memberPermissions) 
          : (memberPermissions ?? BigInt(0));
        const ADMINISTRATOR = BigInt(1) << BigInt(3);
        const isAdmin = (permBits & ADMINISTRATOR) === ADMINISTRATOR;

        if (!isAdmin) {
          await interaction.editReply({
            content: "❌ You need Administrator permission to manage role sync pairs.",
          });
          return;
        }

        const action = interaction.options.getString("action", true);

        if (action === "list") {
          const pairs = await storage.getAllRoleSyncPairs();

          if (pairs.length === 0) {
            await interaction.editReply({
              content: "No role sync pairs configured. Use `/sync_roles action:Add` to add one.",
            });
            return;
          }

          const embed = new EmbedBuilder()
            .setTitle("Role Sync Pairs")
            .setColor(0x5865f2)
            .setDescription("These roles are synced between servers. When a role is added/removed in one server, it syncs to the paired role in the other server.")
            .setTimestamp();

          for (const pair of pairs) {
            embed.addFields({
              name: `Pair ID: ${pair.id}`,
              value: `**Source:** <@&${pair.sourceRoleId}> (Server: ${pair.sourceGuildId})\n**Target:** <@&${pair.targetRoleId}> (Server: ${pair.targetGuildId})`,
              inline: false,
            });
          }

          await interaction.editReply({ embeds: [embed] });
        } else if (action === "add") {
          const sourceRoleId = interaction.options.getString("source_role_id");
          const targetRoleId = interaction.options.getString("target_role_id");
          const sourceGuildId = interaction.options.getString("source_guild_id");
          const targetGuildId = interaction.options.getString("target_guild_id");

          if (!sourceRoleId || !targetRoleId || !sourceGuildId || !targetGuildId) {
            await interaction.editReply({
              content: "❌ You must provide source_role_id, target_role_id, source_guild_id, and target_guild_id to add a sync pair.",
            });
            return;
          }

          // Validate IDs are snowflakes (Discord IDs)
          const snowflakeRegex = /^\d{17,19}$/;
          if (!snowflakeRegex.test(sourceRoleId) || !snowflakeRegex.test(targetRoleId) || 
              !snowflakeRegex.test(sourceGuildId) || !snowflakeRegex.test(targetGuildId)) {
            await interaction.editReply({
              content: "❌ Invalid ID format. All IDs must be valid Discord snowflakes (17-19 digit numbers).",
            });
            return;
          }

          // Verify guilds exist
          const sourceGuild = client.guilds.cache.get(sourceGuildId);
          const targetGuild = client.guilds.cache.get(targetGuildId);

          if (!sourceGuild) {
            await interaction.editReply({
              content: `❌ Source guild ${sourceGuildId} not found. The bot must be in both guilds.`,
            });
            return;
          }

          if (!targetGuild) {
            await interaction.editReply({
              content: `❌ Target guild ${targetGuildId} not found. The bot must be in both guilds.`,
            });
            return;
          }

          // Verify roles exist in their respective guilds
          const sourceRole = sourceGuild.roles.cache.get(sourceRoleId);
          const targetRole = targetGuild.roles.cache.get(targetRoleId);

          if (!sourceRole) {
            await interaction.editReply({
              content: `❌ Source role ${sourceRoleId} not found in guild ${sourceGuild.name}.`,
            });
            return;
          }

          if (!targetRole) {
            await interaction.editReply({
              content: `❌ Target role ${targetRoleId} not found in guild ${targetGuild.name}.`,
            });
            return;
          }

          const pair1 = await storage.addRoleSyncPair({
            sourceGuildId,
            sourceRoleId,
            targetGuildId,
            targetRoleId,
          });

          const pair2 = await storage.addRoleSyncPair({
            sourceGuildId: targetGuildId,
            sourceRoleId: targetRoleId,
            targetGuildId: sourceGuildId,
            targetRoleId: sourceRoleId,
          });

          await interaction.editReply({
            content: `✅ Role sync pair added!\n**Source:** ${sourceRole.name} (<@&${sourceRoleId}>) in ${sourceGuild.name}\n**Target:** ${targetRole.name} (<@&${targetRoleId}>) in ${targetGuild.name}\n\nPair IDs: \`${pair1.id}\`, \`${pair2.id}\``,
          });
        } else if (action === "remove") {
          const pairId = interaction.options.getString("pair_id");

          if (!pairId) {
            await interaction.editReply({
              content: "❌ You must provide a pair_id to remove. Use `/sync_roles action:List` to see all pairs.",
            });
            return;
          }

          await storage.removeRoleSyncPair(pairId);

          await interaction.editReply({
            content: `✅ Removed role sync pair \`${pairId}\`.`,
          });
        }
      } else if (commandName === "members") {
        if (!await safeDeferReply(interaction, false)) return;

        const role = interaction.options.getRole("role", true);
        const guild = interaction.guild;

        if (!guild) {
          await interaction.editReply({ content: "❌ This command must be used in a server." });
          return;
        }

        try {
          await guild.members.fetch({ time: 30000 });
        } catch (error) {
          console.log("Could not fully fetch members");
        }

        const guildRole = guild.roles.cache.get(role.id);
        if (!guildRole) {
          await interaction.editReply({ content: "❌ Role not found in this server." });
          return;
        }

        const members = guildRole.members.map((m) => `<@${m.id}>`);
        const pageSize = 10;
        const totalPages = Math.ceil(members.length / pageSize) || 1;
        const currentPage = 0;

        const pageMembers = members.slice(currentPage * pageSize, (currentPage + 1) * pageSize);

        const embed = new EmbedBuilder()
          .setTitle(`Members with ${guildRole.name}`)
          .setColor(guildRole.color || 0x5865f2)
          .setDescription(pageMembers.length > 0 ? pageMembers.join("\n") : "No members have this role.")
          .setFooter({ text: `Page ${currentPage + 1}/${totalPages} • Total: ${members.length} member(s)` })
          .setTimestamp();

        if (members.length > pageSize) {
          const row = new ActionRowBuilder<ButtonBuilder>().addComponents(
            new ButtonBuilder()
              .setCustomId(`members_prev_${role.id}_0`)
              .setLabel("◀ Previous")
              .setStyle(ButtonStyle.Secondary)
              .setDisabled(true),
            new ButtonBuilder()
              .setCustomId(`members_next_${role.id}_0`)
              .setLabel("Next ▶")
              .setStyle(ButtonStyle.Secondary)
              .setDisabled(totalPages <= 1)
          );
          await interaction.editReply({ embeds: [embed], components: [row] });
        } else {
          await interaction.editReply({ embeds: [embed] });
        }
      } else if (commandName === "setup_moderation") {
        if (!await safeDeferReply(interaction)) return;

        const channel = interaction.options.getChannel("channel", true);

        await storage.upsertGuildConfig({
          guildId: interaction.guildId!,
          banChannelId: channel.id,
          unbanChannelId: channel.id,
        });

        const embed = new EmbedBuilder()
          .setTitle("⚖️ Moderation Requests")
          .setDescription("Submit a ban or unban request by clicking the appropriate button below.")
          .setColor(0x5865f2)
          .setFooter({ text: "Moderation Requests Can Take Up To A Day To Get Finalised" });

        const row = new ActionRowBuilder<ButtonBuilder>().addComponents(
          new ButtonBuilder()
            .setCustomId("submit_ban_request")
            .setLabel("Ban Request")
            .setStyle(ButtonStyle.Danger)
            .setEmoji("🚫"),
          new ButtonBuilder()
            .setCustomId("submit_unban_request")
            .setLabel("Unban Request")
            .setStyle(ButtonStyle.Success)
            .setEmoji("🔓")
        );

        if (interaction.channel && "send" in interaction.channel) {
          await interaction.channel.send({
            embeds: [embed],
            components: [row],
          });
        }

        await interaction.editReply({
          content: `✅ Moderation request channel configured! Requests will be sent to <#${channel.id}>.`,
        });
      } else if (commandName === "setup_moderation_logs") {
        if (!await safeDeferReply(interaction)) return;

        const channel = interaction.options.getChannel("channel", true);

        await storage.upsertGuildConfig({
          guildId: interaction.guildId!,
          banLogChannelId: channel.id,
          unbanLogChannelId: channel.id,
        });

        await interaction.editReply({
          content: `✅ Configuration saved! Moderation request logs will be sent to <#${channel.id}>.`,
        });
      } else if (commandName === "prefix") {
        if (!await safeDeferReply(interaction)) return;

        const newPrefix = interaction.options.getString("new_prefix", true);

        if (newPrefix.length > 3) {
          await interaction.editReply({
            content: "The prefix must be 3 characters or less.",
          });
          return;
        }

        await storage.upsertGuildConfig({
          guildId: interaction.guildId!,
          commandPrefix: newPrefix,
        });

        await interaction.editReply({
          content: `Changed server prefix to \`${newPrefix}\``,
        });
      } else if (commandName === "activity") {
        if (!await safeDeferReply(interaction, false)) return;

        try {
          const targetMember = interaction.options.getUser("member");
          const category = interaction.options.getString("category");
          const scope = interaction.options.getString("scope") || "all"; // Default to all servers
          const fromDays = interaction.options.getInteger("from") ?? undefined;
          const toDays = interaction.options.getInteger("to") ?? undefined;
          const useAllGuilds = scope === "all";

          // Build time range description with Discord timestamps (hammer times)
          const now = new Date();
          const fromDate = fromDays !== undefined ? new Date(now.getTime() - fromDays * 24 * 60 * 60 * 1000) : null;
          const toDate = toDays !== undefined ? new Date(now.getTime() - toDays * 24 * 60 * 60 * 1000) : now;

          let timeRangeDesc = useAllGuilds ? "📊 **All Servers**" : "📊 **This Server Only**";
          if (fromDate || toDays !== undefined) {
            const fromTimestamp = fromDate ? `<t:${Math.floor(fromDate.getTime() / 1000)}:F>` : null;
            const toTimestamp = `<t:${Math.floor(toDate.getTime() / 1000)}:F>`;
            timeRangeDesc += "\n" + (fromTimestamp ? `From ${fromTimestamp} to ${toTimestamp}` : `Up to ${toTimestamp}`);
          }

          // If a specific member is requested, show their individual stats
          if (targetMember) {
            let memberBanStats = 0;
            let memberUnbanStats = 0;
            let memberModmailStats = 0;
            let memberAppealStats = 0;
            let memberModmailCategoryStats: { category: string; count: number }[] = [];

            try {
              memberBanStats = useAllGuilds 
                ? await storage.getActivityStatsForUserAllGuilds(targetMember.id, "ban", fromDays, toDays)
                : await storage.getActivityStatsForUser(interaction.guildId!, targetMember.id, "ban", fromDays, toDays);
            } catch (e) {
              console.log("Could not fetch member ban stats:", e);
            }
            try {
              memberUnbanStats = useAllGuilds
                ? await storage.getActivityStatsForUserAllGuilds(targetMember.id, "unban", fromDays, toDays)
                : await storage.getActivityStatsForUser(interaction.guildId!, targetMember.id, "unban", fromDays, toDays);
            } catch (e) {
              console.log("Could not fetch member unban stats:", e);
            }
            try {
              memberModmailStats = useAllGuilds
                ? await storage.getModmailStatsForUserAllGuilds(targetMember.id, fromDays, toDays)
                : await storage.getModmailStatsForUser(interaction.guildId!, targetMember.id, fromDays, toDays);
            } catch (e) {
              console.log("Could not fetch member modmail stats:", e);
            }
            try {
              memberAppealStats = useAllGuilds
                ? await storage.getAppealStatsForUserAllGuilds(targetMember.id, fromDays, toDays)
                : await storage.getAppealStatsForUser(interaction.guildId!, targetMember.id, fromDays, toDays);
            } catch (e) {
              console.log("Could not fetch member appeal stats:", e);
            }
            try {
              memberModmailCategoryStats = useAllGuilds
                ? await storage.getModmailStatsByCategoryForUserAllGuilds(targetMember.id, fromDays, toDays)
                : await storage.getModmailStatsByCategoryForUser(interaction.guildId!, targetMember.id, fromDays, toDays);
            } catch (e) {
              console.log("Could not fetch member modmail category stats:", e);
            }

            const totalActivity = memberBanStats + memberUnbanStats + memberModmailStats + memberAppealStats;

            const embed = new EmbedBuilder()
              .setTitle(`Activity for ${targetMember.tag}`)
              .setThumbnail(targetMember.displayAvatarURL())
              .setColor(0x5865f2)
              .setDescription(timeRangeDesc);

            // Also get staff report stats for the user
            let memberStaffReportStats = 0;
            try {
              memberStaffReportStats = useAllGuilds
                ? await storage.getStaffReportStatsForUserAllGuilds(targetMember.id, fromDays, toDays)
                : await storage.getStaffReportStatsForUser(interaction.guildId!, targetMember.id, fromDays, toDays);
            } catch (e) {
              console.log("Could not fetch member staff report stats:", e);
            }

            const totalActivityWithStaffReports = memberBanStats + memberUnbanStats + memberModmailStats + memberAppealStats + memberStaffReportStats;

            let statsText = `**Total Activity:** ${totalActivityWithStaffReports}\n\n`;
            statsText += `**Ban Requests:** ${memberBanStats}\n`;
            statsText += `**Unban Requests:** ${memberUnbanStats}\n`;
            statsText += `**Modmails Handled:** ${memberModmailStats}\n`;
            statsText += `**Appeals Handled:** ${memberAppealStats}\n`;
            statsText += `**Staff Reports:** ${memberStaffReportStats}`;

            // Add modmail category breakdown if available
            if (memberModmailStats > 0 && memberModmailCategoryStats.length > 0) {
              // Build category labels from custom categories in config
              const categoryLabels: { [key: string]: string } = {};
              const activityConfig = await storage.getGuildConfig(interaction.guildId!);
              if (activityConfig?.customModmailCategories) {
                try {
                  const cats = JSON.parse(activityConfig.customModmailCategories);
                  for (const cat of cats) {
                    categoryLabels[cat.id] = cat.label;
                  }
                } catch (e) {}
              }
              statsText += "\n\n**Modmail Category Breakdown:**";
              for (const catStat of memberModmailCategoryStats) {
                // Skip unknown/null categories
                if (catStat.category === "unknown" || !catStat.category) continue;
                const label = categoryLabels[catStat.category] || catStat.category;
                statsText += `\n• ${label}: ${catStat.count}`;
              }
            }

            embed.addFields({ name: "\u200B", value: statsText, inline: false });
            embed.setFooter({ text: `${now.toLocaleDateString('en-US', { year: 'numeric', month: '2-digit', day: '2-digit' })}, ${now.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit', hour12: true })}` });

            await interaction.editReply({ embeds: [embed] });
            return;
          }

          // Otherwise show the leaderboard - fetch each stat type independently
          let banStats: { userId: string; count: number }[] = [];
          let unbanStats: { userId: string; count: number }[] = [];
          let modmailStats: { userId: string; count: number }[] = [];
          let appealStats: { userId: string; count: number }[] = [];
          let staffReportStats: { userId: string; count: number }[] = [];
          let modmailCategoryStats: { category: string; count: number }[] = [];

          try {
            if (!category || category === "ban") {
              banStats = useAllGuilds
                ? await storage.getAllGuildsBanStats(fromDays, toDays)
                : await storage.getActivityStats(interaction.guildId!, "ban", fromDays, toDays);
            }
          } catch (e) {
            console.log("Could not fetch ban stats:", e);
          }

          try {
            if (!category || category === "unban") {
              unbanStats = useAllGuilds
                ? await storage.getAllGuildsUnbanStats(fromDays, toDays)
                : await storage.getActivityStats(interaction.guildId!, "unban", fromDays, toDays);
            }
          } catch (e) {
            console.log("Could not fetch unban stats:", e);
          }

          try {
            if (!category || category === "modmail") {
              modmailStats = useAllGuilds
                ? await storage.getAllGuildsModmailStats(fromDays, toDays)
                : await storage.getModmailStats(interaction.guildId!, fromDays, toDays);
            }
          } catch (e) {
            console.log("Could not fetch modmail stats:", e);
          }

          try {
            if (!category || category === "appeal") {
              appealStats = useAllGuilds
                ? await storage.getAllGuildsAppealStats(fromDays, toDays)
                : await storage.getAppealStats(interaction.guildId!, fromDays, toDays);
            }
          } catch (e) {
            console.log("Could not fetch appeal stats:", e);
          }

          try {
            if (!category || category === "staffreport") {
              staffReportStats = await storage.getStaffReportStats(interaction.guildId!, fromDays, toDays);
            }
          } catch (e) {
            console.log("Could not fetch staff report stats:", e);
          }

          try {
            if (!category || category === "modmail") {
              modmailCategoryStats = await storage.getModmailStatsByCategory(interaction.guildId!, fromDays, toDays);
            }
          } catch (e) {
            console.log("Could not fetch modmail category stats:", e);
          }

          const combinedStats: { [userId: string]: number } = {};
          for (const stat of banStats) {
            combinedStats[stat.userId] = (combinedStats[stat.userId] || 0) + stat.count;
          }
          for (const stat of unbanStats) {
            combinedStats[stat.userId] = (combinedStats[stat.userId] || 0) + stat.count;
          }
          for (const stat of modmailStats) {
            combinedStats[stat.userId] = (combinedStats[stat.userId] || 0) + stat.count;
          }
          for (const stat of appealStats) {
            combinedStats[stat.userId] = (combinedStats[stat.userId] || 0) + stat.count;
          }
          for (const stat of staffReportStats) {
            combinedStats[stat.userId] = (combinedStats[stat.userId] || 0) + stat.count;
          }

          // Filter out placeholder entries like staff_report_entry
          delete combinedStats["staff_report_entry"];
          delete combinedStats["manual_entry"];

          // Add members with tracked roles who have 0 activity
          try {
            const config = await storage.getGuildConfig(interaction.guildId!);
            console.log(`[ACTIVITY] Tracked role IDs: ${config?.activityTrackedRoleIds?.join(", ") || "none"}`);
            if (config?.activityTrackedRoleIds && config.activityTrackedRoleIds.length > 0 && interaction.guild) {
              // Fetch all members to populate the cache
              try {
                await interaction.guild.members.fetch();
                console.log(`[ACTIVITY] Fetched ${interaction.guild.members.cache.size} members`);
              } catch (e) {
                console.log("[ACTIVITY] Could not fetch all members:", e);
              }

              let addedCount = 0;
              for (const roleId of config.activityTrackedRoleIds) {
                const trackedRole = interaction.guild.roles.cache.get(roleId);
                console.log(`[ACTIVITY] Role ${roleId}: ${trackedRole ? trackedRole.name + " with " + trackedRole.members.size + " members" : "not found"}`);
                if (trackedRole) {
                  trackedRole.members.forEach((member, memberId) => {
                    if (!(memberId in combinedStats)) {
                      combinedStats[memberId] = 0;
                      addedCount++;
                    }
                  });
                }
              }
              console.log(`[ACTIVITY] Added ${addedCount} members with 0 activity from tracked roles`);
            }
          } catch (e) {
            console.log("Could not add tracked role members:", e);
          }

          const leaderboard = Object.entries(combinedStats)
            .map(([userId, count]) => ({ userId, count }))
            .sort((a, b) => b.count - a.count);

          const totalPages = Math.ceil(leaderboard.length / 10);
          const page = interaction.options.getInteger("page") || 1;
          const start = (page - 1) * 10;
          const end = start + 10;
          const currentLeaderboard = leaderboard.slice(start, end);

          const categoryText = category === "ban" ? "Ban Requests" : category === "unban" ? "Unban Requests" : category === "modmail" ? "Modmails Handled" : category === "appeal" ? "Ban Appeals Handled" : category === "staffreport" ? "Staff Reports" : "All Activity";

          const embed = new EmbedBuilder()
            .setTitle(`${categoryText} Leaderboard`)
            .setColor(0x5865f2);

          if (timeRangeDesc) {
            embed.setDescription(timeRangeDesc);
          }

          const components: any[] = [];

          // Calculate totals
          const totalCount = leaderboard.reduce((sum, e) => sum + e.count, 0);
          const banTotal = banStats.reduce((sum, e) => sum + e.count, 0);
          const unbanTotal = unbanStats.reduce((sum, e) => sum + e.count, 0);
          const modmailTotal = modmailStats.reduce((sum, e) => sum + e.count, 0);
          const appealTotal = appealStats.reduce((sum, e) => sum + e.count, 0);
          const staffReportTotal = staffReportStats.reduce((sum, e) => sum + e.count, 0);

          if (leaderboard.length === 0) {
            embed.addFields({ name: "\u200B", value: "No activity found for the specified filters.", inline: false });
          } else {
            let leaderboardText = "";
            currentLeaderboard.forEach((entry, index) => {
              const line = `${start + index + 1}. <@${entry.userId}> - ${entry.count}\n`;
              if ((leaderboardText + line).length <= 1020) {
                leaderboardText += line;
              }
            });

            embed.addFields({ name: "Leaderboard", value: leaderboardText || "None", inline: false });

            // Add total and category breakdown
            let statsText = `**Total in the specified time:** ${totalCount}`;
            if (!category) {
              // "All Activity" view - show all totals
              if (banTotal > 0) statsText += `\nBan Requests: ${banTotal}`;
              if (unbanTotal > 0) statsText += `\nUnban Requests: ${unbanTotal}`;
              if (modmailTotal > 0) statsText += `\nModmails Handled: ${modmailTotal}`;
              if (appealTotal > 0) statsText += `\nAppeals Handled: ${appealTotal}`;
              if (staffReportTotal > 0) statsText += `\nStaff Reports: ${staffReportTotal}`;
            } else if (category === "modmail") {
              // "Modmails Handled" view - show category breakdown
              if (modmailTotal > 0 && modmailCategoryStats.length > 0) {
                // Build category labels from custom categories in config
                const categoryLabels: { [key: string]: string } = {};
                const leaderboardConfig = await storage.getGuildConfig(interaction.guildId!);
                if (leaderboardConfig?.customModmailCategories) {
                  try {
                    const cats = JSON.parse(leaderboardConfig.customModmailCategories);
                    for (const cat of cats) {
                      categoryLabels[cat.id] = cat.label;
                    }
                  } catch (e) {}
                }
                statsText += "\n\n**Category Breakdown:**";
                for (const catStat of modmailCategoryStats) {
                  // Skip unknown/null categories
                  if (catStat.category === "unknown" || !catStat.category) continue;
                  const label = categoryLabels[catStat.category] || catStat.category;
                  statsText += `\n• ${label}: ${catStat.count}`;
                }
              }
            }
            embed.addFields({ name: "Stats", value: statsText.slice(0, 1024), inline: false });
          }

          // Add footer with page and timestamp
          embed.setFooter({ text: `Page ${page} of ${totalPages} | ${now.toLocaleDateString('en-US', { year: 'numeric', month: '2-digit', day: '2-digit' })}, ${now.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit', hour12: true })}` });

          if (totalPages > 1) {
            const row = new ActionRowBuilder<ButtonBuilder>().addComponents(
              new ButtonBuilder()
                .setCustomId(`activity_page_${page - 1}_${category || "all"}_${scope}_${fromDays ?? "none"}_${toDays ?? "none"}`)
                .setLabel("◀ Previous")
                .setStyle(ButtonStyle.Secondary)
                .setDisabled(page <= 1),
              new ButtonBuilder()
                .setCustomId(`activity_page_${page + 1}_${category || "all"}_${scope}_${fromDays ?? "none"}_${toDays ?? "none"}`)
                .setLabel("Next ▶")
                .setStyle(ButtonStyle.Secondary)
                .setDisabled(page >= totalPages)
            );
            components.push(row);
          }

          await interaction.editReply({ embeds: [embed], components });
        } catch (error: any) {
          console.log("Error in /activity command:", error.message, error.stack);
          await interaction.editReply({ content: "❌ Failed to fetch activity stats. Please try again." }).catch(() => {});
        }
      } else if (commandName === "roster-embed") {
        if (!await safeDeferReply(interaction, false)) return;

        const title = interaction.options.getString("title", true);
        const description = interaction.options.getString("description", true);
        const embedColorStr = interaction.options.getString("embed_color");

        try {
          let embedColor = 0x5865f2;
          if (embedColorStr) {
            const parsed = parseInt(embedColorStr.replace("#", ""), 16);
            if (!isNaN(parsed) && parsed >= 0 && parsed <= 0xFFFFFF) {
              embedColor = parsed;
            }
          }

          const embed = new EmbedBuilder()
            .setTitle(title)
            .setDescription(description)
            .setColor(embedColor);

          const buttons: ButtonBuilder[] = [];
          const missingRosters: string[] = [];

          for (let i = 1; i <= 5; i++) {
            const rosterName = interaction.options.getString(`roster${i}`);
            const label = interaction.options.getString(`label${i}`);
            const colorStr = interaction.options.getString(`color${i}`);
            const emoji = interaction.options.getString(`emoji${i}`);

            if (!rosterName || !label || !colorStr) continue;

            const roster = await storage.getRosterConfig(interaction.guildId!, rosterName);
            if (!roster) {
              missingRosters.push(rosterName);
              continue;
            }

            let buttonStyle = ButtonStyle.Primary;
            if (colorStr === "green") buttonStyle = ButtonStyle.Success;
            else if (colorStr === "red") buttonStyle = ButtonStyle.Danger;
            else if (colorStr === "grey" || colorStr === "gray") buttonStyle = ButtonStyle.Secondary;

            const button = new ButtonBuilder()
              .setCustomId(`roster_btn_${rosterName.toLowerCase()}`)
              .setLabel(label)
              .setStyle(buttonStyle);

            if (emoji) {
              const customEmojiMatch = emoji.match(/<a?:(.+):(\d+)>/);
              if (customEmojiMatch) {
                button.setEmoji({ name: customEmojiMatch[1], id: customEmojiMatch[2] });
              } else {
                button.setEmoji(emoji);
              }
            }

            buttons.push(button);
          }

          if (missingRosters.length > 0) {
            return interaction.editReply(`❌ The following rosters don't exist: ${missingRosters.join(", ")}. Create them first with \`/roster add\`.`);
          }

          if (buttons.length === 0) {
            return interaction.editReply("❌ No valid buttons configured. Make sure to fill in roster, label, and color for at least one button.");
          }

          const row = new ActionRowBuilder<ButtonBuilder>().addComponents(buttons);

          await interaction.editReply({ embeds: [embed], components: [row] });
        } catch (error: any) {
          console.error("Error in /roster-embed:", error);
          await interaction.editReply("❌ Failed to create roster embed.");
        }

      } else if (commandName === "clear-role") {
        if (!await safeDeferReply(interaction)) return;

        const role = interaction.options.getRole("role", true);
        const guild = interaction.guild;

        if (!guild) {
          await interaction.editReply({ content: "This command must be used in a server." });
          return;
        }

        try {
          await guild.members.fetch({ time: 30000 });
        } catch (error) {
          console.log("Could not fully fetch members");
        }

        const guildRole = guild.roles.cache.get(role.id);
        if (!guildRole) {
          await interaction.editReply({ content: "Role not found in this server." });
          return;
        }

        const members = Array.from(guildRole.members.values());
        let removed = 0;
        let failed = 0;

        for (const member of members) {
          try {
            await member.roles.remove(guildRole);
            removed++;
          } catch (error) {
            failed++;
            console.log(`Failed to remove role from ${member.id}`);
          }
        }

        await interaction.editReply({
          content: `Cleared **${removed}** members from the role **${guildRole.name}**.${failed > 0 ? ` (${failed} failed)` : ""}`,
        });
      } else if (commandName === "activity_add") {
        if (!await safeDeferReply(interaction, false)) return;

        try {
          const user = interaction.options.getUser("user", true);
          const amount = interaction.options.getInteger("amount", true);
          const category = interaction.options.getString("category", true);
          const serverOption = interaction.options.getString("server") || "current";

          // Use "global" for cross-server synced entries, otherwise current guild
          const targetGuildId = serverOption === "global" ? "global" : interaction.guildId!;

          try {
            if (category === "modmail") {
              await storage.addModmailActivityEntries(targetGuildId, user.id, amount);
            } else if (category === "appeal") {
              await storage.addAppealActivityEntries(targetGuildId, user.id, amount);
            } else if (category === "staffreport") {
              await storage.addStaffReportEntries(targetGuildId, user.id, amount);
            } else if (category === "ban") {
              await storage.addBanActivityEntries(targetGuildId, user.id, amount);
            } else if (category === "unban") {
              await storage.addUnbanActivityEntries(targetGuildId, user.id, amount);
            }
          } catch (e) {
            console.log("Could not add activity entries:", e);
          }

          const categoryText = category === "ban" ? "ban request" : category === "unban" ? "unban request" : category === "staffreport" ? "staff report" : category === "appeal" ? "appeal" : "modmail";
          const serverText = serverOption === "global" ? " (synced across all servers)" : "";
          await interaction.editReply({
            content: `Added **${amount}** ${categoryText} log entries to <@${user.id}>'s activity${serverText}.`,
          });
        } catch (error: any) {
          console.log("Error in /activity_add command:", error.message);
          await interaction.editReply({ content: "Failed to add activity entries. Please try again." }).catch(() => {});
        }
      } else if (commandName === "activity_remove") {
        if (!await safeDeferReply(interaction, false)) return;

        try {
          const user = interaction.options.getUser("user", true);
          const amount = interaction.options.getInteger("amount", true);
          const category = interaction.options.getString("category", true);
          const serverOption = interaction.options.getString("server") || "current";

          // Use "global" for cross-server synced entries, otherwise current guild
          const targetGuildId = serverOption === "global" ? "global" : interaction.guildId!;

          let removed = 0;
          try {
            if (category === "modmail") {
              removed = await storage.removeModmailActivityEntries(targetGuildId, user.id, amount);
            } else if (category === "appeal") {
              removed = await storage.removeAppealActivityEntries(targetGuildId, user.id, amount);
            } else if (category === "staffreport") {
              removed = await storage.removeStaffReportEntries(targetGuildId, user.id, amount);
            } else {
              removed = await storage.removeActivityEntries(targetGuildId, user.id, category, amount);
            }
          } catch (e) {
            console.log("Could not remove activity entries:", e);
          }

          const categoryText = category === "ban" ? "ban request" : category === "unban" ? "unban request" : category === "staffreport" ? "staff report" : category === "appeal" ? "appeal" : "modmail";
          const serverText = serverOption === "global" ? " (synced across all servers)" : "";
          await interaction.editReply({
            content: `Removed **${removed}** ${categoryText} log entries from <@${user.id}>'s activity${serverText}.`,
          });
        } catch (error: any) {
          console.log("Error in /activity_remove command:", error.message);
          await interaction.editReply({ content: "Failed to remove activity entries. Please try again." }).catch(() => {});
        }
      } else if (commandName === "activity_reset") {
        if (!await safeDeferReply(interaction, false)) return;

        try {
          let config = null;
          try {
            config = await storage.getGuildConfig(interaction.guildId!);
          } catch (e) {
            console.log("Could not fetch guild config:", e);
          }
          const activityResetRoleIds = config?.activityResetRoleIds || [];
          const hasPermission = activityResetRoleIds.length === 0 || 
            (interaction.member as any)?.roles?.cache?.some((r: any) => activityResetRoleIds.includes(r.id));

          if (activityResetRoleIds.length > 0 && !hasPermission) {
            await interaction.editReply({ content: "You don't have permission to reset activity stats." });
            return;
          }

          const category = interaction.options.getString("category");
          const user = interaction.options.getUser("user");

          let count = 0;
          try {
            count = await storage.resetActivityStats(interaction.guildId!, interaction.user.id, category || undefined, user?.id);
          } catch (e) {
            console.log("Could not reset activity stats:", e);
          }

          const categoryText = category === "ban" ? "ban request" : category === "unban" ? "unban request" : category === "modmail" ? "modmail" : category === "appeal" ? "appeal" : category === "staffreport" ? "staff report" : "all";
          const userText = user ? `<@${user.id}>` : "everyone";

          await interaction.editReply({
            content: `Reset **${count}** ${categoryText} activity entries for ${userText}.`,
          });
        } catch (error: any) {
          console.log("Error in /activity_reset command:", error.message);
          await interaction.editReply({ content: "Failed to reset activity stats. Please try again." }).catch(() => {});
        }
      } else if (commandName === "activity_check") {
        // Ephemeral response - only the user can see it
        if (!await safeDeferReply(interaction, true)) return;

        try {
          const role = interaction.options.getRole("role", true);
          let fromDays = interaction.options.getInteger("from") ?? undefined;
          let toDays = interaction.options.getInteger("to") ?? undefined;
          const guild = interaction.guild;

          if (!guild) {
            await interaction.editReply({ content: "This command must be used in a server." });
            return;
          }

          // Validate from/to ranges
          if (fromDays !== undefined && fromDays < 0) fromDays = 0;
          if (toDays !== undefined && toDays < 0) toDays = 0;
          if (fromDays !== undefined && toDays !== undefined && fromDays < toDays) {
            // Swap if from is less than to (from should be further back)
            [fromDays, toDays] = [toDays, fromDays];
          }

          // Fetch all members with the role
          try {
            await guild.members.fetch({ time: 30000 });
          } catch (e) {
            console.log("Could not fully fetch members");
          }

          const guildRole = guild.roles.cache.get(role.id);
          if (!guildRole) {
            await interaction.editReply({ content: "Role not found." });
            return;
          }

          const membersWithRole = Array.from(guildRole.members.values());
          if (membersWithRole.length === 0) {
            await interaction.editReply({ content: `No members found with the role **${guildRole.name}**.` });
            return;
          }

          // Build leaderboard data with parallel fetching for better performance
          const leaderboardData: { userId: string; username: string; modmail: number; appeal: number; ban: number; unban: number; staffreport: number; total: number }[] = [];

          // Process in batches of 10 for better performance
          const batchSize = 10;
          for (let i = 0; i < membersWithRole.length; i += batchSize) {
            const batch = membersWithRole.slice(i, i + batchSize);
            const batchResults = await Promise.all(batch.map(async (member) => {
              const [modmailCount, appealCount, banCount, unbanCount, staffReportCount] = await Promise.all([
                storage.getModmailStatsForUserAllGuilds(member.id, fromDays, toDays),
                storage.getAppealStatsForUserAllGuilds(member.id, fromDays, toDays),
                storage.getActivityStatsForUserAllGuilds(member.id, "ban", fromDays, toDays),
                storage.getActivityStatsForUserAllGuilds(member.id, "unban", fromDays, toDays),
                storage.getStaffReportStatsForUserAllGuilds(member.id, fromDays, toDays)
              ]);
              const total = modmailCount + appealCount + banCount + unbanCount + staffReportCount;
              return {
                userId: member.id,
                username: member.user.username,
                modmail: modmailCount,
                appeal: appealCount,
                ban: banCount,
                unban: unbanCount,
                staffreport: staffReportCount,
                total: total
              };
            }));
            leaderboardData.push(...batchResults);
          }

          // Sort by total (descending)
          leaderboardData.sort((a, b) => b.total - a.total);

          // Build time range description with Discord timestamps
          let timeRangeDesc = "";
          const now = Math.floor(Date.now() / 1000);
          if (fromDays !== undefined && toDays !== undefined) {
            const fromTimestamp = now - (fromDays * 24 * 60 * 60);
            const toTimestamp = now - (toDays * 24 * 60 * 60);
            timeRangeDesc = `Time Range: <t:${fromTimestamp}:D> to <t:${toTimestamp}:D>`;
          } else if (fromDays !== undefined) {
            const fromTimestamp = now - (fromDays * 24 * 60 * 60);
            timeRangeDesc = `Time Range: Since <t:${fromTimestamp}:D>`;
          } else if (toDays !== undefined) {
            const toTimestamp = now - (toDays * 24 * 60 * 60);
            timeRangeDesc = `Time Range: Up to <t:${toTimestamp}:D>`;
          } else {
            timeRangeDesc = "Time Range: All time";
          }

          // Calculate totals
          const totalModmail = leaderboardData.reduce((sum, e) => sum + e.modmail, 0);
          const totalAppeal = leaderboardData.reduce((sum, e) => sum + e.appeal, 0);
          const totalBan = leaderboardData.reduce((sum, e) => sum + e.ban, 0);
          const totalUnban = leaderboardData.reduce((sum, e) => sum + e.unban, 0);
          const totalStaffReport = leaderboardData.reduce((sum, e) => sum + e.staffreport, 0);
          const grandTotal = leaderboardData.reduce((sum, e) => sum + e.total, 0);

          // Build header with order explanation
          const headerText = `Activity Check for ${guildRole.name}\n${timeRangeDesc}\n\nOrder goes as follow: MM (Modmail) | AP (Appeals) | BN (Bans) | UB (Unbans) | SR (Staff Reports) | Total\n`;
          const totalsText = `\nTotals: MM: ${totalModmail} | AP: ${totalAppeal} | BN: ${totalBan} | UB: ${totalUnban} | SR: ${totalStaffReport} | Total: ${grandTotal}`;

          // Build rows with numbers and pings
          const rows = leaderboardData.map((entry, index) => {
            const num = (index + 1).toString();
            const mm = entry.modmail.toString();
            const ap = entry.appeal.toString();
            const bn = entry.ban.toString();
            const ub = entry.unban.toString();
            const sr = entry.staffreport.toString();
            const tot = entry.total.toString();
            return `${num}. <@${entry.userId}> | MM: ${mm} | AP: ${ap} | BN: ${bn} | UB: ${ub} | SR: ${sr} | Total: ${tot}`;
          });

          // Build full copyable text including header, all rows, and totals
          const fullCopyableText = headerText + "\n" + rows.join("\n") + totalsText;

          // Split into chunks if needed (Discord limit is 2000 chars)
          const messages: string[] = [];
          let currentMessage = "```\n" + headerText + "\n";

          for (const row of rows) {
            const testMessage = currentMessage + row + "\n";
            if ((testMessage + "```").length > 1800) {
              messages.push(currentMessage + "```");
              currentMessage = "```\n" + row + "\n";
            } else {
              currentMessage = testMessage;
            }
          }

          // Add totals to the last message
          currentMessage = currentMessage + totalsText + "\n```";
          messages.push(currentMessage);

          // Send first message as reply, rest as followups
          await interaction.editReply({ content: messages[0] });
          for (let i = 1; i < messages.length; i++) {
            await interaction.followUp({ content: messages[i], ephemeral: true });
          }
        } catch (error: any) {
          console.log("Error in /activity_check command:", error.message, error.stack);
          await interaction.editReply({ content: "Failed to check activity. Please try again." }).catch(() => {});
        }
      } else if (commandName === "restore_activity") {
        if (!await safeDeferReply(interaction, false)) return;

        try {
          let config = null;
          try {
            config = await storage.getGuildConfig(interaction.guildId!);
          } catch (e) {
            console.log("Could not fetch guild config:", e);
          }
          const activityResetRoleIds = config?.activityResetRoleIds || [];
          const hasPermission = activityResetRoleIds.length === 0 || 
            (interaction.member as any)?.roles?.cache?.some((r: any) => activityResetRoleIds.includes(r.id));

          if (activityResetRoleIds.length > 0 && !hasPermission) {
            await interaction.editReply({ content: "You don't have permission to restore activity stats." });
            return;
          }

          let backup = null;
          try {
            backup = await storage.getLatestActivityResetBackup(interaction.guildId!);
          } catch (e) {
            console.log("Could not fetch activity backup:", e);
          }
          if (!backup) {
            await interaction.editReply({ content: "No activity reset backup found to restore." });
            return;
          }

          let restoredCount = 0;
          try {
            restoredCount = await storage.restoreActivityStats(interaction.guildId!);
          } catch (e) {
            console.log("Could not restore activity stats:", e);
          }

          await interaction.editReply({
            content: `Restored **${restoredCount}** activity entries from the last reset.`,
          });
        } catch (error: any) {
          console.log("Error in /restore_activity command:", error.message);
          await interaction.editReply({ content: "Failed to restore activity stats. Please try again." }).catch(() => {});
        }
      } else if (commandName === "activity_role") {
        if (!await safeDeferReply(interaction, false)) return;

        try {
          const roles: string[] = [];
          const roleNames: string[] = [];
          for (let i = 1; i <= 20; i++) {
            const role = interaction.options.getRole(`role${i}`);
            if (role) {
              roles.push(role.id);
              roleNames.push(role.name);
            }
          }

          await storage.upsertGuildConfig({
            guildId: interaction.guildId!,
            activityTrackedRoleIds: roles.length > 0 ? roles : null,
          });

          if (roles.length > 0) {
            await interaction.editReply({
              content: `Activity tracking roles set to: ${roleNames.map(r => `**${r}**`).join(", ")}. All members with these roles will appear on the activity leaderboard.`,
            });
          } else {
            await interaction.editReply({
              content: `Activity tracking roles cleared. Only members with activity will appear on the leaderboard.`,
            });
          }
        } catch (error: any) {
          console.log("Error in /activity_role command:", error.message);
          await interaction.editReply({ content: "Failed to set activity roles. Please try again." }).catch(() => {});
        }
      } else if (commandName === "modstats") {
        const subcommand = interaction.options.getSubcommand();

        if (subcommand === "list") {
          // Ephemeral response - only the user can see it
          if (!await safeDeferReply(interaction, true)) return;

          try {
            const role = interaction.options.getRole("role", true);

            if (!interaction.guild) {
              await interaction.editReply({ content: "This command must be used in a server." });
              return;
            }

            // Fetch members with the role
            await interaction.guild.members.fetch({ time: 30000 });
            const trackedRole = interaction.guild.roles.cache.get(role.id);
            if (!trackedRole) {
              await interaction.editReply({ content: "Role not found." });
              return;
            }
            const roleMembers = Array.from(trackedRole.members.values());

            if (roleMembers.length === 0) {
              await interaction.editReply({ content: "No members found with that role." });
              return;
            }

            // Build copyable list of *ms commands - each in separate code block
            const header = `**Moderation Stats Commands for ${trackedRole.name}** (${roleMembers.length} members)\n\nCopy and paste these commands in the channel where the moderation bot is:\n\n`;

            const messages: string[] = [];
            let currentMessage = header;

            for (const member of roleMembers) {
              const cmdBlock = `\`*ms ${member.id}\`\n`;
              if ((currentMessage + cmdBlock).length > 1900) {
                messages.push(currentMessage);
                currentMessage = cmdBlock;
              } else {
                currentMessage += cmdBlock;
              }
            }
            messages.push(currentMessage);

            // Send first message as reply, rest as followups
            await interaction.editReply({ content: messages[0] });
            for (let i = 1; i < messages.length; i++) {
              await interaction.followUp({ content: messages[i], ephemeral: true });
            }

          } catch (error: any) {
            console.log("Error in /modstats list command:", error.message, error.stack);
            await interaction.editReply({ content: "Failed to generate mod stats commands. Please try again." }).catch(() => {});
          }
        } else if (subcommand === "check") {
          if (!await safeDeferReply(interaction, false)) return;

          try {
            const messagesToScan = interaction.options.getInteger("messages") || 100;

            if (!interaction.channel || !("messages" in interaction.channel)) {
              await interaction.editReply({ content: "This command must be used in a text channel." });
              return;
            }

            await interaction.editReply({ content: `🔍 Scanning for *ms embeds in the last ${messagesToScan} messages...` });

            // Fetch messages
            const messages = await interaction.channel.messages.fetch({ limit: Math.min(messagesToScan, 100) });

            // Count embeds per user from *ms command responses
            const statsMap: Map<string, { username: string; embedCount: number; bans: number; kicks: number; warns: number; mutes: number; total: number }> = new Map();

            for (const msg of messages.values()) {
              // Only check bot embeds
              if (!msg.author.bot || msg.embeds.length === 0) continue;

              for (const embed of msg.embeds) {
                const title = embed.title || "";
                const description = embed.description || "";
                const authorName = embed.author?.name || "";
                const fields = embed.fields || [];
                const fullText = title + " " + authorName + " " + description + " " + fields.map(f => f.name + " " + f.value).join(" ");

                // Look for moderation stats patterns - these indicate a *ms response embed
                const hasModerationStats = /Bans?[:\s]+\d+/i.test(fullText) || 
                                           /Kicks?[:\s]+\d+/i.test(fullText) || 
                                           /Warn(?:ing)?s?[:\s]+\d+/i.test(fullText) ||
                                           /Mutes?[:\s]+\d+/i.test(fullText) ||
                                           /Timeout?s?[:\s]+\d+/i.test(fullText) ||
                                           /Total[:\s]+\d+/i.test(fullText) ||
                                           /moderation\s*stats?/i.test(fullText);

                if (!hasModerationStats) continue;

                // Try to extract user ID from title, author, description
                const userIdMatch = title.match(/(\d{17,19})/) || 
                                   authorName.match(/(\d{17,19})/) ||
                                   description.match(/<@!?(\d{17,19})>/) || 
                                   description.match(/ID[:\s]*(\d{17,19})/i) ||
                                   description.match(/(\d{17,19})/);
                if (!userIdMatch) continue;

                const userId = userIdMatch[1];
                const existing = statsMap.get(userId) || { username: "", embedCount: 0, bans: 0, kicks: 0, warns: 0, mutes: 0, total: 0 };

                // Count this embed
                existing.embedCount++;

                // Parse stats from this embed
                const bansMatch = fullText.match(/Bans?[:\s]+(\d+)/i);
                const kicksMatch = fullText.match(/Kicks?[:\s]+(\d+)/i);
                const warnsMatch = fullText.match(/Warn(?:ing)?s?[:\s]+(\d+)/i);
                const mutesMatch = fullText.match(/Mutes?[:\s]+(\d+)/i) || fullText.match(/Timeout?s?[:\s]+(\d+)/i);
                const totalMatch = fullText.match(/Total[:\s]+(\d+)/i);

                // Use the highest values found (in case of multiple embeds per user)
                if (bansMatch) existing.bans = Math.max(existing.bans, parseInt(bansMatch[1]) || 0);
                if (kicksMatch) existing.kicks = Math.max(existing.kicks, parseInt(kicksMatch[1]) || 0);
                if (warnsMatch) existing.warns = Math.max(existing.warns, parseInt(warnsMatch[1]) || 0);
                if (mutesMatch) existing.mutes = Math.max(existing.mutes, parseInt(mutesMatch[1]) || 0);
                if (totalMatch) existing.total = Math.max(existing.total, parseInt(totalMatch[1]) || 0);

                // Try to get username from embed
                const usernameMatch = title.match(/(.+?)\s*[\(\[]?\d{17,19}/) || 
                                     authorName.match(/(.+?)\s*[\(\[]?\d{17,19}/) ||
                                     embed.author?.name?.match(/^([^0-9]+)/);
                if (usernameMatch) existing.username = usernameMatch[1].trim();

                statsMap.set(userId, existing);
              }
            }

            if (statsMap.size === 0) {
              await interaction.editReply({ 
                content: `📊 **No *ms Embeds Found**\n\nScanned ${messagesToScan} messages but found no moderation stats embeds.\n\n**Tips:**\n• Run the \`*ms <userid>\` commands first\n• Make sure this is the channel with the bot responses`
              });
              return;
            }

            // Sort by total actions (or by embed count if no totals found)
            const sortedStats = Array.from(statsMap.entries()).sort((a, b) => {
              if (b[1].total !== a[1].total) return b[1].total - a[1].total;
              return (b[1].bans + b[1].kicks + b[1].warns + b[1].mutes) - (a[1].bans + a[1].kicks + a[1].warns + a[1].mutes);
            });

            // Build leaderboard embed
            const leaderboardEmbed = new EmbedBuilder()
              .setTitle("📊 Moderation Stats Leaderboard")
              .setColor(0x5865f2)
              .setDescription(`Found **${statsMap.size}** *ms embeds in the last ${messagesToScan} messages`)
              .setTimestamp();

            let leaderboardText = "";
            const medals = ["🥇", "🥈", "🥉"];

            for (let i = 0; i < Math.min(sortedStats.length, 15); i++) {
              const [userId, stats] = sortedStats[i];
              const medal = medals[i] || `**${i + 1}.**`;
              const totalActions = stats.total || (stats.bans + stats.kicks + stats.warns + stats.mutes);
              leaderboardText += `${medal} <@${userId}>\n`;
              leaderboardText += `> Bans: ${stats.bans} | Kicks: ${stats.kicks} | Warns: ${stats.warns} | Mutes: ${stats.mutes} | **Total: ${totalActions}**\n\n`;
            }

            if (leaderboardText.length > 4000) {
              leaderboardText = leaderboardText.slice(0, 3950) + "\n*...truncated*";
            }

            leaderboardEmbed.addFields({ name: "Rankings", value: leaderboardText || "No stats found" });

            if (sortedStats.length > 15) {
              leaderboardEmbed.setFooter({ text: `Showing top 15 of ${sortedStats.length} staff members` });
            }

            await interaction.editReply({ content: "", embeds: [leaderboardEmbed] });

          } catch (error: any) {
            console.log("Error in /modstats check command:", error.message, error.stack);
            await interaction.editReply({ content: "Failed to scan channel for stats. Please try again." }).catch(() => {});
          }
        }
      } else if (commandName === "setup_staff_intro") {
        if (!await safeDeferReply(interaction)) return;

        const config = await storage.getGuildConfig(interaction.guildId!);
        const embedTitle = config?.staffIntroEmbedTitle || "Staff Introduction Quiz";
        const embedDesc = config?.staffIntroEmbedDescription || "Welcome to the staff introduction quiz! This quiz will help you understand our policies and procedures.\n\nClick the button below to start the quiz. You will receive 5 questions in your DMs.";

        const embed = new EmbedBuilder()
          .setTitle(embedTitle)
          .setDescription(embedDesc)
          .setColor(0x5865f2)
          .setFooter({ text: "Make sure your DMs are open!" });

        const row = new ActionRowBuilder<ButtonBuilder>().addComponents(
          new ButtonBuilder()
            .setCustomId(`start_quiz_${interaction.guildId}`)
            .setLabel("Start Quiz")
            .setStyle(ButtonStyle.Primary)
            .setEmoji("📝")
        );

        if (interaction.channel && "send" in interaction.channel) {
          await interaction.channel.send({
            embeds: [embed],
            components: [row],
          });

          await storage.upsertGuildConfig({
            guildId: interaction.guildId!,
            staffIntroChannelId: interaction.channelId,
          });
        }

        try {
          await interaction.editReply({
            content: "✅ Staff introduction quiz has been posted!",
          });
        } catch (e) {}
      } else if (commandName === "setup_quiz_log") {
        if (!await safeDeferReply(interaction)) return;

        const channel = interaction.options.getChannel("channel", true);

        await storage.upsertGuildConfig({
          guildId: interaction.guildId!,
          quizLogChannelId: channel.id,
        });

        await interaction.editReply({
          content: `✅ Quiz progress will now be logged to <#${channel.id}>!`,
        });
      } else if (commandName === "setup_staff_intro_submissions") {
        if (!await safeDeferReply(interaction)) return;

        const channel = interaction.options.getChannel("channel", true);

        await storage.upsertGuildConfig({
          guildId: interaction.guildId!,
          staffIntroSubmissionsChannelId: channel.id,
        });

        await interaction.editReply({
          content: `✅ Staff intro submissions will be sent to <#${channel.id}>!`,
        });
      } else if (commandName === "config_staff_intro") {
        if (!await safeDeferReply(interaction)) return;

        const title = interaction.options.getString("title");
        let description = interaction.options.getString("description");

        // Convert \n to actual newlines for spacing
        if (description) {
          description = description.replace(/\\n/g, "\n");
        }

        if (!title && !description) {
          const config = await storage.getGuildConfig(interaction.guildId!);
          const currentTitle = config?.staffIntroEmbedTitle || "Staff Introduction Quiz";
          const currentDesc = config?.staffIntroEmbedDescription || "Welcome! Click the button below to start your staff introduction quiz.";

          await interaction.editReply({
            content: `**Current Staff Intro Embed Settings:**\n\n**Title:** ${currentTitle}\n**Description:**\n${currentDesc}\n\nUse this command with the \`title\` or \`description\` options to change them.\n\n*Tip: Use \\\\n in your description to add line breaks!*`,
          });
          return;
        }

        const updateData: any = { guildId: interaction.guildId! };
        if (title !== null) updateData.staffIntroEmbedTitle = title;
        if (description !== null) updateData.staffIntroEmbedDescription = description;

        await storage.upsertGuildConfig(updateData);

        const config = await storage.getGuildConfig(interaction.guildId!);
        const newTitle = config?.staffIntroEmbedTitle || "Staff Introduction Quiz";
        const newDesc = config?.staffIntroEmbedDescription || "Welcome! Click the button below to start your staff introduction quiz.";

        await interaction.editReply({
          content: `✅ Staff intro embed updated!\n\n**Title:** ${newTitle}\n**Description:**\n${newDesc}`,
        });
      } else if (commandName === "setup_intro_questions") {
        if (!await safeDeferReply(interaction)) return;

        const q1 = interaction.options.getString("question1");
        const q2 = interaction.options.getString("question2");
        const q3 = interaction.options.getString("question3");
        const q4 = interaction.options.getString("question4");
        const q5 = interaction.options.getString("question5");

        const updateData: any = { guildId: interaction.guildId! };

        if (q1 !== null) updateData.quizQuestion1 = q1;
        if (q2 !== null) updateData.quizQuestion2 = q2;
        if (q3 !== null) updateData.quizQuestion3 = q3;
        if (q4 !== null) updateData.quizQuestion4 = q4;
        if (q5 !== null) updateData.quizQuestion5 = q5;

        await storage.upsertGuildConfig(updateData);

        const config = await storage.getGuildConfig(interaction.guildId!);

        const currentQuestions = getQuizQuestions(config);

        let summary = "**Current Quiz Questions:**\n\n";
        for (let i = 0; i < currentQuestions.length; i++) {
          const q = currentQuestions[i];
          summary += `**Q${i + 1}:** ${q.text.replace(/\*\*/g, "")}\n\n`;
        }

        await interaction.editReply({
          content: `✅ Quiz questions updated!\n\n${summary}`,
        });
      } else if (commandName === "setup_inactivity") {
        if (!await safeDeferReply(interaction)) return;

        const config = await storage.getGuildConfig(interaction.guildId!);
        const embedTitle = config?.inactivityEmbedTitle || "Inactivity Request";
        const embedDescription = config?.inactivityEmbedDescription || "Need to take a break? Click the button below to submit an inactivity request.\n\nPlease provide the dates you'll be inactive and your reason.";

        const embed = new EmbedBuilder()
          .setTitle(embedTitle)
          .setDescription(embedDescription)
          .setColor(0x5865f2)
          .setFooter({ text: "All requests require approval" });

        const row = new ActionRowBuilder<ButtonBuilder>().addComponents(
          new ButtonBuilder()
            .setCustomId(`request_inactivity_${interaction.guildId}`)
            .setLabel("Request Inactivity")
            .setStyle(ButtonStyle.Primary)
            .setEmoji("📋")
        );

        const channel = interaction.channel;
        if (channel && "send" in channel) {
          await channel.send({ embeds: [embed], components: [row] });
        }

        await storage.upsertGuildConfig({
          guildId: interaction.guildId!,
          inactivityChannelId: interaction.channelId,
        });

        await interaction.editReply({
          content: "✅ Inactivity request embed has been posted!",
        });
      } else if (commandName === "setup_inactivity_submissions") {
        if (!await safeDeferReply(interaction)) return;

        const channel = interaction.options.getChannel("channel", true);

        await storage.upsertGuildConfig({
          guildId: interaction.guildId!,
          inactivitySubmissionsChannelId: channel.id,
        });

        await interaction.editReply({
          content: `✅ Inactivity submissions will be sent to <#${channel.id}>!`,
        });
      } else if (commandName === "setup_inactivity_logs") {
        if (!await safeDeferReply(interaction)) return;

        const channel = interaction.options.getChannel("channel", true);

        await storage.upsertGuildConfig({
          guildId: interaction.guildId!,
          inactivityLogChannelId: channel.id,
        });

        await interaction.editReply({
          content: `✅ Inactivity logs will be sent to <#${channel.id}>!`,
        });
      } else if (commandName === "setup_inactivity_ping") {
        if (!await safeDeferReply(interaction)) return;

        const roles: string[] = [];
        for (let i = 1; i <= 5; i++) {
          const role = interaction.options.getRole(`role${i}`);
          if (role) roles.push(role.id);
        }

        await storage.upsertGuildConfig({
          guildId: interaction.guildId!,
          inactivityPingRoleIds: roles,
        });

        if (roles.length === 0) {
          await interaction.editReply({
            content: "✅ Inactivity ping roles cleared. No roles will be pinged.",
          });
        } else {
          const roleMentions = roles.map(id => `<@&${id}>`).join(", ");
          await interaction.editReply({
            content: `✅ The following roles will be pinged on new inactivity requests: ${roleMentions}`,
          });
        }
      } else if (commandName === "terminate_quizzes") {
        if (!await safeDeferReply(interaction)) return;

        const count = activeQuizzes.size;

        // Send termination message to all active quiz users
        for (const [userId, quizState] of Array.from(activeQuizzes.entries())) {
          try {
            const user = await client.users.fetch(userId);
            await user.send("⚠️ Your quiz session has been terminated by an administrator. Please start a new quiz if you wish to continue.");
          } catch (error) {
            console.log(`Could not DM user ${userId} about quiz termination`);
          }
        }

        activeQuizzes.clear();

        await interaction.editReply({
          content: `✅ Terminated ${count} active quiz session${count !== 1 ? "s" : ""}.`,
        });
      } else if (commandName === "setup_modmail") {
        // Debug: log interaction details
        const age = Date.now() - interaction.createdTimestamp;
        console.log(`[setup_modmail] Received interaction ${interaction.id}, age: ${age}ms, replied: ${interaction.replied}, deferred: ${interaction.deferred}`);

        // Reply immediately to avoid timeout
        try {
          await interaction.reply({ content: "⏳ Setting up modmail system..." });
          console.log(`[setup_modmail] Reply succeeded`);
        } catch (e: any) {
          console.error(`[setup_modmail] Initial reply failed: ${e.message}, code: ${e.code}`);
          return;
        }

        const category = interaction.options.getChannel("category", true);
        const logChannel = interaction.options.getChannel("log_channel", true);
        const staffRole = interaction.options.getRole("staff_role", true);

        await storage.upsertGuildConfig({
          guildId: interaction.guildId!,
          modmailCategoryId: category.id,
          modmailLogChannelId: logChannel.id,
          modmailStaffRoleIds: [staffRole.id],
        });

        // Fetch config for custom embed title/description and custom categories
        const config = await storage.getGuildConfig(interaction.guildId!);
        const embedTitle = config?.modmailEmbedTitle || "Support Tickets";
        const embedDescription = config?.modmailEmbedDescription || "Select a category below to create a ticket.";

        // Parse custom categories
        let customCategories: { id: string; label: string; description: string; emoji?: string; modalQuestions?: string[] }[] = [];
        if (config?.customModmailCategories) {
          try {
            customCategories = JSON.parse(config.customModmailCategories);
          } catch (e) {
            customCategories = [];
          }
        }

        // Post the ticket embed with dropdown menu
        const ticketEmbed = new EmbedBuilder()
          .setTitle(embedTitle)
          .setDescription(embedDescription)
          .setColor(0x2f3136);

        // Use built-in categories if no custom categories exist
        const builtInCategories: { id: string; label: string; description: string; emoji: string; modalQuestions?: string[] }[] = [
          { id: "general", label: "General Inquiries", description: "General questions or support", emoji: "📥" },
          { id: "competitive", label: "Apply For Competitive", description: "Apply to join the competitive team", emoji: "🖥️" },
          { id: "contentcreator", label: "Apply For Content Creator", description: "Apply to become a content creator", emoji: "📷" },
          { id: "report", label: "User Reports", description: "Report a user", emoji: "🚨" },
          { id: "partnerships", label: "Partnerships", description: "Partnership inquiries", emoji: "📋" },
          { id: "gfx", label: "Apply For GFX Editor", description: "Apply to become a GFX editor", emoji: "📝" },
          { id: "creativewarrior", label: "Apply For Creative Warrior", description: "Apply for creative warrior role", emoji: "⚔️" },
          { id: "vfxeditor", label: "Apply For VFX Editor", description: "Apply for VFX editor role", emoji: "✨" },
        ];

        const categoriesToUse = customCategories.length > 0 ? customCategories : builtInCategories;

        const selectOptions: StringSelectMenuOptionBuilder[] = [];
        for (const cat of categoriesToUse) {
          // Add ::modal suffix to value if category has custom modal questions
          const hasModal = cat.modalQuestions && cat.modalQuestions.length > 0;
          const value = hasModal ? `${cat.id}::modal` : cat.id;

          const option = new StringSelectMenuOptionBuilder()
            .setLabel(cat.label)
            .setDescription(cat.description.substring(0, 100))
            .setValue(value);
          if (cat.emoji) option.setEmoji(cat.emoji);
          selectOptions.push(option);
        }

        const selectMenu = new StringSelectMenuBuilder()
          .setCustomId(`ticket_select_${interaction.guildId}`)
          .setPlaceholder("Select a ticket category...")
          .addOptions(selectOptions);

        const row = new ActionRowBuilder<StringSelectMenuBuilder>().addComponents(selectMenu);

        if (interaction.channel && "send" in interaction.channel) {
          const sentMessage = await interaction.channel.send({
            embeds: [ticketEmbed],
            components: [row],
          });

          // Save message ID for real-time updates
          await storage.upsertGuildConfig({
            guildId: interaction.guildId!,
            modmailEmbedMessageId: sentMessage.id,
            modmailEmbedChannelId: interaction.channel.id,
          });
        }

        await interaction.editReply({
          content: `✅ Modmail configured and ticket embed posted!\n• Category: <#${category.id}>\n• Log Channel: <#${logChannel.id}>\n• Staff Role: <@&${staffRole.id}>`,
        });
      } else if (commandName === "edit_embed") {
        const embedType = interaction.options.getString("type", true);
        const messageId = interaction.options.getString("message_id");
        const config = await storage.getGuildConfig(interaction.guildId!);

        // If message_id provided, save it to database for the modal handler to use
        if (embedType === "modmail" && messageId) {
          await storage.upsertGuildConfig({
            guildId: interaction.guildId!,
            modmailEmbedMessageId: messageId,
            modmailEmbedChannelId: interaction.channelId,
          });
        }

        if (embedType === "modmail") {
          const currentTitle = config?.modmailEmbedTitle || "Support Tickets";
          const currentDescription = config?.modmailEmbedDescription || "Select a category below to create a ticket.";

          const modal = new ModalBuilder()
            .setCustomId(`config_modmail_modal_${interaction.guildId}`)
            .setTitle("Edit Modmail Embed");

          const titleInput = new TextInputBuilder()
            .setCustomId("embed_title")
            .setLabel("Embed Title")
            .setStyle(TextInputStyle.Short)
            .setValue(currentTitle)
            .setMaxLength(256)
            .setRequired(true);

          const descriptionInput = new TextInputBuilder()
            .setCustomId("embed_description")
            .setLabel("Description (use Enter for line breaks)")
            .setStyle(TextInputStyle.Paragraph)
            .setValue(currentDescription)
            .setMaxLength(4000)
            .setRequired(true);

          modal.addComponents(
            new ActionRowBuilder<TextInputBuilder>().addComponents(titleInput),
            new ActionRowBuilder<TextInputBuilder>().addComponents(descriptionInput)
          );

          await interaction.showModal(modal);
        } else if (embedType === "appeal") {
          const currentTitle = config?.appealEmbedTitle || "Ban Appeals";
          const currentDescription = config?.appealEmbedDescription || "Click the button below to submit a ban appeal.";

          const modal = new ModalBuilder()
            .setCustomId(`config_appeal_modal_${interaction.guildId}`)
            .setTitle("Edit Appeal Embed");

          const titleInput = new TextInputBuilder()
            .setCustomId("embed_title")
            .setLabel("Embed Title")
            .setStyle(TextInputStyle.Short)
            .setValue(currentTitle)
            .setMaxLength(256)
            .setRequired(true);

          const descriptionInput = new TextInputBuilder()
            .setCustomId("embed_description")
            .setLabel("Description (use Enter for line breaks)")
            .setStyle(TextInputStyle.Paragraph)
            .setValue(currentDescription)
            .setMaxLength(4000)
            .setRequired(true);

          modal.addComponents(
            new ActionRowBuilder<TextInputBuilder>().addComponents(titleInput),
            new ActionRowBuilder<TextInputBuilder>().addComponents(descriptionInput)
          );

          await interaction.showModal(modal);
        } else if (embedType === "staffintro") {
          const currentTitle = config?.staffIntroEmbedTitle || "Staff Introduction";
          const currentDescription = config?.staffIntroEmbedDescription || "Click the button below to introduce yourself to the team.";

          const modal = new ModalBuilder()
            .setCustomId(`config_staffintro_modal_${interaction.guildId}`)
            .setTitle("Edit Staff Intro Embed");

          const titleInput = new TextInputBuilder()
            .setCustomId("embed_title")
            .setLabel("Embed Title")
            .setStyle(TextInputStyle.Short)
            .setValue(currentTitle)
            .setMaxLength(256)
            .setRequired(true);

          const descriptionInput = new TextInputBuilder()
            .setCustomId("embed_description")
            .setLabel("Description (use Enter for line breaks)")
            .setStyle(TextInputStyle.Paragraph)
            .setValue(currentDescription)
            .setMaxLength(4000)
            .setRequired(true);

          modal.addComponents(
            new ActionRowBuilder<TextInputBuilder>().addComponents(titleInput),
            new ActionRowBuilder<TextInputBuilder>().addComponents(descriptionInput)
          );

          await interaction.showModal(modal);
        } else if (embedType === "inactivity") {
          const currentTitle = config?.inactivityEmbedTitle || "Inactivity Request";
          const currentDescription = config?.inactivityEmbedDescription || "Click the button below to submit an inactivity request.";

          const modal = new ModalBuilder()
            .setCustomId(`config_inactivity_modal_${interaction.guildId}`)
            .setTitle("Edit Inactivity Embed");

          const titleInput = new TextInputBuilder()
            .setCustomId("embed_title")
            .setLabel("Embed Title")
            .setStyle(TextInputStyle.Short)
            .setValue(currentTitle)
            .setMaxLength(256)
            .setRequired(true);

          const descriptionInput = new TextInputBuilder()
            .setCustomId("embed_description")
            .setLabel("Description (use Enter for line breaks)")
            .setStyle(TextInputStyle.Paragraph)
            .setValue(currentDescription)
            .setMaxLength(4000)
            .setRequired(true);

          modal.addComponents(
            new ActionRowBuilder<TextInputBuilder>().addComponents(titleInput),
            new ActionRowBuilder<TextInputBuilder>().addComponents(descriptionInput)
          );

          await interaction.showModal(modal);
        }
      } else if (commandName === "config_modmail") {
        const config = await storage.getGuildConfig(interaction.guildId!);
        const currentTitle = config?.modmailEmbedTitle || "Support Tickets";
        const currentDescription = config?.modmailEmbedDescription || "Select a category below to create a ticket.";

        const modal = new ModalBuilder()
          .setCustomId(`config_modmail_modal_${interaction.guildId}`)
          .setTitle("Configure Modmail Embed");

        const titleInput = new TextInputBuilder()
          .setCustomId("embed_title")
          .setLabel("Embed Title")
          .setStyle(TextInputStyle.Short)
          .setValue(currentTitle)
          .setMaxLength(256)
          .setRequired(true);

        const descriptionInput = new TextInputBuilder()
          .setCustomId("embed_description")
          .setLabel("Embed Description (supports line breaks)")
          .setStyle(TextInputStyle.Paragraph)
          .setValue(currentDescription)
          .setMaxLength(4000)
          .setRequired(true);

        modal.addComponents(
          new ActionRowBuilder<TextInputBuilder>().addComponents(titleInput),
          new ActionRowBuilder<TextInputBuilder>().addComponents(descriptionInput)
        );

        await interaction.showModal(modal);
      } else if (commandName === "setup_appeal") {
        if (!await safeDeferReply(interaction)) return;

        const category = interaction.options.getChannel("category", true);
        const logChannel = interaction.options.getChannel("log_channel", true);
        const staffRole = interaction.options.getRole("staff_role", true);

        await storage.upsertGuildConfig({
          guildId: interaction.guildId!,
          appealCategoryId: category.id,
          appealLogChannelId: logChannel.id,
          appealStaffRoleIds: [staffRole.id],
        });

        const config = await storage.getGuildConfig(interaction.guildId!);
        const embedTitle = config?.appealEmbedTitle || "Ban Appeals";
        const embedDescription = config?.appealEmbedDescription || "Click the button below to submit a ban appeal.";

        const appealEmbed = new EmbedBuilder()
          .setTitle(embedTitle)
          .setDescription(embedDescription)
          .setColor(0x2f3136);

        const appealButton = new ButtonBuilder()
          .setCustomId(`appeal_start_${interaction.guildId}`)
          .setLabel("Submit Ban Appeal")
          .setStyle(ButtonStyle.Primary)
          .setEmoji("📝");

        const row = new ActionRowBuilder<ButtonBuilder>().addComponents(appealButton);

        if (interaction.channel && "send" in interaction.channel) {
          await interaction.channel.send({
            embeds: [appealEmbed],
            components: [row],
          });
        }

        await interaction.editReply({
          content: `✅ Ban Appeal system configured and embed posted!\n• Category: <#${category.id}>\n• Log Channel: <#${logChannel.id}>\n• Staff Role: <@&${staffRole.id}>`,
        });
      } else if (commandName === "config_appeal") {
        const config = await storage.getGuildConfig(interaction.guildId!);
        const currentTitle = config?.appealEmbedTitle || "Ban Appeals";
        const currentDescription = config?.appealEmbedDescription || "Click the button below to submit a ban appeal.";

        const modal = new ModalBuilder()
          .setCustomId(`config_appeal_modal_${interaction.guildId}`)
          .setTitle("Configure Appeal Embed");

        const titleInput = new TextInputBuilder()
          .setCustomId("embed_title")
          .setLabel("Embed Title")
          .setStyle(TextInputStyle.Short)
          .setValue(currentTitle)
          .setMaxLength(256)
          .setRequired(true);

        const descriptionInput = new TextInputBuilder()
          .setCustomId("embed_description")
          .setLabel("Embed Description (supports line breaks)")
          .setStyle(TextInputStyle.Paragraph)
          .setValue(currentDescription)
          .setMaxLength(4000)
          .setRequired(true);

        modal.addComponents(
          new ActionRowBuilder<TextInputBuilder>().addComponents(titleInput),
          new ActionRowBuilder<TextInputBuilder>().addComponents(descriptionInput)
        );

        await interaction.showModal(modal);
      } else if (commandName === "block") {
        if (!await safeDeferReply(interaction)) return;

        const system = interaction.options.getString("system", true);
        const targetUser = interaction.options.getUser("user", true);
        const duration = interaction.options.getInteger("duration", true);
        const timeUnit = interaction.options.getString("time", true);
        const reason = interaction.options.getString("reason") || undefined;

        // Check if user has block permission
        const config = await storage.getGuildConfig(interaction.guildId!);
        const blockRoleIds = config?.modmailBlockRoleIds || [];
        const memberRoles = interaction.member?.roles;
        const hasBlockPermission = blockRoleIds.length === 0 || 
          (memberRoles && Array.isArray(memberRoles) 
            ? blockRoleIds.some(id => memberRoles.includes(id))
            : memberRoles && 'cache' in memberRoles && blockRoleIds.some(id => memberRoles.cache.has(id)));

        if (blockRoleIds.length > 0 && !hasBlockPermission) {
          await interaction.editReply({ content: "❌ You don't have permission to block users." });
          return;
        }

        let expiresAt: Date | undefined = undefined;
        if (timeUnit !== "permanent") {
          const multipliers: { [key: string]: number } = {
            minutes: 60 * 1000,
            hours: 60 * 60 * 1000,
            days: 24 * 60 * 60 * 1000,
            weeks: 7 * 24 * 60 * 60 * 1000,
          };
          expiresAt = new Date(Date.now() + duration * multipliers[timeUnit]);
        }

        if (system === "appeal") {
          await storage.removeAppealBlock(interaction.guildId!, targetUser.id);
          await storage.createAppealBlock({
            guildId: interaction.guildId!,
            userId: targetUser.id,
            blockedById: interaction.user.id,
            reason,
            expiresAt,
          });
        } else {
          await storage.removeModmailBlock(interaction.guildId!, targetUser.id);
          await storage.createModmailBlock({
            guildId: interaction.guildId!,
            userId: targetUser.id,
            blockedById: interaction.user.id,
            reason,
            expiresAt,
          });
        }

        const durationText = timeUnit === "permanent" ? "permanently" : `for ${duration} ${timeUnit}`;
        const systemText = system === "appeal" ? "ban appeals" : "modmail";
        await interaction.editReply({ content: `✅ <@${targetUser.id}> has been blocked from ${systemText} ${durationText}.${reason ? ` Reason: ${reason}` : ""}` });
      } else if (commandName === "unblock") {
        if (!await safeDeferReply(interaction)) return;

        const targetUser = interaction.options.getUser("user", true);
        const system = interaction.options.getString("system", true);

        const config = await storage.getGuildConfig(interaction.guildId!);
        const blockRoleIds = config?.modmailBlockRoleIds || [];
        const memberRoles = interaction.member?.roles;
        const hasBlockPermission = blockRoleIds.length === 0 || 
          (memberRoles && Array.isArray(memberRoles) 
            ? blockRoleIds.some(id => memberRoles.includes(id))
            : memberRoles && 'cache' in memberRoles && blockRoleIds.some(id => memberRoles.cache.has(id)));

        if (blockRoleIds.length > 0 && !hasBlockPermission) {
          await interaction.editReply({ content: "❌ You don't have permission to unblock users." });
          return;
        }

        if (system === "appeal") {
          await storage.removeAppealBlock(interaction.guildId!, targetUser.id);
          await interaction.editReply({ content: `✅ <@${targetUser.id}> has been unblocked from ban appeals.` });
        } else {
          await storage.removeModmailBlock(interaction.guildId!, targetUser.id);
          await interaction.editReply({ content: `✅ <@${targetUser.id}> has been unblocked from modmail.` });
        }
      } else if (commandName === "permissions") {
        if (!await safeDeferReply(interaction)) return;

        const permType = interaction.options.getString("type", true);
        const roles: string[] = [];
        for (let i = 1; i <= 20; i++) {
          const role = interaction.options.getRole(`role${i}`);
          if (role) roles.push(role.id);
        }

        const typeLabels: { [key: string]: string } = {
          payout: "Payout Approval",
          moderation: "Ban/Unban Approval",
          inactivity: "Inactivity Approval",
          block: "Modmail Block",
          claim: "Modmail Claim",
          activity_reset: "Activity Reset",
          appeal_claim: "Appeal Claim",
        };

        if (permType === "payout") {
          await storage.upsertGuildConfig({ guildId: interaction.guildId!, allowedRoleIds: roles });
        } else if (permType === "moderation") {
          await storage.upsertGuildConfig({ guildId: interaction.guildId!, modRoleIds: roles });
        } else if (permType === "inactivity") {
          await storage.upsertGuildConfig({ guildId: interaction.guildId!, inactivityPingRoleIds: roles });
        } else if (permType === "block") {
          await storage.upsertGuildConfig({ guildId: interaction.guildId!, modmailBlockRoleIds: roles });
        } else if (permType === "claim") {
          await storage.upsertGuildConfig({ guildId: interaction.guildId!, modmailClaimRoleIds: roles });
        } else if (permType === "activity_reset") {
          await storage.upsertGuildConfig({ guildId: interaction.guildId!, activityResetRoleIds: roles });
        } else if (permType === "appeal_claim") {
          await storage.upsertGuildConfig({ guildId: interaction.guildId!, appealStaffRoleIds: roles });
        }

        const roleMentions = roles.length > 0 ? roles.map(id => `<@&${id}>`).join(", ") : "None (admins only)";
        await interaction.editReply({ content: `✅ **${typeLabels[permType]}** permissions updated!\nRoles: ${roleMentions}` });
      } else if (commandName === "category_ping") {
        if (!await safeDeferReply(interaction)) return;

        const category = interaction.options.getString("category", true);
        const roles: string[] = [];
        for (let i = 1; i <= 5; i++) {
          const role = interaction.options.getRole(`role${i}`);
          if (role) roles.push(role.id);
        }

        // Build category labels from custom categories in config
        const categoryLabels: { [key: string]: string } = {};
        const pingConfig = await storage.getGuildConfig(interaction.guildId!);
        if (pingConfig?.customModmailCategories) {
          try {
            const cats = JSON.parse(pingConfig.customModmailCategories);
            for (const cat of cats) {
              categoryLabels[cat.id] = cat.label;
            }
          } catch (e) {}
        }

        const updateField: { [key: string]: string } = {
          general: "categoryPingGeneral",
          competitive: "categoryPingCompetitive",
          contentcreator: "categoryPingContentcreator",
          report: "categoryPingReport",
          partnerships: "categoryPingPartnerships",
          gfx: "categoryPingGfx",
          creativewarrior: "categoryPingCreativewarrior",
          vfxeditor: "categoryPingVfxeditor",
        };

        await storage.upsertGuildConfig({ guildId: interaction.guildId!, [updateField[category]]: roles });

        const roleMentions = roles.length > 0 ? roles.map(id => `<@&${id}>`).join(", ") : "Default staff role";
        await interaction.editReply({ content: `✅ **${categoryLabels[category]}** ping roles updated!\nRoles: ${roleMentions}` });
      } else if (commandName === "close_all_tickets") {
        if (!await safeDeferReply(interaction)) return;

        const allThreads = await storage.getAllModmailThreads(interaction.guildId!);
        const openThreads = allThreads.filter(t => t.status === "open");

        if (openThreads.length === 0) {
          await interaction.editReply({ content: "✅ No open tickets to close." });
          return;
        }

        const config = await storage.getGuildConfig(interaction.guildId!);
        let closedCount = 0;
        let deletedChannelCount = 0;

        for (const thread of openThreads) {
          // Close the thread in database
          await storage.updateModmailThread(thread.id, {
            status: "closed",
            closedById: interaction.user.id,
            closeReason: "Closed via /close_all_tickets",
            closedAt: new Date(),
          });
          closedCount++;

          // Log to modmail log channel with transcript
          if (config?.modmailLogChannelId) {
            try {
              const logChannel = await client.channels.fetch(config.modmailLogChannelId);
              if (logChannel && "send" in logChannel) {
                const messages = await storage.getModmailMessages(thread.id);
                let transcript = messages.map(m => `[${m.isStaff === "true" ? "Staff" : "User"}] <@${m.authorId}>: ${m.content}`).join("\n");
                if (transcript.length > 1900) transcript = transcript.substring(0, 1900) + "...";
                if (!transcript) transcript = "No messages";

                const logEmbed = new EmbedBuilder()
                  .setTitle("Ticket Closed (Bulk)")
                  .setColor(0xed4245)
                  .addFields(
                    { name: "User", value: `<@${thread.userId}>`, inline: true },
                    { name: "Closed By", value: `<@${interaction.user.id}>`, inline: true },
                    { name: "Transcript", value: transcript, inline: false }
                  )
                  .setTimestamp();
                await logChannel.send({ embeds: [logEmbed] });
                console.log(`[MODMAIL] Bulk close log sent for thread ${thread.id}`);
              }
            } catch (e: any) {
              console.log(`[MODMAIL] Could not send log for bulk close thread ${thread.id}:`, e.message);
            }
          }

          // Try to delete the channel if it exists
          if (thread.channelId) {
            try {
              const channel = await client.channels.fetch(thread.channelId);
              if (channel && "delete" in channel) {
                await channel.delete();
                deletedChannelCount++;
              }
            } catch (e) {
              // Channel already deleted or doesn't exist - that's fine
            }
          }

          // Try to notify user
          try {
            const user = await client.users.fetch(thread.userId);
            const closeEmbed = new EmbedBuilder()
              .setTitle("Ticket Closed")
              .setDescription("Your ticket has been closed by staff.")
              .setColor(0xed4245)
              .setTimestamp();
            await user.send({ embeds: [closeEmbed] });
          } catch (e) {
            // Could not DM user
          }
        }

        await interaction.editReply({ 
          content: `✅ Closed **${closedCount}** ticket(s). Deleted **${deletedChannelCount}** channel(s).` 
        });
      } else if (commandName === "modmail-category") {
        console.log(`[modmail-category] Command called with subcommand attempt...`);
        const subcommand = interaction.options.getSubcommand();
        console.log(`[modmail-category] Subcommand: ${subcommand}`);

        if (!await safeDeferReply(interaction, false)) {
          console.log(`[modmail-category] safeDeferReply failed`);
          return;
        }
        console.log(`[modmail-category] safeDeferReply succeeded`);

        const config = await storage.getGuildConfig(interaction.guildId!);

        // Parse existing custom categories
        let customCategories: { id: string; label: string; description: string; emoji?: string }[] = [];
        if (config?.customModmailCategories) {
          try {
            customCategories = JSON.parse(config.customModmailCategories);
          } catch (e) {
            customCategories = [];
          }
        }

        // Built-in categories for reference
        const builtInCategories = [
          { id: "general", label: "General Inquiries", description: "General questions or support", emoji: "📥" },
          { id: "competitive", label: "Apply For Competitive", description: "Apply to join the competitive team", emoji: "🖥️" },
          { id: "contentcreator", label: "Apply For Content Creator", description: "Apply to become a content creator", emoji: "📷" },
          { id: "report", label: "User Reports", description: "Report a user", emoji: "🚨" },
          { id: "partnerships", label: "Partnerships", description: "Partnership inquiries", emoji: "📋" },
          { id: "gfx", label: "Apply For GFX Editor", description: "Apply to become a GFX editor", emoji: "📝" },
          { id: "creativewarrior", label: "Apply For Creative Warrior", description: "Apply for creative warrior role", emoji: "⚔️" },
          { id: "vfxeditor", label: "Apply For VFX Editor", description: "Apply for VFX editor role", emoji: "✨" },
        ];

        if (subcommand === "add") {
          const label = interaction.options.getString("label", true);
          const description = interaction.options.getString("description", true);
          const emoji = interaction.options.getString("emoji") || "📌";

          // Auto-generate ID from label (lowercase, alphanumeric only)
          let baseId = label.toLowerCase().replace(/[^a-z0-9]+/g, "_").replace(/^_|_$/g, "");
          if (!baseId) baseId = "category";

          // Ensure uniqueness by appending number if needed
          let categoryId = baseId;
          let counter = 1;
          const existingIds = customCategories.map(c => c.id);
          while (existingIds.includes(categoryId)) {
            categoryId = `${baseId}_${counter}`;
            counter++;
          }

          customCategories.push({ id: categoryId, label, description, emoji });
          await storage.upsertGuildConfig({
            guildId: interaction.guildId!,
            customModmailCategories: JSON.stringify(customCategories),
          });

          await interaction.editReply({ 
            content: `✅ Added category: **${label}** (${emoji})\n\n⚠️ Run \`/setup_modmail\` again to update the ticket dropdown.`
          });

        } else if (subcommand === "remove") {
          console.log(`[modmail-category] Remove - categories count: ${customCategories.length}`);
          console.log(`[modmail-category] Categories: ${JSON.stringify(customCategories)}`);

          if (customCategories.length === 0) {
            await interaction.editReply({ content: "❌ No categories to remove. Use `/modmail-category add` to create categories first." });
            return;
          }

          try {
            console.log(`[modmail-category] Building select options...`);
            const selectOptions = customCategories.map(cat => {
              const option = new StringSelectMenuOptionBuilder()
                .setLabel(cat.label.substring(0, 100))
                .setDescription((cat.description || "No description").substring(0, 100))
                .setValue(cat.id);

              // Only set emoji if it exists and is a simple emoji (not a custom Discord emoji ID)
              if (cat.emoji && cat.emoji.length <= 4 && !/^\d+$/.test(cat.emoji)) {
                try {
                  option.setEmoji(cat.emoji);
                } catch (e) {
                  // Invalid emoji, skip it
                }
              }

              return option;
            });

            console.log(`[modmail-category] Creating select menu...`);
            const selectMenu = new StringSelectMenuBuilder()
              .setCustomId(`remove_category_${interaction.guildId}`)
              .setPlaceholder("Select a category to remove...")
              .addOptions(selectOptions);

            const row = new ActionRowBuilder<StringSelectMenuBuilder>().addComponents(selectMenu);

            console.log(`[modmail-category] Sending dropdown...`);
            await interaction.editReply({ 
              content: "Select a category to remove:",
              components: [row]
            });
            console.log(`[modmail-category] Dropdown sent successfully!`);
          } catch (error: any) {
            console.error("[modmail-category] Error creating category removal menu:", error);
            await interaction.editReply({ content: `❌ Error: ${error.message}` });
          }

        } else if (subcommand === "list") {
          const embed = new EmbedBuilder()
            .setTitle("Modmail Categories")
            .setColor(0x5865f2);

          // Include built-in categories in the list
          const builtInCategories = [
            { id: "general", label: "General Inquiries", description: "General questions or support", emoji: "📥" },
            { id: "competitive", label: "Apply For Competitive", description: "Apply to join the competitive team", emoji: "🖥️" },
            { id: "contentcreator", label: "Apply For Content Creator", description: "Apply to become a content creator", emoji: "📷" },
            { id: "report", label: "User Reports", description: "Report a user", emoji: "🚨" },
            { id: "partnerships", label: "Partnerships", description: "Partnership inquiries", emoji: "📋" },
            { id: "gfx", label: "Apply For GFX Editor", description: "Apply to become a GFX editor", emoji: "📝" },
            { id: "creativewarrior", label: "Apply For Creative Warrior", description: "Apply for creative warrior role", emoji: "⚔️" },
            { id: "vfxeditor", label: "Apply For VFX Editor", description: "Apply for VFX editor role", emoji: "✨" },
          ];

          let description = "";
          if (customCategories.length > 0) {
            description += "**Custom Categories:**\n";
            description += customCategories.map(c => {
              const hasModal = (c as any).modalQuestions?.length > 0;
              return `${c.emoji || "📌"} **${c.label}** (\`${c.id}\`)${hasModal ? " 📋" : ""}`;
            }).join("\n");
          }

          description += customCategories.length > 0 ? "\n\n**Built-in Categories:**\n" : "**Built-in Categories:**\n";
          description += builtInCategories.map(c => `${c.emoji} **${c.label}** (\`${c.id}\`)`).join("\n");

          embed.setDescription(description);
          embed.setFooter({ text: "📋 = Has form questions configured" });

          await interaction.editReply({ embeds: [embed] });
        }
      } else if (commandName === "setup_command_logs") {
        if (!await safeDeferReply(interaction)) return;

        const channel = interaction.options.getChannel("channel", true);

        await storage.upsertGuildConfig({
          guildId: interaction.guildId!,
          commandLogChannelId: channel.id,
        });

        await interaction.editReply({
          content: `✅ Command logs will be sent to <#${channel.id}>!`,
        });
      } else if (commandName === "roster") {
        if (!await safeDeferReply(interaction)) return;

        const subcommand = interaction.options.getSubcommand();

        if (subcommand === "add") {
          const name = interaction.options.getString("name", true).toLowerCase();

          // Check if roster already exists
          const existing = await storage.getRosterConfig(interaction.guildId!, name);
          if (existing) {
            await interaction.editReply({ content: `❌ A roster named **${name}** already exists. Use \`/roster edit\` to modify it.` });
            return;
          }

          // Collect roles
          const roleIds: string[] = [];
          for (let i = 1; i <= 20; i++) {
            const role = interaction.options.getRole(`role${i}`);
            if (role) roleIds.push(role.id);
          }

          if (roleIds.length === 0) {
            await interaction.editReply({ content: "❌ You must provide at least one role." });
            return;
          }

          await storage.createRosterConfig({
            guildId: interaction.guildId!,
            name: name.toLowerCase(),
            roleIds: roleIds,
          });

          await interaction.editReply({ 
            content: `✅ Created roster **${name}** with ${roleIds.length} role(s).\n\nUse \`/setup_roster ${name}\` to post it in a channel.` 
          });

        } else if (subcommand === "edit") {
          const name = interaction.options.getString("name", true).toLowerCase();

          // Check if roster exists
          const existing = await storage.getRosterConfig(interaction.guildId!, name);
          if (!existing) {
            await interaction.editReply({ content: `❌ No roster named **${name}** found. Use \`/roster add\` to create one.` });
            return;
          }

          // Collect new roles
          const roleIds: string[] = [];
          for (let i = 1; i <= 20; i++) {
            const role = interaction.options.getRole(`role${i}`);
            if (role) roleIds.push(role.id);
          }

          if (roleIds.length === 0) {
            await interaction.editReply({ content: "❌ You must provide at least one role." });
            return;
          }

          await storage.updateRosterConfig(interaction.guildId!, name, { roleIds });

          await interaction.editReply({ 
            content: `✅ Updated roster **${name}** with ${roleIds.length} role(s).` 
          });

        } else if (subcommand === "delete") {
          const name = interaction.options.getString("name", true).toLowerCase();

          const existing = await storage.getRosterConfig(interaction.guildId!, name);
          if (!existing) {
            await interaction.editReply({ content: `❌ No roster named **${name}** found.` });
            return;
          }

          await storage.deleteRosterConfig(interaction.guildId!, name);

          await interaction.editReply({ content: `✅ Deleted roster **${name}**.` });

        } else if (subcommand === "list") {
          const rosters = await storage.getAllRosterConfigs(interaction.guildId!);

          if (rosters.length === 0) {
            await interaction.editReply({ content: "No rosters configured yet. Use `/roster add` to create one." });
            return;
          }

          const embed = new EmbedBuilder()
            .setTitle("Roster Configurations")
            .setColor(0x5865f2)
            .setDescription(rosters.map(r => {
              const rolesList = r.roleIds.slice(0, 5).map(id => `<@&${id}>`).join(", ");
              const moreRoles = r.roleIds.length > 5 ? ` +${r.roleIds.length - 5} more` : "";
              const posted = r.messageId ? " 📌" : "";
              return `**${r.name}**${posted} (${r.roleIds.length} roles)\n${rolesList}${moreRoles}`;
            }).join("\n\n"))
            .setFooter({ text: "📌 = Posted in a channel" });

          await interaction.editReply({ embeds: [embed] });
        }

      } else if (commandName === "setup_roster") {
        if (!await safeDeferReply(interaction)) return;

        const name = interaction.options.getString("name", true).toLowerCase();
        const roster = await storage.getRosterConfig(interaction.guildId!, name);

        if (!roster) {
          await interaction.editReply({ content: `❌ No roster named **${name}** found. Use \`/roster add\` to create one first.` });
          return;
        }

        const guild = interaction.guild;
        if (!guild) {
          await interaction.editReply({ content: "❌ This command must be used in a server." });
          return;
        }

        // Fetch members
        try {
          await guild.members.fetch({ time: 30000 });
        } catch (e) {
          console.log("Could not fully fetch members for roster");
        }

        // Generate roster content
        let rosterContent = `**${name.charAt(0).toUpperCase() + name.slice(1)} Roster**\n\n`;

        for (const roleId of roster.roleIds) {
          const role = guild.roles.cache.get(roleId);
          if (!role) continue;

          rosterContent += `<@&${roleId}>\n\n`;
          const members = role.members.map((m: any) => `<@${m.id}>`);
          if (members.length === 0) {
            rosterContent += "N/A\n";
          } else {
            rosterContent += members.join("\n") + "\n";
          }
          rosterContent += "\n";
        }

        // Post the roster
        if (interaction.channel && "send" in interaction.channel) {
          const sentMessage = await interaction.channel.send({ content: rosterContent });

          // Save the message ID and channel ID for real-time updates
          await storage.updateRosterConfig(interaction.guildId!, name, {
            messageId: sentMessage.id,
            channelId: interaction.channel.id,
          });

          await interaction.editReply({
            content: `✅ Posted **${name}** roster! It will update automatically when role membership changes.`,
          });
        } else {
          await interaction.editReply({ content: "❌ Could not send message in this channel." });
        }
      }
    } else if (interaction.isStringSelectMenu()) {
      // Handle roster selection
      if (interaction.customId === "roster_selection") {
        const rosterId = interaction.values[0];
        const roster = await storage.getRosterConfig(interaction.guildId!, rosterId);

        if (!roster) {
          return interaction.reply({ content: "❌ Roster configuration not found.", ephemeral: true });
        }

        const embed = new EmbedBuilder()
          .setTitle(`${roster.name} Roster`)
          .setColor(0x5865f2)
          .setTimestamp();

        let rosterText = "";
        for (const roleId of roster.roleIds) {
          const role = interaction.guild?.roles.cache.get(roleId);
          if (role) {
            const members = role.members.map((m: any) => `<@${m.id}>`).join("\n");
            rosterText += `**${role.name}**\n${members || "No members"}\n\n`;
          }
        }

        embed.setDescription(rosterText || "No roles configured for this roster.");
        await interaction.reply({ embeds: [embed], ephemeral: true });
        return;
      }
      // Handle category removal selection
      if (interaction.customId.startsWith("remove_category_")) {
        if (!await safeDeferUpdate(interaction)) return;

        const guildId = interaction.customId.replace("remove_category_", "");
        const categoryId = interaction.values[0];

        const config = await storage.getGuildConfig(guildId);
        let customCategories: { id: string; label: string; description: string; emoji?: string }[] = [];
        if (config?.customModmailCategories) {
          try {
            customCategories = JSON.parse(config.customModmailCategories);
          } catch (e) {
            customCategories = [];
          }
        }

        const index = customCategories.findIndex(c => c.id === categoryId);
        if (index === -1) {
          await interaction.editReply({ content: `❌ Category not found.`, components: [] });
          return;
        }

        const removed = customCategories.splice(index, 1)[0];
        await storage.upsertGuildConfig({
          guildId,
          customModmailCategories: JSON.stringify(customCategories),
        });

        // If there are more categories, show updated dropdown
        if (customCategories.length > 0) {
          const selectOptions = customCategories.map(cat => {
            const option = new StringSelectMenuOptionBuilder()
              .setLabel(cat.label.substring(0, 100))
              .setDescription((cat.description || "No description").substring(0, 100))
              .setValue(cat.id);

            if (cat.emoji && cat.emoji.length <= 4 && !/^\d+$/.test(cat.emoji)) {
              try { option.setEmoji(cat.emoji); } catch (e) {}
            }
            return option;
          });

          const selectMenu = new StringSelectMenuBuilder()
            .setCustomId(`remove_category_${guildId}`)
            .setPlaceholder("Select another category to remove...")
            .addOptions(selectOptions);

          const row = new ActionRowBuilder<StringSelectMenuBuilder>().addComponents(selectMenu);

          await interaction.editReply({ 
            content: `✅ Removed: **${removed.label}**\n\nSelect another category to remove, or dismiss this message:`,
            components: [row]
          });
        } else {
          await interaction.editReply({ 
            content: `✅ Removed custom category: **${removed.label}**\n\nNo more custom categories to remove.\n\n⚠️ Run \`/setup_modmail\` again to update the ticket dropdown.`,
            components: []
          });
        }
        return;
      }

      // Handle server selection for multi-server DM routing
      if (interaction.customId.startsWith("dm_server_select_")) {
        if (!await safeDeferUpdate(interaction)) return;

        const userId = interaction.customId.replace("dm_server_select_", "");
        const pendingData = pendingServerSelections.get(userId);

        if (!pendingData) {
          await interaction.followUp({ content: "This selection has expired. Please send your message again.", flags: 64 });
          return;
        }

        const selectedIndex = parseInt(interaction.values[0]);
        const selectedTicket = pendingData.tickets[selectedIndex];

        if (!selectedTicket) {
          await interaction.followUp({ content: "Invalid selection.", flags: 64 });
          return;
        }

        // Clear the pending data
        pendingServerSelections.delete(userId);

        // Relay the message to the selected ticket
        try {
          const ticketChannel = await client.channels.fetch(selectedTicket.thread.channelId);
          if (ticketChannel && "send" in ticketChannel) {
            const user = await client.users.fetch(userId);

            const userEmbed = new EmbedBuilder()
              .setAuthor({ name: user.tag, iconURL: user.displayAvatarURL() })
              .setDescription(pendingData.messageContent || "(No text content)")
              .setColor(0x57f287)
              .setTimestamp();

            // Add attachments if any
            if (pendingData.attachments.length > 0) {
              const urls = pendingData.attachments.map((a: any) => a.url);
              userEmbed.addFields({ name: "Attachments", value: urls.join("\n"), inline: false });
              const firstImage = pendingData.attachments.find((a: any) => a.contentType?.startsWith("image/"));
              if (firstImage) {
                userEmbed.setImage(firstImage.url);
              }
            }

            await ticketChannel.send({ embeds: [userEmbed] });

            // Ping subscribed users
            const subs = selectedTicket.thread.subscribedUserIds || [];
            if (subs.length > 0) {
              const pingContent = subs.map((id: string) => `<@${id}>`).join(" ");
              const pingMsg = await ticketChannel.send({ content: pingContent });
              setTimeout(() => pingMsg.delete().catch(() => {}), 3000);
            }

            // Save message
            if (selectedTicket.isAppeal) {
              await storage.addAppealMessage({
                threadId: selectedTicket.thread.id,
                authorId: userId,
                content: pendingData.messageContent,
                isStaff: "false",
              });
            } else {
              await storage.addModmailMessage({
                threadId: selectedTicket.thread.id,
                authorId: userId,
                content: pendingData.messageContent,
                isStaff: "false",
              });
            }

            // React to original message with checkmark and delete the selection message
            try {
              const originalChannel = await client.channels.fetch(pendingData.originalChannelId);
              if (originalChannel && "messages" in originalChannel) {
                const originalMessage = await originalChannel.messages.fetch(pendingData.originalMessageId);
                await originalMessage.react("✅");
              }
            } catch (e) {
              console.log("Could not react to original message:", e);
            }

            // Delete the selection message
            try {
              await interaction.message.delete();
            } catch (e) {
              console.log("Could not delete selection message:", e);
            }
          }
        } catch (error) {
          console.log("Could not relay multi-server message:", error);
          await interaction.followUp({ content: "Failed to send message. Please try again.", flags: 64 });
        }
        return;
      }

      // Handle ticket dropdown selection
      if (interaction.customId.startsWith("ticket_select_")) {
        const guildId = interaction.customId.split("_")[2];
        const ticketCategory = interaction.values[0];
        const user = interaction.user;

        // Check for custom modal questions - categories with custom modals have value format: "categoryId::modal"
        // This allows showing modal immediately without async DB lookup
        if (ticketCategory.endsWith("::modal")) {
          const actualCategoryId = ticketCategory.replace("::modal", "");
          try {
            const categoryConfig = await storage.getGuildConfig(guildId);
            let customCategories: { id: string; label: string; description: string; emoji?: string; modalQuestions?: string[] }[] = [];
            if (categoryConfig?.customModmailCategories) {
              try {
                customCategories = JSON.parse(categoryConfig.customModmailCategories);
              } catch (e) {}
            }

            const categoryWithModal = customCategories.find(c => c.id === actualCategoryId);
            if (categoryWithModal && categoryWithModal.modalQuestions && categoryWithModal.modalQuestions.length > 0) {
              // Encode categoryId and guildId as base64 to avoid parsing issues with underscores
              const encodedData = Buffer.from(JSON.stringify({ categoryId: actualCategoryId, guildId })).toString('base64');
              const modal = new ModalBuilder()
                .setCustomId(`ticket_custom_modal::${encodedData}`)
                .setTitle(`${categoryWithModal.label.substring(0, 40)}`);

              categoryWithModal.modalQuestions.forEach((question, index) => {
                const input = new TextInputBuilder()
                  .setCustomId(`answer${index + 1}`)
                  .setLabel(question.substring(0, 45))
                  .setStyle(TextInputStyle.Paragraph)
                  .setRequired(true);
                modal.addComponents(new ActionRowBuilder<TextInputBuilder>().addComponents(input));
              });

              await interaction.showModal(modal);
              return;
            }
          } catch (e) {
            console.log("Error checking custom modal questions:", e);
          }
          // If modal questions not found, proceed without modal (fallback)
        }

        // Categories that require application modals - show modal IMMEDIATELY (no async work first)
        if (ticketCategory === "competitive") {
          try {
            const modal = new ModalBuilder()
              .setCustomId(`ticket_modal_competitive_${guildId}`)
              .setTitle("Apply For Competitive");

            const trackerInput = new TextInputBuilder()
              .setCustomId("fortnite_tracker")
              .setLabel("Send Your Desired Game Tracker")
              .setStyle(TextInputStyle.Short)
              .setPlaceholder("https://...")
              .setRequired(true);

            const reasonInput = new TextInputBuilder()
              .setCustomId("apply_reason")
              .setLabel("Why Do You Want To Join Our Esports Team?")
              .setStyle(TextInputStyle.Paragraph)
              .setPlaceholder("Explain why you want to join...")
              .setRequired(true);

            modal.addComponents(
              new ActionRowBuilder<TextInputBuilder>().addComponents(trackerInput),
              new ActionRowBuilder<TextInputBuilder>().addComponents(reasonInput)
            );

            await interaction.showModal(modal);
          } catch (e: any) {
            if (e.code !== 10062 && e.code !== 40060) console.log("Could not show modal:", e);
          }
          return;
        } else if (ticketCategory === "contentcreator") {
          try {
            const modal = new ModalBuilder()
              .setCustomId(`ticket_modal_contentcreator_${guildId}`)
              .setTitle("Apply For Content Creator");

            const followersInput = new TextInputBuilder()
              .setCustomId("followers_count")
              .setLabel("How many followers do you have?")
              .setStyle(TextInputStyle.Short)
              .setPlaceholder("e.g., 10,000 on TikTok, 5,000 on YouTube")
              .setRequired(true);

            const reasonInput = new TextInputBuilder()
              .setCustomId("apply_reason")
              .setLabel("Why do you think you would be a good fit?")
              .setStyle(TextInputStyle.Paragraph)
              .setPlaceholder("Explain why you'd be a good content creator...")
              .setRequired(true);

            modal.addComponents(
              new ActionRowBuilder<TextInputBuilder>().addComponents(followersInput),
              new ActionRowBuilder<TextInputBuilder>().addComponents(reasonInput)
            );

            await interaction.showModal(modal);
          } catch (e: any) {
            if (e.code !== 10062 && e.code !== 40060) console.log("Could not show modal:", e);
          }
          return;
        } else if (ticketCategory === "gfx") {
          try {
            const modal = new ModalBuilder()
              .setCustomId(`ticket_modal_gfx_${guildId}`)
              .setTitle("Apply For GFX Editor");

            const reasonInput = new TextInputBuilder()
              .setCustomId("apply_reason")
              .setLabel("Why are you a good GFX Editor?")
              .setStyle(TextInputStyle.Paragraph)
              .setPlaceholder("Describe your skills and experience...")
              .setRequired(true);

            modal.addComponents(
              new ActionRowBuilder<TextInputBuilder>().addComponents(reasonInput)
            );

            await interaction.showModal(modal);
          } catch (e: any) {
            if (e.code !== 10062 && e.code !== 40060) console.log("Could not show modal:", e);
          }
          return;
        } else if (ticketCategory === "creativewarrior") {
          try {
            const modal = new ModalBuilder()
              .setCustomId(`ticket_modal_creativewarrior_${guildId}`)
              .setTitle("Apply For Creative Warrior");

            const clipsInput = new TextInputBuilder()
              .setCustomId("creative_clips")
              .setLabel("Can you provide 2-5 creative clips?")
              .setStyle(TextInputStyle.Short)
              .setPlaceholder("Yes/No and any details...")
              .setRequired(true);

            const earningsInput = new TextInputBuilder()
              .setCustomId("creative_earnings")
              .setLabel("Have you made earnings in creative?")
              .setStyle(TextInputStyle.Short)
              .setPlaceholder("Yes/No and any details...")
              .setRequired(true);

            modal.addComponents(
              new ActionRowBuilder<TextInputBuilder>().addComponents(clipsInput),
              new ActionRowBuilder<TextInputBuilder>().addComponents(earningsInput)
            );

            await interaction.showModal(modal);
          } catch (e: any) {
            if (e.code !== 10062 && e.code !== 40060) console.log("Could not show modal:", e);
          }
          return;
        } else if (ticketCategory === "vfxeditor") {
          try {
            const modal = new ModalBuilder()
              .setCustomId(`ticket_modal_vfxeditor_${guildId}`)
              .setTitle("Apply For VFX Editor");

            const reasonInput = new TextInputBuilder()
              .setCustomId("apply_reason")
              .setLabel("Why are you a good VFX Editor?")
              .setStyle(TextInputStyle.Paragraph)
              .setPlaceholder("Describe your skills and experience...")
              .setRequired(true);

            modal.addComponents(
              new ActionRowBuilder<TextInputBuilder>().addComponents(reasonInput)
            );

            await interaction.showModal(modal);
          } catch (e: any) {
            if (e.code !== 10062 && e.code !== 40060) console.log("Could not show modal:", e);
          }
          return;
        }

        // For general, report, partnerships - defer first, then validate and create ticket
        if (!await safeDeferReply(interaction)) return;

        const guild = interaction.guild;
        if (!guild) {
          await interaction.editReply({ content: "❌ This can only be used in a server." });
          return;
        }

        const config = await storage.getGuildConfig(guildId);
        if (!config?.modmailCategoryId) {
          await interaction.editReply({ content: "❌ Modmail is not configured for this server." });
          return;
        }

        // Check if user is blocked
        const block = await storage.getActiveModmailBlock(guildId, user.id);
        if (block) {
          const expiresText = block.expiresAt 
            ? `Your block expires <t:${Math.floor(block.expiresAt.getTime() / 1000)}:R>.`
            : "You are permanently blocked.";
          await interaction.editReply({ content: `❌ You are blocked from opening tickets. ${expiresText}` });
          return;
        }

        // Check for existing open thread
        const existingThread = await storage.getOpenModmailThread(guildId, user.id);
        if (existingThread) {
          await interaction.editReply({ content: "❌ You already have an open ticket. Please wait for staff to respond or close your existing ticket." });
          return;
        }

        // Parse custom categories for label lookup
        let customCategories: { id: string; label: string; description: string; emoji?: string }[] = [];
        if (config?.customModmailCategories) {
          try {
            customCategories = JSON.parse(config.customModmailCategories);
          } catch (e) {
            customCategories = [];
          }
        }

        // Build category labels from custom categories in config
        const categoryLabels: { [key: string]: string } = {};
        for (const cat of customCategories) {
          categoryLabels[cat.id] = cat.label;
        }
        const categoryLabel = categoryLabels[ticketCategory] || ticketCategory;

        // Create thread and channel
        const thread = await storage.createModmailThread({
          guildId,
          userId: user.id,
          status: "open",
          category: ticketCategory,
        });

        try {
          const channelName = user.username.toLowerCase().replace(/[^a-z0-9-_]/g, "").slice(0, 32) || "ticket";
          const newChannel = await guild.channels.create({
            name: channelName,
            parent: config.modmailCategoryId!,
            topic: `${categoryLabel} ticket from ${user.tag} (${user.id})`,
          });

          await storage.updateModmailThread(thread.id, { channelId: newChannel.id });

          // Get category-specific ping roles or fall back to general staff roles
          const categoryPingMap: { [key: string]: string[] | null | undefined } = {
            general: config.categoryPingGeneral,
            competitive: config.categoryPingCompetitive,
            contentcreator: config.categoryPingContentcreator,
            report: config.categoryPingReport,
            partnerships: config.categoryPingPartnerships,
            gfx: config.categoryPingGfx,
            creativewarrior: config.categoryPingCreativewarrior,
            vfxeditor: config.categoryPingVfxeditor,
          };
          const pingRoles = categoryPingMap[ticketCategory] || config.modmailStaffRoleIds || [];
          const staffRoleMentions = pingRoles?.map(id => `<@&${id}>`).join(" ") || "";

          // Get user's roles from the guild
          let userRoles = "None";
          try {
            const member = await guild.members.fetch(user.id);
            const roles = member.roles.cache
              .filter(r => r.id !== guild.id) // Exclude @everyone
              .sort((a, b) => b.position - a.position)
              .map(r => `<@&${r.id}>`)
              .slice(0, 15); // Limit to 15 roles
            userRoles = roles.length > 0 ? roles.join(", ") : "None";
          } catch (e) {}

          const initialEmbed = new EmbedBuilder()
            .setTitle(`New Ticket: ${categoryLabel}`)
            .setColor(0x5865f2)
            .setDescription(`**Roles:** ${userRoles}`)
            .addFields(
              { name: "User", value: `<@${user.id}> (${user.tag})`, inline: true },
              { name: "Category", value: categoryLabel, inline: true }
            )
            .setThumbnail(user.displayAvatarURL())
            .setTimestamp();

          const controlRow = new ActionRowBuilder<ButtonBuilder>().addComponents(
            new ButtonBuilder()
              .setCustomId(`modmail_claim_${thread.id}`)
              .setLabel("Claim")
              .setStyle(ButtonStyle.Primary)
              .setEmoji("🙋")
          );

          await newChannel.send({ content: staffRoleMentions, embeds: [initialEmbed], components: [controlRow] });

          // DM user confirmation
          try {
            const dmEmbed = new EmbedBuilder()
              .setTitle("Ticket Created")
              .setDescription(`Your **${categoryLabel}** ticket has been created. A staff member will respond shortly.\n\nReply to this DM to send messages to staff.`)
              .setColor(0x57f287)
              .setTimestamp();
            await user.send({ embeds: [dmEmbed] });
          } catch (e) {
            // console.log("Could not DM user about ticket creation");
          }

          await interaction.editReply({ content: `✅ Your **${categoryLabel}** ticket has been created! Check your DMs.` });
        } catch (error) {
          console.log("Could not create ticket channel:", error);
          await interaction.editReply({ content: "❌ Failed to create ticket. Please try again." });
        }
        return;
      }

      // Handle ticket category buttons
      if (interaction.customId.startsWith("ticket_")) {
        if (!await safeDeferReply(interaction)) return;

        const parts = interaction.customId.split("_");
        const ticketCategory = parts[1];
        const guildId = parts[2];
        const user = interaction.user;
        const guild = interaction.guild;

        if (!guild) {
          await interaction.editReply({ content: "❌ This can only be used in a server." });
          return;
        }

        const config = await storage.getGuildConfig(guildId);
        if (!config?.modmailCategoryId) {
          await interaction.editReply({ content: "❌ Modmail is not configured for this server." });
          return;
        }

        // Check if user is blocked
        const block = await storage.getActiveModmailBlock(guildId, user.id);
        if (block) {
          const expiresText = block.expiresAt 
            ? `Your block expires <t:${Math.floor(block.expiresAt.getTime() / 1000)}:R>.`
            : "You are permanently blocked.";
          await interaction.editReply({ content: `❌ You are blocked from opening tickets. ${expiresText}` });
          return;
        }

        // Check for existing open thread
        const existingThread = await storage.getOpenModmailThread(guildId, user.id);
        if (existingThread) {
          await interaction.editReply({ content: "❌ You already have an open ticket. Please wait for staff to respond or close your existing ticket." });
          return;
        }

        // Build category labels from custom categories in config
        const modalConfig = await storage.getGuildConfig(guildId);
        const modalCats: { id: string; label: string; description: string; emoji?: string }[] = [];
        if (modalConfig?.customModmailCategories) {
          try {
            const parsed = JSON.parse(modalConfig.customModmailCategories);
            modalCats.push(...parsed);
          } catch (e) {}
        }
        const modalCategoryLabels: { [key: string]: string } = {};
        for (const cat of modalCats) {
          modalCategoryLabels[cat.id] = cat.label;
        }
        const categoryLabel = modalCategoryLabels[ticketCategory] || ticketCategory;

        // Create thread and channel
        const thread = await storage.createModmailThread({
          guildId,
          userId: user.id,
          status: "open",
          category: ticketCategory,
        });

        try {
          const channelName = user.username.toLowerCase().replace(/[^a-z0-9-_]/g, "").slice(0, 32) || "ticket";
          const newChannel = await guild.channels.create({
            name: channelName,
            parent: config.modmailCategoryId!,
            topic: `${categoryLabel} ticket from ${user.tag} (${user.id})`,
          });

          await storage.updateModmailThread(thread.id, { channelId: newChannel.id });

          // Get category-specific ping roles or fall back to general staff roles
          const categoryPingMap: { [key: string]: string[] | null | undefined } = {
            general: config.categoryPingGeneral,
            competitive: config.categoryPingCompetitive,
            contentcreator: config.categoryPingContentcreator,
            report: config.categoryPingReport,
            partnerships: config.categoryPingPartnerships,
            gfx: config.categoryPingGfx,
            creativewarrior: config.categoryPingCreativewarrior,
            vfxeditor: config.categoryPingVfxeditor,
          };
          const pingRoles = categoryPingMap[ticketCategory] || config.modmailStaffRoleIds || [];
          const staffRoleMentions = pingRoles?.map(id => `<@&${id}>`).join(" ") || "";

          // Get user's roles from the guild
          let userRoles = "None";
          try {
            const member = await guild.members.fetch(user.id);
            const roles = member.roles.cache
              .filter(r => r.id !== guild.id) // Exclude @everyone
              .sort((a, b) => b.position - a.position)
              .map(r => `<@&${r.id}>`)
              .slice(0, 15); // Limit to 15 roles
            userRoles = roles.length > 0 ? roles.join(", ") : "None";
          } catch (e) {}

          const initialEmbed = new EmbedBuilder()
            .setTitle(`New Ticket: ${categoryLabel}`)
            .setColor(0x5865f2)
            .setDescription(`**Roles:** ${userRoles}`)
            .addFields(
              { name: "User", value: `<@${user.id}> (${user.tag})`, inline: true },
              { name: "Category", value: categoryLabel, inline: true }
            )
            .setThumbnail(user.displayAvatarURL())
            .setTimestamp();

          const controlRow = new ActionRowBuilder<ButtonBuilder>().addComponents(
            new ButtonBuilder()
              .setCustomId(`modmail_claim_${thread.id}`)
              .setLabel("Claim")
              .setStyle(ButtonStyle.Primary)
              .setEmoji("🙋")
          );

          await newChannel.send({ content: staffRoleMentions, embeds: [initialEmbed], components: [controlRow] });

          // DM user confirmation
          try {
            const dmEmbed = new EmbedBuilder()
              .setTitle("Ticket Created")
              .setDescription(`Your **${categoryLabel}** ticket has been created. A staff member will respond shortly.\n\nReply to this DM to send messages to staff.`)
              .setColor(0x57f287)
              .setTimestamp();
            await user.send({ embeds: [dmEmbed] });
          } catch (e) {
            // console.log("Could not DM user about ticket creation");
          }

          await interaction.editReply({ content: `✅ Your **${categoryLabel}** ticket has been created! Check your DMs.` });
        } catch (error) {
          console.log("Could not create ticket channel:", error);
          await interaction.editReply({ content: "❌ Failed to create ticket. Please try again." });
        }
        return;
      }
      // End of select menu handlers
      } else if (interaction.isButton()) {
        const customId = interaction.customId;
        
        if (customId.startsWith("roster_btn_")) {
          const rosterName = customId.replace("roster_btn_", "");
          const roster = await storage.getRosterConfig(interaction.guildId!, rosterName);

          if (!roster) {
            return interaction.reply({ content: "❌ Roster configuration not found.", ephemeral: true });
          }

          try {
            await interaction.guild?.members.fetch({ time: 30000 });
          } catch (e) {}

          const embed = new EmbedBuilder()
            .setTitle(`${roster.name.charAt(0).toUpperCase() + roster.name.slice(1)} Roster`)
            .setColor(0x5865f2)
            .setTimestamp();

          let rosterText = "";
          for (const roleId of roster.roleIds) {
            const role = interaction.guild?.roles.cache.get(roleId);
            if (role) {
              const members = role.members.map((m: any) => `<@${m.id}>`).join("\n");
              rosterText += `**${role.name}**\n${members || "No members"}\n\n`;
            }
          }

          embed.setDescription(rosterText || "No roles configured for this roster.");
          await interaction.reply({ embeds: [embed], ephemeral: true });
          return;
        }
        
        if (customId.startsWith("activity_page_")) {
          try {
            if (!await safeDeferUpdate(interaction)) return;
            const parts = customId.split("_");
            const page = parseInt(parts[2]);
            const category = parts[3] === "all" ? null : parts[3];
            const scope = parts[4];
            const fromDays = parts[5] === "none" ? undefined : parseInt(parts[5]);
            const toDays = parts[6] === "none" ? undefined : parseInt(parts[6]);
            const useAllGuilds = scope === "all";

            // Reuse the activity command logic
            const now = new Date();
            const fromDate = fromDays !== undefined ? new Date(now.getTime() - fromDays * 24 * 60 * 60 * 1000) : null;
            const toDate = toDays !== undefined ? new Date(now.getTime() - toDays * 24 * 60 * 60 * 1000) : now;

            let timeRangeDesc = useAllGuilds ? "📊 **All Servers**" : "📊 **This Server Only**";
            if (fromDate || toDays !== undefined) {
              const fromTimestamp = fromDate ? `<t:${Math.floor(fromDate.getTime() / 1000)}:F>` : null;
              const toTimestamp = `<t:${Math.floor(toDate.getTime() / 1000)}:F>`;
              timeRangeDesc += "\n" + (fromTimestamp ? `From ${fromTimestamp} to ${toTimestamp}` : `Up to ${toTimestamp}`);
            }

            let banStats: { userId: string; count: number }[] = [];
            let unbanStats: { userId: string; count: number }[] = [];
            let modmailStats: { userId: string; count: number }[] = [];
            let appealStats: { userId: string; count: number }[] = [];
            let staffReportStats: { userId: string; count: number }[] = [];
            let modmailCategoryStats: { category: string; count: number }[] = [];

            try {
              if (!category || category === "ban") {
                banStats = useAllGuilds
                  ? await storage.getAllGuildsBanStats(fromDays, toDays)
                  : await storage.getActivityStats(interaction.guildId!, "ban", fromDays, toDays);
              }
            } catch (e) {}
            try {
              if (!category || category === "unban") {
                unbanStats = useAllGuilds
                  ? await storage.getAllGuildsUnbanStats(fromDays, toDays)
                  : await storage.getActivityStats(interaction.guildId!, "unban", fromDays, toDays);
              }
            } catch (e) {}
            try {
              if (!category || category === "modmail") {
                modmailStats = useAllGuilds
                  ? await storage.getAllGuildsModmailStats(fromDays, toDays)
                  : await storage.getModmailStats(interaction.guildId!, fromDays, toDays);
              }
            } catch (e) {}
            try {
              if (!category || category === "appeal") {
                appealStats = useAllGuilds
                  ? await storage.getAllGuildsAppealStats(fromDays, toDays)
                  : await storage.getAppealStats(interaction.guildId!, fromDays, toDays);
              }
            } catch (e) {}
            try {
              if (!category || category === "staffreport") {
                staffReportStats = await storage.getStaffReportStats(interaction.guildId!, fromDays, toDays);
              }
            } catch (e) {}
            try {
              if (!category || category === "modmail") {
                modmailCategoryStats = await storage.getModmailStatsByCategory(interaction.guildId!, fromDays, toDays);
              }
            } catch (e) {}

            const combinedStats: { [userId: string]: number } = {};
            for (const stat of banStats) combinedStats[stat.userId] = (combinedStats[stat.userId] || 0) + stat.count;
            for (const stat of unbanStats) combinedStats[stat.userId] = (combinedStats[stat.userId] || 0) + stat.count;
            for (const stat of modmailStats) combinedStats[stat.userId] = (combinedStats[stat.userId] || 0) + stat.count;
            for (const stat of appealStats) combinedStats[stat.userId] = (combinedStats[stat.userId] || 0) + stat.count;
            for (const stat of staffReportStats) combinedStats[stat.userId] = (combinedStats[stat.userId] || 0) + stat.count;

            delete combinedStats["staff_report_entry"];
            delete combinedStats["manual_entry"];

            try {
              const config = await storage.getGuildConfig(interaction.guildId!);
              if (config?.activityTrackedRoleIds && config.activityTrackedRoleIds.length > 0 && interaction.guild) {
                for (const roleId of config.activityTrackedRoleIds) {
                  const trackedRole = interaction.guild.roles.cache.get(roleId);
                  if (trackedRole) {
                    trackedRole.members.forEach((member, memberId) => {
                      if (!(memberId in combinedStats)) combinedStats[memberId] = 0;
                    });
                  }
                }
              }
            } catch (e) {}

            const leaderboard = Object.entries(combinedStats)
              .map(([userId, count]) => ({ userId, count }))
              .sort((a, b) => b.count - a.count);

            const totalPages = Math.ceil(leaderboard.length / 10);
            const start = (page - 1) * 10;
            const currentLeaderboard = leaderboard.slice(start, start + 10);

            const categoryText = category === "ban" ? "Ban Requests" : category === "unban" ? "Unban Requests" : category === "modmail" ? "Modmails Handled" : category === "appeal" ? "Ban Appeals Handled" : category === "staffreport" ? "Staff Reports" : "All Activity";

            const embed = new EmbedBuilder()
              .setTitle(`${categoryText} Leaderboard`)
              .setColor(0x5865f2)
              .setDescription(timeRangeDesc || null);

            const totalCount = leaderboard.reduce((sum, e) => sum + e.count, 0);
            const banTotal = banStats.reduce((sum, e) => sum + e.count, 0);
            const unbanTotal = unbanStats.reduce((sum, e) => sum + e.count, 0);
            const modmailTotal = modmailStats.reduce((sum, e) => sum + e.count, 0);
            const appealTotal = appealStats.reduce((sum, e) => sum + e.count, 0);
            const staffReportTotal = staffReportStats.reduce((sum, e) => sum + e.count, 0);

            let leaderboardText = "";
            currentLeaderboard.forEach((entry, index) => {
              leaderboardText += `${start + index + 1}. <@${entry.userId}> - ${entry.count}\n`;
            });
            embed.addFields({ name: "Leaderboard", value: leaderboardText || "None", inline: false });

            let statsText = `**Total in the specified time:** ${totalCount}`;
            if (!category) {
              if (banTotal > 0) statsText += `\nBan Requests: ${banTotal}`;
              if (unbanTotal > 0) statsText += `\nUnban Requests: ${unbanTotal}`;
              if (modmailTotal > 0) statsText += `\nModmails Handled: ${modmailTotal}`;
              if (appealTotal > 0) statsText += `\nAppeals Handled: ${appealTotal}`;
              if (staffReportTotal > 0) statsText += `\nStaff Reports: ${staffReportTotal}`;
            } else if (category === "modmail") {
              if (modmailTotal > 0 && modmailCategoryStats.length > 0) {
                const categoryLabels: { [key: string]: string } = {};
                const config = await storage.getGuildConfig(interaction.guildId!);
                if (config?.customModmailCategories) {
                  try {
                    const cats = JSON.parse(config.customModmailCategories);
                    for (const cat of cats) categoryLabels[cat.id] = cat.label;
                  } catch (e) {}
                }
                statsText += "\n\n**Category Breakdown:**";
                for (const catStat of modmailCategoryStats) {
                  if (catStat.category === "unknown" || !catStat.category) continue;
                  statsText += `\n• ${categoryLabels[catStat.category] || catStat.category}: ${catStat.count}`;
                }
              }
            }
            embed.addFields({ name: "Stats", value: statsText, inline: false });

            embed.setFooter({ text: `Page ${page} of ${totalPages} | ${now.toLocaleDateString('en-US', { year: 'numeric', month: '2-digit', day: '2-digit' })}, ${now.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit', hour12: true })}` });

            const components = [];
            if (totalPages > 1) {
              const row = new ActionRowBuilder<ButtonBuilder>().addComponents(
                new ButtonBuilder()
                  .setCustomId(`activity_page_${page - 1}_${category || "all"}_${scope}_${fromDays ?? "none"}_${toDays ?? "none"}`)
                  .setLabel("◀ Previous")
                  .setStyle(ButtonStyle.Secondary)
                  .setDisabled(page <= 1),
                new ButtonBuilder()
                  .setCustomId(`activity_page_${page + 1}_${category || "all"}_${scope}_${fromDays ?? "none"}_${toDays ?? "none"}`)
                  .setLabel("Next ▶")
                  .setStyle(ButtonStyle.Secondary)
                  .setDisabled(page >= totalPages)
              );
              components.push(row);
            }

            await interaction.editReply({ embeds: [embed], components });
          } catch (e) {
            console.log("Error handling activity page button:", e);
          }
          return;
        }
      // Handle button interactions
      if (interaction.customId.startsWith("modmail_claim_")) {
        if (!await safeDeferUpdate(interaction)) return;

        try {
          const threadId = interaction.customId.replace("modmail_claim_", "");
          const thread = await storage.getModmailThread(threadId);

          if (!thread) {
            await interaction.followUp({ content: "Thread not found.", flags: 64 });
            return;
          }

          if (thread.claimedById) {
            await interaction.followUp({ content: `This ticket is already claimed by <@${thread.claimedById}>.`, flags: 64 });
            return;
          }

          const config = await storage.getGuildConfig(interaction.guildId!);
          const claimRoleIds = config?.modmailClaimRoleIds || config?.modmailStaffRoleIds || [];
          const memberRoles = interaction.member?.roles;
          const hasClaimPermission = claimRoleIds.length === 0 || 
            (memberRoles && Array.isArray(memberRoles) 
              ? claimRoleIds.some(id => memberRoles.includes(id))
              : memberRoles && 'cache' in memberRoles && claimRoleIds.some(id => memberRoles.cache.has(id)));

          if (!hasClaimPermission) {
            await interaction.followUp({ content: "You don't have permission to claim tickets.", flags: 64 });
            return;
          }

          await storage.updateModmailThread(threadId, { claimedById: interaction.user.id });

          const claimEmbed = new EmbedBuilder()
            .setDescription(`Claimed by ${interaction.user.username}`)
            .setColor(0xed4245)
            .setTimestamp();

          // Update button to show claimed state while preserving other buttons
          await interaction.message.edit({
            components: [
              new ActionRowBuilder<ButtonBuilder>().addComponents(
                new ButtonBuilder()
                  .setCustomId(`modmail_claim_${threadId}`)
                  .setLabel(`Claimed by ${interaction.user.username}`)
                  .setStyle(ButtonStyle.Secondary)
                  .setDisabled(true),
                new ButtonBuilder()
                  .setCustomId(`modmail_close_${threadId}`)
                  .setLabel("Close")
                  .setStyle(ButtonStyle.Danger)
                  .setEmoji("🔒")
              )
            ]
          });

          await interaction.followUp({ embeds: [claimEmbed] });

          // Start 15-minute claim expiry timer
          if (interaction.channel) {
            const CLAIM_EXPIRY_TIME = 15 * 60 * 1000;
            const existingClaimTimer = pendingClaimExpiry.get(interaction.channel.id);
            if (existingClaimTimer) {
              clearTimeout(existingClaimTimer.timeout);
            }

            const channelId = interaction.channel.id;
            const claimerId = interaction.user.id;
            const claimExpiryTimeout = setTimeout(async () => {
              pendingClaimExpiry.delete(channelId);

              try {
                const currentThread = await storage.getModmailThreadByChannel(channelId);
                if (!currentThread || currentThread.status !== "open") return;
                if (currentThread.claimedById !== claimerId) return;

                await storage.updateModmailThread(currentThread.id, { claimedById: null });
                const channel = await client.channels.fetch(channelId);
                if (channel && "send" in channel) {
                  await channel.send(`Ticket auto-unclaimed. <@${claimerId}> did not respond within 15 minutes.`);
                }
              } catch (e) {
                console.log("Could not process auto-unclaim");
              }
            }, CLAIM_EXPIRY_TIME);

            pendingClaimExpiry.set(channelId, {
              timeout: claimExpiryTimeout,
              claimerId: claimerId,
            });
          }
        } catch (error: any) {
          console.log("Error in modmail_claim button:", error.message);
          await interaction.followUp({ content: "Failed to claim ticket. Please try again.", flags: 64 }).catch(() => {});
        }
        return;
      } else if (interaction.customId.startsWith("modmail_close_")) {
        if (!await safeDeferReply(interaction)) return;

        try {
          const threadId = interaction.customId.replace("modmail_close_", "");
          const thread = await storage.getModmailThread(threadId);

          if (!thread) {
            await interaction.editReply({ content: "Thread not found." });
            return;
          }

          // Check if ticket is claimed and if the closer is the claimer
          if (thread.claimedById && thread.claimedById !== interaction.user.id) {
            await interaction.editReply({ content: `Only <@${thread.claimedById}> (who claimed this ticket) can close it.` });
            return;
          }

          // Update thread status and clear timer
          await storage.updateModmailThread(threadId, {
            status: "closed",
            closedById: interaction.user.id,
            closeReason: "Closed via button",
            closedAt: new Date(),
          });

          // Track activity for closing modmail
          await storage.addModmailActivityEntries(interaction.guildId!, interaction.user.id, 1);

          if (interaction.channel) {
            const existingClaimTimer = pendingClaimExpiry.get(interaction.channel.id);
            if (existingClaimTimer) {
              clearTimeout(existingClaimTimer.timeout);
              pendingClaimExpiry.delete(interaction.channel.id);
            }
          }

          // Capture references synchronously
          const guildId = interaction.guildId!;
          const closerId = interaction.user.id;
          const channelId = interaction.channel?.id;
          const threadUserId = thread.userId;
          const threadIdForLog = thread.id;

          // Send log BEFORE replying or deleting (critical to ensure it happens)
          try {
            const config = await storage.getGuildConfig(guildId);
            if (config?.modmailLogChannelId) {
              const logChannel = await client.channels.fetch(config.modmailLogChannelId);
              if (logChannel && "send" in logChannel) {
          const messages = await storage.getModmailMessages(threadIdForLog);
          // Include all messages in the .txt transcript, even if they weren't sent to the user (like staff notes)
          const transcriptContent = messages.map(m => `[${m.isStaff === "true" ? "Staff" : "User"}] ${m.authorId}: ${m.content}`).join("\n");
          const buffer = Buffer.from(transcriptContent, "utf-8");
          const attachment = new AttachmentBuilder(buffer, { name: `transcript-${threadIdForLog}.txt` });

          let transcriptPreview = messages.map(m => `[${m.isStaff === "true" ? "Staff" : "User"}] <@${m.authorId}>: ${m.content}`).join("\n");
          if (transcriptPreview.length > 1900) transcriptPreview = transcriptPreview.substring(0, 1900) + "...";
          if (!transcriptPreview) transcriptPreview = "No messages";

          const logEmbed = new EmbedBuilder()
            .setTitle("Ticket Closed")
            .setColor(0xed4245)
            .addFields(
              { name: "User", value: `<@${threadUserId}>`, inline: true },
              { name: "Closed By", value: `<@${closerId}>`, inline: true },
              { name: "Transcript Preview", value: transcriptPreview, inline: false }
            )
            .setTimestamp();
          await logChannel.send({ embeds: [logEmbed], files: [attachment] });
          console.log(`[MODMAIL] Log sent for thread ${threadIdForLog}`);
              }
            }
          } catch (e: any) {
            // console.log("[MODMAIL] Could not send log:", e.message);
          }

          // Reply to user
          await interaction.editReply({ content: "Ticket closed. Deleting channel..." });

        // Background: DM user and delete channel
        (async () => {
          // DM user notification
          try {
            const user = await client.users.fetch(threadUserId);
            const closeEmbed = new EmbedBuilder()
              .setTitle("Ticket Closed")
              .setDescription("Your ticket has been closed by staff.")
              .setColor(0xed4245)
              .setTimestamp();
            await user.send({ embeds: [closeEmbed] });
          } catch (e) {
            // console.log("[MODMAIL] Could not DM user about ticket close");
          }

          // Delete channel immediately (no delay)
          if (channelId) {
            try {
              const chan = await client.channels.fetch(channelId);
              if (chan) await chan.delete();
            } catch (e) { }
          }
        })().catch(e => {});
        } catch (error: any) {
          console.log("Error in modmail_close button:", error.message);
          await interaction.editReply({ content: "Failed to close ticket. Please try again." }).catch(() => {});
        }
        return;
      } else if (interaction.customId.startsWith("appeal_start_")) {
        if (!await safeDeferReply(interaction, true)) return;

        const guildId = interaction.customId.replace("appeal_start_", "");
        const user = interaction.user;
        const guild = interaction.guild;

        if (!guild) {
          await interaction.editReply({ content: "This can only be used in a server." });
          return;
        }

        const config = await storage.getGuildConfig(guildId);
        if (!config?.appealCategoryId) {
          await interaction.editReply({ content: "Ban appeals are not configured for this server." });
          return;
        }

        const block = await storage.getActiveAppealBlock(guildId, user.id);
        if (block) {
          const expiresText = block.expiresAt 
            ? `Your block expires <t:${Math.floor(block.expiresAt.getTime() / 1000)}:R>.`
            : "You are permanently blocked.";
          await interaction.editReply({ content: `You are blocked from submitting appeals. ${expiresText}` });
          return;
        }

        const existingAppeal = await storage.getOpenAppealThread(guildId, user.id);
        if (existingAppeal) {
          await interaction.editReply({ content: "You already have an open appeal. Please wait for staff to respond." });
          return;
        }

        const thread = await storage.createAppealThread({
          guildId,
          userId: user.id,
          status: "open",
        });

        try {
          const channelName = `appeal-${user.username.toLowerCase().replace(/[^a-z0-9]/g, "")}`;
          const newChannel = await guild.channels.create({
            name: channelName,
            parent: config.appealCategoryId!,
            topic: `Ban appeal from ${user.tag} (${user.id})`,
          });

          await storage.updateAppealThread(thread.id, { channelId: newChannel.id });

          const staffRoleMentions = config.appealStaffRoleIds?.map(id => `<@&${id}>`).join(" ") || "";

          // Get user's roles from the guild
          let userRoles = "None";
          try {
            const member = await guild.members.fetch(user.id);
            const roles = member.roles.cache
              .filter(r => r.id !== guild.id)
              .sort((a, b) => b.position - a.position)
              .map(r => `<@&${r.id}>`)
              .slice(0, 15);
            userRoles = roles.length > 0 ? roles.join(", ") : "None";
          } catch (e) {}

          const initialEmbed = new EmbedBuilder()
            .setTitle("New Ban Appeal")
            .setColor(0xff6b6b)
            .setDescription(`**Roles:** ${userRoles}`)
            .addFields(
              { name: "User", value: `<@${user.id}> (${user.tag})`, inline: true }
            )
            .setThumbnail(user.displayAvatarURL())
            .setTimestamp();

          const controlRow = new ActionRowBuilder<ButtonBuilder>().addComponents(
            new ButtonBuilder()
              .setCustomId(`appeal_claim_${thread.id}`)
              .setLabel("Claim")
              .setStyle(ButtonStyle.Primary)
              .setEmoji("🙋")
          );

          await newChannel.send({ content: staffRoleMentions, embeds: [initialEmbed], components: [controlRow] });

          try {
            const dmEmbed = new EmbedBuilder()
              .setTitle("Ban Appeal Submitted")
              .setDescription("Your ban appeal has been submitted. A staff member will review it shortly.\n\nReply to this DM to send messages to staff.")
              .setColor(0x57f287)
              .setTimestamp();
            await user.send({ embeds: [dmEmbed] });
          } catch (e) {
            // console.log("Could not DM user about appeal creation");
          }

          await interaction.editReply({ content: "Your ban appeal has been submitted! Check your DMs." });
        } catch (error) {
          console.log("Could not create appeal channel:", error);
          await interaction.editReply({ content: "Failed to submit appeal. Please try again." });
        }
        return;
      } else if (interaction.customId.startsWith("appeal_claim_")) {
        if (!await safeDeferUpdate(interaction)) return;

        try {
          const threadId = interaction.customId.replace("appeal_claim_", "");
          const thread = await storage.getAppealThread(threadId);

          if (!thread) {
            await interaction.followUp({ content: "Appeal not found.", flags: 64 });
            return;
          }

          if (thread.claimedById) {
            await interaction.followUp({ content: `This appeal is already claimed by <@${thread.claimedById}>.`, flags: 64 });
            return;
          }

          const config = await storage.getGuildConfig(interaction.guildId!);
          const claimRoleIds = config?.appealStaffRoleIds || [];
          const memberRoles = interaction.member?.roles;
          const hasClaimPermission = claimRoleIds.length === 0 || 
            (memberRoles && Array.isArray(memberRoles) 
              ? claimRoleIds.some(id => memberRoles.includes(id))
              : memberRoles && 'cache' in memberRoles && claimRoleIds.some(id => memberRoles.cache.has(id)));

          if (!hasClaimPermission) {
            await interaction.followUp({ content: "You don't have permission to claim appeals.", flags: 64 });
            return;
          }

          await storage.updateAppealThread(threadId, { claimedById: interaction.user.id });

          const claimEmbed = new EmbedBuilder()
            .setDescription(`**Appeal claimed by <@${interaction.user.id}>**`)
            .setColor(0x5865f2)
            .setTimestamp();

          await interaction.message.edit({
            components: [
              new ActionRowBuilder<ButtonBuilder>().addComponents(
                new ButtonBuilder()
                  .setCustomId(`appeal_claim_${threadId}`)
                  .setLabel(`Claimed by ${interaction.user.username}`)
                  .setStyle(ButtonStyle.Secondary)
                  .setDisabled(true)
              )
            ]
          });

          await interaction.followUp({ embeds: [claimEmbed] });
        } catch (error: any) {
          console.log("Error in appeal_claim button:", error.message);
          await interaction.followUp({ content: "Failed to claim appeal.", flags: 64 }).catch(() => {});
        }
        return;
      } else if (interaction.customId.startsWith("members_prev_") || interaction.customId.startsWith("members_next_")) {
        if (!await safeDeferUpdate(interaction)) return;

        const parts = interaction.customId.split("_");
        const direction = parts[1];
        const roleId = parts[2];
        const currentPage = parseInt(parts[3]);

        const guild = interaction.guild;
        if (!guild) return;

        try {
          await guild.members.fetch({ time: 30000 });
        } catch (error) {
          console.log("Could not fully fetch members");
        }

        const guildRole = guild.roles.cache.get(roleId);
        if (!guildRole) return;

        const members = guildRole.members.map((m) => `<@${m.id}>`);
        const pageSize = 10;
        const totalPages = Math.ceil(members.length / pageSize) || 1;

        let newPage = currentPage;
        if (direction === "next" && currentPage < totalPages - 1) {
          newPage = currentPage + 1;
        } else if (direction === "prev" && currentPage > 0) {
          newPage = currentPage - 1;
        }

        const pageMembers = members.slice(newPage * pageSize, (newPage + 1) * pageSize);

        const embed = new EmbedBuilder()
          .setTitle(`Members with ${guildRole.name}`)
          .setColor(guildRole.color || 0x5865f2)
          .setDescription(pageMembers.length > 0 ? pageMembers.join("\n") : "No members have this role.")
          .setFooter({ text: `Page ${newPage + 1}/${totalPages} • Total: ${members.length} member(s)` })
          .setTimestamp();

        const row = new ActionRowBuilder<ButtonBuilder>().addComponents(
          new ButtonBuilder()
            .setCustomId(`members_prev_${roleId}_${newPage}`)
            .setLabel("◀ Previous")
            .setStyle(ButtonStyle.Secondary)
            .setDisabled(newPage === 0),
          new ButtonBuilder()
            .setCustomId(`members_next_${roleId}_${newPage}`)
            .setLabel("Next ▶")
            .setStyle(ButtonStyle.Secondary)
            .setDisabled(newPage >= totalPages - 1)
        );

        await interaction.editReply({ embeds: [embed], components: [row] });
        return;
      } else if (interaction.customId.startsWith("start_quiz_")) {
        const guildId = interaction.customId.replace("start_quiz_", "");
        const user = interaction.user;

        console.log(`[QUIZ START] Button clicked by ${user.id}, interaction: ${interaction.id}`);

        // DEFER IMMEDIATELY before any checks or async work
        try {
          if (!await safeDeferReply(interaction)) return;
        } catch (error: any) {
          if (error.code === 10062 || error.code === 40060) {
            console.log('Interaction expired before defer:', interaction.id);
            return;
          }
          throw error;
        }

        // Prevent duplicate processing (after deferring)
        if (processingQuizStart.has(user.id)) {
          console.log(`[QUIZ START] Blocked duplicate for user ${user.id}`);
          try {
            await interaction.editReply({
              content: "⏳ Your quiz is already being started. Please wait...",
            });
          } catch (e) {}
          return;
        }

        // Check if user already has an active quiz (after deferring)
        if (activeQuizzes.has(user.id)) {
          await interaction.editReply({
            content: "You already have an active quiz in progress. Please complete it first by replying in DMs!",
          });
          return;
        }

        processingQuizStart.add(user.id);
        console.log(`[QUIZ START] Processing quiz start for user ${user.id}`);

        try {
          activeQuizzes.set(user.id, {
            guildId,
            currentQuestion: 0,
            answers: [],
            startedAt: Date.now(),
          });

          // Retry DM creation up to 2 times to handle intermittent Discord API issues
          let dmChannel = null;
          let lastError = null;
          for (let attempt = 1; attempt <= 2; attempt++) {
            try {
              dmChannel = await user.createDM();
              break;
            } catch (dmError: any) {
              lastError = dmError;
              console.log(`[QUIZ START] DM creation attempt ${attempt} failed for ${user.id}: ${dmError.message}`);
              if (attempt < 2) {
                await new Promise(resolve => setTimeout(resolve, 500));
              }
            }
          }

          if (!dmChannel) {
            throw lastError || new Error("Failed to create DM channel");
          }

          console.log(`[QUIZ START] Sending combined intro + Q1 to ${user.id}`);
          await sendQuizQuestion(user.id, dmChannel, true);
          console.log(`[QUIZ START] Q1 sent to ${user.id}`);

          await interaction.editReply({
            content: "✅ Quiz started! Check your DMs for the questions.",
          });
        } catch (error: any) {
          activeQuizzes.delete(user.id);
          console.log("Error starting quiz - DM failed:", error.message, error.stack?.split('\n').slice(0, 3).join(' '));

          await interaction.editReply({
            content: "❌ I couldn't send you a DM. Please make sure your DMs are open and try again!",
          });
        } finally {
          // Clean up after a short delay to allow for double-click protection
          setTimeout(() => processingQuizStart.delete(user.id), 5000);
        }
        return;
      } else if (interaction.customId.startsWith("request_inactivity_")) {
        const guildId = interaction.customId.replace("request_inactivity_", "");

        try {
          const modal = new ModalBuilder()
            .setCustomId(`inactivity_submit_${guildId}`)
            .setTitle("Inactivity Request");

          const fromDate = new TextInputBuilder()
            .setCustomId("from_date")
            .setLabel("From")
            .setPlaceholder("Start date (e.g. 12/15/2024)")
            .setStyle(TextInputStyle.Short)
            .setRequired(true);

          const toDate = new TextInputBuilder()
            .setCustomId("to_date")
            .setLabel("To")
            .setPlaceholder("End date (e.g. 12/22/2024)")
            .setStyle(TextInputStyle.Short)
            .setRequired(true);

          const reason = new TextInputBuilder()
            .setCustomId("reason")
            .setLabel("Reason")
            .setPlaceholder("Reason for inactivity")
            .setStyle(TextInputStyle.Paragraph)
            .setRequired(true);

          modal.addComponents(
            new ActionRowBuilder<TextInputBuilder>().addComponents(fromDate),
            new ActionRowBuilder<TextInputBuilder>().addComponents(toDate),
            new ActionRowBuilder<TextInputBuilder>().addComponents(reason)
          );

          await interaction.showModal(modal);
        } catch (error: any) {
          console.log("Error showing inactivity modal:", error);
        }
        return;
      } else if (interaction.customId.startsWith("inactivity_approve_") || interaction.customId.startsWith("inactivity_deny_")) {
        const isApprove = interaction.customId.startsWith("inactivity_approve_");
        const requestId = interaction.customId.replace(isApprove ? "inactivity_approve_" : "inactivity_deny_", "");

        // Build modal immediately - no async work before this
        const modal = new ModalBuilder()
          .setCustomId(`inactivity_review_${isApprove ? "approve" : "deny"}_${requestId}`)
          .setTitle(isApprove ? "Approve Inactivity Request" : "Deny Inactivity Request");

        const reasonInput = new TextInputBuilder()
          .setCustomId("reason")
          .setLabel("Reason (optional)")
          .setPlaceholder("Enter a reason for your decision...")
          .setStyle(TextInputStyle.Paragraph)
          .setRequired(false);

        modal.addComponents(
          new ActionRowBuilder<TextInputBuilder>().addComponents(reasonInput)
        );

        try {
          await interaction.showModal(modal);
        } catch (error: any) {
          if (error.code === 10062) {
            console.log("Inactivity review modal: interaction expired");
          } else {
            console.log("Error showing inactivity review modal:", error.message);
          }
        }
        return;
      } else if (interaction.customId.startsWith("quiz_approve_") || interaction.customId.startsWith("quiz_deny_")) {
        const isApprove = interaction.customId.startsWith("quiz_approve_");
        const submissionId = interaction.customId.replace(isApprove ? "quiz_approve_" : "quiz_deny_", "");

        // Build modal immediately - no async work before this
        const modal = new ModalBuilder()
          .setCustomId(`quiz_review_${isApprove ? "approve" : "deny"}_${submissionId}`)
          .setTitle(isApprove ? "Approve Submission" : "Deny Submission");

        const reasonInput = new TextInputBuilder()
          .setCustomId("review_reason")
          .setLabel("Reason (optional)")
          .setStyle(TextInputStyle.Paragraph)
          .setPlaceholder(isApprove ? "Any notes for the user..." : "Why is this submission being denied?")
          .setRequired(false);

        const row = new ActionRowBuilder<TextInputBuilder>().addComponents(reasonInput);
        modal.addComponents(row);

        try {
          await interaction.showModal(modal);
        } catch (error: any) {
          if (error.code === 10062) {
            console.log("Quiz review modal: interaction expired");
          } else {
            console.log("Error showing quiz review modal:", error.message);
          }
        }
        return;
      } else if (interaction.customId === "request_payout") {
        try {
          // Build and show modal immediately to prevent timeout
          const modal = new ModalBuilder()
            .setCustomId("payout_modal")
            .setTitle("Request Payout");

          const userIdInput = new TextInputBuilder()
            .setCustomId("user_id")
            .setLabel("User ID")
            .setStyle(TextInputStyle.Short)
            .setPlaceholder("Enter the user ID")
            .setRequired(true);

          const reasonInput = new TextInputBuilder()
            .setCustomId("reason")
            .setLabel("Reason")
            .setStyle(TextInputStyle.Paragraph)
            .setPlaceholder("Why?")
            .setRequired(true);

          const moneyOwedInput = new TextInputBuilder()
            .setCustomId("money_owed")
            .setLabel("Money Owed")
            .setStyle(TextInputStyle.Short)
            .setPlaceholder("0.00")
            .setRequired(true);

          const paypalInput = new TextInputBuilder()
            .setCustomId("paypal")
            .setLabel("Paypal Username/Email")
            .setStyle(TextInputStyle.Short)
            .setPlaceholder("email@example.com")
            .setRequired(true);

          const row1 = new ActionRowBuilder<TextInputBuilder>().addComponents(userIdInput);
          const row2 = new ActionRowBuilder<TextInputBuilder>().addComponents(reasonInput);
          const row3 = new ActionRowBuilder<TextInputBuilder>().addComponents(moneyOwedInput);
          const row4 = new ActionRowBuilder<TextInputBuilder>().addComponents(paypalInput);

          modal.addComponents(row1, row2, row3, row4);

          // Show modal immediately
          await interaction.showModal(modal);
        } catch (error: any) {
          if (error.code === 10062 || error.code === 40060) {
            console.log('Interaction expired or already acknowledged:', interaction.id);
          } else {
            throw error;
          }
        }
        return;
      } else if (interaction.customId.startsWith("approve_") || interaction.customId.startsWith("deny_")) {
        const [action, requestId] = interaction.customId.split("_");

        // Build and show modal immediately to prevent timeout - NO async work before this
        const modal = new ModalBuilder()
          .setCustomId(`action_reason_${action}_${requestId}`)
          .setTitle(action === "approve" ? "Approve Payout" : "Deny Payout");

        const reasonInput = new TextInputBuilder()
          .setCustomId("action_reason")
          .setLabel(action === "approve" ? "Note (Optional)" : "Reason (Optional)")
          .setStyle(TextInputStyle.Paragraph)
          .setPlaceholder(action === "approve" ? "Add a note..." : "Why are you denying this?")
          .setRequired(false);

        const row = new ActionRowBuilder<TextInputBuilder>().addComponents(reasonInput);
        modal.addComponents(row);

        // Show modal immediately - permission check will happen in modal submit
        try {
          await interaction.showModal(modal);
        } catch (error: any) {
          // Silently handle expired interactions
          if (error.code !== 10062 && error.code !== 40060) {
            console.log('Error showing modal:', error.message);
          }
        }
        return;
      } else if (interaction.customId === "submit_ban_request") {
        try {
          const modal = new ModalBuilder()
            .setCustomId("ban_request_modal")
            .setTitle("Ban Request");

          const userIdInput = new TextInputBuilder()
            .setCustomId("user_id")
            .setLabel("User ID")
            .setStyle(TextInputStyle.Short)
            .setPlaceholder("Enter the user ID")
            .setRequired(true);

          const reasonInput = new TextInputBuilder()
            .setCustomId("reason")
            .setLabel("Ban Reason")
            .setStyle(TextInputStyle.Paragraph)
            .setPlaceholder("Why should this user be banned?")
            .setRequired(true);

          const row1 = new ActionRowBuilder<TextInputBuilder>().addComponents(userIdInput);
          const row2 = new ActionRowBuilder<TextInputBuilder>().addComponents(reasonInput);

          modal.addComponents(row1, row2);
          await interaction.showModal(modal);
        } catch (error: any) {
          if (error.code === 10062 || error.code === 40060) {
            console.log('Interaction expired:', interaction.id);
          } else {
            throw error;
          }
        }
        return;
      } else if (interaction.customId === "submit_unban_request") {
        try {
          const modal = new ModalBuilder()
            .setCustomId("unban_request_modal")
            .setTitle("Unban Request");

          const userIdInput = new TextInputBuilder()
            .setCustomId("user_id")
            .setLabel("User ID")
            .setStyle(TextInputStyle.Short)
            .setPlaceholder("Enter the user ID")
            .setRequired(true);

          const reasonInput = new TextInputBuilder()
            .setCustomId("reason")
            .setLabel("Unban Reason")
            .setStyle(TextInputStyle.Paragraph)
            .setPlaceholder("Why should this user be unbanned?")
            .setRequired(true);

          const row1 = new ActionRowBuilder<TextInputBuilder>().addComponents(userIdInput);
          const row2 = new ActionRowBuilder<TextInputBuilder>().addComponents(reasonInput);

          modal.addComponents(row1, row2);
          await interaction.showModal(modal);
        } catch (error: any) {
          if (error.code === 10062 || error.code === 40060) {
            console.log('Interaction expired:', interaction.id);
          } else {
            throw error;
          }
        }
        return;
      } else if (interaction.customId.startsWith("ban_approve_") || interaction.customId.startsWith("ban_deny_")) {
        try {
          const parts = interaction.customId.split("_");
          const action = parts[1]; // approve or deny
          const requestId = parts.slice(2).join("_");

          const modal = new ModalBuilder()
            .setCustomId(`ban_action_${action}_${requestId}`)
            .setTitle(action === "approve" ? "Approve Request" : "Deny Request");

          const reasonInput = new TextInputBuilder()
            .setCustomId("action_reason")
            .setLabel("Reason (optional)")
            .setStyle(TextInputStyle.Paragraph)
            .setPlaceholder("Enter a reason for this decision...")
            .setRequired(false);

          const row = new ActionRowBuilder<TextInputBuilder>().addComponents(reasonInput);
          modal.addComponents(row);
          await interaction.showModal(modal);
        } catch (error: any) {
          if (error.code === 10062 || error.code === 40060) {
            console.log('Interaction expired:', interaction.id);
          } else {
            throw error;
          }
        }
        return;
      } else if (interaction.customId.startsWith("unban_approve_") || interaction.customId.startsWith("unban_deny_")) {
        try {
          const parts = interaction.customId.split("_");
          const action = parts[1]; // approve or deny
          const requestId = parts.slice(2).join("_");

          const modal = new ModalBuilder()
            .setCustomId(`unban_action_${action}_${requestId}`)
            .setTitle(action === "approve" ? "Approve Request" : "Deny Request");

          const reasonInput = new TextInputBuilder()
            .setCustomId("action_reason")
            .setLabel("Reason (optional)")
            .setStyle(TextInputStyle.Paragraph)
            .setPlaceholder("Enter a reason for this decision...")
            .setRequired(false);

          const row = new ActionRowBuilder<TextInputBuilder>().addComponents(reasonInput);
          modal.addComponents(row);
          await interaction.showModal(modal);
        } catch (error: any) {
          if (error.code === 10062 || error.code === 40060) {
            console.log('Interaction expired:', interaction.id);
          } else {
            throw error;
          }
        }
        return;
      } else if (interaction.customId.startsWith("sniplist_") || interaction.customId.startsWith("asniplist_")) {
        try {
          const isAppeal = interaction.customId.startsWith("asniplist_");
          const pageNum = parseInt(interaction.customId.split("_")[1]);

          const allSnippets = isAppeal 
            ? await storage.getAllAppealSnippets(interaction.guildId!)
            : await storage.getAllSnippets(interaction.guildId!);

          if (allSnippets.length === 0) {
            await interaction.update({ content: "No snippets found.", embeds: [], components: [] });
            return;
          }

          const perPage = 10;
          const totalPages = Math.ceil(allSnippets.length / perPage);
          const page = Math.max(1, Math.min(pageNum, totalPages));
          const start = (page - 1) * perPage;
          const pageSnippets = allSnippets.slice(start, start + perPage);

          const snippetListDisplay = pageSnippets.map((s, i) => {
            const num = start + i + 1;
            // Cap content at 500 chars to prevent embed overflow
            const content = s.content.length > 500 ? s.content.substring(0, 500) + "..." : s.content;
            return `**${num}.** \`${s.alias}\`\n${content}`;
          }).join("\n\n");

          const prefix = (await storage.getGuildConfig(interaction.guildId!))?.commandPrefix || ".";

          const embed = new EmbedBuilder()
            .setTitle(`📝 ${isAppeal ? "Appeal " : ""}Snippet List`)
            .setDescription(snippetListDisplay || "No snippets on this page.")
            .setColor(0x5865f2)
            .setFooter({ text: `Page ${page}/${totalPages} | Total: ${allSnippets.length} snippets | Use ${prefix}${isAppeal ? "asnip" : "snip"} list <page>` });

          const row = new ActionRowBuilder<ButtonBuilder>();
          const btnPrefix = isAppeal ? "asniplist" : "sniplist";
          if (page > 1) {
            row.addComponents(
              new ButtonBuilder()
                .setCustomId(`${btnPrefix}_${page - 1}`)
                .setLabel("◀ Previous")
                .setStyle(ButtonStyle.Secondary)
            );
          }
          if (page < totalPages) {
            row.addComponents(
              new ButtonBuilder()
                .setCustomId(`${btnPrefix}_${page + 1}`)
                .setLabel("Next ▶")
                .setStyle(ButtonStyle.Secondary)
            );
          }

          if (row.components.length > 0) {
            await interaction.update({ embeds: [embed], components: [row] });
          } else {
            await interaction.update({ embeds: [embed], components: [] });
          }
        } catch (error: any) {
          if (error.code === 10062 || error.code === 40060) {
            // Interaction expired
          } else {
            console.error("Snippet list pagination error:", error);
          }
        }
        return;
      }
      // Silently ignore unhandled button interactions (e.g., Discord's native attachment buttons)
      return;
    } else if (interaction.isModalSubmit()) {
      // Handle config modmail embed modal
      if (interaction.customId.startsWith("config_modmail_modal_")) {
        if (!await safeDeferReply(interaction)) return;

        const title = interaction.fields.getTextInputValue("embed_title");
        const description = interaction.fields.getTextInputValue("embed_description");

        await storage.upsertGuildConfig({
          guildId: interaction.guildId!,
          modmailEmbedTitle: title,
          modmailEmbedDescription: description,
        });

        // Re-fetch config to get the latest message ID (may have been set by /edit_embed)
        const config = await storage.getGuildConfig(interaction.guildId!);

        // Try to update the existing message in real time
        let updatedInRealTime = false;
        if (config?.modmailEmbedMessageId && config?.modmailEmbedChannelId) {
          try {
            console.log(`[edit_embed] Trying to update message ${config.modmailEmbedMessageId} in channel ${config.modmailEmbedChannelId}`);
            const channel = await client.channels.fetch(config.modmailEmbedChannelId);
            if (channel && "messages" in channel) {
              const message = await channel.messages.fetch(config.modmailEmbedMessageId);
              if (message) {
                const newEmbed = EmbedBuilder.from(message.embeds[0] || new EmbedBuilder())
                  .setTitle(title)
                  .setDescription(description);
                await message.edit({ embeds: [newEmbed] });
                updatedInRealTime = true;
                console.log(`[edit_embed] Successfully updated message`);
              }
            }
          } catch (e) {
            console.log("Could not update modmail embed in real time:", e);
          }
        } else {
          console.log(`[edit_embed] No message ID saved. messageId=${config?.modmailEmbedMessageId}, channelId=${config?.modmailEmbedChannelId}`);
        }

        if (updatedInRealTime) {
          await interaction.editReply({
            content: `✅ Modmail embed updated in real time!\n• **Title:** ${title}\n• **Description:**\n${description}`,
          });
        } else {
          await interaction.editReply({
            content: `✅ Modmail embed saved!\n• **Title:** ${title}\n• **Description:**\n${description}\n\n⚠️ Run \`/setup_modmail\` again to post the updated embed.`,
          });
        }
        return;
      }

      // Handle config appeal embed modal
      if (interaction.customId.startsWith("config_appeal_modal_")) {
        if (!await safeDeferReply(interaction)) return;

        const title = interaction.fields.getTextInputValue("embed_title");
        const description = interaction.fields.getTextInputValue("embed_description");

        await storage.upsertGuildConfig({
          guildId: interaction.guildId!,
          appealEmbedTitle: title,
          appealEmbedDescription: description,
        });

        await interaction.editReply({
          content: `✅ Appeal embed updated!\n• **Title:** ${title}\n• **Description:**\n${description}\n\nRun \`/setup_appeal\` again to post the updated embed.`,
        });
        return;
      }

      // Handle config staff intro embed modal
      if (interaction.customId.startsWith("config_staffintro_modal_")) {
        if (!await safeDeferReply(interaction)) return;

        const title = interaction.fields.getTextInputValue("embed_title");
        const description = interaction.fields.getTextInputValue("embed_description");

        await storage.upsertGuildConfig({
          guildId: interaction.guildId!,
          staffIntroEmbedTitle: title,
          staffIntroEmbedDescription: description,
        });

        await interaction.editReply({
          content: `✅ Staff Intro embed updated!\n• **Title:** ${title}\n• **Description:**\n${description}\n\nRun \`/setup_intro\` again to post the updated embed.`,
        });
        return;
      }

      // Handle config inactivity embed modal
      if (interaction.customId.startsWith("config_inactivity_modal_")) {
        if (!await safeDeferReply(interaction)) return;

        const title = interaction.fields.getTextInputValue("embed_title");
        const description = interaction.fields.getTextInputValue("embed_description");

        await storage.upsertGuildConfig({
          guildId: interaction.guildId!,
          inactivityEmbedTitle: title,
          inactivityEmbedDescription: description,
        });

        await interaction.editReply({
          content: `✅ Inactivity embed updated!\n• **Title:** ${title}\n• **Description:**\n${description}\n\nRun \`/setup_inactivity\` again to post the updated embed.`,
        });
        return;
      }

      // Handle custom category modals
      if (interaction.customId.startsWith("ticket_custom_modal::")) {
        if (!await safeDeferReply(interaction)) return;

        // Decode base64 encoded data
        const encodedData = interaction.customId.replace("ticket_custom_modal::", "");
        let ticketCategory: string;
        let guildId: string;
        try {
          const decoded = JSON.parse(Buffer.from(encodedData, 'base64').toString('utf8'));
          ticketCategory = decoded.categoryId;
          guildId = decoded.guildId;
        } catch (e) {
          await interaction.editReply({ content: "❌ Invalid ticket data. Please try again." });
          return;
        }
        const user = interaction.user;
        const guild = interaction.guild;

        if (!guild) {
          await interaction.editReply({ content: "❌ This can only be used in a server." });
          return;
        }

        const config = await storage.getGuildConfig(guildId);
        if (!config?.modmailCategoryId) {
          await interaction.editReply({ content: "❌ Modmail is not configured for this server." });
          return;
        }

        // Check if user is blocked
        const block = await storage.getActiveModmailBlock(guildId, user.id);
        if (block) {
          const expiresText = block.expiresAt 
            ? `Your block expires <t:${Math.floor(block.expiresAt.getTime() / 1000)}:R>.`
            : "You are permanently blocked.";
          await interaction.editReply({ content: `❌ You are blocked from opening tickets. ${expiresText}` });
          return;
        }

        // Check for existing open thread
        const existingThread = await storage.getOpenModmailThread(guildId, user.id);
        if (existingThread) {
          await interaction.editReply({ content: "❌ You already have an open ticket. Please wait for staff to respond or close your existing ticket." });
          return;
        }

        // Get custom category info
        let customCategories: { id: string; label: string; description: string; emoji?: string; modalQuestions?: string[] }[] = [];
        if (config.customModmailCategories) {
          try {
            customCategories = JSON.parse(config.customModmailCategories);
          } catch (e) {}
        }
        const category = customCategories.find(c => c.id === ticketCategory);
        const categoryLabel = category?.label || ticketCategory;
        const modalQuestions = category?.modalQuestions || [];

        // Get answers from modal
        const applicationFields: { name: string; value: string }[] = [];
        for (let i = 0; i < modalQuestions.length; i++) {
          try {
            const answer = interaction.fields.getTextInputValue(`answer${i + 1}`);
            applicationFields.push({ name: modalQuestions[i], value: answer });
          } catch (e) {}
        }

        // Create thread and channel
        const thread = await storage.createModmailThread({
          guildId,
          userId: user.id,
          status: "open",
          category: ticketCategory,
        });

        try {
          const channelName = user.username.toLowerCase().replace(/[^a-z0-9-_]/g, "").slice(0, 32) || "ticket";
          const newChannel = await guild.channels.create({
            name: channelName,
            parent: config.modmailCategoryId!,
            topic: `${categoryLabel} ticket from ${user.tag} (${user.id})`,
          });

          await storage.updateModmailThread(thread.id, { channelId: newChannel.id });

          // Get staff roles to ping
          const pingRoles = config.modmailStaffRoleIds || [];
          const staffRoleMentions = pingRoles?.map(id => `<@&${id}>`).join(" ") || "";

          // Get user's roles from the guild
          let userRoles = "None";
          try {
            const member = await guild.members.fetch(user.id);
            const roles = member.roles.cache
              .filter(r => r.id !== guild.id)
              .sort((a, b) => b.position - a.position)
              .map(r => `<@&${r.id}>`)
              .slice(0, 15);
            userRoles = roles.length > 0 ? roles.join(", ") : "None";
          } catch (e) {}

          // Create initial embed with application info
          const initialEmbed = new EmbedBuilder()
            .setTitle(`New Ticket: ${categoryLabel}`)
            .setColor(0x5865f2)
            .setDescription(`**Roles:** ${userRoles}`)
            .addFields(
              { name: "User", value: `<@${user.id}> (${user.tag})`, inline: true },
              { name: "Category", value: categoryLabel, inline: true },
              ...applicationFields
            )
            .setThumbnail(user.displayAvatarURL())
            .setTimestamp();

          const controlRow = new ActionRowBuilder<ButtonBuilder>().addComponents(
            new ButtonBuilder()
              .setCustomId(`modmail_claim_${thread.id}`)
              .setLabel("Claim")
              .setStyle(ButtonStyle.Primary)
              .setEmoji("🙋")
          );

          await newChannel.send({ content: staffRoleMentions, embeds: [initialEmbed], components: [controlRow] });

          // DM user confirmation
          try {
            const dmEmbed = new EmbedBuilder()
              .setTitle("Ticket Created")
              .setDescription(`Your **${categoryLabel}** ticket has been created. A staff member will respond shortly.\n\nReply to this DM to send messages to staff.`)
              .setColor(0x57f287)
              .setTimestamp();
            await user.send({ embeds: [dmEmbed] });
          } catch (e) {}

          await interaction.editReply({ content: `✅ Your **${categoryLabel}** ticket has been created! Check your DMs.` });

          // Log ticket creation
          if (config.modmailLogChannelId) {
            try {
              const logChannel = await client.channels.fetch(config.modmailLogChannelId);
              if (logChannel && "send" in logChannel) {
                const logEmbed = new EmbedBuilder()
                  .setTitle("📥 Ticket Opened")
                  .setColor(0x57f287)
                  .addFields(
                    { name: "User", value: `<@${user.id}> (${user.tag})`, inline: true },
                    { name: "Category", value: categoryLabel, inline: true },
                    { name: "Channel", value: `<#${newChannel.id}>`, inline: true }
                  )
                  .setTimestamp();
                await logChannel.send({ embeds: [logEmbed] });
              }
            } catch (e) {}
          }

        } catch (error) {
          console.log("Could not create ticket channel:", error);
          await interaction.editReply({ content: "❌ Failed to create ticket. Please try again." });
        }
        return;
      }

      // Handle ticket application modals
      if (interaction.customId.startsWith("ticket_modal_")) {
        if (!await safeDeferReply(interaction)) return;

        const parts = interaction.customId.split("_");
        const ticketCategory = parts[2]; // competitive, contentcreator, or gfx
        const guildId = parts[3];
        const user = interaction.user;
        const guild = interaction.guild;

        if (!guild) {
          await interaction.editReply({ content: "❌ This can only be used in a server." });
          return;
        }

        const config = await storage.getGuildConfig(guildId);
        if (!config?.modmailCategoryId) {
          await interaction.editReply({ content: "❌ Modmail is not configured for this server." });
          return;
        }

        // Check for existing open thread
        const existingThread = await storage.getOpenModmailThread(guildId, user.id);
        if (existingThread) {
          await interaction.editReply({ content: "❌ You already have an open ticket. Please wait for staff to respond or close your existing ticket." });
          return;
        }

        // Build category labels from custom categories in config
        const modalConfig = await storage.getGuildConfig(guildId);
        const modalCats: { id: string; label: string; description: string; emoji?: string }[] = [];
        if (modalConfig?.customModmailCategories) {
          try {
            const parsed = JSON.parse(modalConfig.customModmailCategories);
            modalCats.push(...parsed);
          } catch (e) {}
        }
        const formCategoryLabels: { [key: string]: string } = {};
        for (const cat of modalCats) {
          formCategoryLabels[cat.id] = cat.label;
        }
        const categoryLabel = formCategoryLabels[ticketCategory] || ticketCategory;

        // Get form data based on category
        let applicationFields: { name: string; value: string }[] = [];
        if (ticketCategory === "competitive") {
          const tracker = interaction.fields.getTextInputValue("fortnite_tracker");
          const reason = interaction.fields.getTextInputValue("apply_reason");
          applicationFields = [
            { name: "Fortnite Tracker", value: tracker },
            { name: "Why They Want To Apply", value: reason },
          ];
        } else if (ticketCategory === "contentcreator") {
          const followers = interaction.fields.getTextInputValue("followers_count");
          const reason = interaction.fields.getTextInputValue("apply_reason");
          applicationFields = [
            { name: "Follower Count", value: followers },
            { name: "Why They Would Be A Good Fit", value: reason },
          ];
        } else if (ticketCategory === "gfx") {
          const reason = interaction.fields.getTextInputValue("apply_reason");
          applicationFields = [
            { name: "Why They're A Good GFX Editor", value: reason },
          ];
        } else if (ticketCategory === "creativewarrior") {
          const clips = interaction.fields.getTextInputValue("creative_clips");
          const earnings = interaction.fields.getTextInputValue("creative_earnings");
          applicationFields = [
            { name: "Can Provide 2-5 Clips in Creative", value: clips },
            { name: "Has Made Earnings in Creative", value: earnings },
          ];
        } else if (ticketCategory === "vfxeditor") {
          const reason = interaction.fields.getTextInputValue("apply_reason");
          applicationFields = [
            { name: "Why They're A Good VFX Editor", value: reason },
          ];
        }

        // Create thread and channel
        const thread = await storage.createModmailThread({
          guildId,
          userId: user.id,
          status: "open",
          category: ticketCategory,
        });

        try {
          const channelName = user.username.toLowerCase().replace(/[^a-z0-9-_]/g, "").slice(0, 32) || "ticket";
          const newChannel = await guild.channels.create({
            name: channelName,
            parent: config.modmailCategoryId!,
            topic: `${categoryLabel} ticket from ${user.tag} (${user.id})`,
          });

          await storage.updateModmailThread(thread.id, { channelId: newChannel.id });

          // Get category-specific ping roles or fall back to general staff roles
          const categoryPingMap: { [key: string]: string[] | null | undefined } = {
            competitive: config.categoryPingCompetitive,
            contentcreator: config.categoryPingContentcreator,
            gfx: config.categoryPingGfx,
            creativewarrior: config.categoryPingCreativewarrior,
            vfxeditor: config.categoryPingVfxeditor,
          };
          const pingRoles = categoryPingMap[ticketCategory] || config.modmailStaffRoleIds || [];
          const staffRoleMentions = pingRoles?.map(id => `<@&${id}>`).join(" ") || "";

          // Get user's roles from the guild
          let userRoles = "None";
          try {
            const member = await guild.members.fetch(user.id);
            const roles = member.roles.cache
              .filter(r => r.id !== guild.id)
              .sort((a, b) => b.position - a.position)
              .map(r => `<@&${r.id}>`)
              .slice(0, 15);
            userRoles = roles.length > 0 ? roles.join(", ") : "None";
          } catch (e) {}

          // Create initial embed with application info
          const initialEmbed = new EmbedBuilder()
            .setTitle(`New Application: ${categoryLabel}`)
            .setColor(0x5865f2)
            .setDescription(`**Roles:** ${userRoles}`)
            .addFields(
              { name: "User", value: `<@${user.id}> (${user.tag})`, inline: true },
              { name: "Category", value: categoryLabel, inline: true },
              ...applicationFields
            )
            .setThumbnail(user.displayAvatarURL())
            .setTimestamp();

          const controlRow = new ActionRowBuilder<ButtonBuilder>().addComponents(
            new ButtonBuilder()
              .setCustomId(`modmail_claim_${thread.id}`)
              .setLabel("Claim")
              .setStyle(ButtonStyle.Primary)
              .setEmoji("🙋")
          );

          await newChannel.send({ content: staffRoleMentions, embeds: [initialEmbed], components: [controlRow] });

          // DM user confirmation
          try {
            const dmEmbed = new EmbedBuilder()
              .setTitle("Application Submitted")
              .setDescription(`Your **${categoryLabel}** application has been submitted. A staff member will review it and respond shortly.\n\nReply to this DM to send messages to staff.`)
              .setColor(0x57f287)
              .setTimestamp();
            await user.send({ embeds: [dmEmbed] });
          } catch (e) {
            // console.log("Could not DM user about application submission");
          }

          await interaction.editReply({ content: `✅ Your **${categoryLabel}** application has been submitted! Check your DMs.` });
        } catch (error) {
          console.log("Could not create ticket channel:", error);
          await interaction.editReply({ content: "❌ Failed to submit application. Please try again." });
        }
        return;
      }

      // Handle DM ticket application modals
      if (interaction.customId.startsWith("dm_ticket_modal_")) {
        if (!await safeDeferReply(interaction)) return;

        const parts = interaction.customId.split("_");
        const ticketCategory = parts[3]; // competitive, contentcreator, or gfx
        const guildId = parts[4];
        const user = interaction.user;

        const guild = client.guilds.cache.get(guildId);
        if (!guild) {
          await interaction.editReply({ content: "❌ Could not find the server." });
          return;
        }

        const config = await storage.getGuildConfig(guildId);
        if (!config?.modmailCategoryId) {
          await interaction.editReply({ content: "❌ Modmail is not configured for this server." });
          return;
        }

        // Check if user is blocked
        const block = await storage.getActiveModmailBlock(guildId, user.id);
        if (block) {
          const expiresText = block.expiresAt 
            ? `Your block expires <t:${Math.floor(block.expiresAt.getTime() / 1000)}:R>.`
            : "You are permanently blocked.";
          await interaction.editReply({ content: `❌ You are blocked from opening tickets. ${expiresText}` });
          return;
        }

        // Check for existing open thread
        const existingThread = await storage.getOpenModmailThread(guildId, user.id);
        if (existingThread) {
          await interaction.editReply({ content: "❌ You already have an open ticket. Please wait for staff to respond or close your existing ticket." });
          return;
        }

        // Build category labels from custom categories in config
        const dmModalConfig = await storage.getGuildConfig(guildId);
        const dmModalCats: { id: string; label: string; description: string; emoji?: string }[] = [];
        if (dmModalConfig?.customModmailCategories) {
          try {
            const parsed = JSON.parse(dmModalConfig.customModmailCategories);
            dmModalCats.push(...parsed);
          } catch (e) {}
        }
        const dmFormCategoryLabels: { [key: string]: string } = {};
        for (const cat of dmModalCats) {
          dmFormCategoryLabels[cat.id] = cat.label;
        }
        const categoryLabel = dmFormCategoryLabels[ticketCategory] || ticketCategory;

        // Get form data based on category
        let applicationFields: { name: string; value: string }[] = [];
        if (ticketCategory === "competitive") {
          const tracker = interaction.fields.getTextInputValue("fortnite_tracker");
          const reason = interaction.fields.getTextInputValue("apply_reason");
          applicationFields = [
            { name: "Game Tracker", value: tracker },
            { name: "Why They Want To Apply", value: reason },
          ];
        } else if (ticketCategory === "contentcreator") {
          const followers = interaction.fields.getTextInputValue("followers_count");
          const reason = interaction.fields.getTextInputValue("apply_reason");
          applicationFields = [
            { name: "Follower Count", value: followers },
            { name: "Why They Would Be A Good Fit", value: reason },
          ];
        } else if (ticketCategory === "gfx") {
          const reason = interaction.fields.getTextInputValue("apply_reason");
          applicationFields = [
            { name: "Why They're A Good GFX Editor", value: reason },
          ];
        } else if (ticketCategory === "creativewarrior") {
          const clips = interaction.fields.getTextInputValue("creative_clips");
          const earnings = interaction.fields.getTextInputValue("creative_earnings");
          applicationFields = [
            { name: "Can Provide 2-5 Clips in Creative", value: clips },
            { name: "Has Made Earnings in Creative", value: earnings },
          ];
        } else if (ticketCategory === "vfxeditor") {
          const reason = interaction.fields.getTextInputValue("apply_reason");
          applicationFields = [
            { name: "Why They're A Good VFX Editor", value: reason },
          ];
        }

        // Create thread and channel
        const thread = await storage.createModmailThread({
          guildId,
          userId: user.id,
          status: "open",
          category: ticketCategory,
        });

        try {
          const channelName = user.username.toLowerCase().replace(/[^a-z0-9-_]/g, "").slice(0, 32) || "ticket";
          const newChannel = await guild.channels.create({
            name: channelName,
            parent: config.modmailCategoryId!,
            topic: `${categoryLabel} ticket from ${user.tag} (${user.id})`,
          });

          await storage.updateModmailThread(thread.id, { channelId: newChannel.id });

          // Get category-specific ping roles
          const categoryPingMap: { [key: string]: string[] | null | undefined } = {
            competitive: config.categoryPingCompetitive,
            contentcreator: config.categoryPingContentcreator,
            gfx: config.categoryPingGfx,
            creativewarrior: config.categoryPingCreativewarrior,
            vfxeditor: config.categoryPingVfxeditor,
          };
          const pingRoles = categoryPingMap[ticketCategory] || config.modmailStaffRoleIds || [];
          const staffRoleMentions = pingRoles?.map(id => `<@&${id}>`).join(" ") || "";

          // Get user's roles from the guild
          let userRoles = "None";
          try {
            const member = await guild.members.fetch(user.id);
            const roles = member.roles.cache
              .filter(r => r.id !== guild.id)
              .sort((a, b) => b.position - a.position)
              .map(r => `<@&${r.id}>`)
              .slice(0, 15);
            userRoles = roles.length > 0 ? roles.join(", ") : "None";
          } catch (e) {}

          const initialEmbed = new EmbedBuilder()
            .setTitle(`New Application: ${categoryLabel}`)
            .setDescription(`**Submitted via DM**\n\n**Roles:** ${userRoles}`)
            .setColor(0x5865f2)
            .addFields(
              { name: "User", value: `<@${user.id}> (${user.tag})`, inline: true },
              { name: "Category", value: categoryLabel, inline: true },
              ...applicationFields
            )
            .setThumbnail(user.displayAvatarURL())
            .setTimestamp();

          const controlRow = new ActionRowBuilder<ButtonBuilder>().addComponents(
            new ButtonBuilder()
              .setCustomId(`modmail_claim_${thread.id}`)
              .setLabel("Claim")
              .setStyle(ButtonStyle.Primary)
              .setEmoji("🙋")
          );

          await newChannel.send({ content: staffRoleMentions, embeds: [initialEmbed], components: [controlRow] });

          await interaction.editReply({ content: `✅ Your **${categoryLabel}** application has been submitted to **${guild.name}**! Staff will respond shortly. Reply to this DM to communicate with them.` });
        } catch (error) {
          console.log("Could not create ticket channel from DM modal:", error);
          await interaction.editReply({ content: "❌ Failed to submit application. Please try again." });
        }
        return;
      } else if (interaction.customId === "payout_modal") {
        // Defer reply immediately to prevent timeout
        try {
          if (!await safeDeferReply(interaction)) return;
        } catch (error: any) {
          if (error.code === 10062 || error.code === 40060) {
            console.log('Modal interaction expired:', interaction.id);
            return;
          }
          throw error;
        }

        const userId = interaction.fields.getTextInputValue("user_id").trim();
        const reason = interaction.fields.getTextInputValue("reason");
        const moneyOwed = interaction.fields.getTextInputValue("money_owed");
        const paypal = interaction.fields.getTextInputValue("paypal");

        if (!/^\d{17,19}$/.test(userId)) {
          await interaction.editReply({
            content: "❌ Invalid User ID. Please enter a valid Discord User ID (17-19 digit number).",
          });
          return;
        }

        try {
          await client.users.fetch(userId);
        } catch {
          await interaction.editReply({
            content: "❌ Could not find a Discord user with that ID. Please check the ID and try again.",
          });
          return;
        }

        await interaction.editReply({
          content: "Your payout request has been submitted!",
        });

        const config = await storage.getGuildConfig(interaction.guildId!);
        if (!config?.requestChannelId) {
          await interaction.editReply({
            content: "⚠️  Request channel not configured. Please ask an admin to run `/setup_pay_request`.",
          });
          return;
        }

        const requestChannel = await client.channels.fetch(config.requestChannelId);
        if (!requestChannel || !("send" in requestChannel)) return;

        const payoutRequest = await storage.createPayoutRequest({
          guildId: interaction.guildId!,
          userId,
          requestedById: interaction.user.id,
          reason,
          moneyOwed,
          email: paypal,
          status: "pending",
        });

        const requestId = payoutRequest.id;
        const embed = new EmbedBuilder()
          .setTitle("Payout Request")
          .setColor(0xf0b232)
          .addFields(
            { name: "User ID", value: `${userId} (<@${userId}>)`, inline: true },
            { name: "Requested by", value: `<@${interaction.user.id}>`, inline: true },
            { name: "Status", value: "⏳ Pending", inline: true },
            { name: "Reason", value: reason, inline: false },
            { name: "Money Owed", value: `$${moneyOwed}`, inline: false },
            { name: "Paypal", value: paypal, inline: false }
          )
          .setFooter({ text: `Request ID: ${requestId}` })
          .setTimestamp();

        const row = new ActionRowBuilder<ButtonBuilder>().addComponents(
          new ButtonBuilder()
            .setCustomId(`approve_${requestId}`)
            .setLabel("Approve")
            .setStyle(ButtonStyle.Success),
          new ButtonBuilder()
            .setCustomId(`deny_${requestId}`)
            .setLabel("Deny")
            .setStyle(ButtonStyle.Danger)
        );

        const sentMessage = await requestChannel.send({
          embeds: [embed],
          components: [row],
        });

        await storage.updatePayoutMessageId(requestId, sentMessage.id);
      } else if (interaction.customId.startsWith("action_reason_")) {
        // Defer reply immediately to prevent timeout
        try {
          if (!await safeDeferReply(interaction)) return;
        } catch (error: any) {
          if (error.code === 10062 || error.code === 40060) {
            console.log('Modal interaction expired:', interaction.id);
            return;
          }
          throw error;
        }

        const parts = interaction.customId.split("_");
        const action = parts[2];
        const requestId = parts[3];
        const actionReason = interaction.fields.getTextInputValue("action_reason") || undefined;

        // Check permissions
        const member = interaction.member;
        const memberRoles = member && 'roles' in member 
          ? (Array.isArray(member.roles) ? member.roles : Array.from(member.roles.cache.keys()))
          : undefined;
        const memberPermissions = member && 'permissions' in member 
          ? (typeof member.permissions === 'string' ? member.permissions : member.permissions?.bitfield)
          : undefined;

        const hasPermission = await hasPayoutPermission(memberRoles, memberPermissions, interaction.guildId!);
        if (!hasPermission) {
          await interaction.editReply({
            content: "❌ You don't have permission to approve or deny payout requests.",
          });
          return;
        }

        const message = interaction.message;
        if (!message || !message.embeds[0]) return;

        const originalEmbed = message.embeds[0];
        const fields = originalEmbed.fields;

        const userIdField = fields.find(f => f.name === "User ID")?.value || "Unknown";
        const userId = userIdField.replace(/<@|>/g, '').split(' ')[0];
        const requestedByField = fields.find(f => f.name === "Requested by")?.value || "Unknown";
        const requestedById = requestedByField.replace(/<@|>/g, '');
        const reason = fields.find(f => f.name === "Reason")?.value || "No reason provided";
        const moneyOwedField = fields.find(f => f.name === "Money Owed")?.value || "$0.00";
        const moneyOwed = moneyOwedField.replace('$', '');
        const paypal = fields.find(f => f.name === "Paypal")?.value || "Not provided";

        const status = action === "approve" ? "✅ Approved" : "❌ Denied";
        const color = action === "approve" ? 0x23a559 : 0xda373c;

        await storage.updatePayoutStatus(requestId, action === "approve" ? "approved" : "denied", interaction.user.id);

        const updatedFields: any[] = [
          { name: "User ID", value: userIdField, inline: true },
          { name: "Requested by", value: requestedByField, inline: true },
          { name: "Status", value: status, inline: true },
          { name: "Reason", value: reason, inline: false },
          { name: "Money Owed", value: moneyOwedField, inline: false },
          { name: "Paypal", value: paypal, inline: false }
        ];

        if (actionReason) {
          updatedFields.push({ name: action === "approve" ? "Approval Note" : "Denial Reason", value: actionReason, inline: false });
        }

        updatedFields.push({ name: "Actioned by", value: `<@${interaction.user.id}>`, inline: false });

        const updatedEmbed = new EmbedBuilder()
          .setTitle("Payout Request")
          .setColor(color)
          .addFields(updatedFields)
          .setFooter({ text: `Request ID: ${requestId}` })
          .setTimestamp();

        // Update message and reply immediately
        await Promise.all([
          message.edit({ embeds: [updatedEmbed], components: [] }),
          interaction.editReply({ content: `Request ${action === "approve" ? "approved" : "denied"} successfully.` })
        ]);

        // Background: Send DMs and log
        const dmStatus = action === "approve" ? "approved" : "denied";
        const guildId = interaction.guildId!;

        (async () => {
          try {
            await Promise.all([
              sendDMToUser(userId, dmStatus, reason, moneyOwed, paypal, actionReason),
              sendDMToStaff(requestedById, dmStatus, userId, moneyOwed, paypal, actionReason)
            ]);
          } catch (e) {
            console.log("Could not send payout DMs:", e);
          }

          try {
            const config = await storage.getGuildConfig(guildId);
            if (config?.logChannelId) {
              const logChannel = await client.channels.fetch(config.logChannelId);
              if (logChannel && "send" in logChannel) {
                const logTitle = action === "approve" ? "Payment Logged" : "Payment Denied";
                const logDescription = action === "approve" 
                  ? `Payment successfully processed for User ID: ${userId} (<@${userId}>)`
                  : `Payment request denied for User ID: ${userId} (<@${userId}>)`;
                const logColor = action === "approve" ? 0x23a559 : 0xda373c;

                const logFields: any[] = [
                  { name: "Amount", value: moneyOwedField, inline: true },
                  { name: "Recipient", value: paypal, inline: true }
                ];

                if (actionReason) {
                  logFields.push({ name: action === "approve" ? "Note" : "Denial Reason", value: actionReason, inline: false });
                }

                const logEmbed = new EmbedBuilder()
                  .setTitle(logTitle)
                  .setDescription(logDescription)
                  .setColor(logColor)
                  .addFields(logFields)
                  .setTimestamp();

                await logChannel.send({ embeds: [logEmbed] });
              }
            }
          } catch (e) {
            console.log("Could not send payout log:", e);
          }
        })().catch(e => console.log("[PAYOUT] Background task error:", e));
      } else if (interaction.customId === "ban_request_modal") {
        try {
          if (!await safeDeferReply(interaction)) return;
        } catch (error: any) {
          if (error.code === 10062 || error.code === 40060) return;
          throw error;
        }

        const userId = interaction.fields.getTextInputValue("user_id").trim();
        const reason = interaction.fields.getTextInputValue("reason");

        if (!/^\d{17,19}$/.test(userId)) {
          await interaction.editReply({
            content: "Invalid User ID. Please enter a valid Discord User ID (17-19 digit number).",
          });
          return;
        }

        let targetUser;
        try {
          targetUser = await client.users.fetch(userId);
        } catch {
          await interaction.editReply({
            content: "Could not find a Discord user with that ID. Please check the ID and try again.",
          });
          return;
        }

        const config = await storage.getGuildConfig(interaction.guildId!);
        if (!config?.banChannelId) {
          await interaction.editReply({
            content: "Ban request channel not configured. Please ask an admin to run `/setup_ban`.",
          });
          return;
        }

        const banRequest = await storage.createBanRequest({
          guildId: interaction.guildId!,
          targetUserId: userId,
          requestedById: interaction.user.id,
          reason,
          status: "pending",
        });

        const requestChannel = await client.channels.fetch(config.banChannelId);
        if (!requestChannel || !("send" in requestChannel)) return;

        const embed = new EmbedBuilder()
          .setTitle("🚫 Ban Request")
          .setColor(0xed4245)
          .addFields(
            { name: "User ID", value: `<@${userId}>\n(${userId})`, inline: true },
            { name: "Moderator", value: "Pending", inline: true },
            { name: "Status", value: "⏳ Pending", inline: true },
            { name: "Requested by", value: `<@${interaction.user.id}>`, inline: false },
            { name: "Ban Reason", value: reason, inline: false }
          )
          .setFooter({ text: `Pending Review • Request ID: ${banRequest.id} • Today at ${new Date().toLocaleTimeString()}` })
          .setTimestamp();

        const row = new ActionRowBuilder<ButtonBuilder>().addComponents(
          new ButtonBuilder()
            .setCustomId(`ban_approve_${banRequest.id}`)
            .setLabel("Approve")
            .setStyle(ButtonStyle.Success)
            .setEmoji("✅"),
          new ButtonBuilder()
            .setCustomId(`ban_deny_${banRequest.id}`)
            .setLabel("Deny")
            .setStyle(ButtonStyle.Danger)
            .setEmoji("❌")
        );

        const sentMessage = await requestChannel.send({ embeds: [embed], components: [row] });
        await storage.updateBanRequest(banRequest.id, { messageId: sentMessage.id });

        await interaction.editReply({
          content: "Your ban request has been submitted!",
        });
      } else if (interaction.customId === "unban_request_modal") {
        try {
          if (!await safeDeferReply(interaction)) return;
        } catch (error: any) {
          if (error.code === 10062 || error.code === 40060) return;
          throw error;
        }

        const userId = interaction.fields.getTextInputValue("user_id").trim();
        const reason = interaction.fields.getTextInputValue("reason");

        if (!/^\d{17,19}$/.test(userId)) {
          await interaction.editReply({
            content: "Invalid User ID. Please enter a valid Discord User ID (17-19 digit number).",
          });
          return;
        }

        const config = await storage.getGuildConfig(interaction.guildId!);
        if (!config?.unbanChannelId) {
          await interaction.editReply({
            content: "Unban request channel not configured. Please ask an admin to run `/setup_unban`.",
          });
          return;
        }

        const unbanRequest = await storage.createUnbanRequest({
          guildId: interaction.guildId!,
          targetUserId: userId,
          requestedById: interaction.user.id,
          reason,
          status: "pending",
        });

        const requestChannel = await client.channels.fetch(config.unbanChannelId);
        if (!requestChannel || !("send" in requestChannel)) return;

        const embed = new EmbedBuilder()
          .setTitle("🔓 Unban Request")
          .setColor(0x57f287)
          .addFields(
            { name: "User ID", value: `<@${userId}>\n(${userId})`, inline: true },
            { name: "Moderator", value: "Pending", inline: true },
            { name: "Status", value: "⏳ Pending", inline: true },
            { name: "Requested by", value: `<@${interaction.user.id}>`, inline: false },
            { name: "Unban Reason", value: reason, inline: false }
          )
          .setFooter({ text: `Pending Review • Request ID: ${unbanRequest.id} • Today at ${new Date().toLocaleTimeString()}` })
          .setTimestamp();

        const row = new ActionRowBuilder<ButtonBuilder>().addComponents(
          new ButtonBuilder()
            .setCustomId(`unban_approve_${unbanRequest.id}`)
            .setLabel("Approve")
            .setStyle(ButtonStyle.Success)
            .setEmoji("✅"),
          new ButtonBuilder()
            .setCustomId(`unban_deny_${unbanRequest.id}`)
            .setLabel("Deny")
            .setStyle(ButtonStyle.Danger)
            .setEmoji("❌")
        );

        const sentMessage = await requestChannel.send({ embeds: [embed], components: [row] });
        await storage.updateUnbanRequest(unbanRequest.id, { messageId: sentMessage.id });

        await interaction.editReply({
          content: "Your unban request has been submitted!",
        });
      } else if (interaction.customId.startsWith("ban_action_")) {
        try {
          if (!await safeDeferReply(interaction)) return;
        } catch (error: any) {
          if (error.code === 10062 || error.code === 40060) return;
          throw error;
        }

        const parts = interaction.customId.split("_");
        const action = parts[2]; // approve or deny
        const requestId = parts.slice(3).join("_");
        const actionReason = interaction.fields.getTextInputValue("action_reason") || "";

        // Check mod permission
        const config = await storage.getGuildConfig(interaction.guildId!);
        const member = interaction.member;
        const memberRoles = member && 'roles' in member 
          ? (Array.isArray(member.roles) ? member.roles : Array.from(member.roles.cache.keys()))
          : [];

        const hasModPermission = config?.modRoleIds?.some(roleId => memberRoles.includes(roleId)) || false;
        const memberPermissions = member && 'permissions' in member 
          ? (typeof member.permissions === 'string' ? member.permissions : member.permissions?.bitfield)
          : undefined;
        const permBits = typeof memberPermissions === 'string' 
          ? BigInt(memberPermissions) 
          : (memberPermissions ?? BigInt(0));
        const ADMINISTRATOR = BigInt(1) << BigInt(3);
        const isAdmin = (permBits & ADMINISTRATOR) === ADMINISTRATOR;

        if (!hasModPermission && !isAdmin) {
          await interaction.editReply({
            content: "You don't have permission to approve or deny ban requests.",
          });
          return;
        }

        const banRequest = await storage.getBanRequest(requestId);
        if (!banRequest) {
          await interaction.editReply({
            content: "Ban request not found.",
          });
          return;
        }

        await storage.updateBanRequest(requestId, {
          status: action === "approve" ? "approved" : "denied",
          reviewedById: interaction.user.id,
          reviewReason: actionReason,
        });

        const message = interaction.message;
        if (message && message.embeds[0]) {
          const status = action === "approve" ? "✅ Approved" : "❌ Denied";
          const color = action === "approve" ? 0x23a559 : 0xda373c;

          const embed = new EmbedBuilder()
            .setTitle("Ban Request")
            .setColor(color)
            .addFields(
              { name: "User ID", value: `<@${banRequest.targetUserId}>\n(${banRequest.targetUserId})`, inline: true },
              { name: "Moderator", value: `<@${interaction.user.id}>`, inline: true },
              { name: "Status", value: status, inline: true },
              { name: "Requested by", value: `<@${banRequest.requestedById}>`, inline: false },
              { name: "Ban Reason", value: banRequest.reason, inline: false }
            )
            .setFooter({ text: `Request ID: ${requestId}` })
            .setTimestamp();

          if (actionReason) {
            embed.addFields({ name: "Review Note", value: actionReason, inline: false });
          }

          await message.edit({ embeds: [embed], components: [] });
        }

        await interaction.editReply({
          content: `Ban request ${action === "approve" ? "approved" : "denied"} successfully.`,
        });

        // Background: Send DMs and log (fire-and-forget)
        const guildName = interaction.guild?.name || "Unknown";
        const reviewerUsername = interaction.user.username;
        const reviewerId = interaction.user.id;

        (async () => {
          // Send DMs in parallel
          await Promise.all([
            (async () => {
              try {
                const requester = await client.users.fetch(banRequest.requestedById);
                const dmEmbed = new EmbedBuilder()
                  .setTitle(`Ban Request ${action === "approve" ? "Approved" : "Denied"}`)
                  .setDescription(`Your ban request has been **${action === "approve" ? "approved" : "denied"}**.`)
                  .setColor(action === "approve" ? 0x23a559 : 0xda373c)
                  .addFields(
                    { name: "Reviewed by", value: reviewerUsername, inline: true },
                    { name: "Server", value: guildName, inline: true },
                    { name: "Reason", value: actionReason || "No reason provided", inline: false }
                  )
                  .setTimestamp();
                await requester.send({ embeds: [dmEmbed] });
              } catch (e) { console.log("[BAN] Failed to DM requester:", e); }
            })(),
            (async () => {
              try {
                const targetUser = await client.users.fetch(banRequest.targetUserId);
                const targetDmEmbed = new EmbedBuilder()
                  .setTitle(`Ban Request ${action === "approve" ? "Approved" : "Denied"}`)
                  .setDescription(`A ban request regarding you has been **${action === "approve" ? "approved" : "denied"}**.`)
                  .setColor(action === "approve" ? 0xda373c : 0x23a559)
                  .addFields(
                    { name: "Server", value: guildName, inline: true },
                    { name: "Reason", value: actionReason || "No reason provided", inline: false }
                  )
                  .setTimestamp();
                await targetUser.send({ embeds: [targetDmEmbed] });
              } catch (e) { console.log("[BAN] Failed to DM target user:", e); }
            })()
          ]);

          // Post to log channel
          if (config?.banLogChannelId) {
            try {
              const logChannel = await client.channels.fetch(config.banLogChannelId);
              if (logChannel && "send" in logChannel) {
                const logEmbed = new EmbedBuilder()
                  .setTitle(action === "approve" ? "Ban Request Approved" : "Ban Request Denied")
                  .setDescription(`Ban request for <@${banRequest.targetUserId}> has been ${action === "approve" ? "approved" : "denied"}.`)
                  .setColor(action === "approve" ? 0x23a559 : 0xda373c)
                  .addFields(
                    { name: "Target User", value: `<@${banRequest.targetUserId}>`, inline: true },
                    { name: "Requested by", value: `<@${banRequest.requestedById}>`, inline: true },
                    { name: "Reviewed by", value: `<@${reviewerId}>`, inline: true },
                    { name: "Ban Reason", value: banRequest.reason, inline: false }
                  )
                  .setTimestamp();
                if (actionReason) {
                  logEmbed.addFields({ name: "Review Note", value: actionReason, inline: false });
                }
                await logChannel.send({ embeds: [logEmbed] });
              }
            } catch (e) { console.log("[BAN] Failed to post to log channel:", e); }
          }
        })().catch(e => console.log("[BAN] Background task error:", e));
      } else if (interaction.customId.startsWith("unban_action_")) {
        try {
          if (!await safeDeferReply(interaction)) return;
        } catch (error: any) {
          if (error.code === 10062 || error.code === 40060) return;
          throw error;
        }

        const parts = interaction.customId.split("_");
        const action = parts[2]; // approve or deny
        const requestId = parts.slice(3).join("_");
        const actionReason = interaction.fields.getTextInputValue("action_reason") || "";

        // Check mod permission
        const config = await storage.getGuildConfig(interaction.guildId!);
        const member = interaction.member;
        const memberRoles = member && 'roles' in member 
          ? (Array.isArray(member.roles) ? member.roles : Array.from(member.roles.cache.keys()))
          : [];

        const hasModPermission = config?.modRoleIds?.some(roleId => memberRoles.includes(roleId)) || false;
        const memberPermissions = member && 'permissions' in member 
          ? (typeof member.permissions === 'string' ? member.permissions : member.permissions?.bitfield)
          : undefined;
        const permBits = typeof memberPermissions === 'string' 
          ? BigInt(memberPermissions) 
          : (memberPermissions ?? BigInt(0));
        const ADMINISTRATOR = BigInt(1) << BigInt(3);
        const isAdmin = (permBits & ADMINISTRATOR) === ADMINISTRATOR;

        if (!hasModPermission && !isAdmin) {
          await interaction.editReply({
            content: "You don't have permission to approve or deny unban requests.",
          });
          return;
        }

        const unbanRequest = await storage.getUnbanRequest(requestId);
        if (!unbanRequest) {
          await interaction.editReply({
            content: "Unban request not found.",
          });
          return;
        }

        await storage.updateUnbanRequest(requestId, {
          status: action === "approve" ? "approved" : "denied",
          reviewedById: interaction.user.id,
          reviewReason: actionReason,
        });

        const message = interaction.message;
        if (message && message.embeds[0]) {
          const status = action === "approve" ? "✅ Approved" : "❌ Denied";
          const color = action === "approve" ? 0x23a559 : 0xda373c;

          const embed = new EmbedBuilder()
            .setTitle("Unban Request")
            .setColor(color)
            .addFields(
              { name: "User ID", value: `<@${unbanRequest.targetUserId}>\n(${unbanRequest.targetUserId})`, inline: true },
              { name: "Moderator", value: `<@${interaction.user.id}>`, inline: true },
              { name: "Status", value: status, inline: true },
              { name: "Requested by", value: `<@${unbanRequest.requestedById}>`, inline: false },
              { name: "Unban Reason", value: unbanRequest.reason, inline: false }
            )
            .setFooter({ text: `Request ID: ${requestId}` })
            .setTimestamp();

          if (actionReason) {
            embed.addFields({ name: "Review Note", value: actionReason, inline: false });
          }

          await message.edit({ embeds: [embed], components: [] });
        }

        await interaction.editReply({
          content: `Unban request ${action === "approve" ? "approved" : "denied"} successfully.`,
        });

        // Background: Send DMs and log (fire-and-forget)
        const guildName = interaction.guild?.name || "Unknown";
        const reviewerUsername = interaction.user.username;
        const reviewerId = interaction.user.id;

        (async () => {
          // Send DMs in parallel
          await Promise.all([
            (async () => {
              try {
                const requester = await client.users.fetch(unbanRequest.requestedById);
                const dmEmbed = new EmbedBuilder()
                  .setTitle(`Unban Request ${action === "approve" ? "Approved" : "Denied"}`)
                  .setDescription(`Your unban request has been **${action === "approve" ? "approved" : "denied"}**.`)
                  .setColor(action === "approve" ? 0x23a559 : 0xda373c)
                  .addFields(
                    { name: "Reviewed by", value: reviewerUsername, inline: true },
                    { name: "Server", value: guildName, inline: true },
                    { name: "Reason", value: actionReason || "No reason provided", inline: false }
                  )
                  .setTimestamp();
                await requester.send({ embeds: [dmEmbed] });
              } catch (e: any) { 
                if (e?.code === 10013) {
                  console.log("[UNBAN] Requester not found (deleted account)");
                } else {
                  console.log("[UNBAN] Failed to DM requester");
                }
              }
            })(),
            (async () => {
              try {
                const targetUser = await client.users.fetch(unbanRequest.targetUserId);
                const targetDmEmbed = new EmbedBuilder()
                  .setTitle(`Unban Request ${action === "approve" ? "Approved" : "Denied"}`)
                  .setDescription(`An unban request regarding you has been **${action === "approve" ? "approved" : "denied"}**.`)
                  .setColor(action === "approve" ? 0x23a559 : 0xda373c)
                  .addFields(
                    { name: "Server", value: guildName, inline: true },
                    { name: "Reason", value: actionReason || "No reason provided", inline: false }
                  )
                  .setTimestamp();
                await targetUser.send({ embeds: [targetDmEmbed] });
              } catch (e: any) { 
                if (e?.code === 10013) {
                  console.log("[UNBAN] Target user not found (deleted account)");
                } else {
                  console.log("[UNBAN] Failed to DM target user");
                }
              }
            })()
          ]);

          // Post to log channel
          if (config?.unbanLogChannelId) {
            try {
              const logChannel = await client.channels.fetch(config.unbanLogChannelId);
              if (logChannel && "send" in logChannel) {
                const logEmbed = new EmbedBuilder()
                  .setTitle(action === "approve" ? "Unban Request Approved" : "Unban Request Denied")
                  .setDescription(`Unban request for <@${unbanRequest.targetUserId}> has been ${action === "approve" ? "approved" : "denied"}.`)
                  .setColor(action === "approve" ? 0x23a559 : 0xda373c)
                  .addFields(
                    { name: "Target User", value: `<@${unbanRequest.targetUserId}>`, inline: true },
                    { name: "Requested by", value: `<@${unbanRequest.requestedById}>`, inline: true },
                    { name: "Reviewed by", value: `<@${reviewerId}>`, inline: true },
                    { name: "Unban Reason", value: unbanRequest.reason, inline: false }
                  )
                  .setTimestamp();
                if (actionReason) {
                  logEmbed.addFields({ name: "Review Note", value: actionReason, inline: false });
                }
                await logChannel.send({ embeds: [logEmbed] });
              }
            } catch (e) { console.log("[UNBAN] Failed to post to log channel:", e); }
          }
        })().catch(e => console.log("[UNBAN] Background task error:", e));
      } else if (interaction.customId.startsWith("inactivity_review_")) {
        try {
          if (!await safeDeferReply(interaction)) return;
        } catch (error: any) {
          if (error.code === 10062 || error.code === 40060) {
            console.log('Inactivity review modal expired:', interaction.id);
            return;
          }
          throw error;
        }

        const parts = interaction.customId.split("_");
        const action = parts[2];
        const requestId = parts.slice(3).join("_");
        const isApprove = action === "approve";

        const reviewReason = interaction.fields.getTextInputValue("reason") || undefined;

        const request = await storage.getInactivityRequest(requestId);
        if (!request) {
          await interaction.editReply({ content: "Request not found." });
          return;
        }

        const status = isApprove ? "approved" : "denied";
        await storage.updateInactivityRequest(requestId, {
          status,
          reviewedById: interaction.user.id,
          reviewReason,
        });

        const embed = new EmbedBuilder()
          .setTitle(`Inactivity Request ${isApprove ? "Approved" : "Denied"}`)
          .setColor(isApprove ? 0x57f287 : 0xed4245)
          .setDescription(`**Requested by:** <@${request.userId}>`)
          .addFields(
            { name: "From", value: request.fromDate, inline: true },
            { name: "To", value: request.toDate, inline: true },
            { name: "Reason", value: request.reason, inline: false },
            { name: "Reviewed by", value: `<@${interaction.user.id}>`, inline: false }
          )
          .setTimestamp();

        if (reviewReason) {
          embed.addFields({ name: "Review Reason", value: reviewReason, inline: false });
        }

        // Update the original message
        try {
          if (request.messageId && interaction.channel) {
            const originalMessage = await interaction.channel.messages.fetch(request.messageId);
            await originalMessage.edit({ embeds: [embed], components: [] });
          }
        } catch (error) {
          console.log("Could not update original inactivity message");
        }

        // Post to log channel
        const config = await storage.getGuildConfig(request.guildId);
        if (config?.inactivityLogChannelId) {
          try {
            const logChannel = await client.channels.fetch(config.inactivityLogChannelId);
            if (logChannel && "send" in logChannel) {
              await logChannel.send({ embeds: [embed] });
            }
          } catch (error) {
            console.log("Could not post to inactivity log channel");
          }
        }

        // DM the user
        try {
          const user = await client.users.fetch(request.userId);
          const dmEmbed = new EmbedBuilder()
            .setTitle(`Inactivity Request ${isApprove ? "Approved!" : "Denied"}`)
            .setColor(isApprove ? 0x57f287 : 0xed4245)
            .setDescription(isApprove 
              ? "Your inactivity request has been approved. Enjoy your time off!" 
              : "Unfortunately, your inactivity request was not approved.")
            .addFields(
              { name: "From", value: request.fromDate, inline: true },
              { name: "To", value: request.toDate, inline: true }
            )
            .setTimestamp();

          if (reviewReason) {
            dmEmbed.addFields({ name: "Reason", value: reviewReason, inline: false });
          }

          await user.send({ embeds: [dmEmbed] });
        } catch (error) {
          // console.log("Could not DM user about inactivity decision");
        }

        await interaction.editReply({
          content: `✅ Inactivity request ${isApprove ? "approved" : "denied"} successfully!`,
        });
      } else if (interaction.customId.startsWith("inactivity_submit_")) {
        try {
          if (!await safeDeferReply(interaction)) return;
        } catch (error: any) {
          if (error.code === 10062 || error.code === 40060) {
            console.log('Inactivity submit modal expired:', interaction.id);
            return;
          }
          throw error;
        }

        const guildId = interaction.customId.replace("inactivity_submit_", "");

        const fromDate = interaction.fields.getTextInputValue("from_date");
        const toDate = interaction.fields.getTextInputValue("to_date");
        const reason = interaction.fields.getTextInputValue("reason");

        const config = await storage.getGuildConfig(guildId);
        if (!config?.inactivitySubmissionsChannelId) {
          await interaction.editReply({
            content: "Thank you for your request! However, the submissions channel hasn't been set up yet. Please contact an admin.",
          });
          return;
        }

        const request = await storage.createInactivityRequest({
          guildId,
          userId: interaction.user.id,
          fromDate,
          toDate,
          reason,
          status: "pending",
        });

        try {
          const submissionsChannel = await client.channels.fetch(config.inactivitySubmissionsChannelId);
          if (submissionsChannel && "send" in submissionsChannel) {
            const embed = new EmbedBuilder()
              .setTitle("Inactivity Request")
              .setColor(0xf0b232)
              .setDescription(`**Requested by:** <@${interaction.user.id}>`)
              .addFields(
                { name: "From", value: fromDate, inline: true },
                { name: "To", value: toDate, inline: true },
                { name: "Reason", value: reason, inline: false }
              )
              .setFooter({ text: `Request ID: ${request.id}` })
              .setTimestamp();

            const row = new ActionRowBuilder<ButtonBuilder>().addComponents(
              new ButtonBuilder()
                .setCustomId(`inactivity_approve_${request.id}`)
                .setLabel("Approve")
                .setStyle(ButtonStyle.Success)
                .setEmoji("✅"),
              new ButtonBuilder()
                .setCustomId(`inactivity_deny_${request.id}`)
                .setLabel("Deny")
                .setStyle(ButtonStyle.Danger)
                .setEmoji("❌")
            );

            // Build ping content
            let pingContent = "";
            if (config.inactivityPingRoleIds && config.inactivityPingRoleIds.length > 0) {
              pingContent = config.inactivityPingRoleIds.map(id => `<@&${id}>`).join(" ");
            }

            const sentMessage = await submissionsChannel.send({
              content: pingContent || undefined,
              embeds: [embed],
              components: [row],
            });

            await storage.updateInactivityRequest(request.id, {
              messageId: sentMessage.id,
            });
          }
        } catch (error) {
          console.log("Could not send inactivity request to channel:", error);
        }

        await interaction.editReply({
          content: "✅ Your inactivity request has been submitted! You will receive a DM once it has been reviewed.",
        });
      } else if (interaction.customId.startsWith("quiz_review_")) {
        try {
          if (!await safeDeferReply(interaction)) return;
        } catch (error: any) {
          if (error.code === 10062 || error.code === 40060) {
            console.log('Quiz review modal expired:', interaction.id);
            return;
          }
          throw error;
        }

        const parts = interaction.customId.split("_");
        const action = parts[2];
        const submissionId = parts.slice(3).join("_");
        const reviewReason = interaction.fields.getTextInputValue("review_reason") || undefined;

        const submission = await storage.getStaffIntroSubmission(submissionId);
        if (!submission) {
          await interaction.editReply({
            content: "Could not find this submission.",
          });
          return;
        }

        await storage.updateStaffIntroSubmission(submissionId, {
          status: action === "approve" ? "approved" : "denied",
          reviewedById: interaction.user.id,
          reviewReason,
        });

        const message = interaction.message;
        if (message) {
          const status = action === "approve" ? "✅ Approved" : "❌ Denied";
          const color = action === "approve" ? 0x23a559 : 0xda373c;

          // Get config to rebuild questions
          const config = await storage.getGuildConfig(submission.guildId);
          const fullQuestions = getFullQuestions(config);

          const embed = new EmbedBuilder()
            .setTitle(`Staff Intro Submission - ${action === "approve" ? "Approved" : "Denied"}`)
            .setColor(color)
            .setDescription(`**Submitted by:** <@${submission.userId}>`);

          // Rebuild Q&A fields from stored submission data (not from old embed which may be stripped)
          if (submission.answer1) {
            embed.addFields({ name: `Q1: ${fullQuestions[0]}`, value: submission.answer1, inline: false });
          }
          if (submission.answer2) {
            embed.addFields({ name: `Q2: ${fullQuestions[1]}`, value: submission.answer2, inline: false });
          }
          if (submission.answer3) {
            embed.addFields({ name: `Q3: ${fullQuestions[2]}`, value: submission.answer3, inline: false });
          }
          if (submission.answer4) {
            embed.addFields({ name: `Q4: ${fullQuestions[3]}`, value: submission.answer4, inline: false });
          }
          if (submission.answer5) {
            embed.addFields({ name: `Q5: ${fullQuestions[4]}`, value: submission.answer5, inline: false });
          }

          embed.addFields(
            { name: "Status", value: status, inline: true },
            { name: "Reviewed by", value: `<@${interaction.user.id}>`, inline: true }
          );

          if (reviewReason) {
            embed.addFields({ name: "Review Note", value: reviewReason, inline: false });
          }

          embed.setFooter({ text: `Submission ID: ${submissionId}` })
            .setTimestamp();

          await message.edit({ embeds: [embed], components: [] });
        }

        try {
          const user = await client.users.fetch(submission.userId);
          const dmEmbed = new EmbedBuilder()
            .setTitle(`Staff Introduction Quiz ${action === "approve" ? "Passed!" : "Not Passed"}`)
            .setDescription(action === "approve" 
              ? "Congratulations! Your staff introduction quiz has been approved." 
              : "Unfortunately, your staff introduction quiz was not approved.")
            .setColor(action === "approve" ? 0x23a559 : 0xda373c)
            .setTimestamp();

          if (reviewReason) {
            dmEmbed.addFields({ name: "Note from reviewer", value: reviewReason, inline: false });
          }

          await user.send({ embeds: [dmEmbed] });
        } catch (error) {
          // console.log("Could not DM user about quiz result");
        }

        await interaction.editReply({
          content: `Submission ${action === "approve" ? "approved" : "denied"} successfully.`,
        });
      }
    }
  } catch (error: any) {
    // Silently handle expired/unknown interactions
    if (error.code === 10062 || error.code === 40060) {
      return;
    }
    console.log("Error handling interaction:", error.message || error);
    try {
      if (interaction.isRepliable()) {
        const errorMsg = "Something went wrong. Please try again in a moment.";
        if (interaction.deferred || interaction.replied) {
          await interaction.editReply({ content: errorMsg }).catch(() => {});
        } else {
          await interaction.reply({ content: errorMsg, flags: 64 }).catch(() => {});
        }
      }
    } catch (replyError: any) {
      // Silently ignore - interaction is gone
    }
  }
});

client.on("error", (error: any) => {
  // Suppress database connection errors that are already logged elsewhere
  if (error.message?.includes('searchParams') || 
      error.message?.includes('ECONNRESET') ||
      error.message?.includes('Connection terminated')) {
    console.log("[DISCORD] Suppressing database connection error (already logged)");
    return;
  }
  console.error("Discord client error:", error);
});

const pendingTimedCloses = new Map<string, NodeJS.Timeout>();

// Track inactivity warnings and auto-close timers for modmail
// Key: channelId, Value: { timeout, staffId, warningMessageId? }
interface InactivityTimer {
  timeout: NodeJS.Timeout;
  staffId: string;
  warningMessageId?: string;
}
const pendingInactivityWarnings = new Map<string, InactivityTimer>();
const pendingInactivityCloses = new Map<string, InactivityTimer>();

// Track claim expiry timers - auto-unclaim after 15 minutes if claimer doesn't respond
// Key: channelId, Value: { timeout, claimerId }
interface ClaimExpiryTimer {
  timeout: NodeJS.Timeout;
  claimerId: string;
}
const pendingClaimExpiry = new Map<string, ClaimExpiryTimer>();

// Periodic cleanup of timer maps to prevent memory leaks (every 10 minutes)
setInterval(() => {
  const MAX_TIMER_AGE = 60 * 60 * 1000; // 1 hour - clear any timer older than this
  const now = Date.now();

  // Log current map sizes for monitoring
  const sizes = {
    timedCloses: pendingTimedCloses.size,
    inactivityWarnings: pendingInactivityWarnings.size,
    inactivityCloses: pendingInactivityCloses.size,
    claimExpiry: pendingClaimExpiry.size,
  };

  if (sizes.timedCloses + sizes.inactivityWarnings + sizes.inactivityCloses + sizes.claimExpiry > 0) {
    console.log(`[CLEANUP] Timer map sizes: ${JSON.stringify(sizes)}`);
  }

  // Clear all pending timers if they've accumulated too many (safety valve)
  if (sizes.timedCloses > 100) {
    console.log(`[CLEANUP] Clearing ${sizes.timedCloses} stale timed closes`);
    for (const [id, timeout] of Array.from(pendingTimedCloses.entries())) {
      clearTimeout(timeout);
    }
    pendingTimedCloses.clear();
  }

  if (sizes.inactivityWarnings > 100) {
    console.log(`[CLEANUP] Clearing ${sizes.inactivityWarnings} stale inactivity warnings`);
    for (const [id, timer] of Array.from(pendingInactivityWarnings.entries())) {
      clearTimeout(timer.timeout);
    }
    pendingInactivityWarnings.clear();
  }

  if (sizes.inactivityCloses > 100) {
    console.log(`[CLEANUP] Clearing ${sizes.inactivityCloses} stale inactivity closes`);
    for (const [id, timer] of Array.from(pendingInactivityCloses.entries())) {
      clearTimeout(timer.timeout);
    }
    pendingInactivityCloses.clear();
  }

  if (sizes.claimExpiry > 100) {
    console.log(`[CLEANUP] Clearing ${sizes.claimExpiry} stale claim expiry timers`);
    for (const [id, timer] of Array.from(pendingClaimExpiry.entries())) {
      clearTimeout(timer.timeout);
    }
    pendingClaimExpiry.clear();
  }
}, 10 * 60 * 1000); // Every 10 minutes

// Prevent duplicate message processing (in case of multiple bot instances)
const processedMessages = new Set<string>();
const MESSAGE_DEDUP_TIMEOUT = 5000; // 5 seconds

client.on("messageUpdate", async (oldMessage, newMessage) => {
  console.log("[DM TRACKING] messageUpdate event fired");
  if (!newMessage.author || newMessage.author.bot) {
    console.log("[DM TRACKING] Skipping: no author or bot message");
    return;
  }
  if (newMessage.channel.type !== ChannelType.DM) {
    console.log("[DM TRACKING] Skipping: not a DM channel");
    return;
  }

  const userId = newMessage.author.id;
  console.log(`[DM TRACKING] Processing edit from user ${userId}`);
  
  // Get old content from cache if partial
  let oldContent = oldMessage.content;
  if (!oldContent || oldMessage.partial) {
    const cached = getCachedDMMessage(userId, newMessage.id);
    oldContent = cached?.content || "*Message was not cached*";
  }
  
  // Update cache with new content
  updateCachedDMMessage(userId, newMessage.id, newMessage.content || "");

  const thread = await storage.getOpenModmailThreadByUserId(userId);
  console.log(`[EDIT TRACKING] Thread lookup result for ${userId}:`, thread ? `found (channel: ${thread.channelId})` : "not found");
  if (!thread || !thread.channelId) {
    console.log("[EDIT TRACKING] No open thread found, skipping");
    return;
  }

  try {
    const staffChannel = await client.channels.fetch(thread.channelId);
    console.log(`[EDIT TRACKING] Staff channel fetch result:`, staffChannel ? "found" : "not found");
    if (staffChannel && "send" in staffChannel) {
      const newContent = newMessage.content?.slice(0, 1024) || "*No content*";
      const oldContentTrimmed = oldContent?.slice(0, 1024) || "*No content*";
      
      const editEmbed = new EmbedBuilder()
        .setColor(0xFFA500)
        .setDescription(`${newContent}\n\n*edited, old message:* ${oldContentTrimmed}`)
        .setAuthor({ name: newMessage.author.tag, iconURL: newMessage.author.displayAvatarURL() })
        .setTimestamp();

      // Try to find the original message in the database and edit it
      const modmailMsg = await storage.getModmailMessageByDmMessageId(newMessage.id);
      
      if (modmailMsg && modmailMsg.channelMessageId) {
        // Edit the existing message instead of sending a new one
        try {
          const channelMsg = await (staffChannel as any).messages.fetch(modmailMsg.channelMessageId);
          if (channelMsg && channelMsg.editable) {
            await channelMsg.edit({ embeds: [editEmbed] });
            // Update stored content
            await storage.updateModmailMessage(modmailMsg.id, { content: newMessage.content || "" });
            console.log("[EDIT TRACKING] Edited existing staff message");
            return;
          }
        } catch (fetchError) {
          console.log("[EDIT TRACKING] Could not fetch/edit original message, sending new:", fetchError);
        }
      }
      
      // Fallback: send new message if we couldn't edit the original
      await (staffChannel as any).send({ embeds: [editEmbed] });
      console.log("[EDIT TRACKING] Edit embed sent as new message (fallback)");
    }
  } catch (e) {
    console.log("[EDIT TRACKING] Error sending to staff channel:", e);
  }
});

client.on("messageDelete", async (message) => {
  console.log("[DM TRACKING] messageDelete event fired");
  // Try to get author info from cache first
  let authorId = message.author?.id;
  let authorTag = message.author?.tag;
  let authorAvatar = message.author?.displayAvatarURL();
  let content = message.content;
  let isDM = false;
  
  // Check if this is a DM (handle potential undefined channel on partials)
  try {
    if (message.channel && message.channel.type === ChannelType.DM) {
      isDM = true;
      console.log("[DM TRACKING] Detected as DM from channel type");
    }
  } catch (e) {
    console.log("[DM TRACKING] Channel type check failed, trying cache");
  }
  
  // For partial messages, try to get from cache
  if (message.partial || !authorId) {
    // Try to find in any user's cache (only DM messages are cached)
    for (const [userId, userCache] of dmMessageCache.entries()) {
      const cached = userCache.find(m => m.id === message.id);
      if (cached) {
        authorId = cached.authorId;
        authorTag = cached.authorTag;
        authorAvatar = cached.authorAvatar;
        content = cached.content;
        isDM = true; // If found in DM cache, it's a DM
        break;
      }
    }
  }
  
  if (!authorId) return;
  if (message.author?.bot) return;
  if (!isDM) return;

  const thread = await storage.getOpenModmailThreadByUserId(authorId);
  if (!thread || !thread.channelId) return;

  try {
    const staffChannel = await client.channels.fetch(thread.channelId);
    if (staffChannel && "send" in staffChannel) {
      const deletedContent = content?.slice(0, 1024) || "*Message was not cached*";
      const deleteTimestamp = Math.floor(Date.now() / 1000);
      
      // Try to find the original message in the database and edit it
      const modmailMsg = await storage.getModmailMessageByDmMessageId(message.id);
      
      if (modmailMsg && modmailMsg.channelMessageId) {
        // Edit the existing message instead of sending a new one
        try {
          const channelMsg = await (staffChannel as any).messages.fetch(modmailMsg.channelMessageId);
          if (channelMsg && channelMsg.editable) {
            const editedEmbed = new EmbedBuilder()
              .setColor(0xFF0000)
              .setDescription(`${deletedContent}\n\n*(message deleted <t:${deleteTimestamp}:R>)*`)
              .setAuthor({ name: authorTag || "Unknown User", iconURL: authorAvatar })
              .setTimestamp();
            
            await channelMsg.edit({ embeds: [editedEmbed] });
            console.log("[DELETE TRACKING] Edited existing staff message");
            return;
          }
        } catch (fetchError) {
          console.log("[DELETE TRACKING] Could not fetch/edit original message, sending new:", fetchError);
        }
      }
      
      // Fallback: send new message if we couldn't edit the original
      const deleteEmbed = new EmbedBuilder()
        .setColor(0xFF0000)
        .setDescription(`${deletedContent}\n\n*(message deleted <t:${deleteTimestamp}:R>)*`)
        .setAuthor({ name: authorTag || "Unknown User", iconURL: authorAvatar })
        .setTimestamp();

      await (staffChannel as any).send({ embeds: [deleteEmbed] });
    }
  } catch (e) {
    console.log("[DELETE TRACKING] Error sending to staff channel:", e);
  }
});

client.on("messageCreate", async (message) => {
  console.log(`[MSG CREATE] ID: ${message.id}, Author: ${message.author?.tag}, Content: "${message.content?.substring(0, 30)}..."`);
  if (message.author.bot) return;

  // Deduplicate messages to prevent double responses
  if (processedMessages.has(message.id)) {
    console.log(`[MSG CREATE] DUPLICATE DETECTED - skipping ${message.id}`);
    return;
  }
  processedMessages.add(message.id);
  setTimeout(() => processedMessages.delete(message.id), MESSAGE_DEDUP_TIMEOUT);

  // Get configurable prefix for this guild (default ".")
  let prefix = ".";
  if (message.guild) {
    try {
      const guildConfig = await storage.getGuildConfig(message.guild.id);
      if (guildConfig?.commandPrefix) {
        prefix = guildConfig.commandPrefix;
      }
    } catch (e) {
      // Use default prefix if config fetch fails
    }
  }
  const lowerPrefix = prefix.toLowerCase();

  // Handle prefix commands (close, c) with optional time argument in guild channels
  const lowerContent = message.content.toLowerCase();
  if (message.guild && (lowerContent === `${lowerPrefix}close` || lowerContent === `${lowerPrefix}c` || lowerContent.startsWith(`${lowerPrefix}close `) || lowerContent.startsWith(`${lowerPrefix}c `))) {
    // Check for modmail thread first, then appeal thread
    const modmailThread = await storage.getModmailThreadByChannel(message.channel.id);
    const appealThread = await storage.getAppealThreadByChannel(message.channel.id);
    const thread = modmailThread || appealThread;
    const isAppeal = !modmailThread && !!appealThread;

    if (!thread) {
      return;
    }

    if (thread.status !== "open") {
      await message.reply("This ticket is already closed.");
      return;
    }

    // Check if ticket is claimed and if the closer is the claimer
    if (thread.claimedById && thread.claimedById !== message.author.id) {
      await message.reply(`Only <@${thread.claimedById}> (who claimed this ticket) can close it.`);
      return;
    }

    // Parse optional time argument
    let timeArg = "";
    if (lowerContent.startsWith(`${lowerPrefix}close `)) {
      timeArg = message.content.substring(prefix.length + 6).trim();
    } else if (lowerContent.startsWith(`${lowerPrefix}c `)) {
      timeArg = message.content.substring(prefix.length + 2).trim();
    }

    // Check if timed close
    if (timeArg) {
      // Parse time like "1m", "5m", "30s", "1h"
      const timeMatch = timeArg.match(/^(\d+)\s*(s|m|h)$/i);
      if (!timeMatch) {
        await message.reply(`❌ Invalid time format. Use like: \`${prefix}close 5m\`, \`${prefix}c 30s\`, \`${prefix}close 1h\``);
        return;
      }

      const amount = parseInt(timeMatch[1]);
      const unit = timeMatch[2].toLowerCase();

      let delayMs: number;
      if (unit === "s") delayMs = amount * 1000;
      else if (unit === "m") delayMs = amount * 60 * 1000;
      else if (unit === "h") delayMs = amount * 60 * 60 * 1000;
      else delayMs = amount * 60 * 1000;

      // Max 24 hours
      if (delayMs > 24 * 60 * 60 * 1000) {
        await message.reply("❌ Maximum timed close is 24 hours.");
        return;
      }

      // Cancel any existing timed close for this channel
      const existingTimeout = pendingTimedCloses.get(message.channel.id);
      if (existingTimeout) {
        clearTimeout(existingTimeout);
      }

      const closeTime = new Date(Date.now() + delayMs);
      const timeString = `<t:${Math.floor(closeTime.getTime() / 1000)}:R>`;

      // Delete the command message
      try {
        await message.delete();
      } catch (e) {}

      // Send timed close message as embed
      const timedCloseEmbed = new EmbedBuilder()
        .setDescription(`⏰ This ticket will close ${timeString}.`)
        .setColor(0xf0b232)
        .setTimestamp();
      await (message.channel as any).send({ embeds: [timedCloseEmbed] });

      // Capture references synchronously before async timeout
      const timedChannelId = message.channel.id;
      const timedGuildId = message.guild?.id;
      const timedStaffId = message.author.id;
      const timedIsAppeal = isAppeal;

      // Schedule the close
      const timeout = setTimeout(async () => {
        pendingTimedCloses.delete(timedChannelId);

        // Re-fetch thread to make sure it's still open
        const currentModmail = await storage.getModmailThreadByChannel(timedChannelId);
        const currentAppeal = await storage.getAppealThreadByChannel(timedChannelId);
        const currentThread = timedIsAppeal ? currentAppeal : currentModmail;
        if (!currentThread || currentThread.status !== "open") return;

        // Clear claim expiry timer on close
        const timedClaimTimer = pendingClaimExpiry.get(timedChannelId);
        if (timedClaimTimer) {
          clearTimeout(timedClaimTimer.timeout);
          pendingClaimExpiry.delete(timedChannelId);
        }

        // Close the thread
        if (timedIsAppeal) {
          await storage.updateAppealThread(currentThread.id, {
            status: "closed",
            closedById: timedStaffId,
            closeReason: "Closed via .close command",
            closedAt: new Date(),
          });
          // Track activity for closing appeal
          if (timedGuildId) {
            await storage.addAppealActivityEntries(timedGuildId, timedStaffId, 1);
          }
        } else {
          await storage.updateModmailThread(currentThread.id, {
            status: "closed",
            closedById: timedStaffId,
            closeReason: "Closed via .close command",
            closedAt: new Date(),
          });
          // Track activity for closing modmail
          if (timedGuildId) {
            await storage.addModmailActivityEntries(timedGuildId, timedStaffId, 1);
          }
        }

        // Notify user via DM
        try {
          const user = await client.users.fetch(currentThread.userId);
          const closeEmbed = new EmbedBuilder()
            .setTitle(timedIsAppeal ? "Appeal Closed" : "Ticket Closed")
            .setDescription(timedIsAppeal ? "Your appeal has been closed by staff." : "Your ticket has been closed by staff.")
            .setColor(0xed4245)
            .setTimestamp();
          await user.send({ embeds: [closeEmbed] });
        } catch (e) {
          // console.log("Could not DM user about timed ticket close");
        }

        // Send log BEFORE replying or deleting (critical to ensure it happens)
        try {
          const guildId = timedGuildId;
          const config = await storage.getGuildConfig(guildId);
          if (config?.modmailLogChannelId) {
            const logChannel = await client.channels.fetch(config.modmailLogChannelId);
            if (logChannel && "send" in logChannel) {
              const messages = timedIsAppeal 
                ? await storage.getAppealMessages(currentThread.id)
                : await storage.getModmailMessages(currentThread.id);

              const transcriptContent = messages.map(m => `[${m.isStaff === "true" ? "Staff" : "User"}] ${m.authorId}: ${m.content}`).join("\n");
              const buffer = Buffer.from(transcriptContent, "utf-8");
              const attachment = new AttachmentBuilder(buffer, { name: `transcript-${currentThread.id}.txt` });

              let transcriptPreview = messages.map(m => `[${m.isStaff === "true" ? "Staff" : "User"}] <@${m.authorId}>: ${m.content}`).join("\n");
              if (transcriptPreview.length > 1900) transcriptPreview = transcriptPreview.substring(0, 1900) + "...";

              const logEmbed = new EmbedBuilder()
                .setTitle(timedIsAppeal ? "Appeal Closed (Timed)" : "Ticket Closed (Timed)")
                .setColor(0xed4245)
                .addFields(
                  { name: "User", value: `<@${currentThread.userId}>`, inline: true },
                  { name: "Closed By", value: `<@${timedStaffId}>`, inline: true },
                  { name: "Transcript Preview", value: transcriptPreview || "No messages", inline: false }
                )
                .setTimestamp();
              await logChannel.send({ embeds: [logEmbed], files: [attachment] });
              console.log(`[MODMAIL TIMED] Log sent for thread ${currentThread.id}`);
            }
          }
        } catch (e: any) {
          console.log("[MODMAIL TIMED] Could not send log:", e.message);
        }

        // Delete the channel
        try {
          const chanToDelete = await client.channels.fetch(timedChannelId);
          if (chanToDelete) await chanToDelete.delete();
        } catch (e) { console.log("Failed to delete channel on timed close:", e); }
      }, delayMs);

      pendingTimedCloses.set(timedChannelId, timeout);
      return;
    }

    // Immediate close (with notification to user)
    if (isAppeal) {
      await storage.updateAppealThread(thread.id, {
        status: "closed",
        closedById: message.author.id,
        closeReason: "Closed via .close command",
        closedAt: new Date(),
      });
      // Track activity for closing appeal
      await storage.addAppealActivityEntries(message.guild.id, message.author.id, 1);
    } else {
      await storage.updateModmailThread(thread.id, {
        status: "closed",
        closedById: message.author.id,
        closeReason: "Closed via .close command",
        closedAt: new Date(),
      });
      // Track activity for closing modmail
      await storage.addModmailActivityEntries(message.guild.id, message.author.id, 1);
    }

    // Capture values before sync logic
    const threadUserId = thread.userId;
    const threadId = thread.id;
    const closerId = message.author.id;
    const guildId = message.guild.id;

    // Notify user
    try {
      const user = await client.users.fetch(threadUserId);
      const closeEmbed = new EmbedBuilder()
        .setTitle(isAppeal ? "Appeal Closed" : "Ticket Closed")
        .setDescription(isAppeal ? "Your appeal has been closed by staff." : "Your ticket has been closed by staff.")
        .setColor(0xed4245)
        .setTimestamp();
      await user.send({ embeds: [closeEmbed] });
    } catch (e) {
      // console.log("Could not DM user about ticket close");
    }

    // Log to log channel
    try {
      const config = await storage.getGuildConfig(guildId);
      const logChannelId = isAppeal ? config?.appealLogChannelId : config?.modmailLogChannelId;
      if (logChannelId) {
        const logChannel = await client.channels.fetch(logChannelId);
        if (logChannel && "send" in logChannel) {
          const messages = isAppeal 
            ? await storage.getAppealMessages(threadId)
            : await storage.getModmailMessages(threadId);

          // Include all messages in the .txt transcript
          const transcriptContent = messages.map(m => `[${m.isStaff === "true" ? "Staff" : "User"}] ${m.authorId}: ${m.content}`).join("\n");
          const buffer = Buffer.from(transcriptContent, "utf-8");
          const attachment = new AttachmentBuilder(buffer, { name: `transcript-${threadId}.txt` });

          let transcriptPreview = messages.map(m => `[${m.isStaff === "true" ? "Staff" : "User"}] <@${m.authorId}>: ${m.content}`).join("\n");
          if (transcriptPreview.length > 1900) transcriptPreview = transcriptPreview.substring(0, 1900) + "...";

          const logEmbed = new EmbedBuilder()
            .setTitle(isAppeal ? "Appeal Closed" : "Ticket Closed")
            .setColor(0xed4245)
            .addFields(
              { name: "User", value: `<@${threadUserId}>`, inline: true },
              { name: "Closed By", value: `<@${closerId}>`, inline: true },
              { name: "Transcript Preview", value: transcriptPreview || "No messages", inline: false }
            )
            .setTimestamp();
          await (logChannel as any).send({ embeds: [logEmbed], files: [attachment] });
        }
      }
    } catch (e) {
      console.log("[CLOSE COMMAND] Could not send log:", e);
    }

    // Delete channel immediately
    await message.reply("Ticket closed.");
    try {
      await (message.channel as any).delete();
    } catch (e) {}
    return;
  }

  // Handle claim command
  if (message.guild && lowerContent === `${lowerPrefix}claim`) {
    // Check for modmail thread first, then appeal thread
    const modmailThread = await storage.getModmailThreadByChannel(message.channel.id);
    const appealThread = await storage.getAppealThreadByChannel(message.channel.id);
    const thread = modmailThread || appealThread;
    const isAppeal = !modmailThread && !!appealThread;

    if (!thread) {
      return;
    }

    if (thread.status !== "open") {
      await message.reply("❌ This ticket is already closed.");
      return;
    }

    if (thread.claimedById) {
      await message.reply(`❌ This ticket is already claimed by <@${thread.claimedById}>.`);
      return;
    }

    // Check claim permission
    const config = await storage.getGuildConfig(message.guild.id);
    const claimRoleIds = isAppeal 
      ? (config?.appealStaffRoleIds || [])
      : (config?.modmailClaimRoleIds || config?.modmailStaffRoleIds || []);
    const member = message.member;
    const hasClaimPermission = claimRoleIds.length === 0 || 
      (member && member.roles.cache.some(role => claimRoleIds.includes(role.id)));

    if (!hasClaimPermission) {
      await message.reply("You don't have permission to claim tickets.");
      return;
    }

    if (isAppeal) {
      await storage.updateAppealThread(thread.id, { claimedById: message.author.id });
    } else {
      await storage.updateModmailThread(thread.id, { claimedById: message.author.id });
    }

    const claimEmbed = new EmbedBuilder()
      .setDescription(`Claimed by ${message.author.username}`)
      .setColor(0xed4245)
      .setTimestamp();
    await (message.channel as any).send({ embeds: [claimEmbed] });

    // Find and update the message with the claim button to show claimed state
    try {
      const messages = await (message.channel as any).messages.fetch({ limit: 50 });
      const buttonMessage = messages.find((m: any) => 
        m.components.length > 0 && 
        m.components.some((row: any) => 
          row.components.some((c: any) => c.customId === `modmail_claim_${thread.id}` || c.customId === `appeal_claim_${thread.id}`)
        )
      );
      if (buttonMessage) {
        const claimButtonId = isAppeal ? `appeal_claim_${thread.id}` : `modmail_claim_${thread.id}`;
        const closeButtonId = isAppeal ? `appeal_close_${thread.id}` : `modmail_close_${thread.id}`;
        await buttonMessage.edit({
          components: [
            new ActionRowBuilder<ButtonBuilder>().addComponents(
              new ButtonBuilder()
                .setCustomId(claimButtonId)
                .setLabel(`Claimed by ${message.author.username}`)
                .setStyle(ButtonStyle.Secondary)
                .setDisabled(true),
              new ButtonBuilder()
                .setCustomId(closeButtonId)
                .setLabel("Close")
                .setStyle(ButtonStyle.Danger)
                .setEmoji("🔒")
            )
          ]
        });
      }
    } catch (e) {
      console.log("Could not update claim button:", e);
    }

    // Start 15-minute claim expiry timer
    const CLAIM_EXPIRY_TIME = 15 * 60 * 1000;
    const existingClaimTimer = pendingClaimExpiry.get(message.channel.id);
    if (existingClaimTimer) {
      clearTimeout(existingClaimTimer.timeout);
    }

    const channelId = message.channel.id;
    const claimIsAppeal = isAppeal;
    const claimExpiryTimeout = setTimeout(async () => {
      pendingClaimExpiry.delete(channelId);

      const currentModmail = await storage.getModmailThreadByChannel(channelId);
      const currentAppeal = await storage.getAppealThreadByChannel(channelId);
      const currentThread = claimIsAppeal ? currentAppeal : currentModmail;
      if (!currentThread || currentThread.status !== "open") return;
      if (currentThread.claimedById !== message.author.id) return;

      if (claimIsAppeal) {
        await storage.updateAppealThread(currentThread.id, { claimedById: null });
      } else {
        await storage.updateModmailThread(currentThread.id, { claimedById: null });
      }
      try {
        const channel = await client.channels.fetch(channelId);
        if (channel && "send" in channel) {
          await channel.send(`Ticket auto-unclaimed. <@${message.author.id}> did not respond within 15 minutes.`);
        }
      } catch (e) {
        console.log("Could not send auto-unclaim message");
      }
    }, CLAIM_EXPIRY_TIME);

    pendingClaimExpiry.set(channelId, {
      timeout: claimExpiryTimeout,
      claimerId: message.author.id,
    });
    return;
  }

  // Handle .ignore command to disable inactivity warnings for a ticket
  if (message.guild && lowerContent === `${lowerPrefix}ignore`) {
    const thread = await storage.getModmailThreadByChannel(message.channel.id);
    if (!thread) {
      // Silently ignore if not in a modmail channel
      return;
    }
    if (thread.status !== "open") {
      await message.reply("❌ This ticket is already closed.");
      return;
    }

    await storage.updateModmailThread(thread.id, { ignoreInactivity: "true" });

    // Cancel any pending inactivity timers
    const existingWarning = pendingInactivityWarnings.get(message.channel.id);
    if (existingWarning) {
      clearTimeout(existingWarning.timeout);
      pendingInactivityWarnings.delete(message.channel.id);
    }
    const existingClose = pendingInactivityCloses.get(message.channel.id);
    if (existingClose) {
      clearTimeout(existingClose.timeout);
      pendingInactivityCloses.delete(message.channel.id);
    }

    const ignoreEmbed = new EmbedBuilder()
      .setDescription("✅ Inactivity warnings disabled for this ticket.")
      .setColor(0x57f287)
      .setTimestamp();
    await (message.channel as any).send({ embeds: [ignoreEmbed] });
    return;
  }

  // Handle !or, !override, and !unclaim command (claimer or admin can unclaim) - works in both modmail and appeal channels
  if (message.guild && (lowerContent === `${lowerPrefix}or` || lowerContent === `${lowerPrefix}override` || lowerContent === `${lowerPrefix}unclaim`)) {
    const modmailThread = await storage.getModmailThreadByChannel(message.channel.id);
    const appealThread = await storage.getAppealThreadByChannel(message.channel.id);
    const thread = modmailThread || appealThread;
    const isAppeal = !modmailThread && !!appealThread;

    if (!thread) {
      return;
    }

    if (thread.status !== "open") {
      await message.reply("This ticket is already closed.");
      return;
    }

    if (!thread.claimedById) {
      await message.reply("This ticket is not claimed by anyone.");
      return;
    }

    // Check permission: claimer can unclaim their own ticket, or admin can unclaim any ticket
    const member = message.member;
    const hasAdminPermission = member && member.permissions.has("Administrator");
    const isClaimedByUser = thread.claimedById === message.author.id;

    if (!isClaimedByUser && !hasAdminPermission) {
      await message.reply(`Only <@${thread.claimedById}> (who claimed this ticket) or an administrator can unclaim it.`);
      return;
    }

    const previousClaimer = thread.claimedById;
    if (isAppeal) {
      await storage.updateAppealThread(thread.id, { claimedById: null });
    } else {
      await storage.updateModmailThread(thread.id, { claimedById: null });
    }

    // Clear claim expiry timer
    const existingClaimTimer = pendingClaimExpiry.get(message.channel.id);
    if (existingClaimTimer) {
      clearTimeout(existingClaimTimer.timeout);
      pendingClaimExpiry.delete(message.channel.id);
    }

    const unclaimEmbed = new EmbedBuilder()
      .setDescription(`🔓 Ticket unclaimed. (Was claimed by <@${previousClaimer}>)`)
      .setColor(0xf0b232)
      .setTimestamp();
    await (message.channel as any).send({ embeds: [unclaimEmbed] });
    return;
  }

  // Handle snip commands for snippet management
  // Note: Check for .snippet first (longer match) before .snip to avoid partial matching
  if (message.guild && (lowerContent.startsWith(`${lowerPrefix}snippet `) || (lowerContent.startsWith(`${lowerPrefix}snip `) && !lowerContent.startsWith(`${lowerPrefix}snippet`)))) {
    const cmdLen = lowerContent.startsWith(`${lowerPrefix}snippet `) ? 8 : 5;
    const args = message.content.substring(prefix.length + cmdLen).trim();
    const spaceIndex = args.indexOf(" ");
    const subCommand = spaceIndex === -1 ? args.toLowerCase() : args.substring(0, spaceIndex).toLowerCase();
    const rest = spaceIndex === -1 ? "" : args.substring(spaceIndex + 1).trim();

    // Check for admin permission for create/edit/delete
    const member = message.member;
    const hasAdminPermission = member && member.permissions.has("Administrator");

    if (subCommand === "create") {
      if (!hasAdminPermission) {
        await message.reply("❌ Only administrators can create snippets.");
        return;
      }

      // Parse: .snip create <alias> <text> (quotes optional)
      // Support regular quotes, smart quotes, or no quotes
      const aliasMatch = rest.match(/^(\S+)\s+[""\u201C\u201D]?([\s\S]+?)[""\u201C\u201D]?$/);
      if (!aliasMatch || !aliasMatch[2]?.trim()) {
        await message.reply(`❌ Usage: \`${prefix}snip create <alias> <text>\``);
        return;
      }

      const alias = aliasMatch[1].toLowerCase();
      const content = aliasMatch[2].trim();

      const existing = await storage.getSnippet(message.guild.id, alias);
      if (existing) {
        await message.reply(`❌ Snippet \`${alias}\` already exists. Use \`${prefix}snip edit\` to modify it.`);
        return;
      }

      await storage.createSnippet({
        guildId: message.guild.id,
        alias: alias,
        content: content,
        createdById: message.author.id,
      });

      await message.reply(`Snippet \`${alias}\` created. Use \`${prefix}${alias}\` in ticket channels to send it.`);
      return;
    } else if (subCommand === "edit") {
      if (!hasAdminPermission) {
        await message.reply("❌ Only administrators can edit snippets.");
        return;
      }

      // Parse: .snip edit <alias> <text> (quotes optional)
      const aliasMatch = rest.match(/^(\S+)\s+[""\u201C\u201D]?([\s\S]+?)[""\u201C\u201D]?$/);
      if (!aliasMatch || !aliasMatch[2]?.trim()) {
        await message.reply(`❌ Usage: \`${prefix}snip edit <alias> <text>\``);
        return;
      }

      const alias = aliasMatch[1].toLowerCase();
      const content = aliasMatch[2].trim();

      const updated = await storage.updateSnippet(message.guild.id, alias, content);
      if (!updated) {
        await message.reply(`❌ Snippet \`${alias}\` not found.`);
        return;
      }

      await message.reply(`✅ Snippet \`${alias}\` updated.`);
      return;
    } else if (subCommand === "delete") {
      if (!hasAdminPermission) {
        await message.reply("❌ Only administrators can delete snippets.");
        return;
      }

      const alias = rest.toLowerCase();
      if (!alias) {
        await message.reply(`❌ Usage: \`${prefix}snip delete <alias>\``);
        return;
      }

      const existing = await storage.getSnippet(message.guild.id, alias);
      if (!existing) {
        await message.reply(`❌ Snippet \`${alias}\` not found.`);
        return;
      }

      await storage.deleteSnippet(message.guild.id, alias);
      await message.reply(`✅ Snippet \`${alias}\` deleted.`);
      return;
    } else if (subCommand === "list") {
      // Only admins can list snippets - silently ignore otherwise
      if (!hasAdminPermission) {
        return;
      }

      // Check for duplicate processing
      const snippetListKey = `sniplist_${message.id}`;
      if (processedMessages.has(snippetListKey)) {
        console.log(`[SNIPPET LIST] Duplicate detected, skipping MsgID: ${message.id}`);
        return;
      }
      processedMessages.add(snippetListKey);
      setTimeout(() => processedMessages.delete(snippetListKey), 10000);

      console.log(`[SNIPPET LIST] Guild: ${message.guild.id} (${message.guild.name}), Channel: ${message.channel.id}, User: ${message.author.tag}, MsgID: ${message.id}`);
      const allSnippets = await storage.getAllSnippets(message.guild.id);
      console.log(`[SNIPPET LIST] Found ${allSnippets.length} snippets for guild ${message.guild.id}`);
      if (allSnippets.length === 0) {
        await message.reply(`No snippets configured. Use \`${prefix}snip create <alias> "<text>"\` to create one.`);
        return;
      }

      // Show fewer per page since we're showing full content (5 per page to stay under 4096 char limit)
      const perPage = 5;
      const totalPages = Math.ceil(allSnippets.length / perPage);
      const pageArg = rest ? parseInt(rest) : 1;
      const page = isNaN(pageArg) || pageArg < 1 ? 1 : Math.min(pageArg, totalPages);
      const start = (page - 1) * perPage;
      const pageSnippets = allSnippets.slice(start, start + perPage);

      const snippetListDisplay = pageSnippets.map((s, i) => {
        const num = start + i + 1;
        // Cap content at 500 chars to prevent embed overflow
        const content = s.content.length > 500 ? s.content.substring(0, 500) + "..." : s.content;
        return `**${num}.** \`${s.alias}\`\n${content}`;
      }).join("\n\n");

      const embed = new EmbedBuilder()
        .setTitle(`📝 Snippet List`)
        .setDescription(snippetListDisplay || "No snippets on this page.")
        .setColor(0x5865f2)
        .setFooter({ text: `Page ${page}/${totalPages} | Total: ${allSnippets.length} snippets | Use ${prefix}snip list <page>` });

      const row = new ActionRowBuilder<ButtonBuilder>();
      if (page > 1) {
        row.addComponents(
          new ButtonBuilder()
            .setCustomId(`sniplist_${page - 1}`)
            .setLabel("◀ Previous")
            .setStyle(ButtonStyle.Secondary)
        );
      }
      if (page < totalPages) {
        row.addComponents(
          new ButtonBuilder()
            .setCustomId(`sniplist_${page + 1}`)
            .setLabel("Next ▶")
            .setStyle(ButtonStyle.Secondary)
        );
      }

      if (row.components.length > 0) {
        await message.reply({ embeds: [embed], components: [row] });
      } else {
        await message.reply({ embeds: [embed] });
      }
      return;
    } else if (subCommand === "view") {
      const alias = rest.toLowerCase();
      if (!alias) {
        await message.reply(`❌ Usage: \`${prefix}snip view <alias>\``);
        return;
      }

      const snippet = await storage.getSnippet(message.guild.id, alias);
      if (!snippet) {
        await message.reply(`❌ Snippet \`${alias}\` not found.`);
        return;
      }

      const embed = new EmbedBuilder()
        .setTitle(`Snippet: ${snippet.alias}`)
        .setDescription(snippet.content)
        .setColor(0x5865f2);
      await message.reply({ embeds: [embed] });
      return;
    } else {
      // If subCommand is not a known command, try to use it as a snippet alias
      const snippet = await storage.getSnippet(message.guild.id, subCommand);
      if (snippet) {
        // Check if in a ticket channel and send as embed
        const thread = await storage.getModmailThreadByChannel(message.channel.id);
        if (thread && thread.status === "open") {
          const user = await client.users.fetch(thread.userId);

          let roleName = "Staff";
          const memberRole = message.member;
          if (memberRole && memberRole.roles.cache.size > 0) {
            const roles = memberRole.roles.cache
              .filter(r => r.id !== message.guild!.id)
              .sort((a, b) => b.position - a.position);
            if (roles.size > 0) {
              roleName = roles.first()!.name;
            }
          }

          const staffEmbed = new EmbedBuilder()
            .setAuthor({ name: roleName, iconURL: message.author.displayAvatarURL() })
            .setDescription(snippet.content)
            .setColor(0x5865f2)
            .setFooter({ text: message.author.tag })
            .setTimestamp();

          const dmMessage = await user.send({ embeds: [staffEmbed] });
          const channelMessage = await (message.channel as any).send({ embeds: [staffEmbed] });

          await storage.addModmailMessage({
            threadId: thread.id,
            authorId: message.author.id,
            content: snippet.content,
            isStaff: "true",
            channelMessageId: channelMessage.id,
            dmMessageId: dmMessage.id,
          });
          await message.delete().catch(() => {});
        } else {
          await message.reply(snippet.content);
        }
        return;
      }
      await message.reply(`❌ Unknown subcommand. Use \`${prefix}snip create\`, \`${prefix}snip edit\`, \`${prefix}snip delete\`, \`${prefix}snip view\`, or \`${prefix}snip list\`.`);
      return;
    }
  }

  // Handle .asnip commands for appeal snippet management (separate from modmail snippets)
  if (message.guild && lowerContent.startsWith(`${lowerPrefix}asnip `)) {
    const args = message.content.substring(prefix.length + 6).trim();
    const spaceIndex = args.indexOf(" ");
    const subCommand = spaceIndex === -1 ? args.toLowerCase() : args.substring(0, spaceIndex).toLowerCase();
    const rest = spaceIndex === -1 ? "" : args.substring(spaceIndex + 1).trim();

    // Check for admin permission for create/edit/delete
    const member = message.member;
    const hasAdminPermission = member && member.permissions.has("Administrator");

    if (subCommand === "create") {
      if (!hasAdminPermission) {
        await message.reply("Only administrators can create appeal snippets.");
        return;
      }

      const aliasMatch = rest.match(/^(\S+)\s+[""\u201C\u201D]?([\s\S]+?)[""\u201C\u201D]?$/);
      if (!aliasMatch || !aliasMatch[2]?.trim()) {
        await message.reply(`Usage: \`${prefix}asnip create <alias> <text>\``);
        return;
      }

      const alias = aliasMatch[1].toLowerCase();
      const content = aliasMatch[2].trim();

      const existing = await storage.getAppealSnippet(message.guild.id, alias);
      if (existing) {
        await message.reply(`Appeal snippet \`${alias}\` already exists. Use \`${prefix}asnip edit\` to modify it.`);
        return;
      }

      await storage.createAppealSnippet({
        guildId: message.guild.id,
        alias: alias,
        content: content,
        createdById: message.author.id,
      });

      await message.reply(`Appeal snippet \`${alias}\` created. Use \`${prefix}${alias}\` in appeal channels to send it.`);
      return;
    } else if (subCommand === "edit") {
      if (!hasAdminPermission) {
        await message.reply("Only administrators can edit appeal snippets.");
        return;
      }

      const aliasMatch = rest.match(/^(\S+)\s+[""\u201C\u201D]?([\s\S]+?)[""\u201C\u201D]?$/);
      if (!aliasMatch || !aliasMatch[2]?.trim()) {
        await message.reply(`Usage: \`${prefix}asnip edit <alias> <text>\``);
        return;
      }

      const alias = aliasMatch[1].toLowerCase();
      const content = aliasMatch[2].trim();

      const updated = await storage.updateAppealSnippet(message.guild.id, alias, content);
      if (!updated) {
        await message.reply(`Appeal snippet \`${alias}\` not found.`);
        return;
      }

      await message.reply(`Appeal snippet \`${alias}\` updated.`);
      return;
    } else if (subCommand === "delete") {
      if (!hasAdminPermission) {
        await message.reply("Only administrators can delete appeal snippets.");
        return;
      }

      const alias = rest.toLowerCase();
      if (!alias) {
        await message.reply(`Usage: \`${prefix}asnip delete <alias>\``);
        return;
      }

      const existing = await storage.getAppealSnippet(message.guild.id, alias);
      if (!existing) {
        await message.reply(`Appeal snippet \`${alias}\` not found.`);
        return;
      }

      await storage.deleteAppealSnippet(message.guild.id, alias);
      await message.reply(`Appeal snippet \`${alias}\` deleted.`);
      return;
    } else if (subCommand === "list") {
      if (!hasAdminPermission) {
        return;
      }

      const allSnippets = await storage.getAllAppealSnippets(message.guild.id);
      if (allSnippets.length === 0) {
        await message.reply(`No appeal snippets configured. Use \`${prefix}asnip create <alias> "<text>"\` to create one.`);
        return;
      }

      // Show fewer per page since we're showing full content (5 per page to stay under 4096 char limit)
      const perPage = 5;
      const totalPages = Math.ceil(allSnippets.length / perPage);
      const pageArg = rest ? parseInt(rest) : 1;
      const page = isNaN(pageArg) || pageArg < 1 ? 1 : Math.min(pageArg, totalPages);
      const start = (page - 1) * perPage;
      const pageSnippets = allSnippets.slice(start, start + perPage);

      const snippetListDisplay = pageSnippets.map((s, i) => {
        const num = start + i + 1;
        // Cap content at 500 chars to prevent embed overflow
        const content = s.content.length > 500 ? s.content.substring(0, 500) + "..." : s.content;
        return `**${num}.** \`${s.alias}\`\n${content}`;
      }).join("\n\n");

      const embed = new EmbedBuilder()
        .setTitle(`📝 Appeal Snippet List`)
        .setDescription(snippetListDisplay || "No snippets on this page.")
        .setColor(0x5865f2)
        .setFooter({ text: `Page ${page}/${totalPages} | Total: ${allSnippets.length} snippets | Use ${prefix}asnip list <page>` });

      const row = new ActionRowBuilder<ButtonBuilder>();
      if (page > 1) {
        row.addComponents(
          new ButtonBuilder()
            .setCustomId(`asniplist_${page - 1}`)
            .setLabel("◀ Previous")
            .setStyle(ButtonStyle.Secondary)
        );
      }
      if (page < totalPages) {
        row.addComponents(
          new ButtonBuilder()
            .setCustomId(`asniplist_${page + 1}`)
            .setLabel("Next ▶")
            .setStyle(ButtonStyle.Secondary)
        );
      }

      if (row.components.length > 0) {
        await message.reply({ embeds: [embed], components: [row] });
      } else {
        await message.reply({ embeds: [embed] });
      }
      return;
    } else if (subCommand === "view") {
      const alias = rest.toLowerCase();
      if (!alias) {
        await message.reply(`❌ Usage: \`${prefix}asnip view <alias>\``);
        return;
      }

      const snippet = await storage.getAppealSnippet(message.guild.id, alias);
      if (!snippet) {
        await message.reply(`❌ Appeal snippet \`${alias}\` not found.`);
        return;
      }

      const embed = new EmbedBuilder()
        .setTitle(`Appeal Snippet: ${snippet.alias}`)
        .setDescription(snippet.content)
        .setColor(0x5865f2);
      await message.reply({ embeds: [embed] });
      return;
    } else {
      // If subCommand is not a known command, try to use it as a snippet alias
      const snippet = await storage.getAppealSnippet(message.guild.id, subCommand);
      if (snippet) {
        // Check if in an appeal channel and send as embed
        const thread = await storage.getAppealThreadByChannel(message.channel.id);
        if (thread && thread.status === "open") {
          const user = await client.users.fetch(thread.userId);

          let roleName = "Staff";
          const memberRole = message.member;
          if (memberRole && memberRole.roles.cache.size > 0) {
            const roles = memberRole.roles.cache
              .filter(r => r.id !== message.guild!.id)
              .sort((a, b) => b.position - a.position);
            if (roles.size > 0) {
              roleName = roles.first()!.name;
            }
          }

          const staffEmbed = new EmbedBuilder()
            .setAuthor({ name: roleName, iconURL: message.author.displayAvatarURL() })
            .setDescription(snippet.content)
            .setColor(0x5865f2)
            .setFooter({ text: message.author.tag })
            .setTimestamp();

          const dmMessage = await user.send({ embeds: [staffEmbed] });
          const channelMessage = await (message.channel as any).send({ embeds: [staffEmbed] });

          await storage.addAppealMessage({
            threadId: thread.id,
            authorId: message.author.id,
            content: snippet.content,
            isStaff: "true",
            channelMessageId: channelMessage.id,
            dmMessageId: dmMessage.id,
          });
          await message.delete().catch(() => {});
        } else {
          await message.reply(snippet.content);
        }
        return;
      }
      await message.reply(`❌ Unknown subcommand. Use \`${prefix}asnip create\`, \`${prefix}asnip edit\`, \`${prefix}asnip delete\`, \`${prefix}asnip view\`, or \`${prefix}asnip list\`.`);
      return;
    }
  }

  // Handle <prefix><alias> snippet usage in modmail/appeal ticket channels
  // Note: Use exact command matches or command+space to avoid blocking snippets like .content, .asnippet
  if (message.guild && lowerContent.startsWith(lowerPrefix) && 
      !lowerContent.startsWith(`${lowerPrefix}snip `) && lowerContent !== `${lowerPrefix}snip` &&
      !lowerContent.startsWith(`${lowerPrefix}asnip `) && lowerContent !== `${lowerPrefix}asnip` &&
      !lowerContent.startsWith(`${lowerPrefix}close`) && 
      !(lowerContent === `${lowerPrefix}c` || lowerContent.startsWith(`${lowerPrefix}c `)) &&
      !lowerContent.startsWith(`${lowerPrefix}claim`) && 
      !(lowerContent === `${lowerPrefix}or` || lowerContent.startsWith(`${lowerPrefix}or `)) &&
      !(lowerContent === `${lowerPrefix}r` || lowerContent.startsWith(`${lowerPrefix}r `)) && 
      !(lowerContent === `${lowerPrefix}ar` || lowerContent.startsWith(`${lowerPrefix}ar `)) &&
      !lowerContent.startsWith(`${lowerPrefix}edit `) && !lowerContent.startsWith(`${lowerPrefix}delete`)) {
    console.log(`[SNIPPET ALIAS] Checking alias for: ${message.id} - "${message.content}"`);
    const alias = message.content.substring(prefix.length).toLowerCase().split(" ")[0];
    if (alias) {
      // Check for modmail thread first, then appeal thread
      const modmailThread = await storage.getModmailThreadByChannel(message.channel.id);
      const appealThread = await storage.getAppealThreadByChannel(message.channel.id);
      const thread = modmailThread || appealThread;
      const isAppealSnippet = !modmailThread && !!appealThread;

      if (thread && thread.status === "open") {
        // Use appeal snippets for appeal channels, modmail snippets for modmail channels
        const snippet = isAppealSnippet 
          ? await storage.getAppealSnippet(message.guild.id, alias)
          : await storage.getSnippet(message.guild.id, alias);

        if (snippet) {
          try {
            const user = await client.users.fetch(thread.userId);

            // Get staff member's highest meaningful role name
            let snippetRoleName = "Staff";
            const snippetMember = message.member;
            if (snippetMember && snippetMember.roles.cache.size > 0) {
              const roles = snippetMember.roles.cache
                .filter(r => r.id !== message.guild!.id)
                .sort((a, b) => b.position - a.position);
              if (roles.size > 0) {
                snippetRoleName = roles.first()!.name;
              }
            }

            const staffEmbed = new EmbedBuilder()
              .setAuthor({ name: snippetRoleName, iconURL: message.author.displayAvatarURL() })
              .setDescription(snippet.content)
              .setColor(0x5865f2)
              .setFooter({ text: message.author.tag })
              .setTimestamp();

            // Send to user DM
            const dmMessage = await user.send({ embeds: [staffEmbed] });

            // Send to channel as well
            const channelMessage = await (message.channel as any).send({ embeds: [staffEmbed] });

            // Save message to correct storage based on context
            if (isAppealSnippet) {
              await storage.addAppealMessage({
                threadId: thread.id,
                authorId: message.author.id,
                content: snippet.content,
                isStaff: "true",
                channelMessageId: channelMessage.id,
                dmMessageId: dmMessage.id,
              });
            } else {
              await storage.addModmailMessage({
                threadId: thread.id,
                authorId: message.author.id,
                content: snippet.content,
                isStaff: "true",
                channelMessageId: channelMessage.id,
                dmMessageId: dmMessage.id,
              });
            }

            // Delete the trigger message
            try {
              await message.delete();
            } catch (e) {}
          } catch (error) {
            console.log("Could not send snippet to user:", error);
            await message.react("❌");
          }
          return;
        }
      }
    }
  }

  // Handle DM messages
  if (!message.guild) {
    console.log(`[DM] Received DM from ${message.author.id} (${message.author.tag}): "${message.content.substring(0, 50)}..."`);

    // Cache DM message for edit/delete tracking
    cacheDMMessage(message.author.id, message);

    // Check for active quiz first
    const quizState = activeQuizzes.get(message.author.id);
    if (quizState) {
      console.log(`[DM] User has active quiz, processing answer`);
      const answer = message.content.trim();
      await processQuizAnswer(message.author.id, answer, message.channel);
      return;
    }

    // Handle modmail/appeal DMs - only relay to EXISTING open threads
    // New tickets must be created via the dropdown menu or button in the server
    try {
      // Find ALL existing open threads for this user across all guilds (check both modmail and appeal)
      const openTickets: { thread: any; guild: any; isAppeal: boolean; type: string }[] = [];

      for (const guild of Array.from(client.guilds.cache.values())) {
        try {
          // Check modmail
          const modmailThread = await storage.getOpenModmailThread(guild.id, message.author.id);
          if (modmailThread && modmailThread.channelId) {
            openTickets.push({ thread: modmailThread, guild, isAppeal: false, type: "Support Ticket" });
          }
          // Check appeal
          const appealThread = await storage.getOpenAppealThread(guild.id, message.author.id);
          if (appealThread && appealThread.channelId) {
            openTickets.push({ thread: appealThread, guild, isAppeal: true, type: "Ban Appeal" });
          }
        } catch (e) {
          // No thread in this guild
        }
      }

      // If multiple open tickets, show dropdown to select which one
      if (openTickets.length > 1) {
        const embed = new EmbedBuilder()
          .setTitle("Select Destination")
          .setDescription("You have open tickets in multiple servers. Select which one to send your message to:")
          .setColor(0x5865f2);

        const selectMenu = new StringSelectMenuBuilder()
          .setCustomId(`dm_server_select_${message.author.id}`)
          .setPlaceholder("Select a server...")
          .addOptions(
            openTickets.map((ticket, index) => 
              new StringSelectMenuOptionBuilder()
                .setLabel(`${ticket.guild.name}`)
                .setDescription(`${ticket.type}`)
                .setValue(`${index}`)
                .setEmoji(ticket.isAppeal ? "⚖️" : "📩")
            )
          );

        const row = new ActionRowBuilder<StringSelectMenuBuilder>().addComponents(selectMenu);

        // Store the pending message and tickets for later
        pendingServerSelections.set(message.author.id, {
          messageContent: message.content,
          attachments: message.attachments.map(a => ({ url: a.url, contentType: a.contentType })),
          tickets: openTickets,
          sentAt: Date.now(),
          originalMessageId: message.id,
          originalChannelId: message.channel.id,
        });

        await message.reply({ embeds: [embed], components: [row] });
        return;
      }

      // Single ticket or no ticket
      let targetThread: any = openTickets.length === 1 ? openTickets[0].thread : null;
      let targetGuild = openTickets.length === 1 ? openTickets[0].guild : null;
      let isAppealThread = openTickets.length === 1 ? openTickets[0].isAppeal : false;

      if (!targetThread || !targetGuild) {
        // No existing open ticket - offer to create one via DM
        // Skip if user is in an active quiz (double-check to prevent overlap)
        if (activeQuizzes.has(message.author.id)) {
          console.log(`[DM] User ${message.author.id} has active quiz, skipping modmail prompt`);
          return;
        }

        // Check if user already has a pending category selection
        if (pendingDMTickets.has(message.author.id)) {
          return; // Already waiting for category selection
        }

        // Find a guild where modmail is configured and user is a member
        let availableGuild = null;
        let availableConfig = null;

        console.log(`[DM] Searching for guild for user ${message.author.id} (${message.author.tag}) - cached guilds: ${client.guilds.cache.size}`);

        for (const guild of Array.from(client.guilds.cache.values())) {
          console.log(`[DM] Checking guild: ${guild.name} (${guild.id})`);
          try {
            const member = await guild.members.fetch(message.author.id).catch((e) => {
              console.log(`[DM] Failed to fetch member in ${guild.name}: ${e.message}`);
              return null;
            });
            if (!member) {
              console.log(`[DM] User not a member of ${guild.name}`);
              continue;
            }

            console.log(`[DM] User IS a member of ${guild.name}`);
            const config = await storage.getGuildConfig(guild.id);
            console.log(`[DM] Config for ${guild.name}: modmailCategoryId=${config?.modmailCategoryId}`);
            if (config?.modmailCategoryId) {
              // Check if user is blocked
              const block = await storage.getActiveModmailBlock(guild.id, message.author.id);
              if (!block) {
                console.log(`[DM] Found available guild: ${guild.name}`);
                availableGuild = guild;
                availableConfig = config;
                break;
              } else {
                console.log(`[DM] User is blocked in ${guild.name}`);
              }
            }
          } catch (e: any) {
            console.log(`[DM] Error checking guild ${guild.name}: ${e.message}`);
          }
        }

        if (!availableGuild || !availableConfig) {
          console.log(`[DM] No available guild found for user ${message.author.id}`);
          await message.reply("❌ Sorry, the support ticket system is not configured yet. Please contact a server administrator to set up the modmail system using `/setup_modmail`.");
          return;
        }

        // Parse custom categories from config
        let customCategories: { id: string; label: string; description: string; emoji?: string }[] = [];
        if (availableConfig?.customModmailCategories) {
          try {
            customCategories = JSON.parse(availableConfig.customModmailCategories);
          } catch (e) {
            customCategories = [];
          }
        }

        if (customCategories.length === 0) {
          await message.reply("No ticket categories are configured for this server. Please contact a staff member.");
          return;
        }

        // Send category selection dropdown
        const embed = new EmbedBuilder()
          .setTitle("Open a Support Ticket")
          .setDescription("Select a category below to open a new support ticket.")
          .setColor(0x5865f2);

        const selectOptions: StringSelectMenuOptionBuilder[] = [];
        for (const cat of customCategories) {
          const option = new StringSelectMenuOptionBuilder()
            .setLabel(cat.label)
            .setDescription(cat.description.substring(0, 100))
            .setValue(cat.id);
          if (cat.emoji) option.setEmoji(cat.emoji);
          selectOptions.push(option);
        }

        const selectMenu = new StringSelectMenuBuilder()
          .setCustomId(`dm_ticket_select_${availableGuild.id}`)
          .setPlaceholder("Select a category...")
          .addOptions(selectOptions);

        const row = new ActionRowBuilder<StringSelectMenuBuilder>().addComponents(selectMenu);

        console.log(`[DM] Sending category dropdown to user ${message.author.id}`);
        try {
          const sentMessage = await message.reply({
            embeds: [embed],
            components: [row],
          });

          console.log(`[DM] Category dropdown sent successfully, message ID: ${sentMessage.id}`);

          pendingDMTickets.set(message.author.id, {
            messageId: sentMessage.id,
            guildId: availableGuild.id,
            sentAt: Date.now(),
          });
        } catch (sendError: any) {
          console.log(`[DM] Failed to send category dropdown: ${sendError.message}`);
          console.log(`[DM] Full error:`, sendError);
        }

        return;
      }

      // Relay message to existing modmail channel
      try {
        let modmailChannel;
        try {
          modmailChannel = await client.channels.fetch(targetThread.channelId!);
        } catch (fetchError: any) {
          if (fetchError.code === 10003) {
            // Channel was deleted - close the thread and let user start fresh
            console.log(`[DM] Modmail channel ${targetThread.channelId} no longer exists, closing thread`);
            await storage.updateModmailThread(targetThread.id, { status: "closed", closeReason: "Channel deleted" });
            await message.reply("Your previous ticket channel was deleted. Please send a new message to open a fresh ticket.");
            return;
          }
          throw fetchError;
        }
        if (modmailChannel && "send" in modmailChannel) {
          // Cancel any pending inactivity and timed close timers when user responds
          const channelId = targetThread.channelId!;

          // Cancel inactivity warning timer
          const existingWarning = pendingInactivityWarnings.get(channelId);
          if (existingWarning) {
            clearTimeout(existingWarning.timeout);
            pendingInactivityWarnings.delete(channelId);
          }

          // Cancel inactivity auto-close timer
          const existingClose = pendingInactivityCloses.get(channelId);
          if (existingClose) {
            clearTimeout(existingClose.timeout);
            pendingInactivityCloses.delete(channelId);
          }

          // Cancel timed close (!c) timer
          const existingTimedClose = pendingTimedCloses.get(channelId);
          if (existingTimedClose) {
            clearTimeout(existingTimedClose);
            pendingTimedCloses.delete(channelId);
            // Notify staff that timed close was cancelled
            await modmailChannel.send({ content: "⏰ Timed close cancelled - user responded." });
          }

          // Restart claim expiry timer if ticket is claimed (claimer has 15 mins to respond to user's message)
          if (targetThread.claimedById) {
            const existingClaimTimer = pendingClaimExpiry.get(channelId);
            if (existingClaimTimer) {
              clearTimeout(existingClaimTimer.timeout);
            }

            const CLAIM_EXPIRY_TIME = 15 * 60 * 1000;
            const claimerId = targetThread.claimedById;
            const claimExpiryTimeout = setTimeout(async () => {
              pendingClaimExpiry.delete(channelId);

              try {
                const currentThread = isAppealThread
                  ? await storage.getAppealThreadByChannel(channelId)
                  : await storage.getModmailThreadByChannel(channelId);
                if (!currentThread || currentThread.status !== "open") return;
                if (currentThread.claimedById !== claimerId) return;

                if (isAppealThread) {
                  await storage.updateAppealThread(currentThread.id, { claimedById: null });
                } else {
                  await storage.updateModmailThread(currentThread.id, { claimedById: null });
                }
                const channel = await client.channels.fetch(channelId);
                if (channel && "send" in channel) {
                  await channel.send(`Ticket auto-unclaimed. <@${claimerId}> did not respond within 15 minutes.`);
                }
              } catch (e) {
                console.log("Could not process auto-unclaim on user message");
              }
            }, CLAIM_EXPIRY_TIME);

            pendingClaimExpiry.set(channelId, {
              timeout: claimExpiryTimeout,
              claimerId: claimerId,
            });
          }

          const userEmbed = new EmbedBuilder()
            .setAuthor({ name: message.author.tag, iconURL: message.author.displayAvatarURL() })
            .setDescription(message.content || "(No text content)")
            .setColor(0x57f287)
            .setTimestamp();

          // Collect attachment URLs
          const attachmentUrls = message.attachments.map(a => a.url);

          // Add attachment info to embed if there are any
          if (attachmentUrls.length > 0) {
            userEmbed.addFields({ name: "Attachments", value: attachmentUrls.join("\n"), inline: false });
            // Set the first image as the embed image if it's an image
            const firstImageAttachment = message.attachments.find(a => a.contentType?.startsWith("image/"));
            if (firstImageAttachment) {
              userEmbed.setImage(firstImageAttachment.url);
            }
          }

          const channelMsg = await modmailChannel.send({ embeds: [userEmbed] });

          // Ping subscribed users
          const subs = targetThread.subscribedUserIds || [];
          if (subs.length > 0) {
            const pingContent = subs.map((id: string) => `<@${id}>`).join(" ");
            const pingMsg = await modmailChannel.send({ content: pingContent });
            // Delete ping message after a short delay to keep channel clean
            setTimeout(() => pingMsg.delete().catch(() => {}), 3000);
          }

          // Save message with both DM message ID and channel message ID for edit/delete tracking
          if (isAppealThread) {
            await storage.addAppealMessage({
              threadId: targetThread.id,
              authorId: message.author.id,
              content: message.content,
              isStaff: "false",
              dmMessageId: message.id,
              channelMessageId: channelMsg.id,
            });
          } else {
            await storage.addModmailMessage({
              threadId: targetThread.id,
              authorId: message.author.id,
              content: message.content,
              isStaff: "false",
              dmMessageId: message.id,
              channelMessageId: channelMsg.id,
            });
          }

          // React to confirm
          await message.react("✅");
        }
      } catch (error) {
        console.log("Could not relay message:", error);
      }
    } catch (error) {
      console.log("DM handler error:", error);
    }
    return;
  }

  // Handle .r <message> reply command in modmail/appeal channels (also allows .r with just attachments)
  if (message.guild && (lowerContent.startsWith(`${lowerPrefix}r `) || (lowerContent === `${lowerPrefix}r` && message.attachments.size > 0))) {
    console.log(`[.r HANDLER] Processing reply command: ${message.id} - "${message.content}"`);
    // Check for modmail thread first, then appeal thread
    const modmailThread = await storage.getModmailThreadByChannel(message.channel.id);
    const appealThread = await storage.getAppealThreadByChannel(message.channel.id);
    const thread = modmailThread || appealThread;
    const isAppeal = !modmailThread && !!appealThread;

    if (!thread) {
      return;
    }

    const replyContent = lowerContent === `${lowerPrefix}r` ? "" : message.content.substring(prefix.length + 2).trim();
    if (!replyContent && message.attachments.size === 0) {
      await message.reply(`Please provide a message or attach files. Usage: \`${prefix}r <message>\` or \`${prefix}r\` with attachments`);
      return;
    }

    if (thread.status !== "open") {
      await message.reply("This ticket is already closed.");
      return;
    }

    try {
      const user = await client.users.fetch(thread.userId);

      // Get staff member's highest meaningful role name
      let roleName = "Staff";
      const member = message.member;
      if (member && member.roles.cache.size > 0) {
        // Get the highest role that isn't @everyone (position 0)
        const roles = member.roles.cache
          .filter(r => r.id !== message.guild!.id) // Exclude @everyone
          .sort((a, b) => b.position - a.position);
        if (roles.size > 0) {
          roleName = roles.first()!.name;
        }
      }

      const staffEmbed = new EmbedBuilder()
        .setAuthor({ name: roleName, iconURL: message.author.displayAvatarURL() })
        .setDescription(replyContent || "(Attachment)")
        .setColor(0x5865f2)
        .setFooter({ text: message.author.tag })
        .setTimestamp();

      // Collect attachment URLs from the .r message
      const attachmentUrls = message.attachments.map(a => a.url);

      // Add attachment info to embed if there are any
      if (attachmentUrls.length > 0) {
        staffEmbed.addFields({ name: "Attachments", value: attachmentUrls.join("\n"), inline: false });
        // Set the first image as the embed image if it's an image
        const firstImageAttachment = message.attachments.find(a => a.contentType?.startsWith("image/"));
        if (firstImageAttachment) {
          staffEmbed.setImage(firstImageAttachment.url);
        }
      }

      // Send to user DM
      console.log(`[.r HANDLER] Sending DM to user ${user.id}...`);
      const dmMessage = await user.send({ embeds: [staffEmbed] });
      console.log(`[.r HANDLER] DM sent: ${dmMessage.id}`);

      // Send to channel as well
      console.log(`[.r HANDLER] Sending to channel ${message.channel.id}...`);
      const channelMessage = await (message.channel as any).send({ embeds: [staffEmbed] });
      console.log(`[.r HANDLER] Channel message sent: ${channelMessage.id}`);

      // Save message with message IDs
      if (isAppeal) {
        await storage.addAppealMessage({
          threadId: thread.id,
          authorId: message.author.id,
          content: replyContent,
          isStaff: "true",
          channelMessageId: channelMessage.id,
          dmMessageId: dmMessage.id,
        });
      } else {
        await storage.addModmailMessage({
          threadId: thread.id,
          authorId: message.author.id,
          content: replyContent,
          isStaff: "true",
          channelMessageId: channelMessage.id,
          dmMessageId: dmMessage.id,
        });
      }

      // Clear claim expiry timer only when the CLAIMER responds (not just any staff)
      const existingClaimTimer = pendingClaimExpiry.get(message.channel.id);
      if (existingClaimTimer && existingClaimTimer.claimerId === message.author.id) {
        clearTimeout(existingClaimTimer.timeout);
        pendingClaimExpiry.delete(message.channel.id);
      }

      // Cancel any existing inactivity timers for this channel
      const existingWarning = pendingInactivityWarnings.get(message.channel.id);
      if (existingWarning) {
        clearTimeout(existingWarning.timeout);
        pendingInactivityWarnings.delete(message.channel.id);
      }
      const existingClose = pendingInactivityCloses.get(message.channel.id);
      if (existingClose) {
        clearTimeout(existingClose.timeout);
        pendingInactivityCloses.delete(message.channel.id);
      }

      // Only start inactivity timer if ignoreInactivity is not set (modmail only, appeals don't have this)
      const modmailIgnore = !isAppeal && (thread as any).ignoreInactivity === "true";
      if (modmailIgnore) {
        // Skip inactivity timer for this ticket
        try {
          await message.delete();
        } catch (e) {
          console.log("Could not delete trigger message:", e);
        }
        return;
      }

      // Start 15-minute inactivity warning timer
      const FIFTEEN_MINUTES = 15 * 60 * 1000;
      const warningTime = Date.now() + FIFTEEN_MINUTES;
      const closeTime = Date.now() + (30 * 60 * 1000); // 30 minutes total

      // Capture references synchronously before async timeouts
      const channelId = message.channel.id;
      const guildId = message.guild?.id;
      const staffId = message.author.id;

      const warningTimeout = setTimeout(async () => {
        pendingInactivityWarnings.delete(channelId);

        // Re-fetch thread to make sure it's still open
        const currentThread = await storage.getModmailThreadByChannel(channelId);
        if (!currentThread || currentThread.status !== "open") return;

        // Send warning message with hammer time timestamp
        const closeTimestamp = Math.floor(closeTime / 1000);
        try {
          const warningEmbed = new EmbedBuilder()
            .setTitle("⚠️ Inactivity Warning")
            .setDescription(`Due to inactivity, this ticket will be closed <t:${closeTimestamp}:R>.`)
            .setColor(0xf0b232)
            .setTimestamp();

          const channel = await client.channels.fetch(channelId);
          if (!channel || !("send" in channel)) return;

          const warningMsg = await (channel as any).send({ embeds: [warningEmbed] });

          // Also notify the user in DM
          try {
            const ticketUser = await client.users.fetch(currentThread.userId);
            await ticketUser.send({ embeds: [warningEmbed] });
          } catch (e) {
            // console.log("Could not DM user about inactivity warning");
          }

          // Schedule auto-close after another 15 minutes
          const closeTimeout = setTimeout(async () => {
            pendingInactivityCloses.delete(channelId);

            const threadToClose = await storage.getModmailThreadByChannel(channelId);
            if (!threadToClose || threadToClose.status !== "open") return;

            // Clear claim expiry timer on inactivity close
            const inactivityClaimTimer = pendingClaimExpiry.get(channelId);
            if (inactivityClaimTimer) {
              clearTimeout(inactivityClaimTimer.timeout);
              pendingClaimExpiry.delete(channelId);
            }

            // Close the thread
            await storage.updateModmailThread(threadToClose.id, {
              status: "closed",
              closedById: staffId,
              closeReason: "Closed due to inactivity",
              closedAt: new Date(),
            });

            // Award 1 activity point to the staff member who handled it
            if (guildId) {
              await storage.addModmailActivityEntries(guildId, staffId, 1);
            }

            // Log to modmail log channel
            if (guildId) {
              const config = await storage.getGuildConfig(guildId);
              if (config?.modmailLogChannelId) {
                try {
                  const logChannel = await client.channels.fetch(config.modmailLogChannelId);
                  if (logChannel && "send" in logChannel) {
                    const messages = await storage.getModmailMessages(threadToClose.id);
                    let transcript = messages.map(m => `[${m.isStaff === "true" ? "Staff" : "User"}] <@${m.authorId}>: ${m.content}`).join("\n");
                    if (transcript.length > 1900) transcript = transcript.substring(0, 1900) + "...";

                    const logEmbed = new EmbedBuilder()
                      .setTitle("Ticket Closed (Inactivity)")
                      .setColor(0xed4245)
                      .addFields(
                        { name: "User", value: `<@${threadToClose.userId}>`, inline: true },
                        { name: "Closed By", value: `<@${staffId}> (auto)`, inline: true },
                        { name: "Transcript", value: transcript || "No messages", inline: false }
                      )
                      .setTimestamp();
                    await logChannel.send({ embeds: [logEmbed] });
                  }
                } catch (e) {
                  console.log("Could not send modmail log");
                }
              }
            }

            // Delete the channel
            try {
              const chanToDelete = await client.channels.fetch(channelId);
              if (chanToDelete) await chanToDelete.delete();
            } catch (e) { }
          }, FIFTEEN_MINUTES);

          pendingInactivityCloses.set(channelId, {
            timeout: closeTimeout,
            staffId: staffId,
          });
        } catch (e) {
          console.log("Could not send inactivity warning:", e);
        }
      }, FIFTEEN_MINUTES);

      pendingInactivityWarnings.set(channelId, {
        timeout: warningTimeout,
        staffId: staffId,
      });

      // Delete the original trigger message
      try {
        await message.delete();
      } catch (e) {
        console.log("Could not delete trigger message:", e);
      }
    } catch (error) {
      console.log("Could not relay staff message to user:", error);
      await message.react("❌");
    }
    return;
  }

  // Handle .ar <message> anonymous reply command in modmail/appeal channels
  if (message.guild && (lowerContent.startsWith(`${lowerPrefix}ar `) || (lowerContent === `${lowerPrefix}ar` && message.attachments.size > 0))) {
    // Check for modmail thread first, then appeal thread
    const modmailThread = await storage.getModmailThreadByChannel(message.channel.id);
    const appealThread = await storage.getAppealThreadByChannel(message.channel.id);
    const thread = modmailThread || appealThread;
    const isAppeal = !modmailThread && !!appealThread;

    if (!thread) {
      return;
    }

    const replyContent = lowerContent === `${lowerPrefix}ar` ? "" : message.content.substring(prefix.length + 3).trim();
    if (!replyContent && message.attachments.size === 0) {
      await message.reply(`Please provide a message or attach files. Usage: \`${prefix}ar <message>\` or \`${prefix}ar\` with attachments`);
      return;
    }

    if (thread.status !== "open") {
      await message.reply("This ticket is already closed.");
      return;
    }

    try {
      const user = await client.users.fetch(thread.userId);

      // Anonymous reply - use "Staff Team" instead of individual staff info
      const staffEmbed = new EmbedBuilder()
        .setAuthor({ name: "Staff Team" })
        .setDescription(replyContent || "(Attachment)")
        .setColor(0x5865f2)
        .setTimestamp();

      // Collect attachment URLs from the .ar message
      const attachmentUrls = message.attachments.map(a => a.url);

      // Add attachment info to embed if there are any
      if (attachmentUrls.length > 0) {
        staffEmbed.addFields({ name: "Attachments", value: attachmentUrls.join("\n"), inline: false });
        const firstImageAttachment = message.attachments.find(a => a.contentType?.startsWith("image/"));
        if (firstImageAttachment) {
          staffEmbed.setImage(firstImageAttachment.url);
        }
      }

      // Send to user DM
      const dmMessage = await user.send({ embeds: [staffEmbed] });

      // For channel message, show sender name for staff visibility but no pfp
      const channelEmbed = new EmbedBuilder()
        .setAuthor({ name: "Staff Team (Anonymous)" })
        .setDescription(replyContent || "(Attachment)")
        .setColor(0x5865f2)
        .setFooter({ text: `Sent by ${message.author.tag}` })
        .setTimestamp();

      if (attachmentUrls.length > 0) {
        channelEmbed.addFields({ name: "Attachments", value: attachmentUrls.join("\n"), inline: false });
        const firstImageAttachment = message.attachments.find(a => a.contentType?.startsWith("image/"));
        if (firstImageAttachment) {
          channelEmbed.setImage(firstImageAttachment.url);
        }
      }

      // Send to channel
      const channelMessage = await (message.channel as any).send({ embeds: [channelEmbed] });

      // Save message with message IDs
      if (isAppeal) {
        await storage.addAppealMessage({
          threadId: thread.id,
          authorId: message.author.id,
          content: `[Anonymous] ${replyContent}`,
          isStaff: "true",
          channelMessageId: channelMessage.id,
          dmMessageId: dmMessage.id,
        });
      } else {
        await storage.addModmailMessage({
          threadId: thread.id,
          authorId: message.author.id,
          content: `[Anonymous] ${replyContent}`,
          isStaff: "true",
          channelMessageId: channelMessage.id,
          dmMessageId: dmMessage.id,
        });
      }

      // Clear claim expiry timer only when the CLAIMER responds (not just any staff)
      const existingClaimTimer = pendingClaimExpiry.get(message.channel.id);
      if (existingClaimTimer && existingClaimTimer.claimerId === message.author.id) {
        clearTimeout(existingClaimTimer.timeout);
        pendingClaimExpiry.delete(message.channel.id);
      }

      // Cancel any existing inactivity timers for this channel (only for modmail)
      if (!isAppeal) {
        const existingWarning = pendingInactivityWarnings.get(message.channel.id);
        if (existingWarning) {
          clearTimeout(existingWarning.timeout);
          pendingInactivityWarnings.delete(message.channel.id);
        }
        const existingClose = pendingInactivityCloses.get(message.channel.id);
        if (existingClose) {
          clearTimeout(existingClose.timeout);
          pendingInactivityCloses.delete(message.channel.id);
        }
      }

      // For appeals, just delete message and return (no inactivity tracking)
      if (isAppeal) {
        try {
          await message.delete();
        } catch (e) {
          console.log("Could not delete trigger message:", e);
        }
        return;
      }

      // Only start inactivity timer if ignoreInactivity is not set (modmail only)
      if ((thread as any).ignoreInactivity === "true") {
        try {
          await message.delete();
        } catch (e) {
          console.log("Could not delete trigger message:", e);
        }
        return;
      }

      // Start 15-minute inactivity warning timer
      const FIFTEEN_MINUTES = 15 * 60 * 1000;
      const warningTime = Date.now() + FIFTEEN_MINUTES;
      const closeTime = Date.now() + (30 * 60 * 1000);

      const channelId = message.channel.id;
      const guildId = message.guild?.id;
      const staffId = message.author.id;

      const warningTimeout = setTimeout(async () => {
        pendingInactivityWarnings.delete(channelId);

        const currentThread = await storage.getModmailThreadByChannel(channelId);
        if (!currentThread || currentThread.status !== "open") return;

        const closeTimestamp = Math.floor(closeTime / 1000);
        try {
          const warningEmbed = new EmbedBuilder()
            .setTitle("⚠️ Inactivity Warning")
            .setDescription(`Due to inactivity, this ticket will be closed <t:${closeTimestamp}:R>.`)
            .setColor(0xf0b232)
            .setTimestamp();

          const channel = await client.channels.fetch(channelId);
          if (!channel || !("send" in channel)) return;

          await (channel as any).send({ embeds: [warningEmbed] });

          try {
            const ticketUser = await client.users.fetch(currentThread.userId);
            await ticketUser.send({ embeds: [warningEmbed] });
          } catch (e) {
            // console.log("Could not DM user about inactivity warning");
          }

          const closeTimeout = setTimeout(async () => {
            pendingInactivityCloses.delete(channelId);

            const threadToClose = await storage.getModmailThreadByChannel(channelId);
            if (!threadToClose || threadToClose.status !== "open") return;

            const inactivityClaimTimer = pendingClaimExpiry.get(channelId);
            if (inactivityClaimTimer) {
              clearTimeout(inactivityClaimTimer.timeout);
              pendingClaimExpiry.delete(channelId);
            }

            await storage.updateModmailThread(threadToClose.id, { status: "closed" });

            try {
              const closedUser = await client.users.fetch(threadToClose.userId);
              const closeEmbed = new EmbedBuilder()
                .setTitle("Ticket Closed")
                .setDescription("Your ticket has been closed due to inactivity. If you need further assistance, please open a new ticket.")
                .setColor(0xed4245)
                .setTimestamp();
              await closedUser.send({ embeds: [closeEmbed] });
            } catch (e) {
              console.log("Could not notify user of ticket closure");
            }

            if (guildId) {
              const threadConfig = await storage.getGuildConfig(guildId);
              if (threadConfig?.modmailLogChannelId) {
                try {
                  const logChannel = await client.channels.fetch(threadConfig.modmailLogChannelId);
                  if (logChannel && "send" in logChannel) {
                    const messages = await storage.getModmailMessages(threadToClose.id);
                    let transcript = messages.map(m => `[${m.isStaff === "true" ? "Staff" : "User"}] <@${m.authorId}>: ${m.content}`).join("\n");
                    if (transcript.length > 1900) transcript = transcript.substring(0, 1900) + "...";

                    const logEmbed = new EmbedBuilder()
                      .setTitle("Ticket Closed (Inactivity)")
                      .setColor(0xed4245)
                      .addFields(
                        { name: "User", value: `<@${threadToClose.userId}>`, inline: true },
                        { name: "Closed By", value: `<@${staffId}> (auto)`, inline: true },
                        { name: "Transcript", value: transcript || "No messages", inline: false }
                      )
                      .setTimestamp();
                    await logChannel.send({ embeds: [logEmbed] });
                  }
                } catch (e) {
                  console.log("Could not send modmail log");
                }
              }
            }

            try {
              const chanToDelete = await client.channels.fetch(channelId);
              if (chanToDelete) await chanToDelete.delete();
            } catch (e) { }
          }, FIFTEEN_MINUTES);

          pendingInactivityCloses.set(channelId, {
            timeout: closeTimeout,
            staffId: staffId,
          });
        } catch (e) {
          console.error("Could not send inactivity warning:", e);
        }
      }, FIFTEEN_MINUTES);

      pendingInactivityWarnings.set(channelId, {
        timeout: warningTimeout,
        staffId: staffId,
      });

      try {
        await message.delete();
      } catch (e) { }
    } catch (error) {
      console.log("Could not relay anonymous staff message to user:", error);
      await message.react("❌");
    }
    return;
  }

  // Handle .edit (message_id) (new_message) or .edit (new_message) for most recent
  if (message.guild && lowerContent.startsWith(`${lowerPrefix}edit `)) {
    // Check for modmail thread first, then appeal thread
    const modmailThread = await storage.getModmailThreadByChannel(message.channel.id);
    const appealThread = await storage.getAppealThreadByChannel(message.channel.id);
    const thread = modmailThread || appealThread;
    const isAppeal = !modmailThread && !!appealThread;

    if (!thread) {
      return;
    }

    if (thread.status !== "open") {
      await message.reply("❌ This ticket is already closed.");
      return;
    }

    const args = message.content.substring(prefix.length + 5).trim();
    let modmailMsg: any;
    let newContent: string;

    // Check if first arg looks like an ID (UUID format or Discord snowflake)
    const parts = args.split(" ");
    const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
    const discordIdRegex = /^\d{17,20}$/;

    if (parts[0] && uuidRegex.test(parts[0])) {
      // First arg is UUID database ID
      modmailMsg = isAppeal ? await storage.getAppealMessage(parts[0]) : await storage.getModmailMessage(parts[0]);
      newContent = parts.slice(1).join(" ");
    } else if (parts[0] && discordIdRegex.test(parts[0])) {
      // First arg is Discord message ID (snowflake)
      modmailMsg = isAppeal ? await storage.getAppealMessageByChannelMessageId(parts[0]) : await storage.getModmailMessageByChannelMessageId(parts[0]);
      newContent = parts.slice(1).join(" ");
    } else {
      // No ID provided, use most recent staff message
      modmailMsg = isAppeal ? await storage.getLatestStaffAppealMessage(thread.id) : await storage.getLatestStaffModmailMessage(thread.id);
      newContent = args;
    }

    if (!modmailMsg) {
      await message.reply("❌ Could not find the message to edit. You can use the Discord message ID or leave blank to edit your most recent message.");
      return;
    }

    if (!newContent) {
      await message.reply(`❌ Please provide the new message content. Usage: \`${prefix}edit (message_id) <new_message>\``);
      return;
    }

    try {
      const user = await client.users.fetch(thread.userId);

      // Get staff member's highest meaningful role name
      let editRoleName = "Staff";
      const editMember = message.member;
      if (editMember && editMember.roles.cache.size > 0) {
        const roles = editMember.roles.cache
          .filter(r => r.id !== message.guild!.id)
          .sort((a, b) => b.position - a.position);
        if (roles.size > 0) {
          editRoleName = roles.first()!.name;
        }
      }

      // Edit the channel message if we have its ID - preserve original author
      if (modmailMsg.channelMessageId) {
        try {
          const channelMsg = await (message.channel as any).messages.fetch(modmailMsg.channelMessageId);
          // Get the original embed's author info to preserve it
          const originalEmbed = channelMsg.embeds[0];
          const originalAuthor = originalEmbed?.author;

          const editedEmbed = new EmbedBuilder()
            .setAuthor(originalAuthor ? { name: originalAuthor.name, iconURL: originalAuthor.iconURL || undefined } : { name: editRoleName })
            .setDescription(newContent)
            .setColor(0x5865f2)
            .setFooter(originalEmbed?.footer ? { text: originalEmbed.footer.text } : { text: "Staff" })
            .setTimestamp();
          await channelMsg.edit({ embeds: [editedEmbed] });
        } catch (e) {
          console.error("Could not edit channel message:", e);
        }
      }

      // Edit the DM message if we have its ID - preserve original author
      if (modmailMsg.dmMessageId) {
        try {
          const dmChannel = await user.createDM();
          const dmMsg = await dmChannel.messages.fetch(modmailMsg.dmMessageId);
          // Get the original embed's author info to preserve it
          const originalEmbed = dmMsg.embeds[0];
          const originalAuthor = originalEmbed?.author;

          const editedEmbed = new EmbedBuilder()
            .setAuthor(originalAuthor ? { name: originalAuthor.name, iconURL: originalAuthor.iconURL || undefined } : { name: editRoleName })
            .setDescription(newContent)
            .setColor(0x5865f2)
            .setFooter(originalEmbed?.footer ? { text: originalEmbed.footer.text } : { text: "Staff" })
            .setTimestamp();
          await dmMsg.edit({ embeds: [editedEmbed] });
        } catch (e) {
          console.error("Could not edit DM message:", e);
        }
      }

      // Update in database - preserve [Anonymous] prefix if it was an anonymous message
      const isAnonymousMessage = modmailMsg.content?.startsWith("[Anonymous]");
      const updatedContent = isAnonymousMessage ? `[Anonymous] ${newContent}` : newContent;

      // Re-edit channel message with proper anonymous handling if this was an anonymous message
      if (isAnonymousMessage && modmailMsg.channelMessageId) {
        try {
          const channelMsg = await (message.channel as any).messages.fetch(modmailMsg.channelMessageId);
          const anonChannelEmbed = new EmbedBuilder()
            .setAuthor({ name: "Staff Team (Anonymous)" })
            .setDescription(newContent)
            .setColor(0x5865f2)
            .setFooter({ text: `Edited by ${message.author.tag}` })
            .setTimestamp();
          await channelMsg.edit({ embeds: [anonChannelEmbed] });
        } catch (e) {
          console.error("Could not edit anonymous channel message:", e);
        }
      }

      // Re-edit DM message with proper anonymous handling if this was an anonymous message
      if (isAnonymousMessage && modmailMsg.dmMessageId) {
        try {
          const dmChannel = await user.createDM();
          const dmMsg = await dmChannel.messages.fetch(modmailMsg.dmMessageId);
          const anonDmEmbed = new EmbedBuilder()
            .setAuthor({ name: "Staff Team" })
            .setDescription(newContent)
            .setColor(0x5865f2)
            .setTimestamp();
          await dmMsg.edit({ embeds: [anonDmEmbed] });
        } catch (e) {
          console.error("Could not edit anonymous DM message:", e);
        }
      }

      if (isAppeal) {
        await storage.updateAppealMessage(modmailMsg.id, { content: updatedContent });
      } else {
        await storage.updateModmailMessage(modmailMsg.id, { content: updatedContent });
      }

      // Delete the edit command message
      try {
        await message.delete();
      } catch (e) {}

      // Send confirmation embed
      const editConfirmEmbed = new EmbedBuilder()
        .setDescription("✅ Message edited successfully.")
        .setColor(0x23a559)
        .setTimestamp();
      await (message.channel as any).send({ embeds: [editConfirmEmbed] });
    } catch (error) {
      console.log("Could not edit message:", error);
      await message.reply("❌ Failed to edit message.");
    }
    return;
  }

  // Handle .delete (message_id) or .delete for most recent
  if (message.guild && lowerContent.startsWith(`${lowerPrefix}delete`)) {
    // Check for modmail thread first, then appeal thread
    const modmailThread = await storage.getModmailThreadByChannel(message.channel.id);
    const appealThread = await storage.getAppealThreadByChannel(message.channel.id);
    const thread = modmailThread || appealThread;
    const isAppeal = !modmailThread && !!appealThread;

    if (!thread) {
      return;
    }

    if (thread.status !== "open") {
      await message.reply("❌ This ticket is already closed.");
      return;
    }

    const args = message.content.substring(prefix.length + 6).trim();
    let modmailMsg: any;

    // Check if arg looks like an ID (UUID format or Discord snowflake)
    const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
    const discordIdRegex = /^\d{17,20}$/;

    if (args && uuidRegex.test(args)) {
      // UUID database ID
      modmailMsg = isAppeal ? await storage.getAppealMessage(args) : await storage.getModmailMessage(args);
    } else if (args && discordIdRegex.test(args)) {
      // Discord message ID (snowflake)
      modmailMsg = isAppeal ? await storage.getAppealMessageByChannelMessageId(args) : await storage.getModmailMessageByChannelMessageId(args);
    } else {
      // No ID provided, use most recent staff message
      modmailMsg = isAppeal ? await storage.getLatestStaffAppealMessage(thread.id) : await storage.getLatestStaffModmailMessage(thread.id);
    }

    if (!modmailMsg) {
      await message.reply("❌ Could not find the message to delete. You can use the Discord message ID or leave blank to delete your most recent message.");
      return;
    }

    try {
      const user = await client.users.fetch(thread.userId);

      // Delete the channel message if we have its ID
      if (modmailMsg.channelMessageId) {
        try {
          const channelMsg = await (message.channel as any).messages.fetch(modmailMsg.channelMessageId);
          await channelMsg.delete();
        } catch (e) {
          console.log("Could not delete channel message:", e);
        }
      }

      // Delete the DM message if we have its ID
      if (modmailMsg.dmMessageId) {
        try {
          const dmChannel = await user.createDM();
          const dmMsg = await dmChannel.messages.fetch(modmailMsg.dmMessageId);
          await dmMsg.delete();
        } catch (e) {
          console.log("Could not delete DM message:", e);
        }
      }

      // Delete from database
      if (isAppeal) {
        await storage.deleteAppealMessage(modmailMsg.id);
      } else {
        await storage.deleteModmailMessage(modmailMsg.id);
      }

      // Delete the delete command message
      try {
        await message.delete();
      } catch (e) {}

      // Send confirmation embed (doesn't auto-delete)
      const deleteConfirmEmbed = new EmbedBuilder()
        .setDescription("✅ Message deleted successfully.")
        .setColor(0x23a559)
        .setTimestamp();
      await (message.channel as any).send({ embeds: [deleteConfirmEmbed] });
    } catch (error) {
      console.error("Could not delete message:", error);
      await message.reply("❌ Failed to delete message.");
    }
    return;
  }

  // Handle .sub, .subscribe, .unsub, .unsubscribe commands to subscribe/unsubscribe from a ticket
  // Supports: .sub (self), .sub @user (other), .unsub (self), .unsub @user (other)
  if (message.guild && (lowerContent === `${lowerPrefix}sub` || lowerContent === `${lowerPrefix}subscribe` || 
      lowerContent === `${lowerPrefix}unsub` || lowerContent === `${lowerPrefix}unsubscribe` ||
      lowerContent.startsWith(`${lowerPrefix}sub `) || lowerContent.startsWith(`${lowerPrefix}subscribe `) ||
      lowerContent.startsWith(`${lowerPrefix}unsub `) || lowerContent.startsWith(`${lowerPrefix}unsubscribe `))) {
    // Check for modmail thread first, then appeal thread
    const modmailThread = await storage.getModmailThreadByChannel(message.channel.id);
    const appealThread = await storage.getAppealThreadByChannel(message.channel.id);
    const thread = modmailThread || appealThread;
    const isAppeal = !modmailThread && !!appealThread;

    if (!thread) {
      return;
    }

    try {
      // Determine if unsubscribe command
      const wantsToUnsubscribe = lowerContent.startsWith(`${lowerPrefix}unsub`);

      // Check for mentioned user or user ID
      const mentionedUser = message.mentions.users.first();
      let targetUserId = message.author.id;
      let targetLabel = "You";

      if (mentionedUser) {
        targetUserId = mentionedUser.id;
        targetLabel = `<@${mentionedUser.id}>`;
      } else {
        // Check for user ID in message content
        const parts = message.content.split(/\s+/);
        if (parts.length > 1) {
          const possibleId = parts[1];
          // Check if it's a valid Discord snowflake (17-19 digits)
          if (/^\d{17,19}$/.test(possibleId)) {
            targetUserId = possibleId;
            targetLabel = `<@${possibleId}>`;
          }
        }
      }

      const currentSubs = thread.subscribedUserIds || [];
      const isSubscribed = currentSubs.includes(targetUserId);
      let newSubs;
      let action;

      const isOtherUser = targetUserId !== message.author.id;

      if (wantsToUnsubscribe) {
        if (!isSubscribed) {
          await (message.channel as any).send(`❌ ${targetLabel} ${isOtherUser ? "is" : "are"} not subscribed to this ticket.`);
          return;
        }
        newSubs = currentSubs.filter(id => id !== targetUserId);
        action = "unsubscribed from";
      } else {
        if (isSubscribed) {
          await (message.channel as any).send(`❌ ${targetLabel} ${isOtherUser ? "is" : "are"} already subscribed to this ticket.`);
          return;
        }
        newSubs = [...currentSubs, targetUserId];
        action = "subscribed to";
      }

      if (isAppeal) {
        await storage.updateAppealThread(thread.id, { subscribedUserIds: newSubs });
      } else {
        await storage.updateModmailThread(thread.id, { subscribedUserIds: newSubs });
      }

      if (isOtherUser) {
        await (message.channel as any).send(`✅ ${targetLabel} has been ${action} this ticket.`);
      } else {
        await (message.channel as any).send(`✅ You have ${action} this ticket.`);
      }
    } catch (error) {
      console.error("Sub command error:", error);
    }
    return;
  }

  // Staff messages in modmail channels WITHOUT .r prefix are NOT sent to user
  // This allows staff to discuss in the channel privately
  // BUT we should still clear the claim expiry timer if any staff member sends a message
  if (message.guild && !message.author.bot) {
    const thread = await storage.getModmailThreadByChannel(message.channel.id);
    if (thread && thread.status === "open") {
      const existingClaimTimer = pendingClaimExpiry.get(message.channel.id);
      if (existingClaimTimer) {
        clearTimeout(existingClaimTimer.timeout);
        pendingClaimExpiry.delete(message.channel.id);
      }
    }
  }
});

const syncingUsers = new Set<string>();
const pendingRosterUpdates = new Map<string, NodeJS.Timeout>();
const activeRosterUpdates = new Set<string>();

// Cleanup for role sync and roster update tracking (every 5 minutes)
setInterval(() => {
  // Safety valve: clear syncingUsers if it gets too large
  if (syncingUsers.size > 50) {
    console.log(`[CLEANUP] Clearing ${syncingUsers.size} stale syncing users`);
    syncingUsers.clear();
  }

  // Clear stale roster updates
  if (pendingRosterUpdates.size > 20) {
    console.log(`[CLEANUP] Clearing ${pendingRosterUpdates.size} stale roster updates`);
    for (const [id, timeout] of Array.from(pendingRosterUpdates.entries())) {
      clearTimeout(timeout);
    }
    pendingRosterUpdates.clear();
  }

  // Clear stale active roster updates
  if (activeRosterUpdates.size > 10) {
    console.log(`[CLEANUP] Clearing ${activeRosterUpdates.size} stale active roster updates`);
    activeRosterUpdates.clear();
  }
}, 5 * 60 * 1000);

function scheduleRosterUpdate(guildId: string) {
  const existing = pendingRosterUpdates.get(guildId);
  if (existing) {
    clearTimeout(existing);
  }

  const timeout = setTimeout(async () => {
    pendingRosterUpdates.delete(guildId);

    if (activeRosterUpdates.has(guildId)) {
      console.log(`[ROSTER] Update already in progress for guild ${guildId}, skipping`);
      return;
    }

    try {
      activeRosterUpdates.add(guildId);
      await updateRosterMessages(guildId);
    } catch (error) {
      console.error(`[ROSTER] Error updating rosters for guild ${guildId}:`, error);
    } finally {
      activeRosterUpdates.delete(guildId);
    }
  }, 2000);

  pendingRosterUpdates.set(guildId, timeout);
}

client.on("guildMemberUpdate", async (oldMember, newMember) => {
  console.log(`[ROLE SYNC] guildMemberUpdate triggered for ${newMember.user.tag} in guild ${newMember.guild.name} (${newMember.guild.id})`);

  const oldRoles = Array.from(oldMember.roles.cache.keys());
  const newRoles = Array.from(newMember.roles.cache.keys());

  const allRosterRoles = [...PLAYER_ROLE_IDS, ...STAFF_ROLE_IDS];

  const hasRosterRoleChange = allRosterRoles.some(roleId => 
    oldRoles.includes(roleId) !== newRoles.includes(roleId)
  );

  if (hasRosterRoleChange) {
    console.log(`Roster role changed for ${newMember.user.tag}, scheduling roster update...`);
    scheduleRosterUpdate(newMember.guild.id);
  }

  const currentGuildId = newMember.guild.id;

  const syncKey = `${newMember.id}-${currentGuildId}`;
  if (syncingUsers.has(syncKey)) {
    console.log(`[ROLE SYNC] Sync already in progress for ${newMember.user.tag}, skipping to prevent loop`);
    return;
  }

  const addedRoles = newRoles.filter(r => !oldRoles.includes(r));
  const removedRoles = oldRoles.filter(r => !newRoles.includes(r));

  if (addedRoles.length === 0 && removedRoles.length === 0) {
    return;
  }

  console.log(`[ROLE SYNC] Added roles: ${addedRoles.join(", ") || "none"}`);
  console.log(`[ROLE SYNC] Removed roles: ${removedRoles.join(", ") || "none"}`);

  const allSyncPairs = await storage.getAllRoleSyncPairs();

  const relevantPairs = allSyncPairs.filter(pair => 
    pair.sourceGuildId === currentGuildId && 
    (addedRoles.includes(pair.sourceRoleId) || removedRoles.includes(pair.sourceRoleId))
  );

  if (relevantPairs.length === 0) {
    console.log(`[ROLE SYNC] No syncable roles changed, skipping`);
    return;
  }

  console.log(`[ROLE SYNC] Found ${relevantPairs.length} relevant sync pairs`);

  try {
    syncingUsers.add(syncKey);

    for (const pair of relevantPairs) {
      const targetSyncKey = `${newMember.id}-${pair.targetGuildId}`;
      syncingUsers.add(targetSyncKey);

      const targetGuild = client.guilds.cache.get(pair.targetGuildId);
      if (!targetGuild) {
        console.log(`[ROLE SYNC] Target guild ${pair.targetGuildId} not found in cache`);
        continue;
      }

      console.log(`[ROLE SYNC] Syncing to ${targetGuild.name}`);

      let targetMember;
      let fetchError = null;
      for (let attempt = 1; attempt <= 2; attempt++) {
        try {
          targetMember = await targetGuild.members.fetch(newMember.id);
          break;
        } catch (error: any) {
          fetchError = error;
          if (error.message?.includes('searchParams') || error.code === 'ECONNRESET') {
            console.log(`[ROLE SYNC] Fetch attempt ${attempt} failed (network issue), retrying...`);
            if (attempt < 2) await new Promise(r => setTimeout(r, 500));
          } else {
            break;
          }
        }
      }

      if (!targetMember) {
        console.log(`[ROLE SYNC] User ${newMember.user.tag} not found in target guild or fetch failed: ${fetchError?.message || 'unknown'}`);
        continue;
      }

      // Verify target role exists in target guild
      const targetRoleExists = targetGuild.roles.cache.has(pair.targetRoleId);
      if (!targetRoleExists) {
        console.log(`[ROLE SYNC] ERROR: Target role ${pair.targetRoleId} does not exist in guild ${targetGuild.name} (${targetGuild.id}). Sync pair ID: ${pair.id} is misconfigured. Please delete this pair and recreate it with valid role IDs.`);
        continue;
      }

      if (addedRoles.includes(pair.sourceRoleId)) {
        if (!targetMember.roles.cache.has(pair.targetRoleId)) {
          try {
            await targetMember.roles.add(pair.targetRoleId);
            console.log(`[ROLE SYNC] Added role ${pair.targetRoleId} to ${newMember.user.tag} in ${targetGuild.name}`);
          } catch (error: any) {
            if (error.code === 10011) {
              console.log(`[ROLE SYNC] ERROR: Role ${pair.targetRoleId} not found in guild ${targetGuild.name}. Sync pair ${pair.id} is invalid - delete and recreate with correct role IDs.`);
            } else {
              console.log(`[ROLE SYNC] Failed to add role ${pair.targetRoleId}:`, error);
            }
          }
        }
      }

      if (removedRoles.includes(pair.sourceRoleId)) {
        if (targetMember.roles.cache.has(pair.targetRoleId)) {
          try {
            await targetMember.roles.remove(pair.targetRoleId);
            console.log(`[ROLE SYNC] Removed role ${pair.targetRoleId} from ${newMember.user.tag} in ${targetGuild.name}`);
          } catch (error: any) {
            if (error.code === 10011) {
              console.log(`[ROLE SYNC] ERROR: Role ${pair.targetRoleId} not found in guild ${targetGuild.name}. Sync pair ${pair.id} is invalid - delete and recreate with correct role IDs.`);
            } else {
              console.log(`[ROLE SYNC] Failed to remove role ${pair.targetRoleId}:`, error);
            }
          }
        }
      }
    }
  } catch (error) {
    console.error("Error syncing roles:", error);
  } finally {
    setTimeout(() => {
      syncingUsers.delete(syncKey);
      for (const pair of relevantPairs) {
        syncingUsers.delete(`${newMember.id}-${pair.targetGuildId}`);
      }
    }, 5000);
  }
});

export async function startBot() {
  if (!process.env.DISCORD_BOT_TOKEN) {
    console.log("⏸️  Bot not started - DISCORD_BOT_TOKEN not set");
    return;
  }

  try {
    await client.login(process.env.DISCORD_BOT_TOKEN);
  } catch (error) {
    console.error("❌ Failed to login to Discord:", error);
  }
}
