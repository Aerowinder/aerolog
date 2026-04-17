(function () {
  const App = window.Aerolog;
  const { dom } = App;

  function openAliasesModal() {
    dom.byId('aliases-text').value = App.query.aliasesToText();
    App.modals.openModal('aliases-modal');
  }

  function closeAliasesModal() {
    App.modals.closeModal('aliases-modal');
  }

  async function saveAliases() {
    const aliases = App.validators.aliasesText(dom.byId('aliases-text').value);
    const duplicateFriendly = App.validators.duplicateFriendlyAlias(aliases);
    if (duplicateFriendly) {
      App.toasts.error(`Alias "${duplicateFriendly}" is used more than once`);
      return;
    }
    closeAliasesModal();
    await App.actions.saveAliases(aliases);
  }

  App.aliases = {
    openAliasesModal,
    closeAliasesModal,
    saveAliases,
  };
})();
