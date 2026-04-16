const { fs, path, ROOT, loadApp, test, assertEqual, assertDeepEqual, installActionStubs } = require('./helpers');

test('setPageSize action persists page size, resets page, and refreshes page data', async () => {
  const App = loadApp({}, ['core.js', 'state.js', 'query_history.js', 'query.js', 'actions.js']);
  const calls = installActionStubs(App);
  App.state.runtime.currentPage = 3;
  await App.actions.setPageSize('250');
  assertEqual(App.state.config.logview.rowcount, '250');
  assertEqual(App.state.runtime.currentPage, 1);
  assertDeepEqual(calls, ['renderToolbarState', 'dispatchRefresh:page']);
});

test('custom time actions apply and clear custom ranges', async () => {
  const App = loadApp({}, ['core.js', 'state.js', 'query_history.js', 'query.js', 'actions.js']);
  const calls = installActionStubs(App);
  await App.actions.applyCustomTimeRange({
    start: '2026-04-13T10:00:00.000Z',
    end: '2026-04-13T11:00:00.000Z',
  });
  assertEqual(App.state.config.logview.timerange, 'custom');
  assertEqual(App.state.config.logview.timecustom.start, '2026-04-13T10:00:00.000Z');
  await App.actions.clearCustomTimeRange();
  assertEqual(App.state.config.logview.timerange, '1h');
  assertEqual(App.state.config.logview.timecustom.start, '');
  assertDeepEqual(calls, [
    'renderToolbarState',
    'dispatchRefresh:settings',
    'renderToolbarState',
    'dispatchRefresh:settings',
  ]);
});

test('setTimeRange custom reuses an existing valid custom range', async () => {
  const App = loadApp({
    aerolog_logview: JSON.stringify({
      timerange: '1h',
      timecustom: {
        start: '2026-04-13T10:00:00.000Z',
        end: '2026-04-13T11:00:00.000Z',
      },
    }),
  }, ['core.js', 'state.js', 'query_history.js', 'query.js', 'actions.js']);
  const calls = installActionStubs(App);
  await App.actions.setTimeRange('custom');
  assertEqual(App.state.config.logview.timerange, 'custom');
  assertDeepEqual(calls, ['renderToolbarState', 'dispatchRefresh:settings']);
});

test('setTimeRange custom asks for a range when no valid custom range exists', async () => {
  const App = loadApp({}, ['core.js', 'state.js', 'query_history.js', 'query.js', 'actions.js']);
  const calls = installActionStubs(App);
  const result = await App.actions.setTimeRange('custom');
  assertEqual(App.state.config.logview.timerange, '1h');
  assertEqual(result.reason, 'missing_custom_time');
  assertDeepEqual(calls, ['renderToolbarState']);
});

test('invalid custom time action does not erase an existing valid custom range', async () => {
  const App = loadApp({
    aerolog_logview: JSON.stringify({
      timerange: 'custom',
      timecustom: {
        start: '2026-04-13T10:00:00.000Z',
        end: '2026-04-13T11:00:00.000Z',
      },
    }),
  }, ['core.js', 'state.js', 'query_history.js', 'query.js', 'actions.js']);
  const calls = installActionStubs(App);
  await App.actions.applyCustomTimeRange({ start: 'bad', end: 'also-bad' });
  assertEqual(App.state.config.logview.timerange, 'custom');
  assertEqual(App.state.config.logview.timecustom.start, '2026-04-13T10:00:00.000Z');
  assertDeepEqual(calls, ['showAlert:Choose a valid start and end time.']);
});

test('setPollInterval clears every side-effect pause and force-closes expanded rows when enabling polling', async () => {
  const App = loadApp({}, ['core.js', 'state.js', 'query_history.js', 'query.js', 'actions.js']);
  const calls = installActionStubs(App);
  App.state.runtime.currentPage = 4;
  App.state.runtime.polling.pausedForNavigation = true;
  App.state.runtime.polling.pausedForServerChange = true;
  App.state.runtime.polling.pausedForExpansion = true;
  App.state.runtime.expandedRows.add(0);
  App.state.runtime.expandedRows.add(2);
  App.render.collapseAllRows = function collapseAllRows() {
    calls.push('collapseAllRows');
    App.state.runtime.expandedRows.clear();
    return true;
  };
  await App.actions.setPollInterval('5');
  assertEqual(App.state.config.logview.pollint, '5');
  assertEqual(App.state.runtime.currentPage, 1);
  assertEqual(App.state.runtime.expandedRows.size, 0);
  assertDeepEqual(calls, ['clearNavigationPause', 'clearServerChangePause', 'clearExpansionPause', 'collapseAllRows', 'renderToolbarState', 'applyPolling:settings']);
});

