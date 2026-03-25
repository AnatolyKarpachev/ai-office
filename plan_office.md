# plan_office.md — Full Feature Parity: pixel-agents-standalone

**Цель:** довести standalone-форк до полного паритета с оригиналом (pablodelucca/pixel-agents) без зависимости от VS Code.

**Репозиторий:** `/Users/grid/pixel-agents-standalone`
**Порт:** 9876
**Дата:** 2026-03-24

---

## Gap-анализ (что отсутствует в форке)

| # | Фича | Импакт | Сложность |
|---|-------|--------|-----------|
| 1 | Мебель — 25 open-source предметов с manifest-системой | HIGH | HIGH |
| 2 | 9 паттернов полов (floor tiles) | MEDIUM | LOW |
| 3 | Множественные наборы стен (wall sets) | MEDIUM | LOW |
| 4 | shared/assets/ модуль (manifest parser, asset index, build pipeline) | HIGH | MEDIUM |
| 5 | External asset directory (подключение внешних ассетов) | LOW-MED | MEDIUM |
| 6 | "Always Show Labels" toggle | LOW | LOW |
| 7 | Layout revision/migration system | LOW | LOW |
| 8 | Звук — персистентность настройки | LOW | LOW |
| 9 | "+" Agent кнопка — запуск Claude из UI | MEDIUM | MEDIUM |
| 10 | Layout file watcher (cross-tab sync через FS) | LOW | LOW |

---

## Фазы работы

### Phase 1 — Assets & Manifest System (критично, офис пустой без мебели)

**Агент: asset-builder**

- [ ] **1.1** Портировать `shared/assets/` модуль из оригинала:
  - `manifestUtils.ts` — `flattenManifest()`, `InheritedProps`, `ManifestGroup`
  - `pngDecoder.ts` — серверный PNG decode
  - `types.ts`, `constants.ts`
- [ ] **1.2** Портировать 25 директорий мебели из оригинала (`webview-ui/public/assets/furniture/`):
  - BIN, BOOKSHELF, CACTUS, CLOCK, COFFEE, COFFEE_TABLE, CUSHIONED_BENCH, CUSHIONED_CHAIR, DESK, DOUBLE_BOOKSHELF, HANGING_PLANT, LARGE_PAINTING, LARGE_PLANT, PC, PLANT, PLANT_2, POT, SMALL_PAINTING, SMALL_PAINTING_2, SMALL_TABLE, SOFA, TABLE_FRONT, WHITEBOARD, WOODEN_BENCH, WOODEN_CHAIR
  - Каждая директория с `manifest.json` + PNG-спрайтами
- [ ] **1.3** Обновить `server/assetLoader.ts` — загрузка per-folder manifests вместо flat catalog
- [ ] **1.4** Обновить `FurnitureAsset` тип — добавить `mirrorSide`, `rotationScheme`, `animationGroup`, `frame`
- [ ] **1.5** Добавить `FURNITURE_ANIM_INTERVAL_SEC = 0.2` в constants
- [ ] **1.6** Добавить `asset-index.json` build pipeline
- [ ] **1.7** Портировать 9 floor tile паттернов (`assets/floors/floor_0.png` — `floor_8.png`)
- [ ] **1.8** Обновить `floorTilesLoaded` message — отправлять паттерны клиенту
- [ ] **1.9** Портировать multiple wall sets (`assets/walls/wall_0.png`, `wall_1.png`, ...)
- [ ] **1.10** Обновить `wallTilesLoaded` message — формат `{sets: [...]}` вместо `{sprites: [...]}`

### Phase 2 — Editor Enhancements

**Агент: ui-builder**

