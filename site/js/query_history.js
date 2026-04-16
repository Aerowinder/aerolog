(function () {
  const App = window.Aerolog;
  const { dom, utils } = App;

  function partition(excludeIndex = -1) {
    const pinned = [];
    const unpinned = [];
    App.state.config.queryhist.forEach((entry, index) => {
      if (index === excludeIndex) return;
      (entry.pinned ? pinned : unpinned).push(entry);
    });
    return { pinned, unpinned };
  }

  function entryAt(index) {
    return App.state.config.queryhist[Number(index)] || null;
  }

  function recordRecent(value) {
    const query = String(value || '').trim();
    if (!query) return App.state.config.queryhist;
    const existing = App.state.config.queryhist.find((entry) => entry.query === query);
    if (existing && existing.pinned) return App.state.config.queryhist;
    const pinned = [];
    const unpinned = [];
    App.state.config.queryhist.forEach((entry) => {
      if (entry.query === query) return;
      (entry.pinned ? pinned : unpinned).push(entry);
    });
    return App.persist.queryhist(pinned.concat([{ query, pinned: false }], unpinned));
  }

  function togglePin(index) {
    const entry = entryAt(index);
    if (!entry) return App.state.config.queryhist;
    const { pinned, unpinned } = partition(Number(index));
    if (entry.pinned) {
      if (entry.query === App.state.config.querydef) App.persist.querydef('');
      return App.persist.queryhist(pinned.concat([{ query: entry.query, pinned: false }], unpinned));
    }
    const nextPinned = [{ query: entry.query, pinned: true }].concat(pinned);
    const defaultIndex = nextPinned.findIndex((item) => item.query === App.state.config.querydef);
    if (defaultIndex > 0) {
      const [defaultEntry] = nextPinned.splice(defaultIndex, 1);
      nextPinned.unshift(defaultEntry);
    }
    return App.persist.queryhist(nextPinned.concat(unpinned));
  }

  function setDefault(index) {
    const entry = entryAt(index);
    if (!entry) return App.state.config.querydef;
    if (entry.query === App.state.config.querydef) return App.persist.querydef('');
    App.persist.querydef(entry.query);
    const { pinned, unpinned } = partition(Number(index));
    App.persist.queryhist([{ query: entry.query, pinned: true }].concat(pinned, unpinned));
    return App.state.config.querydef;
  }

  function remove(index) {
    const entry = entryAt(index);
    if (!entry) return App.state.config.queryhist;
    const next = App.state.config.queryhist.filter((_, entryIndex) => entryIndex !== Number(index));
    if (entry.query === App.state.config.querydef) App.persist.querydef('');
    return App.persist.queryhist(next);
  }

  function clearPinned(pinned) {
    const removedDefault = App.state.config.queryhist.some((entry) => entry.pinned === pinned && entry.query === App.state.config.querydef);
    if (removedDefault) App.persist.querydef('');
    return App.persist.queryhist(App.state.config.queryhist.filter((entry) => entry.pinned !== pinned));
  }

  function setOpen(open) {
    const box = dom.byId('search-box');
    const toggle = dom.q('.search-history-toggle', box);
    box.classList.toggle('history-open', open);
    toggle.setAttribute('aria-expanded', open ? 'true' : 'false');
    if (open) render();
  }

  function close() {
    const box = dom.byId('search-box');
    if (!box || !box.classList.contains('history-open')) return;
    setOpen(false);
  }

  function toggle() {
    const box = dom.byId('search-box');
    setOpen(!box.classList.contains('history-open'));
  }

  function render() {
    const menu = dom.byId('query-history-menu');
    const history = App.state.config.queryhist;
    if (!history.length) {
      menu.innerHTML = '<div class="query-history-empty">No recent queries</div>';
      return;
    }
    const items = history.map((entry, index) => {
      const escaped = utils.escapeHtml(entry.query);
      const isDefault = entry.query === App.state.config.querydef;
      return `
        <div class="query-history-row">
          <button class="query-history-icon query-history-pin ${entry.pinned ? 'active' : ''}" data-action="toggle-query-pin" data-query-index="${index}" type="button" title="${entry.pinned ? 'Unpin query' : 'Pin query'}" aria-label="${entry.pinned ? 'Unpin query' : 'Pin query'}">P</button>
          <button class="query-history-icon query-history-default ${isDefault ? 'active' : ''}" data-action="set-query-default" data-query-index="${index}" type="button" title="${isDefault ? 'Clear startup default' : 'Use as startup default'}" aria-pressed="${isDefault ? 'true' : 'false'}" aria-label="${isDefault ? 'Clear startup default' : 'Use as startup default'}">D</button>
          <button class="query-history-icon query-history-remove" data-action="remove-query-history" data-query-index="${index}" type="button" title="Remove query" aria-label="Remove query">X</button>
          <button class="query-history-item" data-action="run-query-history" data-query-index="${index}" type="button" title="${escaped}">${escaped}</button>
        </div>
      `;
    }).join('');
    menu.innerHTML = `${items}<div class="query-history-actions"><button class="query-history-clear" data-action="clear-pinned-query-history" type="button">Clear Pinned</button><button class="query-history-clear" data-action="clear-unpinned-query-history" type="button">Clear Unpinned</button></div>`;
  }

  App.queryHistory = {
    clearPinned,
    close,
    entryAt,
    recordRecent,
    remove,
    render,
    setDefault,
    toggle,
    togglePin,
  };
})();
