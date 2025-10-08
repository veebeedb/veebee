import {
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  CommandInteraction,
  SlashCommandBuilder,
} from "discord.js";
import type { Command } from "../types/commands";
import { sql } from "./database";

export const command: Command = {
  data: new SlashCommandBuilder()
    .setName("purge-data")
    .setDescription("Request to delete all your data from the bot"),

  async execute(interaction: CommandInteraction) {
    const userId = interaction.user.id;

    const row = new ActionRowBuilder<ButtonBuilder>().addComponents(
      new ButtonBuilder()
        .setCustomId("confirm-purge")
        .setLabel("Yes, delete my data")
        .setStyle(ButtonStyle.Danger),
      new ButtonBuilder()
        .setCustomId("cancel-purge")
        .setLabel("No, keep my data")
        .setStyle(ButtonStyle.Secondary)
    );

    const response = await interaction.reply({
      content:
        "⚠️ **WARNING**: You are about to delete all your data from the bot.\n\n" +
        "**This includes:**\n" +
        "• All your form submissions\n" +
        "• Moderation history\n" +
        "• Premium status (if applicable)\n\n" +
        "**⛔ THIS ACTION CANNOT BE UNDONE! ⛔**\n" +
        "If you are a premium user, your premium status will be permanently removed.\n\n" +
        "Are you sure you want to continue?",
      components: [row],
      ephemeral: true,
    });

    try {
      const confirmation = await response.awaitMessageComponent({
        filter: (i: { user: { id: string } }) =>
          i.user.id === interaction.user.id,
        time: 30_000,
      });

      if (confirmation.customId === "confirm-purge") {
        sql`DELETE FROM forms_answers WHERE user_id = ${userId}`;
        sql`DELETE FROM forms_applications WHERE user_id = ${userId}`;
        sql`DELETE FROM warnings WHERE user_id = ${userId}`;
        sql`DELETE FROM timeouts WHERE user_id = ${userId}`;
        sql`DELETE FROM bans WHERE user_id = ${userId}`;
        sql`DELETE FROM premium_users WHERE user_id = ${userId}`;

        await confirmation.update({
          content: "✅ Your data has been deleted successfully.",
          components: [],
        });
      } else {
        await confirmation.update({
          content: "❌ Data deletion cancelled.",
          components: [],
        });
      }
    } catch (error) {
      await interaction.editReply({
        content:
          "❌ No response received within 30 seconds, operation cancelled.",
        components: [],
      });
    }
  },
};
