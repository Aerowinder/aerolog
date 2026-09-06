(function () {
  const App = window.Aerolog;
  const { utils } = App;

  const friendlyFieldNames = Object.keys(App.FIELD_REGISTRY).sort((a, b) => b.length - a.length);

  function getAliasWildcardMatches(pattern) {
    if (!utils.hasWildcard(pattern)) return [];
    const re = new RegExp(utils.wildcardToRegex(pattern), 'i');
    return Object.entries(App.state.config.aliases)
      .filter(([, friendly]) => re.test(friendly))
      .map(([raw]) => raw);
  }

  function resolveExactHost(value) {
    const { aliasReverse } = App.state.runtime;
    if (Object.prototype.hasOwnProperty.call(aliasReverse, value)) return aliasReverse[value];
    return value;
  }

  function createQuoteTracker(query) {
    let index = 0;
    let quote = '';
    let escaped = false;
    return function isInsideQuotedString(targetIndex) {
      for (; index < targetIndex; index += 1) {
        const char = query[index];
        if (escaped) escaped = false;
        else if (quote && quote !== '`' && char === '\\') escaped = true;
        else if (quote && char === quote) quote = '';
        else if (!quote && /["'`]/.test(char)) quote = char;
      }
      return Boolean(quote);
    };
  }

  // Only top-level pipes separate the filter from its pipeline. Quoted pipes
  // and subqueries must remain part of the original expression.
  function splitPipeline(query) {
    const insideQuote = createQuoteTracker(query);
    let depth = 0;
    for (let index = 0; index < query.length; index += 1) {
      if (insideQuote(index) || /["'`]/.test(query[index])) continue;
      const char = query[index];
      if ('([{'.includes(char)) depth += 1;
      else if (')]}'.includes(char)) depth = Math.max(0, depth - 1);
      else if (char === '|' && depth === 0) {
        return { filter: query.slice(0, index).trim(), pipeline: query.slice(index) };
      }
    }
    return { filter: query.trim(), pipeline: '' };
  }

  function appendFilter(query, clause) {
    const { filter, pipeline } = splitPipeline(String(query || ''));
    return [filter ? `(${filter})` : '', clause, pipeline].filter(Boolean).join(' ');
  }

  function isTokenLead(char) {
    return char === '' || /[\s(,)!-]/.test(char);
  }

  function findFriendlyFieldAt(query, index) {
    for (const name of friendlyFieldNames) {
      const candidate = query.slice(index, index + name.length);
      if (candidate.toLowerCase() === name) return name;
    }
    return '';
  }

  function readFriendlyOperator(query, index) {
    let cursor = index;
    while (/\s/.test(query[cursor] || '')) cursor += 1;
    if (query[cursor] !== ':') return null;
    cursor += 1;
    let operator = ':';
    if (query[cursor] === '=' || query[cursor] === '~') {
      operator += query[cursor];
      cursor += 1;
    }
    while (/\s/.test(query[cursor] || '')) cursor += 1;
    return { operator, cursor };
  }

  function readQuotedValue(query, index) {
    const quote = query[index];
    if (!quote || !/["'`]/.test(quote)) return null;
    let value = '';
    const bytes = [];
    const flush = () => {
      for (const byte of new TextEncoder().encode(value)) bytes.push(byte);
      value = '';
    };
    for (let cursor = index + 1; cursor < query.length; cursor += 1) {
      const char = query[cursor];
      if (char === quote) {
        if (bytes.length) {
          flush();
          try { value = new TextDecoder('utf-8', { fatal: true }).decode(new Uint8Array(bytes)); }
          catch { return null; }
        }
        return { quoted: true, value, literal: query.slice(index, cursor + 1), suffix: '', cursor: cursor + 1 };
      }
      if (char !== '\\' || quote === '`') {
        value += char;
        continue;
      }
      const escape = query[++cursor];
      const escapes = { a: '\x07', b: '\b', f: '\f', n: '\n', r: '\r', t: '\t', v: '\v', '\\': '\\', '"': '"', "'": "'" };
      if (Object.prototype.hasOwnProperty.call(escapes, escape)) {
        value += escapes[escape];
        continue;
      }
      const digits = escape === 'x' ? 2 : escape === 'u' ? 4 : escape === 'U' ? 8 : /[0-7]/.test(escape || '') ? 3 : 0;
      const octal = digits === 3;
      const start = octal ? cursor : cursor + 1;
      const number = query.slice(start, start + digits);
      if (!digits || number.length !== digits || !(octal ? /^[0-7]+$/ : /^[0-9a-f]+$/i).test(number)) return null;
      const code = parseInt(number, octal ? 8 : 16);
      if (code > (octal ? 255 : 0x10ffff) || (code >= 0xd800 && code <= 0xdfff)) return null;
      if (octal || escape === 'x') { flush(); bytes.push(code); }
      else value += String.fromCodePoint(code);
      cursor = start + digits - 1;
    }
    return null;
  }

  function readUnquotedValue(query, index) {
    let cursor = index;
    let depth = 0;
    while (cursor < query.length && !/\s/.test(query[cursor])) {
      if (query[cursor] === '|' && depth === 0) break;
      if (query[cursor] === '(') depth += 1;
      if (query[cursor] === ')') depth = Math.max(0, depth - 1);
      cursor += 1;
    }
    if (cursor === index) return null;
    const valueParts = splitUnquotedValue(query.slice(index, cursor));
    return {
      quoted: false,
      value: valueParts.value,
      suffix: valueParts.suffix,
      cursor,
    };
  }

  function readFriendlyFieldToken(query, index) {
    const lead = index === 0 ? '' : query[index - 1];
    const aliasIndex = index;
    if (!isTokenLead(lead)) return null;
    const alias = findFriendlyFieldAt(query, aliasIndex);
    if (!alias) return null;
    const afterAlias = aliasIndex + alias.length;
    const operatorParts = readFriendlyOperator(query, afterAlias);
    if (!operatorParts) return null;
    const quoted = /["'`]/.test(query[operatorParts.cursor] || '');
    const valueParts = quoted ? readQuotedValue(query, operatorParts.cursor) : readUnquotedValue(query, operatorParts.cursor);
    if (!valueParts) return null;
    return {
      token: {
        type: 'field',
        lead,
        alias: query.slice(aliasIndex, afterAlias),
        operator: operatorParts.operator,
        quoted: valueParts.quoted,
        literal: valueParts.literal,
        value: valueParts.value,
      },
      suffix: valueParts.suffix,
      start: index === 0 ? 0 : index - 1,
      cursor: valueParts.cursor,
    };
  }

  function splitUnquotedValue(value) {
    const raw = String(value || '');
    let end = raw.length;
    let depth = 0;
    for (let i = 0; i < end; i += 1) {
      if (raw[i] === '(') depth += 1;
      if (raw[i] === ')') depth -= 1;
    }
    while (end > 0 && raw[end - 1] === ')' && depth < 0) {
      end -= 1;
      depth += 1;
    }
    return {
      value: raw.slice(0, end),
      suffix: raw.slice(end),
    };
  }

  function buildExactHostnameClause(value) {
    return buildHostMatchClause(resolveExactHost(value), ':=');
  }

  function hostnameFallbackField() {
    const fallback = App.state.config.settings.fallback.hostname;
    return fallback && fallback.enabled !== false ? fallback.field : '';
  }

  function buildHostMatchClause(value, operator, literal) {
    const hostnameClause = `hostname${operator}${literal || utils.quoteLogsQlValue(value)}`;
    const fallbackField = hostnameFallbackField();
    if (!fallbackField) return hostnameClause;
    const fallbackClause = `${fallbackField}${operator}${literal || utils.quoteLogsQlValue(value)}`;
    return `(${hostnameClause} OR (hostname:"" AND ${fallbackClause}))`;
  }

  function compileHostClause(value, operator = ':', literal) {
    const trimmed = literal ? String(value) : String(value ?? '').trim();
    if (!trimmed && !literal) return '';
    if (operator === ':~') return buildHostMatchClause(trimmed, ':~', literal);
    if (operator === ':=' || !utils.hasWildcard(trimmed)) {
      const resolved = resolveExactHost(trimmed);
      return buildHostMatchClause(resolved, ':=', resolved === trimmed ? literal : undefined);
    }

    const clauses = [buildHostMatchClause(utils.wildcardToRegex(trimmed), ':~')];
    for (const raw of getAliasWildcardMatches(trimmed)) {
      const exactClause = buildExactHostnameClause(raw);
      if (!clauses.includes(exactClause)) clauses.push(exactClause);
    }
    return clauses.length === 1 ? clauses[0] : `(${clauses.join(' OR ')})`;
  }

  function compileFieldClause(target, value, operator = ':', wasQuoted = false, literal) {
    const trimmed = wasQuoted ? String(value) : String(value ?? '').trim();
    const formatExact = (raw) => {
      const needsQuotes = wasQuoted || /[\s"*]/.test(raw) || raw === '';
      return needsQuotes ? utils.quoteLogsQlValue(raw) : raw;
    };
    if (literal && (operator === ':=' || !utils.hasWildcard(trimmed)) && operator !== ':~') return `${target}:=${literal}`;
    if (operator === ':=') {
      return `${target}:=${formatExact(trimmed)}`;
    }
    if (operator === ':~') {
      return `${target}:~${literal || utils.quoteLogsQlValue(trimmed)}`;
    }
    if (utils.hasWildcard(trimmed)) {
      return `${target}:~${utils.quoteLogsQlValue(utils.wildcardToRegex(trimmed))}`;
    }
    return `${target}:=${formatExact(trimmed)}`;
  }

  function compileFieldAliasClause(target, value, operator = ':', wasQuoted = false, literal) {
    const trimmed = wasQuoted ? String(value) : String(value ?? '').trim();
    const renderedValue = literal || (wasQuoted ? utils.quoteLogsQlValue(trimmed) : trimmed);
    return `${target}${operator}${renderedValue}`;
  }

  function tokenizeFriendlyQuery(input) {
    const query = String(input || '');
    const tokens = [];
    const isInsideQuotedString = createQuoteTracker(query);
    let lastIndex = 0;

    for (let index = 0; index < query.length; index += 1) {
      if (isInsideQuotedString(index)) {
        continue;
      }
      const field = readFriendlyFieldToken(query, index);
      if (!field) continue;
      if (field.start > lastIndex) {
        tokens.push({ type: 'text', value: query.slice(lastIndex, field.start) });
      }
      tokens.push(field.token);
      if (field.suffix) {
        tokens.push({ type: 'text', value: field.suffix });
      }
      lastIndex = field.cursor;
      index = field.cursor - 1;
    }
    if (lastIndex < query.length) {
      tokens.push({ type: 'text', value: query.slice(lastIndex) });
    }
    return tokens;
  }

  function normalizeFriendlyTokens(tokens) {
    return tokens.map((token) => {
      if (token.type !== 'field') return token;
      const spec = App.FIELD_REGISTRY[token.alias.toLowerCase()];
      return { ...token, spec };
    });
  }

  function compileFriendlyTokens(tokens) {
    return tokens.map((token) => {
      if (token.type !== 'field' || !token.spec) return token.value || token.lead || '';
      const lead = token.lead || '';
      if (token.spec.kind === App.FIELD_KINDS.HOST) {
        return `${lead}${compileHostClause(token.value, token.operator, token.literal)}`;
      }
      if (token.spec.kind === App.FIELD_KINDS.FIELD_ALIAS) {
        return `${lead}${compileFieldAliasClause(token.spec.target, token.value, token.operator, token.quoted, token.literal)}`;
      }
      return `${lead}${compileFieldClause(token.spec.target, token.value, token.operator, token.quoted, token.literal)}`;
    }).join('');
  }

  function rewriteQuery(input) {
    if (!input) return '';
    return compileFriendlyTokens(normalizeFriendlyTokens(tokenizeFriendlyQuery(input)));
  }

  function buildTabHostClause() {
    const activeTab = App.state.config.tabs.find((tab) => tab.id === App.state.runtime.activeTabId);
    if (!activeTab || !activeTab.hosts.length) return '';
    const clauses = activeTab.hosts.map((host) => compileHostClause(host, ':')).filter(Boolean);
    return clauses.length ? `(${clauses.join(' OR ')})` : '';
  }

  function buildTimeFilterClause() {
    if (App.state.config.logview.timerange !== 'custom') {
      return `_time:${App.state.config.logview.timerange}`;
    }
    const range = App.state.config.logview.timecustom;
    const start = utils.formatLogsQlTime(range && range.start);
    const end = utils.formatLogsQlTime(range && range.end);
    if (!start || !end) return `_time:${App.DEFAULTS.logview.timerange}`;
    return `_time:[${start}, ${end})`;
  }

  function buildFilterClause() {
    const parts = [buildTimeFilterClause()];
    const tabClause = buildTabHostClause();
    if (tabClause) parts.push(tabClause);
    const rewritten = rewriteQuery(App.state.runtime.committedSearch);
    const { filter, pipeline } = splitPipeline(rewritten);
    if (filter) parts.push(`(${filter})`);
    if (pipeline) parts.push(pipeline);
    return parts.join(' ');
  }

  App.query = {
    appendFilter,
    tokenizeFriendlyQuery,
    normalizeFriendlyTokens,
    compileFriendlyTokens,
    rewriteQuery,
    compileHostClause,
    buildTimeFilterClause,
    buildFilterClause,
    buildPagedQuery(page) {
      const size = parseInt(App.state.config.logview.rowcount, 10);
      const offset = Math.max(0, (page - 1) * size);
      const offsetClause = offset > 0 ? ` | offset ${offset}` : '';
      return `${buildFilterClause()} | sort by (_time) desc${offsetClause} | limit ${size}`;
    },
    buildCountQuery() {
      return `${buildFilterClause()} | stats count() as c`;
    },
    buildHeartbeatsQuery() {
      const timeFilter = buildTimeFilterClause();
      const fallbackField = hostnameFallbackField();
      if (!fallbackField) {
        return `${timeFilter} hostname:* | stats by (hostname) count() as messages, max(_time) as last_seen | sort by (last_seen) desc`;
      }
      return `${timeFilter} (hostname:* OR ${fallbackField}:*) | coalesce(hostname, ${fallbackField}) as hostname | stats by (hostname) count() as messages, max(_time) as last_seen | sort by (last_seen) desc`;
    },
    rawHostname(log) {
      const hostname = String(log && log.hostname || '').trim();
      if (hostname) return hostname;
      const fallbackField = hostnameFallbackField();
      if (fallbackField) {
        const fallback = String(log && log[fallbackField] || '').trim();
        if (fallback) return fallback;
      }
      return '-';
    },
    displayHostname(hostname) {
      return Object.prototype.hasOwnProperty.call(App.state.config.aliases, hostname)
        ? App.state.config.aliases[hostname]
        : hostname;
    },
    aliasesToText() {
      return Object.entries(App.state.config.aliases).map(([raw, friendly]) => `${raw} = ${friendly}`).join('\n');
    },
  };
})();
