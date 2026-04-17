const { fs, path, ROOT, loadApp, createClassList, test, assertEqual, assertDeepEqual, installActionStubs } = require('./helpers');

test('default query validation pins and orders the default first', () => {
  const App = loadApp({
    aerolog_querydef: 'severity:<4',
    aerolog_queryhist: JSON.stringify([
      { query: 'app:sshd', pinned: true },
      { query: 'severity:<4', pinned: false },
      { query: 'error', pinned: false },
    ]),
  });
  assertEqual(App.state.config.querydef, 'severity:<4');
  assertEqual(App.state.runtime.committedSearch, 'severity:<4');
  assertDeepEqual(App.state.config.queryhist, [
    { query: 'severity:<4', pinned: true },
    { query: 'app:sshd', pinned: true },
    { query: 'error', pinned: false },
  ]);
});

test('missing default query is ignored instead of becoming a ghost startup query', () => {
  const App = loadApp({
    aerolog_querydef: 'severity:<4',
    aerolog_queryhist: JSON.stringify([{ query: 'app:sshd', pinned: true }]),
  });
  assertEqual(App.state.config.querydef, '');
  assertEqual(App.state.runtime.committedSearch, '');
});

test('query history keeps pinned entries and caps unpinned entries', () => {
  const App = loadApp({
    aerolog_queryhist: JSON.stringify([
      { query: 'pinned', pinned: true },
      { query: 'one', pinned: false },
      { query: 'two', pinned: false },
      { query: 'three', pinned: false },
      { query: 'four', pinned: false },
      { query: 'five', pinned: false },
      { query: 'six', pinned: false },
      { query: 'seven', pinned: false },
      { query: 'eight', pinned: false },
      { query: 'nine', pinned: false },
      { query: 'ten', pinned: false },
      { query: 'eleven', pinned: false },
    ]),
  });
  assertEqual(App.state.config.queryhist.length, 11);
  assertEqual(App.state.config.queryhist[0].query, 'pinned');
  assertEqual(App.state.config.queryhist[10].query, 'ten');
});

test('query history caps pinned and unpinned entries at ten each', () => {
  const pinned = Array.from({ length: 11 }, (_, index) => ({ query: `pinned-${index + 1}`, pinned: true }));
  const unpinned = Array.from({ length: 11 }, (_, index) => ({ query: `recent-${index + 1}`, pinned: false }));
  const App = loadApp({
    aerolog_queryhist: JSON.stringify(pinned.concat(unpinned)),
  });
  assertEqual(App.state.config.queryhist.length, 20);
  assertEqual(App.state.config.queryhist.filter((entry) => entry.pinned).length, 10);
  assertEqual(App.state.config.queryhist.filter((entry) => !entry.pinned).length, 10);
  assertEqual(App.state.config.queryhist.some((entry) => entry.query === 'pinned-11'), false);
  assertEqual(App.state.config.queryhist.some((entry) => entry.query === 'recent-11'), false);
});

test('default query counts toward the pinned query history cap', () => {
  const pinned = Array.from({ length: 10 }, (_, index) => ({ query: `pinned-${index + 1}`, pinned: true }));
  const App = loadApp({
    aerolog_querydef: 'default-query',
    aerolog_queryhist: JSON.stringify([{ query: 'default-query', pinned: false }].concat(pinned)),
  });
  assertEqual(App.state.config.queryhist.length, 10);
  assertEqual(App.state.config.queryhist[0].query, 'default-query');
  assertEqual(App.state.config.queryhist.filter((entry) => entry.pinned).length, 10);
  assertEqual(App.state.config.queryhist.some((entry) => entry.query === 'pinned-10'), false);
});

test('recording recent queries preserves pinned entries and moves recent unpinned first', () => {
  const App = loadApp({
    aerolog_queryhist: JSON.stringify([
      { query: 'pinned', pinned: true },
      { query: 'old', pinned: false },
    ]),
  });
  App.queryHistory.recordRecent('new');
  App.queryHistory.recordRecent('old');
  assertDeepEqual(App.state.config.queryhist, [
    { query: 'pinned', pinned: true },
    { query: 'old', pinned: false },
    { query: 'new', pinned: false },
  ]);
});