test('setPollInterval Off still clears pauses but does not force-close expanded rows', async () => {
  const App = loadApp({}, ['core.js', 'state.js', 'query_history.js', 'query.js', 'actions.js']);
  const calls = installActionStubs(App);
  App.state.runtime.polling.pausedForExpansion = true;
  App.state.runtime.expandedRows.add(0);
  App.render.collapseAllRows = function collapseAllRows() {
    calls.push('collapseAllRows');
    App.state.runtime.expandedRows.clear();
    return true;
  };
  await App.actions.setPollInterval('off');
  assertEqual(App.state.config.logview.pollint, 'off');
  assertEqual(App.state.runtime.expandedRows.size, 1);
  assertDeepEqual(calls, ['clearNavigationPause', 'clearServerChangePause', 'clearExpansionPause', 'renderToolbarState', 'applyPolling:settings']);
});

test('saveServerSettings applies changed servers and pauses polling without persisting Off', async () => {
  const App = loadApp({
    aerolog_settings: JSON.stringify({ server: 'old.example:9428' }),
    aerolog_logview: JSON.stringify({ pollint: '5' }),
  }, ['core.js', 'state.js', 'query_history.js', 'query.js', 'actions.js']);
  const calls = installActionStubs(App);
  await App.actions.saveServerSettings('new.example:9428/');
  assertEqual(App.state.config.settings.server, 'new.example:9428');
  assertEqual(App.state.config.logview.pollint, '5');
  assertEqual(App.state.runtime.polling.pausedForServerChange, true);
  assertEqual(JSON.parse(App.__testContext.localStorage.getItem('aerolog_logview')).pollint, '5');
  assertDeepEqual(calls, ['pauseForServerChange', 'renderTabs', 'renderToolbarState', 'renderConnectionPill', 'dispatchRefresh:settings']);
});

test('saveServerSettings ignores unchanged server text', async () => {
  const App = loadApp({
    aerolog_settings: JSON.stringify({ server: 'same.example:9428' }),
  }, ['core.js', 'state.js', 'query_history.js', 'query.js', 'actions.js']);
  const calls = installActionStubs(App);
  const result = await App.actions.saveServerSettings('same.example:9428/');
  assertEqual(result.reason, 'unchanged');
  assertDeepEqual(calls, []);
});

test('toggleToolTab action persists tool visibility and rerenders tools', () => {
  const App = loadApp({}, ['core.js', 'state.js', 'query_history.js', 'query.js', 'actions.js']);
  const calls = installActionStubs(App);
  App.actions.toggleToolTab('aliases');
  assertEqual(App.state.config.settings.tabvis.aliases, false);
  const settings = JSON.parse(App.__testContext.localStorage.getItem('aerolog_settings'));
  assertDeepEqual(settings.tabvis, { tabs: true, aliases: false, heartbeats: true });
  assertDeepEqual(calls, ['renderToolToggles', 'renderTabs']);
});

test('applyFieldFilter appends include and exclude filters to the search box query', async () => {
  const App = loadApp({}, ['core.js', 'state.js', 'query_history.js', 'query.js', 'field_filters.js', 'actions.js']);
  const calls = installActionStubs(App);
  App.queryHistory.render = () => {};
  App.queryHistory.close = () => {};
  const menu = {
    hidden: true,
    style: {},
    innerHTML: '',
    classList: { add() {}, remove() {} },
    contains() { return false; },
    getBoundingClientRect() { return { width: 200, height: 80 }; },
  };
  const search = { value: 'error' };
  App.dom.byId = (id) => {
    if (id === 'field-filter-menu') return menu;
    if (id === 'search') return search;
    return null;
  };
  App.__testContext.window.innerWidth = 1200;
  App.__testContext.window.innerHeight = 800;
  App.state.runtime.currentLogs = [{ app_name: 'sshd', hostname: 'router-01' }];
  const appTarget = {
    dataset: { filterRow: '0', filterColumn: 'app_name' },
    getBoundingClientRect() { return { left: 20, top: 20, bottom: 40 }; },
  };

  App.fieldFilters.open(appTarget);
  assertEqual(menu.innerHTML.includes('APPEND TO QUERY'), true);
  assertEqual(menu.innerHTML.includes('app:&quot;sshd&quot;'), true);
  await App.actions.applyFieldFilter('include');
  assertEqual(App.state.runtime.committedSearch, 'error app:"sshd"');
  assertEqual(calls.includes('dispatchRefresh:manual'), true);

  search.value = App.state.runtime.committedSearch;
  App.fieldFilters.open(appTarget);
  await App.actions.applyFieldFilter('exclude');
  assertEqual(App.state.runtime.committedSearch, 'error app:"sshd" NOT (app:"sshd")');
});

test('setMessageLines persists line count and updates the document attribute', () => {
  const App = loadApp({}, ['core.js', 'state.js', 'query_history.js', 'query.js', 'actions.js']);
  const calls = installActionStubs(App);
  const value = App.actions.setMessageLines('5');
  assertEqual(value, '5');
  assertEqual(App.state.config.settings.logtable.msglines, '5');
  assertEqual(JSON.parse(App.__testContext.localStorage.getItem('aerolog_settings')).logtable.msglines, '5');
  assertEqual(App.__testContext.document.documentElement['data-message-lines'], '5');
  assertDeepEqual(calls, ['renderMessageLineSelect', 'renderLogs']);
});

