const { fs, path, ROOT, loadApp, createClassList, test, assertEqual, assertDeepEqual, installActionStubs } = require('./helpers');

test('friendly field aliases compile to exact field matches', () => {
  const App = loadApp();
  assertEqual(App.query.rewriteQuery('application:sshd'), 'app_name:=sshd');
  assertEqual(App.query.rewriteQuery('fac:auth'), 'facility_keyword:=auth');
  assertEqual(App.query.rewriteQuery('facility_num:4'), 'facility:=4');
  assertEqual(App.query.rewriteQuery('msg:error'), '_msg:=error');
});

test('explicit exact and regex operators are preserved for friendly fields', () => {
  const App = loadApp();
  assertEqual(App.query.rewriteQuery('application:=sshd*'), 'app_name:="sshd*"');
  assertEqual(App.query.rewriteQuery('application:~sshd-[0-9]+'), 'app_name:~"sshd-[0-9]+"');
  assertEqual(App.query.rewriteQuery('message:="disk full"'), '_msg:="disk full"');
});

test('friendly wildcards compile to anchored regex matches', () => {
  const App = loadApp();
  assertEqual(App.query.rewriteQuery('application:sshd*'), 'app_name:~"^sshd.*$"');
  assertEqual(App.query.rewriteQuery('fac:*auth'), 'facility_keyword:~"^.*auth$"');
  assertEqual(App.query.rewriteQuery('msg:*disk*'), '_msg:~"^.*disk.*$"');
});

test('severity shorthand preserves native LogsQL severity syntax', () => {
  const App = loadApp();
  assertEqual(App.query.rewriteQuery('sev:<4'), 'severity:<4');
  assertEqual(App.query.rewriteQuery('sev:3'), 'severity:3');
});

test('host exact and wildcard matching uses aliases', () => {
  const App = loadApp({
    aerolog_aliases: JSON.stringify({
      '10.0.0.5': 'router-01',
      '192.168.1.50': 'firewall',
    }),
  });
  assertEqual(App.query.rewriteQuery('host:router-01'), 'hostname:="10.0.0.5"');
  assertEqual(App.query.rewriteQuery('hostname:router-*'), '(hostname:~"^router-.*$" OR hostname:="10.0.0.5")');
  assertEqual(App.query.rewriteQuery('host:~router-[0-9]+'), 'hostname:~"router-[0-9]+"');
});

test('quoted string bodies are not searched for friendly fields', () => {
  const App = loadApp();
  assertEqual(App.query.rewriteQuery('"host:router-01" app:sshd'), '"host:router-01" app_name:=sshd');
});

test('unterminated quoted field values do not rewrite later text inside the quote', () => {
  const App = loadApp();
  assertEqual(App.query.rewriteQuery('app:"oops host:router-01'), 'app:"oops host:router-01');
});

test('parenthesized friendly filters keep closing suffixes intact', () => {
  const App = loadApp();
  assertEqual(App.query.rewriteQuery('(app:sshd)'), '(app_name:=sshd)');
});

test('friendly filters can follow comma and closing parenthesis boundaries', () => {
  const App = loadApp();
  assertEqual(App.query.rewriteQuery('foo,app:sshd'), 'foo,app_name:=sshd');
  assertEqual(App.query.rewriteQuery('foo)app:sshd'), 'foo)app_name:=sshd');
});

test('field filters build readable clauses for structured table cells', () => {
  const App = loadApp({
    aerolog_aliases: JSON.stringify({ '10.0.0.5': 'router-01' }),
  }, ['core.js', 'state.js', 'query_history.js', 'query.js', 'field_filters.js']);
  App.state.runtime.currentLogs = [
    { hostname: '10.0.0.5', severity: 3, facility_keyword: 'auth', facility: 4, app_name: 'sshd' },
    { hostname: 'server-02', severity: 5, facility: 10, app_name: 'cron job' },
  ];

  const target = (row, column) => ({ dataset: { filterRow: String(row), filterColumn: column } });
  assertEqual(App.fieldFilters.filterFromTarget(target(0, 'hostname')).clause, 'host:"router-01"');
  assertEqual(App.query.rewriteQuery(App.fieldFilters.filterFromTarget(target(0, 'hostname')).clause), 'hostname:="10.0.0.5"');
  assertEqual(App.fieldFilters.filterFromTarget(target(0, 'priority')).clause, 'sev:3');
  assertEqual(App.fieldFilters.filterFromTarget(target(0, 'facility')).clause, 'fac:"auth"');
  assertEqual(App.fieldFilters.filterFromTarget(target(1, 'facility')).clause, 'facility_num:10');
  assertEqual(App.fieldFilters.filterFromTarget(target(1, 'app_name')).clause, 'app:"cron job"');
  assertEqual(App.query.rewriteQuery(App.fieldFilters.filterFromTarget(target(1, 'app_name')).clause), 'app_name:="cron job"');
});

