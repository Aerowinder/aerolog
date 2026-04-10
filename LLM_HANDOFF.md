# Aerolog Session Handoff

This file is meant to be uploaded into a new conversation so the assistant can pick up Aerolog work without re-learning the entire project from scratch.

It is written from scratch as a current-state handoff, not as a patch log.

---

## What Aerolog is

Aerolog is a lightweight browser frontend for VictoriaLogs.

It is intentionally small:
- no backend
- no alerting
- no auth built in
- no server-side state

Everything important lives in the browser and talks directly to VictoriaLogs.

Main user-facing features:
- host-based Tabs
- hostname aliases
- alias-aware searching
- saved queries
- local config backup/restore

Aerolog is meant to stay lean. Do not turn it into a giant platform.

---

## Current project state

- App name: **Aerolog**
- Backend target: **VictoriaLogs**
- Current published release: **2026.04.10c**
- Current code line: **2026.04.10c**

Important standing rule:
- **Do not bump the version unless the user explicitly asks for it.**

Other standing rules:
- Default polling should be **Off** unless the user explicitly wants something else.
- Include `application` as a friendly rewrite alias for `app_name` unless the user says otherwise.
- Do not make unrelated UI or behavior changes without permission.
- The user is regression-sensitive and will absolutely notice when something “helpful” changed that they did not ask for.
- When delivering artifacts, always provide a ZIP package unless the user explicitly asks for loose files.
- By default, ZIP packages should contain only the project/runtime files and proper folder structure.
- Do **not** include `README.md`, `LLM_HANDOFF.md`, or `CHANGELOG.md` in a ZIP unless the user explicitly asks for those docs to be included.
- The user may provide `README`, handoff, and changelog files separately when they want those updated.

---

## Architecture direction

The code started as a single-file HTML app. That made early experimentation easy, but it became harder to reason about once query rewriting, tabs, aliases, polling, saved queries, and UI state all started interacting.

The current preferred development direction is **modular source files** while still keeping the app plain browser JavaScript.

No framework.
No bundler requirement.
No backend.

Typical module responsibilities:

- `core.js`
  - constants
  - storage keys
  - generic utilities
  - validation helpers
  - shared config definitions

- `state.js`
  - persisted config
  - runtime state
  - derived state helpers

- `query.js`
  - friendly query parsing
  - field alias normalization
  - wildcard/exact compilation
  - alias-aware host clause generation

- `render.js`
  - table rendering
  - header, stats, pill, pager, tabs
  - copy button / row visuals

- `api.js`
  - VictoriaLogs requests
  - central refresh dispatch
  - request arbitration and abort logic

- `polling.js`
  - poll scheduling
  - progress-bar timing
  - pause/resume behavior
  - auto-poll gating

- `tabs.js`
  - tab CRUD
  - tab selection
  - pagination actions that interact with tab state

- `modals.js`
  - settings
  - aliases
  - saved queries
  - import/export/reset

- `events.js`
  - DOM event binding
  - delegated action routing
  - app initialization

This structure has been easier to work with than the monolith.


## 2026.04.10c notes

This release included a small but user-visible polish pass:
- blocked duplicate friendly alias names
- adjusted the Settings modal layout and wording
- added a GitHub link in the Settings modal header
- kept the poll preference persisted while showing `Poll: Off` in the toolbar when runtime navigation pause disables effective polling
- moved the mobile-layout breakpoint to 800px
- let the connection pill size to its content in mobile layout instead of forcing full width

---

## State model

Keep these three buckets separate.

### 1. Persisted config
This lives in localStorage and should survive reloads:
- server URL
- theme
- page size
- poll interval preference
- time range
- tabs
- aliases
- saved queries
- column widths / selected columns

### 2. Runtime state
This should not be persisted:
- current page
- active tab
- logs currently displayed
- total page/count data
- last response time
- in-flight request info
- current scheduler deadline
- current connection state
- editing IDs for tabs/queries
- runtime pause flags

