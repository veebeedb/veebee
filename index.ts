const { ShardingManager } = require('discord.js');

const manager = new ShardingManager('./bot.ts');

manager.on('shardCreate', (shard: { id: any; }) => console.log(`Launched shard ${shard.id}`));

manager.spawn();
