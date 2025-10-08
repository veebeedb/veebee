import { readFile, readdir, stat } from "fs/promises";
import { join } from "path";
import type { CogInfo } from "../types/cog";
import type { Client } from "discord.js";

export class CogLoader {
  private client: Client;
  private cogsPath: string;

  constructor(client: Client, cogsPath: string) {
    this.client = client;
    this.cogsPath = cogsPath;
  }

  private async validateCogInfo(
    info: CogInfo,
    cogPath: string
  ): Promise<string[]> {
    const errors: string[] = [];

    if (!info.name) errors.push("Missing required field: name");
    if (!info.version) errors.push("Missing required field: version");
    if (!info.author) errors.push("Missing required field: author");
    if (!info.description) errors.push("Missing required field: description");
    if (!info.files || !Array.isArray(info.files) || info.files.length === 0) {
      errors.push("Missing or invalid files array");
    }

    if (info.files) {
      for (const file of info.files) {
        try {
          const fileStat = await stat(join(cogPath, file));
          if (!fileStat.isFile()) {
            errors.push(`Invalid file path: ${file} is not a file`);
          }
        } catch (error) {
          errors.push(`File not found: ${file}`);
        }
      }
    }

    if (info.version && !/^\d+\.\d+\.\d+$/.test(info.version)) {
      errors.push("Invalid version format. Must be semver (e.g., 1.0.0)");
    }

    if (info.dependencies && !Array.isArray(info.dependencies)) {
      errors.push("Dependencies must be an array");
    }

    return errors;
  }

  public async loadCogInfo(
    cogPath: string
  ): Promise<{ info: CogInfo | null; errors: string[] }> {
    try {
      const infoPath = join(cogPath, "_info.json");
      const infoContent = await readFile(infoPath, "utf-8");
      const info = JSON.parse(infoContent) as CogInfo;

      const validationErrors = await this.validateCogInfo(info, cogPath);
      if (validationErrors.length > 0) {
        return { info: null, errors: validationErrors };
      }

      return { info, errors: [] };
    } catch (error: any) {
      return {
        info: null,
        errors: [
          `Failed to load _info.json: ${error?.message || String(error)}`,
        ],
      };
    }
  }

  public async scanForCogs(): Promise<
    Map<string, { path: string; info: CogInfo | null; errors: string[] }>
  > {
    const results = new Map<
      string,
      { path: string; info: CogInfo | null; errors: string[] }
    >();

    try {
      const entries = await readdir(this.cogsPath, { withFileTypes: true });

      for (const entry of entries) {
        if (!entry.isDirectory()) continue;

        const cogPath = join(this.cogsPath, entry.name);
        const { info, errors } = await this.loadCogInfo(cogPath);

        results.set(entry.name, {
          path: cogPath,
          info,
          errors,
        });
      }
    } catch (error: any) {
      console.error(
        `Error scanning cogs directory: ${error?.message || String(error)}`
      );
    }

    return results;
  }

  public async validateDependencies(
    cogs: Map<string, { info: CogInfo | null }>
  ): Promise<Map<string, string[]>> {
    const dependencyErrors = new Map<string, string[]>();

    for (const [cogName, { info }] of cogs) {
      const errors: string[] = [];

      if (info?.dependencies) {
        for (const dep of info.dependencies) {
          const dependency = cogs.get(dep);
          if (!dependency) {
            errors.push(`Missing dependency: ${dep}`);
          } else if (!dependency.info) {
            errors.push(
              `Invalid dependency: ${dep} is not properly configured`
            );
          }
        }
      }

      if (errors.length > 0) {
        dependencyErrors.set(cogName, errors);
      }
    }

    return dependencyErrors;
  }
}
