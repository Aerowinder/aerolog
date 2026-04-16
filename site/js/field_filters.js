(function () {
  const App = window.Aerolog;
  const { dom, utils } = App;

  let currentFilter = null;

  function fieldMenu() {
    return dom.byId('field-filter-menu');
  }

  function fieldValue(raw) {
    const value = String(raw ?? '').trim();
    return value || '';
  }

  function quoteQueryValue(value) {
    return utils.quoteLogsQlValue(value);
  }

  function friendlyClause(field, value) {
    return `${field}:${quoteQueryValue(value)}`;
  }

  function rawFieldClause(field, value) {
    if (!/^[A-Za-z_][A-Za-z0-9_]*$/.test(field)) return null;
    return `${field}:=${quoteQueryValue(value)}`;
  }

  function tableCellFilter(rowIndex, columnId) {
    const log = App.state.runtime.currentLogs[rowIndex];
    if (!log || columnId === '_time' || columnId === '_msg') return null;

    if (columnId === 'hostname') {
      const value = fieldValue(App.query.displayHostname(log.hostname));
      return value ? { field: 'host', value, clause: friendlyClause('host', value) } : null;
    }

    if (columnId === 'priority') {
      const value = fieldValue(log.severity);
      return value ? { field: 'severity', value, clause: `sev:${value}` } : null;
    }

    if (columnId === 'facility') {
      const keyword = fieldValue(log.facility_keyword);
      if (keyword) return { field: 'facility', value: keyword, clause: friendlyClause('fac', keyword) };
      const number = fieldValue(log.facility);
      return number ? { field: 'facility_num', value: number, clause: `facility_num:${number}` } : null;
    }

    if (columnId === 'app_name') {
      const value = fieldValue(log.app_name);
      return value ? { field: 'app', value, clause: friendlyClause('app', value) } : null;
    }

    return null;
  }

  function detailFieldFilter(rowIndex, field) {
    const log = App.state.runtime.currentLogs[rowIndex];
    if (!log || field === '_time' || field === '_msg') return null;

    if (field === 'facility') {
      return tableCellFilter(rowIndex, 'facility');
    }

    const value = fieldValue(log[field]);
    const clause = value ? rawFieldClause(field, value) : null;
    return clause ? { field, value, clause } : null;
  }

  function filterFromTarget(target) {
    const rowIndex = Number(target.dataset.filterRow);
    if (!Number.isInteger(rowIndex) || rowIndex < 0) return null;
    if (target.dataset.filterColumn) return tableCellFilter(rowIndex, target.dataset.filterColumn);
    if (target.dataset.filterField) return detailFieldFilter(rowIndex, target.dataset.filterField);
    return null;
  }

  function truncate(value, limit = 80) {
    const text = String(value || '');
    return text.length > limit ? `${text.slice(0, limit - 1)}...` : text;
  }

  function positionMenu(menu, target) {
    const rect = target.getBoundingClientRect();
    const gap = 6;
    menu.classList.remove('mobile-sheet');
    menu.style.left = '0px';
    menu.style.top = '0px';
    menu.style.right = '';
    menu.style.bottom = '';
    menu.style.visibility = 'hidden';
    menu.hidden = false;
    const menuRect = menu.getBoundingClientRect();
    const left = Math.min(Math.max(gap, rect.left), window.innerWidth - menuRect.width - gap);
    const below = rect.bottom + gap;
    const above = rect.top - menuRect.height - gap;
    const top = below + menuRect.height <= window.innerHeight - gap ? below : Math.max(gap, above);
    menu.style.left = `${left}px`;
    menu.style.top = `${top}px`;
    menu.style.visibility = '';
  }

  function positionMobileMenu(menu) {
    menu.classList.add('mobile-sheet');
    menu.style.left = '';
    menu.style.top = '';
    menu.style.right = '';
    menu.style.bottom = '';
    menu.style.visibility = '';
    menu.hidden = false;
  }

  function open(target) {
    if (App.state.config.settings.logtable.filter === false) {
      close();
      return null;
    }
    const filter = filterFromTarget(target);
    if (!filter) {
      close();
      return null;
    }
    currentFilter = filter;
    const menu = fieldMenu();
    if (!menu) return null;
    const clause = utils.escapeHtml(truncate(filter.clause));
    menu.innerHTML = `
      <div class="field-filter-title">APPEND TO QUERY</div>
      <div class="field-filter-value">${clause}</div>
      <div class="field-filter-actions">
        <button type="button" data-action="field-filter-include">Include</button>
        <button type="button" data-action="field-filter-exclude">Exclude</button>
      </div>
    `;
    menu.classList.add('open');
    if (App.isMobileMode()) {
      positionMobileMenu(menu);
    } else {
      positionMenu(menu, target);
    }
    return filter;
  }

  function close() {
    currentFilter = null;
    const menu = fieldMenu();
    if (!menu) return;
    menu.hidden = true;
    menu.classList.remove('open');
    menu.classList.remove('mobile-sheet');
    if (!menu.style) return;
    menu.style.left = '';
    menu.style.top = '';
    menu.style.right = '';
    menu.style.bottom = '';
    menu.style.visibility = '';
  }

  function menuContains(target) {
    const menu = fieldMenu();
    return Boolean(menu && menu.contains(target));
  }

  function appendClause(query, clause) {
    return [String(query || '').trim(), clause].filter(Boolean).join(' ');
  }

  function buildAppliedQuery(mode, baseQuery) {
    if (!currentFilter) return String(baseQuery || '').trim();
    const clause = mode === 'exclude' ? `NOT (${currentFilter.clause})` : currentFilter.clause;
    return appendClause(baseQuery, clause);
  }

  App.fieldFilters = {
    open,
    close,
    menuContains,
    current() {
      return currentFilter;
    },
    buildAppliedQuery,
    filterFromTarget,
  };
})();
