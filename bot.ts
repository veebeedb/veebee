import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { Manager, Player as ErelaPlayer } from "erela.js";
import {
  Client,
  Collection,
  Events,
  GatewayIntentBits,
  REST,
  Routes,
  ChatInputCommandInteraction,
  Message,
  MessageFlags,
  ActivityType,
  type TextBasedChannel,
} from "discord.js";
import { initializePremiumManager } from "./premium/premiumManager";
import {
  TextChannel,
  type RESTPostAPIChatInputApplicationCommandsJSONBody,
} from "discord.js";

export interface Command {
  data: {
    name: string;
    toJSON(): RESTPostAPIChatInputApplicationCommandsJSONBody;
  };
  execute: (interaction: ChatInputCommandInteraction) => Promise<void>;
  onMessage?: (message: Message) => Promise<void>;
  prefixCommand?: (message: Message, args: string[]) => Promise<void>;
}

export interface ExtendedClient extends Client {
  commands: Collection<string, Command>;
}

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

export const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.MessageContent,
    GatewayIntentBits.GuildVoiceStates,
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

const commandDirs = [
  { path: path.join(__dirname, "cogs"), category: (file: string) => path.relative(path.join(__dirname, "cogs"), file).split(path.sep)[0] },
  { path: path.join(__dirname, "premium", "commands"), category: () => "premium" }
];

const commands: RESTPostAPIChatInputApplicationCommandsJSONBody[] = [];

for (const dir of commandDirs) {
  const commandFiles = getAllCommandFiles(dir.path);
  
  for (const filePath of commandFiles) {
    try {
      const fileUrl = new URL(`file://${filePath}`).href;
      const imported = await import(fileUrl);
      if (imported?.default) {
        const command: Command = imported.default;
        if ("data" in command && "execute" in command) {
          const category = dir.category(filePath);
          (command as any).category = category;
          client.commands.set(command.data.name, command);
          commands.push(command.data.toJSON());
          console.log(`Loaded command: ${command.data.name} (${category})`);
        }
      }
    } catch (error) {
      console.error(`Error loading command from ${filePath}:`, error);
    }
  }
}

const rest = new REST({ version: "10" }).setToken(process.env.DISCORD_TOKEN!);

try {
  const premiumCommands = commands.filter(cmd => cmd.name.startsWith("premium"));
  const globalCommands = commands.filter(cmd => !cmd.name.startsWith("premium"));

  console.log("Started refreshing global commands.");
  await rest.put(
    Routes.applicationCommands(process.env.CLIENT_ID!),
    { body: globalCommands }
  );

  if (premiumCommands.length > 0) {
    console.log("Started refreshing premium guild commands.");
    await rest.put(
      Routes.applicationGuildCommands(process.env.CLIENT_ID!, "1293118933498462311"),
      { body: premiumCommands }
    );
  }

  console.log(`Successfully reloaded ${globalCommands.length} global commands and ${premiumCommands.length} premium guild commands.`);
} catch (error) {
  console.error("Failed to refresh application commands:", error);
}

const prefix = process.env.BOT_PREFIX ?? "";

function withSilentFlags(options: any) {
  if (!options) return { content: "\u200B", flags: MessageFlags.SuppressNotifications };
  if (typeof options === "string") return { content: options, flags: MessageFlags.SuppressNotifications };
  return { ...options, flags: MessageFlags.SuppressNotifications };
}

client.on(Events.InteractionCreate, async (interaction) => {
  if (!interaction.isChatInputCommand()) return;

  const command = client.commands.get(interaction.commandName);
  if (!command) return;

  try {
    await command.execute(interaction as ChatInputCommandInteraction);
  } catch (error) {
    console.error(`Error executing ${interaction.commandName}:`, error);
    if (interaction.deferred || interaction.replied) {
      await interaction.followUp(withSilentFlags({ content: "There was an error executing this command!" }));
    } else {
      await interaction.reply(withSilentFlags({ content: "There was an error executing this command!" }));
    }
  }
});

client.on(Events.MessageCreate, async (message: Message) => {
  if (message.author.bot) return;

  for (const command of client.commands.values()) {
    if (command.onMessage) {
      try {
        await command.onMessage({
          ...message,
          reply: (options: any) => message.reply(withSilentFlags(options))
        } as Message);
      } catch (err) {
        console.error("Error in onMessage:", err);
      }
    }
  }

  if (!prefix || !message.content.startsWith(prefix)) return;

  const args = message.content.slice(prefix.length).trim().split(/\s+/);
  const commandName = args.shift()?.toLowerCase();
  if (!commandName) return;

  const command = client.commands.get(commandName);
  if (!command || !command.prefixCommand) return;

  try {
    await command.prefixCommand(message, args);
  } catch (err) {
    console.error(`Error executing prefix command ${commandName}:`, err);
  }
});

import { syncPremiumRoles } from "./premium/premiumManager";

client.once(Events.ClientReady, (readyClient) => {
  console.log(`Logged in as ${readyClient.user.tag}`);
  initializePremiumManager(readyClient);

  syncPremiumRoles(readyClient);
  setInterval(() => syncPremiumRoles(readyClient), 5 * 60 * 1000);

  let toggle = 0;
  const presenceLines = [
    "{guildCount} servers 🌸",
    "{userCount} users 🌸",
    "Blossoming in pink petals 🌸",
    "Cherry blossom dreams 🌸",
    "Sakura vibes 💖",
    "Floating petals in the breeze 🌸",
    "Pink pastel happiness 💗",
    "Frieren: Beyond Journey's End 🧙🏻‍♀️",
  ];

  const updatePresence = () => {
    const guildCount = client.guilds.cache.size;
    const userCount = client.guilds.cache.reduce((acc, guild) => acc + guild.memberCount, 0);

    let statusName = presenceLines[toggle % presenceLines.length] ?? "Cherry blossom bot 🌸";
    statusName = statusName
      .replace("{guildCount}", guildCount.toString())
      .replace("{userCount}", userCount.toString());

    toggle++;
    client.user?.setPresence({
      activities: [{ name: statusName, type: ActivityType.Watching }],
      status: "dnd",
    });
  };

  updatePresence();
  setInterval(updatePresence, 30 * 1000);
});

client.login(process.env.DISCORD_TOKEN!).catch((error) =>
  console.error("Login failed:", error)
);
