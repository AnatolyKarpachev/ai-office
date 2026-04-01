/**
 * Original addition by Sergey Gridchin, 2026.
 * Licensed under the Sergey Source-Available Noncommercial License 1.0.
 * See LICENSE-SERGEY-ADDITIONS and NOTICE.
 */

export type AgentProvider = "claude" | "codex";

export interface WatchedFile {
  provider: AgentProvider;
  path: string;
  sessionId: string;
  projectDir: string;
  projectName: string;
  offset: number;
  lineBuffer: string;
  parentSessionId?: string;
  agentType?: string;
  agentDescription?: string;
}
