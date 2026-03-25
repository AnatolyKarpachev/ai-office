import express from "express";
import { createServer } from "http";
import { WebSocketServer, WebSocket } from "ws";
import { join, dirname } from "path";
import { homedir } from "os";
import { fileURLToPath } from "url";
import { existsSync, readFileSync, writeFileSync, mkdirSync, watch, statSync, renameSync } from "fs";
import type { FSWatcher } from "fs";
import { spawn, execSync, type ChildProcess } from "child_process";
import crypto from "crypto";
import { JsonlWatcher, type WatchedFile } from "./watcher.js";
import { processTranscriptLine } from "./parser.js";
import {
  loadCharacterSprites,
  loadWallTiles,
  loadFloorTiles,
  loadFurnitureAssets,
  loadDefaultLayout,
} from "./assetLoader.js";
import type { LoadedFurnitureAssets } from "./assetLoader.js";
import { loadConfig, saveConfig, getConfig } from "./configPersistence.js";
import type { TrackedAgent, ServerMessage } from "./types.js";
import { getRoleColors, resolveDisplayRole } from "./roleDetector.js";

const __dirname = dirname(fileURLToPath(import.meta.url));
const PORT = parseInt(process.env.PORT || "9876", 10);
const IDLE_SHUTDOWN_MS = 600_000; // 10 minutes

// Context window limits by model for health bar calculation
const MODEL_CONTEXT_LIMITS: Record<string, number> = {
  "claude-opus-4-6": 200000,
  "claude-sonnet-4-6": 200000,
  "claude-haiku-4-5": 200000,
  "default": 200000,
};

function buildAgentStatsMessage(agent: TrackedAgent): ServerMessage {
  const totalTokens = agent.totalInputTokens + agent.totalOutputTokens;
  const cacheHitRate = totalTokens > 0
    ? Math.round((agent.totalCacheRead / Math.max(agent.totalInputTokens, 1)) * 100)
    : 0;
  return {
    type: "agentStats",
    id: agent.id,
    model: agent.model,
    totalInputTokens: agent.totalInputTokens,
    totalOutputTokens: agent.totalOutputTokens,
    totalCacheRead: agent.totalCacheRead,
    totalCacheCreation: agent.totalCacheCreation,
    turnCount: agent.turnCount,
    totalDurationMs: agent.totalDurationMs,
    cacheHitRate,
  };
}

// ── Role helpers ─────────────────────────────────────────────────────────
// Role = agentSetting from Claude Code JSONL, enhanced with description fallback
function buildAgentRoleMessage(agent: TrackedAgent): ServerMessage {
  // Check for persistent role override first
  const override = roleOverrides[agent.id];
  if (override) {
    return {
      type: "agentRole",
      id: agent.id,
      role: override.role,
      autoDetected: false,
      colors: override.colors,
    };
  }
  const isSubagent = !!agent.parentSessionId;
  const { displayRole, colors } = resolveDisplayRole(agent.agentSetting, agent.agentDescription, isSubagent);
  return {
    type: "agentRole",
    id: agent.id,
    role: displayRole || undefined,  // empty string → undefined → badge hidden
    autoDetected: true,
    colors,
  };
}

function syncRoleAndBroadcast(agent: TrackedAgent): void {
  // Don't override manually set roles
  if (roleOverrides[agent.id]) return;
  const isSubagent = !!agent.parentSessionId;
  const { displayRole } = resolveDisplayRole(agent.agentSetting, agent.agentDescription, isSubagent);
  if (displayRole !== agent.role) {
    agent.role = displayRole;
    broadcast(buildAgentRoleMessage(agent));
  }
}

function onAgentStatsUpdate(agent: TrackedAgent): void {
  broadcast(buildAgentStatsMessage(agent));
  // Recalculate role when stats change (model detected, tools used, etc.)
  syncRoleAndBroadcast(agent);
}

// State
const agents = new Map<string, TrackedAgent>(); // sessionId -> agent
let nextAgentId = 1;
const clients = new Set<WebSocket>();
const testAgentIds = new Set<number>();
let lastActivityTime = Date.now();
const spawnedClaudes = new Set<ChildProcess>();

// ── Persistent role overrides ─────────────────────────────────────────────
const roleOverridesPath = join(homedir(), ".pixel-agents", "role-overrides.json");

function loadRoleOverrides(): Record<number, { role: string; colors: { primary: string; badge: string } }> {
  try {
    if (existsSync(roleOverridesPath)) {
      return JSON.parse(readFileSync(roleOverridesPath, "utf-8"));
    }
  } catch { /* ignore */ }
  return {};
}