test('setting and clearing query defaults updates pinned ordering', () => {
  const App = loadApp({
    aerolog_queryhist: JSON.stringify([
      { query: 'pinned', pinned: true },
      { query: 'candidate', pinned: false },
    ]),
  });
  App.queryHistory.setDefault(1);
  assertEqual(App.state.config.querydef, 'candidate');
  assertDeepEqual(App.state.config.queryhist, [
    { query: 'candidate', pinned: true },
    { query: 'pinned', pinned: true },
  ]);
  App.queryHistory.togglePin(0);
  assertEqual(App.state.config.querydef, '');
  assertDeepEqual(App.state.config.queryhist, [
    { query: 'pinned', pinned: true },
    { query: 'candidate', pinned: false },
  ]);
});

test('opening query history lazily renders the dropdown contents', () => {
  const App = loadApp({
    aerolog_queryhist: JSON.stringify([{ query: 'app:sshd', pinned: true }]),
  });
  const boxClassList = createClassList();
  boxClassList.toggle = (value, force) => {
    const enabled = force === undefined ? !boxClassList.contains(value) : Boolean(force);
    if (enabled) boxClassList.add(value);
    else boxClassList.remove(value);
  };
  const menu = { innerHTML: '' };
  const toggle = { setAttribute(name, value) { this[name] = value; } };
  App.dom.byId = (id) => {
    if (id === 'search-box') return { classList: boxClassList };
    if (id === 'query-history-menu') return menu;
    return null;
  };
  App.dom.q = () => toggle;
  App.queryHistory.toggle();
  assertEqual(boxClassList.contains('history-open'), true);
  assertEqual(toggle['aria-expanded'], 'true');
  assertEqual(menu.innerHTML.includes('app:sshd'), true);
});

test('duplicate friendly aliases are detected case-insensitively', () => {
  const App = loadApp();
  const aliases = App.validators.aliasesText('10.0.0.5 = router\n10.0.0.6 = Router');
  assertEqual(App.validators.duplicateFriendlyAlias(aliases), 'Router');
});

test('duplicate alias toast is rendered as an error', async () => {
  const App = loadApp({}, ['core.js', 'state.js', 'query_history.js', 'query.js', 'aliases.js']);
  const calls = [];
  App.dom.byId = (id) => id === 'aliases-text' ? { value: '10.0.0.5 = router\n10.0.0.6 = Router' } : null;
  App.toasts = {
    error(message) { calls.push({ kind: 'error', message }); },
    success(message) { calls.push({ kind: 'success', message }); },
  };
  App.modals = { closeModal() {} };
  App.actions = { saveAliases() { throw new Error('save should not run'); } };
  await App.aliases.saveAliases();
  assertDeepEqual(calls, [{ kind: 'error', message: 'Alias "Router" is used more than once' }]);
});

test('server URL normalization keeps display separate from request URL', () => {
  const App = loadApp();
  assertEqual(App.utils.displayServerUrl('logs-box:9428/'), 'logs-box:9428');
  assertEqual(App.utils.normalizeServerUrl('logs-box:9428/'), 'https://logs-box:9428');
  assertEqual(App.utils.normalizeServerUrl('http://logs-box:9428/'), 'http://logs-box:9428');
  assertEqual(App.utils.escapeHtml("it's <ok>"), 'it&#39;s &lt;ok&gt;');
});

test('custom time range compiles to an absolute LogsQL time range', () => {
  const App = loadApp({
    aerolog_logview: JSON.stringify({
      timerange: 'custom',
      timecustom: {
        start: '2026-04-13T10:00:00.000Z',
        end: '2026-04-13T11:30:00.000Z',
      },
    }),
  });
  assertEqual(App.query.buildTimeFilterClause(), '_time:[2026-04-13T10:00:00Z, 2026-04-13T11:30:00Z)');
  assertEqual(App.query.buildHeartbeatsQuery(), '_time:[2026-04-13T10:00:00Z, 2026-04-13T11:30:00Z) hostname:* | stats by (hostname) count() as messages, max(_time) as last_seen | sort by (last_seen) desc');
});

