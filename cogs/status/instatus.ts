import axios from "axios";

interface ServiceStatus {
  online: boolean;
  uptime: string;
  latency: string;
  lastChecked: Date;
  message?: string;
}

export class Instatus {
  private pageId: string;
  private apiKey: string;
  private statusCache: ServiceStatus | null = null;
  private lastCheck: number = 0;
  private cacheTimeout: number = 60000;

  constructor(pageId: string, apiKey: string) {
    this.pageId = pageId;
    this.apiKey = apiKey;
  }

  async getStatus(): Promise<ServiceStatus> {
    if (this.statusCache && Date.now() - this.lastCheck < this.cacheTimeout) {
      return this.statusCache;
    }

    try {
      const response = await axios.get(
        `https://api.instatus.com/v1/${this.pageId}/status`,
        {
          headers: {
            Authorization: `Bearer ${this.apiKey}`,
          },
        }
      );
      const data = response.data;

      this.statusCache = {
        online: data.page.status === "UP",
        uptime: `${data.page.uptime}%`,
        latency: "N/A",
        lastChecked: new Date(),
        message: data.page.status_description,
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
