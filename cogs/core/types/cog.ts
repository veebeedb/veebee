import { Client } from "discord.js";

export interface CogInfo {
    name: string;
    description: string;
    version: string;
    author: string;
    dependencies?: string[];
    files: string[];
    commands?: string[];
    events?: string[];
    required?: boolean;
    enabled?: boolean;
}

export interface CogModule {
    info: CogInfo;
    setup: (client: Client) => Promise<void>;
    teardown?: (client: Client) => Promise<void>;
}

export interface CogState {
    cogName: string;
    enabled: boolean;
    loadedAt: number;
    lastDisabled?: number;
}

export interface CogError {
    cogName: string;
    error: Error;
    timestamp: number;
}

export type CogLoadResult = {
    success: true;
    cog: CogModule;
} | {
    success: false;
    error: Error;
}