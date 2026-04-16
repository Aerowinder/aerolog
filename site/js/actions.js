(function () {
  const App = window.Aerolog;

  App.actions = App.actions || {};

  App.actions.setTheme = function setTheme(theme, options = {}) {
    const nextTheme = App.persist.settings.theme(theme);
    App.utils.applyDocumentTheme(nextTheme, options.disableTransitions !== false);
    if (App.render) App.render.renderThemeButtons();
    return nextTheme;
  };

  App.actions.runSearch = async function runSearch(query, cause = 'manual') {
    App.state.runtime.committedSearch = String(query || '').trim();
    App.queryHistory.recordRecent(App.state.runtime.committedSearch);
    App.state.runtime.currentPage = 1;
    App.render.renderToolbarState();
    App.queryHistory.render();
    App.queryHistory.close();
    return App.api.dispatchRefresh(cause);
  };

  App.actions.applyFieldFilter = function applyFieldFilter(mode) {
    const search = App.dom.byId('search');
    const nextQuery = App.fieldFilters.buildAppliedQuery(mode, search ? search.value : App.state.runtime.committedSearch);
    App.fieldFilters.close();
    return App.actions.runSearch(nextQuery);
  };

  App.actions.setPollInterval = async function setPollInterval(value) {
    App.polling.clearNavigationPause();
    App.polling.clearServerChangePause();
    App.polling.clearExpansionPause();
    App.persist.logview.pollint(value);
    if (App.state.config.logview.pollint !== 'off') {
      if (App.render.collapseAllRows) App.render.collapseAllRows();
      if (App.state.runtime.currentPage !== 1) {
        App.state.runtime.currentPage = 1;
      }
    }
    App.render.renderToolbarState();
    return App.polling.applyPolling('settings');
  };

  App.actions.setPageSize = async function setPageSize(value) {
    App.persist.logview.rowcount(value);
    App.state.runtime.currentPage = 1;
    App.render.renderToolbarState();
    return App.api.dispatchRefresh('page');
  };

  App.actions.setTimeRange = async function setTimeRange(value) {
    if (value === 'custom') {
      const range = App.state.config.logview.timecustom;
      if (!range.start || !range.end) {
        App.render.renderToolbarState();
        return { started: false, reason: 'missing_custom_time' };
      }
    }
    App.persist.logview.timerange(value);
    App.state.runtime.currentPage = 1;
    App.render.renderToolbarState();
    return App.api.dispatchRefresh('settings');
  };

  App.actions.applyCustomTimeRange = async function applyCustomTimeRange(range) {
    const customRange = App.validators.timecustom(range);
    if (!customRange.start || !customRange.end) {
      App.utils.showAlert('Choose a valid start and end time.');
      return { started: false, reason: 'invalid_custom_time' };
    }
    App.persist.logview.timecustom(customRange);
    App.persist.logview.timerange('custom');
    App.state.runtime.currentPage = 1;
    App.render.renderToolbarState();
    return App.api.dispatchRefresh('settings');
  };

  App.actions.clearCustomTimeRange = async function clearCustomTimeRange() {
    App.persist.logview.timecustom(null);
    App.persist.logview.timerange(App.DEFAULTS.logview.timerange);
    App.state.runtime.currentPage = 1;
    App.render.renderToolbarState();
    return App.api.dispatchRefresh('settings');
  };

  App.actions.saveServerSettings = async function saveServerSettings(serverUrl) {
    const nextServerUrl = App.validators.server(serverUrl);
    if (nextServerUrl === App.state.config.settings.server) {
      return { started: false, reason: 'unchanged' };
    }
    App.persist.settings.server(nextServerUrl);
    App.polling.pauseForServerChange();
    App.state.runtime.currentPage = 1;
    App.render.renderTabs();
    App.render.renderToolbarState();
    App.render.renderConnectionPill();
    return App.api.dispatchRefresh('settings');
  };

  App.actions.saveAliases = async function saveAliases(aliases) {
    App.persist.aliases(aliases);
    App.render.renderLogs();
    return App.api.dispatchRefresh('manual');
  };

  App.actions.toggleToolTab = function toggleToolTab(key) {
    const current = App.state.config.settings.tabvis[key];
    App.persist.settings.tabvis[key](!current);
    App.render.renderToolToggles();
    App.render.renderTabs();
    return App.state.config.settings.tabvis;
  };

  App.actions.setMessageLines = function setMessageLines(value) {
    const messageLines = App.persist.settings.logtable.msglines(value);
    document.documentElement.setAttribute('data-message-lines', messageLines);
    App.render.renderMessageLineSelect();
    App.render.renderLogs();
    return messageLines;
  };

  App.actions.setRowAction = function setRowAction(key, enabled) {
    const next = App.persist.settings.logtable[key](enabled);
    if (key === 'expand' && next === false) {
      App.render.collapseAllRows();
    }
    if (key === 'filter' && next === false && App.fieldFilters) {
      App.fieldFilters.close();
    }
    App.render.renderRowActionToggles();
    App.render.renderLogs();
    return App.state.config.settings.logtable;
  };

  App.actions.activateTab = async function activateTab(tabId) {
    App.state.runtime.activeTabId = tabId;
    App.state.runtime.currentPage = 1;
    App.render.renderTabs();
    return App.api.dispatchRefresh('manual');
  };

  App.actions.goPage = async function goPage(page) {
    const nextPage = Math.max(1, Math.min(App.state.runtime.totalPages, page));
    if (nextPage === App.state.runtime.currentPage) return undefined;
    const leavingPageOne = App.state.runtime.currentPage === 1 && nextPage !== 1;
    App.state.runtime.currentPage = nextPage;
    if (leavingPageOne) {
      App.polling.pauseForNavigation();
    }
    App.render.renderToolbarState();
    await App.api.dispatchRefresh('page');
    return nextPage;
  };

  App.actions.addTab = async function addTab(tab) {
    const nextTabs = App.state.config.tabs.concat([{ id: Date.now(), name: tab.name, hosts: tab.hosts }]);
    App.persist.tabs(nextTabs);
    App.render.renderTabs();
    App.render.renderTabList();
    App.state.runtime.currentPage = 1;
    return App.api.dispatchRefresh('manual');
  };

  App.actions.saveTab = async function saveTab(tabId, updates) {
    const nextTabs = App.state.config.tabs.map((entry) => (
      entry.id === tabId ? { ...entry, name: updates.name, hosts: updates.hosts } : entry
    ));
    App.persist.tabs(nextTabs);
    App.render.renderTabs();
    App.render.renderTabList();
    if (App.state.runtime.activeTabId === tabId) {
      App.state.runtime.currentPage = 1;
      return App.api.dispatchRefresh('manual');
    }
    return undefined;
  };

  App.actions.deleteTab = async function deleteTab(tabId) {
    App.persist.tabs(App.state.config.tabs.filter((entry) => entry.id !== tabId));
    if (App.state.runtime.activeTabId === tabId) {
      App.state.runtime.activeTabId = 0;
      App.state.runtime.currentPage = 1;
    }
    App.render.renderTabs();
    App.render.renderTabList();
    return App.api.dispatchRefresh('manual');
  };

  App.actions.moveTab = function moveTab(tabId, direction) {
    const nextTabs = App.utils.moveById(App.state.config.tabs, tabId, direction);
    if (!nextTabs) return App.state.config.tabs;
    App.persist.tabs(nextTabs);
    App.render.renderTabs();
    App.render.renderTabList();
    return App.state.config.tabs;
  };

  App.actions.resetConfig = function resetConfig() {
    if (App.api) App.api.abortActiveRequest();
    if (App.polling) {
      App.polling.clearScheduledPoll();
      App.polling.resetProgressBar();
    }
    App.state.resetToDefaults();
  };
})();
