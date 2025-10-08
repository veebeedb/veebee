import {
  Client,
  ChatInputCommandInteraction,
  SlashCommandBuilder,
} from "discord.js";
import { CogSystem } from "../cogsystem/cogsystem";
import type { CogInfo } from "../types/cog";

export const cogsCommand = {
  data: new SlashCommandBuilder()
    .setName("cogs")
    .setDescription("Manage bot cogs/extensions")
    .addSubcommand((subcommand) =>
      subcommand.setName("list").setDescription("List all available cogs")
    )
    .addSubcommand((subcommand) =>
      subcommand
        .setName("enable")
        .setDescription("Enable a cog")
        .addStringOption((option) =>
          option
            .setName("name")
            .setDescription("The name of the cog to enable")
            .setRequired(true)
        )
    )
    .addSubcommand((subcommand) =>
      subcommand
        .setName("disable")
        .setDescription("Disable a cog")
        .addStringOption((option) =>
          option
            .setName("name")
            .setDescription("The name of the cog to disable")
            .setRequired(true)
        )
    )
    .addSubcommand((subcommand) =>
      subcommand
        .setName("reload")
        .setDescription("Reload a cog")
        .addStringOption((option) =>
          option
            .setName("name")
            .setDescription("The name of the cog to reload")
            .setRequired(true)
        )
    ),

  async execute(
    interaction: ChatInputCommandInteraction,
    client: Client,
    cogSystem: CogSystem
  ) {
    const subcommand = interaction.options.getSubcommand();

    switch (subcommand) {
      case "list": {
        const loadedCogs = cogSystem.getLoadedCogs();
        const cogList = Array.from(loadedCogs.values()).map((cog) => {
          const info: CogInfo = cog.info;
          const state = cogSystem.getCogState(info.name);
          return `**${info.name}** v${info.version} by ${info.author}
                    Status: ${state?.enabled ? "✅ Enabled" : "❌ Disabled"}
                    Description: ${info.description}`;
        });

        if (cogList.length === 0) {
          await interaction.reply("No cogs are currently loaded.");
          return;
        }

        await interaction.reply(`**Loaded Cogs:**\n\n${cogList.join("\n\n")}`);
        break;
      }

      case "enable": {
        const cogName = interaction.options.getString("name", true);
        try {
          const success = await cogSystem.enableCog(cogName);
          if (success) {
            await interaction.reply(`✅ Successfully enabled cog "${cogName}"`);
          } else {
            await interaction.reply(
              `❌ Failed to enable cog "${cogName}". Check logs for details.`
            );
          }
        } catch (error: any) {
          await interaction.reply(
            `❌ Error: ${error?.message || String(error)}`
          );
        }
        break;
      }

      case "disable": {
        const cogName = interaction.options.getString("name", true);
        try {
          const success = await cogSystem.disableCog(cogName);
          if (success) {
            await interaction.reply(
              `✅ Successfully disabled cog "${cogName}"`
            );
          } else {
            await interaction.reply(
              `❌ Failed to disable cog "${cogName}". Check logs for details.`
            );
          }
        } catch (error: any) {
          await interaction.reply(
            `❌ Error: ${error?.message || String(error)}`
          );
        }
        break;
      }

      case "reload": {
        const cogName = interaction.options.getString("name", true);
        try {
          const result = await cogSystem.reloadCog(cogName);
          if (result.success) {
            await interaction.reply(
              `✅ Successfully reloaded cog "${cogName}"`
            );
          } else {
            await interaction.reply(
              `❌ Failed to reload cog "${cogName}": ${result.error.message}`
            );
          }
        } catch (error: any) {
          await interaction.reply(
            `❌ Error: ${error?.message || String(error)}`
          );
        }
        break;
      }
    }
  },
};
