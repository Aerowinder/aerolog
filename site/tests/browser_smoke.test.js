const { fs, path, ROOT, loadApp, test, assertEqual } = require('./helpers');
const vm = require('node:vm');

test('the browser smoke page supplies every dependency and fixture used by its tests', () => {
  const html = fs.readFileSync(path.join(ROOT, 'site/tests/index.html'), 'utf8');
  const scripts = Array.from(html.matchAll(/<script src="([^"]+)"/g), (match) => match[1]);
  const context = loadApp({}, ['core.js']).__testContext;
  delete context.Aerolog;
  const elements = Object.fromEntries(Array.from(html.matchAll(/\bid="([^"]+)"/g), (match) => [match[1], {
    innerHTML: '',
    get textContent() { return this.innerHTML.replace(/<[^>]*>/g, ''); },
  }]));
  context.document.getElementById = (id) => elements[id] || null;
  for (const script of scripts) {
    const filename = path.resolve(ROOT, 'site/tests', script);
    vm.runInContext(fs.readFileSync(filename, 'utf8'), context, { filename });
  }
  const output = elements['test-output'].textContent;
  assertEqual(output.includes('not ok'), false, output);
  assertEqual(output.includes('4 browser tests passed'), true, output);
});
