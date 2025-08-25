import {
    LavalinkManager,
    type Player,
    type Track,
    type TrackStartEvent,
    type LavalinkNode,
} from "lavalink-client";
import {
    Client,
    TextChannel,
    NewsChannel,
    ThreadChannel,
} from "discord.js";

export interface CustomPlayer extends Player {
    textChannelId: string | null;
}

let botClient: Client | null = null;

export const lavalink = new LavalinkManager({
    nodes: [
        {
            id: "main",
            host: process.env.LAVALINK_HOST ?? "127.0.0.1",
            port: Number(process.env.LAVALINK_PORT ?? 2333),
            secure: process.env.LAVALINK_SECURE?.toLowerCase() === "true" || false,
            authorization: process.env.LAVALINK_PASSWORD ?? "youshallnotpass",
            retryAmount: 5,
            retryDelay: 5000,
        },
    ],
    sendToShard: (guildId, payload) => {
        if (!botClient) return;
        const guild = botClient.guilds.cache.get(guildId);
        if (!guild) return;
        guild.shard.send(payload);
    },
    autoSkip: true,
    client: { id: "0", username: "unknown" },
});

declare module "discord.js" {
    interface Client {
        lavalink: typeof lavalink;
    }
}

export async function attachLavalink(client: Client) {
    botClient = client;
    client.lavalink = lavalink;

    console.log("[Lavalink] Attaching Lavalink to Discord client...");

    client.on("raw", (packet) => {
        const t = (packet as { t?: string }).t;
        if (!t) return;
        if (["VOICE_STATE_UPDATE", "VOICE_SERVER_UPDATE", "CHANNEL_DELETE"].includes(t)) {
            lavalink.sendRawData(packet as any);
            console.log("[Lavalink] Forwarded voice event:", t);
        }
    });

    lavalink.nodeManager.on("connect", (node: LavalinkNode) => {
        console.log(`[Lavalink] Node "${node.id}" connected!`);
    });

    lavalink.nodeManager.on(
        "disconnect",
        (node: LavalinkNode, reason: { code?: number; reason?: string }) => {
            console.warn(`[Lavalink] Node "${node.id}" disconnected!`, reason);
        }
    );

    lavalink.nodeManager.on("error", (node: LavalinkNode, error: Error) => {
        console.error(`[Lavalink] Node "${node.id}" error:`, error);
    });

    lavalink.nodeManager.on("reconnecting", (node: LavalinkNode) => {
        console.log(`[Lavalink] Node "${node.id}" reconnecting...`);
    });

    lavalink.on(
        "trackStart",
        (player: Player, track: Track | null, _payload: TrackStartEvent) => {
            if (!track || !botClient) return;

            console.log(`[Lavalink] Track started on guild ${player.guildId}: ${track.info.title}`);

            const customPlayer = player as CustomPlayer;
            const textId = customPlayer.textChannelId;
            if (!textId) return;

            const channel = botClient.channels.cache.get(textId);
            if (
                channel instanceof TextChannel ||
                channel instanceof NewsChannel ||
                channel instanceof ThreadChannel
            ) {
                channel.send(`🎶 Now playing: **${track.info.title}**`).catch(console.error);
            }
        }
    );

    if (client.user) {
        console.log("[Lavalink] Initializing with bot user:", client.user.username);
        lavalink.init({ id: client.user.id, username: client.user.username });
    } else {
        client.once("ready", () => {
            if (!client.user) return;
            console.log("[Lavalink] Initializing with bot user:", client.user.username);
            lavalink.init({ id: client.user.id, username: client.user.username });
        });
    }

    return lavalink;
}

export async function getAvailableNode(): Promise<LavalinkNode> {
    let nodes = lavalink.nodeManager.leastUsedNodes();

    if (!nodes || nodes.length === 0) {
        console.log("[Lavalink] No nodes available, waiting for a node to connect...");
        await new Promise<void>((resolve) => {
            lavalink.nodeManager.once("connect", () => resolve());
        });
        nodes = lavalink.nodeManager.leastUsedNodes();
    }

    if (!nodes || nodes.length === 0) {
        throw new Error("[Lavalink] No available nodes found!");
    }

    const node: LavalinkNode = nodes[0]!;
    console.log(`[Lavalink] Using node: ${node.id}`);
    return node;
}

export type Lavalink = typeof lavalink;
