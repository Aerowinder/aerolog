(function () {
  const App = window.Aerolog;
  const { dom, utils } = App;

  function renderTimestamp(log) {
    return utils.escapeHtml(utils.formatTime(log._time));
  }

  function renderHostname(log) {
    return utils.escapeHtml(App.query.displayHostname(log.hostname || '-'));
  }

  function renderAppName(log) {
    return utils.escapeHtml(log.app_name || '-');
  }

  function renderMessage(log) {
    return `<div class="msg-content">${utils.escapeHtml(log._msg || '')}</div>`;
  }

  function renderPriority(log) {
    const raw = log.severity;
    if (raw == null || raw === '') return '<span class="pri-info">-</span>';
    const num = parseInt(raw, 10);
    if (Number.isNaN(num)) return utils.escapeHtml(String(raw));
    const label = App.SEVERITY_SHORT[num] || String(num);
    const cls = App.SEVERITY_CLASS[num] || 'pri-info';
    return `<span class="${cls}">${label}(${num})</span>`;
  }

  function renderFacility(log) {
    if (log.facility_keyword) return utils.escapeHtml(log.facility_keyword);
    if (log.facility != null && log.facility !== '') return utils.escapeHtml(String(log.facility));
    return '-';
  }

  const CELL_RENDERERS = {
    _time: renderTimestamp,
    hostname: renderHostname,
    priority: renderPriority,
    facility: renderFacility,
    app_name: renderAppName,
    _msg: renderMessage,
  };

  function renderThemeButtons() {
    dom.qa('.theme-btn').forEach((btn) => {
      btn.classList.toggle('active', btn.dataset.themeVal === App.state.config.theme);
    });
  }

  function renderToolbarState() {
    dom.byId('page-size').value = App.state.config.pageSize;
    dom.byId('poll-interval').value = App.state.config.pollInterval;
    dom.byId('time-range').value = App.state.config.timeRange;
    dom.byId('search').value = App.state.runtime.committedSearch;
  }

  function renderTableHeader() {
    const thead = dom.byId('log-thead');
    thead.innerHTML = App.COLUMN_ORDER.map((columnId) => {
      const def = App.COLUMN_DEFS[columnId];
      const width = App.state.config.columnLayout.widths[columnId];
      const style = width ? `style="width: ${width}px;"` : '';
      return `<th data-col-id="${columnId}" ${style}>${def.label}</th>`;
    }).join('');
    setupHeaderInteractions();
  }

  function setupHeaderInteractions() {
    dom.qa('#log-thead th').forEach((th) => {
      if (th.querySelector('.col-resize')) return;
      const columnId = th.dataset.colId;
      if (columnId === '_msg') return;
      const handle = document.createElement('div');
      handle.className = 'col-resize';
      th.appendChild(handle);
      handle.addEventListener('mousedown', (event) => {
        event.preventDefault();
        event.stopPropagation();
        handle.classList.add('dragging');
        const startX = event.clientX;
        const startWidth = th.offsetWidth;
        const onMove = (moveEvent) => {
          const newWidth = Math.max(60, startWidth + moveEvent.clientX - startX);
          th.style.width = `${newWidth}px`;
          App.state.config.columnLayout.widths[columnId] = newWidth;
        };
        const onUp = () => {
          handle.classList.remove('dragging');
          document.removeEventListener('mousemove', onMove);
          document.removeEventListener('mouseup', onUp);
          App.persist.columnLayout(App.state.config.columnLayout);
        };
        document.addEventListener('mousemove', onMove);
        document.addEventListener('mouseup', onUp);
      });
    });
  }

  function renderLogs(logs = App.state.runtime.currentLogs) {
    const tbody = dom.byId('log-body');
    if (!logs.length) {
      tbody.innerHTML = `<tr><td colspan="${App.COLUMN_ORDER.length}" class="empty">No logs found</td></tr>`;
      return;
    }
    tbody.innerHTML = logs.map((log, index) => {
      const cells = App.COLUMN_ORDER.map((columnId) => {
        const def = App.COLUMN_DEFS[columnId];
        const cls = def.className ? ` class="${def.className}"` : '';
        const content = CELL_RENDERERS[columnId](log);
        const copyBtn = columnId === '_msg'
          ? `<button class="copy-btn" data-action="copy-row" data-row-index="${index}" title="Copy row">⎘</button>`
          : '';
        return `<td${cls}>${content}${copyBtn}</td>`;
      }).join('');
      return `<tr data-row-index="${index}">${cells}</tr>`;
    }).join('');
  }

  function renderStats() {
    dom.byId('stat-logs').innerHTML = `<b>${Number(App.state.runtime.totalCount).toLocaleString()}</b> available logs`;
  }

  function renderResponseTime() {
    const el = dom.byId('stat-resp');
    const value = App.state.runtime.lastResponseMs;
    if (value == null) {
      el.innerHTML = '<b>--</b> response time';
      return;
    }
    const text = value < 1000 ? `${value}ms` : `${(value / 1000).toFixed(1)}s`;
    el.innerHTML = `<b>${text}</b> response time`;
  }

  function renderError(message) {
    dom.byId('log-body').innerHTML = `<tr><td colspan="${App.COLUMN_ORDER.length}" class="error-row">${utils.escapeHtml(message)}</td></tr>`;
  }

  function renderConnectionPill() {
    const view = App.derive.connectionView();
    const el = dom.byId('conn-status');
    el.className = view.state ? `conn-status ${view.state}` : 'conn-status';
    dom.q('.host-text', el).textContent = view.text;
    if (view.title) {
      el.title = view.title;
    } else {
      el.removeAttribute('title');
    }
    const bar = dom.byId('conn-progress');
    if (bar) bar.style.display = App.derive.showProgressBar() ? '' : 'none';
  }

  function renderPagination() {
    dom.byId('pager-info').textContent = `Page ${App.state.runtime.currentPage} of ${App.state.runtime.totalPages} - ${Number(App.state.runtime.totalCount).toLocaleString()} logs`;
    const currentPage = App.state.runtime.currentPage;
    const totalPages = App.state.runtime.totalPages;
    let start = Math.max(1, currentPage - Math.floor(App.PAGE_BUTTONS / 2));
    let end = Math.min(totalPages, start + App.PAGE_BUTTONS - 1);
    if (end - start + 1 < App.PAGE_BUTTONS) {
      start = Math.max(1, end - App.PAGE_BUTTONS + 1);
    }
    const buttons = [];
    const make = (page, label, extra = '') => `<button class="pager-btn ${extra}" data-action="go-page" data-page="${page}">${label}</button>`;
    buttons.push(`<button class="pager-btn" data-action="go-page" data-page="1" ${currentPage === 1 ? 'disabled' : ''} title="First">«</button>`);
    buttons.push(`<button class="pager-btn" data-action="go-page" data-page="${currentPage - 1}" ${currentPage === 1 ? 'disabled' : ''} title="Previous">‹</button>`);
    for (let page = start; page <= end; page += 1) {
      buttons.push(make(page, page, page === currentPage ? 'active' : ''));
    }
    buttons.push(`<button class="pager-btn" data-action="go-page" data-page="${currentPage + 1}" ${currentPage === totalPages ? 'disabled' : ''} title="Next">›</button>`);
    buttons.push(`<button class="pager-btn" data-action="go-page" data-page="${totalPages}" ${currentPage === totalPages ? 'disabled' : ''} title="Last">»</button>`);
    dom.byId('pager-buttons').innerHTML = buttons.join('');
  }

  function renderTabs() {
    const container = dom.byId('tabs');
    let html = `<button class="tab ${App.state.runtime.activeTabId === 0 ? 'active' : ''}" data-action="activate-tab" data-tab-id="0">All Logs</button>`;
    for (const tab of App.state.config.tabs) {
      html += `<button class="tab ${App.state.runtime.activeTabId === tab.id ? 'active' : ''}" data-action="activate-tab" data-tab-id="${tab.id}">${utils.escapeHtml(tab.name)}</button>`;
    }
    html += '<div class="tab-sep"></div>';
    html += '<button class="tab tab-mgmt" data-action="open-tab-modal">Tabs</button>';
    html += '<button class="tab tab-mgmt" data-action="open-aliases">Aliases</button>';
    html += '<button class="tab tab-mgmt" data-action="open-queries">Queries</button>';
    container.innerHTML = html;
  }

  function renderTabList() {
    const container = dom.byId('tab-list');
    if (!App.state.config.tabs.length) {
      container.innerHTML = '<p class="hint" style="margin: 0 0 0.5rem 0;">No tabs yet. Add one below.</p>';
      return;
    }
    container.innerHTML = App.state.config.tabs.map((tab) => `
      <div class="list-item" data-action="open-tab-edit" data-tab-id="${tab.id}">
        <span><b>${utils.escapeHtml(tab.name)}</b> <span style="color: var(--text-dim);">(${tab.hosts.length} host${tab.hosts.length === 1 ? '' : 's'})</span></span>
        <span class="edit-icon">view</span>
      </div>
    `).join('');
  }

  function renderQueryList() {
    const container = dom.byId('query-list');
    if (!App.state.config.queries.length) {
      container.innerHTML = '<p class="hint" style="margin: 0 0 0.5rem 0;">No saved queries yet. Add one below.</p>';
      return;
    }
    container.innerHTML = App.state.config.queries.map((query) => `
      <div class="list-item" data-action="open-query-edit" data-query-id="${query.id}">
        <span><b>${utils.escapeHtml(query.name)}</b> <span style="color: var(--text-dim);"><code>${utils.escapeHtml(query.query)}</code></span></span>
        <span class="edit-icon">view</span>
      </div>
    `).join('');
  }

  function showToast(text) {
    const toast = dom.byId('toast');
    toast.textContent = text;
    toast.classList.add('show');
    clearTimeout(showToast.timerId);
    showToast.timerId = setTimeout(() => toast.classList.remove('show'), 1400);
  }

  function copyRow(index) {
    const log = App.state.runtime.currentLogs[index];
    if (!log) return;
    const text = [
      utils.formatTime(log._time),
      App.query.displayHostname(log.hostname || '-'),
      log.app_name || '-',
      log._msg || '',
    ].join('\t');
    navigator.clipboard.writeText(text).then(() => {
      const row = dom.q(`tr[data-row-index="${index}"]`);
      if (row) {
        row.classList.add('copied');
        setTimeout(() => row.classList.remove('copied'), 400);
      }
      showToast('copied row');
    }).catch(() => showToast('copy failed'));
  }

  function renderAllStatic() {
    dom.byId('version-text').textContent = App.VERSION;
    renderToolbarState();
    renderThemeButtons();
    renderTableHeader();
    renderTabs();
    renderPagination();
    renderStats();
    renderResponseTime();
    renderConnectionPill();
  }

  App.render = {
    renderThemeButtons,
    renderToolbarState,
    renderTableHeader,
    renderLogs,
    renderStats,
    renderResponseTime,
    renderError,
    renderConnectionPill,
    renderPagination,
    renderTabs,
    renderTabList,
    renderQueryList,
    renderAllStatic,
    showToast,
    copyRow,
  };
})();
