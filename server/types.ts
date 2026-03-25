// Agent activity states
export type AgentActivity = "idle" | "typing" | "reading" | "waiting" | "permission";

// Tool info for speech bubbles
export interface ActiveTool {
  toolId: string;
  toolName: string;
  status: string;
}

// Agent as tracked by the server
export interface TrackedAgent {
  id: number;
  sessionId: string;
  projectDir: string;
  projectName: string;
  jsonlFile: string;
  fileOffset: number;
  lineBuffer: string;
  activity: AgentActivity;
  activeTools: Map<string, ActiveTool>;
  activeToolNames: Map<string, string>;
  activeSubagentToolIds: Map<string, Set<string>>;
  activeSubagentToolNames: Map<string, Map<string, string>>;
  isWaiting: boolean;
  permissionSent: boolean;
  hadToolsInTurn: boolean;
  lastActivityTime: number;
  // Token usage tracking
  model?: string;
  gitBranch?: string;
  cwd?: string;
  version?: string;
  totalInputTokens: number;
  totalOutputTokens: number;
  totalCacheRead: number;
  totalCacheCreation: number;
  turnCount: number;
  totalDurationMs: number;
  startTime?: string;
  // Deep inspection
  permissionMode?: string;
  toolHistory: Array<{ name: string; timestamp: string; durationMs?: number }>;
  // Role — from Claude Code's agentSetting field in JSONL
  agentSetting?: string;   // real role from Claude Code (e.g. "Explore", "Code Reviewer")
  agentDescription?: string; // description from meta.json (e.g. "Review code for security issues")
  role?: string;           // resolved = agentSetting or derived from description
  toolCounts?: Record<string, number>;  // tool name -> invocation count
  // Parent-child relationship for subagent JSONL files
  parentSessionId?: string;  // session ID of the parent agent (from file path)
  parentAgentId?: number;    // resolved numeric ID of the parent agent
}

// Messages sent from server to client via WebSocket
// Must match the upstream message format expected by useExtensionMessages
export type ServerMessage =
  | { type: "agentCreated"; id: number; folderName: string; parentAgentId?: number }
  | { type: "agentClosed"; id: number }
  | { type: "existingAgents"; agents: number[]; folderNames: Record<number, string>; agentMeta?: Record<number, { palette?: number; hueShift?: number; seatId?: string }>; parentAgentIds?: Record<number, number> }
  | { type: "agentToolStart"; id: number; toolId: string; status: string }
  | { type: "agentToolDone"; id: number; toolId: string }
  | { type: "agentToolsClear"; id: number }
  | { type: "agentStatus"; id: number; status: string }
  | { type: "agentToolPermission"; id: number }
  | { type: "agentToolPermissionClear"; id: number }
  | { type: "subagentToolStart"; id: number; parentToolId: string; toolId: string; status: string }
  | { type: "subagentToolDone"; id: number; parentToolId: string; toolId: string }
  | { type: "subagentToolPermission"; id: number; parentToolId: string }
  | { type: "subagentClear"; id: number; parentToolId: string }
  | { type: "characterSpritesLoaded"; characters: unknown[] }
  | { type: "floorTilesLoaded"; sprites: unknown[] }
  | { type: "wallTilesLoaded"; sets: unknown[] }
  | { type: "furnitureAssetsLoaded"; catalog: unknown[]; sprites: Record<string, unknown> }
  | { type: "layoutLoaded"; layout: unknown; version: number; wasReset?: boolean }
  | { type: "settingsLoaded"; soundEnabled: boolean; externalAssetDirectories: string[] }
  | { type: "externalAssetDirectoriesUpdated"; dirs: string[] }
  | { type: "agentStats"; id: number; model?: string; totalInputTokens: number; totalOutputTokens: number; totalCacheRead: number; totalCacheCreation: number; turnCount: number; totalDurationMs: number; cacheHitRate: number }
  | { type: "agentDetails"; id: number; model?: string; gitBranch?: string; cwd?: string; sessionId: string; version?: string; permissionMode?: string; toolHistory: Array<{ name: string; timestamp: string; durationMs?: number }>; tokenBreakdown: { input: number; output: number; cacheRead: number; cacheCreation: number }; turnCount: number; totalDurationMs: number; startTime?: string }
  | { type: "agentRole"; id: number; role: string; autoDetected: boolean; colors: { primary: string; badge: string } }
  | { type: "pipelineIssues"; issues: Array<{ number: number; title: string; labels: string[]; state: string; pipelineState: string; repo: string }> };

// Messages sent from client to server
export type ClientMessage =
  | { type: "ready" }
  | { type: "webviewReady" }
  | { type: "saveLayout"; layout: unknown }
  | { type: "saveAgentSeats"; seats: Record<number, { palette: number; hueShift: number; seatId: string | null }> }
  | { type: "saveSoundEnabled"; enabled: boolean }
  | { type: "addExternalAssetDirectory"; path: string }
  | { type: "removeExternalAssetDirectory"; path: string }
  | { type: "openClaude" }
  | { type: "openClaudeBypass" }
  | { type: "requestAgentDetails"; id: number }
  | { type: "setAgentRole"; id: number; role: string };
