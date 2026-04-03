<h1>Визуализация ИИ агентов Claude и Codex в real time</h1>
<p><em>Office for visualization Claude Code Agents</em></p>
<p align="center">
  <img src="docs/images/main_picture_agent_visualization.png" width="980" alt="Главный экран визуализации агентов" />
</p>
YouTube: <a href="https://www.youtube.com/watch?v=seJ8nwOdRYA" target="_blank">https://www.youtube.com/watch?v=seJ8nwOdRYA</a>

<p>Пиксельный офис <code>Claude CLI</code>, <code>Claude macOS app</code>, with basic <code>Codex</code> agent support.</p>

<p>Real-time визуализация агентов Claude и Codex: кто появился в офисе, кто кого вызвал, кто над чем работает, кто простаивает, сколько токенов сгорает и как между собой общаются агенты прямо во время сессии.</p>

<p>Отдельное браузерное приложение, которое превращает агентные сессии Claude в живой пиксельный офис: агенты появляются в заданной точке, собираются кластерами, тянутся друг к другу, работают за столами, отдыхают на софах и оставляют понятный "бумажный след" в сайдбарах. Не требует API, использует ваш аккаунт. Никаких дополнительных расходов на токены. </p>

<p>This is a standalone browser app for Claude-powered agent sessions. Agents spawn into a pixel office, cluster around related work, sit at desks, rest on sofas when idle, and expose useful runtime context in sidebars. Does not require an API, uses your account. No extra token costs.</p>


<h2>Summary</h2>

<p>Когда вы хотите видеть живую карту работы ИИ агентов: кто кого вызвал, кто над чем занят, сколько токенов тратится, что обсуждают агенты между собой и какие issues сейчас активны в репозитории.</p>

<p>This project gives you a visual operations layer over Claude sessions: hierarchy, activity, token usage, agent-to-agent communication, and optional GitHub issue tracking.</p>

<h2>Visual Overview</h2>

<p>Главная идея интерфейса: не просто список сессий, а живая карта офиса, где видно иерархию, кластеры, события, точки спавна, ожидание апрува и отдельные каналы общения между агентами.</p>

<p>The UI is built as a live office map instead of a terminal log dump: hierarchy, clustering, communication, approval waits, spawn points, and sidebars are visible at a glance.</p>

<h3>Main office</h3>

<p align="left">
  <img src="docs/images/big_office_for_thousand_agents.png" width="920" alt="Большой офис" />
</p>

<h3>Boss seat</h3>

<p align="left">
  <img src="docs/images/boss_chair.png" width="520" alt="Кресло босса" />
</p>

<h3>Hierarchy</h3>

<p align="left">
  <img src="docs/images/hierarchy_of_agents.png" width="260" alt="Иерархия агентов" />
</p>

<h3>Grouping by clusters </h3>
<p align="left">
  <img src="docs/images/grouping_by_cluster.png"  width="260" alt="Кластеризация агентов" />
</p>

<h3>Communication tracking </h3>

<p align="left">
  <img src="docs/images/communication_between_agents.png" width="260" alt="Общение между агентами" />
</p>

<h3>Events</h3>

<p align="left">
  <img src="docs/images/events_tracking.png" width="260" alt="Трекинг событий" />
</p>

<h3>Approvals alerts</h3>

<p align="left">
  <img src="docs/images/show_waiting_for_approval_from_agents.png" width="340" alt="Ожидание подтверждения действий" />
</p>

<h3>Spawn position</h3>
  
<p align="left">
  <img src="docs/images/spawn_position_setup.png" width="560" alt="Настройка точки появления" />
</p>

<h3>Import/export for sharing</h3>

<p align="left">
  <img src="docs/images/impor_export_layout.png" width="560" alt="Импорт и экспорт layout" />
</p>

<h3>Extra Assets </h3>
<p align="left">
  <img src="docs/images/extra_assets.png" width="560" alt="Расширенный набор ассетов" />
</p>

<h3>Codex support</h3>

<p align="left">
  <img src="docs/images/codex_support.png" width="260" alt="Поддержка Codex" />
</p>

<p align="left">
  <img src="docs/images/codex_support1.png" width="560" alt="Поддержка Codex, дополнительный пример" />
</p>

<h3>HUD — Метрики агентов / Agent Metrics Dashboard</h3>

<p align="left">
  <img src="docs/images/hud_metrics.png" width="920" alt="HUD — сводка метрик агентов" />
</p>

<p>Полноэкранная панель метрик: токены, стоимость, cache hit rate, context usage на каждого агента. Сортировка по любому столбцу. Предупреждения о bottleneck (низкий cache hit, высокий context fill).</p>

