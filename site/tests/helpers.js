const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const ROOT = path.resolve(__dirname, '../..');

function createClassList() {
  const values = new Set();
  return {
    add(value) {
      values.add(value);
    },
    remove(value) {
      values.delete(value);
    },
    contains(value) {
      return values.has(value);
    },
  };
}

function createLocalStorage(initial = {}) {
  const store = new Map(Object.entries(initial));
  return {
    get length() {
      return store.size;
    },
    getItem(key) {
      return store.has(key) ? store.get(key) : null;
    },
    setItem(key, value) {
      store.set(key, String(value));
    },
    removeItem(key) {
      store.delete(key);
    },
    key(index) {
      return Array.from(store.keys())[index] || null;
    },
    clear() {
      store.clear();
    },
  };
}

function loadApp(initialStorage = {}, modules = ['core.js', 'state.js', 'query_history.js', 'query.js']) {
  const classList = createClassList();
  const context = {
    console,
    structuredClone,
    setTimeout,
    clearTimeout,
    AbortController,
    fetch() {
      throw new Error('fetch stub not installed');
    },
    window: {},
    localStorage: createLocalStorage(initialStorage),
    document: {
      hidden: false,
      listeners: {},
      addEventListener(type, handler) {
        this.listeners[type] = handler;
      },
      documentElement: {
        classList,
        setAttribute(name, value) {
          this[name] = value;
        },
      },
    },
    requestAnimationFrame(callback) {
      callback();
    },
  };
  context.window = context;
  vm.createContext(context);
  for (const file of modules) {
    const source = fs.readFileSync(path.join(ROOT, 'site/js', file), 'utf8');
    vm.runInContext(source, context, { filename: file });
  }
  context.window.Aerolog.__testContext = context;
  return context.window.Aerolog;
}

function loadModule(App, file) {
  const source = fs.readFileSync(path.join(ROOT, 'site/js', file), 'utf8');
  vm.runInContext(source, App.__testContext, { filename: file });
  return App;
}

const tests = [];

function test(name, fn) {
  tests.push({ name, fn });
}

function assertEqual(actual, expected, message) {
  if (actual !== expected) {
    throw new Error(`${message || 'values differ'}\nexpected: ${expected}\nactual:   ${actual}`);
  }
}

function assertDeepEqual(actual, expected, message) {
  const actualJson = JSON.stringify(actual);
  const expectedJson = JSON.stringify(expected);
  if (actualJson !== expectedJson) {
    throw new Error(`${message || 'objects differ'}\nexpected: ${expectedJson}\nactual:   ${actualJson}`);
  }
}

function installActionStubs(App) {
  const calls = [];
  App.render = {
    renderToolbarState() { calls.push('renderToolbarState'); },
    renderTabs() { calls.push('renderTabs'); },
    renderTabList() { calls.push('renderTabList'); },
    renderConnectionPill() { calls.push('renderConnectionPill'); },
    renderLogs() { calls.push('renderLogs'); },
    renderToolToggles() { calls.push('renderToolToggles'); },
    renderMessageLineSelect() { calls.push('renderMessageLineSelect'); },
    renderRowActionToggles() { calls.push('renderRowActionToggles'); },
  };
  App.api = {
    dispatchRefresh(cause) {
      calls.push(`dispatchRefresh:${cause}`);
      return Promise.resolve({ started: true, ok: true, cause });
    },
    abortActiveRequest() { calls.push('abortActiveRequest'); },
  };
  App.polling = {
    applyPolling(cause) {
      calls.push(`applyPolling:${cause}`);
      return Promise.resolve({ started: true, ok: true, cause });
    },
    clearNavigationPause() { calls.push('clearNavigationPause'); },
    clearServerChangePause() { calls.push('clearServerChangePause'); },
    clearExpansionPause() { calls.push('clearExpansionPause'); },
    pauseForServerChange() {
      calls.push('pauseForServerChange');
      App.state.runtime.polling.pausedForServerChange = true;
    },
    pauseForNavigation() {
      calls.push('pauseForNavigation');
      App.state.runtime.polling.pausedForNavigation = true;
    },
    clearScheduledPoll() { calls.push('clearScheduledPoll'); },
    resetProgressBar() { calls.push('resetProgressBar'); },
  };
  App.toasts = {
    show(message, options = {}) {
      const kind = options.kind || 'success';
      calls.push(`toast:${kind}:${message}`);
    },
    success(message) { calls.push(`toast:success:${message}`); },
    error(message) { calls.push(`toast:error:${message}`); },
  };
  return calls;
}


module.exports = { fs, path, ROOT, loadApp, loadModule, createClassList, test, assertEqual, assertDeepEqual, installActionStubs, tests };
