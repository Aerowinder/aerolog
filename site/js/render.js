(function () {
  const App = window.Aerolog;
  const { dom, utils } = App;

  function renderThemeButtons() {
    dom.qa('.theme-choice').forEach((input) => {
      input.checked = input.value === App.state.config.settings.theme;
    });
  }

  function renderToolToggles() {
    dom.qa('.tool-toggle').forEach((input) => {
      input.checked = App.state.config.settings.tabvis[input.dataset.toolTab] !== false;
    });
  }

  function renderMessageLineSelect() {
    dom.qa('.message-lines-choice').forEach((input) => {
      input.checked = input.value === App.state.config.settings.logtable.msglines;
    });
  }

  function renderRowActionToggles() {
    dom.qa('.row-action-toggle').forEach((input) => {
      input.checked = App.state.config.settings.logtable[input.dataset.rowAction] !== false;
    });
  }

  function renderHostnameFallbackControls() {
    const fallback = App.state.config.settings.fallback.hostname;
    const enabled = fallback.enabled !== false;
    dom.qa('.hostname-fallback-toggle').forEach((input) => {
      input.checked = enabled;
    });
    dom.qa('.hostname-fallback-choice').forEach((input) => {
      input.checked = input.value === fallback.field;
      input.disabled = !enabled;
    });
  }

  function renderToolbarState() {
    dom.byId('page-size').value = App.state.config.logview.rowcount;
    dom.byId('poll-interval').value = App.derive.effectivePollInterval();
    dom.byId('time-range').value = App.state.config.logview.timerange;
    const customEdit = dom.byId('time-custom-edit');
    if (customEdit) {
      const customActive = App.state.config.logview.timerange === 'custom';
      const customGroup = customEdit.closest('.time-range-group');
      if (customGroup) customGroup.classList.toggle('has-custom', customActive);
      customEdit.hidden = !customActive;
      const range = App.state.config.logview.timecustom;
      customEdit.title = customActive && range.start && range.end
        ? `${App.utils.formatTime(range.start)} to ${App.utils.formatTime(range.end)}`
        : 'Edit custom time range';
    }
    dom.byId('search').value = App.state.runtime.committedSearch;
  }

  function markSearchInvalid(query) {
    const search = dom.byId('search');
    App.state.runtime.invalidSearchQuery = query;
    if (!search) return;
    search.classList.add('invalid-query');
    search.setAttribute('aria-invalid', 'true');
  }

  function clearSearchInvalid(query) {
    if (query !== undefined && App.state.runtime.invalidSearchQuery !== query) return;
    App.state.runtime.invalidSearchQuery = null;
    const search = dom.byId('search');
    if (!search) return;
    search.classList.remove('invalid-query');
    search.removeAttribute('aria-invalid');
  }

  function clearSearchInvalidOnEdit(value) {
    if (App.state.runtime.invalidSearchQuery !== null && value !== App.state.runtime.invalidSearchQuery) {
      clearSearchInvalid();
    }
  }

  function timeRangeText() {
    const range = App.state.config.logview.timerange;
    return range === 'custom' ? 'Custom' : range;
  }

  function responseTimeText() {
    const value = App.state.runtime.lastResponseMs;
    if (value == null) return '--';
    return value < 1000 ? `${value}ms` : `${(value / 1000).toFixed(1)}s`;
  }

  function renderTimeText() {
    const value = App.state.runtime.lastRenderMs;
    if (value == null) return '--';
    return `${value}ms`;
  }

  function metricSnapshot() {
    return {
      logs: Number(App.state.runtime.totalCount).toLocaleString(),
      timeRange: timeRangeText(),
      response: responseTimeText(),
      render: renderTimeText(),
    };
  }

  function renderMetrics() {
    const metrics = metricSnapshot();
    dom.byId('stat-logs').innerHTML = `<b>${metrics.logs}</b> Logs (${metrics.timeRange})`;
    dom.byId('stat-resp').innerHTML = `<b>${metrics.response}</b> API`;
    dom.byId('stat-render').innerHTML = `<b>${metrics.render}</b> UI`;
    if (App.render.renderPagerMeta) App.render.renderPagerMeta(metrics);
  }

  function renderStats() {
    renderMetrics();
  }

  function renderResponseTime() {
    renderMetrics();
  }

  function renderRenderTime() {
    renderMetrics();
  }

  function renderError(message) {
    dom.byId('log-body').innerHTML = `<tr><td colspan="${App.COLUMN_ORDER.length}" class="error-row">${utils.escapeHtml(message)}</td></tr>`;
  }

  function renderConnectionPill() {
    const view = App.derive.connectionView();
    const el = dom.byId('conn-status');
    el.className = view.state ? `conn-status ${view.state}` : 'conn-status';
    el.setAttribute('aria-label', view.title || view.text);
    dom.q('.host-text', el).textContent = view.text;
    if (view.title) {
      el.title = view.title;
    } else {
      el.removeAttribute('title');
    }
    const bar = dom.byId('conn-progress');
    if (bar) bar.style.display = App.derive.showProgressBar() ? '' : 'none';
  }

  function renderAllStatic() {
    dom.byId('version-text').textContent = App.VERSION;
    document.documentElement.setAttribute('data-message-lines', App.state.config.settings.logtable.msglines);
    renderToolbarState();
    renderThemeButtons();
    renderMessageLineSelect();
    renderRowActionToggles();
    renderHostnameFallbackControls();
    App.render.renderTableHeader();
    App.render.renderTabs();
    App.render.renderPagination();
    renderStats();
    renderResponseTime();
    renderRenderTime();
    renderConnectionPill();
  }

  App.render = {
    renderThemeButtons,
    renderToolToggles,
    renderMessageLineSelect,
    renderRowActionToggles,
    renderHostnameFallbackControls,
    renderToolbarState,
    markSearchInvalid,
    clearSearchInvalid,
    clearSearchInvalidOnEdit,
    renderStats,
    renderMetrics,
    renderResponseTime,
    renderRenderTime,
    renderError,
    renderConnectionPill,
    renderAllStatic,
  };

  App.renderInternals = {
    timeRangeText,
    metricSnapshot,
    responseTimeText,
    renderTimeText,
  };
})();