### 3. Derived state
This should be computed from config + runtime rather than stored separately when possible:
- whether auto-polling is actually active
- displayed pill state
- request base URL
- progress-bar visibility
- whether controls should be disabled

Do not let DOM controls become the source of truth.
The DOM should reflect state, not own it.

---

## Search / query behavior

This is one of the most bug-prone parts of the app.

### Core rule
Do **not** go back to a pile of disconnected regex rewrites.

Preferred flow:
1. tokenize or parse the user query
2. normalize friendly field aliases
3. resolve aliases where needed
4. compile to final LogsQL

### Friendly field aliases currently expected
- `host`
- `hostname`
- `app`
- `application`
- `app_name`
- `msg`
- `message`
- `_msg`
- `time`
- `timestamp`
- `_time`
- `fac`
- `facility`
- `facility_keyword`
- `facility_num`

### Matching rules for friendly fields
For Aerolog's friendly field sugar:
- **No `*` means exact match**
- `*` means wildcard matching
- explicit `:=` stays exact
- explicit `:~` stays regex

This is Aerolog behavior, not native LogsQL wildcard syntax.

### Facility rules
The UI label is “Facility,” but the backend has both a keyword field and a numeric field.

Current intended behavior:
- `facility:` → `facility_keyword`
- `fac:` → `facility_keyword`
- `facility_num:` → `facility`

This is deliberate. It matches what the UI shows the user most of the time.

### Message searching nuance
There are two different paths for “message” search and they do not behave identically:

- A **bare term** like `error` behaves like normal VictoriaLogs-style free-text message searching.
- `msg:` and `message:` go through Aerolog's friendly field rewrite layer and therefore follow the exact-vs-wildcard rules used by other friendly fields.

That difference is currently understood and intentional enough to keep in mind, even if it is a little surprising at first.

### Host matching rule
Tabs, aliases, and `host:` / `hostname:` query rewrites must all use the **same host matcher/compiler**.

Do not duplicate hostname logic in multiple code paths.
That is how earlier wildcard bugs happened.

Expected hostname behavior:
- no wildcard = exact host match
- wildcard = wildcard/regex host match
- aliased host wildcard matching must work
- exact host clauses must use real LogsQL exact syntax:
  - `hostname:="value"`

Do not regress to broken syntax like:
- `hostname:"value"`

---

## Polling and progress bar behavior

This subsystem caused a lot of subtle bugs, so be careful here.

### User-facing behavior
- Polling preference is saved independently of runtime pause state.
- Leaving page 1 pauses effective auto-polling, but must **not** overwrite the saved poll interval.
- Returning to page 1 does not silently resume polling.
- The server pill keeps showing the configured host/server value even on failures.
- The pill goes gray when polling is paused, even if the backend is offline.
- Error detail belongs in tooltip/title text, not as the main pill label.

### Timing rule
The poll cadence should anchor to **when the request is sent**, not when the response returns.

If a manual refresh-causing action happens, the next poll should be re-anchored from that send time.

In other words:
- refresh sent now
- next poll due N seconds after that send
- progress bar should count down to that exact deadline

### Progress bar rule
The progress bar should reflect the same poll deadline as the scheduler.
It should not run on a separate idea of time.

Earlier versions had problems where the bar and the actual poll cadence could drift apart. Do not reintroduce that.

### Scheduler guidance
Preferred scheduler behavior:
- one scheduler deadline
- one source of truth for whether auto-polling is allowed
- stale scheduled callbacks must be invalidated
- user-triggered refreshes win over polls if there is a conflict
- auto-polls should not stomp user refreshes

### Response-time updates
Response time should update after successful refreshes caused by settings changes too, not just auto-polls.
This was easy to get wrong when short poll intervals overlapped with user refreshes.

---

## Theme and startup behavior

This was a real regression in the first modular attempts.

Current expectations:
- default theme is **System**
- theme must be applied before first paint
- do not hard-code `dark` in the document shell
- avoid staggered or messy theme transitions
- suppress transitions during startup/theme flips when needed

