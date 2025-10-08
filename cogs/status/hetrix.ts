import axios from "axios";

interface ServiceStatus {
  online: boolean;
  uptime: string;
  latency: string;
  lastChecked: Date;
  message?: string;
}

export class HetrixTools {
  private apiKey: string;
  private url: string;
  private statusCache: ServiceStatus | null = null;
  private lastCheck: number = 0;
  private cacheTimeout: number = 60000;

  constructor(apiKey: string, url: string) {
    this.apiKey = apiKey;
    this.url = url;
  }

  async getStatus(): Promise<ServiceStatus> {
    if (this.statusCache && Date.now() - this.lastCheck < this.cacheTimeout) {
      return this.statusCache;
    }

    try {
      const response = await axios.get(
        `https://api.hetrixtools.com/v2/${this.apiKey}/uptime/report/${this.url}/`
      );
      const data = response.data;

      this.statusCache = {
        online: data.status === "UP",
        uptime: `${data.uptime_stats.uptime_24h}%`,
        latency: `${data.response_time}ms`,
        lastChecked: new Date(),
        message: data.status_message,
      };

      this.lastCheck = Date.now();
      return this.statusCache;
    } catch (error) {
      return {
        online: false,
        uptime: "N/A",
        latency: "N/A",
        lastChecked: new Date(),
        message: error instanceof Error ? error.message : "Unknown error",
      };
    }
  }
}
