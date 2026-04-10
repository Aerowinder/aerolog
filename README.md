# Aerolog

Aerolog is a lightweight browser frontend for VictoriaLogs. It keeps the footprint small, stays browser-only, and focuses on making day-to-day log browsing less annoying.

This project is vibe coded. Most of the heavy lifting was done by LLMs, with human oversight, testing, and a lot of telling the machine to stop being clever.

## What Aerolog is

Aerolog talks directly to VictoriaLogs and gives you a cleaner UI for browsing logs. It is not trying to replace VictoriaLogs, and it is not trying to become a full observability platform. It is a fast, local-state log viewer with a few focused conveniences layered on top.

If VMUI already does everything you need, great. If you want tabs, aliases, saved queries, and friendlier search sugar, that is where Aerolog fits.

## What Aerolog adds

Aerolog is not reinventing logging. It is trying to make common filtering and browsing tasks faster and less tedious.

Current differentiators include:

- **Tabs for host-based filtering.** Build named tabs around groups of devices so you can jump straight to a slice of your environment.
- **Hostname aliases.** Map ugly hostnames or IP-based names to something sane and readable.
- **Alias-aware searching.** Friendly names work in tab definitions and host searches.
- **Saved queries.** VMUI also supports saved queries, so this is not unique to Aerolog, but Aerolog keeps them in the same local browser config as the rest of its UI state.
- **Config backup and restore.** Export your local settings to JSON and import them elsewhere.

## What Aerolog is not

Aerolog is intentionally small in scope.

- It does **not** ingest logs. You still need rsyslog, syslog-ng, vector, fluent-bit, or whatever else you use to ship logs into VictoriaLogs.
- It does **not** do alerting. Use vmalert or another alerting tool for that.
- It does **not** do authentication. Put it behind nginx, vmauth, a VPN, or whatever access control you already trust.
- It does **not** have a backend. Everything lives in the browser. Settings persist in localStorage. There is no server-side state.

## Setup

Once VictoriaLogs is running and reachable from your browser, open Aerolog and point it at your VictoriaLogs instance in the settings modal.

By default, the server field is:

```text
localhost:9428
```

If you enter a server without `http://` or `https://`, Aerolog assumes `https://` internally when making requests, but keeps the field displayed exactly as you typed it.

Examples:

- `localhost:9428` → treated as `https://localhost:9428`
- `http://logs-box:9428` → treated as HTTP
- `https://logs.example.com` → treated as HTTPS

Fresh config defaults:

- Theme: **System**
- Polling: **Off**

## Configuration in the UI

Click the gear icon in the top-right corner of the page.

### Settings

- **Config Management**: export your tabs, aliases, queries, columns, and other UI settings to a JSON file you can import elsewhere, or restore them from backup
- **Theme**: light, dark, or system
- **Server URL**: where Aerolog connects to VictoriaLogs
- **GitHub link**: the Settings modal header includes a direct link to the project page

### Tabs

Use the tab strip to create host-based filter tabs.

Each tab has:
- a tab name
- a list of host entries, one per line

Tab host matching rules:
- No `*` means **exact match only**
- `*` enables wildcard matching
- Aliases are supported
- Wildcards also work with aliased hostnames

Examples:

```text
pve2
web-*
*-prod
router-01
```

This means `pve2` matches only `pve2`, while `*-prod` matches anything ending in `-prod`.

### Aliases

Aliases map raw hostnames or IPs to friendly names.

Format:

```text
raw = friendly
```

Example:

```text
10.0.0.5 = router-01
192.168.1.50 = firewall
UPS(192.168.1.18) = ups-01
super-long-host-name = shortname
```

Aliases apply in several places:
- hostname display in the table
- tab definitions
- host query rewrites

Friendly alias names must be unique. Aerolog does not allow multiple raw systems to share the same friendly alias.

So `host:router-01` can resolve to the raw device name or IP that actually exists in the logs.

### Queries

Use the Queries UI to save frequently used searches.

This is handy for ugly filters you do not want to retype, like noisy auth failures, device-specific searches, or severity filters with extra conditions.

## Search syntax