The modular version felt worse until this was handled properly.

---

## Mobile text inflation issue

There was a real iPhone-only issue where the Message column text rendered much larger than the other columns.

Important details:
- it did not reproduce reliably in desktop devtools mobile emulation
- it showed up on real iPhone browsing
- the likely cause was iOS text autosizing / font inflation hitting the wrapped message cells

If you touch message-column CSS, test this on a real iPhone if possible.
Do not trust desktop responsive mode as proof that it is fixed.

Areas that may need protective CSS:
- `html`
- `.log-table`
- `.log-table td`
- `.log-table td.msg`
- `.msg-content`

---

## Startup and delivery lessons

Modular source was a good development change, but naive multi-file delivery made startup feel worse at first.

The main culprits were:
- wrong theme painted before JS corrected it
- too much visible startup work after first paint
- staggered theme updates

So the current lesson is:
- modular source is good
- startup/theme handling needs discipline
- do not casually regress first-paint behavior

---

## Event wiring

Preferred direction is **no inline `onclick` / `onchange`**.

Use explicit event binding and delegated `data-action` routing instead.
That keeps modules cleaner and avoids forcing functions onto the global namespace.

---

## Persistence keys

Current important localStorage keys:
- `aerolog_server`
- `aerolog_tabs`
- `aerolog_theme`
- `aerolog_page_size`
- `aerolog_poll_interval`
- `aerolog_time_range`
- `aerolog_aliases`
- `aerolog_columns`
- `aerolog_queries`

Important note:
- old `aerolog_groups` compatibility was intentionally removed
- do **not** restore it unless the user explicitly asks

Tabs are Tabs. Not Groups.
Do not muddy that again.

---

## Favicon / assets

Current favicon path expectation:

```text
./assets/icons/aerolog.svg
```

Runtime assets should live under `./assets/`.
If source artwork is kept separately, keep it separate from runtime assets.

---

## User preferences / working style

These matter.

- The user prefers direct, honest answers.
- The user hates made-up technical nonsense.
- If something is uncertain, say so.
- The user is okay with breaking old compatibility during early development if that is the cleaner choice.
- The user wants narrow, disciplined changes rather than surprise UI surgery.
- If a change was not requested, do not casually improvise it.
- If a version bump happens, it should be because the user explicitly approved it.
- Prefer ZIP artifacts for delivery unless the user asks for something else.

---

## Recommended test checklist after edits

At minimum, test:
- startup theme and no dark flash
- server pill state on success, failure, pause, and page navigation
- poll interval persistence
- page-1 auto-poll gating without overwriting saved interval
- progress bar alignment with actual poll timing
- no early reset / no double-fire / no back-to-back poll race
- response-time updates after rows/time-range/settings changes
- exact vs wildcard behavior for host/app/facility/message friendly fields
- alias-aware host matching
- tab filtering
- saved query load/save/edit/delete
- import/export/reset behavior
- mobile message text size on a real iPhone if message CSS changed

---

## What not to do casually

- Do not revert back to one giant regex swamp for query rewriting.
- Do not duplicate host matching logic across tabs and query rewriting.
- Do not let DOM selects become the real state store.
- Do not make polling cadence depend on response return time.
- Do not overwrite saved poll preference just because the user left page 1.
- Do not change unrelated UI behavior without permission.
- Do not silently restore removed compatibility baggage like `aerolog_groups`.

If in doubt, keep behavior stable and make the change smaller.

---

## Asset handling rule

The site icon is **user-supplied**.

Expected runtime path:
- `/assets/icons/aerolog.svg`

Important packaging rule:
- Do **not** keep adding empty `assets/` or `assets/icons/` folder scaffolding to ZIP artifacts.
- Do **not** pretend the icon asset is included when it is not.
- Future ZIPs should assume the user already has `/assets/icons/aerolog.svg` and will place it themselves.

If a build references the favicon, reference the path above, but do not pad the ZIP with empty directories just to look complete.
