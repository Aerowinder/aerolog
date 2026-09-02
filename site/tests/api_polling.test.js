const { fs, path, ROOT, loadApp, test, assertEqual, assertDeepEqual, installActionStubs } = require('./helpers');

test('manual refresh runs count query while poll refresh skips it', async () => {
  const App = loadApp({}, ['core.js', 'state.js', 'query_history.js', 'query.js', 'api.js']);
  const bodies = [];
  App.__testContext.fetch = async (_url, options) => {
    bodies.push(options.body);
    const query = decodeURIComponent(String(options.body).replace(/^query=/, ''));
    return {
      ok: true,
      status: 200,
      statusText: 'OK',
      text: async () => query.includes('stats count()') ? '{"c":42}\n' : '{"_msg":"hello"}\n',
    };
  };
  App.polling = {
    onRefreshDispatched() {},
    onRefreshCompleted() {},
  };
  App.render = {
    renderLogs() {},
    renderStats() {},
    renderPagination() {},
    renderResponseTime() {},
    renderRenderTime() {},
    renderConnectionPill() {},
    renderError() {},
  };

  await App.api.dispatchRefresh('manual');
  assertEqual(bodies.length, 2);
  assertEqual(App.state.runtime.totalCount, 42);
  assertEqual(typeof App.state.runtime.lastRenderMs, 'number');

  bodies.length = 0;
  await App.api.dispatchRefresh('poll');
  assertEqual(bodies.length, 1);
  assertEqual(bodies.some((body) => decodeURIComponent(body).includes('stats count()')), false);
  assertEqual(App.state.runtime.totalCount, 42);
});

test('malformed VictoriaLogs responses fail instead of silently dropping rows', async () => {
  const App = loadApp({}, ['core.js', 'state.js', 'query_history.js', 'query.js', 'api.js']);
  App.__testContext.fetch = async () => ({
    ok: true,
    text: async () => '{"_msg":"valid"}\nnot-json\n',
  });
  let message = '';
  try {
    await App.api.runQuery('test', new AbortController().signal);
  } catch (err) {
    message = err.message;
  }
  assertEqual(message, 'Malformed response from VictoriaLogs');
});

test('network errors use the same detail in the connection pill and table', async () => {
  const App = loadApp({}, ['core.js', 'state.js', 'query_history.js', 'query.js', 'api.js']);
  App.__testContext.fetch = async () => { throw new Error('Network resource unavailable'); };
  App.polling = { onRefreshDispatched() {}, onRefreshCompleted() {} };
  let tableError = '';
  App.render = {
    renderLogs() {}, renderStats() {}, renderPagination() {}, renderResponseTime() {}, renderRenderTime() {}, renderConnectionPill() {},
    renderError(message) { tableError = message; },
  };

  await App.api.dispatchRefresh('manual');
  assertEqual(App.state.runtime.connection.detail, 'Connection error: Network resource unavailable');
  assertEqual(tableError, App.state.runtime.connection.detail);
  assertEqual(App.derive.connectionView().title, 'localhost:9428 - Connection error: Network resource unavailable');
});

test('manual refresh timeout aborts stalled requests and reports connection error', async () => {
  const App = loadApp({}, ['core.js', 'state.js', 'query_history.js', 'query.js', 'api.js']);
  App.REQUEST_TIMEOUT_MS = 1;
  const renders = [];
  App.__testContext.fetch = (_url, options) => new Promise((_resolve, reject) => {
    options.signal.addEventListener('abort', () => {
      const err = new Error('aborted');
      err.name = 'AbortError';
      reject(err);
    });
  });
  App.polling = {
    onRefreshDispatched() {},
    onRefreshCompleted() {},
  };
  App.render = {
    renderLogs() {},
    renderStats() {},
    renderPagination() {},
    renderResponseTime() { renders.push('response'); },
    renderConnectionPill() { renders.push('pill'); },
    renderError() {},
  };

  const result = await App.api.dispatchRefresh('manual');
  assertEqual(result.aborted, true);
  assertEqual(App.state.runtime.connection.kind, 'err');
  assertEqual(App.state.runtime.connection.detail, 'Request did not return within 1ms');
  assertEqual(renders.includes('pill'), true);
});

