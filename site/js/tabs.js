(function () {
  const App = window.Aerolog;

  function currentTab() {
    return App.state.config.tabs.find((tab) => tab.id === App.state.runtime.editingTabId) || null;
  }

  async function activateTab(tabId) {
    App.state.runtime.activeTabId = tabId;
    App.state.runtime.currentPage = 1;
    App.render.renderTabs();
    await App.api.dispatchRefresh('manual');
  }

  async function goPage(page) {
    const nextPage = Math.max(1, Math.min(App.state.runtime.totalPages, page));
    if (nextPage === App.state.runtime.currentPage) return;
    const leavingPageOne = App.state.runtime.currentPage === 1 && nextPage !== 1;
    App.state.runtime.currentPage = nextPage;
    if (leavingPageOne) {
      App.polling.pauseForNavigation();
    }
    App.render.renderToolbarState();
    await App.api.dispatchRefresh('page');
    if (App.state.runtime.currentPage !== 1) {
      App.render.renderConnectionPill();
    }
    const pager = document.querySelector('.pagination');
    if (pager) pager.scrollIntoView({ block: 'end', behavior: 'auto' });
  }

  function openTabModal() {
    closeTabEdit();
    App.render.renderTabList();
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
    document.getElementById('edit-tab-name').value = tab.name;
    document.getElementById('edit-tab-hosts').value = tab.hosts.join('\n');
    document.getElementById('tab-modal-title').textContent = `Edit: ${tab.name}`;
    document.getElementById('tab-list-view').style.display = 'none';
    document.getElementById('tab-edit-view').style.display = 'block';
  }

  function closeTabEdit() {
    App.state.runtime.editingTabId = null;
    document.getElementById('tab-modal-title').textContent = 'Tabs';
    document.getElementById('tab-list-view').style.display = 'block';
    document.getElementById('tab-edit-view').style.display = 'none';
    App.render.renderTabList();
  }

  async function addTab() {
    const name = document.getElementById('new-tab-name').value.trim();
    const hosts = App.validators.hostList(document.getElementById('new-tab-hosts').value.split('\n'));
    if (!name) {
      App.utils.showAlert('Tab name is required');
      return;
    }
    if (!hosts.length) {
      App.utils.showAlert('At least one hostname is required');
      return;
    }
    const nextTabs = App.state.config.tabs.concat([{ id: Date.now(), name, hosts }]);
    App.persist.tabs(nextTabs);
    document.getElementById('new-tab-name').value = '';
    document.getElementById('new-tab-hosts').value = '';
    App.render.renderTabs();
    App.render.renderTabList();
    App.state.runtime.currentPage = 1;
    await App.api.dispatchRefresh('manual');
  }

  async function saveTabEdit() {
    const tab = currentTab();
    if (!tab) return;
    const name = document.getElementById('edit-tab-name').value.trim();
    const hosts = App.validators.hostList(document.getElementById('edit-tab-hosts').value.split('\n'));
    if (!name) {
      App.utils.showAlert('Tab name is required');
      return;
    }
    if (!hosts.length) {
      App.utils.showAlert('At least one hostname is required');
      return;
    }
    const nextTabs = App.state.config.tabs.map((entry) => entry.id === tab.id ? { ...entry, name, hosts } : entry);
    App.persist.tabs(nextTabs);
    App.render.renderTabs();
    closeTabEdit();
    if (App.state.runtime.activeTabId === tab.id) {
      App.state.runtime.currentPage = 1;
      await App.api.dispatchRefresh('manual');
    }
  }

  async function deleteTabFromEdit() {
    const tabId = App.state.runtime.editingTabId;
    if (tabId == null) return;
    if (!window.confirm('Delete this tab?')) return;
    App.persist.tabs(App.state.config.tabs.filter((entry) => entry.id !== tabId));
    if (App.state.runtime.activeTabId === tabId) {
      App.state.runtime.activeTabId = 0;
      App.state.runtime.currentPage = 1;
    }
    App.render.renderTabs();
    closeTabEdit();
    await App.api.dispatchRefresh('manual');
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
  };
})();
