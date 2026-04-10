(function () {
  const App = window.Aerolog;
  const { STORAGE_KEYS, DEFAULTS, validators, utils } = App;

  function loadConfig() {
    return {
      serverUrl: validators.serverUrl(localStorage.getItem(STORAGE_KEYS.serverUrl) || DEFAULTS.serverUrl),
      theme: validators.theme(localStorage.getItem(STORAGE_KEYS.theme) || DEFAULTS.theme),
      pageSize: validators.pageSize(localStorage.getItem(STORAGE_KEYS.pageSize) || DEFAULTS.pageSize),
      pollInterval: validators.pollInterval(localStorage.getItem(STORAGE_KEYS.pollInterval) || DEFAULTS.pollInterval),
      timeRange: validators.timeRange(localStorage.getItem(STORAGE_KEYS.timeRange) || DEFAULTS.timeRange),
      tabs: validators.tabs(utils.parseJson(localStorage.getItem(STORAGE_KEYS.tabs), [])),
      aliases: validators.aliases(utils.parseJson(localStorage.getItem(STORAGE_KEYS.aliases), {})),
      queries: validators.queries(utils.parseJson(localStorage.getItem(STORAGE_KEYS.queries), [])),
      columnLayout: validators.columnLayout(utils.parseJson(localStorage.getItem(STORAGE_KEYS.columns), null)),
    };
  }

  function createRuntime() {
    return {
      activeTabId: 0,
      editingTabId: null,
      editingQueryId: null,
      currentPage: 1,
      totalPages: 1,
      totalCount: 0,
      currentLogs: [],
      committedSearch: '',
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
        mode: 'paused',
        timerId: null,
        scheduleToken: 0,
        nextPollAt: 0,
        pausedForNavigation: false,
        animation: null,
      },
    };
  }

  App.state = {
    config: loadConfig(),
    runtime: createRuntime(),
  };

  App.state.rebuildAliasReverse = function rebuildAliasReverse() {
    const reverse = {};
    for (const [raw, friendly] of Object.entries(App.state.config.aliases)) {
      reverse[friendly] = raw;
    }
    App.state.runtime.aliasReverse = reverse;
  };

  App.derive = {
    pollIntervalMs() {
      const value = parseInt(App.state.config.pollInterval, 10);
      return Number.isFinite(value) ? value * 1000 : 0;
    },
    displayServerUrl() {
      return utils.displayServerUrl(App.state.config.serverUrl);
    },
    apiBase() {
      return utils.normalizeServerUrl(App.state.config.serverUrl);
    },
    canAutoPoll() {
      const { config, runtime } = App.state;
      return config.pollInterval !== 'off' && runtime.currentPage === 1 && !runtime.polling.pausedForNavigation;
    },
    effectivePollInterval() {
      return App.derive.canAutoPoll() ? App.state.config.pollInterval : 'off';
    },
    showProgressBar() {
      return App.state.config.pollInterval !== 'off';
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
      return {
        state: autoPolling ? 'ok' : 'paused',
        text: host,
        title: autoPolling ? host : 'polling paused',
      };
    },
  };

  App.persist = {
    serverUrl(value) {
      App.state.config.serverUrl = validators.serverUrl(value);
      localStorage.setItem(STORAGE_KEYS.serverUrl, App.state.config.serverUrl);
      return App.state.config.serverUrl;
    },
    theme(value) {
      App.state.config.theme = validators.theme(value);
      localStorage.setItem(STORAGE_KEYS.theme, App.state.config.theme);
      return App.state.config.theme;
    },
    pageSize(value) {
      App.state.config.pageSize = validators.pageSize(value);
      localStorage.setItem(STORAGE_KEYS.pageSize, App.state.config.pageSize);
      return App.state.config.pageSize;
    },
    pollInterval(value) {
      App.state.config.pollInterval = validators.pollInterval(value);
      localStorage.setItem(STORAGE_KEYS.pollInterval, App.state.config.pollInterval);
      return App.state.config.pollInterval;
    },
    timeRange(value) {
      App.state.config.timeRange = validators.timeRange(value);
      localStorage.setItem(STORAGE_KEYS.timeRange, App.state.config.timeRange);
      return App.state.config.timeRange;
    },
    tabs(value) {
      App.state.config.tabs = validators.tabs(value);
      localStorage.setItem(STORAGE_KEYS.tabs, JSON.stringify(App.state.config.tabs));
      return App.state.config.tabs;
    },
    aliases(value) {
      App.state.config.aliases = validators.aliases(value);
      localStorage.setItem(STORAGE_KEYS.aliases, JSON.stringify(App.state.config.aliases));
      App.state.rebuildAliasReverse();
      return App.state.config.aliases;
    },
    queries(value) {
      App.state.config.queries = validators.queries(value);
      localStorage.setItem(STORAGE_KEYS.queries, JSON.stringify(App.state.config.queries));
      return App.state.config.queries;
    },
    columnLayout(value) {
      App.state.config.columnLayout = validators.columnLayout(value);
      localStorage.setItem(STORAGE_KEYS.columns, JSON.stringify(App.state.config.columnLayout));
      return App.state.config.columnLayout;
    },
  };

  App.actions = App.actions || {};

  App.actions.setTheme = function setTheme(theme, options = {}) {
    const nextTheme = App.persist.theme(theme);
    utils.applyDocumentTheme(nextTheme, options.disableTransitions !== false);
    if (App.render) App.render.renderThemeButtons();
    return nextTheme;
  };

  App.actions.resetConfig = function resetConfig() {
    for (const key of Object.values(STORAGE_KEYS)) {
      localStorage.removeItem(key);
    }
    App.state.config = loadConfig();
    App.state.runtime = createRuntime();
    App.state.rebuildAliasReverse();
    utils.applyDocumentTheme(App.state.config.theme, true);
  };

  App.state.rebuildAliasReverse();
  utils.applyDocumentTheme(App.state.config.theme, false);
})();
