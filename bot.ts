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
  ActivityType,
} from "discord.js";
import type { Command } from "./types/commands";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

interface ExtendedClient extends Client {
  commands: Collection<string, Command>;
}

const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.MessageContent,
  ],
}) as ExtendedClient;
client.commands = new Collection();

const foldersPath = path.join(__dirname, "commands");
const commandFolders = fs.readdirSync(foldersPath);

const commands = [];

for (const folder of commandFolders) {
  const commandsPath = path.join(foldersPath, folder);
  const commandFiles = fs
    .readdirSync(commandsPath)
    .filter((file) => file.endsWith(".ts") || file.endsWith(".js"));

  for (const file of commandFiles) {
    const filePath = path.join(commandsPath, file);
    const imported = await import(filePath);
    const command = imported.default;

    if ("data" in command && "execute" in command) {
      client.commands.set(command.data.name, command);
      commands.push(command.data.toJSON());
    }
  }
}

const rest = new REST({ version: "10" }).setToken(process.env.DISCORD_TOKEN!);

try {
  console.log("Started refreshing application (/) commands.");

  await rest.put(
    Routes.applicationCommands(process.env.CLIENT_ID!),
    { body: commands }
  );

  console.log("Successfully reloaded application (/) commands.");
} catch (error) {
  console.error(error);
}

client.on(Events.InteractionCreate, async (interaction) => {
  if (!interaction.isChatInputCommand()) return;

  const command = client.commands.get(interaction.commandName);
  if (!command) return;

  try {
    await command.execute(interaction);
  } catch {
    if (interaction.replied || interaction.deferred) {
      await interaction.followUp({ content: 'There was an error executing this command!', ephemeral: true });
    } else {
      await interaction.reply({ content: 'There was an error executing this command!', ephemeral: true });
    }
  }
});

client.once(Events.ClientReady, () => {
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

client.login(process.env.DISCORD_TOKEN!);
