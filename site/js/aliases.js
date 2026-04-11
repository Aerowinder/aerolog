(function () {
  const App = window.Aerolog;

  function openAliasesModal() {
    document.getElementById('aliases-text').value = App.query.aliasesToText();
    App.modals.openModal('aliases-modal');
  }

  function closeAliasesModal() {
    App.modals.closeModal('aliases-modal');
  }

  async function saveAliases() {
    const aliases = App.validators.aliasesText(document.getElementById('aliases-text').value);
    const duplicateFriendly = App.validators.duplicateFriendlyAlias(aliases);
    if (duplicateFriendly) {
      App.utils.showAlert(`Friendly alias names must be unique. Duplicate: ${duplicateFriendly}`);
      return;
    }
    App.persist.aliases(aliases);
    closeAliasesModal();
    App.render.renderLogs();
    await App.api.dispatchRefresh('manual');
  }

  App.aliases = {
    openAliasesModal,
    closeAliasesModal,
    saveAliases,
  };
})();
