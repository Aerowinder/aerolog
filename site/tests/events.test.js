const { loadApp, loadModule, test, assertEqual } = require('./helpers');

function fakeElement(id) {
  const listeners = {};
  return {
    id,
    value: '',
    dataset: {},
    listeners,
    addEventListener(type, handler) { listeners[type] = handler; },
    classList: { add() {}, remove() {}, contains() { return false; } },
    contains() { return false; },
    closest() { return null; },
    click() { this.clicked = true; },
    focus(options) { this.focusOptions = options; },
    blur() { this.blurred = true; },
  };
}

function loadAppWithEvents() {
  const App = loadApp({}, ['core.js', 'state.js', 'query_history.js', 'query.js', 'field_filters.js', 'actions.js', 'shortcuts.js']);
  const ids = [
    'search', 'poll-interval', 'page-size', 'time-range', 'import-file', 'server-url', 'search-box',
    'settings-modal', 'tab-modal', 'aliases-modal', 'heartbeats-modal', 'custom-time-modal', 'shortcuts-modal',
  ];
  const elements = Object.fromEntries(ids.map((id) => [id, fakeElement(id)]));
  App.dom.byId = (id) => elements[id] || fakeElement(id);
  App.dom.qa = () => [];
  App.render = {
    renderAllStatic() {},
    updateTabOverflow() {},
    renderPagination() {},
  };
  App.polling = {
    applyPolling() { App.__appliedPolling = true; },
  };
  App.modals = {
    openSettingsModal() {},
    closeSettingsModal() {},
    doneSettingsModal() { App.__doneSettings = true; },
    abortServerEdit() { App.__abortedServer = true; },
    applyServerFromSettings() { App.__appliedServer = true; },
    importConfig() {},
    openCustomTimeModal() {},
    closeCustomTimeModal() {},
    applyCustomTimeRange() {},
    clearCustomTimeRange() {},
    exportConfig() {},
    resetConfig() {},
  };
  App.tabs = {
    openTabModal() {}, closeTabModal() {}, activateTab() {}, openTabEdit() {}, closeTabEdit() {},
    addTab() {}, saveTabEdit() {}, deleteTabFromEdit() {}, moveTab() {}, goPage() {},
  };
  App.aliases = { openAliasesModal() {}, closeAliasesModal() {}, saveAliases() {} };
  App.heartbeats = { openHeartbeatsModal() {}, closeHeartbeatsModal() {} };
  App.queryHistory.close = () => {};
  App.queryHistory.toggle = () => {};
  App.shortcuts.bind = () => { App.__shortcutsBound = true; };
  App.__testContext.requestAnimationFrame = (callback) => callback();
  App.__testContext.window.requestIdleCallback = (callback) => { App.__idleCallback = callback; };
  App.__testContext.window.matchMedia = () => ({ matches: false });
  App.__testContext.window.addEventListener = (type, handler) => {
    App.__windowListeners = App.__windowListeners || {};
    App.__windowListeners[type] = handler;
  };
  loadModule(App, 'events.js');
  return { App, elements };
}

test('server URL blur applies pending server settings', () => {
  const { App, elements } = loadAppWithEvents();
  elements['server-url'].listeners.blur();
  assertEqual(App.__appliedServer, true);
});

test('Escape while editing server URL aborts the draft before closing overlays', () => {
  const { App } = loadAppWithEvents();
  App.__testContext.document.listeners.keydown({
    key: 'Escape',
    target: { id: 'server-url', tagName: 'INPUT', blur() { App.__blurred = true; } },
  });
  assertEqual(App.__abortedServer, true);
  assertEqual(App.__blurred, true);
});

test('unknown delegated actions warn instead of failing silently', () => {
  const { App } = loadAppWithEvents();
  const oldWarn = console.warn;
  const warnings = [];
  console.warn = (message) => warnings.push(message);
  try {
    const actionTarget = {
      dataset: { action: 'typo-action' },
      closest(selector) { return selector === '[data-action]' ? this : null; },
    };
    App.__testContext.document.listeners.click({
      target: actionTarget,
      preventDefault() {},
    });
  } finally {
    console.warn = oldWarn;
  }
  assertEqual(warnings[0], '[aerolog] unknown action: typo-action');
});

test('plain search input clicks use the fast path and close open field filters', () => {
  const { App } = loadAppWithEvents();
  App.fieldFilters.current = () => ({ field: 'app', value: 'sshd', clause: 'app:"sshd"' });
  App.fieldFilters.close = () => { App.__closedFieldFilter = true; };
  App.queryHistory.close = () => { App.__closedQueryHistory = true; };
  App.__testContext.document.listeners.click({
    target: {
      id: 'search',
      closest() {
        throw new Error('search input click should not run delegated closest lookup');
      },
    },
    preventDefault() { App.__preventedSearchClick = true; },
  });
  assertEqual(App.__closedFieldFilter, true);
  assertEqual(App.__closedQueryHistory, undefined);
  assertEqual(App.__preventedSearchClick, undefined);
});
