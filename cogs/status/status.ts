import {
  SlashCommandBuilder,
  ChatInputCommandInteraction,
  EmbedBuilder,
  Colors,
  PermissionFlagsBits,
  MessageFlags,
} from "discord.js";
import { UptimeKuma } from "./uptimekuma";
import { HetrixTools } from "./hetrix";
import { Instatus } from "./instatus";
import {
  getStatusConfig,
  getAllStatusConfigs,
  setStatusConfig,
  deleteStatusConfig,
  updateLastChecked,
  type StatusConfig,
} from "./database";

const SUPPORTED_SERVICES = ["uptimekuma", "hetrixtools", "instatus"] as const;
type ServiceType = (typeof SUPPORTED_SERVICES)[number];

export default {
  data: new SlashCommandBuilder()
    .setName("status")
    .setDescription("Check and configure service status monitoring")
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageGuild)
    .addSubcommand((sub) =>
      sub
        .setName("check")
        .setDescription("Check status of a service")
        .addStringOption((option) =>
          option
            .setName("service")
            .setDescription("Service to check status for")
            .setRequired(true)
            .addChoices(
              { name: "Uptime Kuma", value: "uptimekuma" },
              { name: "HetrixTools", value: "hetrixtools" },
              { name: "Instatus", value: "instatus" }
            )
        )
    )
    .addSubcommand((sub) =>
      sub
        .setName("list")
        .setDescription("List all monitored services and their current status")
    )
    .addSubcommand((sub) =>
      sub
        .setName("configure")
        .setDescription("Configure a status monitoring service")
        .addStringOption((option) =>
          option
            .setName("service")
            .setDescription("Service to configure")
            .setRequired(true)
            .addChoices(
              { name: "Uptime Kuma", value: "uptimekuma" },
              { name: "HetrixTools", value: "hetrixtools" },
              { name: "Instatus", value: "instatus" }
            )
        )
        .addStringOption((option) =>
          option
            .setName("url")
            .setDescription("Service URL or ID")
            .setRequired(true)
        )
        .addStringOption((option) =>
          option
            .setName("api_key")
            .setDescription("API key (required for HetrixTools and Instatus)")
        )
        .addChannelOption((option) =>
          option.setName("channel").setDescription("Channel for status updates")
        )
        .addIntegerOption((option) =>
          option
            .setName("interval")
            .setDescription("Update interval in seconds (minimum 60)")
            .setMinValue(60)
        )
    )
    .addSubcommand((sub) =>
      sub
        .setName("remove")
        .setDescription("Remove a service configuration")
        .addStringOption((option) =>
          option
            .setName("service")
            .setDescription("Service to remove")
            .setRequired(true)
            .addChoices(
              { name: "Uptime Kuma", value: "uptimekuma" },
              { name: "HetrixTools", value: "hetrixtools" },
              { name: "Instatus", value: "instatus" }
            )
        )
    ),

  async execute(interaction: ChatInputCommandInteraction) {
    if (!interaction.guildId) {
      await interaction.reply({
        content: "This command can only be used in a server!",
        ephemeral: true,
      });
      return;
    }

    const subcommand = interaction.options.getSubcommand();

    switch (subcommand) {
      case "check":
        await handleCheckStatus(interaction);
        break;
      case "list":
        await handleListStatus(interaction);
        break;
      case "configure":
        await handleConfigure(interaction);
        break;
      case "remove":
        await handleRemove(interaction);
        break;
    }
  },
};

export async function getServiceInstance(
  config: StatusConfig
): Promise<UptimeKuma | HetrixTools | Instatus> {
  switch (config.serviceType) {
    case "uptimekuma":
      return new UptimeKuma(config.url);
    case "hetrixtools":
      if (!config.apiKey) throw new Error("API key required for HetrixTools");
      return new HetrixTools(config.apiKey, config.url);
    case "instatus":
      if (!config.apiKey) throw new Error("API key required for Instatus");
      return new Instatus(config.url, config.apiKey);
    default:
      throw new Error(`Unsupported service type: ${config.serviceType}`);
  }
}

