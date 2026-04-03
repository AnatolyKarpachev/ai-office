import express from "express";
import { createServer } from "http";
import { WebSocketServer, WebSocket } from "ws";
import { join, dirname } from "path";
import { homedir } from "os";
import { fileURLToPath } from "url";
import { existsSync, readFileSync, writeFileSync, mkdirSync, watch, statSync, renameSync, unlinkSync } from "fs";
import type { FSWatcher } from "fs";
import { spawn, execSync, type ChildProcess } from "child_process";
import crypto from "crypto";
import { JsonlWatcher } from "./watcher.js";
import { CodexJsonlWatcher } from "./codexWatcher.js";
import { processTranscriptLine, cleanupAgentParserState } from "./parser.js";
import { processCodexTranscriptLine, cleanupCodexParserState } from "./codexParser.js";
import {
  loadCharacterSprites,
  loadWallTiles,
  loadFloorTiles,
  loadFurnitureAssets,
  loadDefaultLayout,
} from "./assetLoader.js";
import type { LoadedFurnitureAssets } from "./assetLoader.js";
import { loadConfig, saveConfig, getConfig, type GithubTaskStateConfig } from "./configPersistence.js";
import type { TrackedAgent, ServerMessage } from "./types.js";
import { getRoleColors, resolveDerivedAgentName, resolveDisplayRole } from "./roleDetector.js";
import type { AgentProvider, WatchedFile } from "./sourceTypes.js";
import { openPath, findPidsOnPort } from "./platform.js";
import { DaemonHub } from "./daemonHub.js";

const __dirname = dirname(fileURLToPath(import.meta.url));
const PORT = parseInt(process.env.PORT || "9876", 10);
const IDLE_SHUTDOWN_MS = 600_000; // 10 minutes

// Accumulate SendMessage events so new clients see historical inter-agent communication
const MAX_SEND_MESSAGES = 200;
const recentSendMessages: Array<{ id: number; toolId: string; from: string; to: string; message: string }> = [];

// Context window limits by model for health bar calculation
const MODEL_CONTEXT_LIMITS: Record<string, number> = {
  "claude-opus-4-6": 200000,
  "claude-sonnet-4-6": 200000,
  "claude-haiku-4-5": 200000,
  "default": 200000,
};

const CLAUDE_PROJECTS_DIR = join(homedir(), ".claude", "projects");
const CODEX_SESSIONS_DIR = join(homedir(), ".codex", "sessions");

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
    currentContextTokens: agent.currentContextTokens,
    currentContextLimit: agent.currentContextLimit,
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
    role: displayRole,
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

function syncAgentNameAndBroadcast(agent: TrackedAgent): void {
  if (agent.provider !== "claude") return;
  if (agent.nameSource === "explicit") return;
  // Don't override team-derived names (from agentName or teamName fields)
  if (agent.nameSource === "derived" && agent.teamName) return;

  const isSubagent = !!agent.parentSessionId;
  const derivedName = resolveDerivedAgentName(agent.agentSetting, agent.agentDescription, isSubagent);
  if (!derivedName) return;

  if (agent.projectName !== derivedName || agent.nameSource !== "derived") {
    agent.projectName = derivedName;
    agent.nameSource = "derived";
    broadcast({ type: "agentRenamed", id: agent.id, folderName: agent.projectName });
  }
}

function onAgentStatsUpdate(agent: TrackedAgent): void {
  broadcast(buildAgentStatsMessage(agent));
  syncAgentNameAndBroadcast(agent);
  // Recalculate role when stats change (model detected, tools used, etc.)
  syncRoleAndBroadcast(agent);
  // Resolve team parent-child relationships
  resolveTeamParent(agent);
}

/** Link teammate agents to their team lead, and team leads to their spawner */
function resolveTeamParent(agent: TrackedAgent): void {
  if (!agent.teamName || agent.parentAgentId !== undefined) return;

  if (agent.isTeamLead) {
    // Link team lead to the nearest MegaBoss/top-level session without a team
    for (const [, other] of agents) {
      if (!other.teamName && !other.parentSessionId && !other.parentAgentId && other.id !== agent.id && other.provider === "claude") {
        agent.parentAgentId = other.id;
        broadcast({ type: "agentCreated", id: agent.id, folderName: agent.projectName, parentAgentId: other.id });
        console.log(`[team] lead ${agent.projectName} (${agent.id}) → parent ${other.projectName} (${other.id})`);
        break;
      }
    }
    return;
  }

  // Link teammate to team lead (same teamName, isTeamLead=true)
  for (const [, other] of agents) {
    if (other.teamName === agent.teamName && other.isTeamLead && other.id !== agent.id) {
      agent.parentAgentId = other.id;
      broadcast({ type: "agentCreated", id: agent.id, folderName: agent.projectName, parentAgentId: other.id });
      console.log(`[team] ${agent.projectName} (${agent.id}) → parent ${other.projectName} (${other.id}) via team "${agent.teamName}"`);
      break;
    }
  }
}