function saveRoleOverrides(overrides: Record<number, { role: string; colors: { primary: string; badge: string } }>): void {
  try {
    mkdirSync(dirname(roleOverridesPath), { recursive: true });
    writeFileSync(roleOverridesPath, JSON.stringify(overrides, null, 2));
  } catch (err) {
    console.error(`[Server] Failed to save role overrides: ${err instanceof Error ? err.message : err}`);
  }
}

const roleOverrides = loadRoleOverrides();

/** Spawn a detached Claude Code process. Returns immediately. */
function launchClaude(bypassPermissions: boolean): void {
  const sessionId = crypto.randomUUID();
  const args = ["--session-id", sessionId];
  if (bypassPermissions) {
    args.push("--dangerously-skip-permissions");
  }
  console.log(`[Server] Launching claude ${args.join(" ")}`);
  const child = spawn("claude", args, {
    detached: true,
    stdio: "ignore",
  });
  spawnedClaudes.add(child);
  child.on("exit", () => {
    spawnedClaudes.delete(child);
  });
  child.unref();
}

/** Kill all spawned Claude processes */
function cleanupSpawnedClaudes(): void {
  for (const child of spawnedClaudes) {
    try {
      // Kill the process group (negative pid) since detached creates a new group
      if (child.pid) {
        process.kill(-child.pid, "SIGTERM");
      }
    } catch {
      /* already exited */
    }
  }
  spawnedClaudes.clear();
}

// Load assets at startup
// In dev mode (tsx), __dirname is server/ so assets are at ../webview-ui/public/assets/
// In production (esbuild), __dirname is dist/ so assets are at ./public/assets/
const devAssetsRoot = join(__dirname, "..", "webview-ui", "public", "assets");
const prodAssetsRoot = join(__dirname, "public", "assets");
const assetsRoot = existsSync(devAssetsRoot) ? devAssetsRoot : prodAssetsRoot;

console.log(`[Server] Loading assets from: ${assetsRoot}`);

const characterSprites = loadCharacterSprites(assetsRoot);
const wallTiles = loadWallTiles(assetsRoot);
const floorTiles = loadFloorTiles(assetsRoot);

// Load config from ~/.pixel-agents/config.json
const config = loadConfig();
console.log(`[Server] Config loaded: soundEnabled=${config.soundEnabled}, externalDirs=${config.externalAssetDirectories.length}`);

// Merge bundled + external furniture assets
function loadAllFurniture(): LoadedFurnitureAssets | null {
  let assets = loadFurnitureAssets(assetsRoot);
  const cfg = getConfig();
  for (const extraDir of cfg.externalAssetDirectories) {
    if (!existsSync(extraDir)) {
      console.warn(`[Server] External asset directory not found: ${extraDir}`);
      continue;
    }
    console.log(`[Server] Loading external furniture from: ${extraDir}`);
    const extra = loadFurnitureAssets(extraDir);
    if (extra) {
      if (assets) {
        // Merge: concatenate catalogs, merge sprite maps
        assets = {
          catalog: [...assets.catalog, ...extra.catalog],
          sprites: { ...assets.sprites, ...extra.sprites },
        };
      } else {
        assets = extra;
      }
    }
  }
  return assets;
}

let furnitureAssets = loadAllFurniture();

// Persistence directory
const persistDir = join(homedir(), ".pixel-agents");
const persistedLayoutPath = join(persistDir, "layout.json");
const persistedSeatsPath = join(persistDir, "agent-seats.json");

// Load layout: persisted first, then default, with revision comparison
interface LayoutLoadResult {
  layout: Record<string, unknown>;
  wasReset: boolean;
}

const defaultLayout = loadDefaultLayout(assetsRoot);

function loadLayoutWithRevision(): LayoutLoadResult | null {
  if (existsSync(persistedLayoutPath)) {
    try {
      const content = readFileSync(persistedLayoutPath, "utf-8");
      const persisted = JSON.parse(content) as Record<string, unknown>;
      const fileRevision = (persisted.layoutRevision as number) ?? 0;
      const defaultRevision = (defaultLayout?.layoutRevision as number) ?? 0;

      if (defaultRevision > fileRevision) {
        console.log(
          `[Server] Layout revision outdated (${fileRevision} < ${defaultRevision}), resetting to bundled default`,
        );
        writeLayoutToFile(defaultLayout!);
        return { layout: defaultLayout!, wasReset: true };
      }

      console.log(`[Server] Loaded persisted layout from ${persistedLayoutPath}`);
      return { layout: persisted, wasReset: false };
    } catch (err) {
      console.warn(`[Server] Failed to load persisted layout: ${err instanceof Error ? err.message : err}`);
    }
  }

  if (defaultLayout) {
    console.log("[Server] Writing bundled default layout to file");
    writeLayoutToFile(defaultLayout);
    return { layout: defaultLayout, wasReset: false };
  }

  return null;
}

