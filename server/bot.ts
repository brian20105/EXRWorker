import {
  Client,
  GatewayIntentBits,
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
  partials: [1], // Partials.Channel for DMs
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

// Track users with pending DM ticket category selection (userId -> messageId)
const pendingDMTickets = new Map<string, { messageId: string; guildId: string; sentAt: number }>();

// Clean up expired DM ticket selections (5 minutes)
setInterval(() => {
  const now = Date.now();
  const FIVE_MINUTES = 5 * 60 * 1000;
  for (const [userId, data] of Array.from(pendingDMTickets.entries())) {
    if (now - data.sentAt > FIVE_MINUTES) {
      pendingDMTickets.delete(userId);
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

// Helper to safely defer replies - returns false if interaction expired
async function safeDeferReply(interaction: any, ephemeral: boolean = true): Promise<boolean> {
  try {
    await interaction.deferReply({ flags: ephemeral ? 64 : undefined });
    return true;
  } catch (e) {
    // Silently ignore - interaction expired (bot restart, network delay, or double-click)
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
          .addFields(
            { name: `Q1: ${fullQuestions[0]}`, value: quizState.answers[0] || "No answer", inline: false },
            { name: `Q2: ${fullQuestions[1]}`, value: quizState.answers[1] || "No answer", inline: false },
            { name: `Q3: ${fullQuestions[2]}`, value: quizState.answers[2] || "No answer", inline: false },
            { name: `Q4: ${fullQuestions[3]}`, value: quizState.answers[3] || "No answer", inline: false },
            { name: `Q5: ${fullQuestions[4]}`, value: quizState.answers[4] || "No answer", inline: false }
          )
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
    .setName("payout_permission")
    .setDescription("Set which roles can approve/deny payout requests")
    .addRoleOption((option) =>
      option
        .setName("role1")
        .setDescription("First role that can approve/deny payouts")
        .setRequired(true)
    )
    .addRoleOption((option) =>
      option
        .setName("role2")
        .setDescription("Second role (optional)")
        .setRequired(false)
    )
    .addRoleOption((option) =>
      option
        .setName("role3")
        .setDescription("Third role (optional)")
        .setRequired(false)
    )
    .addRoleOption((option) =>
      option
        .setName("role4")
        .setDescription("Fourth role (optional)")
        .setRequired(false)
    )
    .addRoleOption((option) =>
      option
        .setName("role5")
        .setDescription("Fifth role (optional)")
        .setRequired(false)
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
    .setName("setup")
    .setDescription("Setup roster displays")
    .addStringOption((option) =>
      option
        .setName("roster")
        .setDescription("Choose which roster to display")
        .setRequired(true)
        .addChoices(
          { name: "Player Roster", value: "player" },
          { name: "Staff Roster", value: "staff" }
        )
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
    .setName("setup_ban")
    .setDescription("Set the channel for ban requests")
    .setDefaultMemberPermissions(0)
    .addChannelOption((option) =>
      option
        .setName("channel")
        .setDescription("The channel where ban requests will be sent")
        .setRequired(true)
    ),
  new SlashCommandBuilder()
    .setName("setup_unban")
    .setDescription("Set the channel for unban requests")
    .setDefaultMemberPermissions(0)
    .addChannelOption((option) =>
      option
        .setName("channel")
        .setDescription("The channel where unban requests will be sent")
        .setRequired(true)
    ),
  new SlashCommandBuilder()
    .setName("setup_permissions")
    .setDescription("Set which roles can approve/deny ban/unban requests")
    .setDefaultMemberPermissions(0)
    .addRoleOption((option) =>
      option
        .setName("role1")
        .setDescription("First role that can approve/deny requests")
        .setRequired(true)
    )
    .addRoleOption((option) =>
      option
        .setName("role2")
        .setDescription("Second role (optional)")
        .setRequired(false)
    )
    .addRoleOption((option) =>
      option
        .setName("role3")
        .setDescription("Third role (optional)")
        .setRequired(false)
    )
    .addRoleOption((option) =>
      option
        .setName("role4")
        .setDescription("Fourth role (optional)")
        .setRequired(false)
    )
    .addRoleOption((option) =>
      option
        .setName("role5")
        .setDescription("Fifth role (optional)")
        .setRequired(false)
    ),
  new SlashCommandBuilder()
    .setName("setup_ban_logs")
    .setDescription("Set the channel for ban request logs")
    .setDefaultMemberPermissions(0)
    .addChannelOption((option) =>
      option
        .setName("channel")
        .setDescription("The channel where ban logs will be sent")
        .setRequired(true)
    ),
  new SlashCommandBuilder()
    .setName("setup_unban_logs")
    .setDescription("Set the channel for unban request logs")
    .setDefaultMemberPermissions(0)
    .addChannelOption((option) =>
      option
        .setName("channel")
        .setDescription("The channel where unban logs will be sent")
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
          { name: "Modmails handled", value: "modmail" }
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
          { name: "Modmails Handled", value: "modmail" }
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
          { name: "Modmails Handled", value: "modmail" }
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
          { name: "Modmails Handled", value: "modmail" }
        )
    )
    .addUserOption((option) =>
      option
        .setName("user")
        .setDescription("User to reset (leave empty for everyone)")
        .setRequired(false)
    ),
  new SlashCommandBuilder()
    .setName("restore_activity")
    .setDescription("Restore activity stats from the last reset")
    .setDefaultMemberPermissions(0),
  new SlashCommandBuilder()
    .setName("setup_staff_intro")
    .setDescription("Post the staff introduction quiz in the current channel")
    .setDefaultMemberPermissions(0),
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
    .setDescription("Configure the modmail ticket embed title and description")
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
    .setName("block")
    .setDescription("Block a user from opening modmail tickets")
    .setDefaultMemberPermissions(0)
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
    .setDescription("Unblock a user from modmail")
    .setDefaultMemberPermissions(0)
    .addUserOption((option) =>
      option.setName("user").setDescription("User to unblock").setRequired(true)
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
          { name: "Activity Reset", value: "activity_reset" }
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
      option.setName("category").setDescription("Ticket category").setRequired(true)
        .addChoices(
          { name: "General Inquiries", value: "general" },
          { name: "Apply For Competitive", value: "competitive" },
          { name: "Apply For Content Creator", value: "contentcreator" },
          { name: "User Reports", value: "report" },
          { name: "Partnerships", value: "partnerships" },
          { name: "Apply For GFX Editor", value: "gfx" },
          { name: "Apply For Creative Warrior", value: "creativewarrior" },
          { name: "Apply For VFX Editor", value: "vfxeditor" }
        )
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
    .setDescription("Manage custom modmail ticket categories")
    .setDefaultMemberPermissions(0)
    .addSubcommand((sub) =>
      sub.setName("add").setDescription("Add a new custom category")
        .addStringOption((option) => option.setName("id").setDescription("Category ID (lowercase, no spaces)").setRequired(true))
        .addStringOption((option) => option.setName("label").setDescription("Display name").setRequired(true))
        .addStringOption((option) => option.setName("description").setDescription("Short description").setRequired(true))
        .addStringOption((option) => option.setName("emoji").setDescription("Emoji for the category").setRequired(false))
    )
    .addSubcommand((sub) =>
      sub.setName("remove").setDescription("Remove a custom category")
        .addStringOption((option) => option.setName("id").setDescription("Category ID to remove").setRequired(true))
    )
    .addSubcommand((sub) =>
      sub.setName("list").setDescription("List all modmail categories")
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
  let playerRoster = "**Thrill's Competitive Roster**\n\n";

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
  let staffRoster = "**Thrill's Staff Roster**\n\n";

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
          console.log("[ROSTER] Database unavailable after 3 attempts, skipping roster update");
          return;
        } else {
          throw dbError;
        }
      }
    }
    if (!config) {
      console.log("[ROSTER] No config found for guild", guildId);
      return;
    }

    const guild = client.guilds.cache.get(guildId);
    if (!guild) {
      console.log("[ROSTER] Guild not in cache", guildId);
      return;
    }

    // Always fetch fresh member data
    try {
      await guild.members.fetch({ time: 30000 });
      console.log("[ROSTER] Fetched all members for roster update");
    } catch (error) {
      console.log("[ROSTER] Could not fetch all members, using cached");
    }

    // Update player roster
    if (config.playerRosterChannelId) {
      console.log("[ROSTER] Updating player roster...", config.playerRosterChannelId, config.playerRosterMessageId);
      try {
        const channel = await client.channels.fetch(config.playerRosterChannelId);
        if (channel && "send" in channel) {
          const newContent = await generatePlayerRoster(guild);

          // Try to edit existing message
          if (config.playerRosterMessageId) {
            try {
              const message = await (channel as any).messages.fetch(config.playerRosterMessageId);
              await message.edit({ content: newContent });
              console.log("[ROSTER] Updated player roster successfully");
            } catch (fetchError: any) {
              // Message deleted - create new one
              console.log("[ROSTER] Player roster message not found, creating new one");
              const newMessage = await (channel as any).send({ content: newContent });
              await storage.upsertGuildConfig({
                guildId,
                playerRosterMessageId: newMessage.id,
              });
              console.log("[ROSTER] Created new player roster message");
            }
          } else {
            // No message ID configured - create new one
            const newMessage = await (channel as any).send({ content: newContent });
            await storage.upsertGuildConfig({
              guildId,
              playerRosterMessageId: newMessage.id,
            });
            console.log("[ROSTER] Created new player roster message");
          }
        } else {
          console.log("[ROSTER] Channel not a text channel");
        }
      } catch (error: any) {
        console.log("[ROSTER] Could not update player roster:", error.message || error);
      }
    } else {
      console.log("[ROSTER] No player roster channel configured");
    }

    // Update staff roster
    if (config.staffRosterChannelId) {
      console.log("[ROSTER] Updating staff roster...", config.staffRosterChannelId, config.staffRosterMessageId);
      try {
        const channel = await client.channels.fetch(config.staffRosterChannelId);
        if (channel && "send" in channel) {
          const newContent = await generateStaffRoster(guild);

          // Try to edit existing message
          if (config.staffRosterMessageId) {
            try {
              const message = await (channel as any).messages.fetch(config.staffRosterMessageId);
              await message.edit({ content: newContent });
              console.log("[ROSTER] Updated staff roster successfully");
            } catch (fetchError: any) {
              // Message deleted - create new one
              console.log("[ROSTER] Staff roster message not found, creating new one");
              const newMessage = await (channel as any).send({ content: newContent });
              await storage.upsertGuildConfig({
                guildId,
                staffRosterMessageId: newMessage.id,
              });
              console.log("[ROSTER] Created new staff roster message");
            }
          } else {
            // No message ID configured - create new one
            const newMessage = await (channel as any).send({ content: newContent });
            await storage.upsertGuildConfig({
              guildId,
              staffRosterMessageId: newMessage.id,
            });
            console.log("[ROSTER] Created new staff roster message");
          }
        } else {
          console.log("[ROSTER] Channel not a text channel");
        }
      } catch (error: any) {
        console.log("[ROSTER] Could not update staff roster:", error.message || error);
      }
    } else {
      console.log("[ROSTER] No staff roster channel configured");
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

  try {
    const rest = new REST({ version: "10" }).setToken(process.env.DISCORD_BOT_TOKEN!);
    console.log("🔄 Registering slash commands...");

    await rest.put(Routes.applicationCommands(APPLICATION_ID), {
      body: commands,
    });

    console.log("✅ Slash commands registered successfully!");
  } catch (error) {
    console.error("❌ Error registering commands:", error);
  }
});

client.on("interactionCreate", async (interaction) => {
  try {
    // Check if interaction is still valid
    if (interaction.isRepliable() && interaction.replied) {
      console.log('Interaction already replied to:', interaction.id);
      return;
    }

    if (interaction.isChatInputCommand()) {
      const { commandName } = interaction;

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
      } else if (commandName === "payout_permission") {
        if (!await safeDeferReply(interaction)) return;

        const roles: string[] = [];
        const roleNames: string[] = [];

        for (let i = 1; i <= 5; i++) {
          const role = interaction.options.getRole(`role${i}`);
          if (role) {
            roles.push(role.id);
            roleNames.push(role.name);
          }
        }

        await storage.updateAllowedRoles(interaction.guildId!, roles);

        await interaction.editReply({
          content: `✅ Payout permissions updated! The following roles can now approve/deny payouts:\n${roleNames.map(r => `• ${r}`).join('\n')}`,
        });
      } else if (commandName === "list_payouts") {
        const isPrivate = interaction.options.getBoolean("private") ?? true;
        if (!await safeDeferReply(interaction, isPrivate)) return;

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
          .setTitle("📋 All Payout Requests")
          .setColor(0x5865f2)
          .setDescription(`Total: **${allPayouts.length}** requests`)
          .addFields(
            { name: "⏳ Pending", value: `**${pending.length}** requests\n$${totalPending.toFixed(2)}`, inline: true },
            { name: "✅ Approved", value: `**${approved.length}** requests\n$${totalApproved.toFixed(2)}`, inline: true },
            { name: "❌ Denied", value: `**${denied.length}** requests\n$${totalDenied.toFixed(2)}`, inline: true }
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

        const pendingEmbed = formatPayoutList(pending, "Pending Requests", "⏳", 0xf0b232);
        const approvedEmbed = formatPayoutList(approved, "Approved Requests", "✅", 0x23a559);
        const deniedEmbed = formatPayoutList(denied, "Denied Requests", "❌", 0xda373c);

        if (pendingEmbed) embeds.push(pendingEmbed);
        if (approvedEmbed) embeds.push(approvedEmbed);
        if (deniedEmbed) embeds.push(deniedEmbed);

        await interaction.editReply({ embeds: embeds.slice(0, 10) });
      } else if (commandName === "setup") {
        const rosterType = interaction.options.getString("roster", true);

        if (!await safeDeferReply(interaction)) return;

        const guild = interaction.guild;
        if (!guild) {
          await interaction.editReply({ content: "❌ Could not fetch guild information." });
          return;
        }

        try {
          await guild.members.fetch({ time: 30000 });
        } catch (error) {
          console.log("Could not fetch all members, using cached members");
        }

        if (rosterType === "player") {
          const playerRoster = await generatePlayerRoster(guild);

          if (interaction.channel && "send" in interaction.channel) {
            const sentMessage = await interaction.channel.send(playerRoster);
            await storage.upsertGuildConfig({
              guildId: guild.id,
              playerRosterMessageId: sentMessage.id,
              playerRosterChannelId: interaction.channelId,
            });
          }

          await interaction.editReply({
            content: "✅ Player roster has been posted! It will update automatically when roles change.",
          });
        } else if (rosterType === "staff") {
          const staffRoster = await generateStaffRoster(guild);

          if (interaction.channel && "send" in interaction.channel) {
            const sentMessage = await interaction.channel.send(staffRoster);
            await storage.upsertGuildConfig({
              guildId: guild.id,
              staffRosterMessageId: sentMessage.id,
              staffRosterChannelId: interaction.channelId,
            });
          }

          await interaction.editReply({
            content: "✅ Staff roster has been posted! It will update automatically when roles change.",
          });
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
      } else if (commandName === "setup_ban") {
        if (!await safeDeferReply(interaction)) return;

        const channel = interaction.options.getChannel("channel", true);

        await storage.upsertGuildConfig({
          guildId: interaction.guildId!,
          banChannelId: channel.id,
        });

        const embed = new EmbedBuilder()
          .setTitle("🚫 Ban Request")
          .setDescription("Need to report a user for violating rules? Click below to submit a ban request with evidence.")
          .setColor(0xed4245)
          .setFooter({ text: "Ban Requests Can Take Up To A Day To Get Finalised" });

        const row = new ActionRowBuilder<ButtonBuilder>().addComponents(
          new ButtonBuilder()
            .setCustomId("submit_ban_request")
            .setLabel("Submit Ban Request")
            .setStyle(ButtonStyle.Danger)
            .setEmoji("⚠️")
        );

        if (interaction.channel && "send" in interaction.channel) {
          await interaction.channel.send({
            embeds: [embed],
            components: [row],
          });
        }

        await interaction.editReply({
          content: `✅ Ban request channel configured! Requests will be sent to <#${channel.id}>.`,
        });
      } else if (commandName === "setup_unban") {
        if (!await safeDeferReply(interaction)) return;

        const channel = interaction.options.getChannel("channel", true);

        await storage.upsertGuildConfig({
          guildId: interaction.guildId!,
          unbanChannelId: channel.id,
        });

        const embed = new EmbedBuilder()
          .setTitle("🔓 Unban Request")
          .setDescription("Submitting an unban request for another user? Click the button below and provide their username, the reason they were banned.")
          .setColor(0xf0b232)
          .setFooter({ text: "Unban Requests Can Take Up To A Day To Get Finalised" });

        const row = new ActionRowBuilder<ButtonBuilder>().addComponents(
          new ButtonBuilder()
            .setCustomId("submit_unban_request")
            .setLabel("Submit Unban Request")
            .setStyle(ButtonStyle.Primary)
            .setEmoji("📝")
        );

        if (interaction.channel && "send" in interaction.channel) {
          await interaction.channel.send({
            embeds: [embed],
            components: [row],
          });
        }

        await interaction.editReply({
          content: `✅ Unban request channel configured! Requests will be sent to <#${channel.id}>.`,
        });
      } else if (commandName === "setup_permissions") {
        if (!await safeDeferReply(interaction)) return;

        const roles: string[] = [];
        const roleNames: string[] = [];

        for (let i = 1; i <= 5; i++) {
          const role = interaction.options.getRole(`role${i}`);
          if (role) {
            roles.push(role.id);
            roleNames.push(role.name);
          }
        }

        await storage.upsertGuildConfig({
          guildId: interaction.guildId!,
          modRoleIds: roles,
        });

        await interaction.editReply({
          content: `✅ Moderation permissions updated! The following roles can now approve/deny ban/unban requests:\n${roleNames.map(r => `• ${r}`).join('\n')}`,
        });
      } else if (commandName === "setup_ban_logs") {
        if (!await safeDeferReply(interaction)) return;

        const channel = interaction.options.getChannel("channel", true);

        await storage.upsertGuildConfig({
          guildId: interaction.guildId!,
          banLogChannelId: channel.id,
        });

        await interaction.editReply({
          content: `✅ Configuration saved! Ban request logs will be sent to <#${channel.id}>.`,
        });
      } else if (commandName === "setup_unban_logs") {
        if (!await safeDeferReply(interaction)) return;

        const channel = interaction.options.getChannel("channel", true);

        await storage.upsertGuildConfig({
          guildId: interaction.guildId!,
          unbanLogChannelId: channel.id,
        });

        await interaction.editReply({
          content: `✅ Configuration saved! Unban request logs will be sent to <#${channel.id}>.`,
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
          const fromDays = interaction.options.getInteger("from") ?? undefined;
          const toDays = interaction.options.getInteger("to") ?? undefined;

          // Build time range description with Discord timestamps (hammer times)
          const now = new Date();
          const fromDate = fromDays !== undefined ? new Date(now.getTime() - fromDays * 24 * 60 * 60 * 1000) : null;
          const toDate = toDays !== undefined ? new Date(now.getTime() - toDays * 24 * 60 * 60 * 1000) : now;
          
          let timeRangeDesc = "";
          if (fromDate || toDays !== undefined) {
            const fromTimestamp = fromDate ? `<t:${Math.floor(fromDate.getTime() / 1000)}:F>` : null;
            const toTimestamp = `<t:${Math.floor(toDate.getTime() / 1000)}:F>`;
            timeRangeDesc = fromTimestamp ? `From ${fromTimestamp} to ${toTimestamp}` : `Up to ${toTimestamp}`;
          }

          // If a specific member is requested, show their individual stats
          if (targetMember) {
            let memberBanStats = 0;
            let memberUnbanStats = 0;
            let memberModmailStats = 0;
            let memberModmailCategoryStats: { category: string; count: number }[] = [];

            try {
              memberBanStats = await storage.getActivityStatsForUser(interaction.guildId!, targetMember.id, "ban", fromDays, toDays);
            } catch (e) {
              console.log("Could not fetch member ban stats:", e);
            }
            try {
              memberUnbanStats = await storage.getActivityStatsForUser(interaction.guildId!, targetMember.id, "unban", fromDays, toDays);
            } catch (e) {
              console.log("Could not fetch member unban stats:", e);
            }
            try {
              memberModmailStats = await storage.getModmailStatsForUser(interaction.guildId!, targetMember.id, fromDays, toDays);
            } catch (e) {
              console.log("Could not fetch member modmail stats:", e);
            }
            try {
              memberModmailCategoryStats = await storage.getModmailStatsByCategoryForUser(interaction.guildId!, targetMember.id, fromDays, toDays);
            } catch (e) {
              console.log("Could not fetch member modmail category stats:", e);
            }

            const totalActivity = memberBanStats + memberUnbanStats + memberModmailStats;

            const embed = new EmbedBuilder()
              .setTitle(`Activity for ${targetMember.tag}`)
              .setThumbnail(targetMember.displayAvatarURL())
              .setColor(0x5865f2);

            if (timeRangeDesc) {
              embed.setDescription(timeRangeDesc);
            }

            let statsText = `**Total Activity:** ${totalActivity}\n\n`;
            statsText += `**Ban Requests:** ${memberBanStats}\n`;
            statsText += `**Unban Requests:** ${memberUnbanStats}\n`;
            statsText += `**Modmails Handled:** ${memberModmailStats}`;

            // Add modmail category breakdown if available
            if (memberModmailStats > 0 && memberModmailCategoryStats.length > 0) {
              const categoryLabels: { [key: string]: string } = {
                general: "General Inquiries",
                competitive: "Competitive",
                contentcreator: "Content Creator",
                report: "User Reports",
                partnerships: "Partnerships",
                gfx: "GFX Editor",
                creativewarrior: "Creative Warrior",
                vfxeditor: "VFX Editor",
              };
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
          let modmailCategoryStats: { category: string; count: number }[] = [];

          try {
            if (!category || category === "ban") {
              banStats = await storage.getActivityStats(interaction.guildId!, "ban", fromDays, toDays);
            }
          } catch (e) {
            console.log("Could not fetch ban stats:", e);
          }

          try {
            if (!category || category === "unban") {
              unbanStats = await storage.getActivityStats(interaction.guildId!, "unban", fromDays, toDays);
            }
          } catch (e) {
            console.log("Could not fetch unban stats:", e);
          }

          try {
            if (!category || category === "modmail") {
              modmailStats = await storage.getModmailStats(interaction.guildId!, fromDays, toDays);
            }
          } catch (e) {
            console.log("Could not fetch modmail stats:", e);
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

          const leaderboard = Object.entries(combinedStats)
            .map(([userId, count]) => ({ userId, count }))
            .sort((a, b) => b.count - a.count)
            .slice(0, 10);

          const categoryText = category === "ban" ? "Ban Requests" : category === "unban" ? "Unban Requests" : category === "modmail" ? "Modmails Handled" : "All Activity";

          const embed = new EmbedBuilder()
            .setTitle(`${categoryText} Leaderboard`)
            .setColor(0x5865f2);

          if (timeRangeDesc) {
            embed.setDescription(timeRangeDesc);
          }

          // Calculate totals
          const totalCount = leaderboard.reduce((sum, e) => sum + e.count, 0);
          const banTotal = banStats.reduce((sum, e) => sum + e.count, 0);
          const unbanTotal = unbanStats.reduce((sum, e) => sum + e.count, 0);
          const modmailTotal = modmailStats.reduce((sum, e) => sum + e.count, 0);

          if (leaderboard.length === 0) {
            embed.addFields({ name: "\u200B", value: "No activity found for the specified filters.", inline: false });
          } else {
            let description = "";
            leaderboard.forEach((entry, index) => {
              description += `${index + 1}. <@${entry.userId}> - ${entry.count}\n`;
            });
            embed.addFields({ name: "\u200B", value: description, inline: false });
            
            // Add total and category breakdown
            let statsText = `**Total in the specified time:** ${totalCount}`;
            if (!category) {
              // "All Activity" view - show totals only
              if (banTotal > 0) statsText += `\nBan Requests: ${banTotal}`;
              if (unbanTotal > 0) statsText += `\nUnban Requests: ${unbanTotal}`;
              if (modmailTotal > 0) statsText += `\nModmails Handled: ${modmailTotal}`;
            } else if (category === "modmail") {
              // "Modmails Handled" view - show category breakdown
              if (modmailTotal > 0 && modmailCategoryStats.length > 0) {
                const categoryLabels: { [key: string]: string } = {
                  general: "General Inquiries",
                  competitive: "Competitive",
                  contentcreator: "Content Creator",
                  report: "User Reports",
                  partnerships: "Partnerships",
                  gfx: "GFX Editor",
                  creativewarrior: "Creative Warrior",
                  vfxeditor: "VFX Editor",
                };
                statsText += "\n\n**Category Breakdown:**";
                for (const catStat of modmailCategoryStats) {
                  // Skip unknown/null categories
                  if (catStat.category === "unknown" || !catStat.category) continue;
                  const label = categoryLabels[catStat.category] || catStat.category;
                  statsText += `\n• ${label}: ${catStat.count}`;
                }
              }
            }
            embed.addFields({ name: "\u200B", value: statsText, inline: false });
          }

          // Add footer with page and timestamp
          embed.setFooter({ text: `Page 1 of 1 | ${now.toLocaleDateString('en-US', { year: 'numeric', month: '2-digit', day: '2-digit' })}, ${now.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit', hour12: true })}` });

          await interaction.editReply({ embeds: [embed] });
        } catch (error: any) {
          console.log("Error in /activity command:", error.message, error.stack);
          await interaction.editReply({ content: "❌ Failed to fetch activity stats. Please try again." }).catch(() => {});
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

          try {
            if (category === "modmail") {
              await storage.addModmailActivityEntries(interaction.guildId!, user.id, amount);
            } else {
              for (let i = 0; i < amount; i++) {
                if (category === "ban") {
                  await storage.createBanRequest({
                    guildId: interaction.guildId!,
                    targetUserId: "manual_entry",
                    requestedById: "manual_entry",
                    reason: "Manual activity entry",
                    status: "approved",
                    reviewedById: user.id,
                    reviewReason: "Manual entry by admin",
                  });
                } else {
                  await storage.createUnbanRequest({
                    guildId: interaction.guildId!,
                    targetUserId: "manual_entry",
                    requestedById: "manual_entry",
                    reason: "Manual activity entry",
                    status: "approved",
                    reviewedById: user.id,
                    reviewReason: "Manual entry by admin",
                  });
                }
              }
            }
          } catch (e) {
            console.log("Could not add activity entries:", e);
          }

          const categoryText = category === "ban" ? "ban request" : category === "unban" ? "unban request" : "modmail";
          await interaction.editReply({
            content: `Added **${amount}** ${categoryText} log entries to <@${user.id}>'s activity.`,
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

          let removed = 0;
          try {
            if (category === "modmail") {
              removed = await storage.removeModmailActivityEntries(interaction.guildId!, user.id, amount);
            } else {
              removed = await storage.removeActivityEntries(interaction.guildId!, user.id, category, amount);
            }
          } catch (e) {
            console.log("Could not remove activity entries:", e);
          }

          const categoryText = category === "ban" ? "ban request" : category === "unban" ? "unban request" : "modmail";
          await interaction.editReply({
            content: `Removed **${removed}** ${categoryText} log entries from <@${user.id}>'s activity.`,
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

          const categoryText = category === "ban" ? "ban request" : category === "unban" ? "unban request" : category === "modmail" ? "modmail" : "all";
          const userText = user ? `<@${user.id}>` : "everyone";

          await interaction.editReply({
            content: `Reset **${count}** ${categoryText} activity entries for ${userText}.`,
          });
        } catch (error: any) {
          console.log("Error in /activity_reset command:", error.message);
          await interaction.editReply({ content: "Failed to reset activity stats. Please try again." }).catch(() => {});
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

        const embed = new EmbedBuilder()
          .setTitle("Inactivity Request")
          .setDescription("Need to take a break? Click the button below to submit an inactivity request.\n\nPlease provide the dates you'll be inactive and your reason.")
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
        if (!await safeDeferReply(interaction)) return;

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
        let customCategories: { id: string; label: string; description: string; emoji?: string }[] = [];
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

        // Build options array with built-in categories
        const selectOptions = [
          new StringSelectMenuOptionBuilder()
            .setLabel("General Inquiries")
            .setDescription("General questions or support")
            .setValue("general")
            .setEmoji("📥"),
          new StringSelectMenuOptionBuilder()
            .setLabel("Apply For Competitive")
            .setDescription("Apply to join the competitive team")
            .setValue("competitive")
            .setEmoji("🖥️"),
          new StringSelectMenuOptionBuilder()
            .setLabel("Apply For Content Creator")
            .setDescription("Apply to become a content creator")
            .setValue("contentcreator")
            .setEmoji("📷"),
          new StringSelectMenuOptionBuilder()
            .setLabel("User Reports")
            .setDescription("Report a user")
            .setValue("report")
            .setEmoji("🚨"),
          new StringSelectMenuOptionBuilder()
            .setLabel("Partnerships")
            .setDescription("Partnership inquiries")
            .setValue("partnerships")
            .setEmoji("📋"),
          new StringSelectMenuOptionBuilder()
            .setLabel("Apply For GFX Editor")
            .setDescription("Apply to become a GFX editor")
            .setValue("gfx")
            .setEmoji("📝"),
          new StringSelectMenuOptionBuilder()
            .setLabel("Apply For Creative Warrior")
            .setDescription("Apply for creative warrior role")
            .setValue("creativewarrior")
            .setEmoji("⚔️"),
          new StringSelectMenuOptionBuilder()
            .setLabel("Apply For VFX Editor")
            .setDescription("Apply for VFX editor role")
            .setValue("vfxeditor")
            .setEmoji("✨"),
        ];

        // Add custom categories
        for (const cat of customCategories) {
          const option = new StringSelectMenuOptionBuilder()
            .setLabel(cat.label)
            .setDescription(cat.description.substring(0, 100))
            .setValue(cat.id);
          if (cat.emoji) option.setEmoji(cat.emoji);
          selectOptions.push(option);
        }

        const selectMenu = new StringSelectMenuBuilder()
          .setCustomId(`ticket_select_${interaction.guildId}`)
          .setPlaceholder("Select a ticket category...")
          .addOptions(selectOptions);

        const row = new ActionRowBuilder<StringSelectMenuBuilder>().addComponents(selectMenu);

        if (interaction.channel && "send" in interaction.channel) {
          await interaction.channel.send({
            embeds: [ticketEmbed],
            components: [row],
          });
        }

        await interaction.editReply({
          content: `✅ Modmail configured and ticket embed posted!\n• Category: <#${category.id}>\n• Log Channel: <#${logChannel.id}>\n• Staff Role: <@&${staffRole.id}>`,
        });
      } else if (commandName === "config_modmail") {
        if (!await safeDeferReply(interaction)) return;

        const title = interaction.options.getString("title");
        const description = interaction.options.getString("description");

        if (!title && !description) {
          const config = await storage.getGuildConfig(interaction.guildId!);
          const currentTitle = config?.modmailEmbedTitle || "Support Tickets";
          const currentDescription = config?.modmailEmbedDescription || "Select a category below to create a ticket.";
          await interaction.editReply({
            content: `**Current Modmail Embed Settings:**\n• Title: ${currentTitle}\n• Description: ${currentDescription}\n\nUse the title and description options to update these values.`,
          });
          return;
        }

        const updateData: any = { guildId: interaction.guildId! };
        if (title) updateData.modmailEmbedTitle = title;
        if (description) updateData.modmailEmbedDescription = description;

        await storage.upsertGuildConfig(updateData);

        const updates: string[] = [];
        if (title) updates.push(`Title: ${title}`);
        if (description) updates.push(`Description: ${description}`);

        await interaction.editReply({
          content: `✅ Modmail embed updated:\n• ${updates.join("\n• ")}\n\nRun /setup_modmail again to post the updated embed.`,
        });
      } else if (commandName === "block") {
        if (!await safeDeferReply(interaction)) return;

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

        await storage.removeModmailBlock(interaction.guildId!, targetUser.id);
        await storage.createModmailBlock({
          guildId: interaction.guildId!,
          userId: targetUser.id,
          blockedById: interaction.user.id,
          reason,
          expiresAt,
        });

        const durationText = timeUnit === "permanent" ? "permanently" : `for ${duration} ${timeUnit}`;
        await interaction.editReply({ content: `✅ <@${targetUser.id}> has been blocked from modmail ${durationText}.${reason ? ` Reason: ${reason}` : ""}` });
      } else if (commandName === "unblock") {
        if (!await safeDeferReply(interaction)) return;

        const targetUser = interaction.options.getUser("user", true);

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

        await storage.removeModmailBlock(interaction.guildId!, targetUser.id);
        await interaction.editReply({ content: `✅ <@${targetUser.id}> has been unblocked from modmail.` });
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

        const categoryLabels: { [key: string]: string } = {
          general: "General Inquiries",
          competitive: "Apply For Competitive",
          contentcreator: "Apply For Content Creator",
          report: "User Reports",
          partnerships: "Partnerships",
          gfx: "Apply For GFX Editor",
          creativewarrior: "Apply For Creative Warrior",
          vfxeditor: "Apply For VFX Editor",
        };

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

                const logEmbed = new EmbedBuilder()
                  .setTitle("Ticket Closed (Bulk)")
                  .setColor(0xed4245)
                  .addFields(
                    { name: "User", value: `<@${thread.userId}>`, inline: true },
                    { name: "Closed By", value: `<@${interaction.user.id}>`, inline: true },
                    { name: "Transcript", value: transcript || "No messages", inline: false }
                  )
                  .setTimestamp();
                await logChannel.send({ embeds: [logEmbed] });
              }
            } catch (e) {
              console.log("Could not send modmail log for bulk close");
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
        if (!await safeDeferReply(interaction)) return;

        const subcommand = interaction.options.getSubcommand();
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
          const categoryId = interaction.options.getString("id", true).toLowerCase().replace(/\s+/g, "");
          const label = interaction.options.getString("label", true);
          const description = interaction.options.getString("description", true);
          const emoji = interaction.options.getString("emoji") || "📌";

          // Check if ID already exists
          const allIds = [...builtInCategories.map(c => c.id), ...customCategories.map(c => c.id)];
          if (allIds.includes(categoryId)) {
            await interaction.editReply({ content: `❌ A category with ID "${categoryId}" already exists.` });
            return;
          }

          customCategories.push({ id: categoryId, label, description, emoji });
          await storage.upsertGuildConfig({
            guildId: interaction.guildId!,
            customModmailCategories: JSON.stringify(customCategories),
          });

          await interaction.editReply({ 
            content: `✅ Added custom category: **${label}** (${emoji})\nID: \`${categoryId}\`\n\n⚠️ You need to run \`/setup_modmail\` again to update the ticket dropdown with the new category.`
          });

        } else if (subcommand === "remove") {
          const categoryId = interaction.options.getString("id", true).toLowerCase();

          // Check if it's a built-in category
          if (builtInCategories.some(c => c.id === categoryId)) {
            await interaction.editReply({ content: `❌ Cannot remove built-in category "${categoryId}".` });
            return;
          }

          const index = customCategories.findIndex(c => c.id === categoryId);
          if (index === -1) {
            await interaction.editReply({ content: `❌ Custom category "${categoryId}" not found.` });
            return;
          }

          const removed = customCategories.splice(index, 1)[0];
          await storage.upsertGuildConfig({
            guildId: interaction.guildId!,
            customModmailCategories: JSON.stringify(customCategories),
          });

          await interaction.editReply({ 
            content: `✅ Removed custom category: **${removed.label}**\n\n⚠️ You need to run \`/setup_modmail\` again to update the ticket dropdown.`
          });

        } else if (subcommand === "list") {
          const embed = new EmbedBuilder()
            .setTitle("Modmail Categories")
            .setColor(0x5865f2);

          let builtInText = builtInCategories.map(c => `${c.emoji} **${c.label}** (\`${c.id}\`)`).join("\n");
          embed.addFields({ name: "Built-in Categories", value: builtInText, inline: false });

          if (customCategories.length > 0) {
            let customText = customCategories.map(c => `${c.emoji || "📌"} **${c.label}** (\`${c.id}\`)`).join("\n");
            embed.addFields({ name: "Custom Categories", value: customText, inline: false });
          } else {
            embed.addFields({ name: "Custom Categories", value: "No custom categories added yet.", inline: false });
          }

          await interaction.editReply({ embeds: [embed] });
        }
      }
    } else if (interaction.isStringSelectMenu()) {
      // Handle ticket dropdown selection
      if (interaction.customId.startsWith("ticket_select_")) {
        const guildId = interaction.customId.split("_")[2];
        const ticketCategory = interaction.values[0];
        const user = interaction.user;

        // Categories that require application modals - show modal IMMEDIATELY (no async work first)
        if (ticketCategory === "competitive") {
          try {
            const modal = new ModalBuilder()
              .setCustomId(`ticket_modal_competitive_${guildId}`)
              .setTitle("Apply For Competitive");

            const trackerInput = new TextInputBuilder()
              .setCustomId("fortnite_tracker")
              .setLabel("Send Your Fortnite Tracker")
              .setStyle(TextInputStyle.Short)
              .setPlaceholder("https://fortnitetracker.com/profile/...")
              .setRequired(true);

            const reasonInput = new TextInputBuilder()
              .setCustomId("apply_reason")
              .setLabel("Why Do You Want To Apply For Thrills Esports")
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

        const categoryLabels: { [key: string]: string } = {
          general: "General Inquiries",
          report: "User Reports",
          partnerships: "Partnerships",
        };
        // Add custom category labels
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
          const channelName = `${ticketCategory}-${user.username.toLowerCase().replace(/[^a-z0-9]/g, "")}`;
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
          const initialEmbed = new EmbedBuilder()
            .setTitle(`New Ticket: ${categoryLabel}`)
            .setColor(0x5865f2)
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
            console.log("Could not DM user about ticket creation");
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

        const categoryLabels: { [key: string]: string } = {
          general: "General Inquiries",
          competitive: "Apply For Competitive",
          contentcreator: "Apply For Content Creator",
          report: "User Reports",
          partnerships: "Partnerships",
          gfx: "Apply For GFX Editor",
        };
        const categoryLabel = categoryLabels[ticketCategory] || ticketCategory;

        // Create thread and channel
        const thread = await storage.createModmailThread({
          guildId,
          userId: user.id,
          status: "open",
          category: ticketCategory,
        });

        try {
          const channelName = `${ticketCategory}-${user.username.toLowerCase().replace(/[^a-z0-9]/g, "")}`;
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
          const initialEmbed = new EmbedBuilder()
            .setTitle(`New Ticket: ${categoryLabel}`)
            .setColor(0x5865f2)
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
            console.log("Could not DM user about ticket creation");
          }

          await interaction.editReply({ content: `✅ Your **${categoryLabel}** ticket has been created! Check your DMs.` });
        } catch (error) {
          console.log("Could not create ticket channel:", error);
          await interaction.editReply({ content: "❌ Failed to create ticket. Please try again." });
        }
        return;
      } else if (interaction.customId.startsWith("modmail_claim_")) {
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
            .setDescription(`Ticket claimed by <@${interaction.user.id}>`)
            .setColor(0x5865f2)
            .setTimestamp();
          await interaction.channel?.send({ embeds: [claimEmbed] });

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

          if (interaction.channel) {
            const existingClaimTimer = pendingClaimExpiry.get(interaction.channel.id);
            if (existingClaimTimer) {
              clearTimeout(existingClaimTimer.timeout);
              pendingClaimExpiry.delete(interaction.channel.id);
            }
          }

          // Reply immediately, then do background work
          await interaction.editReply({ content: "Ticket closed. Deleting channel..." });

        // Capture references synchronously before async work
        const guildId = interaction.guildId!;
        const closerId = interaction.user.id;
        const channelId = interaction.channel?.id;
        const threadUserId = thread.userId;
        const threadIdForLog = thread.id;

        // Background: DM user, log, and delete channel
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
            console.log("Could not DM user about ticket close");
          }

          // Log to modmail log channel
          try {
            const config = await storage.getGuildConfig(guildId);
            if (config?.modmailLogChannelId) {
              const logChannel = await client.channels.fetch(config.modmailLogChannelId);
              if (logChannel && "send" in logChannel) {
                const messages = await storage.getModmailMessages(threadIdForLog);
                let transcript = messages.map(m => `[${m.isStaff === "true" ? "Staff" : "User"}] <@${m.authorId}>: ${m.content}`).join("\n");
                if (transcript.length > 1900) transcript = transcript.substring(0, 1900) + "...";

                const logEmbed = new EmbedBuilder()
                  .setTitle("Ticket Closed")
                  .setColor(0xed4245)
                  .addFields(
                    { name: "User", value: `<@${threadUserId}>`, inline: true },
                    { name: "Closed By", value: `<@${closerId}>`, inline: true },
                    { name: "Transcript", value: transcript || "No messages", inline: false }
                  )
                  .setTimestamp();
                await logChannel.send({ embeds: [logEmbed] });
              }
            }
          } catch (e) {
            console.log("Could not send modmail log");
          }

          // Delete channel after delay using captured ID
          if (channelId) {
            setTimeout(async () => {
              try {
                const chan = await client.channels.fetch(channelId);
                if (chan) await chan.delete();
              } catch (e) { console.log("[MODMAIL] Failed to delete channel:", e); }
            }, 3000);
          }
        })().catch(e => console.log("[MODMAIL] Background task error:", e));
        } catch (error: any) {
          console.log("Error in modmail_close button:", error.message);
          await interaction.editReply({ content: "Failed to close ticket. Please try again." }).catch(() => {});
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
      }
      // Silently ignore unhandled button interactions (e.g., Discord's native attachment buttons)
      return;
    } else if (interaction.isModalSubmit()) {
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

        const categoryLabels: { [key: string]: string } = {
          competitive: "Apply For Competitive",
          contentcreator: "Apply For Content Creator",
          gfx: "Apply For GFX Editor",
          creativewarrior: "Apply For Creative Warrior",
          vfxeditor: "Apply For VFX Editor",
        };
        const categoryLabel = categoryLabels[ticketCategory] || ticketCategory;

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
          const channelName = `${ticketCategory}-${user.username.toLowerCase().replace(/[^a-z0-9]/g, "")}`;
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

          // Create initial embed with application info
          const initialEmbed = new EmbedBuilder()
            .setTitle(`New Application: ${categoryLabel}`)
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

          // DM user confirmation
          try {
            const dmEmbed = new EmbedBuilder()
              .setTitle("Application Submitted")
              .setDescription(`Your **${categoryLabel}** application has been submitted. A staff member will review it and respond shortly.\n\nReply to this DM to send messages to staff.`)
              .setColor(0x57f287)
              .setTimestamp();
            await user.send({ embeds: [dmEmbed] });
          } catch (e) {
            console.log("Could not DM user about application submission");
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

        const categoryLabels: { [key: string]: string } = {
          competitive: "Apply For Competitive",
          contentcreator: "Apply For Content Creator",
          gfx: "Apply For GFX Editor",
          creativewarrior: "Apply For Creative Warrior",
          vfxeditor: "Apply For VFX Editor",
        };
        const categoryLabel = categoryLabels[ticketCategory] || ticketCategory;

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
          const channelName = `${ticketCategory}-${user.username.toLowerCase().replace(/[^a-z0-9]/g, "")}`;
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

          const initialEmbed = new EmbedBuilder()
            .setTitle(`New Application: ${categoryLabel}`)
            .setDescription("**Submitted via DM**")
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
          .setTitle("Ban Request")
          .setColor(0xf0b232)
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
            .setLabel("✓")
            .setStyle(ButtonStyle.Success),
          new ButtonBuilder()
            .setCustomId(`ban_deny_${banRequest.id}`)
            .setLabel("✕")
            .setStyle(ButtonStyle.Danger)
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
          .setTitle("Unban Request")
          .setColor(0xf0b232)
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
            .setLabel("✓")
            .setStyle(ButtonStyle.Success),
          new ButtonBuilder()
            .setCustomId(`unban_deny_${unbanRequest.id}`)
            .setLabel("✕")
            .setStyle(ButtonStyle.Danger)
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
              } catch (e) { console.log("[UNBAN] Failed to DM requester:", e); }
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
              } catch (e) { console.log("[UNBAN] Failed to DM target user:", e); }
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
          console.log("Could not DM user about inactivity decision");
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
        if (message && message.embeds[0]) {
          const status = action === "approve" ? "✅ Approved" : "❌ Denied";
          const color = action === "approve" ? 0x23a559 : 0xda373c;

          const oldEmbed = message.embeds[0];
          const embed = new EmbedBuilder()
            .setTitle(`Staff Intro Submission - ${action === "approve" ? "Approved" : "Denied"}`)
            .setColor(color)
            .setDescription(oldEmbed.description || "")
            .addFields(
              { name: "Status", value: status, inline: true },
              { name: "Reviewed by", value: `<@${interaction.user.id}>`, inline: true }
            )
            .setFooter({ text: `Submission ID: ${submissionId}` })
            .setTimestamp();

          if (reviewReason) {
            embed.addFields({ name: "Review Note", value: reviewReason, inline: false });
          }

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
          console.log("Could not DM user about quiz result");
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

// Prevent duplicate message processing (in case of multiple bot instances)
const processedMessages = new Set<string>();
const MESSAGE_DEDUP_TIMEOUT = 5000; // 5 seconds

client.on("messageCreate", async (message) => {
  if (message.author.bot) return;

  // Deduplicate messages to prevent double responses
  if (processedMessages.has(message.id)) return;
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
    // Silently ignore if not in a modmail channel
    const thread = await storage.getModmailThreadByChannel(message.channel.id);
    if (!thread) {
      return;
    }

    if (thread.status !== "open") {
      await message.reply("❌ This ticket is already closed.");
      return;
    }

    // Check if ticket is claimed and if the closer is the claimer
    if (thread.claimedById && thread.claimedById !== message.author.id) {
      await message.reply(`❌ Only <@${thread.claimedById}> (who claimed this ticket) can close it.`);
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

      // Send timed close message
      await (message.channel as any).send(`⏰ This ticket will close ${timeString}.`);

      // Capture references synchronously before async timeout
      const timedChannelId = message.channel.id;
      const timedGuildId = message.guild?.id;
      const timedStaffId = message.author.id;

      // Schedule the close
      const timeout = setTimeout(async () => {
        pendingTimedCloses.delete(timedChannelId);

        // Re-fetch thread to make sure it's still open
        const currentThread = await storage.getModmailThreadByChannel(timedChannelId);
        if (!currentThread || currentThread.status !== "open") return;

        // Clear claim expiry timer on close
        const timedClaimTimer = pendingClaimExpiry.get(timedChannelId);
        if (timedClaimTimer) {
          clearTimeout(timedClaimTimer.timeout);
          pendingClaimExpiry.delete(timedChannelId);
        }

        // Close the thread
        await storage.updateModmailThread(currentThread.id, {
          status: "closed",
          closedById: timedStaffId,
          closeReason: "Closed via .close command",
          closedAt: new Date(),
        });

        // Notify user via DM
        try {
          const user = await client.users.fetch(currentThread.userId);
          const closeEmbed = new EmbedBuilder()
            .setTitle("Ticket Closed")
            .setDescription("Your ticket has been closed by staff.")
            .setColor(0xed4245)
            .setTimestamp();
          await user.send({ embeds: [closeEmbed] });
        } catch (e) {
          console.log("Could not DM user about timed ticket close");
        }

        // Log to modmail log channel
        if (timedGuildId) {
          const config = await storage.getGuildConfig(timedGuildId);
          if (config?.modmailLogChannelId) {
            try {
              const logChannel = await client.channels.fetch(config.modmailLogChannelId);
              if (logChannel && "send" in logChannel) {
                const messages = await storage.getModmailMessages(currentThread.id);
                let transcript = messages.map(m => `[${m.isStaff === "true" ? "Staff" : "User"}] <@${m.authorId}>: ${m.content}`).join("\n");
                if (transcript.length > 1900) transcript = transcript.substring(0, 1900) + "...";

                const logEmbed = new EmbedBuilder()
                  .setTitle("Ticket Closed (Timed)")
                  .setColor(0xed4245)
                  .addFields(
                    { name: "User", value: `<@${currentThread.userId}>`, inline: true },
                    { name: "Closed By", value: `<@${timedStaffId}>`, inline: true },
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
          const chanToDelete = await client.channels.fetch(timedChannelId);
          if (chanToDelete) await chanToDelete.delete();
        } catch (e) { console.log("[MODMAIL] Failed to delete channel on timed close:", e); }
      }, delayMs);

      pendingTimedCloses.set(timedChannelId, timeout);
      return;
    }

    // Immediate close (with notification to user)
    await storage.updateModmailThread(thread.id, {
      status: "closed",
      closedById: message.author.id,
      closeReason: "Closed via .close command", // <<< UPDATED REASON
      closedAt: new Date(),
    });

    // Notify user
    try {
      const user = await client.users.fetch(thread.userId);
      const closeEmbed = new EmbedBuilder()
        .setTitle("Ticket Closed")
        .setDescription("Your ticket has been closed by staff.")
        .setColor(0xed4245)
        .setTimestamp();
      await user.send({ embeds: [closeEmbed] });
    } catch (e) {
      console.log("Could not DM user about ticket close");
    }

    // Log to modmail log channel
    const config = await storage.getGuildConfig(message.guild.id);
    if (config?.modmailLogChannelId) {
      try {
        const logChannel = await client.channels.fetch(config.modmailLogChannelId);
        if (logChannel && "send" in logChannel) {
          const messages = await storage.getModmailMessages(thread.id);
          let transcript = messages.map(m => `[${m.isStaff === "true" ? "Staff" : "User"}] <@${m.authorId}>: ${m.content}`).join("\n");
          if (transcript.length > 1900) transcript = transcript.substring(0, 1900) + "...";

          const logEmbed = new EmbedBuilder()
            .setTitle("Ticket Closed")
            .setColor(0xed4245)
            .addFields(
              { name: "User", value: `<@${thread.userId}>`, inline: true },
              { name: "Closed By", value: `<@${message.author.id}>`, inline: true },
              { name: "Transcript", value: transcript || "No messages", inline: false }
            )
            .setTimestamp();
          await logChannel.send({ embeds: [logEmbed] });
        }
      } catch (e) {
        console.log("Could not send modmail log");
      }
    }

    // Delete channel after delay
    await message.reply("✅ Ticket closed. Deleting channel...");
    setTimeout(async () => {
      try {
        await (message.channel as any).delete();
      } catch (e) {}
    }, 3000);
    return;
  }

  // Handle claim command
  if (message.guild && lowerContent === `${lowerPrefix}claim`) {
    // Silently ignore if not in a modmail channel
    const thread = await storage.getModmailThreadByChannel(message.channel.id);
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
    const claimRoleIds = config?.modmailClaimRoleIds || config?.modmailStaffRoleIds || [];
    const member = message.member;
    const hasClaimPermission = claimRoleIds.length === 0 || 
      (member && member.roles.cache.some(role => claimRoleIds.includes(role.id)));

    if (!hasClaimPermission) {
      await message.reply("❌ You don't have permission to claim tickets.");
      return;
    }

    await storage.updateModmailThread(thread.id, { claimedById: message.author.id });

    const claimEmbed = new EmbedBuilder()
      .setDescription(`🙋 Ticket claimed by <@${message.author.id}>`)
      .setColor(0x5865f2)
      .setTimestamp();
    await (message.channel as any).send({ embeds: [claimEmbed] });

    // Start 15-minute claim expiry timer
    const CLAIM_EXPIRY_TIME = 15 * 60 * 1000;
    const existingClaimTimer = pendingClaimExpiry.get(message.channel.id);
    if (existingClaimTimer) {
      clearTimeout(existingClaimTimer.timeout);
    }

    const channelId = message.channel.id;
    const claimExpiryTimeout = setTimeout(async () => {
      pendingClaimExpiry.delete(channelId);

      const currentThread = await storage.getModmailThreadByChannel(channelId);
      if (!currentThread || currentThread.status !== "open") return;
      if (currentThread.claimedById !== message.author.id) return;

      await storage.updateModmailThread(currentThread.id, { claimedById: null });
      try {
        const channel = await client.channels.fetch(channelId);
        if (channel && "send" in channel) {
          await channel.send(`⏰ Ticket auto-unclaimed. <@${message.author.id}> did not respond within 15 minutes.`);
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
  if (message.guild && message.content.toLowerCase() === ".ignore") {
    const thread = await storage.getModmailThreadByChannel(message.channel.id);
    if (!thread) {
      await message.reply("❌ This is not a modmail ticket channel.");
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

  // Handle !or and !unclaim command (claimer or admin can unclaim)
  if (message.guild && (lowerContent === `${lowerPrefix}or` || lowerContent === `${lowerPrefix}unclaim`)) {
    const thread = await storage.getModmailThreadByChannel(message.channel.id);
    if (!thread) {
      // Silent return if not a modmail channel (don't spam error in non-ticket channels)
      return;
    }

    if (thread.status !== "open") {
      await message.reply("❌ This ticket is already closed.");
      return;
    }

    if (!thread.claimedById) {
      await message.reply("❌ This ticket is not claimed by anyone.");
      return;
    }

    // Check permission: claimer can unclaim their own ticket, or admin can unclaim any ticket
    const member = message.member;
    const hasAdminPermission = member && member.permissions.has("Administrator");
    const isClaimedByUser = thread.claimedById === message.author.id;

    if (!isClaimedByUser && !hasAdminPermission) {
      await message.reply(`❌ Only <@${thread.claimedById}> (who claimed this ticket) or an administrator can unclaim it.`);
      return;
    }

    const previousClaimer = thread.claimedById;
    await storage.updateModmailThread(thread.id, { claimedById: null });

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

  // Handle !sub command (subscribe to ticket notifications)
  if (message.guild && message.content.toLowerCase().startsWith(".sub")) {
    const thread = await storage.getModmailThreadByChannel(message.channel.id);
    if (!thread) {
      return; // Silent return if not a modmail channel
    }

    if (thread.status !== "open") {
      await message.reply("❌ This ticket is already closed.");
      return;
    }

    // Parse target user (self or mentioned/ID)
    const args = message.content.substring(4).trim();
    let targetUserId = message.author.id;

    if (args) {
      // Check for mention or user ID
      const mentionMatch = args.match(/<@!?(\d+)>/);
      const idMatch = args.match(/^(\d+)$/);
      if (mentionMatch) {
        targetUserId = mentionMatch[1];
      } else if (idMatch) {
        targetUserId = idMatch[1];
      }
    }

    const currentSubs = thread.subscribedUserIds || [];
    if (currentSubs.includes(targetUserId)) {
      if (targetUserId === message.author.id) {
        await message.reply("❌ You are already subscribed to this ticket.");
      } else {
        await message.reply(`❌ <@${targetUserId}> is already subscribed to this ticket.`);
      }
      return;
    }

    const newSubs = [...currentSubs, targetUserId];
    await storage.updateModmailThread(thread.id, { subscribedUserIds: newSubs });

    if (targetUserId === message.author.id) {
      await message.reply("🔔 You are now subscribed to this ticket. You'll be pinged when the user replies.");
    } else {
      await message.reply(`🔔 <@${targetUserId}> is now subscribed to this ticket.`);
    }
    return;
  }

  // Handle .unsub command (unsubscribe from ticket notifications)
  if (message.guild && message.content.toLowerCase().startsWith(".unsub")) {
    const thread = await storage.getModmailThreadByChannel(message.channel.id);
    if (!thread) {
      return; // Silent return if not a modmail channel
    }

    if (thread.status !== "open") {
      await message.reply("❌ This ticket is already closed.");
      return;
    }

    // Parse target user (self or mentioned/ID)
    const args = message.content.substring(6).trim();
    let targetUserId = message.author.id;

    if (args) {
      // Check for mention or user ID
      const mentionMatch = args.match(/<@!?(\d+)>/);
      const idMatch = args.match(/^(\d+)$/);
      if (mentionMatch) {
        targetUserId = mentionMatch[1];
      } else if (idMatch) {
        targetUserId = idMatch[1];
      }
    }

    const currentSubs = thread.subscribedUserIds || [];
    if (!currentSubs.includes(targetUserId)) {
      if (targetUserId === message.author.id) {
        await message.reply("❌ You are not subscribed to this ticket.");
      } else {
        await message.reply(`❌ <@${targetUserId}> is not subscribed to this ticket.`);
      }
      return;
    }

    const newSubs = currentSubs.filter(id => id !== targetUserId);
    await storage.updateModmailThread(thread.id, { subscribedUserIds: newSubs });

    if (targetUserId === message.author.id) {
      await message.reply("🔕 You are now unsubscribed from this ticket.");
    } else {
      await message.reply(`🔕 <@${targetUserId}> is now unsubscribed from this ticket.`);
    }
    return;
  }

  // Handle snip commands for snippet management
  if (message.guild && lowerContent.startsWith(`${lowerPrefix}snip `)) {
    const args = message.content.substring(prefix.length + 5).trim();
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

      await message.reply(`✅ Snippet \`${alias}\` created. Use \`.${alias}\` in ticket channels to send it.`);
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

      const allSnippets = await storage.getAllSnippets(message.guild.id);
      if (allSnippets.length === 0) {
        await message.reply(`📝 No snippets configured. Use \`${prefix}snip create <alias> "<text>"\` to create one.`);
        return;
      }

      const list = allSnippets.map((s, i) => {
        const truncatedContent = s.content.length > 50 ? s.content.substring(0, 50) + "..." : s.content;
        return `${i + 1}.) "${s.alias}", Response: "${truncatedContent}"`;
      }).join("\n");
      await message.reply(`📝 **Available Snippets:**\n${list}`);
      return;
    } else {
      await message.reply(`❌ Unknown subcommand. Use \`${prefix}snip create\`, \`${prefix}snip edit\`, \`${prefix}snip delete\`, or \`${prefix}snip list\`.`);
      return;
    }
  }

  // Handle <prefix><alias> snippet usage in modmail ticket channels
  if (message.guild && lowerContent.startsWith(lowerPrefix) && !lowerContent.startsWith(`${lowerPrefix}snip`) && 
      !lowerContent.startsWith(`${lowerPrefix}close`) && !lowerContent.startsWith(`${lowerPrefix}c`) &&
      !lowerContent.startsWith(`${lowerPrefix}claim`) && !lowerContent.startsWith(`${lowerPrefix}or`) &&
      !lowerContent.startsWith(`${lowerPrefix}r`) && !lowerContent.startsWith(`${lowerPrefix}ar`) &&
      !lowerContent.startsWith(`${lowerPrefix}edit `) && !lowerContent.startsWith(`${lowerPrefix}delete`)) {
    const alias = message.content.substring(prefix.length).toLowerCase().split(" ")[0];
    if (alias) {
      const thread = await storage.getModmailThreadByChannel(message.channel.id);
      if (thread && thread.status === "open") {
        const snippet = await storage.getSnippet(message.guild.id, alias);
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

            await storage.addModmailMessage({
              threadId: thread.id,
              authorId: message.author.id,
              content: snippet.content,
              isStaff: "true",
              channelMessageId: channelMessage.id,
              dmMessageId: dmMessage.id,
            });

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

    // Check for active quiz first
    const quizState = activeQuizzes.get(message.author.id);
    if (quizState) {
      console.log(`[DM] User has active quiz, processing answer`);
      const answer = message.content.trim();
      await processQuizAnswer(message.author.id, answer, message.channel);
      return;
    }

    // Handle modmail DMs - only relay to EXISTING open threads
    // New tickets must be created via the dropdown menu in the server
    try {
      // Find an existing open thread for this user across all guilds
      let targetThread = null;
      let targetGuild = null;

      for (const guild of client.guilds.cache.values()) {
        try {
          const thread = await storage.getOpenModmailThread(guild.id, message.author.id);
          if (thread && thread.channelId) {
            targetThread = thread;
            targetGuild = guild;
            break;
          }
        } catch (e) {
          // No thread in this guild
        }
      }

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
          return;
        }

        // Send category selection dropdown
        const embed = new EmbedBuilder()
          .setTitle("Open a Support Ticket")
          .setDescription("Select a category below to open a new support ticket.")
          .setColor(0x5865f2);

        const selectMenu = new StringSelectMenuBuilder()
          .setCustomId(`dm_ticket_select_${availableGuild.id}`)
          .setPlaceholder("Select a category...")
          .addOptions(
            new StringSelectMenuOptionBuilder()
              .setLabel("General Inquiries")
              .setDescription("General questions and support")
              .setValue("general")
              .setEmoji("💬"),
            new StringSelectMenuOptionBuilder()
              .setLabel("Apply For Competitive")
              .setDescription("Apply to join the competitive team")
              .setValue("competitive")
              .setEmoji("🏆"),
            new StringSelectMenuOptionBuilder()
              .setLabel("Apply For Content Creator")
              .setDescription("Apply for content creator role")
              .setValue("contentcreator")
              .setEmoji("🎥"),
            new StringSelectMenuOptionBuilder()
              .setLabel("User Reports")
              .setDescription("Report a user")
              .setValue("report")
              .setEmoji("⚠️"),
            new StringSelectMenuOptionBuilder()
              .setLabel("Partnerships")
              .setDescription("Partnership inquiries")
              .setValue("partnerships")
              .setEmoji("🤝"),
            new StringSelectMenuOptionBuilder()
              .setLabel("Apply For GFX Editor")
              .setDescription("Apply for graphics editor role")
              .setValue("gfx")
              .setEmoji("🎨"),
            new StringSelectMenuOptionBuilder()
              .setLabel("Apply For Creative Warrior")
              .setDescription("Apply for creative warrior role")
              .setValue("creativewarrior")
              .setEmoji("⚔️"),
            new StringSelectMenuOptionBuilder()
              .setLabel("Apply For VFX Editor")
              .setDescription("Apply for VFX editor role")
              .setValue("vfxeditor")
              .setEmoji("✨")
          );

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
        const modmailChannel = await client.channels.fetch(targetThread.channelId!);
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

          await modmailChannel.send({ embeds: [userEmbed] });

          // Ping subscribed users
          const subs = targetThread.subscribedUserIds || [];
          if (subs.length > 0) {
            const pingContent = subs.map(id => `<@${id}>`).join(" ");
            const pingMsg = await modmailChannel.send({ content: pingContent });
            // Delete ping message after a short delay to keep channel clean
            setTimeout(() => pingMsg.delete().catch(() => {}), 3000);
          }

          // Save message
          await storage.addModmailMessage({
            threadId: targetThread.id,
            authorId: message.author.id,
            content: message.content,
            isStaff: "false",
          });

          // React to confirm
          await message.react("✅");
        }
      } catch (error) {
        console.log("Could not relay modmail message:", error);
      }
    } catch (error) {
      console.log("Modmail DM handler error:", error);
    }
    return;
  }

  // Handle .r <message> reply command in modmail channels (also allows .r with just attachments)
  if (message.guild && (lowerContent.startsWith(`${lowerPrefix}r `) || (lowerContent === `${lowerPrefix}r` && message.attachments.size > 0))) {
    // Silently ignore if not in a modmail channel
    const thread = await storage.getModmailThreadByChannel(message.channel.id);
    if (!thread) {
      return;
    }

    const replyContent = lowerContent === `${lowerPrefix}r` ? "" : message.content.substring(prefix.length + 2).trim();
    if (!replyContent && message.attachments.size === 0) {
      await message.reply(`❌ Please provide a message or attach files. Usage: \`${prefix}r <message>\` or \`${prefix}r\` with attachments`);
      return;
    }

    if (thread.status !== "open") {
      await message.reply("❌ This ticket is already closed.");
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
      const dmMessage = await user.send({ embeds: [staffEmbed] });

      // Send to channel as well
      const channelMessage = await (message.channel as any).send({ embeds: [staffEmbed] });

      // Save message with message IDs
      const savedMessage = await storage.addModmailMessage({
        threadId: thread.id,
        authorId: message.author.id,
        content: replyContent,
        isStaff: "true",
        channelMessageId: channelMessage.id,
        dmMessageId: dmMessage.id,
      });

      // Clear claim expiry timer when any staff responds (ticket is being actively handled)
      const existingClaimTimer = pendingClaimExpiry.get(message.channel.id);
      if (existingClaimTimer) {
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

      // Only start inactivity timer if ignoreInactivity is not set
      if (thread.ignoreInactivity === "true") {
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
            console.log("Could not DM user about inactivity warning");
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
            } catch (e) { console.log("[MODMAIL] Failed to delete channel on inactivity:", e); }
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

  // Handle .ar <message> anonymous reply command in modmail channels
  if (message.guild && (lowerContent.startsWith(`${lowerPrefix}ar `) || (lowerContent === `${lowerPrefix}ar` && message.attachments.size > 0))) {
    // Silently ignore if not in a modmail channel
    const thread = await storage.getModmailThreadByChannel(message.channel.id);
    if (!thread) {
      return;
    }

    const replyContent = lowerContent === `${lowerPrefix}ar` ? "" : message.content.substring(prefix.length + 3).trim();
    if (!replyContent && message.attachments.size === 0) {
      await message.reply(`❌ Please provide a message or attach files. Usage: \`${prefix}ar <message>\` or \`${prefix}ar\` with attachments`);
      return;
    }

    if (thread.status !== "open") {
      await message.reply("❌ This ticket is already closed.");
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

      // For channel message, show who sent it (for staff visibility)
      const channelEmbed = new EmbedBuilder()
        .setAuthor({ name: "Staff Team (Anonymous)", iconURL: message.author.displayAvatarURL() })
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
      await storage.addModmailMessage({
        threadId: thread.id,
        authorId: message.author.id,
        content: `[Anonymous] ${replyContent}`,
        isStaff: "true",
        channelMessageId: channelMessage.id,
        dmMessageId: dmMessage.id,
      });

      // Clear claim expiry timer when any staff responds
      const existingClaimTimer = pendingClaimExpiry.get(message.channel.id);
      if (existingClaimTimer) {
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

      // Only start inactivity timer if ignoreInactivity is not set
      if (thread.ignoreInactivity === "true") {
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
            console.log("Could not DM user about inactivity warning");
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
            } catch (e) { console.log("[MODMAIL] Failed to delete channel on inactivity:", e); }
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

      try {
        await message.delete();
      } catch (e) {
        console.log("Could not delete trigger message:", e);
      }
    } catch (error) {
      console.log("Could not relay anonymous staff message to user:", error);
      await message.react("❌");
    }
    return;
  }

  // Handle .edit (message_id) (new_message) or .edit (new_message) for most recent
  if (message.guild && lowerContent.startsWith(`${lowerPrefix}edit `)) {
    // Silently ignore if not in a modmail channel
    const thread = await storage.getModmailThreadByChannel(message.channel.id);
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
      modmailMsg = await storage.getModmailMessage(parts[0]);
      newContent = parts.slice(1).join(" ");
    } else if (parts[0] && discordIdRegex.test(parts[0])) {
      // First arg is Discord message ID (snowflake)
      modmailMsg = await storage.getModmailMessageByChannelMessageId(parts[0]);
      newContent = parts.slice(1).join(" ");
    } else {
      // No ID provided, use most recent staff message
      modmailMsg = await storage.getLatestStaffModmailMessage(thread.id);
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

      // Edit the channel message if we have its ID
      if (modmailMsg.channelMessageId) {
        try {
          const channelMsg = await (message.channel as any).messages.fetch(modmailMsg.channelMessageId);
          const editedEmbed = new EmbedBuilder()
            .setAuthor({ name: `${editRoleName} (Edited)`, iconURL: message.author.displayAvatarURL() })
            .setDescription(newContent)
            .setColor(0x5865f2)
            .setFooter({ text: `Edited by ${message.author.tag}` })
            .setTimestamp();
          await channelMsg.edit({ embeds: [editedEmbed] });
        } catch (e) {
          console.log("Could not edit channel message:", e);
        }
      }

      // Edit the DM message if we have its ID
      if (modmailMsg.dmMessageId) {
        try {
          const dmChannel = await user.createDM();
          const dmMsg = await dmChannel.messages.fetch(modmailMsg.dmMessageId);
          const editedEmbed = new EmbedBuilder()
            .setAuthor({ name: `${editRoleName} (Edited)`, iconURL: message.author.displayAvatarURL() })
            .setDescription(newContent)
            .setColor(0x5865f2)
            .setFooter({ text: `Edited by ${message.author.tag}` })
            .setTimestamp();
          await dmMsg.edit({ embeds: [editedEmbed] });
        } catch (e) {
          console.log("Could not edit DM message:", e);
        }
      }

      // Update in database
      await storage.updateModmailMessage(modmailMsg.id, { content: newContent });

      // Delete the edit command message
      try {
        await message.delete();
      } catch (e) {}

      // Send confirmation that auto-deletes
      const confirmMsg = await (message.channel as any).send("✅ Message edited successfully.");
      setTimeout(() => confirmMsg.delete().catch(() => {}), 3000);
    } catch (error) {
      console.log("Could not edit modmail message:", error);
      await message.reply("❌ Failed to edit message.");
    }
    return;
  }

  // Handle .delete (message_id) or .delete for most recent
  if (message.guild && lowerContent.startsWith(`${lowerPrefix}delete`)) {
    // Silently ignore if not in a modmail channel
    const thread = await storage.getModmailThreadByChannel(message.channel.id);
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
      modmailMsg = await storage.getModmailMessage(args);
    } else if (args && discordIdRegex.test(args)) {
      // Discord message ID (snowflake)
      modmailMsg = await storage.getModmailMessageByChannelMessageId(args);
    } else {
      // No ID provided, use most recent staff message
      modmailMsg = await storage.getLatestStaffModmailMessage(thread.id);
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
      await storage.deleteModmailMessage(modmailMsg.id);

      // Delete the delete command message
      try {
        await message.delete();
      } catch (e) {}

      // Send confirmation that auto-deletes
      const confirmMsg = await (message.channel as any).send("✅ Message deleted successfully.");
      setTimeout(() => confirmMsg.delete().catch(() => {}), 3000);
    } catch (error) {
      console.log("Could not delete modmail message:", error);
      await message.reply("❌ Failed to delete message.");
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

client.on("guildMemberUpdate", async (oldMember, newMember) => {
  console.log(`[ROLE SYNC] guildMemberUpdate triggered for ${newMember.user.tag} in guild ${newMember.guild.name} (${newMember.guild.id})`);

  const oldRoles = Array.from(oldMember.roles.cache.keys());
  const newRoles = Array.from(newMember.roles.cache.keys());

  const allRosterRoles = [...PLAYER_ROLE_IDS, ...STAFF_ROLE_IDS];

  const hasRosterRoleChange = allRosterRoles.some(roleId => 
    oldRoles.includes(roleId) !== newRoles.includes(roleId)
  );

  if (hasRosterRoleChange) {
    console.log(`Roster role changed for ${newMember.user.tag}, updating rosters...`);
    await updateRosterMessages(newMember.guild.id);
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
