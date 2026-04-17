# Aerolog Session Handoff

Upload this file into a new conversation so the assistant can pick up Aerolog work without re-learning the project from scratch. It is a current-state handoff, not a patch log.

---

## 1. What Aerolog is

A lightweight browser frontend for VictoriaLogs. It talks directly to VictoriaLogs from the browser — no backend, no alerting, no auth, no server-side state, no build step, no runtime dependencies.

Main user-facing features:
- host-based Tabs
- hostname aliases
- alias-aware searching
- query history with pinned/default entries
- Heartbeats host activity
- local config backup/restore

Keep it lean. Do not turn it into a platform.

---

## 2. Working agreement

### Permission
- **Never change code without explicit permission.** If something looks off, ask first.
- Treat "do you see anything that could use a refactor?" as a read-only review request.
- Structural rewrites are fine to *suggest*; do not perform them without consent.
- Keep the scope of any permitted edit narrow. Broad refactors, style rewrites, architecture changes, dependency changes, or behavior changes outside the requested issue require a separate ask.
- **Do not bump the version unless the user explicitly asks.**

### User preferences
- Prefers direct, honest answers. Say "I don't know" when you don't.
- Hates made-up technical nonsense.
- Is regression-sensitive and will absolutely notice unasked-for "helpful" changes.
- Okay with breaking old compatibility during early development if that's the cleaner choice.
- Wants narrow, disciplined changes rather than surprise UI surgery.

### Compatibility shims
Do not add or preserve "just in case" compatibility wrappers, aliases, or fallback helpers. If something is superseded, delete it; callers should move to the real API. The one exception is settings import/export migrations, which live in `settings_migration.js` (see §12). Toasts are owned by `App.toasts` and call sites use `App.toasts.success(...)` / `App.toasts.error(...)` directly — do not reintroduce a `showAlert`, `notify`, or similar indirection in `App.utils`.

### Documentation
- **CHANGELOG.md** — high-level and user-facing only. No implementation/parser internals.
- **README.md** — update only when user-facing behavior, setup, configuration, or usage changes.
- **LLM_HANDOFF.md** — implementation intent, assistant guardrails, maintainer context that does not belong in the public changelog.
- The user may provide any of these separately when they want them updated.

### Packaging
- Deliver a ZIP unless the user explicitly asks for loose files.
- ZIPs contain runtime/project files and proper folder structure only.
- Do **not** include `README.md`, `LLM_HANDOFF.md`, or `CHANGELOG.md` in a ZIP unless explicitly asked.
- Do **not** scaffold empty `assets/` or `assets/icons/` directories.
- Do **not** pretend the icon asset is included when it is not. For site icon packaging follow the Assets section below.

### Standing defaults
- Default polling is **Off**.
- Always include `application` as a friendly alias for `app_name`.

---

## 3. Versioning

Aerolog uses semantic versioning starting at `1.00`. Prior builds used caldate versioning (`2026.04.15b`).

- `App.VERSION` in `core.js` — the display version string
- `App.SETTINGS_VERSION` in `core.js` — integer checked during config import; mismatched versions are rejected
- `package.json` `version` field — kept in sync with `App.VERSION`

`SETTINGS_VERSION` follows the version number the change was made on (e.g. version `1.00` → settings version `100`). Bump it whenever the config export/import shape changes so old exports are rejected instead of silently applying the wrong structure.

---

## 5. Architecture

The app started as a single HTML file. That made early experimentation easy but broke down once query rewriting, tabs, aliases, polling, query history, and UI state all started interacting. Current direction is **modular plain-browser JavaScript**. No framework, no bundler, no backend, no new dependencies unless explicitly reversed.

### Module responsibilities

