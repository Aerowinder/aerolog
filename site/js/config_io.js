(function () {
  const App = window.Aerolog;

  function exportFilename(date = new Date()) {
    const pad = (value) => String(value).padStart(2, '0');
    const stamp = [
      date.getFullYear(),
      pad(date.getMonth() + 1),
      pad(date.getDate()),
      pad(date.getHours()),
      pad(date.getMinutes()),
      pad(date.getSeconds()),
    ].join('');
    const hostname = window.location && window.location.hostname;
    const prefix = hostname || 'aerolog-export';
    return `${prefix}-${App.SETTINGS_VERSION}-${stamp}.json`;
  }

  function exportColumnWidths(colwidths = App.state.config.logview.colwidths) {
    const exported = {};
    for (const [columnId, width] of Object.entries(colwidths.widths)) {
      const key = App.COL_ID_TO_KEY[columnId];
      if (key) exported[key] = width;
    }
    return exported;
  }

  function importColumnWidths(value) {
    const widths = {};
    const rawWidths = value && typeof value === 'object' && !Array.isArray(value) ? value : {};
    for (const [key, width] of Object.entries(rawWidths)) {
      const columnId = App.COL_KEY_TO_ID[key];
      if (columnId) widths[columnId] = width;
    }
    return { widths };
  }

  function hasCustomTimeRange(timecustom) {
    return Boolean(timecustom && timecustom.start && timecustom.end);
  }

  function buildExportConfig(date = new Date()) {
    const config = App.state.config;
    const logview = {
      rowcount: config.logview.rowcount,
      pollint: config.logview.pollint,
      timerange: config.logview.timerange,
      colwidths: exportColumnWidths(),
    };
    if (hasCustomTimeRange(config.logview.timecustom)) {
      logview.timecustom = { ...config.logview.timecustom };
    }
    const exported = {
      settings_version: App.SETTINGS_VERSION,
      aerolog_version: App.VERSION,
      export_time: date.toISOString(),
      settings: {
        server: config.settings.server,
        theme: config.settings.theme,
        tabvis: { ...config.settings.tabvis },
        logtable: { ...config.settings.logtable },
        fallback: { ...config.settings.fallback },
      },
      logview,
      aliases: { ...config.aliases },
      tabs: config.tabs.slice(),
      queryhist: config.queryhist.slice(),
    };
    if (config.querydef) exported.querydef = config.querydef;
    return exported;
  }

  function applyImportedConfig(config) {
    if (!config || typeof config !== 'object' || Array.isArray(config)) {
      throw new Error('Config must be a JSON object');
    }
    const importVersion = Number(config.settings_version);
    if (!Number.isSafeInteger(importVersion) || importVersion < 100) {
      throw new Error(`Unsupported settings version: ${config.settings_version}`);
    }
    App.settingsMigration.migrate(config, importVersion);
    const settings = config.settings && typeof config.settings === 'object' && !Array.isArray(config.settings) ? config.settings : {};
    const logview = config.logview && typeof config.logview === 'object' && !Array.isArray(config.logview) ? config.logview : {};

    const previousServer = App.state.config.settings.server;
    const nextConfig = App.utils.clone(App.state.config);
    const settingsCfg = nextConfig.settings;
    const logviewCfg = nextConfig.logview;
    let settingsDirty = false;
    let logviewDirty = false;
    let tabsDirty = false;
    let aliasesDirty = false;
    let queryhistDirty = false;
    let querydefDirty = false;
    let themeApplied = null;

    if (settings.server != null) { settingsCfg.server = App.validators.server(settings.server); settingsDirty = true; }
    if (settings.theme != null) { settingsCfg.theme = App.validators.theme(settings.theme); settingsDirty = true; themeApplied = settingsCfg.theme; }
    if (settings.tabvis != null) { settingsCfg.tabvis = App.validators.tabvis(settings.tabvis); settingsDirty = true; }
    if (settings.logtable != null) { settingsCfg.logtable = App.validators.logtable(settings.logtable); settingsDirty = true; }
    if (settings.fallback != null) { settingsCfg.fallback = App.validators.fallback(settings.fallback); settingsDirty = true; }
    if (logview.rowcount != null) { logviewCfg.rowcount = App.validators.rowcount(logview.rowcount); logviewDirty = true; }
    if (logview.pollint != null) { logviewCfg.pollint = App.validators.pollint(logview.pollint); logviewDirty = true; }
    if (logview.timerange != null) { logviewCfg.timerange = App.validators.timerange(logview.timerange); logviewDirty = true; }
    if (logview.timecustom != null || logview.timerange != null) { logviewCfg.timecustom = App.validators.timecustom(logview.timecustom); logviewDirty = true; }
    if (logview.colwidths != null) { logviewCfg.colwidths = App.validators.colwidths(importColumnWidths(logview.colwidths)); logviewDirty = true; }
    if (config.tabs != null) {
      nextConfig.tabs = App.validators.tabs(config.tabs);
      tabsDirty = true;
    }
    if (config.aliases != null) {
      const duplicateFriendly = App.validators.duplicateFriendlyAlias(config.aliases);
      if (duplicateFriendly) throw new Error(`Duplicate friendly alias name: ${duplicateFriendly}`);
      nextConfig.aliases = App.validators.aliases(config.aliases);
      aliasesDirty = true;
    }

    const importedDefaultQuery = config.querydef != null ? App.validators.querydef(config.querydef) : '';
    // Normalize imported history against only the imported default query, not a stale current one.
    // If the imported default is not present in history, drop it rather than creating a ghost startup query.
    if (config.querydef != null || config.queryhist != null) {
      nextConfig.querydef = '';
      querydefDirty = true;
    }
    if (config.queryhist != null) {
      nextConfig.queryhist = App.validators.queryhist(config.queryhist, importedDefaultQuery);
      queryhistDirty = true;
    }
    if (config.querydef != null) {
      const defaultIndex = nextConfig.queryhist.findIndex((entry) => entry.query === importedDefaultQuery);
      nextConfig.querydef = defaultIndex === -1 ? '' : importedDefaultQuery;
      nextConfig.queryhist = App.validators.queryhist(nextConfig.queryhist, nextConfig.querydef);
      queryhistDirty = true;
    }

    if (nextConfig.logview.timerange === 'custom'
      && (!nextConfig.logview.timecustom.start || !nextConfig.logview.timecustom.end)) {
      nextConfig.logview.timerange = App.DEFAULTS.logview.timerange;
      logviewDirty = true;
    }

    // All validation completes before any runtime state or localStorage group changes.
    App.state.config = nextConfig;
    App.state.rebuildAliasReverse();
    const groups = { settings: settingsDirty, logview: logviewDirty, tabs: tabsDirty, aliases: aliasesDirty, queryhist: queryhistDirty, querydef: querydefDirty };
    const saved = Object.entries(groups).filter(([, dirty]) => dirty).map(([group]) => App.state.writeGroup(group));
    if (nextConfig.settings.server !== previousServer) App.state.runtime.polling.pausedForServerChange = true;
    App.state.runtime.activeTabId = 0;
    App.state.runtime.editingTabId = null;
    App.state.runtime.totalCount = null;
    App.state.runtime.totalPages = 1;
    App.state.runtime.importSaved = saved.every(Boolean);
    if (themeApplied) App.utils.applyDocumentTheme(themeApplied, true);
    App.state.runtime.currentPage = 1;
    return App.state.config;
  }

  App.configIo = {
    applyImportedConfig,
    buildExportConfig,
    exportColumnWidths,
    exportFilename,
    importColumnWidths,
  };
})();
