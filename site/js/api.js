(function () {
  const App = window.Aerolog;

  function isAbortError(err) {
    return !!err && (err.name === 'AbortError' || /aborted/i.test(err.message || ''));
  }

  function isQueryRejectedError(err) {
    return !!err && err.status === 400;
  }

  function malformedResponseError() {
    const err = new Error('Malformed response from VictoriaLogs');
    err.malformedResponse = true;
    return err;
  }

  function connectionErrorDetail(err) {
    if (err.status) return `Connection error: HTTP ${err.status}`;
    return `Connection error: ${err.message || 'Unable to reach VictoriaLogs'}`;
  }

  async function runQuery(query, signal) {
    const response = await fetch(`${App.derive.apiBase()}/select/logsql/query`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: 'query=' + encodeURIComponent(query),
      signal,
    });
    if (!response.ok) {
      const err = new Error(`HTTP ${response.status} ${response.statusText}`);
      err.status = response.status;
      throw err;
    }
    const text = await response.text();
    const rows = [];
    for (const line of text.trim().split('\n').filter(Boolean)) {
      try {
        rows.push(JSON.parse(line));
      } catch {
        throw malformedResponseError();
      }
    }
    return rows;
  }

  function clearRequestTimeout() {
    const { request } = App.state.runtime;
    if (request.timeoutId) {
      clearTimeout(request.timeoutId);
      request.timeoutId = null;
    }
  }

  function abortActiveRequest() {
    const { request } = App.state.runtime;
    clearRequestTimeout();
    if (request.controller) {
      request.controller.abort();
      request.controller = null;
    }
    request.cause = null;
  }

  function shouldSupersedeActiveRequest(nextCause) {
    if (!App.state.runtime.request.cause) return true;
    // Polls never preempt; user/settings refreshes always preempt.
    return nextCause !== 'poll';
  }

  function scheduleRequestTimeout(cause, requestId) {
    clearRequestTimeout();
    const timeoutMs = cause === 'poll' ? App.derive.pollIntervalMs() : App.REQUEST_TIMEOUT_MS;
    if (!timeoutMs) return;
    App.state.runtime.request.timeoutId = setTimeout(() => {
      if (requestId !== App.state.runtime.request.id) return;
      abortActiveRequest();
      App.state.runtime.connection.kind = 'err';
      App.state.runtime.connection.detail = `Request did not return within ${timeoutMs}ms`;
      App.state.runtime.connection.hasFetched = true;
      App.render.renderConnectionPill();
      App.state.runtime.lastResponseMs = null;
      App.state.runtime.lastRenderMs = null;
      App.render.renderResponseTime();
      if (App.render.renderRenderTime) App.render.renderRenderTime();
    }, timeoutMs);
  }

  async function dispatchRefresh(cause = 'manual') {
    if (App.render && App.render.collapseAllRows) {
      App.render.collapseAllRows();
    }
    const startAt = Date.now();
    const { request } = App.state.runtime;

    if (request.controller) {
      if (!shouldSupersedeActiveRequest(cause)) {
        return { started: false, reason: 'busy' };
      }
      abortActiveRequest();
    }

    request.id += 1;
    request.controller = new AbortController();
    request.cause = cause;
    const requestId = request.id;

    App.polling.onRefreshDispatched(cause, startAt);
    scheduleRequestTimeout(cause, requestId);

    const signal = request.controller.signal;
    const logsPromise = runQuery(App.query.buildPagedQuery(App.state.runtime.currentPage), signal);
    const countPromise = cause === 'poll' ? Promise.resolve(null) : runQuery(App.query.buildCountQuery(), signal);
    const [logsResult, countResult] = await Promise.allSettled([logsPromise, countPromise]);

    if (requestId !== App.state.runtime.request.id) {
      return { started: false, stale: true };
    }

    clearRequestTimeout();
    request.controller = null;
    request.cause = null;

    const elapsed = Date.now() - startAt;

    const logsError = logsResult.status === 'rejected' ? logsResult.reason : null;
    const countError = countResult.status === 'rejected' ? countResult.reason : null;

    if (logsError && isAbortError(logsError)) {
      return { started: false, aborted: true };
    }

    if (logsError && isQueryRejectedError(logsError)) {
      App.state.runtime.lastResponseMs = null;
      App.state.runtime.lastRenderMs = null;
      // A 400 proves the configured VictoriaLogs server responded; it is not a connection failure.
      App.state.runtime.connection.kind = 'ok';
      App.state.runtime.connection.detail = '';
      App.state.runtime.connection.hasFetched = true;
      if (App.render.markSearchInvalid) App.render.markSearchInvalid(App.state.runtime.committedSearch);
      if (cause !== 'poll' && App.toasts) App.toasts.error('Query rejected, check LogsQL syntax');
      App.render.renderConnectionPill();
      App.render.renderResponseTime();
      if (App.render.renderRenderTime) App.render.renderRenderTime();
      App.polling.onRefreshCompleted(cause, { ok: false, queryRejected: true, aborted: false });
      return { started: true, ok: false, queryRejected: true };
    }

    if (logsError) {
      App.state.runtime.lastResponseMs = null;
      App.state.runtime.lastRenderMs = null;
      App.state.runtime.connection.kind = 'err';
      App.state.runtime.connection.detail = connectionErrorDetail(logsError);
      App.state.runtime.connection.hasFetched = true;
      App.render.renderConnectionPill();
      App.render.renderResponseTime();
      if (App.render.renderRenderTime) App.render.renderRenderTime();
      if (!App.state.runtime.currentLogs.length) {
        App.render.renderError(connectionErrorDetail(logsError));
      }
      App.polling.onRefreshCompleted(cause, { ok: false, detail: App.state.runtime.connection.detail, aborted: false });
      return { started: true, ok: false };
    }

    const logs = logsResult.status === 'fulfilled' ? logsResult.value : [];
    if (!countError && countResult.value) {
      const totalRows = countResult.value;
      App.state.runtime.totalCount = (totalRows[0] && totalRows[0].c) || 0;
    }

    App.state.runtime.totalPages = Math.max(1, Math.ceil(App.state.runtime.totalCount / parseInt(App.state.config.logview.rowcount, 10)));
    if (App.state.runtime.currentPage > App.state.runtime.totalPages) {
      App.state.runtime.currentPage = App.state.runtime.totalPages;
      // The completed response is for an out-of-range page; refetch the clamped page instead of rendering stale data.
      return dispatchRefresh('page');
    }

    App.state.runtime.currentLogs = logs;
    App.state.runtime.lastResponseMs = elapsed;
    App.state.runtime.connection.kind = 'ok';
    App.state.runtime.connection.detail = '';
    App.state.runtime.connection.hasFetched = true;
    if (App.render.clearSearchInvalid) App.render.clearSearchInvalid(App.state.runtime.committedSearch);

    const renderStartedAt = Date.now();
    App.render.renderLogs(logs);
    App.render.renderStats();
    App.render.renderPagination();
    App.render.renderResponseTime();
    App.render.renderConnectionPill();
    App.state.runtime.lastRenderMs = Date.now() - renderStartedAt;
    if (App.render.renderRenderTime) App.render.renderRenderTime();

    if (countError) {
      console.error('[aerolog] count query failed:', countError);
    }

    App.polling.onRefreshCompleted(cause, { ok: true, elapsed, aborted: false });
    return { started: true, ok: true };
  }

  App.api = {
    runQuery,
    connectionErrorDetail,
    dispatchRefresh,
    abortActiveRequest,
  };
})();
