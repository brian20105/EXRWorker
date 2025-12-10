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
  ],
});

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

client.once("ready", async () => {
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
    if (interaction.isChatInputCommand()) {
      const { commandName } = interaction;

      if (commandName === "setup_pay_request") {
        // Defer reply immediately to prevent timeout
        await interaction.deferReply({ flags: 64 }); // 64 = ephemeral
        
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
          content: `✅ Configuration saved! Payout requests will be sent to <#${channel.id}>.`,
        });
      } else if (commandName === "setup_payment_logs") {
        const channel = interaction.options.getChannel("channel", true);
        
        await storage.updateLogChannel(interaction.guildId!, channel.id);
        
        await interaction.reply({
          content: `✅ Configuration saved! Payment logs will be sent to <#${channel.id}>.`,
          flags: 64,
        });
      } else if (commandName === "payout_permission") {
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
        
        await interaction.reply({
          content: `✅ Payout permissions updated! The following roles can now approve/deny payouts:\n${roleNames.map(r => `• ${r}`).join('\n')}`,
          flags: 64,
        });
      }
    } else if (interaction.isButton()) {
      if (interaction.customId === "request_payout") {
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

        await interaction.showModal(modal);
      } else if (interaction.customId.startsWith("approve_") || interaction.customId.startsWith("deny_")) {
        const [action, requestId] = interaction.customId.split("_");
        
        const member = interaction.member;
        const memberRoles = member && 'roles' in member 
          ? (Array.isArray(member.roles) ? member.roles : Array.from(member.roles.cache.keys()))
          : undefined;
        const memberPermissions = interaction.memberPermissions?.bitfield;
        
        const hasPermission = await hasPayoutPermission(memberRoles, memberPermissions, interaction.guildId!);
        if (!hasPermission) {
          await interaction.reply({
            content: "❌ You don't have permission to approve or deny payout requests.",
            flags: 64,
          });
          return;
        }
        
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

        await interaction.showModal(modal);
      }
    } else if (interaction.isModalSubmit()) {
      if (interaction.customId === "payout_modal") {
        const userId = interaction.fields.getTextInputValue("user_id");
        const reason = interaction.fields.getTextInputValue("reason");
        const moneyOwed = interaction.fields.getTextInputValue("money_owed");
        const paypal = interaction.fields.getTextInputValue("paypal");

        await interaction.reply({
          content: "Your payout request has been submitted!",
          flags: 64,
        });

        const config = await storage.getGuildConfig(interaction.guildId!);
        if (!config?.requestChannelId) {
          await interaction.followUp({
            content: "⚠️  Request channel not configured. Please ask an admin to run `/setup_pay_request`.",
            flags: 64,
          });
          return;
        }

        const requestChannel = await client.channels.fetch(config.requestChannelId);
        if (!requestChannel || !("send" in requestChannel)) return;

        const requestId = Date.now().toString();
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

        await requestChannel.send({
          embeds: [embed],
          components: [row],
        });
      } else if (interaction.customId.startsWith("action_reason_")) {
        const parts = interaction.customId.split("_");
        const action = parts[2];
        const requestId = parts[3];
        const actionReason = interaction.fields.getTextInputValue("action_reason") || undefined;
        
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

        await message.edit({
          embeds: [updatedEmbed],
          components: [],
        });

        await interaction.reply({
          content: `Request ${action === "approve" ? "approved" : "denied"} successfully.`,
          flags: 64,
        });

        const dmStatus = action === "approve" ? "approved" : "denied";
        await sendDMToUser(userId, dmStatus, reason, moneyOwed, paypal, actionReason);
        await sendDMToStaff(requestedById, dmStatus, userId, moneyOwed, paypal, actionReason);

        const config = await storage.getGuildConfig(interaction.guildId!);
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
      }
    }
  } catch (error) {
    console.error("Error handling interaction:", error);
    if (interaction.isRepliable() && !interaction.replied) {
      await interaction.reply({
        content: "An error occurred while processing your request.",
        flags: 64,
      }).catch(() => {});
    }
  }
});

client.on("error", (error) => {
  console.error("Discord client error:", error);
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