/** Write layout to file atomically (tmp + rename) */
function writeLayoutToFile(layout: Record<string, unknown>): void {
  try {
    mkdirSync(persistDir, { recursive: true });
    const json = JSON.stringify(layout, null, 2);
    const tmpPath = persistedLayoutPath + ".tmp";
    writeFileSync(tmpPath, json, "utf-8");
    renameSync(tmpPath, persistedLayoutPath);
  } catch (err) {
    console.error(`[Server] Failed to write layout file: ${err instanceof Error ? err.message : err}`);
  }
}

function loadPersistedSeats(): Record<number, { palette: number; hueShift: number; seatId: string | null }> | null {
  if (existsSync(persistedSeatsPath)) {
    try {
      const content = readFileSync(persistedSeatsPath, "utf-8");
      return JSON.parse(content);
    } catch {
      return null;
    }
  }
  return null;
}

const layoutResult = loadLayoutWithRevision();
let currentLayout = layoutResult?.layout ?? null;
const layoutWasReset = layoutResult?.wasReset ?? false;
const persistedSeats = loadPersistedSeats();

// Express app
const app = express();
// Serve production build
app.use(express.static(join(__dirname, "public")));

const server = createServer(app);

// WebSocket
const wss = new WebSocketServer({ server });

// Ping/pong heartbeat — keeps clients Set accurate for shutdown guard
const HEARTBEAT_INTERVAL_MS = 30_000;
setInterval(() => {
  for (const ws of clients) {
    if ((ws as unknown as Record<string, boolean>).__isAlive === false) {
      clients.delete(ws);
      ws.terminate();
      continue;
    }
    (ws as unknown as Record<string, boolean>).__isAlive = false;
    ws.ping();
  }
}, HEARTBEAT_INTERVAL_MS);

function broadcast(msg: ServerMessage): void {
  const data = JSON.stringify(msg);
  for (const client of clients) {
    if (client.readyState === WebSocket.OPEN) {
      client.send(data);
    }
  }
}

function sendInitialData(ws: WebSocket): void {
  // Send settings (persisted from config)
  const cfg = getConfig();
  ws.send(JSON.stringify({
    type: "settingsLoaded",
    soundEnabled: cfg.soundEnabled,
    externalAssetDirectories: cfg.externalAssetDirectories,
  }));

  // Send character sprites
  if (characterSprites) {
    ws.send(JSON.stringify({ type: "characterSpritesLoaded", characters: characterSprites.characters }));
  }

  // Send wall tiles (multi-set format)
  if (wallTiles) {
    ws.send(JSON.stringify({ type: "wallTilesLoaded", sets: wallTiles.sets }));
  }

  // Send floor tiles (optional)
  if (floorTiles) {
    ws.send(JSON.stringify({ type: "floorTilesLoaded", sprites: floorTiles.sprites }));
  }

  // Send furniture assets (optional)
  if (furnitureAssets) {
    ws.send(
      JSON.stringify({
        type: "furnitureAssetsLoaded",
        catalog: furnitureAssets.catalog,
        sprites: furnitureAssets.sprites,
      }),
    );
  }

  // Send cached pipeline issues
  if (cachedPipelineIssues.length > 0) {
    ws.send(JSON.stringify({ type: "pipelineIssues", issues: cachedPipelineIssues }));
  }

  // Send existing agents with persisted seat metadata
  const agentList = Array.from(agents.values());
  const agentIds = agentList.map((a) => a.id);
  const folderNames: Record<number, string> = {};
  const agentMeta: Record<number, { palette?: number; hueShift?: number; seatId?: string }> = {};
  const parentAgentIds: Record<number, number> = {};
  for (const a of agentList) {
    folderNames[a.id] = a.projectName;
    if (a.parentAgentId !== undefined) {
      parentAgentIds[a.id] = a.parentAgentId;
    }
    if (persistedSeats?.[a.id]) {
      const s = persistedSeats[a.id];
      agentMeta[a.id] = { palette: s.palette, hueShift: s.hueShift, seatId: s.seatId ?? undefined };
    } else {
      // Fall back to previous agent state for seat info (restored across restarts)
      const prev = previousAgentState?.agents.find((p) => p.id === a.id);
      if (prev) {
        agentMeta[a.id] = { palette: prev.palette, hueShift: prev.hueShift, seatId: prev.seatId ?? undefined };
      }
    }
  }
  ws.send(JSON.stringify({ type: "existingAgents", agents: agentIds, folderNames, agentMeta, parentAgentIds }));

  // Send agentStats for each active agent
  for (const a of agentList) {
    ws.send(JSON.stringify(buildAgentStatsMessage(a)));
  }

  // Send agentRole for each active agent
  for (const a of agentList) {
    ws.send(JSON.stringify(buildAgentRoleMessage(a)));
  }

  // Send layout (must come after existingAgents — the hook buffers agents until layout arrives)
  if (currentLayout) {
    ws.send(JSON.stringify({ type: "layoutLoaded", layout: currentLayout, version: 1, wasReset: layoutWasReset }));
  } else {
    // Send null layout to trigger default layout creation in the UI
    ws.send(JSON.stringify({ type: "layoutLoaded", layout: null, version: 0, wasReset: false }));
  }
}

