import { watch } from "chokidar";
import { statSync, readdirSync, openSync, readSync, closeSync, readFileSync } from "fs";
import { join, basename, dirname } from "path";
import { homedir } from "os";
import { EventEmitter } from "events";
import type { WatchedFile } from "./sourceTypes.js";

const CLAUDE_PROJECTS_DIR = join(homedir(), ".claude", "projects");
const ACTIVE_THRESHOLD_MS = 300_000; // 5 minutes — dead sessions drop quickly, re-added on new writes
const POLL_INTERVAL_MS = 1000;

const MAX_PROJECT_NAME_LENGTH = 15;

/**
 * Extract a human-readable project name from the Claude projects directory name.
 * - Worktree ISSUE-378 → "#378"
 * - Home dir only (no project) → "" (empty)
 * - Named worktree → worktree name
 */
function extractProjectName(projectDirName: string): string {
  const worktreeSep = "--claude-worktrees-";
  const worktreeIdx = projectDirName.indexOf(worktreeSep);

  if (worktreeIdx !== -1) {
    const worktreeName = projectDirName.slice(worktreeIdx + worktreeSep.length);
    const issueMatch = worktreeName.match(/^ISSUE-(\d+)$/);
    if (issueMatch) {
      return `#${issueMatch[1]}`;
    }
    // Named worktree like "flamboyant-mestorf"
    return truncateName(worktreeName);
  }

  // Check if this is just the home directory (e.g., "-Users-grid")
  const parts = projectDirName.split("-").filter(Boolean);
  if (parts.length <= 2 && parts[0] === "Users") {
    return "MegaBoss";
  }

  return "";
}

/** Compact a name to fit within maxLen using camelCase (no dashes). */
function compactName(name: string, maxLen: number): string {
  if (name.length <= maxLen) return name;
  const words = name.split(/[-_\s]+/).filter(Boolean);
  if (words.length === 0) return name.slice(0, maxLen);

  const camel = words[0] + words.slice(1).map(w => w[0].toUpperCase() + w.slice(1)).join("");
  if (camel.length <= maxLen) return camel;

  const shortened = words.slice();
  for (let iter = 0; iter < 50; iter++) {
    const result = shortened[0] + shortened.slice(1).map(w => w[0].toUpperCase() + w.slice(1)).join("");
    if (result.length <= maxLen) return result;
    let maxWord = 0, maxWordLen = 0;
    for (let i = 0; i < shortened.length; i++) {
      if (shortened[i].length > maxWordLen) { maxWordLen = shortened[i].length; maxWord = i; }
    }
    if (maxWordLen <= 3) break;
    shortened[maxWord] = shortened[maxWord].slice(0, Math.max(3, maxWordLen - 1));
  }
  const result = shortened[0] + shortened.slice(1).map(w => w[0].toUpperCase() + w.slice(1)).join("");
  return result.slice(0, maxLen);
}

function truncateName(name: string): string {
  return compactName(name, MAX_PROJECT_NAME_LENGTH);
}

export class JsonlWatcher extends EventEmitter {
  private files = new Map<string, WatchedFile>();
  private watcher: ReturnType<typeof watch> | null = null;
  private pollInterval: ReturnType<typeof setInterval> | null = null;

  start(): void {
    this.scanForActiveFiles();

    this.watcher = watch(CLAUDE_PROJECTS_DIR, {
      ignoreInitial: true,
      depth: 5, // Need depth 5 to catch subagent files: projectDir/sessionId/subagents/agent.jsonl
    });

    this.watcher.on("add", (filePath: string) => {
      if (filePath.endsWith(".jsonl")) {
        this.addFile(filePath);
      }
    });

    // Re-add previously dropped files when they get new writes
    this.watcher.on("change", (filePath: string) => {
      if (filePath.endsWith(".jsonl") && !this.files.has(filePath)) {
        this.addFile(filePath);
      }
    });

    this.pollInterval = setInterval(() => this.pollFiles(), POLL_INTERVAL_MS);
  }

  stop(): void {
    this.watcher?.close();
    if (this.pollInterval) clearInterval(this.pollInterval);
  }

