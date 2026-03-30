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
