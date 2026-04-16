(function () {
  const App = window.Aerolog = window.Aerolog || {};

  App.VERSION = '1.00';

  App.COLUMN_DEFS = {
    '_time':    { label: 'Timestamp', width: 220, exportKey: 'time',     className: 'ts'   },
    'hostname': { label: 'Hostname',  width: 200, exportKey: 'hostname', className: 'host' },
    'priority': { label: 'Severity',  width: 130, exportKey: 'severity', className: ''     },
    'facility': { label: 'Facility',  width: 120, exportKey: 'facility', className: 'app'  },
    'app_name': { label: 'App',       width: 180, exportKey: 'app',      className: 'app'  },
    '_msg':     { label: 'Message',   width: null,exportKey: null,       className: 'msg'  },
  };
  App.COLUMN_ORDER = Object.keys(App.COLUMN_DEFS);
  App.DEFAULT_COLUMN_LAYOUT = {
    widths: Object.fromEntries(Object.entries(App.COLUMN_DEFS).filter(([, def]) => def.width != null).map(([id, def]) => [id, def.width]))
  };
  App.COL_ID_TO_KEY = Object.fromEntries(Object.entries(App.COLUMN_DEFS).filter(([, def]) => def.exportKey).map(([id, def]) => [id, def.exportKey]));
  App.COL_KEY_TO_ID = Object.fromEntries(Object.entries(App.COL_ID_TO_KEY).map(([id, key]) => [key, id]));

  // Shape below mirrors the export JSON and the grouped localStorage blobs. Keep them in sync:
  // aerolog_settings ↔ settings, aerolog_logview ↔ logview, aerolog_aliases ↔ aliases,
  // aerolog_tabs ↔ tabs, aerolog_querydef ↔ querydef, aerolog_queryhist ↔ queryhist.
  App.DEFAULTS = {
    settings: {
      server: 'localhost:9428',
      theme: 'system',
      tabvis: { tabs: true, aliases: true, heartbeats: true },
      logtable: { msglines: '3', expand: true, copy: true, filter: true },
    },
    logview: {
      rowcount: '100',
      pollint: 'off',
      timerange: '1h',
      timecustom: { start: '', end: '' },
      colwidths: { widths: { ...App.DEFAULT_COLUMN_LAYOUT.widths } },
    },
    aliases: {},
    tabs: [],
    querydef: '',
    queryhist: [],
  };

  App.STORAGE_KEYS = {
    settings: 'aerolog_settings',
    logview: 'aerolog_logview',
    aliases: 'aerolog_aliases',
    tabs: 'aerolog_tabs',
    querydef: 'aerolog_querydef',
    queryhist: 'aerolog_queryhist',
  };

  App.VALID = {
    themes: ['light', 'dark', 'system'],
    pollIntervals: ['off', '1', '5', '10', '30', '60'],
    pageSizes: ['25', '50', '100', '250', '500', '1000'],
    timeRanges: ['5m', '15m', '30m', '1h', '3h', '6h', '12h', '1d', '1w', '30d', '90d', '180d', '1y', 'custom'],
  };

  App.PAGE_BUTTONS = 15;
  App.MOBILE_MAX_WIDTH = 1000;
  App.QUERY_HISTORY_PINNED_LIMIT = 10;
  App.QUERY_HISTORY_LIMIT = 10;
  App.QUERY_HISTORY_ENTRY_MAX = 500;
  App.REQUEST_TIMEOUT_MS = 30000;
  App.SETTINGS_VERSION = 100;

  App.SEVERITY_SHORT = {0:'emerg',1:'alert',2:'crit',3:'err',4:'warn',5:'notice',6:'info',7:'debug'};
  App.SEVERITY_CLASS = {0:'pri-emerg',1:'pri-alert',2:'pri-crit',3:'pri-err',4:'pri-warn',5:'pri-notice',6:'pri-info',7:'pri-debug'};

  App.FIELD_KINDS = Object.freeze({
    HOST: 'host',
    FIELD_GLOB: 'field_glob',
    FIELD_ALIAS: 'field_alias',
  });

  App.FIELD_REGISTRY = {
    app_name:      { target: 'app_name', kind: App.FIELD_KINDS.FIELD_GLOB },
    app:           { target: 'app_name', kind: App.FIELD_KINDS.FIELD_GLOB },
    application:   { target: 'app_name', kind: App.FIELD_KINDS.FIELD_GLOB },
    facility_keyword: { target: 'facility_keyword', kind: App.FIELD_KINDS.FIELD_GLOB },
    facility:      { target: 'facility_keyword', kind: App.FIELD_KINDS.FIELD_GLOB },
    fac:           { target: 'facility_keyword', kind: App.FIELD_KINDS.FIELD_GLOB },
    facility_num:  { target: 'facility', kind: App.FIELD_KINDS.FIELD_GLOB },
    sev:           { target: 'severity', kind: App.FIELD_KINDS.FIELD_ALIAS },
    host:          { target: 'hostname', kind: App.FIELD_KINDS.HOST },
    hostname:      { target: 'hostname', kind: App.FIELD_KINDS.HOST },
    message:       { target: '_msg', kind: App.FIELD_KINDS.FIELD_GLOB },
    msg:           { target: '_msg', kind: App.FIELD_KINDS.FIELD_GLOB },
    _msg:          { target: '_msg', kind: App.FIELD_KINDS.FIELD_GLOB },
    time:          { target: '_time', kind: App.FIELD_KINDS.FIELD_GLOB },
    timestamp:     { target: '_time', kind: App.FIELD_KINDS.FIELD_GLOB },
    _time:         { target: '_time', kind: App.FIELD_KINDS.FIELD_GLOB },
  };

  App.dom = {
    byId(id) { return document.getElementById(id); },
    q(sel, root = document) { return root.querySelector(sel); },
    qa(sel, root = document) { return Array.from(root.querySelectorAll(sel)); },
  };

  App.isMobileMode = function isMobileMode() {
    return typeof window.matchMedia === 'function' && window.matchMedia(`(max-width: ${App.MOBILE_MAX_WIDTH}px)`).matches;
  };

  App.utils = {
    parseJson(raw, fallback) {
      try {
        return raw ? JSON.parse(raw) : fallback;
      } catch {
        return fallback;
      }
    },
    clone(value) {
      return structuredClone(value);
    },
    disableThemeTransitionsTemporarily() {
      document.documentElement.classList.add('theme-switching');
      requestAnimationFrame(() => requestAnimationFrame(() => document.documentElement.classList.remove('theme-switching')));
    },
    applyDocumentTheme(theme, disableTransitions = false) {
      if (disableTransitions) App.utils.disableThemeTransitionsTemporarily();
      document.documentElement.setAttribute('data-theme', theme);
    },
    normalizeServerUrl(raw) {
      const trimmed = String(raw || '').trim().replace(/\/+$/, '');
      if (!trimmed) return App.DEFAULTS.settings.server;
      if (/^https?:\/\//i.test(trimmed)) return trimmed;
      return `https://${trimmed}`;
    },
    displayServerUrl(raw) {
      return String(raw || '').trim().replace(/\/+$/, '') || App.DEFAULTS.settings.server;
    },
    escapeHtml(value) {
      if (value == null) return '';
      return String(value)
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#39;');
    },
    formatTime(value) {
      if (!value) return '';
      const d = new Date(value);
      if (Number.isNaN(d.getTime())) return value;
      const pad = (n) => String(n).padStart(2, '0');
      return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`;
    },
    formatLogsQlTime(value) {
      const date = new Date(value);
      if (Number.isNaN(date.getTime())) return '';
      return date.toISOString().replace(/\.\d{3}Z$/, 'Z');
    },
    regexEscape(value) {
      return String(value).replace(/[.+?^${}()|[\]\\]/g, '\\$&');
    },
    wildcardToRegex(pattern) {
      return '^' + App.utils.regexEscape(pattern).replace(/\*/g, '.*') + '$';
    },
    hasWildcard(value) {
      return String(value || '').includes('*');
    },
    escapeLogsQlString(value) {
      return String(value).replace(/\\/g, '\\\\').replace(/"/g, '\\"');
    },
    quoteLogsQlValue(value) {
      return `"${App.utils.escapeLogsQlString(value)}"`;
    },
    uniq(items) {
      return Array.from(new Set(items));
    },
    moveById(items, id, direction) {
      if (!Array.isArray(items) || ![1, -1].includes(direction)) return null;
      const index = items.findIndex((item) => item && item.id === id);
      if (index === -1) return null;
      const nextIndex = index + direction;
      if (nextIndex < 0 || nextIndex >= items.length) return null;
      const next = items.slice();
      const [item] = next.splice(index, 1);
      next.splice(nextIndex, 0, item);
      return next;
    },
    showAlert(message) {
      if (App.render && typeof App.render.showToast === 'function') {
        App.render.showToast(message);
        return;
      }
      window.alert(message);
    },
  };

  const boolFlag = (value) => value !== false;

  App.validators = {
    server(value) {
      const trimmed = String(value || '').trim().replace(/\/+$/, '');
      return trimmed || App.DEFAULTS.settings.server;
    },
    theme(value) {
      return App.VALID.themes.includes(value) ? value : App.DEFAULTS.settings.theme;
    },
    tabvisFlag: boolFlag,
    tabvis(value) {
      const d = App.DEFAULTS.settings.tabvis;
      if (!value || typeof value !== 'object' || Array.isArray(value)) return { ...d };
      return {
        tabs: value.tabs !== false,
        aliases: value.aliases !== false,
        heartbeats: value.heartbeats !== false,
      };
    },
    msglines(value) {
      const normalized = String(value ?? '').trim();
      return /^[1-5]$/.test(normalized) ? normalized : App.DEFAULTS.settings.logtable.msglines;
    },
    logtableFlag: boolFlag,
    logtable(value) {
      const d = App.DEFAULTS.settings.logtable;
      if (!value || typeof value !== 'object' || Array.isArray(value)) return { ...d };
      return {
        msglines: App.validators.msglines(value.msglines),
        expand: value.expand !== false,
        copy: value.copy !== false,
        filter: value.filter !== false,
      };
    },
    rowcount(value) {
      const normalized = String(value ?? '').trim();
      return App.VALID.pageSizes.includes(normalized) ? normalized : App.DEFAULTS.logview.rowcount;
    },
    pollint(value) {
      const normalized = String(value ?? '').trim();
      return App.VALID.pollIntervals.includes(normalized) ? normalized : App.DEFAULTS.logview.pollint;
    },
    timerange(value) {
      const normalized = String(value ?? '').trim();
      return App.VALID.timeRanges.includes(normalized) ? normalized : App.DEFAULTS.logview.timerange;
    },
    timecustom(value) {
      const empty = { ...App.DEFAULTS.logview.timecustom };
      if (!value || typeof value !== 'object' || Array.isArray(value)) return empty;
      const startDate = new Date(value.start);
      const endDate = new Date(value.end);
      if (Number.isNaN(startDate.getTime()) || Number.isNaN(endDate.getTime())) return empty;
      if (startDate.getTime() >= endDate.getTime()) return empty;
      return {
        start: startDate.toISOString(),
        end: endDate.toISOString(),
      };
    },
    colwidths(value) {
      const widths = App.utils.clone(App.DEFAULT_COLUMN_LAYOUT.widths);
      const rawWidths = value && typeof value === 'object' && value.widths && typeof value.widths === 'object' ? value.widths : {};
      for (const [id, width] of Object.entries(rawWidths)) {
        if (!(id in widths)) continue;
        const n = parseInt(width, 10);
        if (Number.isFinite(n) && n >= 60) widths[id] = n;
      }
      return { widths };
    },
    settings(value) {
      const src = (value && typeof value === 'object' && !Array.isArray(value)) ? value : {};
      return {
        server: App.validators.server(src.server),
        theme: App.validators.theme(src.theme),
        tabvis: App.validators.tabvis(src.tabvis),
        logtable: App.validators.logtable(src.logtable),
      };
    },
    logview(value) {
      const src = (value && typeof value === 'object' && !Array.isArray(value)) ? value : {};
      return {
        rowcount: App.validators.rowcount(src.rowcount),
        pollint: App.validators.pollint(src.pollint),
        timerange: App.validators.timerange(src.timerange),
        timecustom: App.validators.timecustom(src.timecustom),
        colwidths: App.validators.colwidths(src.colwidths),
      };
    },
    aliases(value) {
      if (!value || typeof value !== 'object' || Array.isArray(value)) return Object.create(null);
      const out = Object.create(null);
      for (const [raw, friendly] of Object.entries(value)) {
        const rawKey = String(raw || '').trim();
        const friendlyValue = String(friendly || '').trim();
        if (rawKey && friendlyValue) out[rawKey] = friendlyValue;
      }
      return out;
    },
    aliasesText(text) {
      const out = Object.create(null);
      for (const line of String(text || '').split('\n')) {
        const trimmed = line.trim();
        if (!trimmed) continue;
        const idx = trimmed.indexOf('=');
        if (idx < 0) continue;
        const raw = trimmed.slice(0, idx).trim();
        const friendly = trimmed.slice(idx + 1).trim();
        if (raw && friendly) out[raw] = friendly;
      }
      return out;
    },
    duplicateFriendlyAlias(value) {
      if (!value || typeof value !== 'object' || Array.isArray(value)) return '';
      const seen = new Map();
      for (const [raw, friendly] of Object.entries(value)) {
        const rawKey = String(raw || '').trim();
        const friendlyValue = String(friendly || '').trim();
        if (!rawKey || !friendlyValue) continue;
        const lookup = friendlyValue.toLowerCase();
        if (seen.has(lookup) && seen.get(lookup) !== rawKey) {
          return friendlyValue;
        }
        seen.set(lookup, rawKey);
      }
      return '';
    },
    tabs(value) {
      if (!Array.isArray(value)) return [];
      const seen = new Set();
      const out = [];
      for (const tab of value) {
        const id = Number(tab && tab.id);
        const name = String(tab && tab.name || '').trim();
        const hosts = Array.isArray(tab && tab.hosts) ? App.validators.hostList(tab.hosts) : [];
        if (!Number.isFinite(id) || !name || seen.has(id)) continue;
        seen.add(id);
        out.push({ id, name, hosts });
      }
      return out;
    },
    hostList(list) {
      if (!Array.isArray(list)) return [];
      return App.utils.uniq(list.map((entry) => String(entry || '').trim()).filter(Boolean));
    },
    queryhist(value, defaultQuery = '') {
      if (!Array.isArray(value)) return [];
      const defaultText = App.validators.querydef(defaultQuery);
      const seen = new Set();
      let defaultEntry = null;
      const pinned = [];
      const unpinned = [];
      for (const entry of value) {
        if (!entry || typeof entry !== 'object' || Array.isArray(entry)) continue;
        const query = String(entry.query || '').trim().slice(0, App.QUERY_HISTORY_ENTRY_MAX);
        if (!query || seen.has(query)) continue;
        seen.add(query);
        if (query === defaultText) {
          defaultEntry = { query, pinned: true };
        } else {
          (entry.pinned === true ? pinned : unpinned).push({ query, pinned: entry.pinned === true });
        }
      }
      const pinnedLimit = Math.max(0, App.QUERY_HISTORY_PINNED_LIMIT - (defaultEntry ? 1 : 0));
      return (defaultEntry ? [defaultEntry] : [])
        .concat(pinned.slice(0, pinnedLimit), unpinned.slice(0, App.QUERY_HISTORY_LIMIT));
    },
    querydef(value) {
      return String(value || '').trim().slice(0, App.QUERY_HISTORY_ENTRY_MAX);
    },
  };
})();