Aerolog sends queries through to VictoriaLogs as LogsQL, with some friendly rewrites and wildcard sugar layered on top.

One important detail: `*` wildcard handling is **Aerolog behavior**, not official LogsQL syntax. Native LogsQL uses exact matching with `:=` and regex matching with `:~`.

### Friendly rewrites

| You type                          | Aerolog targets    |
|-----------------------------------|--------------------|
| `host:` or `hostname:`            | `hostname`         |
| `app:` or `application:`          | `app_name`         |
| `msg:` or `message:`              | `_msg`             |
| `time:` or `timestamp:`           | `_time`            |
| `fac:` or `facility:`             | `facility_keyword` |
| `facility_num:`                   | `facility`         |

### Matching behavior

For friendly rewritten fields:

- No `*` means **exact match**
- `*` means wildcard matching
- Explicit operators like `:=` and `:~` are still respected as exact and regex matches

Examples:

```text
application:sshd
application:sshd*
fac:auth
fac:*auth
facility_num:4
host:router-01
```

Roughly speaking, those become:

```text
app_name:="sshd"
app_name:~"^sshd.*$"
facility_keyword:="auth"
facility_keyword:~"^.*auth$"
facility:="4"
hostname:="10.0.0.5"
```

### Bare terms vs `msg:`

This is worth calling out because it can surprise people.

A bare search term like:

```text
error
```

behaves like the normal VictoriaLogs-style message text search. It is basically free-text message searching.

By contrast, `msg:` and `message:` go through Aerolog's friendly field rewrite system. That means they follow the same exact-versus-wildcard rules as the other friendly fields:

- `msg:error` → exact `_msg` match behavior
- `msg:error*` → wildcard `_msg` match behavior

So even though both *feel* like “message searching,” they enter the system through different paths.

### Severity shortcuts

Aerolog also supports severity convenience filtering such as:

- `severity:<4`
- `severity:3`

Anything valid in LogsQL should still work. Aerolog is helping a little, not inventing a whole replacement query language.

## Polling and the connection pill

The status pill at the top of the page shows:

- the configured server value
- a colored state indicator
- a progress bar along the bottom that tracks time until the next poll

Dot colors:

- **Green**: last poll succeeded and polling is active
- **Red**: last poll failed and polling is active
- **Gray**: polling is paused

A few behavior notes:

- The configured hostname stays visible in the pill even if polling fails
- If polling is paused, the indicator goes gray even if the server is offline
- If pagination or other runtime state pauses effective polling, the Poll control displays `Off` without overwriting the saved poll preference
- The progress bar remains visible as part of the pill state
- The next poll is anchored to **when the request is sent**, not when the response returns
- Manual refresh-causing actions re-anchor the next poll countdown from that send time

## Toolbar settings

The main toolbar controls the live view:

- **Poll**: refresh interval. Off, 1s, 5s, 10s, 30s, 1m
- **Rows**: rows per page. 25 to 1000
- **Last**: query time range, from 5 minutes to 1 year

These settings persist in localStorage.

## Pagination behavior

The pager at the bottom lets you walk back through history.

When you leave page 1, polling pauses automatically. That is intentional. Live polling while you are paging backward would shift offsets and make the view jump around like an idiot.

Important detail: this does **not** overwrite your saved poll preference. It is a runtime pause, not a settings reset.

When you return to page 1, polling stays paused until you manually turn it back on.

If you enable polling while viewing any page other than page 1, Aerolog snaps back to page 1 first.

## Persistence

Aerolog stores its UI state in the browser using localStorage. That includes things like:

- server setting
- theme
- tabs
- aliases
- saved queries
- selected columns
- toolbar preferences

Because of that, a fresh browser or machine will not have your setup unless you import a previously exported config JSON.

## Assets

Aerolog uses an SVG site icon. Runtime assets can live under `./assets/`, with the favicon currently expected at:

```text
./assets/icons/aerolog.svg
```

## Current design goals

Aerolog is trying to be:

- small
- readable
- easy to run
- easy to back up
- useful without needing a backend or a stack of extra services

It is not trying to become a full observability suite. There are already enough of those, and most of them are bloated.
