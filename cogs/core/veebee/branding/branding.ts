import type { ColorResolvable } from "discord.js";

type LanyardResponse = {
  data: {
    discord_user: {
      id: string;
      username: string;
      avatar: string;
      discriminator: string;
      bot: boolean;
      global_name: string;
      avatar_decoration_data: any;
      display_name: string;
    };
    discord_status: string;
    spotify: null | any;
    listening_to_spotify: boolean;
    kv: Record<string, any>;
  };
};

/**
 * Fetches the bot's data from Lanyard API
 */
async function getLanyardData(userId: string): Promise<LanyardResponse> {
  const response = await fetch(
    `https://lanyard.valerie.lol/v1/users/${userId}`
  );
  if (!response.ok) throw new Error("Failed to fetch Lanyard data");
  return (await response.json()) as LanyardResponse;
}

const BOT_USER_ID = "1057488831105990746"; // Replace with your bot's user ID

export const BrandingConfig = {
  BOT_NAME: "Veebee",
  BOT_DESCRIPTION:
    "A custom made bot, initialized and being created with Bun, Node.js, Typescript, and Discord.js.",
  BOT_VERSION: "1.0.1",

  /**
   * Brand Colors (in hex)
   */
  colors: {
    PRIMARY: "#ffb7c5" as ColorResolvable,
    SUCCESS: "#43B581" as ColorResolvable,
    ERROR: "#F04747" as ColorResolvable,
    WARNING: "#FAA61A" as ColorResolvable,
    INFO: "#ff8ea4ff" as ColorResolvable,
    NEUTRAL: "#ffb7c5" as ColorResolvable,
  },

  emojis: {
    SUCCESS: "✅",
    ERROR: "❌",
    WARNING: "⚠️",
    INFO: "ℹ️",
    LOADING: "🔄",
  },

  /**
   * Default Embed Settings
   */
  embed: {
    footer: {
      text: "Powered by Veebee",
      iconURL: "",
    },
    author: {
      name: "Veebee",
      iconURL: "",
    },
  },

  /**
   * Support and Contact Information
   */
  support: {
    WEBSITE: "https://veebee.valerie.lol/",
    SUPPORT_SERVER: "https://discord.gg/SntBEwWgTJ",
    GITHUB: "https://github.com/tayrp/veebee",
  },

  /**
   * Asset URLs
   * Add any commonly used image URLs here
   */
  assets: {
    BOT_AVATAR: "",
    BOT_BANNER: "",
    /**
     * Gets the bot's current avatar URL from Lanyard
     */
    async getBotAvatar(): Promise<string> {
      try {
        const data = await getLanyardData(BOT_USER_ID);
        return `https://cdn.discordapp.com/avatars/${BOT_USER_ID}/${data.data.discord_user.avatar}`;
      } catch (error) {
        console.error("Failed to fetch bot avatar:", error);
        return this.BOT_AVATAR || ""; // Fallback to static URL
      }
    },
    /**
     * Gets the bot's current status from Lanyard
     */
    async getBotStatus(): Promise<string> {
      try {
        const data = await getLanyardData(BOT_USER_ID);
        return data.data.discord_status;
      } catch (error) {
        console.error("Failed to fetch bot status:", error);
        return "online";
      }
    },
  },

  /**
   * Utility Functions
   */
  getRandomColor(): ColorResolvable {
    const colorArray = Object.values(this.colors);
    return (
      colorArray[Math.floor(Math.random() * colorArray.length)] ||
      this.colors.PRIMARY
    );
  },

  /**
   * Get an embed color based on the type of message
   */
  getColorByType(
    type: "SUCCESS" | "ERROR" | "WARNING" | "INFO" | "NEUTRAL"
  ): ColorResolvable {
    return this.colors[type];
  },
} as const;

export const {
  BOT_NAME,
  BOT_DESCRIPTION,
  BOT_VERSION,
  colors,
  emojis,
  embed,
  support,
  assets,
} = BrandingConfig;
