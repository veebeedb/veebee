import { ShardingManager } from "discord.js";

const manager = new ShardingManager("./bot.ts", {
    token: process.env.DISCORD_TOKEN!,
    totalShards: "auto",
});

manager.on("shardCreate", (shard) => {
    console.log(`Launched shard ${shard.id}`);
});

manager.spawn();