| File | Role |
|---|---|
| `core.js` | constants, storage keys, generic utilities, validation, shared config metadata |
| `toasts.js` | toast rendering, success/error color and duration rules, notification helpers behind `App.toasts` |
| `state.js` | persisted config, runtime state, derived helpers, `App.persist.*` factory |
| `config_io.js` | config export object construction, compact key mapping, import application, local-time export filename |
| `settings_migration.js` | ordered settings-version migration steps for imported configs; exposes `App.settingsMigration.migrate(config, importVersion)` called from `config_io.js` |
| `actions.js` | user-level action orchestration — the mutate → persist → render/refresh sequencing lives here so workflow modules do not reimplement it |
| `query.js` | friendly query parsing, field alias normalization, wildcard/exact compilation, alias-aware host clauses |
| `query_history.js` | recent query history popover, pin/default/remove/clear, default-pinned ordering. Do not fold this back into `render.js` or `state.js` |
| `render.js` | shared render facade, toolbar state, settings controls, stats, response time, connection pill |
| `render_table.js` | log table rendering, column resize + double-click auto-size, copy button/row visuals, message preview line count, expanded detail rendering |
| `render_pager.js` | pager button count, pager metadata text, pagination rendering |
| `render_tabs.js` | tab strip rendering, overflow detection, tab list in Tabs modal |
| `field_filters.js` | click-to-filter menu and include/exclude fragment construction |
| `api.js` | VictoriaLogs requests, central refresh dispatch, request arbitration, abort logic |
| `polling.js` | poll scheduling, progress-bar timing, pause/resume, auto-poll gating |
| `tabs.js` | tab CRUD, selection, reordering, pagination actions that touch tab state |
| `modals.js` | generic modal open/close, scroll locking, settings, import/export/reset |
| `aliases.js` | alias modal workflow, alias save/refresh |
| `heartbeats.js` | Heartbeats modal workflow, host activity query, rendering |
| `shortcuts.js` | keyboard shortcut bindings |
| `events.js` | DOM event binding, delegated `data-action` routing, app init |

### Script order in `index.html` (matters)
- `toasts.js` after `core.js`
- `state.js` before `query_history.js`
- `render.js` before `render_table.js`, `render_pager.js`, `render_tabs.js`
- `field_filters.js` after `query.js`
- `settings_migration.js` before `config_io.js`
- `config_io.js` before `modals.js`
- `modals.js` before `tabs.js`, `aliases.js`, `heartbeats.js`
- `actions.js` after `polling.js`
- `shortcuts.js` after `actions.js`, before `events.js`
- `events.js` last

### Refresh separation
- `api.js` — manual/settings/page refreshes run logs + count queries; automatic polls run only the logs query and keep the previous count.
- All refresh causes have timeouts: polls use the poll interval, other refreshes use `App.REQUEST_TIMEOUT_MS`.

### Runtime pauses live in `polling.js`
`polling.js` owns pause state for page navigation, expanded rows, hidden browser tabs, and server-URL changes. See §8.

### Click-to-filter targets
Hostname, severity, facility, app, and safe expanded detail fields are filterable. `_time` and `_msg` are intentionally **not** click-filterable — never turn timestamps or full messages into brittle search-box filters.

---

## 6. State model

Keep these buckets separate. The DOM reflects state; the DOM does not own it.

### Persisted (localStorage, survives reload)
server URL · theme · page size · poll interval preference · time range · custom time range · tabs · aliases · recent query history · default startup query · column widths · tab-strip tool visibility · row expand/copy/filter visibility

### Runtime (not persisted)
current page · active tab · logs currently displayed · total page/count data · last response time · in-flight request info · current scheduler deadline · current connection state · editing IDs for tabs · runtime pause flags

### Derived (computed, not stored)
whether auto-polling is actually active · pill state · request base URL · progress-bar visibility · whether controls should be disabled

---

## 7. Search and query behavior

The most bug-prone part of the app. Do **not** regress into a pile of disconnected regex rewrites.

### Pipeline
1. tokenize/parse the user query
2. normalize friendly field aliases
3. resolve aliases where needed
4. compile to final LogsQL

Quoted strings are literal — do not rewrite friendly fields inside them.

### Friendly field aliases
`host`, `hostname`, `app`, `application`, `app_name`, `msg`, `message`, `_msg`, `time`, `timestamp`, `_time`, `fac`, `facility`, `facility_keyword`, `facility_num`, `sev` → `severity`.

### Friendly field matching
- no `*` → **exact match**
- `*` → wildcard matching
- explicit `:=` stays exact
- explicit `:~` stays regex

