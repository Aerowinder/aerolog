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
    return `<span class="msg-content">${utils.escapeHtml(log._msg || '')}</span>`;
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

  const COLUMN_BEHAVIOR = {
    _time: {
      render: renderTimestamp,
      copy(log) { return utils.formatTime(log._time) || ''; },
    },
    hostname: {
      render: renderHostname,
      copy(log) { return App.query.displayHostname(log.hostname || '-'); },
    },
    priority: {
      render: renderPriority,
      copy(log) {
        const raw = log.severity;
        if (raw == null || raw === '') return '-';
        const num = parseInt(raw, 10);
        if (Number.isNaN(num)) return String(raw);
        const label = App.SEVERITY_SHORT[num] || String(num);
        return `${label}(${num})`;
      },
    },
    facility: {
      render: renderFacility,
      copy(log) {
        if (log.facility_keyword) return String(log.facility_keyword);
        if (log.facility != null && log.facility !== '') return String(log.facility);
        return '-';
      },
    },
    app_name: {
      render: renderAppName,
      copy(log) { return log.app_name || '-'; },
    },
    _msg: {
      render: renderMessage,
      copy(log) { return log._msg || ''; },
    },
  };

  function getCopyValue(columnId, log) {
    return COLUMN_BEHAVIOR[columnId] ? COLUMN_BEHAVIOR[columnId].copy(log) : '';
  }

  function measureColumnText(text, font) {
    const canvas = measureColumnText.canvas || (measureColumnText.canvas = document.createElement('canvas'));
    const context = canvas.getContext('2d');
    context.font = font;
    return context.measureText(String(text ?? '')).width;
  }

  function autoSizeColumn(th, columnId) {
    const def = App.COLUMN_DEFS[columnId];
    const headerStyle = window.getComputedStyle(th);
    const firstCell = dom.q(`#log-body td[data-col-id="${columnId}"]`);
    const cellStyle = firstCell ? window.getComputedStyle(firstCell) : headerStyle;
    const padding = (parseFloat(headerStyle.paddingLeft) || 0) + (parseFloat(headerStyle.paddingRight) || 0);
    const headerWidth = measureColumnText(def.label, headerStyle.font);
    const contentWidth = App.state.runtime.currentLogs.reduce((max, log) => {
      return Math.max(max, measureColumnText(getCopyValue(columnId, log), cellStyle.font));
    }, headerWidth);
    const width = Math.max(60, Math.ceil(contentWidth + padding + 16));
    th.style.width = `${width}px`;
    App.state.config.logview.colwidths.widths[columnId] = width;
    App.persist.logview.colwidths(App.state.config.logview.colwidths);
  }

  function renderTableHeader() {
    const thead = dom.byId('log-thead');
    thead.innerHTML = App.COLUMN_ORDER.map((columnId) => {
      const def = App.COLUMN_DEFS[columnId];
      const width = App.state.config.logview.colwidths.widths[columnId];
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
      handle.title = 'Drag to resize. Double-click to auto-size.';
      handle.addEventListener('dblclick', (event) => {
        event.preventDefault();
        event.stopPropagation();
        autoSizeColumn(th, columnId);
      });
      th.appendChild(handle);
      handle.addEventListener('mousedown', (event) => {
        event.preventDefault();
        event.stopPropagation();
        if (event.detail > 1) return;
        handle.classList.add('dragging');
        const startX = event.clientX;
        const startWidth = th.offsetWidth;
        const onMove = (moveEvent) => {
          const newWidth = Math.max(60, startWidth + moveEvent.clientX - startX);
          th.style.width = `${newWidth}px`;
          handle.currentWidth = newWidth;
        };
        const onUp = () => {
          handle.classList.remove('dragging');
          document.removeEventListener('mousemove', onMove);
          document.removeEventListener('mouseup', onUp);
          App.state.config.logview.colwidths.widths[columnId] = handle.currentWidth || startWidth;
          App.persist.logview.colwidths(App.state.config.logview.colwidths);
        };
        document.addEventListener('mousemove', onMove);
        document.addEventListener('mouseup', onUp);
      });
    });
  }

  const FILTERABLE_COLUMNS = new Set(['hostname', 'priority', 'facility', 'app_name']);

  function filterCellAttrs(columnId, index) {
    if (App.state.config.settings.logtable.filter === false) return '';
    if (!FILTERABLE_COLUMNS.has(columnId)) return '';
    return ` data-filter-row="${index}" data-filter-column="${columnId}" title="Click to filter by ${utils.escapeHtml(App.COLUMN_DEFS[columnId].label)}"`;
  }

  function filterDetailAttrs(key, value, index) {
    if (App.state.config.settings.logtable.filter === false) return '';
    if (key === '_time' || key === '_msg' || value == null || value === '') return '';
    if (key !== 'facility' && !/^[A-Za-z_][A-Za-z0-9_]*$/.test(key)) return '';
    return ` data-filter-row="${index}" data-filter-field="${utils.escapeHtml(key)}" title="Click to filter by ${utils.escapeHtml(key)}"`;
  }

  function renderDetailRow(log, index) {
    const entries = Object.entries(log).sort(([a], [b]) => a.localeCompare(b));
    const makeRow = (key, value, className = '') => {
      const cls = className ? ` ${className}` : '';
      const filterAttrs = filterDetailAttrs(key, value, index);
      const filterClass = filterAttrs ? ' filterable' : '';
      return `<div class="row-detail-item${cls}${filterClass}"${filterAttrs}><span class="row-detail-key">${utils.escapeHtml(key)}<span class="row-detail-sep">\t</span></span><span class="row-detail-value">${utils.escapeHtml(value == null ? '' : String(value))}</span></div>`;
    };
    const parts = entries.map(([key, value]) => makeRow(key, value, key === '_msg' ? 'row-detail-msg' : ''));
    return `<tr class="row-detail" data-detail-for="${index}"><td colspan="${App.COLUMN_ORDER.length}"><div class="row-detail-list">${parts.join('')}</div></td></tr>`;
  }

  function renderLogs(logs = App.state.runtime.currentLogs) {
    const tbody = dom.byId('log-body');
    if (!logs.length) {
      tbody.innerHTML = `<tr><td colspan="${App.COLUMN_ORDER.length}" class="empty">No logs found</td></tr>`;
      return;
    }
    const expanded = App.state.runtime.expandedRows;
    tbody.innerHTML = logs.map((log, index) => {
      const isExpanded = expanded.has(index);
      const cells = App.COLUMN_ORDER.map((columnId) => {
        const def = App.COLUMN_DEFS[columnId];
        const filterAttrs = filterCellAttrs(columnId, index);
        const classes = [def.className, filterAttrs ? 'filterable' : ''].filter(Boolean).join(' ');
        const cls = classes ? ` class="${classes}"` : '';
        const content = COLUMN_BEHAVIOR[columnId].render(log);
        let rowActions = '';
        if (columnId === '_msg') {
          const actionButtons = [];
          if (App.state.config.settings.logtable.expand !== false) {
            actionButtons.push(`<button class="msg-action-btn expand-row-btn" data-action="toggle-row" data-row-index="${index}" title="${isExpanded ? 'Collapse row' : 'Expand row'}" aria-label="${isExpanded ? 'Collapse row' : 'Expand row'}">${isExpanded ? '-' : '+'}</button>`);
          }
          if (App.state.config.settings.logtable.copy !== false) {
            actionButtons.push(`<button class="msg-action-btn copy-btn" data-action="copy-row" data-row-index="${index}" title="Copy row" aria-label="Copy row">⎘</button>`);
          }
          rowActions = actionButtons.length ? `<span class="msg-actions">${actionButtons.join('')}</span>` : '';
        }
        return columnId === '_msg'
          ? `<td${cls} data-col-id="${columnId}"><div class="msg-cell-inner">${content}${rowActions}</div></td>`
          : `<td${cls} data-col-id="${columnId}"${filterAttrs}>${content}</td>`;
      }).join('');
      const rowClass = isExpanded ? 'row-expanded' : '';
      const rowHtml = `<tr data-row-index="${index}" class="${rowClass}">${cells}</tr>`;
      return isExpanded ? rowHtml + renderDetailRow(log, index) : rowHtml;
    }).join('');
  }

  function toggleRow(index) {
    const expanded = App.state.runtime.expandedRows;
    if (expanded.has(index)) {
      expanded.delete(index);
    } else {
      const hadNone = expanded.size === 0;
      expanded.add(index);
      if (hadNone && App.state.config.logview.pollint !== 'off') {
        if (App.polling) App.polling.pauseForExpansion();
        App.render.renderToolbarState();
        App.render.renderConnectionPill();
      }
    }
    renderLogs();
  }

  function collapseAllRows() {
    const expanded = App.state.runtime.expandedRows;
    if (expanded.size === 0) return false;
    expanded.clear();
    return true;
  }

  function copyRow(index) {
    const log = App.state.runtime.currentLogs[index];
    if (!log) return;
    const text = App.COLUMN_ORDER.map((columnId) => getCopyValue(columnId, log)).join('\t');
    navigator.clipboard.writeText(text).then(() => {
      const row = dom.q(`tr[data-row-index="${index}"]`);
      if (row) {
        row.classList.add('copied');
        setTimeout(() => row.classList.remove('copied'), 400);
      }
      App.render.showToast('copied row');
    }).catch(() => App.render.showToast('copy failed'));
  }

  Object.assign(App.render, {
    renderTableHeader,
    renderLogs,
    copyRow,
    toggleRow,
    collapseAllRows,
  });

  Object.assign(App.renderInternals, {
    getCopyValue,
  });
})();
