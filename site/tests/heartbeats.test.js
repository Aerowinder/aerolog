const { loadApp, test, assertEqual } = require('./helpers');

test('heartbeats modal renders host activity rows with aliases and last-seen text', async () => {
  const App = loadApp({
    aerolog_aliases: JSON.stringify({ '10.0.0.5': 'router-01' }),
  }, ['core.js', 'state.js', 'query_history.js', 'query.js', 'heartbeats.js']);
  const elements = {
    'heartbeats-range': { textContent: '' },
    'heartbeats-body': { innerHTML: '' },
  };
  App.dom.byId = (id) => elements[id] || null;
  App.modals = {
    openModal() {},
    closeModal() {},
  };
  App.api = {
    runQuery() {
      return Promise.resolve([
        { hostname: '10.0.0.5', messages: 12, last_seen: new Date(Date.now() - 45 * 1000).toISOString() },
      ]);
    },
  };

  await App.heartbeats.openHeartbeatsModal();
  assertEqual(elements['heartbeats-range'].textContent, '1h');
  assertEqual(elements['heartbeats-body'].innerHTML.includes('router-01'), true);
  assertEqual(elements['heartbeats-body'].innerHTML.includes('title="10.0.0.5"'), true);
  assertEqual(elements['heartbeats-body'].innerHTML.includes('&lt; 1m'), true);
});

test('heartbeats modal renders query failures without throwing', async () => {
  const App = loadApp({}, ['core.js', 'state.js', 'query_history.js', 'query.js', 'heartbeats.js']);
  const elements = {
    'heartbeats-range': { textContent: '' },
    'heartbeats-body': { innerHTML: '' },
  };
  App.dom.byId = (id) => elements[id] || null;
  App.modals = {
    openModal() {},
    closeModal() {},
  };
  App.api = {
    runQuery() {
      return Promise.reject(new Error('boom'));
    },
  };

  await App.heartbeats.openHeartbeatsModal();
  assertEqual(elements['heartbeats-body'].innerHTML.includes('boom'), true);
});