This is Aerolog behavior, not native LogsQL wildcard syntax.

Exception: `sev` is a direct shorthand for `severity`, so preserve native severity syntax (`sev:<4` → `severity:<4`).

### Facility mapping
The UI label is "Facility," but the backend has both keyword and numeric fields:
- `facility:` → `facility_keyword`
- `fac:` → `facility_keyword`
- `facility_num:` → `facility`

Deliberate — matches what the UI displays most of the time.

### Message search — two paths
- Bare term (`error`) → normal VictoriaLogs free-text message search.
- `msg:` / `message:` → goes through the friendly-field rewrite layer and follows exact-vs-wildcard rules.

These differ intentionally even though both *feel* like message searching.

### Host matching — shared matcher rule
Tabs, aliases, and `host:`/`hostname:` rewrites must all use the **same host matcher/compiler**. Duplicated hostname logic is how earlier wildcard bugs happened.

Expected behavior:
- no wildcard → exact host match
- wildcard → wildcard/regex host match
- explicit `host:~` / `hostname:~` → user-supplied regex, pass through
- aliased host wildcard matching must work
- friendly alias exact lookup is case-sensitive; do not add a lowercased reverse-alias fallback
- exact host clauses must use real LogsQL exact syntax: `hostname:="value"` — **not** `hostname:"value"`

### Custom time range
- `logview.timerange` (inside `aerolog_logview`) stores whether `custom` is active.
- `logview.timecustom` (export key `logview.timecustom`) stores UTC ISO start/end.
- Compiles to `_time:[start, end)`.
- The datetime modal uses local browser time and converts to UTC before persisting.
- Invalid/missing custom range at startup/import → fall back to the default relative range rather than leaving the UI broken.
- Selecting `Last: Custom` reuses a saved valid range and refreshes immediately; only open the modal when no valid custom range exists.
- When Custom is active, a red `Edit` button appears next to the Last dropdown and is the way to change or clear it.
- Toolbar wrapping: `Last: Custom` and its `Edit` button must wrap together as `time-range-group`; Poll, Rows, and Last controls should expand to fill the wrapped row rather than stay compact with a gap.

---

## 8. Polling and progress bar

Subtle bug territory. Read this before touching polling.

### Saved-interval rule
The saved poll interval only changes when the user explicitly picks a new value from the poll interval control. Nothing else — not a pause, not a resume, not a side-effect, not an import handler, not a settings save — may write the saved poll interval. Side-effect pauses live entirely in runtime state.

### Auto-resume rule
A pause caused by anything other than the user explicitly turning polling off (expanding rows, leaving page 1, changing the server URL, etc.) must **not** silently re-enable polling when the triggering condition clears. Once paused by a side-effect, stay paused until the user picks a poll interval again.

**The only thing that resumes auto-polling is the user choosing a poll interval.**

### Hidden-tab exception
Background tabs should not keep stale poll timers running. On visibility return, re-anchor polling from the current time if auto-polling is still allowed. Hidden/visible transitions are transparent rather than a user-visible pause, so returning to the tab may resume polling on its own. This is the only exception to the auto-resume rule.

### Per-pause behavior
- **Page navigation:** leaving page 1 pauses effective auto-polling. Returning to page 1 does not resume.
- **Row expansion:** expanding a row pauses effective auto-polling. Collapsing rows does not resume.
- **Server URL change:** changing the server URL pauses effective auto-polling. Reverting does not resume.

None of these touch the saved poll interval.

### Timing rule
Poll cadence anchors to **when the request is sent**, not when the response returns. A manual refresh re-anchors the next poll from that send time.

- refresh sent now
- next poll due N seconds after that send
- progress bar counts down to that exact deadline

### Progress bar rule
Reflects the same poll deadline as the scheduler. Do not let them drift apart — earlier versions did.

### Scheduler guidance
- one scheduler deadline
- one source of truth for whether auto-polling is allowed
- stale scheduled callbacks must be invalidated
- user-triggered refreshes win over polls in a conflict
- auto-polls do not stomp user refreshes
- auto-polls do not run the count query; previous count persists until a manual/settings/page refresh updates it

