import { Client } from "discord.js";
import { Lavalink } from "./cogs/audio/audioManager";

declare module "discord.js" {
  interface Client {
    lavalink: Lavalink;
  }
}