test('invalid custom time range falls back to the default time filter', () => {
  const App = loadApp({
    aerolog_logview: JSON.stringify({
      timerange: 'custom',
      timecustom: {
        start: '2026-04-13T11:30:00.000Z',
        end: '2026-04-13T10:00:00.000Z',
      },
    }),
  });
  assertEqual(App.state.config.logview.timerange, '1h');
  assertEqual(App.query.buildTimeFilterClause(), '_time:1h');
});

test('pagination omits numbered page buttons when the non-mobile container is narrow', () => {
  const App = loadApp({}, ['core.js', 'state.js', 'query_history.js', 'render.js', 'render_table.js', 'render_pager.js', 'render_tabs.js', 'query.js']);
  const elements = {
    'pager-buttons': { innerHTML: '', clientWidth: 1200, parentElement: { clientWidth: 300 } },
    'pager-meta': { textContent: '' },
  };
  App.__testContext.document.getElementById = (id) => elements[id];
  App.state.runtime.currentPage = 5;
  App.state.runtime.totalPages = 10;
  App.state.runtime.totalCount = 12345;
  App.state.runtime.lastResponseMs = 82;

  App.render.renderPagination();

  const buttons = elements['pager-buttons'].innerHTML.match(/<button/g) || [];
  assertEqual(buttons.length, 4);
  assertEqual(elements['pager-buttons'].innerHTML.includes('First page'), true);
  assertEqual(elements['pager-buttons'].innerHTML.includes('Previous page'), true);
  assertEqual(elements['pager-buttons'].innerHTML.includes('Next page'), true);
  assertEqual(elements['pager-buttons'].innerHTML.includes('Last page'), true);
  assertEqual(elements['pager-buttons'].innerHTML.includes('class="pager-btn active"'), false);
  assertEqual(elements['pager-meta'].textContent, 'Page 5 of 10 - 12,345 available logs - 82ms response time');
});

test('pagination uses nav-only controls and shorthand metadata in mobile mode', () => {
  const App = loadApp({}, ['core.js', 'state.js', 'query_history.js', 'render.js', 'render_table.js', 'render_pager.js', 'render_tabs.js', 'query.js']);
  const elements = {
    'pager-buttons': { innerHTML: '', clientWidth: 1200, parentElement: { clientWidth: 1200 } },
    'pager-meta': { textContent: '' },
  };
  const mediaQueries = [];
  App.__testContext.document.getElementById = (id) => elements[id];
  App.__testContext.matchMedia = (query) => {
    mediaQueries.push(query);
    return { matches: true };
  };
  App.state.runtime.currentPage = 5;
  App.state.runtime.totalPages = 10;
  App.state.runtime.totalCount = 12345;
  App.state.runtime.lastResponseMs = 82;

  App.render.renderPagination();

  const buttons = elements['pager-buttons'].innerHTML.match(/<button/g) || [];
  assertDeepEqual(mediaQueries, ['(max-width: 1000px)', '(max-width: 1000px)']);
  assertEqual(buttons.length, 4);
  assertEqual(elements['pager-meta'].textContent, 'Page 5/10 - 12,345 logs - 82ms');
});

test('pagination grows to an odd intermediate range as space allows', () => {
  const App = loadApp({}, ['core.js', 'state.js', 'query_history.js', 'render.js', 'render_table.js', 'render_pager.js', 'render_tabs.js', 'query.js']);
  const elements = {
    'pager-buttons': { innerHTML: '', clientWidth: 200, parentElement: { clientWidth: 620 } },
    'pager-meta': { textContent: '' },
  };
  App.__testContext.document.getElementById = (id) => elements[id];
  App.state.runtime.currentPage = 20;
  App.state.runtime.totalPages = 50;
  App.state.runtime.totalCount = 12345;
  App.state.runtime.lastResponseMs = 82;

  App.render.renderPagination();

  const buttons = elements['pager-buttons'].innerHTML.match(/<button/g) || [];
  assertEqual(buttons.length, 9);
  assertEqual(elements['pager-buttons'].innerHTML.includes('data-page="18"'), true);
  assertEqual(elements['pager-buttons'].innerHTML.includes('data-page="22"'), true);
  assertEqual(elements['pager-buttons'].innerHTML.includes('Page 20 of 50'), true);
  assertEqual(elements['pager-meta'].textContent, 'Page 20 of 50 - 12,345 available logs - 82ms response time');
});