### Response-time updates
Response time updates after every successful refresh, including settings-driven ones — not just auto-polls. Easy to get wrong when short poll intervals overlap with user refreshes.

### Connection pill
- Configured host/server value always visible, even on failure.
- Gray when paused, even if the backend is offline.
- Error detail goes in the tooltip/title, not the main label.

---

## 9. UI rules

### Mobile mode
App-level: any viewport ≤ **1000px** is mobile mode. This is a framework rule, not a per-component breakpoint.

- Use `App.MOBILE_MAX_WIDTH` and `App.isMobileMode()` in JS.
- Prefer compact controls, shorter labels, nav-only pagination.

### Breakpoint invariant
There is exactly **one** responsive breakpoint: `1000px`. It lives in two places that must stay in sync:
- `App.MOBILE_MAX_WIDTH` in `site/js/core.js`
- `@media (max-width: 1000px)` in `site/styles/aerolog.css`

Do not introduce a second breakpoint literal (520px, 768px, 1200px, etc.). If something looks cramped below the shared cutoff, extend the existing 1000px tier — do not invent a narrower one without discussion. Enforced by the `aerolog.css uses only the 1000px responsive breakpoint` and `core.js MOBILE_MAX_WIDTH matches the CSS breakpoint` tests.

### Keyboard shortcuts
Live in `shortcuts.js`, bound via `App.shortcuts.bind()` in `events.js` init.

| Key | Action |
|---|---|
| `/` | focus and select the search box |
| `r` | manual refresh (`App.api.dispatchRefresh('manual')`) |
| `[` / `]` | previous / next page |
| `Home` / `End` | first / last page |
| `?` | toggle shortcuts cheat-sheet modal |
| `Esc` | (owned by `events.js`) blur focused input/textarea/contenteditable, close open modal |

Rules shortcuts must follow:
- delegate to existing `App.actions.*` / `App.api.*` — do not duplicate paging/refresh logic
- inert while typing (`INPUT` / `TEXTAREA` / `SELECT` / `contenteditable`), **including `?`** so users can type it into queries, tab names, aliases
- inert while any `.modal-overlay.open` exists, except `?` (so the cheat sheet can toggle itself closed)
- ignore events with any modifier key (`ctrl`, `meta`, `alt`) so browser shortcuts still work

The cheat sheet is a normal `.modal-overlay` (`#shortcuts-modal`) so it inherits theming and Esc-to-close via the shared `OVERLAY_CLOSE` table. The settings modal includes a "Press `?` for shortcuts" hint.

When changing bindings, update README, `#shortcuts-modal` markup in `index.html`, and the shortcut tests together.

### Event wiring
**No inline `onclick` / `onchange`.** Use explicit event binding and delegated `data-action` routing. Keeps modules clean and avoids forcing functions onto the global namespace.

### Text input
Text inputs and textareas intentionally disable mobile autocorrect/autocapitalize/spellcheck/autocomplete because Aerolog fields usually contain hostnames, URLs, aliases, or LogsQL.

### Theme and startup
Default theme is **System**. Apply theme before first paint — never hard-code `dark` in the document shell. Avoid staggered/messy theme transitions; suppress transitions during startup/theme flips when needed. First-paint discipline is load-bearing — the modular version felt worse until this was handled properly.

### Mobile text inflation (iOS)
Real iPhone-only issue: Message column text rendered much larger than other columns. Did **not** reproduce reliably in desktop devtools mobile emulation. Likely iOS text autosizing / font inflation hitting wrapped message cells.

If you touch message-column CSS, test on a real iPhone. Desktop responsive mode is not proof.

Areas that may need protective CSS: `html`, `.log-table`, `.log-table td`, `.log-table td.msg`, `.msg-content`.

---

## 10. Log table details

### Row controls
The Message column has explicit inline controls for copy and row expansion. Do **not** make the entire row a click target — it competes with future cell-level interactions and text selection.

### Message preview line count
- localStorage group: `aerolog_settings` → `settings.logtable.msglines`
- export: `settings.logtable.msglines`
- values: `'1'`–`'5'`

