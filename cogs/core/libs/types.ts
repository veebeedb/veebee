import type { ChatInputCommandInteraction, RESTPostAPIChatInputApplicationCommandsJSONBody } from "discord.js";

export interface Command {
    data: {
        name: string;
        toJSON(): RESTPostAPIChatInputApplicationCommandsJSONBody;
    };
    execute: (interaction: ChatInputCommandInteraction) => Promise<void>;
    category?: string;
}
