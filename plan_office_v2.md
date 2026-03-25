# plan_office_v2.md — Advanced Monitoring Features

**Цель:** Реализовать продвинутые фичи мониторинга агентов, используя данные из JSONL транскриптов.

**Репозиторий:** `/Users/grid/pixel-agents-standalone`
**Дата:** 2026-03-24

---

## Доступные данные в JSONL

Каждый `assistant` record содержит:
- `message.model` — "claude-opus-4-6", "claude-sonnet-4-6", etc.
- `message.usage.input_tokens`, `output_tokens`, `cache_read_input_tokens`, `cache_creation_input_tokens`
- `message.stop_reason` — "end_turn", "tool_use"
- `message.content[].tool_use` — name, input, id

Каждый record содержит:
- `sessionId`, `timestamp`, `cwd`, `gitBranch`, `version`

`system` records: `subtype: "turn_duration"`, `durationMs`

---

## Phase 6 — Token Health Bars & Usage Stats

**Агент: stats-builder**

- [ ] **6.1** Server parser — извлекать из JSONL:
  - `message.usage` (input_tokens, output_tokens, cache_read, cache_creation)
  - `message.model`
  - `durationMs` из turn_duration records
  - Агрегировать: totalInputTokens, totalOutputTokens, totalCacheRead, totalCacheCreation, turnCount, totalDurationMs
- [ ] **6.2** Server — новый message type `agentStats`:
  ```
  { type: "agentStats", id, model, totalTokens, contextUsed, turnCount, avgTurnDuration, cacheHitRate, costEstimate }
  ```
  Отправлять при обновлении (каждый turn end)
- [ ] **6.3** Client — TokenBar component:
  - Горизонтальная полоска под именем агента (или рядом)
  - Зелёный → жёлтый → красный по мере заполнения контекста
  - Tooltip: "45,231 / 200,000 tokens (22%)"
  - Показывать input/output/cache breakdown
- [ ] **6.4** Client — Stats overlay на ToolOverlay:
  - Model badge (opus/sonnet/haiku) рядом с именем
  - Turn count
  - Cost estimate (приблизительный)

## Phase 7 — Deep Inspection Panel

**Агент: inspection-builder**

- [ ] **7.1** Server parser — собирать tool history:
  - Массив последних N (50) tool invocations: {name, timestamp, durationMs}
  - Текущий статус инструмента с деталями input (file_path для Read, command для Bash)
- [ ] **7.2** Server — новый message type `agentDetails`:
  ```
  { type: "agentDetails", id, model, gitBranch, cwd, sessionId, version, permissionMode,
    toolHistory: [{name, timestamp, duration}],
    tokenBreakdown: {input, output, cacheRead, cacheCreation},
    turnCount, totalDuration, startTime }
  ```
  Отправлять по запросу `requestAgentDetails`
- [ ] **7.3** Client — InspectionPanel component:
  - Модальное окно / боковая панель при клике на агента
  - Заголовок: имя + model badge + status dot
  - Секция "Info": git branch, cwd, session ID, version, permission mode
  - Секция "Token Usage": breakdown bars (input/output/cache)
  - Секция "Tool History": scrollable список последних инструментов с timestamps
  - Секция "Performance": avg turn duration, cache hit rate
  - Кнопка "Close" (Esc тоже закрывает)
- [ ] **7.4** OfficeCanvas — double-click на агента открывает InspectionPanel

## Phase 8 — Agent Roles & Labels

**Агент: roles-builder**

- [ ] **8.1** Server — определять роль агента автоматически:
  - По имени worktree/папки: "ISSUE-291" → issue worker
  - По модели: opus → "architect", sonnet → "builder", haiku → "scout"
  - По текущей активности: если много Read → "researcher", много Edit → "coder", много Bash → "ops"
  - Fallback: "agent"
- [ ] **8.2** Server — поддержка ручного назначения ролей:
  - Message type `setAgentRole`: { id, role }
  - Persist в agents-state.json
  - Предустановленные роли: coder, reviewer, architect, researcher, ops, writer, designer
- [ ] **8.3** Client — Role badge на ToolOverlay:
  - Иконка/текст роли рядом с именем агента
  - Цвет по роли (coder=blue, reviewer=green, architect=purple, etc.)
- [ ] **8.4** Client — Role picker в InspectionPanel:
  - Dropdown с предустановленными ролями
  - Текущая auto-detected роль как default
  - Override сохраняется

---

## Порядок выполнения

```
Phase 6 (stats-builder)       ████████████████  ← server parsing + TokenBar UI
Phase 7 (inspection-builder)   ░░░░████████████  ← зависит от Phase 6 (использует stats data)
Phase 8 (roles-builder)        ░░░░░░░░████████  ← параллельно с Phase 7
```

Phase 6 — блокирующий (7 и 8 используют инфраструктуру stats).
Phase 7 и 8 — могут идти параллельно после Phase 6.
