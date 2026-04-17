const { fs, path, ROOT, loadApp, test, assertEqual, assertDeepEqual, installActionStubs } = require('./helpers');

test('aerolog.css uses only the 1000px responsive breakpoint', () => {
  const css = fs.readFileSync(path.join(ROOT, 'site/styles/aerolog.css'), 'utf8');
  const widths = [];
  const re = /@media[^{]*\(\s*max-width\s*:\s*(\d+)px\s*\)/g;
  let match;
  while ((match = re.exec(css)) !== null) {
    widths.push(Number(match[1]));
  }
  if (widths.length === 0) {
    throw new Error('expected at least one @media (max-width: ...) rule in aerolog.css');
  }
  const offenders = widths.filter((w) => w !== 1000);
  if (offenders.length) {
    throw new Error(`aerolog.css must use only (max-width: 1000px); found: ${offenders.join(', ')}`);
  }
});

function loadAppWithRender() {
  const App = loadApp({}, ['core.js', 'toasts.js', 'state.js', 'query_history.js', 'render.js', 'render_table.js', 'render_pager.js', 'render_tabs.js', 'query.js']);
  const tbody = { innerHTML: '' };
  const versionText = { textContent: '' };
  const statLogs = { innerHTML: '' };
  const statResp = { innerHTML: '' };
  const pagerMeta = { textContent: '' };
  const pagerButtons = { innerHTML: '' };
  const tabs = { innerHTML: '', classList: { add() {}, remove() {}, toggle() {} }, clientWidth: 1000, scrollWidth: 500 };
  const thead = { innerHTML: '' };
  const pollSelect = { value: '' };
  const pageSizeSelect = { value: '' };
  const timeRangeSelect = { value: '' };
  const messageLinesSelect = { value: '' };
  const searchEl = { value: '' };
  const connStatus = { className: '', removeAttribute() {}, setAttribute(name, value) { this[name] = value; }, title: '' };
  const hostText = { textContent: '' };
  const connProgress = { style: {} };
  const toastClasses = new Set();
  const toast = {
    textContent: '',
    style: {},
    classList: {
      add(value) { toastClasses.add(value); },
      remove(value) { toastClasses.delete(value); },
      contains(value) { return toastClasses.has(value); },
    },
    __classes: toastClasses,
  };
  const elements = {
    'log-body': tbody,
    'log-thead': thead,
    'version-text': versionText,
    'stat-logs': statLogs,
    'stat-resp': statResp,
    'pager-meta': pagerMeta,
    'pager-buttons': pagerButtons,
    'tabs': tabs,
    'poll-interval': pollSelect,
    'page-size': pageSizeSelect,
    'time-range': timeRangeSelect,
    'time-custom-edit': null,
    'message-lines': messageLinesSelect,
    'search': searchEl,
    'conn-status': connStatus,
    'conn-progress': connProgress,
    'toast': toast,
  };
  App.dom.byId = (id) => elements[id] === undefined ? null : elements[id];
  App.dom.q = (selector) => selector === '.host-text' ? hostText : null;
  App.dom.qa = () => [];
  App.queryHistory.render = () => { App.__queryHistoryRendered = (App.__queryHistoryRendered || 0) + 1; };
  App.persist.logview.colwidths = () => {};
  App.__testContext.window.matchMedia = () => ({ matches: false });
  App.__testContext.window.getComputedStyle = () => ({ paddingLeft: '0', paddingRight: '0', font: '12px monospace' });
  App.polling = {
    clearScheduledPoll() { App.__clearedSchedule = (App.__clearedSchedule || 0) + 1; },
    resetProgressBar() { App.__resetBar = (App.__resetBar || 0) + 1; },
    pauseForExpansion() {
      App.__pausedExpansion = (App.__pausedExpansion || 0) + 1;
      App.state.runtime.polling.pausedForExpansion = true;
    },
  };
  return { App, tbody, toast };
}

test('renderAllStatic does not eagerly render hidden query history', () => {
  const { App } = loadAppWithRender();
  App.render.renderAllStatic();
  assertEqual(App.__queryHistoryRendered || 0, 0);
});

test('toasts module supports error styling and durations', () => {
  const { App, toast } = loadAppWithRender();
  const timers = [];
  App.__testContext.setTimeout = (callback, duration) => {
    timers.push({ callback, duration });
    return timers.length;
  };
  App.__testContext.clearTimeout = () => {};

  App.toasts.show('Could not copy row');
  assertEqual(toast.textContent, 'Could not copy row');
  assertEqual(toast.classList.contains('show'), true);
  assertEqual(toast.classList.contains('error'), false);
  assertEqual(toast.style.color, 'var(--green, #7fd962)');
  assertEqual(toast.style.borderColor, 'var(--green, #7fd962)');
  assertEqual(timers[0].duration, 2000);

  App.toasts.show('Config import failed', { kind: 'error' });
  assertEqual(toast.textContent, 'Config import failed');
  assertEqual(toast.classList.contains('show'), true);
  assertEqual(toast.classList.contains('error'), true);
  assertEqual(toast.style.color, 'var(--accent, #e8433a)');
  assertEqual(toast.style.borderColor, 'var(--accent, #e8433a)');
  assertEqual(timers[1].duration, 5000);

  timers[1].callback();
  assertEqual(toast.classList.contains('show'), false);
  assertEqual(toast.classList.contains('error'), true);
});

test('toast CSS colors success green and errors red', () => {
  const css = fs.readFileSync(path.join(ROOT, 'site/styles/aerolog.css'), 'utf8');
  assertEqual(/\.toast\s*\{[^}]*border:\s*1px\s+solid\s+var\(--green\);[^}]*color:\s*var\(--green\);/s.test(css), true);
  assertEqual(/\.toast\.error\s*\{[^}]*border-color:\s*var\(--accent\);[^}]*color:\s*var\(--accent\);/s.test(css), true);
  assertEqual(css.includes('var(--red)'), false);
});

