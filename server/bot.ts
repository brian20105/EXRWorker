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
    GatewayIntentBits.GuildMembers,
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
        .setDescription("The user for the payout (required for Add)")
        .setRequired(false)
    )
    .addStringOption((option) =>
      option
        .setName("payout_id")
        .setDescription("Payout request ID (required for Edit/Remove)")
        .setRequired(false)
    )
    .addStringOption((option) =>
      option
        .setName("amount")
        .setDescription("Amount owed (for add/edit)")
        .setRequired(false)
    )
    .addStringOption((option) =>
      option
        .setName("email")
        .setDescription("PayPal email (for add/edit)")
        .setRequired(false)
    )
    .addStringOption((option) =>
      option
        .setName("reason")
        .setDescription("Reason for payout (for add/edit)")
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
];

const STAFF_ROLE_IDS = [
  "1447070054960332871",
  "1447118813022781554",
  "1447070441058336789",
  "1447070950750294026",
  "1447118712183459882",
  "1447071053334708406",
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
      playerRoster += "None\n";
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
      staffRoster += "None\n";
    } else {
      staffRoster += members.join("\n") + "\n";
    }
  }
  
  return staffRoster;
}

async function updateRosterMessages(guildId: string): Promise<void> {
  try {
    const config = await storage.getGuildConfig(guildId);
    if (!config) return;
    
    const guild = client.guilds.cache.get(guildId);
    if (!guild) return;
    
    try {
      await guild.members.fetch({ time: 30000 });
    } catch (error) {
      console.log("Could not fetch all members for roster update, using cached");
    }
    
    if (config.playerRosterMessageId && config.playerRosterChannelId) {
      try {
        const channel = await client.channels.fetch(config.playerRosterChannelId);
        if (channel && "messages" in channel) {
          const message = await channel.messages.fetch(config.playerRosterMessageId);
          const newContent = await generatePlayerRoster(guild);
          await message.edit(newContent);
          console.log("Updated player roster");
        }
      } catch (error) {
        console.log("Could not update player roster message");
      }
    }
    
    if (config.staffRosterMessageId && config.staffRosterChannelId) {
      try {
        const channel = await client.channels.fetch(config.staffRosterChannelId);
        if (channel && "messages" in channel) {
          const message = await channel.messages.fetch(config.staffRosterMessageId);
          const newContent = await generateStaffRoster(guild);
          await message.edit(newContent);
          console.log("Updated staff roster");
        }
      } catch (error) {
        console.log("Could not update staff roster message");
      }
    }
  } catch (error) {
    console.error("Error updating roster messages:", error);
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
    // Check if interaction is still valid
    if (interaction.isRepliable() && interaction.replied) {
      console.log('Interaction already replied to:', interaction.id);
      return;
    }
    
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
      } else if (commandName === "list_payouts") {
        const member = interaction.member;
        const memberRoles = member && 'roles' in member 
          ? (Array.isArray(member.roles) ? member.roles : Array.from(member.roles.cache.keys()))
          : undefined;
        const memberPermissions = member && 'permissions' in member 
          ? (typeof member.permissions === 'string' ? member.permissions : member.permissions?.bitfield)
          : undefined;
        
        const hasPermission = await hasPayoutPermission(memberRoles, memberPermissions, interaction.guildId!);
        if (!hasPermission) {
          await interaction.reply({
            content: "❌ You don't have permission to view payout requests.",
            flags: 64,
          });
          return;
        }
        
        const isPrivate = interaction.options.getBoolean("private") ?? true;
        await interaction.deferReply({ flags: isPrivate ? 64 : undefined });
        
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
        
        await interaction.deferReply({ flags: 64 });
        
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
      } else if (commandName === "user_payouts") {
        const member = interaction.member;
        const memberRoles = member && 'roles' in member 
          ? (Array.isArray(member.roles) ? member.roles : Array.from(member.roles.cache.keys()))
          : undefined;
        const memberPermissions = member && 'permissions' in member 
          ? (typeof member.permissions === 'string' ? member.permissions : member.permissions?.bitfield)
          : undefined;
        
        const hasPermission = await hasPayoutPermission(memberRoles, memberPermissions, interaction.guildId!);
        if (!hasPermission) {
          await interaction.reply({
            content: "❌ You don't have permission to view payout requests.",
            flags: 64,
          });
          return;
        }
        
        await interaction.deferReply({ flags: 64 });
        
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
        const member = interaction.member;
        const memberRoles = member && 'roles' in member 
          ? (Array.isArray(member.roles) ? member.roles : Array.from(member.roles.cache.keys()))
          : undefined;
        const memberPermissions = member && 'permissions' in member 
          ? (typeof member.permissions === 'string' ? member.permissions : member.permissions?.bitfield)
          : undefined;
        
        const hasPermission = await hasPayoutPermission(memberRoles, memberPermissions, interaction.guildId!);
        if (!hasPermission) {
          await interaction.reply({
            content: "❌ You don't have permission to manage payout requests.",
            flags: 64,
          });
          return;
        }
        
        const action = interaction.options.getString("action", true);
        const targetUser = interaction.options.getUser("user");
        const payoutId = interaction.options.getString("payout_id");
        
        await interaction.deferReply({ flags: 64 });
        
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
          
          const payoutRequest = await storage.createPayoutRequest({
            guildId: interaction.guildId!,
            userId: targetUser.id,
            requestedById: interaction.user.id,
            reason,
            moneyOwed: amount,
            email,
            status: "pending",
          });
          
          const config = await storage.getGuildConfig(interaction.guildId!);
          if (config?.requestChannelId) {
            try {
              const requestChannel = await client.channels.fetch(config.requestChannelId);
              if (requestChannel && "send" in requestChannel) {
                const embed = new EmbedBuilder()
                  .setTitle("Payout Request")
                  .setColor(0xf0b232)
                  .addFields(
                    { name: "User ID", value: `${targetUser.id} (<@${targetUser.id}>)`, inline: true },
                    { name: "Requested by", value: `<@${interaction.user.id}>`, inline: true },
                    { name: "Status", value: "⏳ Pending", inline: true },
                    { name: "Reason", value: reason, inline: false },
                    { name: "Money Owed", value: `$${amount}`, inline: false },
                    { name: "Paypal", value: email, inline: false }
                  )
                  .setFooter({ text: `Request ID: ${payoutRequest.id}` })
                  .setTimestamp();

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
              }
            } catch (error) {
              console.log("Could not send to request channel:", error);
            }
          }
          
          await interaction.editReply({
            content: `✅ Payout request added for <@${targetUser.id}> - $${amount}`,
          });
        } else if (action === "edit") {
          if (!payoutId) {
            await interaction.editReply({
              content: "❌ You must specify a payout_id for the Edit action. You can find the ID in the payout list or request embed footer.",
            });
            return;
          }
          
          const payout = await storage.getPayoutRequest(payoutId);
          
          if (!payout) {
            await interaction.editReply({
              content: `❌ Payout request with ID \`${payoutId}\` not found.`,
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
            content: `✅ Updated payout request \`${payoutId}\`.\n**Changes:** ${changedFields.join(", ")}`,
          });
        } else if (action === "remove") {
          if (!payoutId) {
            await interaction.editReply({
              content: "❌ You must specify a payout_id for the Remove action. You can find the ID in the payout list or request embed footer.",
            });
            return;
          }
          
          const payout = await storage.getPayoutRequest(payoutId);
          
          if (!payout) {
            await interaction.editReply({
              content: `❌ Payout request with ID \`${payoutId}\` not found.`,
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
            content: `✅ Removed payout request \`${payoutId}\`.`,
          });
        }
      } else if (commandName === "sync_roles") {
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
          await interaction.reply({
            content: "❌ You need Administrator permission to manage role sync pairs.",
            flags: 64,
          });
          return;
        }
        
        await interaction.deferReply({ flags: 64 });
        
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
            content: `✅ Role sync pair added!\n**Source:** <@&${sourceRoleId}> (Server: ${sourceGuildId})\n**Target:** <@&${targetRoleId}> (Server: ${targetGuildId})\n\nPair IDs: \`${pair1.id}\`, \`${pair2.id}\``,
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
        await interaction.deferReply();
        
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
      }
    } else if (interaction.isButton()) {
      if (interaction.customId.startsWith("members_prev_") || interaction.customId.startsWith("members_next_")) {
        await interaction.deferUpdate();
        
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
        try {
          const [action, requestId] = interaction.customId.split("_");
          
          // Build and show modal immediately to prevent timeout
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
          await interaction.showModal(modal);
        } catch (error: any) {
          if (error.code === 10062 || error.code === 40060) {
            console.log('Interaction expired or already acknowledged:', interaction.id);
          } else {
            throw error;
          }
        }
        return;
      }
    } else if (interaction.isModalSubmit()) {
      if (interaction.customId === "payout_modal") {
        // Defer reply immediately to prevent timeout
        try {
          await interaction.deferReply({ flags: 64 });
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
          await interaction.deferReply({ flags: 64 });
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

        await message.edit({
          embeds: [updatedEmbed],
          components: [],
        });

        await interaction.editReply({
          content: `Request ${action === "approve" ? "approved" : "denied"} successfully.`,
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
    if (interaction.isRepliable() && !interaction.replied && !interaction.deferred) {
      try {
        await interaction.reply({
          content: "An error occurred while processing your request.",
          flags: 64,
        });
      } catch (replyError: any) {
        if (replyError.code !== 10062 && replyError.code !== 40060) {
          console.error("Failed to send error message:", replyError);
        }
      }
    }
  }
});

client.on("error", (error) => {
  console.error("Discord client error:", error);
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
      try {
        targetMember = await targetGuild.members.fetch(newMember.id);
      } catch (error) {
        console.log(`[ROLE SYNC] User ${newMember.user.tag} not found in target guild`);
        continue;
      }
      
      if (addedRoles.includes(pair.sourceRoleId)) {
        if (!targetMember.roles.cache.has(pair.targetRoleId)) {
          try {
            await targetMember.roles.add(pair.targetRoleId);
            console.log(`[ROLE SYNC] Added role ${pair.targetRoleId} to ${newMember.user.tag} in ${targetGuild.name}`);
          } catch (error) {
            console.log(`[ROLE SYNC] Failed to add role ${pair.targetRoleId}:`, error);
          }
        }
      }
      
      if (removedRoles.includes(pair.sourceRoleId)) {
        if (targetMember.roles.cache.has(pair.targetRoleId)) {
          try {
            await targetMember.roles.remove(pair.targetRoleId);
            console.log(`[ROLE SYNC] Removed role ${pair.targetRoleId} from ${newMember.user.tag} in ${targetGuild.name}`);
          } catch (error) {
            console.log(`[ROLE SYNC] Failed to remove role ${pair.targetRoleId}:`, error);
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
