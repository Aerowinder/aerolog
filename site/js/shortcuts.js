(function () {
  const App = window.Aerolog;

  function isTypingTarget(target) {
    if (!target || !target.tagName) return false;
    const tag = target.tagName;
    if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT') return true;
    return Boolean(target.isContentEditable);
  }

  function anyModalOpen() {
    return Boolean(document.querySelector('.modal-overlay.open'));
  }

  function focusSearch() {
    const box = App.dom.byId('search');
    if (!box) return;
    box.focus();
    if (typeof box.select === 'function') box.select();
  }

  function openShortcutsOverlay() {
    if (App.modals && typeof App.modals.openModal === 'function') {
      App.modals.openModal('shortcuts-modal');
    }
  }

  function closeShortcutsOverlay() {
    if (App.modals && typeof App.modals.closeModal === 'function') {
      App.modals.closeModal('shortcuts-modal');
    }
  }

  function toggleShortcutsOverlay() {
    const overlay = App.dom.byId('shortcuts-modal');
    if (overlay && overlay.classList.contains('open')) {
      closeShortcutsOverlay();
    } else {
      openShortcutsOverlay();
    }
  }

  function refreshNow() {
    if (App.api && typeof App.api.dispatchRefresh === 'function') {
      App.api.dispatchRefresh('manual');
    }
  }

  function goRelative(delta) {
    const runtime = App.state.runtime;
    const target = Math.max(1, Math.min(runtime.totalPages, runtime.currentPage + delta));
    if (target === runtime.currentPage) return;
    App.actions.goPage(target);
  }

  function goFirst() {
    if (App.state.runtime.currentPage === 1) return;
    App.actions.goPage(1);
  }

  function goLast() {
    const runtime = App.state.runtime;
    if (runtime.currentPage === runtime.totalPages) return;
    App.actions.goPage(runtime.totalPages);
  }

  function handleKey(event) {
    if (event.ctrlKey || event.metaKey || event.altKey) return;
    if (isTypingTarget(event.target)) return;
    if (event.key === '?') {
      event.preventDefault();
      toggleShortcutsOverlay();
      return;
    }
    if (anyModalOpen()) return;

    switch (event.key) {
      case '/':
        event.preventDefault();
        focusSearch();
        return;
      case 'r':
      case 'R':
        event.preventDefault();
        refreshNow();
        return;
      case '[':
        event.preventDefault();
        goRelative(-1);
        return;
      case ']':
        event.preventDefault();
        goRelative(1);
        return;
      case 'Home':
        event.preventDefault();
        goFirst();
        return;
      case 'End':
        event.preventDefault();
        goLast();
        return;
      default:
    }
  }

  function bind() {
    document.addEventListener('keydown', handleKey);
  }

  App.shortcuts = {
    bind,
    handleKey,
    openShortcutsOverlay,
    closeShortcutsOverlay,
    toggleShortcutsOverlay,
  };
})();