wss.on("connection", (ws) => {
  (ws as unknown as Record<string, boolean>).__isAlive = true;
  ws.on("pong", () => { (ws as unknown as Record<string, boolean>).__isAlive = true; });
  clients.add(ws);

  ws.on("message", (raw) => {
    try {
      const msg = JSON.parse(raw.toString());
      if (msg.type === "webviewReady" || msg.type === "ready") {
        sendInitialData(ws);
      } else if (msg.type === "saveLayout") {
        try {
          currentLayout = msg.layout as Record<string, unknown>;
          layoutWatcherOwnWrite = true;
          writeLayoutToFile(currentLayout);
          // Broadcast to other clients for multi-tab sync
          const data = JSON.stringify({ type: "layoutLoaded", layout: msg.layout, version: 1, wasReset: false });
          for (const client of clients) {
            if (client !== ws && client.readyState === WebSocket.OPEN) {
              client.send(data);
            }
          }
        } catch (err) {
          console.error(`[Server] Failed to save layout: ${err instanceof Error ? err.message : err}`);
        }
      } else if (msg.type === "saveAgentSeats") {
        try {
          mkdirSync(persistDir, { recursive: true });
          writeFileSync(persistedSeatsPath, JSON.stringify(msg.seats, null, 2));
        } catch (err) {
          console.error(`[Server] Failed to save agent seats: ${err instanceof Error ? err.message : err}`);
        }
      } else if (msg.type === "saveSoundEnabled") {
        const cfg = getConfig();
        cfg.soundEnabled = !!msg.enabled;
        saveConfig(cfg);
        console.log(`[Server] Sound enabled: ${cfg.soundEnabled}`);
      } else if (msg.type === "addExternalAssetDirectory") {
        const newPath = typeof msg.path === "string" ? msg.path.trim() : "";
        if (!newPath) return;
        const cfg = getConfig();
        if (!cfg.externalAssetDirectories.includes(newPath)) {
          cfg.externalAssetDirectories.push(newPath);
          saveConfig(cfg);
          // Reload furniture with new external dirs
          furnitureAssets = loadAllFurniture();
          // Broadcast updated furniture to all clients
          if (furnitureAssets) {
            broadcast({
              type: "furnitureAssetsLoaded",
              catalog: furnitureAssets.catalog,
              sprites: furnitureAssets.sprites,
            });
          }
          // Broadcast updated directories list to all clients
          const dirMsg = JSON.stringify({
            type: "externalAssetDirectoriesUpdated",
            dirs: cfg.externalAssetDirectories,
          });
          for (const client of clients) {
            if (client.readyState === WebSocket.OPEN) {
              client.send(dirMsg);
            }
          }
          console.log(`[Server] Added external asset directory: ${newPath}`);
        }
      } else if (msg.type === "removeExternalAssetDirectory") {
        const removePath = typeof msg.path === "string" ? msg.path : "";
        const cfg = getConfig();
        cfg.externalAssetDirectories = cfg.externalAssetDirectories.filter(
          (d) => d !== removePath,
        );
        saveConfig(cfg);
        // Reload furniture without the removed dir
        furnitureAssets = loadAllFurniture();
        // Broadcast updated furniture to all clients
        if (furnitureAssets) {
          broadcast({
            type: "furnitureAssetsLoaded",
            catalog: furnitureAssets.catalog,
            sprites: furnitureAssets.sprites,
          });
        }
        // Broadcast updated directories list to all clients
        const dirMsg = JSON.stringify({
          type: "externalAssetDirectoriesUpdated",
          dirs: cfg.externalAssetDirectories,
        });
        for (const client of clients) {
          if (client.readyState === WebSocket.OPEN) {
            client.send(dirMsg);
          }
        }
        console.log(`[Server] Removed external asset directory: ${removePath}`);
      } else if (msg.type === "openClaude") {
        launchClaude(false);
      } else if (msg.type === "openClaudeBypass") {
        launchClaude(true);
      } else if (msg.type === "requestAgentDetails") {
        const requestedId = msg.id as number;
        for (const agent of agents.values()) {
          if (agent.id === requestedId) {
            const details: ServerMessage = {
              type: "agentDetails",
              id: agent.id,
              model: agent.model,
              gitBranch: agent.gitBranch,
              cwd: agent.cwd,
              sessionId: agent.sessionId,
              version: agent.version,
              permissionMode: agent.permissionMode,
              toolHistory: agent.toolHistory,
              tokenBreakdown: {
                input: agent.totalInputTokens,
                output: agent.totalOutputTokens,
                cacheRead: agent.totalCacheRead,
                cacheCreation: agent.totalCacheCreation,
              },
              turnCount: agent.turnCount,
              totalDurationMs: agent.totalDurationMs,
              startTime: agent.startTime,
            };
            ws.send(JSON.stringify(details));
            break;
          }
        }
      } else if (msg.type === "setAgentRole") {
        const targetId = msg.id as number;
        const newRole = msg.role as string;
        const colors = getRoleColors(newRole);
        // Save persistent override
        roleOverrides[targetId] = { role: newRole, colors };
        saveRoleOverrides(roleOverrides);
        // Broadcast updated role to all clients
        broadcast({
          type: "agentRole",
          id: targetId,
          role: newRole,
          autoDetected: false,
          colors,
        });
        console.log(`[Server] Role override set: agent ${targetId} → "${newRole}"`);
      } else if (msg.type === "removeTestAgents") {
        // Remove all test agents
        const toRemove: number[] = [];
        for (const id of testAgentIds) {
          toRemove.push(id);
          broadcast({ type: "agentClosed", id });
        }
        testAgentIds.clear();
        console.log(`[Server] Removed ${toRemove.length} test agents`);
      } else if (msg.type === "spawnTestAgents") {
        // Remove existing test agents first
        for (const id of testAgentIds) {
          broadcast({ type: "agentClosed", id });
        }
        testAgentIds.clear();
        const count = Math.min(msg.count || 5, 12);
        console.log(`[Server] Spawning ${count} test agents`);
        const leadId = nextAgentId; // remember lead id before incrementing
        for (let i = 0; i < count; i++) {
          const id = nextAgentId++;
          const isSubagent = i > 0; // first is lead, rest are subagents
          const parentId = isSubagent ? leadId : undefined;
          const names = ["Lead", "Explorer", "Coder", "Reviewer", "Tester", "Builder", "Planner", "Fixer", "Writer", "Auditor", "Runner", "Helper"];
          const folderName = names[i % names.length];
          broadcast({
            type: "agentCreated",
            id,
            folderName,
            parentAgentId: parentId,
          });
          // Send fake stats
          broadcast({
            type: "agentStats",
            id,
            model: i % 2 === 0 ? "claude-opus-4-6" : "claude-sonnet-4-6",
            totalInputTokens: Math.floor(Math.random() * 50000) + 1000,
            totalOutputTokens: Math.floor(Math.random() * 20000) + 500,
            totalCacheRead: Math.floor(Math.random() * 30000),
            totalCacheCreation: Math.floor(Math.random() * 5000),
            turnCount: Math.floor(Math.random() * 20) + 1,
            totalDurationMs: Math.floor(Math.random() * 300000) + 10000,
            cacheHitRate: Math.floor(Math.random() * 80) + 10,
          });
          // Send fake role
          const roles = ["default", "Explore", "Code Reviewer", "Plan", "general-purpose", "test-runner"];
          const role = roles[i % roles.length];
          broadcast({
            type: "agentRole",
            id,
            role,
            autoDetected: true,
            colors: getRoleColors(role),
          });
          testAgentIds.add(id);
          console.log(`  Test agent ${id}: ${folderName}${isSubagent ? ` [sub of ${parentId}]` : ""}`);
        }
      }
    } catch {
      /* ignore invalid messages */
    }
  });

  ws.on("close", () => clients.delete(ws));
});

