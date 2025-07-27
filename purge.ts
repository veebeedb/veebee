import { REST, Routes } from 'discord.js';

const TOKEN = process.env.DISCORD_TOKEN!;
const CLIENT_ID = process.env.CLIENT_ID!;

if (!TOKEN || !CLIENT_ID) {
  console.error('Missing DISCORD_TOKEN or CLIENT_ID environment variable!');
  process.exit(1);
}

const rest = new REST({ version: '10' }).setToken(TOKEN);

function wait(ms: number) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

async function purgeAllGlobalCommands() {
  try {
    console.log('Fetching all global commands...');
    const commands = await rest.get(
      Routes.applicationCommands(CLIENT_ID)
    ) as Array<{ id: string; name: string }>;

    if (commands.length === 0) {
      console.log('No global commands to delete.');
      return;
    }

    console.log(`Found ${commands.length} commands to delete.`);

    for (const command of commands) {
      try {
        console.log(`Deleting command: ${command.name} (ID: ${command.id})...`);
        await rest.delete(Routes.applicationCommand(CLIENT_ID, command.id));
        console.log(`Deleted command: ${command.name}`);

        // Wait 1.5 seconds before next delete to respect rate limits
        await wait(1500);
      } catch (deleteError) {
        console.error(`Failed to delete command ${command.name}:`, deleteError);

        // Wait before continuing in case rate limited
        await wait(3000);
      }
    }

    console.log('Finished deleting all global commands.');
  } catch (error) {
    console.error('Failed to fetch or delete commands:', error);
  }
}

purgeAllGlobalCommands();
