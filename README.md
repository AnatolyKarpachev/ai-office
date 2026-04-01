# Офис для агентов Claude Code
*Office for Claude Code Agents*

Standalone pixel office for `Claude CLI` and `Claude macOS app`, with basic `Codex` agent support.

Отдельное браузерное приложение, которое превращает агентные сессии Claude в живой пиксельный офис: агенты появляются в заданной точке, собираются кластерами, тянутся друг к другу, работают за столами, отдыхают на софах и оставляют понятный след в сайдбарах.

This is a standalone browser app for Claude-powered agent sessions. Agents spawn into a pixel office, cluster around related work, sit at desks, rest on sofas when idle, and expose useful runtime context in sidebars.

![Screenshot](webview-ui/public/Screenshot.jpg)

> Based on [pablodelucca/pixel-agents](https://github.com/pablodelucca/pixel-agents) and subsequent standalone work. Upstream-origin and derivative portions remain under MIT. New Sergey-authored additions are called out separately in this repository.

## Summary
Этот проект нужен, когда вы хотите видеть не просто логи Claude, а живую карту агентной работы: кто кого вызвал, кто над чем занят, сколько токенов тратится, что обсуждают агенты между собой и какие issues сейчас активны в репозитории.

This project gives you a visual operations layer over Claude sessions: hierarchy, activity, token usage, agent-to-agent communication, and optional GitHub issue tracking.

## Features
- Кресло босса и строгая иерархия: агент, который вызвал другого агента, выше в иерархии.
- Кластерное поведение: агенты собираются рядом и визуально тянутся к связанным участникам работы.
- Левый сайдбар с агентами, их ролями, токенами, контекстом и статусами.
- Отдельный сайдбар с задачами из GitHub-репозитория.
- Настраиваемый прогресс-бар под ваш pipeline через `~/.pixel-agents/config.json`.
- Расширенный набор встроенных office assets, работающий из коробки.
- Сайдбар событий с фактом общения агентов между собой.
- Просмотр чата конкретного агента и deep inspection по double-click.
- Координата появления агентов и точка ухода учитываются в layout и рендере.
- Подсветка координат, подсветка типов ячеек и подписи агентов.
- Умное добавление имени агента по специальности.
- Если агент простаивает, он может уйти отдыхать на софу; есть pause/idle визуал.
- Soft zoom через touchpad/pinch и плавный pan по canvas.
- Базовая поддержка Codex-сессий и subagents уже есть, но это ещё early version.

## Requirements
- macOS with `Claude CLI` or `Claude macOS app`
- Node.js `20.19+`
- `npm`
- Optional: GitHub CLI `gh` for the TASKS sidebar

## Getting Started
Установка теперь идёт из корня репозитория. `webview-ui` зависимости подтягиваются автоматически на `npm install`.

```bash
npm install
npm run build
npm start
```

Откройте:

```text
http://localhost:9876
```

Open:

```text
http://localhost:9876
```

## Usage
### Claude CLI / Claude macOS app
Приложение отслеживает:

- `~/.claude/projects`
- `~/.codex/sessions`

Этого достаточно для `Claude CLI`, `Claude macOS app` и базового отображения `Codex` агентов.

### TASKS sidebar
По умолчанию TASKS работает в generic режиме:

- показывает open GitHub issues активного репозитория;
- не наследует мой личный pipeline;
- тихо деградирует, если `gh` не настроен.

Если хотите свой pipeline progress bar, добавьте конфиг в `~/.pixel-agents/config.json`:

```json
{
  "githubTasks": {
    "enabled": true,
    "maxIssues": 30,
    "pipeline": {
      "enabled": true,
      "states": [
        { "id": "todo", "label": "To Do", "color": "#fc0", "labels": ["todo", "backlog"] },
        { "id": "in_progress", "label": "In Progress", "color": "#3794ff", "labels": ["in-progress", "wip"] },
        { "id": "review_ready", "label": "Review", "color": "#a78bfa", "labels": ["review-ready"] },
        { "id": "done", "label": "Done", "color": "#5ac88c", "labels": ["done"] },
        { "id": "blocked", "label": "Blocked", "color": "#e55", "labels": ["blocked"] }
      ],
      "gates": [
        { "gate": 5, "label": "DOC" },
        { "gate": 8, "label": "PLN" },
        { "gate": 11, "label": "REV" }
      ]
    }
  }
}
```

## Layout Editor
- Export / import layout JSON
- Boss chair and role-restricted seats
- Spawn-point editing
- Coordinate highlighting
- Cell type highlighting
- Furniture placement, rotation, delete, undo/redo
- Touchpad zoom + pan for large offices

## Office Assets
Встроенные assets входят в репозиторий и достаточны для первого запуска.

Built-in assets ship with the repo and are enough for out-of-the-box use.

Дополнительные ассеты можно подключать через external asset directories. Если у вас есть коммерческие tilesets, подключайте их отдельно и локально, не коммитьте их в публичный репозиторий без лицензии.

## Tech Stack
- Node.js
- Express
- WebSocket (`ws`)
- React 19
- TypeScript
- Vite
- Canvas 2D rendering
- `gh` CLI integration for optional issue tracking

## Known Limitations
- Codex support is basic and still needs refinement.
- TASKS sidebar depends on `gh` authentication if you want live GitHub issues.
- Pipeline progress is opt-in via config and is not inferred magically.
- Claude and Codex session formats may evolve; parser updates will be needed over time.
- The app is currently macOS-first because layout import/export and some launch flows use AppleScript-based helpers.

## Star History
[![Star History Chart](https://api.star-history.com/svg?repos=percheniy/office-for-claude-agents&type=Date)](https://www.star-history.com/#percheniy/office-for-claude-agents&Date)

## Credits
- [pablodelucca/pixel-agents](https://github.com/pablodelucca/pixel-agents) by Pablo De Lucca
- Roland Ligtenberg for standalone groundwork
- Sergey Gridchin for public standalone additions, Codex support, task sidebar generalization, richer inspection, and release packaging

<details>
<summary>License</summary>

This repository contains a mixed-license codebase.

- Upstream-origin and derivative portions remain under the MIT License.
- Clearly marked Sergey-authored additions are licensed under the Sergey Source-Available Noncommercial License 1.0.
- See `NOTICE`, `LICENSE-MIT-UPSTREAM`, and `LICENSE-SERGEY-ADDITIONS` for details.

</details>