// ── Layout file watcher (cross-process sync) ─────────────────────────────
let layoutWatcherOwnWrite = false;
let layoutWatcherLastMtime = 0;
let layoutFsWatcher: FSWatcher | null = null;
const LAYOUT_POLL_INTERVAL_MS = 2000;

// Initialize lastMtime
try {
  if (existsSync(persistedLayoutPath)) {
    layoutWatcherLastMtime = statSync(persistedLayoutPath).mtimeMs;
  }
} catch { /* ignore */ }

function checkLayoutFileChange(): void {
  try {
    if (!existsSync(persistedLayoutPath)) return;
    const stat = statSync(persistedLayoutPath);
    if (stat.mtimeMs <= layoutWatcherLastMtime) return;
    layoutWatcherLastMtime = stat.mtimeMs;

    if (layoutWatcherOwnWrite) {
      layoutWatcherOwnWrite = false;
      return;
    }

    const raw = readFileSync(persistedLayoutPath, "utf-8");
    const layout = JSON.parse(raw) as Record<string, unknown>;
    console.log("[Server] External layout change detected, broadcasting to clients");
    currentLayout = layout;
    broadcast({ type: "layoutLoaded", layout, version: 1, wasReset: false });
  } catch (err) {
    console.error(`[Server] Error checking layout file: ${err instanceof Error ? err.message : err}`);
  }
}