// State
const agents = new Map<string, TrackedAgent>(); // provider:sessionId -> agent
let nextAgentId = 1;
const clients = new Set<WebSocket>();
const testAgentIds = new Set<number>();
const testAgentData = new Map<number, { folderName: string; role: string; parentAgentId?: number; model: string }>();
let lastActivityTime = Date.now();
const spawnedClaudes = new Set<ChildProcess>();
const codexSubagentHints = new Map<string, { nickname?: string; role?: string; parentSessionId: string }>();

// ── Share token management ──────────────────────────────────────────────
interface ShareToken {
  token: string;
  expiresAt: number;
  createdAt: number;
  durationMs: number;
}
const activeShareTokens = new Map<string, ShareToken>();

function createShareToken(durationMs: number): ShareToken {
  const token = crypto.randomBytes(16).toString("hex");
  const share: ShareToken = {
    token,
    expiresAt: Date.now() + durationMs,
    createdAt: Date.now(),
    durationMs,
  };
  activeShareTokens.set(token, share);
  return share;
}

function isShareTokenValid(token: string): boolean {
  const share = activeShareTokens.get(token);
  if (!share) return false;
  if (Date.now() > share.expiresAt) {
    activeShareTokens.delete(token);
    return false;
  }
  return true;
}

// Cleanup expired tokens every 60s
setInterval(() => {
  const now = Date.now();
  for (const [token, share] of activeShareTokens) {
    if (now > share.expiresAt) activeShareTokens.delete(token);
  }
}, 60_000);

function getAgentKey(provider: AgentProvider, sessionId: string): string {
  return `${provider}:${sessionId}`;
}

function resolveSessionLabel(provider: AgentProvider, sessionId: string): string | undefined {
  const key = getAgentKey(provider, sessionId);
  const agent = agents.get(key);
  if (agent) return agent.projectName;
  const hint = provider === "codex" ? codexSubagentHints.get(sessionId) : undefined;
  return hint?.nickname;
}

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
// Production when running from dist/ directory (esbuild output)
const isDev = !__dirname.endsWith("/dist") && !__dirname.endsWith("\\dist");
const assetsRoot = isDev ? devAssetsRoot : prodAssetsRoot;

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

function openSessionsFolder(): void {
  const dirs = [CLAUDE_PROJECTS_DIR, CODEX_SESSIONS_DIR].filter((dir) => existsSync(dir));
  if (dirs.length === 0) {
    openPath(join(homedir(), ".claude"));
    return;
  }
  for (const dir of dirs) {
    openPath(dir);
  }
}

