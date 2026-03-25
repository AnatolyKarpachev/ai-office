/**
 * Config Persistence — Read/write ~/.pixel-agents/config.json
 *
 * Stores user preferences that should persist across server restarts:
 * - soundEnabled: boolean (notification sound toggle)
 * - externalAssetDirectories: string[] (additional furniture asset paths)
 */

import { existsSync, readFileSync, writeFileSync, mkdirSync, renameSync } from "fs";
import { homedir } from "os";
import { join, dirname } from "path";

const CONFIG_DIR = join(homedir(), ".pixel-agents");
const CONFIG_FILE = join(CONFIG_DIR, "config.json");

export interface PixelAgentsConfig {
  soundEnabled: boolean;
  externalAssetDirectories: string[];
}

const DEFAULT_CONFIG: PixelAgentsConfig = {
  soundEnabled: true,
  externalAssetDirectories: [],
};

let cachedConfig: PixelAgentsConfig | null = null;

export function loadConfig(): PixelAgentsConfig {
  try {
    if (!existsSync(CONFIG_FILE)) {
      cachedConfig = { ...DEFAULT_CONFIG };
      return cachedConfig;
    }
    const raw = readFileSync(CONFIG_FILE, "utf-8");
    const parsed = JSON.parse(raw) as Partial<PixelAgentsConfig>;
    cachedConfig = {
      soundEnabled: typeof parsed.soundEnabled === "boolean" ? parsed.soundEnabled : DEFAULT_CONFIG.soundEnabled,
      externalAssetDirectories: Array.isArray(parsed.externalAssetDirectories)
        ? parsed.externalAssetDirectories.filter((d): d is string => typeof d === "string")
        : [],
    };
    return cachedConfig;
  } catch (err) {
    console.error("[ConfigPersistence] Failed to read config:", err);
    cachedConfig = { ...DEFAULT_CONFIG };
    return cachedConfig;
  }
}

export function saveConfig(config: PixelAgentsConfig): void {
  try {
    if (!existsSync(CONFIG_DIR)) {
      mkdirSync(CONFIG_DIR, { recursive: true });
    }
    const json = JSON.stringify(config, null, 2);
    const tmpPath = CONFIG_FILE + ".tmp";
    writeFileSync(tmpPath, json, "utf-8");
    renameSync(tmpPath, CONFIG_FILE);
    cachedConfig = { ...config };
  } catch (err) {
    console.error("[ConfigPersistence] Failed to write config:", err);
  }
}

export function getConfig(): PixelAgentsConfig {
  if (!cachedConfig) {
    return loadConfig();
  }
  return cachedConfig;
}