  private scanForActiveFiles(): void {
    try {
      const dirs = readdirSync(CLAUDE_PROJECTS_DIR, { withFileTypes: true });
      for (const dir of dirs) {
        if (!dir.isDirectory()) continue;
        const dirPath = join(CLAUDE_PROJECTS_DIR, dir.name);
        try {
          const files = readdirSync(dirPath);
          for (const f of files) {
            if (!f.endsWith(".jsonl")) continue;
            const filePath = join(dirPath, f);
            const stat = statSync(filePath);
            if (Date.now() - stat.mtimeMs < ACTIVE_THRESHOLD_MS) {
              this.addFile(filePath);
            }
          }
          // Also scan session-level subagents/ directories
          // Structure: {projectDir}/{sessionId}/subagents/agent-{agentId}.jsonl
          for (const f of files) {
            const sessionDirPath = join(dirPath, f);
            try {
              const sessionStat = statSync(sessionDirPath);
              if (!sessionStat.isDirectory()) continue;
              const subagentsDir = join(sessionDirPath, "subagents");
              try {
                const subFiles = readdirSync(subagentsDir);
                for (const sf of subFiles) {
                  if (!sf.endsWith(".jsonl")) continue;
                  const subFilePath = join(subagentsDir, sf);
                  const subStat = statSync(subFilePath);
                  if (Date.now() - subStat.mtimeMs < ACTIVE_THRESHOLD_MS) {
                    this.addFile(subFilePath);
                  }
                }
              } catch {
                /* subagents dir may not exist */
              }
            } catch {
              /* skip non-directories */
            }
          }
        } catch {
          /* skip unreadable dirs */
        }
      }
    } catch {
      /* projects dir may not exist */
    }
  }

  private addFile(filePath: string): void {
    if (this.files.has(filePath)) return;

    const sessionId = basename(filePath, ".jsonl");
    const parentDir = dirname(filePath);
    const parentDirName = basename(parentDir);

    // Detect subagent files: {projectDir}/{parentSessionId}/subagents/agent-{agentId}.jsonl
    let parentSessionId: string | undefined;
    let agentType: string | undefined;
    let description: string | undefined;
    let projectName: string;

    if (parentDirName === "subagents") {
      // This is a subagent file
      const sessionDir = dirname(parentDir); // {projectDir}/{parentSessionId}
      parentSessionId = basename(sessionDir); // parentSessionId
      const projectDirName = basename(dirname(sessionDir)); // project dir name

      // Try to read companion meta.json for agentType and description
      const metaJsonPath = filePath.replace(/\.jsonl$/, ".meta.json");
      try {
        const metaContent = readFileSync(metaJsonPath, "utf-8");
        const meta = JSON.parse(metaContent);
        if (typeof meta.agentType === "string") {
          agentType = meta.agentType;
        }
        if (typeof meta.description === "string") {
          description = meta.description;
        }
      } catch {
        /* meta.json may not exist */
      }

      // For subagents: use description from meta.json if available, otherwise directory-based name
      // (agentType is used for the role badge, not the display name)
      const rawName = description || extractProjectName(projectDirName);
      projectName = truncateName(rawName);
    } else {
      projectName = extractProjectName(parentDirName);
    }

    const file: WatchedFile = {
      provider: "claude",
      path: filePath,
      sessionId,
      projectDir: dirname(filePath),
      projectName,
      offset: 0,
      lineBuffer: "",
      parentSessionId,
      agentType,
      agentDescription: description,
    };

    this.files.set(filePath, file);
    this.emit("fileAdded", file);

    // Read existing content to catch up
    this.readNewLines(file);
  }

  private pollFiles(): void {
    for (const [path, file] of this.files) {
      try {
        const stat = statSync(path);
        if (stat.size > file.offset) {
          this.readNewLines(file);
        }
        // Remove stale files
        if (Date.now() - stat.mtimeMs > ACTIVE_THRESHOLD_MS) {
          this.files.delete(path);
          this.emit("fileRemoved", file);
        }
      } catch {
        this.files.delete(path);
        this.emit("fileRemoved", file);
      }
    }
  }

  private readNewLines(file: WatchedFile): void {
    try {
      const stat = statSync(file.path);
      if (stat.size <= file.offset) return;

      const buf = Buffer.alloc(stat.size - file.offset);
      const fd = openSync(file.path, "r");
      readSync(fd, buf, 0, buf.length, file.offset);
      closeSync(fd);

      file.offset = stat.size;
      const text = file.lineBuffer + buf.toString("utf-8");
      const lines = text.split("\n");

      // Last element is incomplete line (buffer it)
      file.lineBuffer = lines.pop() || "";

      for (const line of lines) {
        if (line.trim()) {
          this.emit("line", file, line);
        }
      }
    } catch {
      /* file may have been deleted */
    }
  }

  getActiveFiles(): WatchedFile[] {
    return Array.from(this.files.values());
  }
}
