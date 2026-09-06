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
    renderMetrics() {},
    renderLogs() {},
    renderPagination() {},
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
    renderMetrics() {},
    renderLogs() {}, renderPagination() {}, renderConnectionPill() {},
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
    renderPagination() {},
    renderMetrics() { renders.push('response'); },
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
    renderMetrics() {},
    markSearchInvalid(query) { invalidQueries.push(query); },
    clearSearchInvalid() {},
    renderLogs() {},
    renderPagination() {},
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
    renderMetrics() {},
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
    renderMetrics() {},
    renderLogs(logs) { renderedMessages.push(logs.map((log) => log._msg).join(',')); },
    renderPagination() {},
    renderConnectionPill() {},
    renderError() {},
  };

  await App.api.dispatchRefresh('manual');
  assertEqual(App.state.runtime.currentPage, 1);
  assertDeepEqual(completed, ['page:true']);
  assertDeepEqual(renderedMessages, ['hello']);
});


function apiFixture() {
  const App = loadApp({}, ['core.js', 'state.js', 'query.js', 'api.js']);
  const renders = [];
  App.render = {
    renderLogs(rows) { renders.push(rows); }, renderMetrics() { App.__metricUpdates = (App.__metricUpdates || 0) + 1; },
    renderPagination() {}, renderConnectionPill() {}, renderError() {},
  };
  App.polling = { onRefreshDispatched() {}, onRefreshCompleted() {} };
  App.toasts = { error(message) { App.__error = message; } };
  return { App, renders };
}

function deferredFetches(App) {
  const requests = [];
  App.__testContext.fetch = (_url, options) => new Promise((resolve, reject) => {
    options.signal.addEventListener('abort', () => reject(Object.assign(new Error('aborted'), { name: 'AbortError' })));
    requests.push({
      signal: options.signal,
      respond(text) { resolve({ ok: true, text: async () => text }); },
    });
  });
  return requests;
}

test('reset cannot publish an old response or cancel the new request deadline', async () => {
  const { App, renders } = apiFixture();
  const requests = deferredFetches(App);
  const old = App.api.dispatchRefresh();
  requests[0].respond('{"_msg":"old"}');
  await new Promise((resolve) => setImmediate(resolve));
  App.api.abortActiveRequest();
  App.state.resetToDefaults();
  const next = App.api.dispatchRefresh();
  const deadline = App.state.runtime.request.timeoutId;
  assertEqual((await old).stale, true);
  assertEqual(renders.length, 0);
  assertEqual(App.state.runtime.request.timeoutId, deadline);
  requests[2].respond('{"_msg":"new"}'); requests[3].respond('{"c":1}');
  await next;
  assertEqual(renders[0][0]._msg, 'new');
  assertEqual(App.__metricUpdates, 1);
});

test('manual refresh supersedes an active request and busy polls do not preempt it', async () => {
  const { App, renders } = apiFixture();
  const requests = deferredFetches(App);
  const old = App.api.dispatchRefresh();
  assertEqual((await App.api.dispatchRefresh('poll')).reason, 'busy');
  const next = App.api.dispatchRefresh();
  assertEqual(requests[0].signal.aborted, true);
  assertEqual((await old).stale, true);
  requests[2].respond('{"_msg":"new"}'); requests[3].respond('{"c":1}');
  await next;
  assertEqual(renders.length, 1);
});

test('invalid response rows and count shapes fail without inventing totals', async () => {
  const { App } = apiFixture();
  for (const body of ['null', '[]', '"text"', '42']) {
    App.__testContext.fetch = async () => ({ ok: true, text: async () => body });
    let rejected = false;
    try { await App.api.runQuery('*'); } catch { rejected = true; }
    assertEqual(rejected, true, body);
  }
  for (const c of [null, -1, 1.5, 'bad', [], {}, Number.MAX_SAFE_INTEGER + 1]) {
    App.__testContext.fetch = async (_url, options) => ({ ok: true, text: async () => decodeURIComponent(options.body).includes('stats count()') ? JSON.stringify({ c }) : '{"_msg":"valid"}' });
    const result = await App.api.dispatchRefresh();
    assertEqual(result.partial, true);
    assertEqual(App.state.runtime.totalCount, null);
    assertEqual(App.state.runtime.connection.kind, 'err');
  }
});

test('count timeout preserves available logs but reports an unknown count and partial failure', async () => {
  const { App, renders } = apiFixture();
  const requests = deferredFetches(App);
  let timeout;
  App.__testContext.setTimeout = (callback) => { timeout = callback; return 1; };
  App.__testContext.clearTimeout = () => {};
  const refresh = App.api.dispatchRefresh();
  requests[0].respond('{"_msg":"available"}');
  await new Promise((resolve) => setImmediate(resolve));
  timeout();
  const result = await refresh;
  assertEqual(result.ok, false); assertEqual(result.partial, true); assertEqual(result.timedOut, true);
  assertEqual(App.state.runtime.totalCount, null);
  assertEqual(App.state.runtime.connection.kind, 'err');
  assertEqual(App.__error, 'Log count request timed out');
  assertEqual(renders[0][0]._msg, 'available');
});

test('new query scope invalidates the old count even if logs fail', async () => {
  const { App } = apiFixture();
  App.__testContext.fetch = async (_url, options) => ({ ok: true, text: async () => decodeURIComponent(options.body).includes('stats count()') ? '{"c":30}' : '{"_msg":"ok"}' });
  await App.api.dispatchRefresh();
  assertEqual(App.state.runtime.totalCount, 30);
  App.state.runtime.committedSearch = 'different';
  App.__testContext.fetch = async () => { throw new Error('offline'); };
  await App.api.dispatchRefresh();
  assertEqual(App.state.runtime.totalCount, null);
});

test('background startup and hidden rescheduling cannot create polling timers', () => {
  const App = loadApp({ aerolog_logview: JSON.stringify({ pollint: '5' }) }, ['core.js', 'state.js', 'polling.js']);
  App.dom.byId = () => null;
  App.render = { renderConnectionPill() {} };
  App.__testContext.document.hidden = true;
  App.polling.scheduleFrom(Date.now());
  App.polling.onRefreshDispatched('init', Date.now());
  assertEqual(App.state.runtime.polling.timerId, null);
  assertEqual(App.state.runtime.polling.nextPollAt, 0);
  assertEqual(App.state.config.logview.pollint, '5');
});
