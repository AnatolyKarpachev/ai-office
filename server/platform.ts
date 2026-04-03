import { platform } from "os";
import { spawn, execSync } from "child_process";

export function getPlatform(): "darwin" | "linux" | "win32" | "other" {
  const p = platform();
  if (p === "darwin" || p === "linux" || p === "win32") return p;
  return "other";
}

export function openPath(path: string): void {
  const p = getPlatform();
  const cmd = p === "darwin" ? "open"
            : p === "linux" ? "xdg-open"
            : p === "win32" ? "explorer"
            : null;
  if (!cmd) return;
  const child = spawn(cmd, [path], { detached: true, stdio: "ignore" });
  child.unref();
}

export function openBrowser(url: string): void {
  const p = getPlatform();
  const cmd = p === "darwin" ? "open"
            : p === "linux" ? "xdg-open"
            : p === "win32" ? "start"
            : null;
  if (!cmd) return;
  const args = p === "win32" ? ["", url] : [url];
  const child = spawn(cmd, args, { detached: true, stdio: "ignore", shell: p === "win32" });
  child.unref();
}

export function findPidsOnPort(port: number): number[] {
  const p = getPlatform();
  try {
    if (p === "darwin") {
      const out = execSync(`lsof -t -i :${port} 2>/dev/null`, { encoding: "utf-8" }).trim();
      return out ? out.split("\n").map(Number).filter(Boolean) : [];
    } else if (p === "linux") {
      const out = execSync(`fuser ${port}/tcp 2>/dev/null`, { encoding: "utf-8" }).trim();
      return out ? out.split(/\s+/).map(Number).filter(Boolean) : [];
    } else if (p === "win32") {
      const out = execSync(`netstat -ano | findstr :${port} | findstr LISTENING`, { encoding: "utf-8" }).trim();
      const pids = new Set<number>();
      for (const line of out.split("\n")) {
        const parts = line.trim().split(/\s+/);
        const pid = parseInt(parts[parts.length - 1], 10);
        if (pid) pids.add(pid);
      }
      return Array.from(pids);
    }
  } catch { /* command not found or no matches */ }
  return [];
}