### Row-action visibility
- localStorage group: `aerolog_settings` → `settings.logtable.{expand, copy, filter}`
- export: `settings.logtable.expand`, `settings.logtable.copy`, `settings.logtable.filter`
- shape: `{ msglines: string, expand: boolean, copy: boolean, filter: boolean }`
- default: all true
- disabling expand collapses any currently expanded rows
- disabling click-filter closes any open field-filter popup
- field-filter popups anchor near the clicked value on desktop and switch to a bottom-sheet layout via `App.isMobileMode()` on mobile — do not add a second popup breakpoint

### Expanded row details
Expanded rows show every raw field returned by VictoriaLogs, sorted alphabetically by original field name. Do not filter out collapsed-table fields, do not inject computed/display fields, and do not apply hostname aliases in expanded rows; aliases belong in the collapsed table display only.

Expanded detail rows use one shared auto-sized key column (`fit-content(16rem)`) on both desktop and mobile. Do not add a narrower mobile key-column override; long structured field names such as Windows/Event fields need the same readable key width on mobile.

### Settings modal
The server field applies on blur or when the user clicks Done. Pressing Esc while editing the server field restores the saved value before blur handlers run, so the draft is abandoned.

### Config imports
Must check `settings_version` before applying. Reject unsupported versions clearly instead of silently applying a shape Aerolog may not understand.

---

## 11. Query history defaults

Only one query-history entry can be the startup default. Stored in `aerolog_querydef` (top-level plain-string key, removed when empty).

- `core.js` validation and `state.js` loading keep the default query pinned and first when it exists in history.
- If the stored default query is not in history, ignore/clear it — do not run a ghost startup query.
- On startup, load the default query text into runtime `committedSearch` before the initial refresh, then run the first search. Do not run an unfiltered search first when a default exists.
- Browser refresh behaves like fresh startup: use the default if one exists, otherwise empty. Do not persist unsaved ad-hoc searches as the startup query.
- Removing, unpinning, or bulk-clearing the default clears the default silently.

### UI
The `D` button in the search history dropdown toggles a query as the startup default. Pressing an active default button clears the default. Making a query the default pins it and moves it to the top of the pinned list. Pinned entries stay at the top and are capped at 10 entries total, including the startup default when one exists. Unpinned entries are capped at 10 entries, for a maximum of 20 saved queries. If a default is set, newly pinned entries sit below it. There are no direct pinned reorder controls — pinning or defaulting another query is the intended lightweight ordering mechanism. `X` removes one entry; pinned deletions and bulk clears ask for confirmation. The search-box `X` clears the active query text and runs an empty-query refresh.

Query history dropdown content is rendered lazily when opened or after history mutations. Do not reintroduce eager hidden dropdown rendering during startup; it adds avoidable first-interaction work after refresh.

---

## 12. Config and persistence

### Export/import shape
Settings modal options group under `settings` with compact nested keys `server`, `theme`, `tabvis`, `logtable`. `tabvis` remains its own object. `settings.logtable` contains `msglines`, `expand`, `copy`, `filter`. Log toolbar and column-width options group under `logview` with `rowcount`, `pollint`, `timerange`, `timecustom`, `colwidths`. Tabs, aliases, query history, and query default remain top-level compact keys.

Do not fold alias or query-history workflows back into `modals.js`.

### Config export filename
`aerolog-export-<SETTINGS_VERSION>-YYYYMMDDHHMMSS.json` using local browser time. The settings version in the filename lets the user see at a glance which schema a backup was exported from.

### localStorage keys
Six grouped JSON blobs that mirror the export/import top-level keys 1:1:

- `aerolog_settings` — `{ server, theme, tabvis, logtable }`
- `aerolog_logview` — `{ rowcount, pollint, timerange, timecustom, colwidths }`
- `aerolog_aliases` — `{ [rawHost]: friendly }`
- `aerolog_tabs` — `[{ id, name, hosts }]`
- `aerolog_querydef` — plain string (removed when empty)
- `aerolog_queryhist` — `[{ query, pinned }]`

