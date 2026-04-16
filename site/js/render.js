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

  function renderStats() {
    dom.byId('stat-logs').innerHTML = `<b>${Number(App.state.runtime.totalCount).toLocaleString()}</b> available logs`;
  }

  function responseTimeText() {
    const value = App.state.runtime.lastResponseMs;
    if (value == null) return '--';
    return value < 1000 ? `${value}ms` : `${(value / 1000).toFixed(1)}s`;
  }

  function renderResponseTime() {
    const el = dom.byId('stat-resp');
    const text = responseTimeText();
    el.innerHTML = text === '--' ? '<b>--</b> response time' : `<b>${text}</b> response time`;
    if (App.render.renderPagerMeta && App.render.pageButtonCount) {
      App.render.renderPagerMeta(App.render.pageButtonCount());
    }
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

  function showToast(text) {
    const toast = dom.byId('toast');
    toast.textContent = text;
    toast.classList.add('show');
    clearTimeout(showToast.timerId);
    showToast.timerId = setTimeout(() => toast.classList.remove('show'), 1400);
  }

  function renderAllStatic() {
    dom.byId('version-text').textContent = App.VERSION;
    document.documentElement.setAttribute('data-message-lines', App.state.config.settings.logtable.msglines);
    renderToolbarState();
    renderThemeButtons();
    renderMessageLineSelect();
    renderRowActionToggles();
    App.render.renderTableHeader();
    App.render.renderTabs();
    App.render.renderPagination();
    renderStats();
    renderResponseTime();
    renderConnectionPill();
  }

  App.render = {
    renderThemeButtons,
    renderToolToggles,
    renderMessageLineSelect,
    renderRowActionToggles,
    renderToolbarState,
    renderStats,
    renderResponseTime,
    renderError,
    renderConnectionPill,
    renderAllStatic,
    showToast,
  };

  App.renderInternals = {
    responseTimeText,
  };
})();