test('index loads toasts after core and before state', () => {
  const html = fs.readFileSync(path.join(ROOT, 'site/index.html'), 'utf8');
  const scripts = Array.from(html.matchAll(/<script src="\.\/js\/([^"]+)" defer><\/script>/g)).map((match) => match[1]);
  assertEqual(scripts.indexOf('core.js') < scripts.indexOf('toasts.js'), true);
  assertEqual(scripts.indexOf('toasts.js') < scripts.indexOf('state.js'), true);
});

test('renderLogs emits N rows when no rows are expanded', () => {
  const { App, tbody } = loadAppWithRender();
  App.state.runtime.currentLogs = [
    { _time: '2026-04-13T00:00:00Z', _msg: 'a', hostname: 'h1', extra: 'x' },
    { _time: '2026-04-13T00:00:01Z', _msg: 'b', hostname: 'h2' },
  ];
  App.render.renderLogs();
  const rows = (tbody.innerHTML.match(/<tr /g) || []).length;
  assertEqual(rows, 2);
  assertEqual(tbody.innerHTML.includes('row-detail'), false);
  assertEqual(tbody.innerHTML.includes('data-action="toggle-row"'), true);
  assertEqual(tbody.innerHTML.includes('<tr data-row-index="0" data-action="toggle-row"'), false);
  assertEqual(tbody.innerHTML.includes('title="Expand row"'), true);
  assertEqual(tbody.innerHTML.includes('msg-cell-inner'), true);
  assertEqual(tbody.innerHTML.includes('msg-actions'), true);
  assertEqual(tbody.innerHTML.includes('data-action="copy-row"'), true);
  assertEqual(tbody.innerHTML.includes('data-filter-column="hostname"'), true);
  assertEqual(tbody.innerHTML.includes('data-filter-column="_time"'), false);
  assertEqual(tbody.innerHTML.includes('data-filter-column="_msg"'), false);
});

test('renderLogs respects row action visibility preferences', () => {
  const { App, tbody } = loadAppWithRender();
  App.state.runtime.currentLogs = [
    { _time: '2026-04-13T00:00:00Z', _msg: 'a', hostname: 'h1' },
  ];
  App.state.config.settings.logtable = { msglines: '3', expand: false, copy: true, filter: true };
  App.render.renderLogs();
  assertEqual(tbody.innerHTML.includes('data-action="toggle-row"'), false);
  assertEqual(tbody.innerHTML.includes('data-action="copy-row"'), true);

  App.state.config.settings.logtable = { msglines: '3', expand: false, copy: false, filter: true };
  App.render.renderLogs();
  assertEqual(tbody.innerHTML.includes('msg-actions'), false);
  assertEqual(tbody.innerHTML.includes('data-action="copy-row"'), false);

  App.state.config.settings.logtable = { msglines: '3', expand: true, copy: true, filter: false };
  App.render.renderLogs();
  assertEqual(tbody.innerHTML.includes('data-filter-row'), false);
});