- [ ] **2.1** EditorToolbar — добавить выбор wall set (`selectedWallSet`, `onWallSetChange`)
- [ ] **2.2** EditorToolbar — добавить выбор floor pattern (tile picker рядом с HSB)
- [ ] **2.3** Furniture catalog UI — обновить под per-folder manifests с rotation groups
- [ ] **2.4** SettingsModal — добавить "Always Show Labels" toggle
- [ ] **2.5** Подключить `alwaysShowOverlay` prop в `ToolOverlay` и `BottomToolbar`

### Phase 3 — External Assets & Config

**Агент: config-builder**

- [ ] **3.1** Создать `server/configPersistence.ts` — чтение/запись `~/.pixel-agents/config.json`
- [ ] **3.2** SettingsModal — "Add Asset Directory" кнопка + список внешних директорий
- [ ] **3.3** Server — при загрузке мержить внешние ассеты с bundled
- [ ] **3.4** Персистентность soundEnabled в config.json
- [ ] **3.5** Отправлять сохранённый `soundEnabled` в `settingsLoaded` message

### Phase 4 — Agent Launch & Terminal Integration

**Агент: server-builder**

- [ ] **4.1** Обработчик `openClaude` message на сервере — запуск `claude --session-id <uuid>` через `child_process.spawn` (detached)
- [ ] **4.2** Опциональный bypass permissions (`--dangerously-skip-permissions`)
- [ ] **4.3** BottomToolbar — правый клик на "+" с меню (Normal / Bypass Permissions)
- [ ] **4.4** Трекинг запущенных процессов, корректное завершение при shutdown

### Phase 5 — Layout System

**Агент: ui-builder**

- [ ] **5.1** Layout revision system — `default-layout-{N}.json`, сканирование highest revision
- [ ] **5.2** Migration notice UI (layoutWasReset) при обновлении default layout
- [ ] **5.3** FS-level layout watcher для sync между процессами (не только WebSocket tabs)
- [ ] **5.4** Агент-state persistence — сохранять список агентов между перезапусками сервера

---

## Агенты

### 1. `asset-builder`
**Роль:** Портирование asset pipeline и графических ресурсов из оригинала
**Зона:** `shared/`, `server/assetLoader.ts`, `webview-ui/public/assets/`, типы
**Phase:** 1

### 2. `ui-builder`
**Роль:** UI-компоненты, EditorToolbar, SettingsModal, overlays
**Зона:** `webview-ui/src/components/`, `webview-ui/src/office/editor/`, `webview-ui/src/office/layout/`
**Phase:** 2, 5

### 3. `config-builder`
**Роль:** Config persistence, external assets, settings
**Зона:** `server/configPersistence.ts`, `webview-ui/src/components/SettingsModal.tsx`
**Phase:** 3

### 4. `server-builder`
**Роль:** Серверная логика — запуск Claude, процесс-менеджмент, FS watchers
**Зона:** `server/index.ts`, `server/watcher.ts`
**Phase:** 4

---

## Порядок выполнения

```
Phase 1 (asset-builder)     ████████████████  ← ПЕРВЫЙ, без него офис пустой
Phase 2 (ui-builder)         ░░░████████████  ← после Phase 1 (зависит от ассетов)
Phase 3 (config-builder)     ░░░░░░████████   ← параллельно с Phase 2
Phase 4 (server-builder)     ░░░░░░░░░██████  ← параллельно с Phase 2-3
Phase 5 (ui-builder)         ░░░░░░░░░░░░███  ← финал, после Phase 2
```

## Ограничения

- **НЕ трогаем** music_generator и другие репозитории
- Вся работа внутри `/Users/grid/pixel-agents-standalone`
- Порт сервера: **9876** (через `PORT` env var, не хардкод)
- Ассеты из оригинала — только open-source (MIT license), НЕ платный Donarg tileset
- Форк уже working — не ломаем существующий функционал

## Валидация

После каждой фазы:
1. `npm run build` — проект собирается
2. `PORT=9876 node dist/server.js` — сервер стартует
3. Открыть http://localhost:9876 — UI рендерится
4. Агенты Claude Code видны и анимируются