test('field filters skip time and message but include safe detail fields', () => {
  const App = loadApp({}, ['core.js', 'state.js', 'query_history.js', 'query.js', 'field_filters.js']);
  App.state.runtime.currentLogs = [
    { _time: '2026-04-13T00:00:00Z', _msg: 'disk failed', trace_id: 'abc-123', 'bad field': 'nope' },
  ];

  const column = (name) => ({ dataset: { filterRow: '0', filterColumn: name } });
  const field = (name) => ({ dataset: { filterRow: '0', filterField: name } });
  assertEqual(App.fieldFilters.filterFromTarget(column('_time')), null);
  assertEqual(App.fieldFilters.filterFromTarget(column('_msg')), null);
  assertEqual(App.fieldFilters.filterFromTarget(field('_time')), null);
  assertEqual(App.fieldFilters.filterFromTarget(field('_msg')), null);
  assertEqual(App.fieldFilters.filterFromTarget(field('trace_id')).clause, 'trace_id:="abc-123"');
  assertEqual(App.fieldFilters.filterFromTarget(field('bad field')), null);
});

test('field filter popup anchors on desktop and becomes a mobile sheet in mobile mode', () => {
  const App = loadApp({}, ['core.js', 'state.js', 'query_history.js', 'query.js', 'field_filters.js']);
  App.state.runtime.currentLogs = [{ app_name: 'sshd' }];

  const classList = createClassList();
  const menu = {
    hidden: true,
    style: {},
    innerHTML: '',
    classList,
    contains() { return false; },
    getBoundingClientRect() {
      App.__menuMeasuredVisibility = this.style.visibility;
      return { width: 200, height: 80 };
    },
  };
  App.dom.byId = (id) => id === 'field-filter-menu' ? menu : null;
  App.__testContext.window.innerWidth = 1200;
  App.__testContext.window.innerHeight = 800;

  const target = {
    dataset: { filterRow: '0', filterColumn: 'app_name' },
    getBoundingClientRect() { return { left: 20, top: 20, bottom: 40 }; },
  };

  App.fieldFilters.open(target);
  assertEqual(menu.hidden, false);
  assertEqual(classList.contains('open'), true);
  assertEqual(classList.contains('mobile-sheet'), false);
  assertEqual(App.__menuMeasuredVisibility, 'hidden');
  assertEqual(menu.style.visibility, '');
  assertEqual(menu.style.left, '20px');
  assertEqual(menu.style.top, '46px');

  App.__testContext.window.matchMedia = () => ({ matches: true });
  App.fieldFilters.open(target);
  assertEqual(menu.hidden, false);
  assertEqual(classList.contains('mobile-sheet'), true);
  assertEqual(menu.style.left, '');
  assertEqual(menu.style.top, '');

  App.fieldFilters.close();
  assertEqual(menu.hidden, true);
  assertEqual(classList.contains('open'), false);
  assertEqual(classList.contains('mobile-sheet'), false);
  assertEqual(menu.style.left, '');
  assertEqual(menu.style.top, '');
});

test('active tab filters the query by its host list with alias resolution', () => {
  const App = loadApp({
    aerolog_aliases: JSON.stringify({ '10.0.0.5': 'router-01' }),
    aerolog_tabs: JSON.stringify([
      { id: 1, name: 'Net', hosts: ['router-01', 'switch-*'] },
    ]),
  });
  App.state.rebuildAliasReverse();

  App.state.runtime.activeTabId = 0;
  assertEqual(App.query.buildFilterClause(), '_time:1h');

  App.state.runtime.activeTabId = 1;
  const clause = App.query.buildFilterClause();
  assertEqual(clause.startsWith('_time:1h '), true);
  assertEqual(clause.includes('hostname:="10.0.0.5"'), true);
  assertEqual(clause.includes('hostname:~"^switch-.*$"'), true);
});

