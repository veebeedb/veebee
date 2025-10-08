import { Client, TextChannel, EmbedBuilder, Colors } from "discord.js";
import { getAllStatusConfigs, updateLastChecked } from "./database";
import { UptimeKuma } from "./uptimekuma";
import { HetrixTools } from "./hetrix";
import { Instatus } from "./instatus";
import { getServiceInstance } from "./status";

export class StatusManager {
  private client: Client;
  private updateIntervals: Map<string, NodeJS.Timeout> = new Map();

  constructor(client: Client) {
    this.client = client;
    this.init().catch(console.error);
  }

  private async init() {
    if (!this.client.isReady()) {
      await new Promise<void>((resolve) => {
        this.client.once("ready", () => resolve());
      });
    }

    const configs = await getAllStatusConfigs("");
    for (const config of configs) {
      if (config.enabled && config.channelId) {
        this.startMonitoring(config);
      }
    }
  }

  private startMonitoring(config: any) {
    const key = `${config.guildId}-${config.serviceType}`;

    if (this.updateIntervals.has(key)) {
      clearInterval(this.updateIntervals.get(key)!);
    }

    const interval = setInterval(async () => {
      try {
        const service = await getServiceInstance(config);
        const status = await service.getStatus();
        await updateLastChecked(config.guildId, config.serviceType);

        if (config.channelId) {
          const channel = await this.client.channels.fetch(config.channelId);
          if (channel && channel instanceof TextChannel) {
            const embed = new EmbedBuilder()
              .setTitle(`${capitalize(config.serviceType)} Status Update`)
              .setColor(status.online ? Colors.Green : Colors.Red)
              .addFields(
                {
                  name: "Status",
                  value: status.online ? "🟢 Online" : "🔴 Offline",
                  inline: true,
                },
                { name: "Uptime", value: status.uptime, inline: true },
                { name: "Latency", value: status.latency, inline: true }
              )
              .setTimestamp();

            if (status.message) {
              embed.addFields({ name: "Message", value: status.message });
            }

            await channel.send({ embeds: [embed] });
          }
        }
      } catch (error) {
        console.error(
          `Error updating status for ${config.serviceType}:`,
          error
        );
      }
    }, config.updateInterval * 1000);

    this.updateIntervals.set(key, interval);
  }

  public stopMonitoring(guildId: string, serviceType: string) {
    const key = `${guildId}-${serviceType}`;
    if (this.updateIntervals.has(key)) {
      clearInterval(this.updateIntervals.get(key)!);
      this.updateIntervals.delete(key);
    }
  }

  public stopAll() {
    for (const interval of this.updateIntervals.values()) {
      clearInterval(interval);
    }
    this.updateIntervals.clear();
  }
}

function capitalize(str: string): string {
  return str.charAt(0).toUpperCase() + str.slice(1);
}
