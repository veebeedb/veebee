import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import {
  Client,
  Collection,
  Events,
  GatewayIntentBits,
  REST,
  Routes,
  MessageFlags,
  ActivityType,
} from "discord.js";

import type {
  ChatInputCommandInteraction,
  RESTPostAPIChatInputApplicationCommandsJSONBody,
} from "discord.js";

export interface Command {
  data: {
    name: string;
    toJSON(): RESTPostAPIChatInputApplicationCommandsJSONBody;
  };
  execute: (interaction: ChatInputCommandInteraction) => Promise<void>;
}

export interface ExtendedClient extends Client {
  commands: Collection<string, Command>;
}


const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.MessageContent,
  ],
}) as ExtendedClient;

client.commands = new Collection<string, Command>();

function getAllCommandFiles(dir: string): string[] {
  const files: string[] = [];

  for (const entry of fs.readdirSync(dir)) {
    const fullPath = path.join(dir, entry);
    const stat = fs.statSync(fullPath);

    if (stat.isDirectory()) {
      files.push(...getAllCommandFiles(fullPath));
    } else if (
      (fullPath.endsWith(".ts") || fullPath.endsWith(".js")) &&
      !path.basename(fullPath).startsWith("_")
    ) {
      files.push(fullPath);
    }
  }

  return files;
}

const cogsPath = path.join(__dirname, "cogs");
const commandFiles = getAllCommandFiles(cogsPath);
const commands: RESTPostAPIChatInputApplicationCommandsJSONBody[] = [];

for (const filePath of commandFiles) {
  try {
    const fileUrl = new URL(`file://${filePath}`).href;
    const imported = await import(fileUrl);

    if (imported?.default) {
      const command: Command = imported.default;
      if ("data" in command && "execute" in command) {
        const relativePath = path.relative(cogsPath, filePath);
        const category = relativePath.split(path.sep)[0];
        (command as any).category = category;

        client.commands.set(command.data.name, command);
        commands.push(command.data.toJSON());
      }
    }
  } catch (error) {
    console.error(`Error loading command from ${filePath}:`, error);
  }
}


const rest = new REST({ version: "10" }).setToken(process.env.DISCORD_TOKEN!);

try {
  console.log("Started refreshing application (/) commands.");

  await rest.put(
    Routes.applicationCommands(process.env.CLIENT_ID!),
    { body: commands }
  );

  console.log(`Successfully reloaded ${commands.length} application (/) commands.`);
} catch (error) {
  console.error("Failed to refresh application commands:", error);
}

client.on(Events.InteractionCreate, async (interaction) => {
  if (!interaction.isChatInputCommand()) return;

  const command = client.commands.get(interaction.commandName);
  if (!command) return;

  try {
    await command.execute(interaction);
  } catch (error) {
    console.error(`Error executing ${interaction.commandName}:`, error);
    const content = 'There was an error executing this command!';

    if (interaction.replied || interaction.deferred) {
      await interaction.followUp({ content, flags: MessageFlags.Ephemeral });
    } else {
      await interaction.reply({ content, flags: MessageFlags.Ephemeral });
    }
  }
});

client.once(Events.ClientReady, (readyClient) => {
  console.log(`Logged in as ${readyClient.user.tag}`);

  let toggle = true;
  const updatePresence = () => {
    const guildCount = client.guilds.cache.size;
    const userCount = client.guilds.cache.reduce(
      (acc, guild) => acc + guild.memberCount,
      0
    );

    const statusName = toggle ? `${guildCount} servers` : `${userCount} users`;
    toggle = !toggle;

    client.user?.setPresence({
      activities: [{ name: statusName, type: ActivityType.Watching }],
      status: "dnd",
    });
  };

  updatePresence();
  setInterval(updatePresence, 30 * 1000);
});

client.login(process.env.DISCORD_TOKEN!)
  .catch(error => console.error("Login failed:", error));
