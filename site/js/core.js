(function () {
  const App = window.Aerolog = window.Aerolog || {};

  App.VERSION = '2026.04.10b';

  App.DEFAULTS = {
    serverUrl: 'localhost:9428',
    theme: 'system',
    pageSize: '100',
    pollInterval: 'off',
    timeRange: '1h',
  };

  App.VALID = {
    themes: ['light', 'dark', 'system'],
    pollIntervals: ['off', '1', '5', '10', '30', '60'],
    pageSizes: ['25', '50', '100', '250', '500', '1000'],
    timeRanges: ['5m', '15m', '30m', '1h', '3h', '6h', '12h', '1d', '1w', '30d', '90d', '180d', '1y'],
  };

  App.STORAGE_KEYS = {
    serverUrl: 'aerolog_server',
    tabs: 'aerolog_tabs',
    theme: 'aerolog_theme',
    pageSize: 'aerolog_page_size',
    pollInterval: 'aerolog_poll_interval',
    timeRange: 'aerolog_time_range',
    aliases: 'aerolog_aliases',
    columns: 'aerolog_columns',
    queries: 'aerolog_queries',
  };

  App.PAGE_BUTTONS = 6;

  App.SEVERITY_SHORT = {0:'emerg',1:'alert',2:'crit',3:'err',4:'warn',5:'notice',6:'info',7:'debug'};
  App.SEVERITY_CLASS = {0:'pri-emerg',1:'pri-alert',2:'pri-crit',3:'pri-err',4:'pri-warn',5:'pri-notice',6:'pri-info',7:'pri-debug'};

  App.FIELD_REGISTRY = {
    app_name:      { target: 'app_name', kind: 'field_glob' },
    app:           { target: 'app_name', kind: 'field_glob' },
    application:   { target: 'app_name', kind: 'field_glob' },
    facility_keyword: { target: 'facility_keyword', kind: 'field_glob' },
    facility:      { target: 'facility_keyword', kind: 'field_glob' },
    fac:           { target: 'facility_keyword', kind: 'field_glob' },
    facility_num:  { target: 'facility', kind: 'field_glob' },
    host:          { target: 'hostname', kind: 'host' },
    hostname:      { target: 'hostname', kind: 'host' },
    message:       { target: '_msg', kind: 'field_glob' },
    msg:           { target: '_msg', kind: 'field_glob' },
    _msg:          { target: '_msg', kind: 'field_glob' },
    time:          { target: '_time', kind: 'field_glob' },
    timestamp:     { target: '_time', kind: 'field_glob' },
    _time:         { target: '_time', kind: 'field_glob' },
  };

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

  App.dom = {
    byId(id) { return document.getElementById(id); },
    q(sel, root = document) { return root.querySelector(sel); },
    qa(sel, root = document) { return Array.from(root.querySelectorAll(sel)); },
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
      if (!trimmed) return App.DEFAULTS.serverUrl;
      if (/^https?:\/\//i.test(trimmed)) return trimmed;
      return `https://${trimmed}`;
    },
    displayServerUrl(raw) {
      return String(raw || '').trim().replace(/\/+$/, '') || App.DEFAULTS.serverUrl;
    },
    escapeHtml(value) {
      if (value == null) return '';
      return String(value)
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;');
    },
    formatTime(value) {
      if (!value) return '';
      const d = new Date(value);
      if (Number.isNaN(d.getTime())) return value;
      const pad = (n) => String(n).padStart(2, '0');
      return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`;
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
      return `"${String(value).replace(/"/g, '\\"')}"`;
    },
    uniq(items) {
      return Array.from(new Set(items));
    },
    showAlert(message) {
      window.alert(message);
    },
  };

  App.validators = {
    theme(value) {
      return App.VALID.themes.includes(value) ? value : App.DEFAULTS.theme;
    },
    serverUrl(value) {
      const trimmed = String(value || '').trim().replace(/\/+$/, '');
      return trimmed || App.DEFAULTS.serverUrl;
    },
    pageSize(value) {
      const normalized = String(value ?? '').trim();
      return App.VALID.pageSizes.includes(normalized) ? normalized : App.DEFAULTS.pageSize;
    },
    pollInterval(value) {
      const normalized = String(value ?? '').trim();
      return App.VALID.pollIntervals.includes(normalized) ? normalized : App.DEFAULTS.pollInterval;
    },
    timeRange(value) {
      const normalized = String(value ?? '').trim();
      return App.VALID.timeRanges.includes(normalized) ? normalized : App.DEFAULTS.timeRange;
    },
    aliases(value) {
      if (!value || typeof value !== 'object' || Array.isArray(value)) return {};
      const out = {};
      for (const [raw, friendly] of Object.entries(value)) {
        const rawKey = String(raw || '').trim();
        const friendlyValue = String(friendly || '').trim();
        if (rawKey && friendlyValue) out[rawKey] = friendlyValue;
      }
      return out;
    },
    aliasesText(text) {
      const out = {};
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
    queries(value) {
      if (!Array.isArray(value)) return [];
      const seen = new Set();
      const out = [];
      for (const item of value) {
        const id = Number(item && item.id);
        const name = String(item && item.name || '').trim();
        const query = String(item && item.query || '').trim();
        if (!Number.isFinite(id) || !name || !query || seen.has(id)) continue;
        seen.add(id);
        out.push({ id, name, query });
      }
      return out;
    },
    columnLayout(value) {
      const widths = App.utils.clone(App.DEFAULT_COLUMN_LAYOUT.widths);
      const rawWidths = value && typeof value === 'object' && value.widths && typeof value.widths === 'object' ? value.widths : {};
      for (const [id, width] of Object.entries(rawWidths)) {
        if (!(id in widths)) continue;
        const n = parseInt(width, 10);
        if (Number.isFinite(n) && n >= 60) widths[id] = n;
      }
      return { widths };
    },
  };
})();
