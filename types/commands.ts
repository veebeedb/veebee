import type {
    SlashCommandBuilder,
    SlashCommandSubcommandsOnlyBuilder,
    CommandInteraction
} from "discord.js";

export interface Command {
    data: SlashCommandBuilder | SlashCommandSubcommandsOnlyBuilder;
    execute: (interaction: CommandInteraction) => Promise<void>;
}