function startLayoutFsWatch(): void {
  if (layoutFsWatcher) return;
  try {
    if (!existsSync(persistedLayoutPath)) return;
    layoutFsWatcher = watch(persistedLayoutPath, () => {
      checkLayoutFileChange();
    });
    layoutFsWatcher.on("error", () => {
      layoutFsWatcher?.close();
      layoutFsWatcher = null;
    });
  } catch { /* file may not exist yet */ }
}

startLayoutFsWatch();

// Polling backup for layout file watching
const layoutPollTimer = setInterval(() => {
  if (!layoutFsWatcher) {
    startLayoutFsWatch();
  }
  checkLayoutFileChange();
}, LAYOUT_POLL_INTERVAL_MS);

// ── Agent state persistence ───────────────────────────────────────────────
const agentStatePath = join(persistDir, "agents-state.json");
const AGENT_STATE_SAVE_INTERVAL_MS = 30_000;

interface PersistedAgentState {
  sessionId: string;
  id: number;
  agentSetting?: string;
  agentDescription?: string;
  projectName: string;
  palette?: number;
  hueShift?: number;
  seatId?: string | null;
}

function saveAgentState(): void {
  if (agents.size === 0) return;
  try {
    mkdirSync(persistDir, { recursive: true });
    const states: PersistedAgentState[] = [];
    for (const agent of agents.values()) {
      const seat = persistedSeats?.[agent.id];
      states.push({
        sessionId: agent.sessionId,
        id: agent.id,
        projectName: agent.projectName,
        palette: seat?.palette,
        hueShift: seat?.hueShift,
        seatId: seat?.seatId,
        agentSetting: agent.agentSetting,
        agentDescription: agent.agentDescription,
      });
    }
    const json = JSON.stringify({ agents: states, nextAgentId, savedAt: Date.now() }, null, 2);
    const tmpPath = agentStatePath + ".tmp";
    writeFileSync(tmpPath, json, "utf-8");
    renameSync(tmpPath, agentStatePath);
  } catch (err) {
    console.error(`[Server] Failed to save agent state: ${err instanceof Error ? err.message : err}`);
  }
}

function loadAgentState(): { agents: PersistedAgentState[]; nextAgentId: number } | null {
  if (!existsSync(agentStatePath)) return null;
  try {
    const content = readFileSync(agentStatePath, "utf-8");
    return JSON.parse(content);
  } catch {
    return null;
  }
}

// Restore agent seat assignments from persisted state
const previousAgentState = loadAgentState();
if (previousAgentState) {
  console.log(`[Server] Found previous agent state with ${previousAgentState.agents.length} agents, nextAgentId=${previousAgentState.nextAgentId}`);
  // Restore nextAgentId to avoid ID collisions
  if (previousAgentState.nextAgentId > nextAgentId) {
    nextAgentId = previousAgentState.nextAgentId;
  }
}

// Periodically save agent state
const agentStateSaveTimer = setInterval(() => {
  saveAgentState();
}, AGENT_STATE_SAVE_INTERVAL_MS);

// Watcher
const watcher = new JsonlWatcher();

