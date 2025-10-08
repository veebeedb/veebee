import { Client } from "discord.js";
import { readFile, readdir } from "fs/promises";
import { join, dirname } from "path";
import type {
  CogInfo,
  CogModule,
  CogState,
  CogError,
  CogLoadResult,
} from "../types/cog";
import { Database } from "bun:sqlite";

export class CogSystem {
  private client: Client;
  private db: Database;
  private loadedCogs: Map<string, CogModule>;
  private cogStates: Map<string, CogState>;
  private cogErrors: CogError[];
  private cogsPath: string;

  constructor(client: Client, cogsPath: string) {
    this.client = client;
    this.loadedCogs = new Map();
    this.cogStates = new Map();
    this.cogErrors = [];
    this.cogsPath = cogsPath;

    this.db = new Database("data/cogs.sqlite");
    this.initDatabase();
  }

  private initDatabase(): void {
    this.db.exec(`
            CREATE TABLE IF NOT EXISTS cog_states (
                cogName TEXT PRIMARY KEY,
                enabled INTEGER NOT NULL DEFAULT 0,
                loadedAt INTEGER,
                lastDisabled INTEGER
            )
        `);
  }

  private async loadCogInfo(cogPath: string): Promise<CogInfo | null> {
    try {
      const infoPath = join(cogPath, "_info.json");
      const infoContent = await readFile(infoPath, "utf-8");
      return JSON.parse(infoContent) as CogInfo;
    } catch (error: any) {
      console.error(
        `Failed to load cog info from ${cogPath}: ${
          error?.message || "Unknown error"
        }`
      );
      return null;
    }
  }

  public async loadCog(cogName: string): Promise<CogLoadResult> {
    try {
      const cogPath = join(this.cogsPath, cogName);
      const cogInfo = await this.loadCogInfo(cogPath);

      if (!cogInfo) {
        throw new Error(`No _info.json found for cog ${cogName}`);
      }

      if (
        !cogInfo.name ||
        !cogInfo.version ||
        !cogInfo.author ||
        !cogInfo.files
      ) {
        throw new Error(`Invalid _info.json structure for cog ${cogName}`);
      }

      if (cogInfo.dependencies) {
        for (const dep of cogInfo.dependencies) {
          if (!this.loadedCogs.has(dep)) {
            throw new Error(`Missing dependency: ${dep}`);
          }
        }
      }

      const mainFile = cogInfo.files[0];
      if (!mainFile) {
        throw new Error(`No main file specified for cog ${cogName}`);
      }
      const cogModule = (await import(join(cogPath, mainFile))) as CogModule;
      cogModule.info = cogInfo;

      const cogState: CogState = {
        cogName,
        enabled: cogInfo.enabled ?? false,
        loadedAt: Date.now(),
      };

      this.loadedCogs.set(cogName, cogModule);
      this.cogStates.set(cogName, cogState);

      this.db.query(
        "INSERT OR REPLACE INTO cog_states (cogName, enabled, loadedAt) VALUES (?, ?, ?)",
        [cogName, cogState.enabled ? 1 : 0, cogState.loadedAt]
      );

      if (cogState.enabled) {
        await cogModule.setup(this.client);
      }

      return { success: true, cog: cogModule };
    } catch (error) {
      const cogError: CogError = {
        cogName,
        error: error instanceof Error ? error : new Error(String(error)),
        timestamp: Date.now(),
      };
      this.cogErrors.push(cogError);
      return { success: false, error: cogError.error };
    }
  }

  public async enableCog(cogName: string): Promise<boolean> {
    const cog = this.loadedCogs.get(cogName);
    if (!cog) {
      throw new Error(`Cog ${cogName} is not loaded`);
    }

    const state = this.cogStates.get(cogName);
    if (state?.enabled) {
      return true;
    }

    try {
      await cog.setup(this.client);

      const newState: CogState = {
        ...state!,
        enabled: true,
        loadedAt: Date.now(),
      };

      this.cogStates.set(cogName, newState);
      this.db
        .prepare(
          "UPDATE cog_states SET enabled = 1, loadedAt = ? WHERE cogName = ?"
        )
        .run(newState.loadedAt, cogName);

      return true;
    } catch (error) {
      const cogError: CogError = {
        cogName,
        error,
        timestamp: Date.now(),
      };
      this.cogErrors.push(cogError);
      return false;
    }
  }

  public async disableCog(cogName: string): Promise<boolean> {
    const cog = this.loadedCogs.get(cogName);
    if (!cog) {
      throw new Error(`Cog ${cogName} is not loaded`);
    }

    if (cog.info.required) {
      throw new Error(`Cannot disable required cog ${cogName}`);
    }

    const state = this.cogStates.get(cogName);
    if (!state?.enabled) {
      return true;
    }

    try {
      if (cog.teardown) {
        await cog.teardown(this.client);
      }

      const newState: CogState = {
        ...state,
        enabled: false,
        lastDisabled: Date.now(),
      };

      this.cogStates.set(cogName, newState);
      this.db.run(
        "UPDATE cog_states SET enabled = 0, lastDisabled = ? WHERE cogName = ?",
        [newState.lastDisabled ?? Date.now(), cogName]
      );

      return true;
    } catch (error) {
      const cogError: CogError = {
        cogName,
        error: error instanceof Error ? error : new Error(String(error)),
        timestamp: Date.now(),
      };
      this.cogErrors.push(cogError);
      return false;
    }
  }

  public async loadAllCogs(): Promise<Map<string, CogLoadResult>> {
    const results = new Map<string, CogLoadResult>();
    const cogDirs = await readdir(this.cogsPath, { withFileTypes: true });

    for (const dir of cogDirs) {
      if (dir.isDirectory()) {
        const result = await this.loadCog(dir.name);
        results.set(dir.name, result);
      }
    }

    return results;
  }

  public getCogInfo(cogName: string): CogInfo | null {
    return this.loadedCogs.get(cogName)?.info ?? null;
  }

  public getCogState(cogName: string): CogState | null {
    return this.cogStates.get(cogName) ?? null;
  }

  public getLoadedCogs(): Map<string, CogModule> {
    return new Map(this.loadedCogs);
  }

  public getCogErrors(): CogError[] {
    return [...this.cogErrors];
  }

  public clearCogErrors(): void {
    this.cogErrors = [];
  }

  public async reloadCog(cogName: string): Promise<CogLoadResult> {
    const cog = this.loadedCogs.get(cogName);
    if (cog?.info.enabled) {
      await this.disableCog(cogName);
    }

    this.loadedCogs.delete(cogName);
    this.cogStates.delete(cogName);

    return this.loadCog(cogName);
  }
}
