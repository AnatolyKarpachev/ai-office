import { existsSync, readFileSync, writeFileSync, mkdirSync, renameSync } from "fs";
import { join } from "path";
import type { TrackedAgent, ServerMessage } from "./types.js";
import type { AgentProvider } from "./sourceTypes.js";
import { cleanupAgentParserState } from "./parser.js";

// ── Persisted agent state ─────────────────────────────────────────────────

export interface PersistedAgentState {
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

interface PersistedState {
  agents: PersistedAgentState[];
  nextAgentId: number;
  savedAt?: number;
}

export function saveAgentState(
  agentStatePath: string,
  persistDir: string,
  agents: Map<string, TrackedAgent>,
  nextAgentId: number,
  persistedSeats: Record<number, { palette: number; hueShift: number; seatId: string | null }> | null,
): void {
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

export function loadAgentState(agentStatePath: string): PersistedState | null {
  if (!existsSync(agentStatePath)) return null;
  try {
    const content = readFileSync(agentStatePath, "utf-8");
    return JSON.parse(content);
  } catch {
    return null;
  }
}

export function findPreviousAgent(
  previousState: PersistedState | null,
  provider: AgentProvider,
  sessionId: string,
): PersistedAgentState | undefined {
  return previousState?.agents.find((agent) => {
    const previousProvider = agent.provider ?? "claude";
    return previousProvider === provider && agent.sessionId === sessionId;
  });
}

// ── Auto-suspend idle subagents ─────────────────────────────────────────

const SUBAGENT_AUTO_SUSPEND_MS = 600_000; // 10 minutes

export function startSubagentAutoSuspend(
  agents: Map<string, TrackedAgent>,
  broadcast: (msg: ServerMessage) => void,
  recentSendMessages: Array<{ id: number; [key: string]: unknown }>,
  suspendFile: (path: string) => void,
): ReturnType<typeof setInterval> {
  return setInterval(() => {
    const now = Date.now();
    for (const [key, agent] of agents) {
      const isSubagent = !!(agent.parentSessionId || agent.parentAgentId);
      if (!isSubagent || agent.isTeamLead) continue;
      if (agent.activity !== "waiting" && agent.activity !== "idle") continue;
      if (now - agent.lastActivityTime >= SUBAGENT_AUTO_SUSPEND_MS) {
        console.log(`[auto-suspend] Closing idle subagent ${agent.id} (${agent.projectName}) — idle ${Math.round((now - agent.lastActivityTime) / 60000)}m`);
        agents.delete(key);
        cleanupAgentParserState(agent.id);
        broadcast({ type: "agentClosed", id: agent.id });
        for (let i = recentSendMessages.length - 1; i >= 0; i--) {
          if (recentSendMessages[i].id === agent.id) recentSendMessages.splice(i, 1);
        }
        suspendFile(agent.jsonlFile);
      }
    }
  }, 60_000);
}
