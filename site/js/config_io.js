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
    return `aerolog-export-${App.SETTINGS_VERSION}-${stamp}.json`;
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
    const importVersion = config.settings_version != null ? Number(config.settings_version) : App.SETTINGS_VERSION;
    if (!Number.isFinite(importVersion) || importVersion < 100) {
      throw new Error(`Unsupported settings version: ${config.settings_version}`);
    }
    // Future migrations go here, ordered by version:
    // if (importVersion < 200) { /* migrate 100 → 200 shape */ }
    const settings = config.settings && typeof config.settings === 'object' && !Array.isArray(config.settings) ? config.settings : {};
    const logview = config.logview && typeof config.logview === 'object' && !Array.isArray(config.logview) ? config.logview : {};

    const settingsCfg = App.state.config.settings;
    const logviewCfg = App.state.config.logview;
    let settingsDirty = false;
    let logviewDirty = false;
    let themeApplied = null;

    if (settings.server != null) { settingsCfg.server = App.validators.server(settings.server); settingsDirty = true; }
    if (settings.theme != null) { settingsCfg.theme = App.validators.theme(settings.theme); settingsDirty = true; themeApplied = settingsCfg.theme; }
    if (settings.tabvis != null) { settingsCfg.tabvis = App.validators.tabvis(settings.tabvis); settingsDirty = true; }
    if (settings.logtable != null) { settingsCfg.logtable = App.validators.logtable(settings.logtable); settingsDirty = true; }
    if (settingsDirty) App.state.writeGroup('settings');
    if (themeApplied) App.utils.applyDocumentTheme(themeApplied, true);

    if (logview.rowcount != null) { logviewCfg.rowcount = App.validators.rowcount(logview.rowcount); logviewDirty = true; }
    if (logview.pollint != null) { logviewCfg.pollint = App.validators.pollint(logview.pollint); logviewDirty = true; }
    if (logview.timerange != null) { logviewCfg.timerange = App.validators.timerange(logview.timerange); logviewDirty = true; }
    if (logview.timecustom != null) { logviewCfg.timecustom = App.validators.timecustom(logview.timecustom); logviewDirty = true; }
    if (logview.colwidths != null) { logviewCfg.colwidths = App.validators.colwidths(importColumnWidths(logview.colwidths)); logviewDirty = true; }
    if (logviewDirty) App.state.writeGroup('logview');

    if (config.tabs != null) App.persist.tabs(config.tabs);
    if (config.aliases != null) {
      const duplicateFriendly = App.validators.duplicateFriendlyAlias(config.aliases);
      if (duplicateFriendly) throw new Error(`Duplicate friendly alias name: ${duplicateFriendly}`);
      App.persist.aliases(config.aliases);
    }

    const importedDefaultQuery = config.querydef != null ? App.validators.querydef(config.querydef) : '';
    // Clear first so imported history can be normalized against only the imported default query, not a stale current one.
    // If the imported default is not present in history, drop it rather than creating a ghost startup query.
    if (config.querydef != null) App.persist.querydef('');
    if (config.queryhist != null) App.persist.queryhist(config.queryhist, { defaultQuery: importedDefaultQuery });
    if (config.querydef != null) {
      const defaultIndex = App.state.config.queryhist.findIndex((entry) => entry.query === importedDefaultQuery);
      if (defaultIndex !== -1) App.queryHistory.setDefault(defaultIndex);
    }

    if (App.state.config.logview.timerange === 'custom'
      && (!App.state.config.logview.timecustom.start || !App.state.config.logview.timecustom.end)) {
      App.persist.logview.timerange(App.DEFAULTS.logview.timerange);
    }
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