<p>Full-screen metrics panel: tokens, cost estimates, cache hit rates, context usage per agent. Sort by any column. Bottleneck warnings for low cache hit and high context usage.</p>

<h3>Idle activities: sofa, coffee, smoking</h3>

<p align="left">
  <img src="docs/images/smoking_agent.png" width="400" alt="Курящий агент" />
</p>

<p>Простаивающие агенты выбирают одну из трёх активностей (33% каждая): отдых на софе, кофе у кулера или перекур. Каждая активность со своим спрайтом и анимацией.</p>

<p>Idle agents pick one of three activities (33% each): sofa rest, coffee at the cooler, or a smoke break. Each has its own sprite and animation.</p>

<h3>Визуализация команд / Team Visualization</h3>

<p align="left">
  <img src="docs/images/team_clusters.png" width="560" alt="Team Clusters — подсветка команд тайлами" />
</p>

<p>Кнопка "Show teams" рисует тайловые области с заливкой и сплошной толстой границей по внешнему периметру кластера. Автоматически определяет иерархию через цепочку parentAgentId. Convex hull объединяет всех участников команды в одну область.</p>

<p>"Show teams" button draws tile-based cluster areas with solid thick perimeter borders. Auto-detects hierarchy via parentAgentId chain. Convex hull unifies all team members into a single connected region.</p>

<h3>Трансляция офиса / Share Office</h3>

<p align="left">
  <img src="docs/images/share_office.png" width="560" alt="Share Office — временная ссылка для трансляции" />
</p>

<p>Кнопка Share генерирует временную ссылку (10 или 60 минут) для друзей и коллег. Режим "только просмотр": без кнопок управления, без Tasks. Поддержка публичного URL через SSH tunnel + relay сервер. На мобильных устройствах показывает уведомление "отображение доступно только с desktop".</p>

<p>Share button generates a temporary link (10 or 60 minutes) for friends and colleagues. Read-only spectator mode: no admin controls, no Tasks sidebar. Public URL support via SSH tunnel + relay server. Mobile devices see a "desktop only" notice.</p>

<h3>Уведомления / Desktop Notifications</h3>

<p>Браузерные уведомления при запросе разрешения, завершении задачи, появлении нового агента. Включается в Settings.</p>

<p>Browser notifications on permission request, task completion, new agent spawn. Toggle in Settings.</p>

<h3>Multi-Daemon (экспериментально / experimental)</h3>

<p>Подключение к удалённым серверам pixel-agents. Единый офис с namespace агентов. Настраивается через <code>~/.pixel-agents/config.json</code>.</p>

<p>Connect to remote pixel-agents servers. Unified office view with agent ID namespacing. Configured via <code>~/.pixel-agents/config.json</code>.</p>

<h3>Кроссплатформенность / Cross-Platform</h3>

<p>Работает на macOS, Linux, Windows. AppleScript заменён на кроссплатформенные утилиты.</p>

<p>Works on macOS, Linux, Windows. Replaced AppleScript with platform-agnostic utilities.</p>

<h2>Features</h2>

<ul>
  <li>Кресло босса: его может занять только BOSS/MEGABOSS агент. Lead и остальные садятся на обычные места.</li>
  <li>Строгая иерархия: агент, который вызвал другого агента, выше в иерархии.</li>
  <li>Кластерное поведение: агенты собираются рядом и визуально тянутся к связанным участникам работы.</li>
  <li>Левый сайдбар с агентами, их ролями, токенами, контекстом и статусами.</li>
  <li>Отдельный сайдбар с задачами из GitHub-репозитория.</li>
  <li>Расширенный пак предметов.</li>
  <li>Настраиваемый прогресс-бар под ваш pipeline через <code>~/.pixel-agents/config.json</code>.</li>
  <li>Расширенный набор встроенных office assets, работающий из коробки.</li>
  <li>Сайдбар событий с фактом общения агентов между собой.</li>
  <li>Просмотр чата конкретного агента и deep inspection по double-click.</li>
  <li>Координата появления агентов и точка ухода учитываются в layout и рендере.</li>
  <li>Подсветка координат, подсветка типов ячеек и подписи агентов.</li>
  <li>Умное добавление имени агента по специальности.</li>
  <li>Если агент простаивает, он может уйти на софу, пить кофе или курить (33/33/33); каждая активность со своим спрайтом и анимацией.</li>
  <li>Soft zoom через touchpad/pinch и плавный pan по canvas.</li>
  <li>Кнопка Fit — авто-масштаб офиса между сайдбарами.</li>
  <li>Базовая поддержка Codex-сессий и subagents уже есть, но это ещё early version.</li>