test('renderLogs renders all raw detail fields sorted alphabetically without aliases', () => {
  const { App, tbody } = loadAppWithRender();
  App.state.config.aliases = { '10.0.0.5': 'router-01' };
  App.state.runtime.currentLogs = [
    { _time: '2026-04-13T00:00:00Z', _msg: 'hello world', hostname: '10.0.0.5', severity: 3, facility_keyword: 'auth', facility: 4, app_name: 'sshd', custom_field: 'v1', trace_id: 'abc', 'event.code': '4776', 'host.name': 'GmSrv-PVE1', 'winlog.provider_name': 'Microsoft-Windows-Security-Auditing' },
  ];
  App.state.runtime.expandedRows.add(0);
  App.render.renderLogs();
  assertEqual(tbody.innerHTML.includes('row-detail'), true);
  assertEqual(tbody.innerHTML.includes('title="Collapse row"'), true);
  assertEqual(tbody.innerHTML.includes('row-detail-key">_time<'), true);
  assertEqual(tbody.innerHTML.includes('row-detail-key">app_name<'), true);
  assertEqual(tbody.innerHTML.includes('custom_field'), true);
  assertEqual(tbody.innerHTML.includes('row-detail-key">event.code<span class="row-detail-sep">\t</span></span><span class="row-detail-value">4776'), true);
  assertEqual(tbody.innerHTML.includes('row-detail-key">facility<span class="row-detail-sep">\t</span></span><span class="row-detail-value">4'), true);
  assertEqual(tbody.innerHTML.includes('row-detail-key">facility_keyword<span class="row-detail-sep">\t</span></span><span class="row-detail-value">auth'), true);
  assertEqual(tbody.innerHTML.includes('row-detail-key">host.name<span class="row-detail-sep">\t</span></span><span class="row-detail-value">GmSrv-PVE1'), true);
  assertEqual(tbody.innerHTML.includes('row-detail-key">hostname<span class="row-detail-sep">\t</span></span><span class="row-detail-value">10.0.0.5'), true);
  assertEqual(tbody.innerHTML.includes('router-01'), true);
  assertEqual(tbody.innerHTML.includes('row-detail-value">router-01'), false);
  assertEqual(tbody.innerHTML.includes('trace_id'), true);
  assertEqual(tbody.innerHTML.includes('row-detail-key">winlog.provider_name<span class="row-detail-sep">\t</span></span><span class="row-detail-value">Microsoft-Windows-Security-Auditing'), true);
  assertEqual(tbody.innerHTML.includes('hello world'), true);
  assertEqual(tbody.innerHTML.includes('data-filter-field="facility"'), true);
  assertEqual(tbody.innerHTML.includes('data-filter-field="facility_keyword"'), true);
  assertEqual(tbody.innerHTML.includes('data-filter-field="custom_field"'), true);
  assertEqual(tbody.innerHTML.includes('data-filter-field="event.code"'), false);
  assertEqual(tbody.innerHTML.includes('data-filter-field="winlog.provider_name"'), false);
  assertEqual(tbody.innerHTML.includes('data-filter-field="_msg"'), false);
  assertEqual(tbody.innerHTML.includes('data-filter-field="_time"'), false);
  assertEqual(tbody.innerHTML.indexOf('row-detail-key">custom_field') < tbody.innerHTML.indexOf('row-detail-key">facility'), true);
  assertEqual(tbody.innerHTML.indexOf('row-detail-key">facility') < tbody.innerHTML.indexOf('row-detail-key">trace_id'), true);
  assertEqual(tbody.innerHTML.includes('row-detail-key">severity<'), true);
});

test('toggleRow on first expansion pauses polling via runtime state without changing config', () => {
  const { App } = loadAppWithRender();
  App.state.runtime.currentLogs = [{ _time: '2026-04-13T00:00:00Z', _msg: 'a' }];
  App.state.config.logview.pollint = '5';
  App.__testContext.localStorage.setItem('aerolog_logview', JSON.stringify({ pollint: '5' }));
  App.render.toggleRow(0);
  assertEqual(App.state.runtime.expandedRows.has(0), true);
  assertEqual(App.state.config.logview.pollint, '5');
  assertEqual(App.state.runtime.polling.pausedForExpansion, true);
  assertEqual(JSON.parse(App.__testContext.localStorage.getItem('aerolog_logview')).pollint, '5');
  assertEqual(App.__pausedExpansion, 1);
});

test('collapseAllRows clears expanded row state and reports whether it changed anything', () => {
  const { App } = loadAppWithRender();
  assertEqual(App.render.collapseAllRows(), false);
  App.state.runtime.expandedRows.add(0);
  App.state.runtime.expandedRows.add(1);
  assertEqual(App.render.collapseAllRows(), true);
  assertEqual(App.state.runtime.expandedRows.size, 0);
});

