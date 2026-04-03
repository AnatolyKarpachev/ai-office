// WebSocket API — replaces VS Code postMessage bridge
function getWsBase(): string {
  if (import.meta.env.DEV) return "ws://localhost:9876";
  const proto = window.location.protocol === "https:" ? "wss:" : "ws:";
  // Strip /share/TOKEN from pathname to get base path
  const basePath = window.location.pathname
    .replace(/\/share\/[^/]+$/, "")
    .replace(/\/$/, "");
  return `${proto}//${window.location.host}${basePath}`;
}

const WS_BASE = getWsBase();

function getShareToken(): string | null {
  const match = window.location.pathname.match(/\/share\/([a-f0-9]+)$/);
  return match ? match[1] : null;
}

export function isShareMode(): boolean {
  return getShareToken() !== null;
}

let ws: WebSocket | null = null;
let reconnectTimer: ReturnType<typeof setTimeout> | null = null;

export function connectWebSocket(): void {
  const token = getShareToken();
  const wsUrl = token ? `${WS_BASE}?share=${token}` : WS_BASE;
  ws = new WebSocket(wsUrl);

  ws.onopen = () => {
    console.log("Connected to pixel-agents server");
    ws?.send(JSON.stringify({ type: "webviewReady" }));
  };

  ws.onmessage = (event) => {
    // Dispatch as window message to match upstream useExtensionMessages hook
    const data = JSON.parse(event.data);
    window.dispatchEvent(new MessageEvent("message", { data }));
  };

  ws.onclose = () => {
    console.log("Disconnected, reconnecting in 2s...");
    reconnectTimer = setTimeout(connectWebSocket, 2000);
  };

  ws.onerror = () => ws?.close();
}

export function sendMessage(msg: unknown): void {
  if (ws?.readyState === WebSocket.OPEN) {
    ws.send(JSON.stringify(msg));
  }
}

export function cleanup(): void {
  if (reconnectTimer) clearTimeout(reconnectTimer);
  ws?.close();
}