test('pagination caps the wide numbered range at fifteen pages', () => {
  const App = loadApp({}, ['core.js', 'state.js', 'query_history.js', 'render.js', 'render_table.js', 'render_pager.js', 'render_tabs.js', 'query.js']);
  const elements = {
    'pager-buttons': { innerHTML: '', clientWidth: 200, parentElement: { clientWidth: 1600 } },
    'pager-meta': { textContent: '' },
  };
  App.__testContext.document.getElementById = (id) => elements[id];
  App.state.runtime.currentPage = 20;
  App.state.runtime.totalPages = 50;

  App.render.renderPagination();

  const buttons = elements['pager-buttons'].innerHTML.match(/<button/g) || [];
  assertEqual(buttons.length, 19);
  assertEqual(elements['pager-buttons'].innerHTML.includes('data-page="13"'), true);
  assertEqual(elements['pager-buttons'].innerHTML.includes('data-page="27"'), true);
  assertEqual(elements['pager-buttons'].innerHTML.includes('Page 20 of 50'), true);
  assertEqual(elements['pager-meta'].textContent, 'Page 20 of 50 - 0 available logs - -- response time');
});

test('config export maps internal columns to compact export keys', () => {
  const App = loadApp({}, ['core.js', 'state.js', 'query_history.js', 'query.js', 'settings_migration.js', 'config_io.js']);
  App.persist.logview.colwidths({ widths: { _time: 240, hostname: 180, priority: 100, facility: 120, app_name: 140 } });
  const exported = App.configIo.buildExportConfig(new Date('2026-04-13T12:34:56Z'));
  assertEqual(exported.settings_version, 100);
  assertEqual(exported.aerolog_version, '1.01');
  assertEqual(exported.export_time, '2026-04-13T12:34:56.000Z');
  assertDeepEqual(exported.logview, {
    rowcount: '100',
    pollint: 'off',
    timerange: '1h',
    colwidths: { time: 240, hostname: 180, severity: 100, facility: 120, app: 140 },
  });
});

test('config export filename includes settings version and local timestamp', () => {
  const App = loadApp({}, ['core.js', 'state.js', 'query_history.js', 'query.js', 'settings_migration.js', 'config_io.js']);
  const filename = App.configIo.exportFilename(new Date('2026-04-15T22:25:33'));
  assertEqual(filename, 'aerolog-export-100-20260415222533.json');
});

test('nested persist writes mutate config and serialize the owning group to localStorage', () => {
  const App = loadApp();
  const storage = App.__testContext.localStorage;

  App.persist.settings.server('logs.example:9428/');
  App.persist.logview.rowcount('250');
  App.persist.logview.timecustom({
    start: '2026-04-13T10:00:00.000Z',
    end: '2026-04-13T11:00:00.000Z',
  });
  App.persist.settings.logtable.msglines('5');
  App.persist.aliases({ rawhost: 'friendly' });
  App.persist.logview.colwidths({ widths: { _time: 240, hostname: 180 } });
  App.persist.settings.tabvis.tabs(false);

  assertEqual(App.state.config.settings.server, 'logs.example:9428');
  assertEqual(App.state.config.logview.rowcount, '250');
  assertEqual(App.state.config.settings.logtable.msglines, '5');
  assertEqual(App.state.config.settings.tabvis.tabs, false);

  const settings = JSON.parse(storage.getItem('aerolog_settings'));
  assertEqual(settings.server, 'logs.example:9428');
  assertEqual(settings.logtable.msglines, '5');
  assertEqual(settings.tabvis.tabs, false);
  const logview = JSON.parse(storage.getItem('aerolog_logview'));
  assertEqual(logview.rowcount, '250');
  assertEqual(logview.timecustom.start, '2026-04-13T10:00:00.000Z');
  assertEqual(logview.colwidths.widths._time, 240);
  assertDeepEqual(JSON.parse(storage.getItem('aerolog_aliases')), { rawhost: 'friendly' });

  App.persist.querydef('');
  App.persist.logview.timecustom(null);
  assertEqual(storage.getItem('aerolog_querydef'), null);
  assertEqual(JSON.parse(storage.getItem('aerolog_logview')).timecustom.start, '');
});

