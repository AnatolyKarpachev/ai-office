import crypto from "crypto";

// ── Share token management ──────────────────────────────────────────────
export interface ShareToken {
  token: string;
  expiresAt: number;
  createdAt: number;
  durationMs: number;
}

const activeShareTokens = new Map<string, ShareToken>();

export function createShareToken(durationMs: number): ShareToken {
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

export function isShareTokenValid(token: string): boolean {
  const share = activeShareTokens.get(token);
  if (!share) return false;
  if (Date.now() > share.expiresAt) {
    activeShareTokens.delete(token);
    return false;
  }
  return true;
}

export function revokeShareToken(token: string): void {
  activeShareTokens.delete(token);
}

export function getActiveShareLinks(): Array<{ token: string; expiresAt: number; durationMs: number }> {
  return Array.from(activeShareTokens.values()).map((s) => ({
    token: s.token,
    expiresAt: s.expiresAt,
    durationMs: s.durationMs,
  }));
}

// Cleanup expired tokens every 60s
const shareCleanupTimer = setInterval(() => {
  const now = Date.now();
  for (const [token, share] of activeShareTokens) {
    if (now > share.expiresAt) activeShareTokens.delete(token);
  }
}, 60_000);

export function stopShareCleanup(): void {
  clearInterval(shareCleanupTimer);
}