watcher.on("fileAdded", (file: WatchedFile) => {
  if (agents.has(file.sessionId)) return;
  lastActivityTime = Date.now();

  // Check if this session was previously tracked — restore its ID and seat data
  const prevAgent = previousAgentState?.agents.find((a) => a.sessionId === file.sessionId);
  const agentId = prevAgent?.id ?? nextAgentId++;

  // Ensure nextAgentId stays ahead of any restored ID
  if (agentId >= nextAgentId) {
    nextAgentId = agentId + 1;
  }

  const agent: TrackedAgent = {
    id: agentId,
    sessionId: file.sessionId,
    projectDir: dirname(file.path),
    projectName: file.projectName,
    jsonlFile: file.path,
    fileOffset: 0,
    lineBuffer: "",
    activity: "idle",
    activeTools: new Map(),
    activeToolNames: new Map(),
    activeSubagentToolIds: new Map(),
    activeSubagentToolNames: new Map(),
    isWaiting: false,
    permissionSent: false,
    hadToolsInTurn: false,
    lastActivityTime: Date.now(),
    totalInputTokens: 0,
    totalOutputTokens: 0,
    totalCacheRead: 0,
    totalCacheCreation: 0,
    turnCount: 0,
    totalDurationMs: 0,
    toolHistory: [],
    toolCounts: {},
  };

  // Restore role from persisted state if available
  if (prevAgent?.agentSetting) {
    agent.agentSetting = prevAgent.agentSetting;
  }
  if (prevAgent?.agentDescription) {
    agent.agentDescription = prevAgent.agentDescription;
  }

  // Handle subagent JSONL files: resolve parentSessionId → parentAgentId
  if (file.parentSessionId) {
    agent.parentSessionId = file.parentSessionId;
    // Look up the parent agent by sessionId
    const parentAgent = agents.get(file.parentSessionId);
    if (parentAgent) {
      agent.parentAgentId = parentAgent.id;
    }
  }

  // Use agentType from meta.json as agentSetting if not already set
  if (file.agentType && !agent.agentSetting) {
    agent.agentSetting = file.agentType;
  }

  // Use description from meta.json
  if (file.agentDescription) {
    agent.agentDescription = file.agentDescription;
  }

  // Resolve display role from agentSetting + description
  const isSubagent = !!agent.parentSessionId;
  const { displayRole } = resolveDisplayRole(agent.agentSetting, agent.agentDescription, isSubagent);
  agent.role = displayRole;

  // agentSetting will be populated from JSONL as lines are parsed

  agents.set(file.sessionId, agent);
  broadcast({
    type: "agentCreated",
    id: agent.id,
    folderName: agent.projectName,
    parentAgentId: agent.parentAgentId,
  });
  broadcast(buildAgentRoleMessage(agent));

  // Log role resolution for debugging
  if (displayRole) {
    console.log(`  Role: ${agent.agentSetting || '(none)'} → "${displayRole}" (desc: ${agent.agentDescription || '(none)'})`);
  }

  if (prevAgent) {
    console.log(`Agent ${agent.id} rejoined (restored): ${agent.projectName} (${file.sessionId.slice(0, 8)})${agent.parentAgentId ? ` [subagent of ${agent.parentAgentId}]` : ""}`);
  } else {
    console.log(`Agent ${agent.id} joined: ${agent.projectName} (${file.sessionId.slice(0, 8)})${agent.parentAgentId ? ` [subagent of ${agent.parentAgentId}]` : ""}`);
  }
});

watcher.on("fileRemoved", (file: WatchedFile) => {
  const agent = agents.get(file.sessionId);
  if (!agent) return;

  agents.delete(file.sessionId);
  broadcast({ type: "agentClosed", id: agent.id });
  console.log(`Agent ${agent.id} left: ${agent.projectName}`);
});

watcher.on("line", (file: WatchedFile, line: string) => {
  const agent = agents.get(file.sessionId);
  if (!agent) return;
  lastActivityTime = Date.now();

  processTranscriptLine(line, agent, broadcast, onAgentStatsUpdate);
});

// ── GitHub Issues Pipeline Tracking ─────────────────────────────────────────
const PIPELINE_POLL_INTERVAL_MS = 60_000; // Poll every 60s
let cachedPipelineIssues: Array<{ number: number; title: string; labels: string[]; state: string; pipelineState: string; repo: string }> = [];

