import { ShardingManager } from "discord.js";
import { initializePremiumAPI } from "./premium/api/server";
import path from "path";
import process from "process";

const isRunningScript = process.argv.some(
  (arg) => typeof arg === "string" && /\.(ts|js)$/.test(arg)
);
const isCompiled = !isRunningScript;
const isShard = process.argv.includes("--worker");

if (isShard) {
  import("./bot")
    .then(() => {
      console.log("Shard process: bot module loaded.");
    })
    .catch((err) => {
      console.error("Failed to load bot module in shard process:", err);
      process.exit(1);
    });
} else {
  const shardEntry = isCompiled
    ? process.execPath
    : path.join(__dirname, "bot.ts");

  const manager = new ShardingManager(shardEntry, {
    token: process.env.DISCORD_TOKEN!,
    totalShards: "auto",
    shardArgs: ["--worker"],
  });

  manager.on("shardCreate", (shard) => {
    console.log(`Launched shard ${shard.id}`);
  });

  initializePremiumAPI(manager);

  manager
    .spawn({ delay: 5000 })
    .then(() => {
      console.log("All shards spawn initiated.");
    })
    .catch((err) => {
      console.error("Failed to spawn shards:", err);
    });
}
