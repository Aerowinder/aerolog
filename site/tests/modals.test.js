const { loadApp, test, assertEqual, assertDeepEqual, installActionStubs } = require('./helpers');

function loadAppWithModals() {
  const App = loadApp({}, ['core.js', 'state.js', 'query_history.js', 'query.js', 'actions.js', 'modals.js']);
  installActionStubs(App);
  App.render.renderThemeButtons = () => {};
  const document = App.__testContext.document;
  function element(id) {
    return {
      id, value: '', inert: false, isConnected: true, tabIndex: 0,
      classList: require('./helpers').createClassList(),
      setAttribute(name, value) { this[name] = value; },
      focus() { document.activeElement = this; },
      closest() { return null; },
      getClientRects() { return [{}]; },
      querySelector() { return null; },
      querySelectorAll() { return []; },
      contains(target) { return this === target || this.querySelectorAll().includes(target); },
    };
  }
  const serverInput = element('server-url');
  const settingsModal = element('settings-modal');
  settingsModal.querySelectorAll = () => [serverInput];
  const helpModal = element('shortcuts-modal');
  const background = element('background');
  const elements = { 'server-url': serverInput, 'settings-modal': settingsModal, 'shortcuts-modal': helpModal };
  App.dom.byId = (id) => elements[id];
  document.body = { classList: require('./helpers').createClassList(), style: {}, children: [background, settingsModal, helpModal] };
  document.activeElement = background;
  App.__testContext.scrollY = 500;
  App.__testContext.scrollTo = (_x, y) => { App.__scrollRestored = y; };
  return { App, serverInput, settingsModal, helpModal, background, document };
}

test('settings modal restores the saved server value when server editing is aborted', () => {
  const { App, serverInput } = loadAppWithModals();
  App.state.config.settings.server = 'saved.example:9428';
  App.modals.openSettingsModal();
  assertEqual(serverInput.value, 'saved.example:9428');
  serverInput.value = 'draft.example:9428';
  App.modals.abortServerEdit();
  assertEqual(serverInput.value, 'saved.example:9428');
});

test('settings Done applies pending server edits before closing', async () => {
  const { App, serverInput, settingsModal } = loadAppWithModals();
  const calls = [];
  App.actions.saveServerSettings = async (value) => {
    calls.push(value);
    return { started: true };
  };
  App.modals.openSettingsModal();
  serverInput.value = 'done.example:9428';
  await App.modals.doneSettingsModal();
  assertDeepEqual(calls, ['done.example:9428']);
  assertEqual(settingsModal.classList.contains('open'), false);
});


test('closing an unopened modal does not move focus or scroll', () => {
  const { App, document, background } = loadAppWithModals();
  assertEqual(App.modals.closeModal('settings-modal'), false);
  assertEqual(App.__scrollRestored, undefined);
  assertEqual(document.activeElement, background);
});

test('modal focus is contained, stacked overlays preserve locking, and closing restores focus', () => {
  const { App, document, background, settingsModal, serverInput, helpModal } = loadAppWithModals();
  App.modals.openSettingsModal();
  assertEqual(document.activeElement, settingsModal);
  assertEqual(background.inert, true);
  assertEqual(settingsModal.role, 'dialog');
  let prevented = false;
  App.modals.containFocus({ key: 'Tab', preventDefault() { prevented = true; } });
  assertEqual(prevented, false);
  serverInput.focus();
  App.modals.containFocus({ key: 'Tab', preventDefault() { prevented = true; } });
  assertEqual(prevented, true);
  assertEqual(document.activeElement, serverInput);
  App.modals.openModal('shortcuts-modal');
  assertEqual(document.activeElement, helpModal);
  assertEqual(settingsModal.inert, true);
  App.modals.closeModal('shortcuts-modal');
  assertEqual(document.activeElement, serverInput);
  assertEqual(settingsModal.inert, false);
  assertEqual(App.__scrollRestored, undefined);
  App.modals.closeSettingsModal();
  assertEqual(background.inert, false);
  assertEqual(document.activeElement, background);
  assertEqual(App.__scrollRestored, 500);
});