async function handleCheckStatus(interaction: ChatInputCommandInteraction) {
  const serviceType = interaction.options.getString(
    "service",
    true
  ) as ServiceType;
  const config = await getStatusConfig(interaction.guildId!, serviceType);

  if (!config) {
    await interaction.reply({
      content: `No configuration found for ${serviceType}. Use \`/status configure\` to set it up.`,
      ephemeral: true,
    });
    return;
  }

  await interaction.deferReply();

  try {
    const service = await getServiceInstance(config);
    const status = await service.getStatus();
    await updateLastChecked(interaction.guildId!, serviceType);

    const embed = new EmbedBuilder()
      .setTitle(`${capitalize(serviceType)} Status`)
      .setColor(status.online ? Colors.Green : Colors.Red)
      .addFields(
        {
          name: "Status",
          value: status.online ? "🟢 Online" : "🔴 Offline",
          inline: true,
        },
        { name: "Uptime", value: status.uptime, inline: true },
        { name: "Latency", value: status.latency, inline: true },
        {
          name: "Last Checked",
          value: status.lastChecked.toLocaleString(),
          inline: false,
        }
      );

    if (status.message) {
      embed.addFields({
        name: "Message",
        value: status.message,
        inline: false,
      });
    }

    embed.setTimestamp();
    await interaction.editReply({ embeds: [embed] });
  } catch (error) {
    await interaction.followUp({
      content: `Error checking status: ${
        error instanceof Error ? error.message : "Unknown error"
      }`,
      ephemeral: true,
    });
  }
}

async function handleListStatus(interaction: ChatInputCommandInteraction) {
  const configs = await getAllStatusConfigs(interaction.guildId!);

  if (configs.length === 0) {
    await interaction.reply({
      content:
        "No services configured. Use `/status configure` to set up monitoring.",
      ephemeral: true,
    });
    return;
  }

  await interaction.deferReply();

  const embed = new EmbedBuilder()
    .setTitle("Services Status")
    .setColor(Colors.Blue)
    .setDescription("Current status of all monitored services");

  for (const config of configs) {
    try {
      const service = await getServiceInstance(config);
      const status = await service.getStatus();

      embed.addFields({
        name: capitalize(config.serviceType),
        value: [
          `Status: ${status.online ? "🟢 Online" : "🔴 Offline"}`,
          `Uptime: ${status.uptime}`,
          `Latency: ${status.latency}`,
          `URL: ${config.url}`,
          config.channelId ? `Updates: <#${config.channelId}>` : "",
        ]
          .filter(Boolean)
          .join("\n"),
        inline: true,
      });
    } catch (error) {
      embed.addFields({
        name: capitalize(config.serviceType),
        value: `Error: ${
          error instanceof Error ? error.message : "Unknown error"
        }`,
        inline: true,
      });
    }
  }

  embed.setTimestamp();
  await interaction.editReply({ embeds: [embed] });
}

async function handleConfigure(interaction: ChatInputCommandInteraction) {
  const serviceType = interaction.options.getString(
    "service",
    true
  ) as ServiceType;
  const url = interaction.options.getString("url", true);
  const apiKey = interaction.options.getString("api_key");
  const channel = interaction.options.getChannel("channel");
  const interval = interaction.options.getInteger("interval") ?? 300;

  if (
    (serviceType === "hetrixtools" || serviceType === "instatus") &&
    !apiKey
  ) {
    await interaction.reply({
      content: `API key is required for ${serviceType}`,
      ephemeral: true,
    });
    return;
  }

  const config: StatusConfig = {
    guildId: interaction.guildId!,
    serviceType,
    url,
    apiKey: apiKey ?? undefined,
    channelId: channel?.id,
    updateInterval: interval,
    enabled: true,
    lastChecked: Date.now(),
  };

  try {
    await setStatusConfig(config);
    await interaction.reply({
      content: `Successfully configured ${serviceType} monitoring!`,
      ephemeral: true,
    });
  } catch (error) {
    await interaction.reply({
      content: `Error configuring service: ${
        error instanceof Error ? error.message : "Unknown error"
      }`,
      ephemeral: true,
    });
  }
}

async function handleRemove(interaction: ChatInputCommandInteraction) {
  const serviceType = interaction.options.getString(
    "service",
    true
  ) as ServiceType;

  try {
    await deleteStatusConfig(interaction.guildId!, serviceType);
    await interaction.reply({
      content: `Successfully removed ${serviceType} monitoring configuration!`,
      ephemeral: true,
    });
  } catch (error) {
    await interaction.reply({
      content: `Error removing configuration: ${
        error instanceof Error ? error.message : "Unknown error"
      }`,
      ephemeral: true,
    });
  }
}

function capitalize(str: string): string {
  return str.charAt(0).toUpperCase() + str.slice(1);
}