</ul>

<h2>Requirements</h2>

<ul>
  <li><code>Claude CLI</code> or <code>Claude macOS app</code> (macOS, Linux, Windows)</li>
  <li>Node.js <code>20.19+</code></li>
  <li><code>npm</code></li>
  <li>Optional: GitHub CLI <code>gh</code> for the TASKS sidebar</li>
</ul>

<h2>Getting Started</h2>

<p>Одна команда — и офис запущен:</p>

<p>One command — office is running:</p>

<pre><code class="language-bash">npx office-for-claude-agents
</code></pre>

<p>Автоматически установит зависимости, соберёт проект и откроет браузер на <code>http://localhost:9876</code>.</p>

<p>Automatically installs dependencies, builds the project, and opens the browser at <code>http://localhost:9876</code>.</p>

<details>
  <summary>Из исходников / From source</summary>

<pre><code class="language-bash">git clone https://github.com/percheniy/office-for-claude-agents.git \
  &amp;&amp; cd office-for-claude-agents \
  &amp;&amp; npm install \
  &amp;&amp; npm start
</code></pre>
</details>

<p>Откройте:</p>

<pre><code>http://localhost:9876
</code></pre>

<p>Open:</p>

<pre><code>http://localhost:9876
</code></pre>

<p>На первом запуске приложение само создаёт <code>~/.pixel-agents/layout.json</code> из bundled default layout, который уже включён в репозиторий.</p>

<p>On first launch the app writes <code>~/.pixel-agents/layout.json</code> from the bundled default office layout that already ships in this repository.</p>

<p>Источники сессий ищутся автоматически в стандартных директориях <code>~/.claude/projects</code>, <code>~/.codex/sessions</code> и <code>~/.codex/archived_sessions</code>. Если у вас кастомные пути, можно переопределить их через <code>PIXEL_AGENTS_CLAUDE_PROJECTS_DIR</code>, <code>PIXEL_AGENTS_CODEX_SESSIONS_DIR</code>, <code>PIXEL_AGENTS_CODEX_ARCHIVED_SESSIONS_DIR</code> или через <code>~/.pixel-agents/config.json</code>.</p>

<p>The app auto-detects the standard session roots at <code>~/.claude/projects</code>, <code>~/.codex/sessions</code>, and <code>~/.codex/archived_sessions</code>. If your setup uses custom locations, override them with <code>PIXEL_AGENTS_CLAUDE_PROJECTS_DIR</code>, <code>PIXEL_AGENTS_CODEX_SESSIONS_DIR</code>, <code>PIXEL_AGENTS_CODEX_ARCHIVED_SESSIONS_DIR</code>, or <code>~/.pixel-agents/config.json</code>.</p>

<h2>Usage</h2>

<h3>Claude CLI / Claude macOS app</h3>

<p>Приложение отслеживает:</p>

<ul>
  <li><code>~/.claude/projects</code></li>
  <li><code>~/.codex/sessions</code></li>
  <li><code>~/.codex/archived_sessions</code> for archived Codex threads</li>
</ul>

<p>Этого достаточно для <code>Claude CLI</code>, <code>Claude macOS app</code> и базового отображения <code>Codex</code> агентов.</p>

<p>Если стандартные папки отсутствуют, приложение всё равно стартует и явно покажет в левом сайдбаре, какие пути проверялись и чем их переопределить.</p>

<pre><code class="language-json">{
  "sessionSources": {
    "claudeProjectsDir": "/absolute/path/to/claude/projects",
    "codexSessionsDir": "/absolute/path/to/codex/sessions",
    "codexArchivedSessionsDir": "/absolute/path/to/codex/archived_sessions"
  }
}
</code></pre>

<h3>TASKS sidebar</h3>

<p>По умолчанию TASKS работает в generic режиме:</p>

<ul>
  <li>показывает open GitHub issues активного репозитория;</li>
  <li>не наследует мой личный pipeline;</li>
  <li>тихо деградирует, если <code>gh</code> не настроен.</li>
</ul>

<p>Если хотите свой pipeline progress bar, добавьте конфиг в <code>~/.pixel-agents/config.json</code>:</p>

