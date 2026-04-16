const { fs, path, ROOT, loadApp, test, assertEqual, assertDeepEqual, installActionStubs } = require('./helpers');

function loadAppWithShortcuts() {
  const App = loadApp({}, ['core.js', 'state.js', 'query_history.js', 'query.js', 'actions.js', 'shortcuts.js']);
  installActionStubs(App);
  const calls = [];
  const origGoPage = App.actions.goPage;
  App.actions.goPage = (page) => {
    calls.push(`goPage:${page}`);
    App.state.runtime.currentPage = Math.max(1, Math.min(App.state.runtime.totalPages, page));
    return Promise.resolve(page);
  };
  App.api.dispatchRefresh = (cause) => {
    calls.push(`dispatchRefresh:${cause}`);
    return Promise.resolve({});
  };
  const searchEl = { focused: false, selected: false, focus() { this.focused = true; }, select() { this.selected = true; } };
  App.dom.byId = (id) => {
    if (id === 'search') return searchEl;
    if (id === 'shortcuts-modal') return { classList: { contains: () => Boolean(App.__shortcutsOverlayOpen) } };
    return null;
  };
  App.modals = App.modals || {};
  App.modals.openModal = (id) => { if (id === 'shortcuts-modal') App.__shortcutsOverlayOpen = true; calls.push(`openModal:${id}`); };
  App.modals.closeModal = (id) => { if (id === 'shortcuts-modal') App.__shortcutsOverlayOpen = false; calls.push(`closeModal:${id}`); };
  let anyOpen = false;
  App.__testContext.document.querySelector = (sel) => (sel === '.modal-overlay.open' && anyOpen ? {} : null);
  return {
    App,
    calls,
    searchEl,
    setModalOpen(v) { anyOpen = v; },
  };
}

function fakeKey(overrides) {
  let defaultPrevented = false;
  return Object.assign({
    key: '',
    target: { tagName: 'BODY' },
    ctrlKey: false,
    metaKey: false,
    altKey: false,
    shiftKey: false,
    preventDefault() { defaultPrevented = true; },
    get defaultPrevented() { return defaultPrevented; },
  }, overrides);
}

test('shortcut / focuses and selects the search box', () => {
  const { App, searchEl } = loadAppWithShortcuts();
  App.shortcuts.handleKey(fakeKey({ key: '/' }));
  assertEqual(searchEl.focused, true);
  assertEqual(searchEl.selected, true);
});

test('shortcut r dispatches a manual refresh', () => {
  const { App, calls } = loadAppWithShortcuts();
  App.shortcuts.handleKey(fakeKey({ key: 'r' }));
  assertDeepEqual(calls, ['dispatchRefresh:manual']);
});

test('shortcut ] advances a page and [ goes back, clamped at bounds', () => {
  const { App, calls } = loadAppWithShortcuts();
  App.state.runtime.currentPage = 2;
  App.state.runtime.totalPages = 3;
  App.shortcuts.handleKey(fakeKey({ key: ']' }));
  App.shortcuts.handleKey(fakeKey({ key: ']' }));
  App.shortcuts.handleKey(fakeKey({ key: ']' }));
  App.shortcuts.handleKey(fakeKey({ key: '[' }));
  App.shortcuts.handleKey(fakeKey({ key: '[' }));
  App.shortcuts.handleKey(fakeKey({ key: '[' }));
  assertDeepEqual(calls, ['goPage:3', 'goPage:2', 'goPage:1']);
});

test('shortcut Home and End jump to first and last page', () => {
  const { App, calls } = loadAppWithShortcuts();
  App.state.runtime.currentPage = 4;
  App.state.runtime.totalPages = 9;
  App.shortcuts.handleKey(fakeKey({ key: 'Home' }));
  App.shortcuts.handleKey(fakeKey({ key: 'Home' }));
  App.shortcuts.handleKey(fakeKey({ key: 'End' }));
  App.shortcuts.handleKey(fakeKey({ key: 'End' }));
  assertDeepEqual(calls, ['goPage:1', 'goPage:9']);
});

test('shortcut ? toggles the shortcuts overlay when a modal is open', () => {
  const { App, calls, setModalOpen } = loadAppWithShortcuts();
  setModalOpen(true);
  App.shortcuts.handleKey(fakeKey({ key: '?' }));
  App.shortcuts.handleKey(fakeKey({ key: '?' }));
  assertDeepEqual(calls, ['openModal:shortcuts-modal', 'closeModal:shortcuts-modal']);
});

test('all shortcuts including ? stay inert while typing in inputs', () => {
  const { App, calls, searchEl } = loadAppWithShortcuts();
  const typing = { tagName: 'INPUT' };
  const qEvent = fakeKey({ key: '?', target: typing });
  App.shortcuts.handleKey(fakeKey({ key: '/', target: typing }));
  App.shortcuts.handleKey(fakeKey({ key: 'r', target: typing }));
  App.shortcuts.handleKey(fakeKey({ key: ']', target: typing }));
  App.shortcuts.handleKey(qEvent);
  assertEqual(searchEl.focused, false);
  assertEqual(qEvent.defaultPrevented, false);
  assertDeepEqual(calls, []);
});

test('shortcuts stay inert while any modal is open (except ?)', () => {
  const { App, calls, setModalOpen } = loadAppWithShortcuts();
  setModalOpen(true);
  App.state.runtime.totalPages = 5;
  App.shortcuts.handleKey(fakeKey({ key: 'r' }));
  App.shortcuts.handleKey(fakeKey({ key: ']' }));
  App.shortcuts.handleKey(fakeKey({ key: 'End' }));
  assertDeepEqual(calls, []);
});

test('shortcuts ignore modifier-key combos so browser bindings still work', () => {
  const { App, calls, searchEl } = loadAppWithShortcuts();
  App.shortcuts.handleKey(fakeKey({ key: 'r', ctrlKey: true }));
  App.shortcuts.handleKey(fakeKey({ key: '/', metaKey: true }));
  assertEqual(searchEl.focused, false);
  assertDeepEqual(calls, []);
});

