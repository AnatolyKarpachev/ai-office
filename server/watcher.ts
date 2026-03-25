import { watch } from "chokidar";
import { statSync, readdirSync, openSync, readSync, closeSync, readFileSync } from "fs";
import { join, basename, dirname } from "path";
import { homedir } from "os";
import { EventEmitter } from "events";

const CLAUDE_PROJECTS_DIR = join(homedir(), ".claude", "projects");
const ACTIVE_THRESHOLD_MS = 300_000; // 5 minutes — dead sessions drop quickly, re-added on new writes
const POLL_INTERVAL_MS = 1000;

export interface WatchedFile {
  path: string;
  sessionId: string;
  projectName: string;
  offset: number;
  lineBuffer: string;
  /** If this is a subagent file, the parent session's ID (extracted from path) */
  parentSessionId?: string;
  /** agentType read from the companion meta.json file */
  agentType?: string;
  /** description read from the companion meta.json file */
  agentDescription?: string;
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
      const parts = projectDirName.split("-").filter(Boolean);
      projectName = parts[parts.length - 1] || sessionId.slice(0, 8);

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
    } else {
      const projectDirName = parentDirName;
      // Extract short project name: "-Users-alice-Documents-myproject-657" -> "657"
      const parts = projectDirName.split("-").filter(Boolean);
      projectName = parts[parts.length - 1] || sessionId.slice(0, 8);
    }

    const file: WatchedFile = {
      path: filePath,
      sessionId,
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