Internal `App.state.config` uses the same six-key shape. `App.persist` exposes nested leaf setters (e.g. `App.persist.settings.logtable.msglines('3')`, `App.persist.logview.pollint('5')`) that validate, mutate config, and re-serialize the owning group to its single localStorage key. Reach values via `App.state.config.settings.logtable.msglines`, not via a flattened path.

**Sync rule — the three shapes (export JSON, `aerolog_*` localStorage blobs, internal `App.state.config`) must stay identical, keyed the same way at every level.** Adding or renaming a settings field means touching all three together; the sync test in `site/tests/config.test.js` (`internal config, localStorage groups, and export JSON shapes stay in sync`) enforces the top-level shape and sample nested shapes. Extend it when you add new fields.

### Config import versioning
Imports with `settings_version` < 100 are rejected (pre-1.00 exports). Versions >= 100 are accepted and run through ordered migration steps registered in `settings_migration.js`. `config_io.applyImportedConfig` calls `App.settingsMigration.migrate(config, importVersion)` after the version check and before applying values, so migrations reshape the raw imported object in place before validators run.

When bumping `SETTINGS_VERSION` with a shape change, append a new step to the `STEPS` array in `settings_migration.js`:

```js
{ fromVersion: 100, toVersion: 200, migrate(config) { /* reshape 100 → 200 */ } }
```

Keep each step narrow — only touch the fields that actually changed. Validators still run afterward, so migrations do not need to re-validate values. `settings_migration.js` is the **only** sanctioned place for compatibility handling; do not scatter version-specific coercions into `config_io.js` or validators.

Only current `aerolog_*` keys are supported.

Tabs are Tabs. Not Groups. Do not muddy that again.

---

## 13. Assets

Runtime SVG site icon ships with the repo. Runtime favicon path:

```
./assets/icons/aerolog.svg
```

Runtime assets live under `./assets/`. Source artwork stays separate from runtime assets.

Ingest-side config examples live under `examples/ingest/`. Reference only — Aerolog still does not ingest logs.

---

## 14. Testing

Dependency-free Node tests:

```
site/tests/run_tests.js
```

`run_tests.js` is the runner only. Shared helpers live in `site/tests/helpers.js`, subsystem tests in `site/tests/*.test.js`. Keep new tests near the subsystem they cover instead of regrowing the runner.

Portable Node binary available outside the repo:

```
/mnt/git/aerolog-test/bin/node site/tests/run_tests.js
```

Browser smoke-test page: `site/tests/index.html`.

Tests cover query rewriting, alias-aware host clauses, default-query startup, query-history ordering, config persistence/import helpers, action sequencing, polling/API refresh behavior, and table rendering. They do **not** replace manual UI testing.

### Manual UI checklist after edits

The checklist below is the residue that Node tests can't reach: real paint timing, real CSS layout, real concurrency, real devices. Logic items (poll persistence, auto-resume, friendly-field rewriting, alias matching, query history, import/export, connection pill state transitions, tab host filtering, mobile-input autocorrect attrs, pre-paint theme script, default-query startup) live in `site/tests/*.test.js` — extend those rather than growing this list.

- startup no-flash (non-system theme repaints once, then stays put) — real paint timing, only visible in a browser
- progress bar aligned with actual poll timing — needs real `element.animate` + real clock
- no early reset, no double-fire, no back-to-back poll race on settings/time-range/refresh churn
- Tabs modal reorder + drag interactions (logic is tested; the pointer-level feel isn't)
- expanded detail rendering *visual* (key column width, wrap behavior) on desktop and mobile
- row copy button stays visually centered on desktop and mobile — CSS layout
- real-iPhone message text size if you touched message CSS

---

## 15. Anti-patterns — do not casually

- revert to one giant regex swamp for query rewriting
- duplicate host matching logic across tabs and query rewriting
- let DOM selects become the real state store
- make polling cadence depend on response return time
- overwrite the saved poll preference on any side-effect pause
- silently re-enable polling after a side-effect pause clears
- add settings migration or compatibility handling without being asked
- reintroduce compatibility shims such as `showAlert` or `App.utils.notify` — `App.toasts` owns toasts; call sites use `App.toasts.success(...)` / `App.toasts.error(...)` directly

When in doubt, keep behavior stable and make the change smaller.
