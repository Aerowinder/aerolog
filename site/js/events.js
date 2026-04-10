(function () {
  const App = window.Aerolog;
  const { dom } = App;

  const OVERLAY_CLOSE = {
    'settings-modal': () => App.modals.closeSettingsModal(),
    'tab-modal': () => App.tabs.closeTabModal(),
    'aliases-modal': () => App.modals.closeAliasesModal(),
    'queries-modal': () => App.modals.closeQueriesModal(),
  };

  function bindStaticEvents() {
    dom.byId('search').addEventListener('keydown', (event) => {
      if (event.key === 'Enter') {
        event.preventDefault();
        App.state.runtime.committedSearch = dom.byId('search').value.trim();
        App.state.runtime.currentPage = 1;
        App.api.dispatchRefresh('manual');
      }
    });

    dom.byId('poll-interval').addEventListener('change', async (event) => {
      App.polling.clearNavigationPause();
      App.persist.pollInterval(event.target.value);
      if (App.state.config.pollInterval !== 'off' && App.state.runtime.currentPage !== 1) {
        App.state.runtime.currentPage = 1;
      }
      App.render.renderToolbarState();
      await App.polling.applyPolling('settings');
    });

    dom.byId('page-size').addEventListener('change', async (event) => {
      App.persist.pageSize(event.target.value);
      App.state.runtime.currentPage = 1;
      App.render.renderToolbarState();
      await App.api.dispatchRefresh('page');
    });

    dom.byId('time-range').addEventListener('change', async (event) => {
      App.persist.timeRange(event.target.value);
      App.state.runtime.currentPage = 1;
      App.render.renderToolbarState();
      await App.api.dispatchRefresh('settings');
    });

    dom.qa('.theme-btn').forEach((btn) => {
      btn.addEventListener('click', () => App.actions.setTheme(btn.dataset.themeVal, { disableTransitions: true }));
    });

    dom.byId('import-file').addEventListener('change', (event) => App.modals.importConfig(event));

    for (const [overlayId, closeFn] of Object.entries(OVERLAY_CLOSE)) {
      dom.byId(overlayId).addEventListener('click', (event) => {
        if (event.target.id === overlayId) closeFn();
      });
    }

    document.addEventListener('keydown', (event) => {
      if (event.key !== 'Escape') return;
      Object.values(OVERLAY_CLOSE).forEach((closeFn) => closeFn());
    });
  }

  function handleAction(action, target) {
    switch (action) {
      case 'open-settings': return App.modals.openSettingsModal();
      case 'search':
        App.state.runtime.committedSearch = dom.byId('search').value.trim();
        App.state.runtime.currentPage = 1;
        return App.api.dispatchRefresh('manual');
      case 'close-settings': return App.modals.closeSettingsModal();
      case 'save-settings': return App.modals.saveAllSettings();
      case 'export-config': return App.modals.exportConfig();
      case 'trigger-import': return dom.byId('import-file').click();
      case 'reset-config': return App.modals.resetConfig();
      case 'open-tab-modal': return App.tabs.openTabModal();
      case 'close-tab-modal': return App.tabs.closeTabModal();
      case 'activate-tab': return App.tabs.activateTab(Number(target.dataset.tabId));
      case 'open-tab-edit': return App.tabs.openTabEdit(Number(target.dataset.tabId));
      case 'close-tab-edit': return App.tabs.closeTabEdit();
      case 'add-tab': return App.tabs.addTab();
      case 'save-tab-edit': return App.tabs.saveTabEdit();
      case 'delete-tab': return App.tabs.deleteTabFromEdit();
      case 'open-aliases': return App.modals.openAliasesModal();
      case 'close-aliases': return App.modals.closeAliasesModal();
      case 'save-aliases': return App.modals.saveAliases();
      case 'open-queries': return App.modals.openQueriesModal();
      case 'close-queries': return App.modals.closeQueriesModal();
      case 'open-query-edit': return App.modals.openQueryEdit(Number(target.dataset.queryId));
      case 'close-query-edit': return App.modals.closeQueryEdit();
      case 'add-query': return App.modals.addQuery();
      case 'save-query-edit': return App.modals.saveQueryEdit();
      case 'delete-query': return App.modals.deleteQueryFromEdit();
      case 'load-query': return App.modals.loadQueryFromEdit();
      case 'go-page': return App.tabs.goPage(Number(target.dataset.page));
      case 'copy-row': return App.render.copyRow(Number(target.dataset.rowIndex));
      default: return undefined;
    }
  }

  function bindDelegatedActions() {
    document.addEventListener('click', (event) => {
      const target = event.target.closest('[data-action]');
      if (!target) return;
      event.preventDefault();
      handleAction(target.dataset.action, target);
    });
  }

  function init() {
    App.render.renderAllStatic();
    bindStaticEvents();
    bindDelegatedActions();
    document.documentElement.classList.remove('aerolog-init');
    App.polling.applyPolling('init');
  }

  init();
})();
