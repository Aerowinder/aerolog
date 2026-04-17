(function () {
  const App = window.Aerolog;
  const { dom } = App;

  function currentTab() {
    return App.state.config.tabs.find((tab) => tab.id === App.state.runtime.editingTabId) || null;
  }

  async function activateTab(tabId) {
    await App.actions.activateTab(tabId);
  }

  async function goPage(page) {
    await App.actions.goPage(page);
    const pager = document.querySelector('.pagination');
    if (pager) pager.scrollIntoView({ block: 'end', behavior: 'auto' });
  }

  function openTabModal() {
    closeTabEdit();
    App.modals.openModal('tab-modal');
  }

  function closeTabModal() {
    App.modals.closeModal('tab-modal');
    closeTabEdit();
  }

  function openTabEdit(tabId) {
    const tab = App.state.config.tabs.find((entry) => entry.id === tabId);
    if (!tab) return;
    App.state.runtime.editingTabId = tabId;
    dom.byId('edit-tab-name').value = tab.name;
    dom.byId('edit-tab-hosts').value = tab.hosts.join('\n');
    dom.byId('tab-modal-title').textContent = `Edit: ${tab.name}`;
    dom.byId('tab-list-view').style.display = 'none';
    dom.byId('tab-edit-view').style.display = 'block';
  }

  function closeTabEdit() {
    App.state.runtime.editingTabId = null;
    dom.byId('tab-modal-title').textContent = 'Tabs';
    dom.byId('tab-list-view').style.display = 'block';
    dom.byId('tab-edit-view').style.display = 'none';
    App.render.renderTabList();
  }

  async function addTab() {
    const name = dom.byId('new-tab-name').value.trim();
    const hosts = App.validators.hostList(dom.byId('new-tab-hosts').value.split('\n'));
    if (!name) {
      App.toasts.error('Enter a tab name');
      return;
    }
    if (!hosts.length) {
      App.toasts.error('Add at least one hostname');
      return;
    }
    dom.byId('new-tab-name').value = '';
    dom.byId('new-tab-hosts').value = '';
    await App.actions.addTab({ name, hosts });
  }

  async function saveTabEdit() {
    const tab = currentTab();
    if (!tab) return;
    const name = dom.byId('edit-tab-name').value.trim();
    const hosts = App.validators.hostList(dom.byId('edit-tab-hosts').value.split('\n'));
    if (!name) {
      App.toasts.error('Enter a tab name');
      return;
    }
    if (!hosts.length) {
      App.toasts.error('Add at least one hostname');
      return;
    }
    closeTabEdit();
    await App.actions.saveTab(tab.id, { name, hosts });
  }

  async function deleteTabFromEdit() {
    const tabId = App.state.runtime.editingTabId;
    if (tabId == null) return;
    if (!window.confirm('Delete this tab?')) return;
    closeTabEdit();
    await App.actions.deleteTab(tabId);
  }

  function moveTab(tabId, direction) {
    App.actions.moveTab(tabId, direction);
  }

  App.tabs = {
    activateTab,
    goPage,
    openTabModal,
    closeTabModal,
    openTabEdit,
    closeTabEdit,
    addTab,
    saveTabEdit,
    deleteTabFromEdit,
    moveTab,
  };
})();
