const fs = require('node:fs');
const path = require('node:path');
const { test, assertEqual, ROOT } = require('./helpers');

const CSS_PATH = path.join(ROOT, 'site/styles/aerolog.css');
const HTML_PATH = path.join(ROOT, 'site/index.html');

const TEXT_INPUT_TYPES = new Set(['text', 'datetime-local', 'search', 'url', 'email', 'password', 'tel', 'number']);

function collectTextInputTypes(html) {
  const types = new Set();
  let hasTextarea = false;
  const tagRegex = /<(input|textarea)\b([^>]*)>/gi;
  let match;
  while ((match = tagRegex.exec(html)) !== null) {
    const tag = match[1].toLowerCase();
    const attrs = match[2];
    if (tag === 'textarea') {
      hasTextarea = true;
      continue;
    }
    const typeMatch = /\btype\s*=\s*"([^"]*)"/i.exec(attrs);
    const type = (typeMatch ? typeMatch[1] : 'text').toLowerCase();
    if (TEXT_INPUT_TYPES.has(type)) types.add(type);
  }
  return { inputTypes: types, hasTextarea };
}

function collectAccentFocusSelectors(css) {
  const covered = new Set();
  const ruleRegex = /([^{}]+)\{([^}]*)\}/g;
  let match;
  while ((match = ruleRegex.exec(css)) !== null) {
    const selectors = match[1].trim();
    const body = match[2];
    if (!/border-color\s*:\s*var\(--accent\)/.test(body)) continue;
    if (!/box-shadow\s*:\s*0\s+0\s+0\s+2px\s+var\(--accent-glow\)/.test(body)) continue;
    for (const raw of selectors.split(',')) {
      const selector = raw.trim();
      if (!selector.endsWith(':focus')) continue;
      covered.add(selector.slice(0, -':focus'.length).trim());
    }
  }
  return covered;
}

test('every text input and textarea gets the accent focus outline', () => {
  const css = fs.readFileSync(CSS_PATH, 'utf8');
  const html = fs.readFileSync(HTML_PATH, 'utf8');
  const { inputTypes, hasTextarea } = collectTextInputTypes(html);
  const covered = collectAccentFocusSelectors(css);

  const missing = [];
  if (hasTextarea && !covered.has('textarea')) missing.push('textarea');
  for (const type of inputTypes) {
    const selector = `input[type="${type}"]`;
    if (!covered.has(selector)) missing.push(selector);
  }
  assertEqual(missing.length, 0,
    `missing accent :focus rule for: ${missing.join(', ')} — add these selectors to a :focus rule that sets border-color: var(--accent) and box-shadow: 0 0 0 2px var(--accent-glow)`);
});