test('toggleRow collapse does not auto-resume polling after an expansion pause', () => {
  const { App } = loadAppWithRender();
  App.state.runtime.currentLogs = [{ _time: '2026-04-13T00:00:00Z', _msg: 'a' }];
  App.state.config.logview.pollint = '5';
  App.render.toggleRow(0);
  assertEqual(App.state.runtime.polling.pausedForExpansion, true);
  App.render.toggleRow(0);
  assertEqual(App.state.config.logview.pollint, '5');
  assertEqual(App.state.runtime.polling.pausedForExpansion, true);
  assertEqual(App.state.runtime.expandedRows.size, 0);
});

test('dispatchRefresh collapses expandedRows but does not clear the expansion pause', async () => {
  const App = loadApp({}, ['core.js', 'state.js', 'query_history.js', 'query.js', 'api.js']);
  App.state.runtime.expandedRows.add(0);
  App.state.runtime.expandedRows.add(2);
  App.__testContext.fetch = async (_url, options) => {
    const query = decodeURIComponent(String(options.body).replace(/^query=/, ''));
    return {
      ok: true,
      status: 200,
      statusText: 'OK',
      text: async () => query.includes('stats count()') ? '{"c":1}\n' : '{"_msg":"x"}\n',
    };
  };
  App.state.runtime.polling.pausedForExpansion = true;
  App.polling = { onRefreshDispatched() {}, onRefreshCompleted() {}, clearExpansionPause() { App.__clearedExpansionPause = true; } };
  App.render = {
    collapseAllRows() {
      App.state.runtime.expandedRows.clear();
      return true;
    },
    renderLogs() {}, renderStats() {}, renderPagination() {},
    renderResponseTime() {}, renderConnectionPill() {}, renderError() {},
  };
  await App.api.dispatchRefresh('manual');
  assertEqual(App.state.runtime.expandedRows.size, 0);
  assertEqual(App.__clearedExpansionPause, undefined);
  assertEqual(App.state.runtime.polling.pausedForExpansion, true);
});

test('core.js MOBILE_MAX_WIDTH matches the CSS breakpoint', () => {
  const core = fs.readFileSync(path.join(ROOT, 'site/js/core.js'), 'utf8');
  const match = core.match(/MOBILE_MAX_WIDTH\s*=\s*(\d+)/);
  if (!match) throw new Error('MOBILE_MAX_WIDTH not found in core.js');
  assertEqual(Number(match[1]), 1000);
});

test('expanded row detail layout shares one grid so keys align across rows', () => {
  const css = fs.readFileSync(path.join(ROOT, 'site/styles/aerolog.css'), 'utf8');
  assertEqual(css.includes('grid-template-columns: fit-content(16rem) minmax(0, 1fr);'), true);
  assertEqual(css.includes('grid-template-columns: fit-content(10rem) minmax(0, 1fr);'), false);
  assertEqual(css.includes('display: contents;'), true);
  assertEqual(css.includes('overflow-wrap: anywhere;'), true);
});

test('field filter popup header uses accent color', () => {
  const css = fs.readFileSync(path.join(ROOT, 'site/styles/aerolog.css'), 'utf8');
  assertEqual(/\.field-filter-title\s*\{[^}]*color:\s*var\(--accent\);/s.test(css), true);
});

test('every free-text input in index.html suppresses mobile autocorrect and autocapitalize', () => {
  const html = fs.readFileSync(path.join(ROOT, 'site/index.html'), 'utf8');
  const tagRe = /<(input|textarea)\b[^>]*>/gi;
  const freeTextTypes = new Set(['text', 'search', 'url', 'email', 'datetime-local', null]);
  const offenders = [];
  let match;
  while ((match = tagRe.exec(html)) !== null) {
    const tag = match[0];
    const isTextarea = match[1].toLowerCase() === 'textarea';
    const typeMatch = tag.match(/\btype\s*=\s*"([^"]*)"/i);
    const type = typeMatch ? typeMatch[1].toLowerCase() : null;
    if (!isTextarea && !freeTextTypes.has(type)) continue;
    const required = ['autocomplete="off"', 'autocorrect="off"', 'autocapitalize="none"', 'spellcheck="false"'];
    const missing = required.filter((attr) => !tag.includes(attr));
    if (missing.length) offenders.push(`${tag} missing ${missing.join(', ')}`);
  }
  if (offenders.length) throw new Error(`free-text inputs missing mobile guards:\n${offenders.join('\n')}`);
});
