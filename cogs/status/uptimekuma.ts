import axios from "axios";

interface ServiceStatus {
  online: boolean;
  uptime: string;
  latency: string;
  lastChecked: Date;
  message?: string;
}

export class UptimeKuma {
  private url: string;
  private statusCache: ServiceStatus | null = null;
  private lastCheck: number = 0;
  private cacheTimeout: number = 60000;

  constructor(url: string) {
    this.url = url;
  }

  async getStatus(): Promise<ServiceStatus> {
    if (this.statusCache && Date.now() - this.lastCheck < this.cacheTimeout) {
      return this.statusCache;
    }

    try {
      const response = await axios.get(`${this.url}/api/status`);
      const data = response.data;

      this.statusCache = {
        online: data.status === "up",
        uptime: `${data.uptime}%`,
        latency: `${data.ping}ms`,
        lastChecked: new Date(),
        message: data.message,
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
