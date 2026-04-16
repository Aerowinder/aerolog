(function () {
  const App = window.Aerolog;
  const output = document.getElementById('test-output');
  const lines = [];
  let failed = 0;

  function log(line, cls) {
    lines.push(cls ? `<span class="${cls}">${line}</span>` : line);
    output.innerHTML = lines.join('\n');
  }

  function assertEqual(actual, expected) {
    if (actual !== expected) {
      throw new Error(`expected ${expected}, got ${actual}`);
    }
  }

  function test(name, fn) {
    try {
      fn();
      log(`ok - ${name}`, 'pass');
    } catch (err) {
      failed += 1;
      log(`not ok - ${name}: ${err.message}`, 'fail');
    }
  }

  test('query rewrite works in the browser', () => {
    assertEqual(App.query.rewriteQuery('application:sshd'), 'app_name:=sshd');
    assertEqual(App.query.rewriteQuery('(app:sshd)'), '(app_name:=sshd)');
  });

  test('config export helper is available in the browser', () => {
    const exported = App.configIo.buildExportConfig(new Date('2026-04-13T12:34:56Z'));
    assertEqual(exported.aerolog_version, App.VERSION);
    assertEqual(exported.export_time, '2026-04-13T12:34:56.000Z');
  });

  test('custom time filters work in the browser', () => {
    const oldTimeRange = App.state.config.logview.timerange;
    const oldCustomRange = { ...App.state.config.logview.timecustom };
    try {
      App.persist.logview.timecustom({
        start: '2026-04-13T10:00:00.000Z',
        end: '2026-04-13T11:00:00.000Z',
      });
      App.persist.logview.timerange('custom');
      assertEqual(App.query.buildTimeFilterClause(), '_time:[2026-04-13T10:00:00Z, 2026-04-13T11:00:00Z)');
    } finally {
      App.persist.logview.timecustom(oldCustomRange);
      App.persist.logview.timerange(oldTimeRange);
    }
  });

  test('action module is available in the browser', () => {
    assertEqual(typeof App.actions.runSearch, 'function');
    assertEqual(typeof App.actions.setPollInterval, 'function');
  });

  log('');
  log(failed ? `${failed} browser tests failed` : '4 browser tests passed', failed ? 'fail' : 'pass');
})();
