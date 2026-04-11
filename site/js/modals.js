(function () {
  const App = window.Aerolog;
  let lockedScrollY = 0;

  function lockPageScroll() {
    if (document.body.classList.contains('modal-open')) return;
    lockedScrollY = window.scrollY || document.documentElement.scrollTop || 0;
    document.body.style.top = `-${lockedScrollY}px`;
    document.body.classList.add('modal-open');
  }

  function unlockPageScroll() {
    if (document.querySelector('.modal-overlay.open')) return;
    document.body.classList.remove('modal-open');
    document.body.style.top = '';
    window.scrollTo(0, lockedScrollY);
  }

  function openModal(id) {
    document.getElementById(id).classList.add('open');
    lockPageScroll();
  }

  function closeModal(id) {
    document.getElementById(id).classList.remove('open');
    unlockPageScroll();
  }

  function openSettingsModal() {
    document.getElementById('server-url').value = App.state.config.serverUrl;
    App.render.renderThemeButtons();
    openModal('settings-modal');
  }

  function closeSettingsModal() {
    closeModal('settings-modal');
  }

  async function saveAllSettings() {
    App.persist.serverUrl(document.getElementById('server-url').value);
    closeSettingsModal();
    App.state.runtime.currentPage = 1;
    App.render.renderConnectionPill();
    await App.api.dispatchRefresh('settings');
  }

  function exportConfig() {
    const exportedWidths = {};
    for (const [columnId, width] of Object.entries(App.state.config.columnLayout.widths)) {
      const key = App.COL_ID_TO_KEY[columnId];
      if (key) exportedWidths[key] = width;
    }
    const config = {
      settings_version: 1,
      aerolog_version: App.VERSION,
      export_time: new Date().toISOString(),
      server: App.state.config.serverUrl,
      theme: App.state.config.theme,
      row_count: App.state.config.pageSize,
      poll_interval: App.state.config.pollInterval,
      time_range: App.state.config.timeRange,
      aliases: App.state.config.aliases,
      tabs: App.state.config.tabs,
      queries: App.state.config.queries,
      default_query_id: App.state.config.defaultQueryId,
      columns: { widths: exportedWidths },
    };
    const blob = new Blob([JSON.stringify(config, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `aerolog-config-${new Date().toISOString().slice(0, 10)}.json`;
    document.body.appendChild(link);
    link.click();
    link.remove();
    setTimeout(() => URL.revokeObjectURL(url), 0);
  }

  async function importConfig(event) {
    const file = event.target.files && event.target.files[0];
    if (!file) return;
    try {
      const text = await file.text();
      const config = JSON.parse(text);
      if (config.server != null) App.persist.serverUrl(config.server);
      if (config.theme != null) App.actions.setTheme(config.theme, { disableTransitions: true });
      if (config.row_count != null) App.persist.pageSize(config.row_count);
      if (config.poll_interval != null) App.persist.pollInterval(config.poll_interval);
      if (config.time_range != null) App.persist.timeRange(config.time_range);
      if (config.aliases != null) {
        const duplicateFriendly = App.validators.duplicateFriendlyAlias(config.aliases);
        if (duplicateFriendly) throw new Error(`Duplicate friendly alias name: ${duplicateFriendly}`);
        App.persist.aliases(config.aliases);
      }
      if (config.tabs != null) App.persist.tabs(config.tabs);
      if (config.queries != null) {
        App.persist.queries(config.queries);
        App.persist.defaultQueryId(config.default_query_id);
      } else if (config.default_query_id != null) {
        App.persist.defaultQueryId(config.default_query_id);
      }
      if (config.columns && config.columns.widths) {
        const widths = {};
        for (const [key, width] of Object.entries(config.columns.widths)) {
          const columnId = App.COL_KEY_TO_ID[key];
          if (columnId) widths[columnId] = width;
        }
        App.persist.columnLayout({ widths });
      }
      App.state.runtime.currentPage = 1;
      App.render.renderAllStatic();
      closeSettingsModal();
      await App.polling.applyPolling('settings');
      App.utils.showAlert('Config imported successfully');
    } catch (err) {
      App.utils.showAlert(`Failed to parse config file: ${err.message}`);
    } finally {
      event.target.value = '';
    }
  }

  async function resetConfig() {
    if (!window.confirm('Reset all settings? This clears server URL, theme, page size, polling, time range, aliases, tabs, queries, default query, and columns.')) return;
    App.actions.resetConfig();
    App.render.renderAllStatic();
    closeSettingsModal();
    await App.polling.applyPolling('manual');
  }

  App.modals = {
    openModal,
    closeModal,
    openSettingsModal,
    closeSettingsModal,
    saveAllSettings,
    exportConfig,
    importConfig,
    resetConfig,
  };
})();
