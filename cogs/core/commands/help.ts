import {
  SlashCommandBuilder,
  ChatInputCommandInteraction,
  EmbedBuilder,
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  ComponentType,
  MessageFlags,
  Message,
} from "discord.js";

import type { ExtendedClient } from "../../../bot.ts";

export default {
  data: new SlashCommandBuilder()
    .setName("help")
    .setDescription("List all available commands, grouped by category."),

  async execute(interaction: ChatInputCommandInteraction) {
    const client = interaction.client as ExtendedClient;

    const categorizedCommands = new Map<
      string,
      { name: string; description?: string }[]
    >();

    for (const command of client.commands.values()) {
      const json = command.data.toJSON();
      const category = (command as any).category ?? "uncategorized";

      if (!categorizedCommands.has(category)) {
        categorizedCommands.set(category, []);
      }

      categorizedCommands.get(category)!.push({
        name: json.name,
        description: json.description,
      });
    }

    const categories = [...categorizedCommands.entries()];
    let currentPage = 0;
    const totalPages = categories.length;

    const generateEmbed = (page: number) => {
      const entry = categories[page];
      if (!entry) {
        throw new Error(`Invalid page index: ${page}`);
      }

      const [categoryName, commands] = entry;
      const embed = new EmbedBuilder()
        .setTitle(`Category: ${capitalize(categoryName)}`)
        .setColor("#FF91A4")
        .setFooter({ text: `Page ${page + 1} of ${totalPages}` })
        .setTimestamp();

      for (const cmd of commands) {
        embed.addFields({
          name: `/${cmd.name}`,
          value: cmd.description || "No description provided.",
        });
      }

      return embed;
    };

    const components = (page: number) => {
      return [
        new ActionRowBuilder<ButtonBuilder>().addComponents(
          new ButtonBuilder()
            .setCustomId("prev")
            .setLabel("◀ Previous")
            .setStyle(ButtonStyle.Primary)
            .setDisabled(page === 0),
          new ButtonBuilder()
            .setCustomId("next")
            .setLabel("Next ▶")
            .setStyle(ButtonStyle.Primary)
            .setDisabled(page === totalPages - 1)
        ),
      ];
    };

    const message = (await interaction.reply({
      embeds: [generateEmbed(currentPage)],
      components: components(currentPage),
      flags: MessageFlags.Ephemeral,
      fetchReply: true,
    })) as Message;

    const collector = message.createMessageComponentCollector({
      componentType: ComponentType.Button,
      time: 60_000,
    });

    collector.on("collect", async (btnInteraction) => {
      if (btnInteraction.user.id !== interaction.user.id) {
        return btnInteraction.reply({
          content: "These buttons arent for you.",
          flags: MessageFlags.Ephemeral,
        });
      }

      if (btnInteraction.customId === "prev" && currentPage > 0) {
        currentPage--;
      } else if (
        btnInteraction.customId === "next" &&
        currentPage < totalPages - 1
      ) {
        currentPage++;
      }

      await btnInteraction.update({
        embeds: [generateEmbed(currentPage)],
        components: components(currentPage),
      });
    });

    collector.on("end", async () => {
      if (message.editable) {
        await message.edit({ components: [] });
      }
    });
  },
};

function capitalize(str: string): string {
  return str.charAt(0).toUpperCase() + str.slice(1);
}
