# Aerolog

Aerolog is single-file HTML frontend for VictoriaLogs. It is essentially VMUI with tabbing for device grouping and aliasing for easy lookups.

This project is vibe coded. The heavy lifting is done by LLMs with my oversight and extensive testing.

## What it does

- Collect logs from a VictoriaLogs server with configurable polling intervals
- Filter by hostname tabs you define yourself
- Search using LogsQL with friendly shortcuts like `host:`, `app:`, `severity:`
- Map ugly hostnames or IPs to friendly names with aliases
- Severity and facility columns auto-extracted from syslog priority
- Resizable columns, persisted across reloads
- Light, dark, and system themes
- Pagination with proper page numbers, not just next/prev
- Connection status pill with response time and a poll-countdown bar
- Mobile responsive (kind of, see notes below)
- Backup and restore your config as JSON

## What it does not do

- It does not ingest logs. You need rsyslog, syslog-ng, vector, fluentd, or whatever you already use to get logs into VictoriaLogs. Aerolog only reads them.
- It does not do alerting. Use vmalert or whatever else you like.
- It does not do auth. Put it behind nginx basic auth, vmauth, a VPN, or something else. The dashboard talks directly to VictoriaLogs over HTTP, so secure that link however you secure your other internal tooling.
- It does not have a backend. Everything lives in the browser. Settings persist to localStorage. There is no server-side state.

## Setup
Once you have VictoriaLogs running, just use the in-browser configuration setup of Aerolog to point it at your VictoriaLogs instance.


## Configuration that lives in the UI

Click the gear icon in the top right of the page.

- **Theme**: light, dark, or follow system
- **Server URL**: where Aerolog talks to VictoriaLogs
- **Backup / Restore**: export your tabs, aliases, columns, and settings to a JSON file you can re-import on another browser or after a reset

### Tabs

Click "Tabs" in the tab strip to manage hostname-based filter tabs. Each tab is a name plus a list of hostnames. Hostnames support `*` wildcards (`web-*`, `*-prod`, etc). Friendly hostnames from the alias list also work. When a tab is active, only logs from those hosts will be visible in the log display.

### Aliases

Click "Aliases" in the tab strip to set up hostname mappings. Format is one per line, `raw = friendly`. Example:

```
10.0.0.5 = router-01
192.168.1.50 = firewall
super-long-host-name = shortname
```

Aliases apply everywhere: the displayed hostname column, tab definitions, and search queries. So `host:router-01` will find logs from `10.0.0.5`.

## Search syntax

Aerolog passes queries straight through to VictoriaLogs as LogsQL with a few friendly rewrites:

| You type                     | Becomes                                |
|------------------------------|----------------------------------------|
| `error`                      | searches `_msg` for "error"            |
| `host:router-01`             | `hostname:"10.0.0.5"` (alias resolved) |
| `app:sshd`                   | `app_name:sshd`                        |
| `msg:fail` or `message:fail` | `_msg:fail`                            |
| `severity:<4`                | matches err, crit, alert, emerg        |
| `severity:3`                 | matches only err                       |

The full LogsQL spec lives in the VictoriaLogs docs. Anything legal there works in the search box.

## Polling and the connection pill

The pill ay the top of the page is the connection status indicator. It shows:

- The configured server URL
- A colored dot indicating state
- A progress bar at the bottom that fills over the polling interval to indicate the amount of time until the next poll

Dot colors:

- Green: last poll succeeded, no problems
- Red:   last poll failed (will retry)
- Gray:  polling is intentionally paused by user

When you pause polling (Poll: Off in the toolbar), the progress bar disappears entirely and the dot goes gray. When you resume, an immediate poll fires and the bar starts from zero, in sync with the first poll.

## The settings that matter

In the toolbar:

- **Poll**: how often to refresh. Options are Off, 1s, 5s, 10s, 30s, 1m.
- **Rows**: how many rows to display per page. 25 to 1000.
- **Last**: time range to query, from 5 minutes back to 1 year.

These all save automatically across reloads.

## Pagination

The page numbers at the bottom let you walk back through history. As soon as you leave page 1, polling automatically pauses (because new logs would shift the offsets and confuse things). When you come back to page 1, polling stays paused until you manually re-enable it. This is intentional. If you re-enable polling while on a non-page-1 view, the page snaps back to 1 first.
