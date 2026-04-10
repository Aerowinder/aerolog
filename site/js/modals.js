(function () {
  const App = window.Aerolog;

  function openModal(id) {
    document.getElementById(id).classList.add('open');
  }

  function closeModal(id) {
    document.getElementById(id).classList.remove('open');
  }

  function openAliasesModal() {
    document.getElementById('aliases-text').value = App.query.aliasesToText();
    openModal('aliases-modal');
  }

  function closeAliasesModal() {
    closeModal('aliases-modal');
  }

  async function saveAliases() {
    App.persist.aliases(App.validators.aliasesText(document.getElementById('aliases-text').value));
    closeAliasesModal();
    App.render.renderLogs();
    await App.api.dispatchRefresh('manual');
  }

  function openQueriesModal() {
    App.state.runtime.editingQueryId = null;
    document.getElementById('query-modal-title').textContent = 'Saved Queries';
    document.getElementById('query-list-view').style.display = 'block';
    document.getElementById('query-edit-view').style.display = 'none';
    document.getElementById('new-query-name').value = '';
    document.getElementById('new-query-text').value = '';
    App.render.renderQueryList();
    openModal('queries-modal');
  }

  function closeQueriesModal() {
    closeModal('queries-modal');
  }

  function openQueryEdit(queryId) {
    const query = App.state.config.queries.find((entry) => entry.id === queryId);
    if (!query) return;
    App.state.runtime.editingQueryId = queryId;
    document.getElementById('edit-query-name').value = query.name;
    document.getElementById('edit-query-text').value = query.query;
    document.getElementById('query-modal-title').textContent = `Edit: ${query.name}`;
    document.getElementById('query-list-view').style.display = 'none';
    document.getElementById('query-edit-view').style.display = 'block';
  }

  function closeQueryEdit() {
    App.state.runtime.editingQueryId = null;
    document.getElementById('query-modal-title').textContent = 'Saved Queries';
    document.getElementById('query-list-view').style.display = 'block';
    document.getElementById('query-edit-view').style.display = 'none';
    App.render.renderQueryList();
  }

  function addQuery() {
    const name = document.getElementById('new-query-name').value.trim();
    const query = document.getElementById('new-query-text').value.trim();
    if (!name || !query) {
      App.utils.showAlert('Query name and text are required');
      return;
    }
    App.persist.queries(App.state.config.queries.concat([{ id: Date.now(), name, query }]));
    document.getElementById('new-query-name').value = '';
    document.getElementById('new-query-text').value = '';
    App.render.renderQueryList();
  }

  function saveQueryEdit() {
    if (App.state.runtime.editingQueryId == null) return;
    const name = document.getElementById('edit-query-name').value.trim();
    const query = document.getElementById('edit-query-text').value.trim();
    if (!name || !query) {
      App.utils.showAlert('Query name and text are required');
      return;
    }
    App.persist.queries(App.state.config.queries.map((entry) => entry.id === App.state.runtime.editingQueryId ? { ...entry, name, query } : entry));
    closeQueryEdit();
  }

  function deleteQueryFromEdit() {
    if (App.state.runtime.editingQueryId == null) return;
    if (!window.confirm('Delete this saved query?')) return;
    App.persist.queries(App.state.config.queries.filter((entry) => entry.id !== App.state.runtime.editingQueryId));
    closeQueryEdit();
  }

  async function loadQueryFromEdit() {
    if (App.state.runtime.editingQueryId == null) return;
    const query = App.state.config.queries.find((entry) => entry.id === App.state.runtime.editingQueryId);
    if (!query) return;
    closeQueriesModal();
    App.state.runtime.committedSearch = query.query;
    App.state.runtime.currentPage = 1;
    App.render.renderToolbarState();
    await App.api.dispatchRefresh('manual');
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
      columns: { widths: exportedWidths },
    };
    const blob = new Blob([JSON.stringify(config, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `aerolog-config-${new Date().toISOString().slice(0, 10)}.json`;
    link.click();
    URL.revokeObjectURL(url);
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
      if (config.aliases != null) App.persist.aliases(config.aliases);
      if (config.tabs != null) App.persist.tabs(config.tabs);
      if (config.queries != null) App.persist.queries(config.queries);
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
    if (!window.confirm('Reset all settings? This clears server URL, theme, page size, polling, time range, aliases, tabs, queries, and columns.')) return;
    App.actions.resetConfig();
    App.render.renderAllStatic();
    closeSettingsModal();
    await App.polling.applyPolling('manual');
  }

  App.modals = {
    openModal,
    closeModal,
    openAliasesModal,
    closeAliasesModal,
    saveAliases,
    openQueriesModal,
    closeQueriesModal,
    openQueryEdit,
    closeQueryEdit,
    addQuery,
    saveQueryEdit,
    deleteQueryFromEdit,
    loadQueryFromEdit,
    openSettingsModal,
    closeSettingsModal,
    saveAllSettings,
    exportConfig,
    importConfig,
    resetConfig,
  };
})();
