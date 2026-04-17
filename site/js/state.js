(function () {
  const App = window.Aerolog;
  const { DEFAULTS, STORAGE_KEYS, validators, utils } = App;

  function parseJsonItem(key, fallback) {
    const raw = localStorage.getItem(key);
    return raw == null ? fallback : utils.parseJson(raw, fallback);
  }

  function loadConfig() {
    const settings = validators.settings(parseJsonItem(STORAGE_KEYS.settings, null));
    const logview = validators.logview(parseJsonItem(STORAGE_KEYS.logview, null));
    const aliases = validators.aliases(parseJsonItem(STORAGE_KEYS.aliases, null));
    const tabs = validators.tabs(parseJsonItem(STORAGE_KEYS.tabs, null));
    const querydef = validators.querydef(localStorage.getItem(STORAGE_KEYS.querydef) ?? '');
    const queryhist = validators.queryhist(parseJsonItem(STORAGE_KEYS.queryhist, null), querydef);
    if (logview.timerange === 'custom' && (!logview.timecustom.start || !logview.timecustom.end)) {
      logview.timerange = DEFAULTS.logview.timerange;
    }
    const effectiveQuerydef = queryhist.some((entry) => entry.query === querydef) ? querydef : '';
    return { settings, logview, aliases, tabs, querydef: effectiveQuerydef, queryhist };
  }

  function createRuntime(config) {
    return {
      activeTabId: 0,
      editingTabId: null,
      currentPage: 1,
      totalPages: 1,
      totalCount: 0,
      currentLogs: [],
      committedSearch: config ? config.querydef : '',
      aliasReverse: {},
      lastResponseMs: null,
      lastRefreshCause: 'init',
      connection: {
        kind: 'idle',
        detail: '',
        hasFetched: false,
      },
      request: {
        id: 0,
        controller: null,
        cause: null,
        startedAt: 0,
        timeoutId: null,
      },
      polling: {
        timerId: null,
        scheduleToken: 0,
        nextPollAt: 0,
        pausedForNavigation: false,
        pausedForExpansion: false,
        pausedForServerChange: false,
        animation: null,
      },
      expandedRows: new Set(),
    };
  }

  const initialConfig = loadConfig();

  App.state = {
    config: initialConfig,
    runtime: createRuntime(initialConfig),
  };

  App.state.rebuildAliasReverse = function rebuildAliasReverse() {
    const reverse = Object.create(null);
    for (const [raw, friendly] of Object.entries(App.state.config.aliases)) {
      reverse[friendly] = raw;
    }
    App.state.runtime.aliasReverse = reverse;
  };

  App.derive = {
    pollIntervalMs() {
      const value = parseInt(App.state.config.logview.pollint, 10);
      return Number.isFinite(value) ? value * 1000 : 0;
    },
    displayServerUrl() {
      return utils.displayServerUrl(App.state.config.settings.server);
    },
    apiBase() {
      return utils.normalizeServerUrl(App.state.config.settings.server);
    },
    canAutoPoll() {
      const { config, runtime } = App.state;
      return config.logview.pollint !== 'off'
        && runtime.currentPage === 1
        && !runtime.polling.pausedForNavigation
        && !runtime.polling.pausedForExpansion
        && !runtime.polling.pausedForServerChange;
    },
    effectivePollInterval() {
      return App.derive.canAutoPoll() ? App.state.config.logview.pollint : 'off';
    },
    displayTimeRange() {
      const { timerange, timecustom } = App.state.config.logview;
      if (timerange !== 'custom') return timerange;
      if (!timecustom.start || !timecustom.end) return 'Custom';
      return `${utils.formatTime(timecustom.start)} to ${utils.formatTime(timecustom.end)}`;
    },
    showProgressBar() {
      return App.state.config.logview.pollint !== 'off';
    },
    connectionView() {
      const host = App.derive.displayServerUrl();
      const { connection } = App.state.runtime;
      const autoPolling = App.derive.canAutoPoll();
      if (!connection.hasFetched && connection.kind === 'idle') {
        return { state: '', text: 'not connected', title: '' };
      }
      if (connection.kind === 'err') {
        return {
          state: autoPolling ? 'err' : 'paused',
          text: host,
          title: connection.detail ? `${host} — ${connection.detail}` : host,
        };
      }
      if (connection.kind === 'ok') {
        return {
          state: autoPolling ? 'ok' : 'paused',
          text: host,
          title: autoPolling ? host : 'polling paused',
        };
      }
      return { state: 'paused', text: host, title: 'polling paused' };
    },
  };

  function writeRaw(key, value) {
    try {
      if (value == null) {
        localStorage.removeItem(key);
      } else {
        localStorage.setItem(key, value);
      }
      return true;
    } catch (err) {
      console.error(`[aerolog] failed to persist ${key}:`, err);
      App.toasts.error('Settings could not be saved');
      return false;
    }
  }

  const GROUP_WRITERS = {
    settings() { writeRaw(STORAGE_KEYS.settings, JSON.stringify(App.state.config.settings)); },
    logview() { writeRaw(STORAGE_KEYS.logview, JSON.stringify(App.state.config.logview)); },
    aliases() { writeRaw(STORAGE_KEYS.aliases, JSON.stringify(App.state.config.aliases)); },
    tabs() { writeRaw(STORAGE_KEYS.tabs, JSON.stringify(App.state.config.tabs)); },
    querydef() {
      const value = App.state.config.querydef;
      writeRaw(STORAGE_KEYS.querydef, value ? value : null);
    },
    queryhist() { writeRaw(STORAGE_KEYS.queryhist, JSON.stringify(App.state.config.queryhist)); },
  };
  App.state.writeGroup = (key) => GROUP_WRITERS[key]();

  function setAt(segments, value) {
    let target = App.state.config;
    for (let i = 0; i < segments.length - 1; i += 1) target = target[segments[i]];
    target[segments[segments.length - 1]] = value;
  }

  function makeSetter(path, validatorName) {
    const segments = path.split('.');
    const group = segments[0];
    return function persistLeaf(value) {
      const next = validators[validatorName](value);
      setAt(segments, next);
      GROUP_WRITERS[group]();
      return next;
    };
  }

  function makeQueryhistSetter() {
    return function persistQueryhist(value, options = {}) {
      const defaultQuery = options.defaultQuery ?? App.state.config.querydef;
      const next = validators.queryhist(value, defaultQuery);
      App.state.config.queryhist = next;
      GROUP_WRITERS.queryhist();
      const checks = [App.state.config.querydef, options.defaultQuery].filter(Boolean);
      if (checks.some((query) => !next.some((entry) => entry.query === query))) {
        App.persist.querydef('');
      }
      return next;
    };
  }

  App.persist = {
    settings: {
      server: makeSetter('settings.server', 'server'),
      theme: makeSetter('settings.theme', 'theme'),
      tabvis: {
        tabs: makeSetter('settings.tabvis.tabs', 'tabvisFlag'),
        aliases: makeSetter('settings.tabvis.aliases', 'tabvisFlag'),
        heartbeats: makeSetter('settings.tabvis.heartbeats', 'tabvisFlag'),
      },
      logtable: {
        msglines: makeSetter('settings.logtable.msglines', 'msglines'),
        expand: makeSetter('settings.logtable.expand', 'logtableFlag'),
        copy: makeSetter('settings.logtable.copy', 'logtableFlag'),
        filter: makeSetter('settings.logtable.filter', 'logtableFlag'),
      },
    },
    logview: {
      rowcount: makeSetter('logview.rowcount', 'rowcount'),
      pollint: makeSetter('logview.pollint', 'pollint'),
      timerange: makeSetter('logview.timerange', 'timerange'),
      timecustom: makeSetter('logview.timecustom', 'timecustom'),
      colwidths: makeSetter('logview.colwidths', 'colwidths'),
    },
    aliases(value) {
      const next = validators.aliases(value);
      App.state.config.aliases = next;
      GROUP_WRITERS.aliases();
      App.state.rebuildAliasReverse();
      return next;
    },
    tabs: makeSetter('tabs', 'tabs'),
    querydef: makeSetter('querydef', 'querydef'),
    queryhist: makeQueryhistSetter(),
  };

  App.state.resetToDefaults = function resetToDefaults() {
    for (let index = localStorage.length - 1; index >= 0; index -= 1) {
      const key = localStorage.key(index);
      if (key && key.startsWith('aerolog_')) localStorage.removeItem(key);
    }
    App.state.config = loadConfig();
    App.state.runtime = createRuntime(App.state.config);
    App.state.rebuildAliasReverse();
    utils.applyDocumentTheme(App.state.config.settings.theme, true);
  };

  App.state.rebuildAliasReverse();
  utils.applyDocumentTheme(App.state.config.settings.theme, false);
})();
