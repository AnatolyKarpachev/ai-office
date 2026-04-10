import { execSync, execFile } from "child_process";
import { promisify } from "util";
import type { TrackedAgent, ServerMessage } from "./types.js";
import { getConfig, type GithubTaskStateConfig } from "./configPersistence.js";

const execFileAsync = promisify(execFile);

// ── GitHub Issues Pipeline Tracking ─────────────────────────────────────────

export interface GateStatus {
  gate: number;
  status: string;
  comment: string;
  timestamp: string;
}

export interface PipelineIssue {
  number: number;
  title: string;
  labels: string[];
  state: string;
  pipelineState: string;
  repo: string;
  gates: GateStatus[];
}

let cachedPipelineIssues: PipelineIssue[] = [];
const gateCache = new Map<string, { ts: number; gates: GateStatus[] }>();
const GATE_COMMENT_RE = /^\[gate (\d+)\]\[(pass|fail)\]\s*(.*)$/m;
let githubCliAvailable: boolean | null = null;
let pipelineFetchRunning = false;

export function getCachedPipelineIssues(): PipelineIssue[] {
  return cachedPipelineIssues;
}

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

async function ghExec(args: string[], options?: { cwd?: string; timeout?: number }): Promise<string> {
  const { stdout } = await execFileAsync("gh", args, {
    encoding: "utf-8",
    timeout: options?.timeout ?? 10_000,
    cwd: options?.cwd,
    env: { ...process.env, GH_NO_UPDATE_NOTIFIER: "1" },
  });
  return stdout.trim();
}

export async function fetchPipelineIssues(
  agents: Map<string, TrackedAgent>,
  broadcast: (msg: ServerMessage) => void,
): Promise<void> {
  if (pipelineFetchRunning) return;
  pipelineFetchRunning = true;

  try {
    const cfg = getConfig();
    const githubTasks = cfg.githubTasks;

    if (!githubTasks.enabled || !isGitHubCliAvailable()) {
      if (cachedPipelineIssues.length > 0) {
        cachedPipelineIssues = [];
        broadcast({ type: "pipelineIssues", issues: [] } as any);
      }
      return;
    }

    // Get unique repo names from active agents' project directories (parallel)
    const repoSet = new Set<string>();
    const repoDetectPromises = Array.from(agents.values()).map(async (agent) => {
      try {
        const result = await ghExec(
          ["repo", "view", "--json", "nameWithOwner", "-q", ".nameWithOwner"],
          { cwd: agent.projectDir, timeout: 10_000 },
        );
        if (result) repoSet.add(result);
      } catch { /* not a git repo or gh not available */ }
    });
    await Promise.all(repoDetectPromises);

    // Fallback: if no repos detected, try listing user repos
    if (repoSet.size === 0) {
      try {
        const result = await ghExec(
          ["repo", "list", "--json", "nameWithOwner", "-q", ".[].nameWithOwner", "--limit", "10"],
          { timeout: 15_000 },
        );
        if (result) {
          for (const r of result.split("\n").filter(Boolean)) repoSet.add(r);
        }
      } catch { /* gh not available */ }
    }

    const allIssues: PipelineIssue[] = [];
    const pipelineEnabled = githubTasks.pipeline.enabled;

    // Fetch issues from all repos in parallel
    const issuePromises = Array.from(repoSet).map(async (repo) => {
      try {
        const raw = await ghExec(
          ["issue", "list", "-R", repo, "--state", "open", "--limit", String(githubTasks.maxIssues), "--json", "number,title,labels,state,body"],
          { timeout: 15_000 },
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
        // Degrade quietly when gh auth or repo access is unavailable.
      }
    });
    await Promise.all(issuePromises);

    // Parse gate comments for in-progress issues (parallel)
    if (pipelineEnabled && githubTasks.pipeline.gates.length > 0) {
      const gatePromises = allIssues
        .filter((issue) => issue.pipelineState === "in_progress")
        .map(async (issue) => {
          const cacheKey = `${issue.repo}/${issue.number}`;
          const cached = gateCache.get(cacheKey);
          if (cached && Date.now() - cached.ts < 30_000) {
            issue.gates = cached.gates;
            return;
          }
          const fullRepo = Array.from(repoSet).find((r) => r.endsWith(`/${issue.repo}`)) || issue.repo;
          try {
            const raw = await ghExec(
              ["api", `repos/${fullRepo}/issues/${issue.number}/comments`, "--jq", '[.[] | select(.body | test("^\\\\[gate ")) | {body: .body, ts: .created_at}]'],
              { timeout: 10_000 },
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
        });
      await Promise.all(gatePromises);
    }

    // Clean cache for issues no longer in-progress
    for (const [key] of gateCache) {
      if (!allIssues.some((i) => `${i.repo}/${i.number}` === key && i.pipelineState === "in_progress")) {
        gateCache.delete(key);
      }
    }

    cachedPipelineIssues = allIssues;
    broadcast({ type: "pipelineIssues", issues: allIssues } as any);
    if (allIssues.length > 0) {
      console.log(`[Server] Fetched ${allIssues.length} pipeline issues from ${repoSet.size} repos`);
    }
  } finally {
    pipelineFetchRunning = false;
  }
}

// ── Polling lifecycle ─────────────────────────────────────────────────────

const PIPELINE_POLL_INTERVAL_MS = 60_000;
let pollTimer: ReturnType<typeof setInterval> | null = null;
let initialTimer: ReturnType<typeof setTimeout> | null = null;

export function startPolling(
  agents: Map<string, TrackedAgent>,
  broadcast: (msg: ServerMessage) => void,
): void {
  // Initial fetch after a short delay (let agents connect first)
  initialTimer = setTimeout(() => { fetchPipelineIssues(agents, broadcast).catch(() => {}); }, 5000);
  pollTimer = setInterval(() => { fetchPipelineIssues(agents, broadcast).catch(() => {}); }, PIPELINE_POLL_INTERVAL_MS);
}

export function stopPolling(): void {
  if (initialTimer) clearTimeout(initialTimer);
  if (pollTimer) clearInterval(pollTimer);
  initialTimer = null;
  pollTimer = null;
}