test('setRowAction persists row control visibility and collapses rows when expand is disabled', () => {
  const App = loadApp({}, ['core.js', 'state.js', 'query_history.js', 'query.js', 'actions.js']);
  const calls = installActionStubs(App);
  App.state.runtime.expandedRows.add(0);
  App.render.collapseAllRows = function collapseAllRows() {
    calls.push('collapseAllRows');
    App.state.runtime.expandedRows.clear();
    return true;
  };
  App.actions.setRowAction('expand', false);
  assertDeepEqual(App.state.config.settings.logtable, { msglines: '3', expand: false, copy: true, filter: true });
  assertEqual(App.state.runtime.expandedRows.size, 0);
  const logtable = JSON.parse(App.__testContext.localStorage.getItem('aerolog_settings')).logtable;
  assertDeepEqual(logtable, { msglines: '3', expand: false, copy: true, filter: true });
  assertDeepEqual(calls, ['collapseAllRows', 'renderRowActionToggles', 'renderLogs']);
});

test('setRowAction expand=false does not auto-resume an expansion pause', () => {
  const App = loadApp({}, ['core.js', 'state.js', 'query_history.js', 'query.js', 'actions.js']);
  const calls = installActionStubs(App);
  App.state.runtime.expandedRows.add(0);
  App.state.runtime.polling.pausedForExpansion = true;
  App.render.collapseAllRows = function collapseAllRows() {
    calls.push('collapseAllRows');
    App.state.runtime.expandedRows.clear();
    return true;
  };
  App.actions.setRowAction('expand', false);
  assertEqual(App.state.runtime.polling.pausedForExpansion, true);
  assertEqual(calls.includes('clearExpansionPause'), false);
});

test('setRowAction can disable copy without touching expanded rows', () => {
  const App = loadApp({}, ['core.js', 'state.js', 'query_history.js', 'query.js', 'actions.js']);
  const calls = installActionStubs(App);
  App.state.runtime.expandedRows.add(0);
  App.actions.setRowAction('copy', false);
  assertDeepEqual(App.state.config.settings.logtable, { msglines: '3', expand: true, copy: false, filter: true });
  assertEqual(App.state.runtime.expandedRows.size, 1);
  assertDeepEqual(calls, ['renderRowActionToggles', 'renderLogs']);
});

test('setRowAction can disable click-to-filter and close an open filter menu', () => {
  const App = loadApp({}, ['core.js', 'state.js', 'query_history.js', 'query.js', 'field_filters.js', 'actions.js']);
  const calls = installActionStubs(App);
  App.fieldFilters.close = function closeFieldFilters() {
    calls.push('closeFieldFilters');
  };
  App.actions.setRowAction('filter', false);
  assertDeepEqual(App.state.config.settings.logtable, { msglines: '3', expand: true, copy: true, filter: false });
  const logtable = JSON.parse(App.__testContext.localStorage.getItem('aerolog_settings')).logtable;
  assertDeepEqual(logtable, { msglines: '3', expand: true, copy: true, filter: false });
  assertDeepEqual(calls, ['closeFieldFilters', 'renderRowActionToggles', 'renderLogs']);
});

test('goPage action pauses polling when leaving page one', async () => {
  const App = loadApp({}, ['core.js', 'state.js', 'query_history.js', 'query.js', 'actions.js']);
  const calls = installActionStubs(App);
  App.state.runtime.totalPages = 5;
  await App.actions.goPage(2);
  assertEqual(App.state.runtime.currentPage, 2);
  assertEqual(App.state.runtime.polling.pausedForNavigation, true);
  assertDeepEqual(calls, ['pauseForNavigation', 'renderToolbarState', 'dispatchRefresh:page']);
});

test('tab mutation actions rerender tabs and tab list', async () => {
  const App = loadApp({
    aerolog_tabs: JSON.stringify([{ id: 1, name: 'Old', hosts: ['host-1'] }]),
  }, ['core.js', 'state.js', 'query_history.js', 'query.js', 'actions.js']);
  const calls = installActionStubs(App);
  await App.actions.saveTab(1, { name: 'New', hosts: ['host-2'] });
  assertEqual(App.state.config.tabs[0].name, 'New');
  assertDeepEqual(calls, ['renderTabs', 'renderTabList']);
});

test('resetConfig action aborts requests, clears polling, and restores defaults', () => {
  const App = loadApp({
    aerolog_settings: JSON.stringify({ server: 'logs-box:9428' }),
    aerolog_logview: JSON.stringify({ rowcount: '250' }),
  }, ['core.js', 'state.js', 'query_history.js', 'query.js', 'actions.js']);
  const calls = installActionStubs(App);
  App.actions.resetConfig();
  assertEqual(App.state.config.settings.server, 'localhost:9428');
  assertEqual(App.state.config.logview.rowcount, '100');
  assertDeepEqual(calls, ['abortActiveRequest', 'clearScheduledPoll', 'resetProgressBar']);
});
