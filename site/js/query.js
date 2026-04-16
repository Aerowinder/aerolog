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
    let insideQuote = false;
    let escaped = false;

    // Forward-only tracker; callers must ask about monotonically increasing indexes.
    return function isInsideQuotedString(targetIndex) {
      for (; index < targetIndex; index += 1) {
        const char = query[index];
        if (escaped) {
          escaped = false;
        } else if (char === '\\') {
          escaped = true;
        } else if (char === '"') {
          insideQuote = !insideQuote;
        }
      }
      return insideQuote;
    };
  }

  function isTokenLead(char) {
    return char === '' || /[\s(,)]/.test(char);
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
    if (query[index] !== '"') return null;
    let cursor = index + 1;
    let escaped = false;
    let value = '';
    for (; cursor < query.length; cursor += 1) {
      const char = query[cursor];
      if (escaped) {
        value += char;
        escaped = false;
      } else if (char === '\\') {
        escaped = true;
        value += char;
      } else if (char === '"') {
        return { quoted: true, value, suffix: '', cursor: cursor + 1 };
      } else {
        value += char;
      }
    }
    return null;
  }

  function readUnquotedValue(query, index) {
    let cursor = index;
    while (cursor < query.length && !/\s/.test(query[cursor])) cursor += 1;
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
    if (query[operatorParts.cursor] === '"' && !readQuotedValue(query, operatorParts.cursor)) return null;
    const valueParts = readQuotedValue(query, operatorParts.cursor) || readUnquotedValue(query, operatorParts.cursor);
    if (!valueParts) return null;
    return {
      token: {
        type: 'field',
        lead,
        alias: query.slice(aliasIndex, afterAlias),
        operator: operatorParts.operator,
        quoted: valueParts.quoted,
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
    return `hostname:=${utils.quoteLogsQlValue(resolveExactHost(value))}`;
  }

  function compileHostClause(value, operator = ':') {
    const trimmed = String(value || '').trim();
    if (!trimmed) return '';
    if (operator === ':=') return buildExactHostnameClause(trimmed);
    if (operator === ':~') return `hostname:~${utils.quoteLogsQlValue(trimmed)}`;
    if (!utils.hasWildcard(trimmed)) return buildExactHostnameClause(trimmed);

    const clauses = [`hostname:~${utils.quoteLogsQlValue(utils.wildcardToRegex(trimmed))}`];
    for (const raw of getAliasWildcardMatches(trimmed)) {
      const exactClause = buildExactHostnameClause(raw);
      if (!clauses.includes(exactClause)) clauses.push(exactClause);
    }
    return clauses.length === 1 ? clauses[0] : `(${clauses.join(' OR ')})`;
  }

  function compileFieldClause(target, value, operator = ':', wasQuoted = false) {
    const trimmed = String(value || '').trim();
    if (!trimmed) return '';
    const formatExact = (raw) => {
      const needsQuotes = wasQuoted || /[\s"*]/.test(raw) || raw === '';
      return needsQuotes ? utils.quoteLogsQlValue(raw) : raw;
    };
    if (operator === ':=') {
      return `${target}:=${formatExact(trimmed)}`;
    }
    if (operator === ':~') {
      return `${target}:~${utils.quoteLogsQlValue(trimmed)}`;
    }
    if (utils.hasWildcard(trimmed)) {
      return `${target}:~${utils.quoteLogsQlValue(utils.wildcardToRegex(trimmed))}`;
    }
    return `${target}:=${formatExact(trimmed)}`;
  }

  function compileFieldAliasClause(target, value, operator = ':', wasQuoted = false) {
    const trimmed = String(value || '').trim();
    if (!trimmed) return '';
    const renderedValue = wasQuoted ? utils.quoteLogsQlValue(trimmed) : trimmed;
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
        return `${lead}${compileHostClause(token.value, token.operator)}`;
      }
      if (token.spec.kind === App.FIELD_KINDS.FIELD_ALIAS) {
        return `${lead}${compileFieldAliasClause(token.spec.target, token.value, token.operator, token.quoted)}`;
      }
      return `${lead}${compileFieldClause(token.spec.target, token.value, token.operator, token.quoted)}`;
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
    if (rewritten) parts.push(rewritten);
    return parts.join(' ');
  }

  App.query = {
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
      return `${buildTimeFilterClause()} hostname:* | stats by (hostname) count() as messages, max(_time) as last_seen | sort by (last_seen) desc`;
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
