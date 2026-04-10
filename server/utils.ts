import { statSync, openSync, readSync, closeSync } from "fs";
import type { WatchedFile } from "./sourceTypes.js";
import { EventEmitter } from "events";

const MAX_PROJECT_NAME_LENGTH = 15;

/** Compact a name to fit within maxLen — max 2 words, proportionally shortened. */
export function compactName(name: string, maxLen: number = MAX_PROJECT_NAME_LENGTH): string {
  if (name.length <= maxLen) return name;
  const words = name.split(/[-_\s]+/).filter(Boolean);
  if (words.length === 0) return name.slice(0, maxLen);
  const w1 = words[0].toLowerCase();
  const w2 = words.length > 1 ? words[1][0].toUpperCase() + words[1].slice(1) : "";
  if ((w1 + w2).length <= maxLen) return w1 + w2;
  const total = w1.length + w2.length;
  const budget1 = Math.max(3, Math.min(w1.length, Math.floor((w1.length / total) * maxLen)));
  const budget2 = Math.max(3, maxLen - budget1);
  return w1.slice(0, budget1) + (w2 ? w2.slice(0, budget2) : "");
}

/** Read new lines from a watched file since last offset, emitting "line" events. */
export function readNewLines(file: WatchedFile, emitter: EventEmitter): void {
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
        emitter.emit("line", file, line);
      }
    }
  } catch {
    /* file may have been deleted */
  }
}