<pre><code class="language-json">{
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
</code></pre>

<h2>Layout Editor</h2>

<ul>
  <li>Export / import layout JSON</li>
  <li>Boss chair and role-restricted seats</li>
  <li>Spawn-point editing</li>
  <li>Coordinate highlighting</li>
  <li>Cell type highlighting</li>
  <li>Furniture placement, rotation, delete, undo/redo</li>
  <li>Touchpad zoom + pan for large offices</li>
</ul>

<h2>Office Assets</h2>

<p>Встроенные assets входят в репозиторий и достаточны для первого запуска.</p>

<p>Built-in assets ship with the repo and are enough for out-of-the-box use.</p>

<p>Основной встроенный набор лежит в <code>webview-ui/public/assets</code>: characters, floors, walls, furniture manifests, sprites и bundled default layout.</p>

<p>The main built-in pack lives in <code>webview-ui/public/assets</code>: characters, floors, walls, furniture manifests, sprites, and the bundled default layout.</p>

<p>Дополнительные ассеты можно подключать через external asset directories. Если у вас есть коммерческие tilesets, подключайте их отдельно и локально, не коммитьте их в публичный репозиторий без лицензии.</p>

<h2>Tech Stack</h2>

<ul>
  <li>Node.js</li>
  <li>Express</li>
  <li>WebSocket (<code>ws</code>)</li>
  <li>React 19</li>
  <li>TypeScript</li>
  <li>Vite</li>
  <li>Canvas 2D rendering</li>
  <li><code>gh</code> CLI integration for optional issue tracking</li>
</ul>

<h2>Known Limitations</h2>

<ul>
  <li>Codex support is basic and still needs refinement.</li>
  <li>TASKS sidebar depends on <code>gh</code> authentication if you want live GitHub issues.</li>
  <li>Pipeline progress is opt-in via config and is not inferred magically.</li>
  <li>Claude and Codex session formats may evolve; parser updates will be needed over time.</li>
  <li>Share links require an SSH tunnel to a public server for external access; tokens are stored in memory and reset on server restart.</li>
</ul>

<h2>Star History</h2>

<a href="https://www.star-history.com/?repos=percheniy%2Foffice-for-claude-agents&type=date&legend=top-left">
 <picture>
   <source media="(prefers-color-scheme: dark)" srcset="https://api.star-history.com/image?repos=percheniy/office-for-claude-agents&type=date&theme=dark&legend=top-left" />
   <source media="(prefers-color-scheme: light)" srcset="https://api.star-history.com/image?repos=percheniy/office-for-claude-agents&type=date&legend=top-left" />
   <img alt="Star History Chart" src="https://api.star-history.com/image?repos=percheniy/office-for-claude-agents&type=date&legend=top-left" />
 </picture>
</a>

<h2>Credits</h2>

<ul>
  <li><a href="https://github.com/pablodelucca/pixel-agents">pablodelucca/pixel-agents</a> by Pablo De Lucca</li>
  <li>Roland Ligtenberg for standalone groundwork</li>
  <li>Sergey Gridchin for public standalone additions, Codex support, task sidebar generalization, richer inspection, and release packaging</li>
</ul>

<details>
  <summary>License</summary>

  <p>This repository contains code derived from or based on <code>pablodelucca/pixel-agents</code>.</p>

  <ul>
    <li>Original upstream code remains under the MIT License.</li>
    <li>Original copyright notices and license notices must be preserved.</li>
    <li>Clearly marked files created by Sergey Gridchin are governed by the Sergey Source-Available Noncommercial License 1.0 as stated in the root <code>LICENSE</code> file.</li>
    <li>That separate license applies only to clearly marked Sergey-authored additions, not to upstream-origin or derivative MIT-governed portions.</li>
    <li>If this repository is a fork or substantial modification of <code>pixel-agents</code>, it is not legally safe to claim a stricter license for the whole repository in a way that removes rights already granted by MIT.</li>
    <li>In case of conflict, the original upstream MIT License continues to govern all upstream portions and derivative portions that remain subject to that license.</li>
  </ul>

  <p>Short form:</p>

  <pre><code>Licensing notice

This repository includes code derived from or based on pablodelucca/pixel-agents.
Original upstream code remains subject to its original MIT License, and all
applicable copyright and license notices must be preserved.

Unless otherwise stated in a file header, files originating from the upstream
project or derived from it are provided under the MIT License.

Files and materials clearly marked as:
Copyright (c) 2026 Sergey Gridchin
are licensed under the Sergey Source-Available Noncommercial License 1.0.

In case of conflict, the original upstream MIT License continues to govern all
upstream portions and derivative portions that remain subject to that license.
</code></pre>

  <p>See the root <code>LICENSE</code> file for the canonical text used in this repository.</p>
</details>
