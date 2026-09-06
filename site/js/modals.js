(function () {
  const App = window.Aerolog;
  const { dom } = App;
  let lockedScrollY = 0;
  const modalStack = [];
  const previousInert = new Map();

  function lockPageScroll() {
    if (document.body.classList.contains('modal-open')) return;
    lockedScrollY = window.scrollY || document.documentElement.scrollTop || 0;
    document.body.style.top = `-${lockedScrollY}px`;
    document.body.classList.add('modal-open');
  }

  function unlockPageScroll() {
    if (modalStack.length || !document.body.classList.contains('modal-open')) return;
    document.body.classList.remove('modal-open');
    document.body.style.top = '';
    window.scrollTo(0, lockedScrollY);
  }

  function focusableElements(overlay) {
    return Array.from(overlay.querySelectorAll('button, input, select, textarea, a[href], [tabindex]'))
      .filter((element) => !element.disabled && element.tabIndex >= 0 && element.getClientRects().length);
  }

  function syncModalInert() {
    const top = modalStack.length ? modalStack[modalStack.length - 1].overlay : null;
    for (const child of document.body.children) {
      if (!previousInert.has(child)) previousInert.set(child, child.inert);
      child.inert = top ? child !== top && child.id !== 'toast' : previousInert.get(child);
    }
    if (!top) previousInert.clear();
  }

  function fitTextarea(textarea) {
    if (textarea.tagName !== 'TEXTAREA' || !textarea.getClientRects().length) return;
    const modal = textarea.closest('.modal');
    if (!modal) return;
    // Restore the rows-based minimum before measuring wrapped content. The
    // remaining modal contents reserve room for labels, hints and buttons.
    textarea.style.height = '';
    const minimum = textarea.offsetHeight;
    const border = textarea.offsetHeight - textarea.clientHeight;
    const otherHeight = modal.scrollHeight - minimum + modal.offsetHeight - modal.clientHeight;
    const available = Math.max(minimum, window.innerHeight * 0.9 - otherHeight);
    textarea.style.height = `${Math.min(available, Math.max(minimum, textarea.scrollHeight + border))}px`;
  }

  function fitTextareas(id) {
    dom.byId(id).querySelectorAll('textarea').forEach(fitTextarea);
  }

  function openModal(id) {
    const overlay = dom.byId(id);
    if (overlay.classList.contains('open')) return;
    modalStack.push({ overlay, returnFocus: document.activeElement });
    overlay.classList.add('open');
    fitTextareas(id);
    overlay.setAttribute('role', 'dialog');
    overlay.setAttribute('aria-modal', 'true');
    overlay.tabIndex = -1;
    const heading = overlay.querySelector('h3');
    if (heading) {
      if (!heading.id) heading.id = `${id}-title`;
      overlay.setAttribute('aria-labelledby', heading.id);
    }
    lockPageScroll();
    syncModalInert();
    overlay.focus({ preventScroll: true });
  }

  function closeModal(id) {
    const index = modalStack.findIndex((entry) => entry.overlay.id === id);
    if (index === -1) return false;
    const wasTop = index === modalStack.length - 1;
    const [{ overlay, returnFocus }] = modalStack.splice(index, 1);
    overlay.classList.remove('open');
    syncModalInert();
    unlockPageScroll();
    if (wasTop) {
      const top = modalStack.length ? modalStack[modalStack.length - 1].overlay : null;
      const target = returnFocus && returnFocus.isConnected && !returnFocus.closest('[inert]') ? returnFocus : top;
      if (target) target.focus({ preventScroll: true });
    }
    return true;
  }

  function containFocus(event) {
    if (event.key !== 'Tab' || !modalStack.length) return;
    const overlay = modalStack[modalStack.length - 1].overlay;
    const elements = focusableElements(overlay);
    const first = elements[0] || overlay;
    const last = elements[elements.length - 1] || overlay;
    if (!elements.length || !overlay.contains(document.activeElement)
      || (event.shiftKey && (document.activeElement === first || document.activeElement === overlay))
      || (!event.shiftKey && document.activeElement === last)) {
      event.preventDefault();
      (event.shiftKey ? last : first).focus();
    }
  }

  function openSettingsModal() {
    dom.byId('server-url').value = App.state.config.settings.server;
    App.render.renderThemeButtons();
    App.render.renderToolToggles();
    App.render.renderMessageLineSelect();
    App.render.renderRowActionToggles();
    if (App.render.renderHostnameFallbackControls) App.render.renderHostnameFallbackControls();
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
    if (closeModal('custom-time-modal')) App.render.renderToolbarState();
  }

  async function applyCustomTimeRange() {
    const startValue = dom.byId('custom-time-start').value;
    const endValue = dom.byId('custom-time-end').value;
    const start = startValue ? new Date(startValue) : null;
    const end = endValue ? new Date(endValue) : null;
    if (!start || !end || Number.isNaN(start.getTime()) || Number.isNaN(end.getTime()) || start.getTime() >= end.getTime()) {
      App.toasts.error('Choose a start time before the end time');
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
      if (App.state.runtime.importSaved) App.toasts.success('Config imported');
      else App.toasts.error('Config applied for this session, but could not be fully saved. Retry the import when browser storage is available.');
    } catch (err) {
      App.toasts.error(`Config import failed: ${err.message}`);
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
    fitTextarea,
    fitTextareas,
    containFocus,
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
