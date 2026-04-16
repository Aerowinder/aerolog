#!/usr/bin/env node

const { tests } = require('./helpers');

require('./query.test');
require('./config.test');
require('./actions.test');
require('./api_polling.test');
require('./shortcuts.test');
require('./modals.test');
require('./input_focus_style.test');
require('./events.test');
require('./heartbeats.test');
require('./render.test');

let failed = 0;
(async function run() {
  for (const { name, fn } of tests) {
    try {
      await fn();
      console.log(`ok - ${name}`);
    } catch (err) {
      failed += 1;
      console.error(`not ok - ${name}`);
      console.error(err.stack || err.message);
    }
  }

  if (failed) {
    console.error(`\n${failed} of ${tests.length} tests failed`);
    process.exit(1);
  }

  console.log(`\n${tests.length} tests passed`);
})();
