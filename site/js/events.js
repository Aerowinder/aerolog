(function () {
  const App = window.Aerolog;
  const { dom } = App;

  const OVERLAY_CLOSE = {
    'settings-modal': () => App.modals.closeSettingsModal(),
    'tab-modal': () => App.tabs.closeTabModal(),
    'aliases-modal': () => App.aliases.closeAliasesModal(),
    'heartbeats-modal': () => App.heartbeats.closeHeartbeatsModal(),
    'custom-time-modal': () => App.modals.closeCustomTimeModal(),
    'shortcuts-modal': () => App.shortcuts.closeShortcutsOverlay(),
  };

  function bindStaticEvents() {
    const searchInput = dom.byId('search');
    searchInput.addEventListener('keydown', (event) => {
      if (event.key === 'Enter') {
        event.preventDefault();
        App.actions.runSearch(searchInput.value);
      }
    });

    dom.byId('poll-interval').addEventListener('change', async (event) => {
      await App.actions.setPollInterval(event.target.value);
    });

    dom.byId('page-size').addEventListener('change', async (event) => {
      await App.actions.setPageSize(event.target.value);
    });

    dom.byId('time-range').addEventListener('change', async (event) => {
      if (event.target.value === 'custom') {
        const result = await App.actions.setTimeRange('custom');
        if (result && result.reason === 'missing_custom_time') App.modals.openCustomTimeModal();
        return;
      }
      await App.actions.setTimeRange(event.target.value);
    });

    dom.qa('.theme-choice').forEach((input) => {
      input.addEventListener('change', () => App.actions.setTheme(input.value, { disableTransitions: true }));
    });

    dom.qa('.tool-toggle').forEach((input) => {
      input.addEventListener('change', () => {
        App.actions.toggleToolTab(input.dataset.toolTab);
      });
    });

    dom.qa('.message-lines-choice').forEach((input) => {
      input.addEventListener('change', () => App.actions.setMessageLines(input.value));
    });

    dom.qa('.row-action-toggle').forEach((input) => {
      input.addEventListener('change', () => {
        App.actions.setRowAction(input.dataset.rowAction, input.checked);
      });
    });

    dom.byId('import-file').addEventListener('change', (event) => App.modals.importConfig(event));
    dom.byId('server-url').addEventListener('blur', () => App.modals.applyServerFromSettings());

    for (const [overlayId, closeFn] of Object.entries(OVERLAY_CLOSE)) {
      dom.byId(overlayId).addEventListener('click', (event) => {
        if (event.target.id === overlayId) closeFn();
      });
    }

    document.addEventListener('keydown', (event) => {
      if (event.key !== 'Escape') return;
      const target = event.target;
      const tag = target && target.tagName;
      const typing = tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT' || (target && target.isContentEditable);
      if (target && target.id === 'server-url') App.modals.abortServerEdit();
      if (typing && typeof target.blur === 'function') target.blur();
      App.queryHistory.close();
      if (App.fieldFilters) App.fieldFilters.close();
      Object.values(OVERLAY_CLOSE).forEach((closeFn) => closeFn());
    });

    window.addEventListener('resize', () => {
      if (App.fieldFilters) App.fieldFilters.close();
      if (bindStaticEvents.resizeFrame) return;
      bindStaticEvents.resizeFrame = requestAnimationFrame(() => {
        bindStaticEvents.resizeFrame = null;
        App.render.updateTabOverflow();
        App.render.renderPagination();
      });
    });
  }

  const ACTIONS = {
    'open-settings': () => App.modals.openSettingsModal(),
    search: () => App.actions.runSearch(dom.byId('search').value),
    'clear-search': () => App.actions.runSearch(''),
    'toggle-query-history': () => App.queryHistory.toggle(),
    'run-query-history': (target) => App.actions.runSearch((App.queryHistory.entryAt(target.dataset.queryIndex) || {}).query || ''),
    'toggle-query-pin': (target) => {
      App.queryHistory.togglePin(target.dataset.queryIndex);
      return App.queryHistory.render();
    },
    'set-query-default': (target) => {
      App.queryHistory.setDefault(target.dataset.queryIndex);
      return App.queryHistory.render();
    },
    'remove-query-history': (target) => {
      const entry = App.queryHistory.entryAt(target.dataset.queryIndex);
      if (entry && entry.pinned && !window.confirm('Delete this pinned query?')) return undefined;
      App.queryHistory.remove(target.dataset.queryIndex);
      return App.queryHistory.render();
    },
    'clear-pinned-query-history': () => {
      if (!window.confirm('Clear all pinned queries?')) return undefined;
      App.queryHistory.clearPinned(true);
      return App.queryHistory.render();
    },
    'clear-unpinned-query-history': () => {
      if (!window.confirm('Clear all unpinned query history?')) return undefined;
      App.queryHistory.clearPinned(false);
      return App.queryHistory.render();
    },
    'close-settings': () => App.modals.closeSettingsModal(),
    'done-settings': () => App.modals.doneSettingsModal(),
    'export-config': () => App.modals.exportConfig(),
    'trigger-import': () => dom.byId('import-file').click(),
    'reset-config': () => App.modals.resetConfig(),
    'open-tab-modal': () => App.tabs.openTabModal(),
    'close-tab-modal': () => App.tabs.closeTabModal(),
    'activate-tab': (target) => App.tabs.activateTab(Number(target.dataset.tabId)),
    'open-tab-edit': (target) => App.tabs.openTabEdit(Number(target.dataset.tabId)),
    'close-tab-edit': () => App.tabs.closeTabEdit(),
    'add-tab': () => App.tabs.addTab(),
    'save-tab-edit': () => App.tabs.saveTabEdit(),
    'delete-tab': () => App.tabs.deleteTabFromEdit(),
    'move-tab': (target) => App.tabs.moveTab(Number(target.dataset.tabId), Number(target.dataset.direction)),
    'open-aliases': () => App.aliases.openAliasesModal(),
    'close-aliases': () => App.aliases.closeAliasesModal(),
    'save-aliases': () => App.aliases.saveAliases(),
    'open-heartbeats': () => App.heartbeats.openHeartbeatsModal(),
    'close-heartbeats': () => App.heartbeats.closeHeartbeatsModal(),
    'open-custom-time': () => App.modals.openCustomTimeModal(),
    'close-custom-time': () => App.modals.closeCustomTimeModal(),
    'apply-custom-time': () => App.modals.applyCustomTimeRange(),
    'clear-custom-time': () => App.modals.clearCustomTimeRange(),
    'go-page': (target) => App.tabs.goPage(Number(target.dataset.page)),
    'copy-row': (target) => App.render.copyRow(Number(target.dataset.rowIndex)),
    'toggle-row': (target) => App.render.toggleRow(Number(target.dataset.rowIndex)),
    'field-filter-include': () => App.actions.applyFieldFilter('include'),
    'field-filter-exclude': () => App.actions.applyFieldFilter('exclude'),
    'close-shortcuts': () => App.shortcuts.closeShortcutsOverlay(),
  };

  function handleAction(action, target) {
    if (ACTIONS[action]) {
      return ACTIONS[action](target);
    }
    console.warn(`[aerolog] unknown action: ${action}`);
    return undefined;
  }

  function bindDelegatedActions() {
    document.addEventListener('click', (event) => {
      if (event.target && event.target.id === 'search') {
        if (App.fieldFilters && App.fieldFilters.current && App.fieldFilters.current()) App.fieldFilters.close();
        return;
      }
      const target = event.target.closest('[data-action]');
      if (!dom.byId('search-box').contains(event.target)) App.queryHistory.close();
      if (App.fieldFilters && !App.fieldFilters.menuContains(event.target)) App.fieldFilters.close();
      if (!target) {
        const filterTarget = event.target.closest('[data-filter-row]');
        if (filterTarget && App.fieldFilters) {
          event.preventDefault();
          App.fieldFilters.open(filterTarget);
        }
        return;
      }
      event.preventDefault();
      handleAction(target.dataset.action, target);
    });
  }

  function init() {
    App.render.renderAllStatic();
    bindStaticEvents();
    bindDelegatedActions();
    App.shortcuts.bind();
    document.documentElement.classList.remove('aerolog-init');
    App.polling.applyPolling('init');
  }

  init();
})();
