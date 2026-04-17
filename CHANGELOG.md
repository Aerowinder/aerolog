# Changelog

## 1.01
- Error toasts now use clearer wording, red styling, and stay visible longer.
- Toasts now stay visible a little longer in general.
- Updated the README to clarify Aerolog's intended Linux syslog and Windows Event Logs focus, and to point advanced VictoriaLogs requests to VMUI.

## 1.00
- Switched to semantic versioning.
- Added a Quickstart section to the README.
- Config export filenames now include the settings version (e.g. `aerolog-export-100-20260415222533.json`).
- Config imports from pre-1.00 exports are rejected. Future version imports are accepted with forward migration.

## Betas
### 2026.04.15b
- Copying text from an expanded log row now produces readable tab-separated `key<TAB>value` lines instead of running the key and value together.

### 2026.04.15a
- Refactored variable usage internally and in localStorage to match the export format, and created tests to keep these from drifting apart again.
- Incresed text size of query filter popup text.
- Reverted change from 2026.04.13c regarding the slow click response from text boxes. It wasn't reliable enough to make it worth keeping.

### 2026.04.14d
- Fixed regression in popup query filter boxes, that would sometimes allow the box to be drawn in the top left corner of the window.
- Changed popup query filter header text to red to make it stand out better against the background.
- Modified expanded log rows to include all raw data, not only what was missing.

### 2026.04.14c
- Fixed initial slow click response from the query box.
- Further improved expanded log rows alignment and sizing.

### 2026.04.14b
- Improved expanded log rows so field names line up in a column across rows, with a narrower key column in mobile mode.

### 2026.04.14a
- Added click-to-filter controls for structured log fields.
- Added a Settings option to disable click-to-filter.
- Changed server settings so the server field applies upon leaving the text input field or pressing Done, while Escape abandons an in-progress edit.

### 2026.04.13c
- Added shortcuts for navigation, accessible by pressing `?`.
- Added row expansion for inspecting full messages and extra log fields.
- Added Settings controls for choosing how many message preview lines the log table shows and whether row expand/copy controls are visible.
- Changed Settings preferences to use quieter radio buttons and checkboxes.
- Changed config export/import so Settings modal options are grouped under `settings`, while log toolbar and column-width options are grouped under `logview`.

### 2026.04.13b
- Refactored into a more modular system that is easier to expand upon.
- Reduced live-poll request cost by skipping the count query during automatic polls. Log count now only updates on manual operations.
- Set "mobile mode" to 1000px. Any display under that size will automatically activate mobile mode, which is careful about horizontal space utilization. This will help prevent undesirable wrapping behaviors.
- Greatly expanded unit tests to help catch regressions automatically.

### 2026.04.13a
- Added a Last: Custom option so the user can choose the exact time window to search.
- Added small testing suite to hopefully prevent old bugs from resurfacing.
- Optimization pass.

### 2026.04.12f
- Added a search-box clear button and disabled mobile text autocorrect in text fields.
- Improved row copy button alignment.
- Refactored query history and config key handling to reduce UI/state coupling and keep default query ordering more consistent.

### 2026.04.12e
- Improved mobile layouts for query history, settings controls, and Heartbeats.

### 2026.04.12d
- Improved modal spacing and default pinned query ordering.

### 2026.04.12c
- Replaced the Saved Queries modal with search-box query history, including pin, startup default, remove, and clear controls.
- Changed mobile toolbar wrapping so the poll, rows, and time-range controls wrap as a group.

### 2026.04.12b
- Added a Heartbeats modal for host activity within the selected time range.
- Added Settings controls for showing or hiding tab-strip tool buttons.
- Added double-click auto-sizing for log table column resize handles.
- Changed reset to clear all `aerolog_*` localStorage settings.

### 2026.04.12a
- Added up/down controls for reordering saved tabs and queries from their respective modals.
- Changed tab and saved-query list rows to use explicit `edit` buttons.
- Fixed long tab and saved-query text so it wraps inside modal list rows instead of pushing actions out of bounds.
- Changed config export downloads to use local-time filenames like `aerolog-export-YYYYMMDDHHMMSS.json`.

### 2026.04.11a
- Added `sev:` as shorthand for `severity:`.
- Added support for marking one saved query as the startup default.
- Fixed several edge cases in friendly query rewriting.
- Improved hostname alias handling while keeping exact alias matches case-sensitive.
- Improved config export and reset reliability.
- Prevented the page behind a modal from scrolling on small viewports.

### 2026.04.10c
- Blocked duplicate friendly alias names so one friendly name cannot map to multiple systems.
- Rearranged the Settings window.
- Added a GitHub link in the Settings window header.
- Fixed the poll selector so pagination/runtime pause shows `Poll: Off` without overwriting the saved polling preference.
- Changed the mobile-layout breakpoint to 800px and stopped forcing the connection pill to full width in mobile layout.
- Fixed row copy button not copying severity and facility columns.
- Fixed mouse highlight copy inserting a newline between App and Message.

### 2026.04.10b
- Reworked the app into a cleaner modular structure for ongoing development.
- Hardened query rewriting so friendly fields, wildcard handling, and alias-aware host matching behave more consistently.
- Rebuilt polling, refresh arbitration, and progress-bar timing to reduce race conditions and keep the poll countdown aligned with actual request timing.
- Cleaned up event wiring, state handling, and config validation to make the UI less fragile.
- Added defensive work around mobile message-text inflation and other UI rough edges.

### 2026.04.10a
- Added site icon support.
- Expanded the friendly query rewrite system so common field names are easier to search.
- Changed facility searching so `facility:` means the displayed facility name, while `facility_num:` targets the numeric backend field.
- Fixed query parsing bugs around `=` and wildcard handling.
- Set default polling to Off.

### 2026.04.09b
- Changed server handling so bare host entries assume HTTPS without rewriting the saved or displayed value.
- Reworked the server status pill behavior and polling state handling.
- Fixed tab and alias wildcard matching so exact means exact and `*` enables fuzzy matching.
- Removed old debug code.
- Did a general optimization and cleanup pass.

### 2026.04.09a
- Added saved queries.

### 2026.04.08a
- Initial release.