test('queryhist persist clears defaults missing from the new history', () => {
  const App = loadApp({
    aerolog_querydef: 'old',
    aerolog_queryhist: JSON.stringify([{ query: 'old', pinned: true }]),
  });
  App.persist.queryhist([{ query: 'new', pinned: false }], { defaultQuery: 'new' });
  assertEqual(App.state.config.querydef, '');
  assertEqual(App.__testContext.localStorage.getItem('aerolog_querydef'), null);
});

test('persist factory catches localStorage write failures and reports them', () => {
  const App = loadApp();
  const calls = [];
  App.toasts = {
    error(message) { calls.push({ kind: 'error', message }); },
    success(message) { calls.push({ kind: 'success', message }); },
  };
  App.__testContext.localStorage.setItem = () => {
    throw new Error('quota exceeded');
  };
  const originalConsoleError = console.error;
  console.error = () => {};
  let value;
  try {
    value = App.persist.logview.rowcount('250');
  } finally {
    console.error = originalConsoleError;
  }
  assertEqual(value, '250');
  assertEqual(App.state.config.logview.rowcount, '250');
  assertDeepEqual(calls, [{ kind: 'error', message: 'Settings could not be saved' }]);
});

test('config export includes custom time ranges', () => {
  const App = loadApp({
    aerolog_logview: JSON.stringify({
      timerange: 'custom',
      timecustom: {
        start: '2026-04-13T10:00:00.000Z',
        end: '2026-04-13T11:00:00.000Z',
      },
    }),
  }, ['core.js', 'state.js', 'query_history.js', 'query.js', 'settings_migration.js', 'config_io.js']);
  const exported = App.configIo.buildExportConfig(new Date('2026-04-13T12:34:56Z'));
  assertEqual(exported.logview.timerange, 'custom');
  assertDeepEqual(exported.logview.timecustom, {
    start: '2026-04-13T10:00:00.000Z',
    end: '2026-04-13T11:00:00.000Z',
  });
});

test('config export and import group settings and logview preferences', () => {
  const App = loadApp({
    aerolog_settings: JSON.stringify({
      server: 'logs.example:9428',
      theme: 'dark',
      tabvis: { tabs: false, aliases: true, heartbeats: true },
      logtable: { msglines: '4', expand: false, copy: true, filter: false },
    }),
    aerolog_logview: JSON.stringify({
      rowcount: '1000',
      pollint: '5',
      timerange: '1y',
      colwidths: { widths: { _time: 210, hostname: 149, priority: 123, facility: 114, app_name: 237 } },
    }),
  }, ['core.js', 'state.js', 'query_history.js', 'query.js', 'settings_migration.js', 'config_io.js']);
  const exported = App.configIo.buildExportConfig(new Date('2026-04-13T12:34:56Z'));
  assertDeepEqual(exported.settings, {
    server: 'logs.example:9428',
    theme: 'dark',
    tabvis: { tabs: false, aliases: true, heartbeats: true },
    logtable: {
      msglines: '4',
      expand: false,
      copy: true,
      filter: false,
    },
  });
  assertDeepEqual(exported.logview, {
    rowcount: '1000',
    pollint: '5',
    timerange: '1y',
    colwidths: { time: 210, hostname: 149, severity: 123, facility: 114, app: 237 },
  });
  // Top-level export keys must never duplicate the grouped fields.
  for (const key of ['server', 'theme', 'tabvis', 'msglines', 'rowcount', 'pollint', 'timerange', 'logtable', 'rowactions']) {
    assertEqual(Object.prototype.hasOwnProperty.call(exported, key), false);
  }

  App.configIo.applyImportedConfig({
    settings: {
      server: 'imported.example:9428/',
      theme: 'system',
      tabvis: { tabs: true, aliases: false, heartbeats: true },
      logtable: {
        msglines: '2',
        expand: true,
        copy: false,
        filter: false,
      },
    },
    logview: {
      rowcount: '250',
      pollint: '10',
      timerange: '3h',
      colwidths: { time: 260, app: 150, ignored: 999 },
    },
  });
  assertEqual(App.state.config.settings.server, 'imported.example:9428');
  assertEqual(App.state.config.settings.theme, 'system');
  assertDeepEqual(App.state.config.settings.tabvis, { tabs: true, aliases: false, heartbeats: true });
  assertEqual(App.state.config.settings.logtable.msglines, '2');
  assertDeepEqual(App.state.config.settings.logtable, { msglines: '2', expand: true, copy: false, filter: false });
  assertEqual(App.state.config.logview.rowcount, '250');
  assertEqual(App.state.config.logview.pollint, '10');
  assertEqual(App.state.config.logview.timerange, '3h');
  assertEqual(App.state.config.logview.colwidths.widths._time, 260);
  assertEqual(App.state.config.logview.colwidths.widths.app_name, 150);
  const writtenSettings = JSON.parse(App.__testContext.localStorage.getItem('aerolog_settings'));
  assertEqual(writtenSettings.server, 'imported.example:9428');
  assertEqual(writtenSettings.theme, 'system');
  assertDeepEqual(writtenSettings.tabvis, { tabs: true, aliases: false, heartbeats: true });
  assertEqual(writtenSettings.logtable.msglines, '2');
  assertDeepEqual(writtenSettings.logtable, { msglines: '2', expand: true, copy: false, filter: false });
});