test('a rejected query marks the search invalid without treating VictoriaLogs as disconnected or toasting on polls', async () => {
  const App = loadApp({ aerolog_logview: JSON.stringify({ pollint: '5' }) }, ['core.js', 'state.js', 'query_history.js', 'query.js', 'api.js']);
  App.state.runtime.committedSearch = '[';
  const toasts = [];
  const invalidQueries = [];
  App.__testContext.fetch = async () => ({
    ok: false,
    status: 400,
    statusText: 'Bad Request',
    text: async () => 'invalid query',
  });
  App.polling = {
    onRefreshDispatched() {},
    onRefreshCompleted() {},
  };
  App.toasts = {
    error(message) { toasts.push(message); },
  };
  App.render = {
    markSearchInvalid(query) { invalidQueries.push(query); },
    clearSearchInvalid() {},
    renderLogs() {},
    renderStats() {},
    renderPagination() {},
    renderResponseTime() {},
    renderConnectionPill() {},
    renderError() {},
  };

  const manualResult = await App.api.dispatchRefresh('manual');
  assertEqual(manualResult.queryRejected, true);
  assertEqual(App.state.runtime.connection.kind, 'ok');
  assertEqual(App.derive.connectionView().state, 'ok');
  assertDeepEqual(invalidQueries, ['[']);
  assertDeepEqual(toasts, ['Query rejected, check LogsQL syntax']);

  await App.api.dispatchRefresh('poll');
  assertDeepEqual(toasts, ['Query rejected, check LogsQL syntax']);
});

test('polling pauses while hidden and re-anchors when visible', () => {
  const App = loadApp({ aerolog_logview: JSON.stringify({ pollint: '5' }) }, ['core.js', 'state.js', 'query_history.js', 'query.js', 'polling.js']);
  const calls = [];
  const progress = {
    style: {},
    animate() {
      calls.push('animate');
      return { cancel() { calls.push('cancel'); } };
    },
  };
  App.dom.byId = (id) => (id === 'conn-progress' ? progress : null);
  App.render = {
    renderConnectionPill() { calls.push('pill'); },
  };
  App.api = {
    dispatchRefresh() {
      calls.push('dispatch');
      return Promise.resolve({});
    },
  };

  App.polling.scheduleFrom(Date.now());
  assertEqual(Boolean(App.state.runtime.polling.timerId), true);
  App.__testContext.document.hidden = true;
  App.__testContext.document.listeners.visibilitychange();
  assertEqual(App.state.runtime.polling.timerId, null);
  assertEqual(App.state.runtime.polling.nextPollAt, 0);

  App.__testContext.document.hidden = false;
  App.__testContext.document.listeners.visibilitychange();
  assertEqual(Boolean(App.state.runtime.polling.timerId), true);
  App.polling.clearScheduledPoll();
});

test('page overflow refresh clamps and refetches without completing stale data', async () => {
  const App = loadApp({}, ['core.js', 'state.js', 'query_history.js', 'query.js', 'api.js']);
  App.state.runtime.currentPage = 2;
  const completed = [];
  const renderedMessages = [];
  App.__testContext.fetch = async (_url, options) => {
    const query = decodeURIComponent(String(options.body).replace(/^query=/, ''));
    return {
      ok: true,
      status: 200,
      statusText: 'OK',
      text: async () => query.includes('stats count()') ? '{"c":1}\n' : '{"_msg":"hello"}\n',
    };
  };
  App.polling = {
    onRefreshDispatched() {},
    onRefreshCompleted(cause, result) {
      completed.push(`${cause}:${result.ok}`);
    },
  };
  App.render = {
    renderLogs(logs) { renderedMessages.push(logs.map((log) => log._msg).join(',')); },
    renderStats() {},
    renderPagination() {},
    renderResponseTime() {},
    renderConnectionPill() {},
    renderError() {},
  };

  await App.api.dispatchRefresh('manual');
  assertEqual(App.state.runtime.currentPage, 1);
  assertDeepEqual(completed, ['page:true']);
  assertDeepEqual(renderedMessages, ['hello']);
});
