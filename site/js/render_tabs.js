(function () {
  const App = window.Aerolog;
  const { dom, utils } = App;

  function updateTabOverflow(container = dom.byId('tabs')) {
    if (!container) return;
    container.classList.remove('is-overflowing');
    container.classList.toggle('is-overflowing', container.scrollWidth > container.clientWidth + 1);
  }

  function renderTabs() {
    const container = dom.byId('tabs');
    let html = `<button class="tab ${App.state.runtime.activeTabId === 0 ? 'active' : ''}" data-action="activate-tab" data-tab-id="0">All Logs</button>`;
    for (const tab of App.state.config.tabs) {
      html += `<button class="tab ${App.state.runtime.activeTabId === tab.id ? 'active' : ''}" data-action="activate-tab" data-tab-id="${tab.id}">${utils.escapeHtml(tab.name)}</button>`;
    }
    const tabvis = App.state.config.settings.tabvis;
    const tools = [];
    if (tabvis.tabs) tools.push('<button class="tab tab-mgmt" data-action="open-tab-modal">Tabs</button>');
    if (tabvis.aliases) tools.push('<button class="tab tab-mgmt" data-action="open-aliases">Aliases</button>');
    if (tabvis.heartbeats) tools.push('<button class="tab tab-mgmt" data-action="open-heartbeats">Heartbeats</button>');
    if (tools.length) {
      html += `<div class="tab-tools"><div class="tab-sep"></div>${tools.join('')}</div>`;
    }
    container.innerHTML = html;
    updateTabOverflow(container);
    window.requestAnimationFrame(() => updateTabOverflow(container));
  }

  function renderTabList() {
    const container = dom.byId('tab-list');
    if (!App.state.config.tabs.length) {
      container.innerHTML = '<p class="hint empty-list-hint">No tabs yet. Add one below.</p>';
      return;
    }
    container.innerHTML = App.state.config.tabs.map((tab, index) => `
      <div class="list-item">
        <span class="list-item-main"><b>${utils.escapeHtml(tab.name)}</b> <span class="list-item-meta">(${tab.hosts.length} host${tab.hosts.length === 1 ? '' : 's'})</span></span>
        <span class="list-item-actions">
          <button class="list-icon-btn" data-action="move-tab" data-tab-id="${tab.id}" data-direction="-1" ${index === 0 ? 'disabled' : ''} title="Move up" aria-label="Move ${utils.escapeHtml(tab.name)} up">&uarr;</button>
          <button class="list-icon-btn" data-action="move-tab" data-tab-id="${tab.id}" data-direction="1" ${index === App.state.config.tabs.length - 1 ? 'disabled' : ''} title="Move down" aria-label="Move ${utils.escapeHtml(tab.name)} down">&darr;</button>
          <button class="list-icon-btn" data-action="open-tab-edit" data-tab-id="${tab.id}" aria-label="Edit ${utils.escapeHtml(tab.name)}">edit</button>
        </span>
      </div>
    `).join('');
  }

  Object.assign(App.render, {
    updateTabOverflow,
    renderTabs,
    renderTabList,
  });
})();