function fetchPipelineIssues(): void {
  // Get unique repo names from active agents' project directories
  const repoSet = new Set<string>();
  for (const agent of agents.values()) {
    // Try to detect GitHub repo from the project directory
    try {
      const result = execSync(
        `cd "${agent.projectDir}" && gh repo view --json nameWithOwner -q .nameWithOwner 2>/dev/null`,
        { encoding: "utf-8", timeout: 10000 }
      ).trim();
      if (result) repoSet.add(result);
    } catch { /* not a git repo or gh not available */ }
  }
  // Fallback: if no repos detected, try common repos from config
  if (repoSet.size === 0) {
    // Try to detect from home directory git repos
    try {
      const result = execSync(
        `gh repo list --json nameWithOwner -q '.[].nameWithOwner' --limit 10 2>/dev/null`,
        { encoding: "utf-8", timeout: 15000 }
      ).trim();
      if (result) {
        for (const r of result.split("\n").filter(Boolean)) repoSet.add(r);
      }
    } catch { /* gh not available */ }
  }

  const allIssues: typeof cachedPipelineIssues = [];
  for (const repo of repoSet) {
    try {
      const raw = execSync(
        `gh issue list -R "${repo}" --state open --limit 30 --json number,title,labels,state,body 2>/dev/null`,
        { encoding: "utf-8", timeout: 15000 }
      );
      const issues = JSON.parse(raw) as Array<{ number: number; title: string; labels: Array<{ name: string }>; state: string; body: string }>;
      for (const issue of issues) {
        // Parse pipeline state from YAML metadata in issue body
        let pipelineState = "";
        const yamlMatch = issue.body?.match(/```yaml\s*\n([\s\S]*?)```/);
        if (yamlMatch) {
          const stateMatch = yamlMatch[1].match(/^state:\s*(.+)$/m);
          if (stateMatch) pipelineState = stateMatch[1].trim();
        }
        allIssues.push({
          number: issue.number,
          title: issue.title,
          labels: issue.labels.map((l) => l.name),
          state: issue.state,
          pipelineState,
          repo: repo.split("/").pop() || repo,
        });
      }
    } catch (err) {
      console.warn(`[Server] Failed to fetch issues for ${repo}: ${err instanceof Error ? err.message : err}`);
    }
  }

  cachedPipelineIssues = allIssues;
  if (allIssues.length > 0) {
    broadcast({ type: "pipelineIssues", issues: allIssues });
    console.log(`[Server] Fetched ${allIssues.length} pipeline issues from ${repoSet.size} repos`);
  }
}

// Initial fetch after a short delay (let agents connect first)
setTimeout(fetchPipelineIssues, 5000);
const pipelineIssuesPollTimer = setInterval(fetchPipelineIssues, PIPELINE_POLL_INTERVAL_MS);

// Start
watcher.start();

function startServer(retries = 1): void {
  server.listen(PORT, () => {
    console.log(`Pixel Agents server running at http://localhost:${PORT}`);
    console.log(`Watching ~/.claude/projects/ for active sessions...`);
  });
  server.on("error", (err: NodeJS.ErrnoException) => {
    if (err.code === "EADDRINUSE" && retries > 0) {
      console.log(`[Server] Port ${PORT} in use, killing existing process and retrying...`);
      try {
        const pids = execSync(`lsof -t -i :${PORT} 2>/dev/null`, { encoding: "utf-8" }).trim();
        if (pids) {
          for (const pid of pids.split("\n")) {
            try { process.kill(parseInt(pid), "SIGTERM"); } catch { /* already dead */ }
          }
        }
      } catch { /* no process found */ }
      setTimeout(() => {
        server.close();
        const newServer = createServer(app);
        // Re-attach WebSocket to new server
        newServer.listen(PORT, () => {
          console.log(`Pixel Agents server running at http://localhost:${PORT} (after retry)`);
        });
      }, 1000);
    } else {
      console.error(`[Server] Fatal error: ${err.message}`);
      process.exit(1);
    }
  });
}

startServer();

// Cleanup helper for shutdown
function cleanupAll(): void {
  saveAgentState();
  cleanupSpawnedClaudes();
  watcher.stop();
  layoutFsWatcher?.close();
  layoutFsWatcher = null;
  clearInterval(layoutPollTimer);
  clearInterval(agentStateSaveTimer);
  clearInterval(pipelineIssuesPollTimer);
  server.close();
}

// Idle shutdown disabled — server should stay up permanently
// setInterval(() => {
//   if (agents.size === 0 && clients.size === 0 && Date.now() - lastActivityTime > IDLE_SHUTDOWN_MS) {
//     console.log("No active sessions or clients for 10 minutes, shutting down...");
//     cleanupAll();
//     process.exit(0);
//   }
// }, 30_000);

// Graceful shutdown
for (const signal of ["SIGINT", "SIGTERM"] as const) {
  process.on(signal, () => {
    cleanupAll();
    process.exit(0);
  });
}