test('config export omits empty custom time range and empty default query', () => {
  const App = loadApp({}, ['core.js', 'state.js', 'query_history.js', 'query.js', 'settings_migration.js', 'config_io.js']);
  const exported = App.configIo.buildExportConfig(new Date('2026-04-13T12:34:56Z'));
  assertEqual(Object.prototype.hasOwnProperty.call(exported.logview, 'timecustom'), false);
  assertEqual(Object.prototype.hasOwnProperty.call(exported, 'querydef'), false);
});

test('config import applies compact column keys and query defaults', () => {
  const App = loadApp({}, ['core.js', 'state.js', 'query_history.js', 'query.js', 'settings_migration.js', 'config_io.js']);
  App.configIo.applyImportedConfig({
    settings: { theme: 'dark' },
    logview: {
      rowcount: '250',
      colwidths: { time: 260, app: 150, ignored: 999 },
    },
    queryhist: [{ query: 'severity:<4', pinned: false }],
    querydef: 'severity:<4',
  });
  assertEqual(App.state.config.settings.theme, 'dark');
  assertEqual(App.state.config.logview.rowcount, '250');
  assertEqual(App.state.config.querydef, 'severity:<4');
  assertDeepEqual(App.state.config.queryhist, [{ query: 'severity:<4', pinned: true }]);
  assertEqual(App.state.config.logview.colwidths.widths._time, 260);
  assertEqual(App.state.config.logview.colwidths.widths.app_name, 150);
});

test('config import preserves valid custom time ranges and disables invalid custom ranges', () => {
  const App = loadApp({}, ['core.js', 'state.js', 'query_history.js', 'query.js', 'settings_migration.js', 'config_io.js']);
  App.configIo.applyImportedConfig({
    logview: {
      timerange: 'custom',
      timecustom: {
        start: '2026-04-13T10:00:00.000Z',
        end: '2026-04-13T11:00:00.000Z',
      },
    },
  });
  assertEqual(App.state.config.logview.timerange, 'custom');
  assertEqual(App.state.config.logview.timecustom.start, '2026-04-13T10:00:00.000Z');

  App.configIo.applyImportedConfig({
    logview: {
      timerange: 'custom',
      timecustom: {
        start: 'bad',
        end: 'also-bad',
      },
    },
  });
  assertEqual(App.state.config.logview.timerange, '1h');
});

test('config import drops defaults that are missing from history', () => {
  const App = loadApp({
    aerolog_querydef: 'old',
    aerolog_queryhist: JSON.stringify([{ query: 'old', pinned: true }]),
  }, ['core.js', 'state.js', 'query_history.js', 'query.js', 'settings_migration.js', 'config_io.js']);
  App.configIo.applyImportedConfig({
    querydef: 'missing',
    queryhist: [{ query: 'present', pinned: false }],
  });
  assertEqual(App.state.config.querydef, '');
  assertDeepEqual(App.state.config.queryhist, [{ query: 'present', pinned: false }]);
});

