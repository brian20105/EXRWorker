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
].map((command) => command.toJSON());

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
        const channel = interaction.options.getChannel("channel", true);
        
        await storage.updateRequestChannel(interaction.guildId!, channel.id);
        
        await interaction.reply({
          content: `✅ Configuration saved! Payout requests will be sent to <#${channel.id}>.`,
          ephemeral: true,
        });

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
      } else if (commandName === "setup_payment_logs") {
        const channel = interaction.options.getChannel("channel", true);
        
        await storage.updateLogChannel(interaction.guildId!, channel.id);
        
        await interaction.reply({
          content: `✅ Configuration saved! Payment logs will be sent to <#${channel.id}>.`,
          ephemeral: true,
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

        const paypalInput = new TextInputBuilder()
          .setCustomId("paypal")
          .setLabel("Paypal Username/Email")
          .setStyle(TextInputStyle.Short)
          .setPlaceholder("email@example.com")
          .setRequired(true);

        const row1 = new ActionRowBuilder<TextInputBuilder>().addComponents(userIdInput);
        const row2 = new ActionRowBuilder<TextInputBuilder>().addComponents(reasonInput);
        const row3 = new ActionRowBuilder<TextInputBuilder>().addComponents(paypalInput);

        modal.addComponents(row1, row2, row3);

        await interaction.showModal(modal);
      } else if (interaction.customId.startsWith("approve_") || interaction.customId.startsWith("deny_")) {
        const [action, requestId] = interaction.customId.split("_");
        const message = interaction.message;
        
        if (!message.embeds[0]) return;
        
        const originalEmbed = message.embeds[0];
        const fields = originalEmbed.fields;
        
        const userId = fields.find(f => f.name === "User ID")?.value || "Unknown";
        const requestedBy = fields.find(f => f.name === "Requested by")?.value || "Unknown";
        const reason = fields.find(f => f.name === "Reason")?.value || "No reason provided";
        const paypal = fields.find(f => f.name === "Paypal")?.value || "Not provided";
        
        const status = action === "approve" ? "✅ Approved" : "❌ Denied";
        const color = action === "approve" ? 0x23a559 : 0xda373c;

        const updatedEmbed = new EmbedBuilder()
          .setTitle("Payout Request")
          .setColor(color)
          .addFields(
            { name: "User ID", value: userId, inline: true },
            { name: "Requested by", value: requestedBy, inline: true },
            { name: "Status", value: status, inline: true },
            { name: "Reason", value: reason, inline: false },
            { name: "Paypal", value: paypal, inline: false },
            { name: "Actioned by", value: `<@${interaction.user.id}>`, inline: false }
          )
          .setFooter({ text: `Request ID: ${requestId}` })
          .setTimestamp();

        await message.edit({
          embeds: [updatedEmbed],
          components: [],
        });

        await interaction.reply({
          content: `Request ${action === "approve" ? "approved" : "denied"} successfully.`,
          ephemeral: true,
        });

        if (action === "approve") {
          const config = await storage.getGuildConfig(interaction.guildId!);
          if (config?.logChannelId) {
            const logChannel = await client.channels.fetch(config.logChannelId);
            if (logChannel && "send" in logChannel) {
              const logEmbed = new EmbedBuilder()
                .setTitle("Payment Logged")
                .setDescription(`Payment successfully processed for User ID: ${userId}`)
                .setColor(0x23a559)
                .addFields(
                  { name: "Amount", value: "$0.00 (Example)", inline: true },
                  { name: "Recipient", value: paypal, inline: true }
                )
                .setTimestamp();

              await logChannel.send({ embeds: [logEmbed] });
            }
          }
        }
      }
    } else if (interaction.isModalSubmit()) {
      if (interaction.customId === "payout_modal") {
        const userId = interaction.fields.getTextInputValue("user_id");
        const reason = interaction.fields.getTextInputValue("reason");
        const paypal = interaction.fields.getTextInputValue("paypal");

        await interaction.reply({
          content: "Your payout request has been submitted!",
          ephemeral: true,
        });

        const config = await storage.getGuildConfig(interaction.guildId!);
        if (!config?.requestChannelId) {
          await interaction.followUp({
            content: "⚠️  Request channel not configured. Please ask an admin to run `/setup_pay_request`.",
            ephemeral: true,
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
            { name: "User ID", value: userId, inline: true },
            { name: "Requested by", value: `<@${interaction.user.id}>`, inline: true },
            { name: "Status", value: "⏳ Pending", inline: true },
            { name: "Reason", value: reason, inline: false },
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
      }
    }
  } catch (error) {
    console.error("Error handling interaction:", error);
    if (interaction.isRepliable() && !interaction.replied) {
      await interaction.reply({
        content: "An error occurred while processing your request.",
        ephemeral: true,
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