function isLayoutPayload(value: unknown): value is Record<string, unknown> {
  if (!value || typeof value !== "object") return false;
  const layout = value as Record<string, unknown>;
  return layout.version === 1 && Array.isArray(layout.tiles) && Array.isArray(layout.furniture);
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
// Share URL route — must be before static middleware
app.get("/share/:token", (req, res) => {
  const { token } = req.params;
  if (!isShareTokenValid(token)) {
    res.status(410).send("Share link expired or invalid");
    return;
  }
  res.sendFile(join(__dirname, "public", "index.html"));
});

// Serve production build
app.use(express.static(join(__dirname, "public"), {
  etag: false,
  lastModified: false,
  setHeaders: (res) => {
    res.setHeader("Cache-Control", "no-store, no-cache, must-revalidate");
    res.setHeader("Pragma", "no-cache");
  },
}));

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
    desktopNotifications: cfg.desktopNotifications,
    externalAssetDirectories: cfg.externalAssetDirectories,
    githubTasks: cfg.githubTasks,
    serverMode: isDev ? "dev" : "prod",
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

  // Send idle status for agents with no active tools (so frontend triggers sofa behavior)
  for (const a of agentList) {
    if (a.activeTools.size === 0) {
      ws.send(JSON.stringify({ type: "agentStatus", id: a.id, status: "waiting" }));
    }
  }

  // Send layout (must come after existingAgents — the hook buffers agents until layout arrives)
  if (currentLayout) {
    ws.send(JSON.stringify({ type: "layoutLoaded", layout: currentLayout, version: 1, wasReset: layoutWasReset }));
  } else {
    // Send null layout to trigger default layout creation in the UI
    ws.send(JSON.stringify({ type: "layoutLoaded", layout: null, version: 0, wasReset: false }));
  }

  // Send accumulated SendMessage events — only from agents that still exist
  const activeIds = new Set(agentList.map(a => a.id));
  for (const sm of recentSendMessages) {
    if (activeIds.has(sm.id)) {
      ws.send(JSON.stringify({ type: "agentSendMessage", ...sm }));
    }
  }

  // Re-send test agents so they survive page refresh
  for (const [id, data] of testAgentData) {
    ws.send(JSON.stringify({ type: "agentCreated", id, folderName: data.folderName, parentAgentId: data.parentAgentId }));
    ws.send(JSON.stringify({ type: "agentRole", id, role: data.role, autoDetected: true, colors: getRoleColors(data.role) }));
    ws.send(JSON.stringify({
      type: "agentStats", id, model: data.model,
      totalInputTokens: 10000, totalOutputTokens: 5000, totalCacheRead: 0,
      totalCacheCreation: 0, turnCount: 5, totalDurationMs: 60000, cacheHitRate: 0,
    }));
  }
}