test('config import rejects pre-100 settings versions', () => {
  const App = loadApp({}, ['core.js', 'state.js', 'query_history.js', 'query.js', 'settings_migration.js', 'config_io.js']);
  let message = '';
  try {
    App.configIo.applyImportedConfig({ settings_version: 1 });
  } catch (err) {
    message = err.message;
  }
  assertEqual(message, 'Unsupported settings version: 1');

  message = '';
  try {
    App.configIo.applyImportedConfig({ settings_version: 'garbage' });
  } catch (err) {
    message = err.message;
  }
  assertEqual(message, 'Unsupported settings version: garbage');
});

test('config import accepts future settings versions for forward migration', () => {
  const App = loadApp({}, ['core.js', 'state.js', 'query_history.js', 'query.js', 'settings_migration.js', 'config_io.js']);
  // Version 999 is >= 100, so it should import without error
  const result = App.configIo.applyImportedConfig({ settings_version: 999, settings: { theme: 'dark' } });
  assertEqual(result.settings.theme, 'dark');
});

test('settingsMigration.migrate walks ordered steps and applies only matching ranges', () => {
  const App = loadApp({}, ['core.js', 'settings_migration.js']);
  const log = [];
  App.settingsMigration.STEPS.push(
    { fromVersion: 100, toVersion: 200, migrate(config) { log.push('100->200'); config.settings.theme = 'dark'; } },
    { fromVersion: 200, toVersion: 300, migrate(config) { log.push('200->300'); config.settings.tabvis = { tabs: false }; } },
  );
  try {
    const config = { settings: { theme: 'light' } };
    const finalVersion = App.settingsMigration.migrate(config, 100);
    assertEqual(finalVersion, 300);
    assertDeepEqual(log, ['100->200', '200->300']);
    assertEqual(config.settings.theme, 'dark');
    assertEqual(config.settings.tabvis.tabs, false);

    log.length = 0;
    const midConfig = { settings: { theme: 'light' } };
    const midVersion = App.settingsMigration.migrate(midConfig, 200);
    assertEqual(midVersion, 300);
    assertDeepEqual(log, ['200->300']);
    assertEqual(midConfig.settings.theme, 'light');

    log.length = 0;
    const futureConfig = { settings: {} };
    const futureVersion = App.settingsMigration.migrate(futureConfig, 400);
    assertEqual(futureVersion, 400);
    assertDeepEqual(log, []);
  } finally {
    App.settingsMigration.STEPS.length = 0;
  }
});

test('settingsMigration.migrate runs from config_io on a legacy version via a registered step', () => {
  const App = loadApp({}, ['core.js', 'state.js', 'query_history.js', 'query.js', 'settings_migration.js', 'config_io.js']);
  App.settingsMigration.STEPS.push({
    fromVersion: 100,
    toVersion: 200,
    migrate(config) {
      // Simulate a hypothetical rename: legacy `settings.colorTheme` → `settings.theme`.
      if (config.settings && config.settings.colorTheme && !config.settings.theme) {
        config.settings.theme = config.settings.colorTheme;
        delete config.settings.colorTheme;
      }
    },
  });
  try {
    const result = App.configIo.applyImportedConfig({
      settings_version: 100,
      settings: { colorTheme: 'dark' },
    });
    assertEqual(result.settings.theme, 'dark');
  } finally {
    App.settingsMigration.STEPS.length = 0;
  }
});

