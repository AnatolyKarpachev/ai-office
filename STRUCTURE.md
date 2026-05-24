# AI Office Repository Structure

Forked from [percheniy/office-for-claude-agents](https://github.com/percheniy/office-for-claude-agents).
Documenting actual file layout (discovered 2026-05-24).

## Backend (`server/`)

Express + WebSocket + chokidar (file watching).

| File | Responsibility |
|------|----------------|
| `server/index.ts` | Main entry — Express app, WS, port 9876 by default |
| `server/agentManager.ts` | Agent state lifecycle (active / idle / etc) |
| `server/agentPersistence.ts` | Save/load agent state to `~/.pixel-agents/` |
| `server/assetLoader.ts` | Load sprites/tilesets from `shared/assets/` |
| `server/configPersistence.ts` | App config persistence |
| `server/daemonHub.ts` | Daemon process management |
| `server/githubPoller.ts` | GitHub Issues poller (existing collector) |
| `server/layoutManager.ts` | Layout (tiles, rooms, furniture) management |
| `server/parser.ts` | Claude JSONL parser |
| `server/codexParser.ts` + `codexWatcher.ts` | Codex sessions (NOT USED, can ignore) |
| `server/platform.ts` | OS-specific helpers (open paths, find pids) |
| `server/roleDetector.ts` | Detect agent role (boss/lead) from session |
| `server/shareManager.ts` | Share-link tokens |
| `server/sourceTypes.ts` | Type defs for sources |
| `server/types.ts` | Shared backend types |
| `server/watcher.ts` | Claude JSONL files watcher (chokidar) |
| `server/wsHandler.ts` | WebSocket message handlers |
| `server/public/` | Static assets served by Express |

## Frontend (`webview-ui/src/`)

React 19 + Vite + TypeScript + Canvas 2D.

| File / Folder | Responsibility |
|---------------|----------------|
| `App.tsx` | Root component |
| `main.tsx` | Vite entry |
| `wsApi.ts` | WebSocket client |
| `constants.ts` | Shared constants |
| `notificationSound.ts` | Sound effects |
| `modelInfo.ts` | Model name → display mapping |
| `vscodeApi.ts` | VSCode integration (when running as extension) |
| **office/** | |
| `office/components/OfficeCanvas.tsx` | Main pixel canvas renderer |
| `office/components/ToolOverlay.tsx` | Layout editor overlay |
| `office/layout/tileMap.ts` | Tile grid logic |
| `office/layout/furnitureCatalog.ts` | Furniture sprites catalog |
| `office/layout/layoutSerializer.ts` | Save/load layout JSON |
| `office/sprites/spriteCache.ts` | Sprite caching |
| `office/floorTiles.ts` + `wallTiles.ts` | Tile rendering |
| `office/colorize.ts` | Color theming |
| `office/types.ts` | Layout/sprite types |
| `office/toolUtils.ts` | Editor tool utilities |
| **components/** | |
| `LeftSidebar.tsx` | Agents list |
| `RightSidebar.tsx` | Tasks / current focus |
| `BottomToolbar.tsx` | Layout editor controls |
| `ZoomControls.tsx` | Camera zoom |
| `InspectionPanel.tsx` | Agent detail panel |
| `RoleBadge.tsx` | LEAD/SPECIALIST badge rendering |
| `TokenBar.tsx` | Token usage HUD |
| `AgentLabels.tsx` | Floating labels above agents |
| `HudScreen.tsx` | HUD metrics overlay |
| `SettingsModal.tsx` | Settings dialog |
| `DebugView.tsx` | Debug overlay |
| `sidebar/AgentCard.tsx` | One agent card in sidebar |
| `sidebar/TasksList.tsx` | Tasks list per agent |
| `sidebar/AgentChat.tsx` | Agent chat history viewer |
| `sidebar/AgentEvents.tsx` | Events feed |
| **hooks/** | |
| `useAssetMessages.ts`, `useAgentMessages.ts`, `useExtensionMessages.ts` | WS message hooks |
| `useEditorActions.ts`, `useEditorKeyboard.ts` | Layout editor hooks |

## Shared Assets (`shared/assets/`)

Sprites for characters, walls, furniture, tilesets.

## Persistence Locations

- `~/.pixel-agents/config.json` — user app config
- `~/.pixel-agents/layout.json` — saved office layout
- `~/.pixel-agents/agents.json` — persisted agent state
- `~/.pixel-agents/server.log` — server logs (when running as LaunchAgent)

## Discovered Behaviors

- **start.sh is DEPRECATED** — uses LaunchAgent. We use `npm run dev` for dev mode.
- **dev:ui script** — was broken (`vite` not in PATH). Fixed to `npx vite`.
- **Server port:** 9876 (configurable via `PORT` env)
- **UI port:** 5173 (Vite default)
- **Backend auto-detects** Claude sessions in `~/.claude/projects/` and Codex sessions in `~/.codex/sessions/`
- **Agent state persistence:** found 2 prior agents on first run ("Новая жизнь", "Маркетплейс") — restored from `~/.pixel-agents/`

## i18n Status

> To be filled in during Task 1.7 audit.

## Role Hierarchy in Code

> Source: `server/roleDetector.ts` — to be flattened in Task 1.9 from MEGABOSS/BOSS/LEAD/WORKER to LEAD/SPECIALIST only.
