const { loadApp, test, assertEqual, assertDeepEqual, installActionStubs } = require('./helpers');

function classListStub() {
  const values = new Set();
  return {
    add(value) { values.add(value); },
    remove(value) { values.delete(value); },
    contains(value) { return values.has(value); },
  };
}

function loadAppWithModals() {
  const App = loadApp({}, ['core.js', 'state.js', 'query_history.js', 'query.js', 'actions.js', 'modals.js']);
  installActionStubs(App);
  const serverInput = { value: '', classList: classListStub() };
  const settingsModal = { classList: classListStub() };
  const elements = {
    'server-url': serverInput,
    'settings-modal': settingsModal,
  };
  App.dom.byId = (id) => elements[id] || { value: '', classList: classListStub() };
  App.render = {
    renderThemeButtons() {},
    renderToolToggles() {},
    renderMessageLineSelect() {},
    renderRowActionToggles() {},
  };
  App.__testContext.document.body = {
    classList: classListStub(),
    style: {},
  };
  App.__testContext.document.querySelector = () => null;
  App.__testContext.window.scrollY = 0;
  App.__testContext.window.scrollTo = () => {};
  return { App, serverInput, settingsModal };
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