wss.on("connection", (ws, req) => {
  (ws as unknown as Record<string, boolean>).__isAlive = true;
  ws.on("pong", () => { (ws as unknown as Record<string, boolean>).__isAlive = true; });

  // Share token detection
  const wsUrl = new URL(req.url || "/", `http://${req.headers.host}`);
  const shareToken = wsUrl.searchParams.get("share");
  let isReadOnly = false;
  if (shareToken) {
    if (!isShareTokenValid(shareToken)) {
      ws.close(4001, "Share token expired");
      return;
    }
    isReadOnly = true;
  }
  (ws as any).__readOnly = isReadOnly;
  (ws as any).__host = req.headers.host;

  clients.add(ws);

  ws.on("message", (raw) => {
    try {
      const msg = JSON.parse(raw.toString());
      if (msg.type !== "webviewReady" && msg.type !== "ready") {
        console.log(`[Server] WS msg: ${msg.type}`);
      }
      // Guard write operations for read-only share viewers
      if ((ws as any).__readOnly) {
        const allowedTypes = ["webviewReady", "ready", "requestAgentDetails", "requestAgentConversation"];
        if (!allowedTypes.includes(msg.type)) return;
      }
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
      } else if (msg.type === "saveDesktopNotifications") {
        const cfg = getConfig();
        cfg.desktopNotifications = !!msg.enabled;
        saveConfig(cfg);
        console.log(`[Server] Desktop notifications: ${cfg.desktopNotifications}`);
      } else if (msg.type === "openSessionsFolder") {
        openSessionsFolder();
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
              contextUsage: agent.currentContextLimit
                ? {
                    input: agent.currentInputTokens ?? 0,
                    output: agent.currentOutputTokens ?? 0,
                    cacheRead: agent.currentCacheRead ?? 0,
                    total: agent.currentContextTokens ?? 0,
                    limit: agent.currentContextLimit,
                  }
                : undefined,
              turnCount: agent.turnCount,
              totalDurationMs: agent.totalDurationMs,
              startTime: agent.startTime,
            };
            ws.send(JSON.stringify(details));
            break;
          }
        }
      } else if (msg.type === "requestAgentConversation") {
        const requestedId = msg.id as number;
        for (const agent of agents.values()) {
          if (agent.id === requestedId) {
            ws.send(JSON.stringify({
              type: "agentConversation",
              id: agent.id,
              messages: agent.conversation || [],
            }));
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
      } else if (msg.type === "createShareLink") {
        if ((ws as any).__readOnly) return;
        const cfg = getConfig();
        const share = createShareToken(msg.durationMs as number);
        const baseUrl = cfg.shareProxyUrl
          ? cfg.shareProxyUrl.replace(/\/$/, "")
          : `http://${(ws as any).__host || `localhost:${PORT}`}`;
        const url = `${baseUrl}/share/${share.token}`;
        ws.send(JSON.stringify({
          type: "shareLinkCreated",
          token: share.token,
          url,
          expiresAt: share.expiresAt,
          durationMs: share.durationMs,
        }));
        console.log(`[Server] Share link created: ${url} (expires in ${share.durationMs / 60000}min)`);
      } else if (msg.type === "revokeShareLink") {
        if ((ws as any).__readOnly) return;
        activeShareTokens.delete(msg.token as string);
        ws.send(JSON.stringify({ type: "shareLinkRevoked", token: msg.token }));
        console.log(`[Server] Share link revoked: ${msg.token}`);
      } else if (msg.type === "removeTestAgents") {
        // Remove all test agents
        const toRemove: number[] = [];
        for (const id of testAgentIds) {
          toRemove.push(id);
          broadcast({ type: "agentClosed", id });
        }
        testAgentIds.clear();
        testAgentData.clear();
        console.log(`[Server] Removed ${toRemove.length} test agents`);
      } else if (msg.type === "spawnTestAgents") {
        // Remove existing test agents first
        for (const id of testAgentIds) {
          broadcast({ type: "agentClosed", id });
        }
        testAgentIds.clear();
        testAgentData.clear();

        // 4-level hierarchy: MegaBoss(real) → pipeDebate → teammates → subagents
        // Find first real MegaBoss to use as root parent
        let rootParentId: number | undefined;
        for (const [, a] of agents) {
          if (!a.parentAgentId && !a.teamName && a.provider === "claude") {
            rootParentId = a.id;
            break;
          }
        }
        const hierarchy = [
          { name: "pipeDebate",    role: "boss",          parent: -1, model: "claude-opus-4-6",    tokens: [15000, 8000], useRootParent: true },
          { name: "advocate-cur",  role: "Code Reviewer", parent: 0,  model: "claude-opus-4-6",    tokens: [12000, 6000] },
          { name: "advocate-auto", role: "Explore",       parent: 0,  model: "claude-opus-4-6",    tokens: [9000, 4500] },
          { name: "judge",         role: "Plan",          parent: 0,  model: "claude-opus-4-6",    tokens: [18000, 9000] },
          { name: "codeExplorer",  role: "Explore",       parent: 1,  model: "claude-sonnet-4-6",  tokens: [4000, 2000] },
          { name: "testRunner",    role: "test-runner",   parent: 1,  model: "claude-sonnet-4-6",  tokens: [3000, 1500] },
        ] as Array<{ name: string; role: string; parent: number; model: string; tokens: number[]; useRootParent?: boolean }>;

        const ids = hierarchy.map(() => nextAgentId++);
        console.log(`[Server] Spawning ${ids.length} test agents (4-level hierarchy, staggered)`);

        for (let i = 0; i < hierarchy.length; i++) {
          setTimeout(() => {
            const h = hierarchy[i];
            const id = ids[i];
            const parentId = h.useRootParent ? rootParentId : (h.parent >= 0 ? ids[h.parent] : undefined);
            broadcast({ type: "agentCreated", id, folderName: h.name, parentAgentId: parentId });
            broadcast({
              type: "agentStats", id, model: h.model,
              totalInputTokens: h.tokens[0], totalOutputTokens: h.tokens[1],
              totalCacheRead: Math.floor(h.tokens[0] * 0.3), totalCacheCreation: Math.floor(h.tokens[0] * 0.1),
              turnCount: Math.floor(Math.random() * 8) + 2,
              totalDurationMs: Math.floor(Math.random() * 200000) + 30000,
              cacheHitRate: Math.floor(Math.random() * 40) + 10,
            });
            broadcast({ type: "agentRole", id, role: h.role, autoDetected: true, colors: getRoleColors(h.role) });
            testAgentIds.add(id);
            testAgentData.set(id, { folderName: h.name, role: h.role, parentAgentId: parentId, model: h.model });
            console.log(`  Test agent ${id}: ${h.name} (${h.role})${parentId ? ` [sub of ${parentId}]` : ""}`);
          }, i * 800);
        }
      } else if (msg.type === "addDaemon") {
        const cfg = getConfig();
        if (!cfg.daemons.some((d: any) => d.url === msg.url)) {
          cfg.daemons.push({ url: msg.url, name: msg.name, enabled: true });
          saveConfig(cfg);
          // Restart hub with updated config
          daemonHub.stop();
          daemonHub.start(cfg.daemons);
        }
        ws.send(JSON.stringify({ type: "daemonStatus", daemons: daemonHub.getConnections() }));
      } else if (msg.type === "removeDaemon") {
        const cfg = getConfig();
        cfg.daemons = cfg.daemons.filter((d: any) => d.url !== msg.url);
        saveConfig(cfg);
        daemonHub.stop();
        daemonHub.start(cfg.daemons);
        ws.send(JSON.stringify({ type: "daemonStatus", daemons: daemonHub.getConnections() }));
      } else if (msg.type === "toggleDaemon") {
        const cfg = getConfig();
        const daemon = cfg.daemons.find((d: any) => d.url === msg.url);
        if (daemon) {
          daemon.enabled = msg.enabled;
          saveConfig(cfg);
          daemonHub.stop();
          daemonHub.start(cfg.daemons);
        }
        ws.send(JSON.stringify({ type: "daemonStatus", daemons: daemonHub.getConnections() }));
      } else if (msg.type === "getDaemonStatus") {
        ws.send(JSON.stringify({ type: "daemonStatus", daemons: daemonHub.getConnections() }));
      }
    } catch (err) {
      console.error(`[Server] WS message error:`, err instanceof Error ? err.message : err);
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
  provider: AgentProvider;
  sessionId: string;
  id: number;
  agentSetting?: string;
  agentDescription?: string;
  projectName: string;
  nameSource?: "fallback" | "derived" | "explicit";
  palette?: number;
  hueShift?: number;
  seatId?: string | null;
  parentAgentId?: number;
  teamName?: string;
  isTeamLead?: boolean;
}

function saveAgentState(): void {
  if (agents.size === 0) return;
  try {
    mkdirSync(persistDir, { recursive: true });
    const states: PersistedAgentState[] = [];
    for (const agent of agents.values()) {
      const seat = persistedSeats?.[agent.id];
      states.push({
        provider: agent.provider,
        sessionId: agent.sessionId,
        id: agent.id,
        projectName: agent.projectName,
        nameSource: agent.nameSource,
        palette: seat?.palette,
        hueShift: seat?.hueShift,
        seatId: seat?.seatId,
        agentSetting: agent.agentSetting,
        agentDescription: agent.agentDescription,
        parentAgentId: agent.parentAgentId,
        teamName: agent.teamName,
        isTeamLead: agent.isTeamLead,
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

function findPreviousAgent(provider: AgentProvider, sessionId: string): PersistedAgentState | undefined {
  return previousAgentState?.agents.find((agent) => {
    const previousProvider = agent.provider ?? "claude";
    return previousProvider === provider && agent.sessionId === sessionId;
  });
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

function forwardServerMessage(msg: ServerMessage): void {
  if (msg.type === "agentSendMessage") {
    recentSendMessages.push({ id: msg.id, toolId: msg.toolId, from: msg.from, to: msg.to, message: msg.message });
    if (recentSendMessages.length > MAX_SEND_MESSAGES) recentSendMessages.shift();
  }
  broadcast(msg);
}

function rebuildAgentPlacement(agent: TrackedAgent): void {
  broadcast({ type: "agentClosed", id: agent.id });
  broadcast({
    type: "agentCreated",
    id: agent.id,
    folderName: agent.projectName,
    parentAgentId: agent.parentAgentId,
  });
  broadcast(buildAgentRoleMessage(agent));
  if (agent.model || agent.turnCount > 0) {
    broadcast(buildAgentStatsMessage(agent));
  }
  if (agent.activeTools.size === 0) {
    broadcast({ type: "agentStatus", id: agent.id, status: "waiting" });
  }
}

function applyCodexSubagentHint(hint: { sessionId: string; parentSessionId: string; nickname?: string; role?: string }): void {
  codexSubagentHints.set(hint.sessionId, hint);

  const key = getAgentKey("codex", hint.sessionId);
  const agent = agents.get(key);
  if (!agent) return;

  let needsPlacementRebuild = false;

  if (hint.nickname) {
    const changed = agent.projectName !== hint.nickname || agent.nameSource !== "explicit";
    agent.projectName = hint.nickname;
    agent.nameSource = "explicit";
    if (changed) {
      broadcast({ type: "agentRenamed", id: agent.id, folderName: agent.projectName });
    }
  }

  if (hint.role && agent.agentSetting !== hint.role) {
    agent.agentSetting = hint.role;
    syncRoleAndBroadcast(agent);
  }

  if (!agent.parentSessionId) {
    agent.parentSessionId = hint.parentSessionId;
  }

  const parentAgent = agents.get(getAgentKey("codex", hint.parentSessionId));
  if (parentAgent && agent.parentAgentId !== parentAgent.id) {
    agent.parentAgentId = parentAgent.id;
    needsPlacementRebuild = true;
  }

  if (needsPlacementRebuild) {
    rebuildAgentPlacement(agent);
  }
}

function handleFileAdded(file: WatchedFile): void {
  const agentKey = getAgentKey(file.provider, file.sessionId);
  if (agents.has(agentKey)) return;
  lastActivityTime = Date.now();

  const prevAgent = findPreviousAgent(file.provider, file.sessionId);
  const agentId = prevAgent?.id ?? nextAgentId++;

  if (agentId >= nextAgentId) {
    nextAgentId = agentId + 1;
  }

  const codexHint = file.provider === "codex" ? codexSubagentHints.get(file.sessionId) : undefined;
  const parentSessionId = codexHint?.parentSessionId ?? file.parentSessionId;

  const agent: TrackedAgent = {
    key: agentKey,
    provider: file.provider,
    id: agentId,
    sessionId: file.sessionId,
    projectDir: file.projectDir,
    projectName: codexHint?.nickname
      ?? (file.provider === "codex" ? file.projectName : prevAgent?.projectName ?? file.projectName),
    nameSource: codexHint?.nickname ? "explicit" : prevAgent?.nameSource ?? "fallback",
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
    currentContextTokens: undefined,
    currentContextLimit: undefined,
    currentInputTokens: undefined,
    currentOutputTokens: undefined,
    currentCacheRead: undefined,
    turnCount: 0,
    totalDurationMs: 0,
    toolHistory: [],
    toolCounts: {},
    conversation: [],
  };

  if (prevAgent?.agentSetting) {
    agent.agentSetting = prevAgent.agentSetting;
  }
  if (prevAgent?.agentDescription) {
    agent.agentDescription = prevAgent.agentDescription;
  }
  if (prevAgent?.teamName) {
    agent.teamName = prevAgent.teamName;
    agent.isTeamLead = prevAgent.isTeamLead;
    // Rename team lead from "MegaBoss" to teamName
    if (agent.isTeamLead && agent.nameSource === "fallback") {
      const words = prevAgent.teamName.split(/[-_\s]+/).filter(Boolean).slice(0, 2);
      agent.projectName = (words[0] + (words[1] ? words[1][0].toUpperCase() + words[1].slice(1) : "")).slice(0, 15);
      agent.nameSource = "derived";
    }
  }
  if (prevAgent?.parentAgentId !== undefined) {
    agent.parentAgentId = prevAgent.parentAgentId;
  }

  if (parentSessionId) {
    agent.parentSessionId = parentSessionId;
    const parentAgent = agents.get(getAgentKey(file.provider, parentSessionId));
    if (parentAgent) {
      agent.parentAgentId = parentAgent.id;
    }
  }

  if (file.agentType && !agent.agentSetting) {
    agent.agentSetting = file.agentType;
  }
  if (codexHint?.role) {
    agent.agentSetting = codexHint.role;
  }
  if (file.agentDescription) {
    agent.agentDescription = file.agentDescription;
  }

  syncAgentNameAndBroadcast(agent);

  const isSubagent = !!agent.parentSessionId;
  const { displayRole } = resolveDisplayRole(agent.agentSetting, agent.agentDescription, isSubagent);
  agent.role = displayRole;

  agents.set(agent.key, agent);
  broadcast({
    type: "agentCreated",
    id: agent.id,
    folderName: agent.projectName,
    parentAgentId: agent.parentAgentId,
  });
  broadcast(buildAgentRoleMessage(agent));

  if (displayRole) {
    console.log(`[${file.provider}] Role: ${agent.agentSetting || "(none)"} -> "${displayRole}" (desc: ${agent.agentDescription || "(none)"})`);
  }

  if (prevAgent) {
    console.log(`[${file.provider}] Agent ${agent.id} rejoined: ${agent.projectName} (${file.sessionId.slice(0, 8)})${agent.parentAgentId ? ` [subagent of ${agent.parentAgentId}]` : ""}`);
  } else {
    console.log(`[${file.provider}] Agent ${agent.id} joined: ${agent.projectName} (${file.sessionId.slice(0, 8)})${agent.parentAgentId ? ` [subagent of ${agent.parentAgentId}]` : ""}`);
  }

  setTimeout(() => {
    if (agent.activeTools.size === 0) {
      agent.isWaiting = true;
      agent.activity = "waiting";
      broadcast({ type: "agentStatus", id: agent.id, status: "waiting" });
    }
  }, 1000);
}

function handleFileRemoved(file: WatchedFile): void {
  const agentKey = getAgentKey(file.provider, file.sessionId);
  const agent = agents.get(agentKey);
  if (!agent) return;

  agents.delete(agentKey);
  if (file.provider === "claude") {
    cleanupAgentParserState(agent.id);
  } else {
    cleanupCodexParserState();
  }
  broadcast({ type: "agentClosed", id: agent.id });
  // Clean up stale SendMessage events from this agent
  for (let i = recentSendMessages.length - 1; i >= 0; i--) {
    if (recentSendMessages[i].id === agent.id) recentSendMessages.splice(i, 1);
  }
  console.log(`[${file.provider}] Agent ${agent.id} left: ${agent.projectName}`);
}

function handleWatchedLine(file: WatchedFile, line: string): void {
  const agent = agents.get(getAgentKey(file.provider, file.sessionId));
  if (!agent) return;

  lastActivityTime = Date.now();
  agent.lastActivityTime = lastActivityTime;

  if (file.provider === "claude") {
    processTranscriptLine(line, agent, forwardServerMessage, onAgentStatsUpdate);
    return;
  }

  processCodexTranscriptLine(line, agent, {
    emit: forwardServerMessage,
    onStatsUpdate: onAgentStatsUpdate,
    onSubagentHint: applyCodexSubagentHint,
    resolveSessionLabel: (sessionId) => resolveSessionLabel("codex", sessionId),
  });
}

const watchers = [new JsonlWatcher(), new CodexJsonlWatcher()];
for (const watcher of watchers) {
  watcher.on("fileAdded", handleFileAdded);
  watcher.on("fileRemoved", handleFileRemoved);
  watcher.on("line", handleWatchedLine);
}

// ── GitHub Issues Pipeline Tracking ─────────────────────────────────────────
const PIPELINE_POLL_INTERVAL_MS = 60_000; // Poll every 60s
interface GateStatus { gate: number; status: string; comment: string; timestamp: string }
let cachedPipelineIssues: Array<{ number: number; title: string; labels: string[]; state: string; pipelineState: string; repo: string; gates: GateStatus[] }> = [];
const gateCache = new Map<string, { ts: number; gates: GateStatus[] }>();
const GATE_COMMENT_RE = /^\[gate (\d+)\]\[(pass|fail)\]\s*(.*)$/m;
let githubCliAvailable: boolean | null = null;

function isGitHubCliAvailable(): boolean {
  if (githubCliAvailable != null) return githubCliAvailable;
  try {
    execSync("gh --version >/dev/null 2>&1", { stdio: "ignore" });
    githubCliAvailable = true;
  } catch {
    githubCliAvailable = false;
  }
  return githubCliAvailable;
}

function normalizeLabel(label: string): string {
  return label.trim().toLowerCase();
}

function resolvePipelineState(labelNames: string[], states: GithubTaskStateConfig[]): string {
  const normalizedLabels = new Set(labelNames.map(normalizeLabel));
  for (const state of states) {
    if (state.labels.some((label) => normalizedLabels.has(normalizeLabel(label)))) {
      return state.id;
    }
  }
  return "";
}

function fetchPipelineIssues(): void {
  const cfg = getConfig();
  const githubTasks = cfg.githubTasks;

  if (!githubTasks.enabled || !isGitHubCliAvailable()) {
    if (cachedPipelineIssues.length > 0) {
      cachedPipelineIssues = [];
      broadcast({ type: "pipelineIssues", issues: [] } as any);
    }
    return;
  }

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
  const pipelineEnabled = githubTasks.pipeline.enabled;
  for (const repo of repoSet) {
    try {
      const raw = execSync(
        `gh issue list -R "${repo}" --state open --limit ${githubTasks.maxIssues} --json number,title,labels,state,body 2>/dev/null`,
        { encoding: "utf-8", timeout: 15000 }
      );
      const issues = JSON.parse(raw) as Array<{ number: number; title: string; labels: Array<{ name: string }>; state: string; body: string }>;
      for (const issue of issues) {
        const labelNames = issue.labels.map((l) => l.name);
        const pipelineState = pipelineEnabled
          ? resolvePipelineState(labelNames, githubTasks.pipeline.states)
          : "";
        allIssues.push({
          number: issue.number,
          title: issue.title,
          labels: labelNames,
          state: issue.state,
          pipelineState,
          repo: repo.split("/").pop() || repo,
          gates: [],
        });
      }
    } catch {
      // Public default should degrade quietly when gh auth or repo access is unavailable.
    }
  }

  // Parse gate comments for in-progress issues
  if (pipelineEnabled && githubTasks.pipeline.gates.length > 0) {
    for (const issue of allIssues) {
      if (issue.pipelineState !== "in_progress") continue;
      const cacheKey = `${issue.repo}/${issue.number}`;
      const cached = gateCache.get(cacheKey);
      if (cached && Date.now() - cached.ts < 30_000) {
        issue.gates = cached.gates;
        continue;
      }
      // Find full repo name (owner/repo) from repoSet
      const fullRepo = Array.from(repoSet).find(r => r.endsWith(`/${issue.repo}`)) || issue.repo;
      try {
        const raw = execSync(
          `gh api repos/${fullRepo}/issues/${issue.number}/comments --jq '[.[] | select(.body | test("^\\\\[gate ")) | {body: .body, ts: .created_at}]'`,
          { encoding: "utf-8", timeout: 10_000 }
        );
        const parsed = JSON.parse(raw) as Array<{ body: string; ts: string }>;
        const gates: GateStatus[] = [];
        for (const c of parsed) {
          const m = c.body.match(GATE_COMMENT_RE);
          if (m) {
            gates.push({ gate: parseInt(m[1], 10), status: m[2], comment: m[3].trim(), timestamp: c.ts });
          }
        }
        issue.gates = gates;
        gateCache.set(cacheKey, { ts: Date.now(), gates });
      } catch {
        /* ignore */
      }
    }
  }
  // Clean cache for issues no longer in-progress
  for (const [key] of gateCache) {
    if (!allIssues.some(i => `${i.repo}/${i.number}` === key && i.pipelineState === "in_progress")) {
      gateCache.delete(key);
    }
  }

  cachedPipelineIssues = allIssues;
  broadcast({ type: "pipelineIssues", issues: allIssues } as any);
  if (allIssues.length > 0) {
    console.log(`[Server] Fetched ${allIssues.length} pipeline issues from ${repoSet.size} repos`);
  }
}

// Initial fetch after a short delay (let agents connect first)
setTimeout(fetchPipelineIssues, 5000);
const pipelineIssuesPollTimer = setInterval(fetchPipelineIssues, PIPELINE_POLL_INTERVAL_MS);

// Start
for (const watcher of watchers) {
  watcher.start();
}

// ── Daemon Hub (multi-server aggregation) ──────────────────────────────────
const daemonHub = new DaemonHub();

// Forward remote daemon messages to all local clients
daemonHub.on("message", (msg) => {
  broadcast(msg);
});

// Start daemon connections from config
{
  const daemonConfig = getConfig();
  if (daemonConfig.daemons && daemonConfig.daemons.length > 0) {
    daemonHub.start(daemonConfig.daemons);
  }
}

function startServer(retries = 1): void {
  server.listen(PORT, () => {
    console.log(`Pixel Agents server running at http://localhost:${PORT}`);
    console.log(`Watching ~/.claude/projects and ~/.codex/sessions for active sessions...`);

    // Write PID file for daemon mode
    const pidDir = join(homedir(), ".pixel-agents");
    const pidFile = join(pidDir, ".server.pid");
    try {
      mkdirSync(pidDir, { recursive: true });
      writeFileSync(pidFile, String(process.pid));
    } catch {}

    // Resolve all team parent-child relationships after initial load
    setTimeout(() => {
      for (const [, agent] of agents) {
        resolveTeamParent(agent);
      }
      saveAgentState();
    }, 2000);
  });
  server.on("error", (err: NodeJS.ErrnoException) => {
    if (err.code === "EADDRINUSE" && retries > 0) {
      console.log(`[Server] Port ${PORT} in use, killing existing process and retrying...`);
      setTimeout(() => {
        const pids = findPidsOnPort(PORT);
        for (const pid of pids) {
          if (pid === process.pid) continue;
          try { process.kill(pid, "SIGTERM"); } catch {}
        }
        setTimeout(() => startServer(retries - 1), 1500);
      }, 500);
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
  daemonHub.stop();
  for (const watcher of watchers) {
    watcher.stop();
  }
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
    // Remove PID file
    try { unlinkSync(join(homedir(), ".pixel-agents", ".server.pid")); } catch {}
    cleanupAll();
    process.exit(0);
  });
}