test('internal config, localStorage groups, and export JSON shapes stay in sync', () => {
  const App = loadApp({}, ['core.js', 'state.js', 'query_history.js', 'query.js', 'settings_migration.js', 'config_io.js']);
  const defaultKeys = Object.keys(App.DEFAULTS).sort();
  const storageKeys = Object.keys(App.STORAGE_KEYS).sort();
  assertDeepEqual(defaultKeys, storageKeys);

  for (const [group, storageKey] of Object.entries(App.STORAGE_KEYS)) {
    assertEqual(storageKey, `aerolog_${group}`);
  }

  const exported = App.configIo.buildExportConfig(new Date('2026-04-13T00:00:00Z'));
  const metaKeys = new Set(['settings_version', 'aerolog_version', 'export_time']);
  const exportedGroupKeys = Object.keys(exported).filter((key) => !metaKeys.has(key)).sort();
  // Every exported non-meta key must be one of the canonical group keys. (querydef and timecustom
  // are optional and omitted when empty, so the export is a subset of DEFAULTS keys.)
  for (const key of exportedGroupKeys) {
    assertEqual(defaultKeys.includes(key), true, `exported key ${key} missing from DEFAULTS`);
  }

  const defaultExported = ['settings', 'logview', 'aliases', 'tabs', 'queryhist'];
  for (const key of defaultExported) {
    assertEqual(Object.prototype.hasOwnProperty.call(exported, key), true, `export missing canonical group ${key}`);
  }

  assertDeepEqual(Object.keys(App.DEFAULTS.settings).sort(), ['logtable', 'server', 'tabvis', 'theme']);
  assertDeepEqual(Object.keys(App.DEFAULTS.logview).sort(), ['colwidths', 'pollint', 'rowcount', 'timecustom', 'timerange']);
  assertDeepEqual(Object.keys(App.DEFAULTS.settings.tabvis).sort(), ['aliases', 'heartbeats', 'tabs']);
  assertDeepEqual(Object.keys(App.DEFAULTS.settings.logtable).sort(), ['copy', 'expand', 'filter', 'msglines']);
});

test('pre-paint theme script reads theme from aerolog_settings and falls back to system', () => {
  const vm = require('node:vm');
  const html = fs.readFileSync(path.join(ROOT, 'site/index.html'), 'utf8');
  const match = html.match(/<script>\s*(\(function\(\)[\s\S]*?\}\)\(\);)\s*<\/script>/);
  if (!match) throw new Error('pre-paint theme script not found in index.html');
  const script = match[1];

  const runScript = (storageEntries) => {
    const store = new Map(Object.entries(storageEntries));
    let applied = null;
    const context = {
      localStorage: { getItem: (key) => (store.has(key) ? store.get(key) : null) },
      document: {
        documentElement: { setAttribute(name, value) { if (name === 'data-theme') applied = value; } },
      },
      JSON,
    };
    vm.createContext(context);
    vm.runInContext(script, context);
    return applied;
  };

  assertEqual(runScript({ aerolog_settings: JSON.stringify({ theme: 'dark' }) }), 'dark');
  assertEqual(runScript({ aerolog_settings: JSON.stringify({ theme: 'light' }) }), 'light');
  assertEqual(runScript({}), 'system');
  assertEqual(runScript({ aerolog_settings: 'not json' }), 'system');
  assertEqual(runScript({ aerolog_settings: JSON.stringify({}) }), 'system');
});

test('derive.connectionView produces the right pill state for every connection/autoPolling combo', () => {
  const App = loadApp();
  App.state.config.settings.server = 'logs.example:9428';
  const setCanAutoPoll = (value) => { App.derive.canAutoPoll = () => value; };

  App.state.runtime.connection = { kind: 'idle', detail: '', hasFetched: false };
  setCanAutoPoll(false);
  assertDeepEqual(App.derive.connectionView(), { state: '', text: 'not connected', title: '' });

  App.state.runtime.connection = { kind: 'ok', detail: '', hasFetched: true };
  setCanAutoPoll(true);
  assertEqual(App.derive.connectionView().state, 'ok');
  setCanAutoPoll(false);
  assertEqual(App.derive.connectionView().state, 'paused');
  assertEqual(App.derive.connectionView().title, 'polling paused');

  App.state.runtime.connection = { kind: 'err', detail: 'timeout', hasFetched: true };
  setCanAutoPoll(true);
  assertEqual(App.derive.connectionView().state, 'err');
  assertEqual(App.derive.connectionView().title, 'logs.example:9428 — timeout');
  setCanAutoPoll(false);
  assertEqual(App.derive.connectionView().state, 'paused');

  App.state.runtime.connection = { kind: 'idle', detail: '', hasFetched: true };
  setCanAutoPoll(false);
  assertEqual(App.derive.connectionView().state, 'paused');
});
