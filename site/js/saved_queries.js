(function () {
  const App = window.Aerolog;

  function openQueriesModal() {
    App.state.runtime.editingQueryId = null;
    document.getElementById('query-modal-title').textContent = 'Saved Queries';
    document.getElementById('query-list-view').style.display = 'block';
    document.getElementById('query-edit-view').style.display = 'none';
    document.getElementById('new-query-name').value = '';
    document.getElementById('new-query-text').value = '';
    App.render.renderQueryList();
    App.modals.openModal('queries-modal');
  }

  function closeQueriesModal() {
    App.modals.closeModal('queries-modal');
  }

  function openQueryEdit(queryId) {
    const query = App.state.config.queries.find((entry) => entry.id === queryId);
    if (!query) return;
    App.state.runtime.editingQueryId = queryId;
    document.getElementById('edit-query-name').value = query.name;
    document.getElementById('edit-query-text').value = query.query;
    document.getElementById('query-modal-title').textContent = `Edit: ${query.name}`;
    document.getElementById('query-list-view').style.display = 'none';
    document.getElementById('query-edit-view').style.display = 'block';
    App.render.renderDefaultQueryButton();
  }

  function closeQueryEdit() {
    App.state.runtime.editingQueryId = null;
    document.getElementById('query-modal-title').textContent = 'Saved Queries';
    document.getElementById('query-list-view').style.display = 'block';
    document.getElementById('query-edit-view').style.display = 'none';
    App.render.renderQueryList();
  }

  function addQuery() {
    const name = document.getElementById('new-query-name').value.trim();
    const query = document.getElementById('new-query-text').value.trim();
    if (!name || !query) {
      App.utils.showAlert('Query name and text are required');
      return;
    }
    App.persist.queries(App.state.config.queries.concat([{ id: Date.now(), name, query }]));
    document.getElementById('new-query-name').value = '';
    document.getElementById('new-query-text').value = '';
    App.render.renderQueryList();
  }

  function toggleDefaultQuery() {
    const queryId = App.state.runtime.editingQueryId;
    if (queryId == null) return;
    const nextDefaultId = App.state.config.defaultQueryId === queryId ? null : queryId;
    App.persist.defaultQueryId(nextDefaultId);
    App.render.renderDefaultQueryButton();
    App.render.renderQueryList();
  }

  function saveQueryEdit() {
    if (App.state.runtime.editingQueryId == null) return;
    const name = document.getElementById('edit-query-name').value.trim();
    const query = document.getElementById('edit-query-text').value.trim();
    if (!name || !query) {
      App.utils.showAlert('Query name and text are required');
      return;
    }
    App.persist.queries(App.state.config.queries.map((entry) => entry.id === App.state.runtime.editingQueryId ? { ...entry, name, query } : entry));
    closeQueryEdit();
  }

  function deleteQueryFromEdit() {
    if (App.state.runtime.editingQueryId == null) return;
    if (!window.confirm('Delete this saved query?')) return;
    App.persist.queries(App.state.config.queries.filter((entry) => entry.id !== App.state.runtime.editingQueryId));
    closeQueryEdit();
  }

  async function loadQueryFromEdit() {
    if (App.state.runtime.editingQueryId == null) return;
    const query = App.state.config.queries.find((entry) => entry.id === App.state.runtime.editingQueryId);
    if (!query) return;
    closeQueriesModal();
    App.state.runtime.committedSearch = query.query;
    App.state.runtime.currentPage = 1;
    App.render.renderToolbarState();
    await App.api.dispatchRefresh('manual');
  }

  App.savedQueries = {
    openQueriesModal,
    closeQueriesModal,
    openQueryEdit,
    closeQueryEdit,
    addQuery,
    toggleDefaultQuery,
    saveQueryEdit,
    deleteQueryFromEdit,
    loadQueryFromEdit,
  };
})();
