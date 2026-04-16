(function () {
  const App = window.Aerolog;
  const { dom } = App;
  let lockedScrollY = 0;

  function lockPageScroll() {
    if (document.body.classList.contains('modal-open')) return;
    lockedScrollY = window.scrollY || document.documentElement.scrollTop || 0;
    document.body.style.top = `-${lockedScrollY}px`;
    document.body.classList.add('modal-open');
  }

  function unlockPageScroll() {
    if (document.querySelector('.modal-overlay.open')) return;
    document.body.classList.remove('modal-open');
    document.body.style.top = '';
    window.scrollTo(0, lockedScrollY);
  }

  function openModal(id) {
    dom.byId(id).classList.add('open');
    lockPageScroll();
  }

  function closeModal(id) {
    dom.byId(id).classList.remove('open');
    unlockPageScroll();
  }

  function openSettingsModal() {
    dom.byId('server-url').value = App.state.config.settings.server;
    App.render.renderThemeButtons();
    App.render.renderToolToggles();
    App.render.renderMessageLineSelect();
    App.render.renderRowActionToggles();
    openModal('settings-modal');
  }

  function closeSettingsModal() {
    closeModal('settings-modal');
  }

  function abortServerEdit() {
    dom.byId('server-url').value = App.state.config.settings.server;
  }

  async function applyServerFromSettings() {
    return App.actions.saveServerSettings(dom.byId('server-url').value);
  }

  async function doneSettingsModal() {
    await applyServerFromSettings();
    closeSettingsModal();
  }

  function padDatePart(value) {
    return String(value).padStart(2, '0');
  }

  function toDateTimeLocalValue(value) {
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) return '';
    return [
      date.getFullYear(),
      padDatePart(date.getMonth() + 1),
      padDatePart(date.getDate()),
    ].join('-') + 'T' + [
      padDatePart(date.getHours()),
      padDatePart(date.getMinutes()),
    ].join(':');
  }

  function defaultCustomTimeRange() {
    const end = new Date();
    const start = new Date(end.getTime() - 60 * 60 * 1000);
    return { start: start.toISOString(), end: end.toISOString() };
  }

  function openCustomTimeModal() {
    const range = App.state.config.logview.timecustom.start && App.state.config.logview.timecustom.end
      ? App.state.config.logview.timecustom
      : defaultCustomTimeRange();
    dom.byId('custom-time-start').value = toDateTimeLocalValue(range.start);
    dom.byId('custom-time-end').value = toDateTimeLocalValue(range.end);
    openModal('custom-time-modal');
  }

  function closeCustomTimeModal() {
    closeModal('custom-time-modal');
    App.render.renderToolbarState();
  }

  async function applyCustomTimeRange() {
    const startValue = dom.byId('custom-time-start').value;
    const endValue = dom.byId('custom-time-end').value;
    const start = startValue ? new Date(startValue) : null;
    const end = endValue ? new Date(endValue) : null;
    if (!start || !end || Number.isNaN(start.getTime()) || Number.isNaN(end.getTime()) || start.getTime() >= end.getTime()) {
      App.utils.showAlert('Choose a valid start time before the end time.');
      return;
    }
    closeModal('custom-time-modal');
    await App.actions.applyCustomTimeRange({ start: start.toISOString(), end: end.toISOString() });
  }

  async function clearCustomTimeRange() {
    closeModal('custom-time-modal');
    await App.actions.clearCustomTimeRange();
  }

  function exportConfig() {
    const config = App.configIo.buildExportConfig();
    const blob = new Blob([JSON.stringify(config, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = App.configIo.exportFilename();
    document.body.appendChild(link);
    link.click();
    link.remove();
    setTimeout(() => URL.revokeObjectURL(url), 0);
  }

  async function importConfig(event) {
    const file = event.target.files && event.target.files[0];
    if (!file) return;
    try {
      const text = await file.text();
      const config = JSON.parse(text);
      App.configIo.applyImportedConfig(config);
      App.render.renderAllStatic();
      closeSettingsModal();
      await App.polling.applyPolling('settings');
      App.utils.showAlert('Config imported successfully');
    } catch (err) {
      App.utils.showAlert(`Failed to import config: ${err.message}`);
    } finally {
      event.target.value = '';
    }
  }

  async function resetConfig() {
    if (!window.confirm('Reset all Aerolog settings? This clears all aerolog_* localStorage settings.')) return;
    App.actions.resetConfig();
    App.render.renderAllStatic();
    closeSettingsModal();
    await App.polling.applyPolling('manual');
  }

  App.modals = {
    openModal,
    closeModal,
    openSettingsModal,
    closeSettingsModal,
    abortServerEdit,
    applyServerFromSettings,
    doneSettingsModal,
    openCustomTimeModal,
    closeCustomTimeModal,
    applyCustomTimeRange,
    clearCustomTimeRange,
    exportConfig,
    importConfig,
    resetConfig,
  };
})();
