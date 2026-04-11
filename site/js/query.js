(function () {
  const App = window.Aerolog;
  const { utils } = App;

  const friendlyFieldNames = Object.keys(App.FIELD_REGISTRY).sort((a, b) => b.length - a.length);
  const escapedFriendlyFieldNames = friendlyFieldNames
    .map((name) => name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'))
    .join('|');
  const fieldPattern = new RegExp(
    String.raw`(^|[\s(])(${escapedFriendlyFieldNames})(\s*:(?:=|~)?\s*)("([^"]*)"|(\S+))`,
    'gi'
  );

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
    let lastIndex = 0;
    const isInsideQuotedString = createQuoteTracker(query);
    fieldPattern.lastIndex = 0;
    let match;
    while ((match = fieldPattern.exec(query))) {
      if (isInsideQuotedString(match.index)) {
        continue;
      }
      if (match.index > lastIndex) {
        tokens.push({ type: 'text', value: query.slice(lastIndex, match.index) });
      }
      const quoted = match[5] != null;
      const valueParts = quoted ? { value: match[5], suffix: '' } : splitUnquotedValue(match[6]);
      tokens.push({
        type: 'field',
        lead: match[1] || '',
        alias: match[2],
        operator: (match[3] || ':').replace(/\s+/g, ''),
        quoted,
        value: valueParts.value,
      });
      if (valueParts.suffix) {
        tokens.push({ type: 'text', value: valueParts.suffix });
      }
      lastIndex = fieldPattern.lastIndex;
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
      if (token.spec.kind === 'host') {
        return `${lead}${compileHostClause(token.value, token.operator)}`;
      }
      if (token.spec.kind === 'field_alias') {
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

  function buildFilterClause() {
    const parts = [`_time:${App.state.config.timeRange}`];
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
    buildFilterClause,
    buildPagedQuery(page) {
      const size = parseInt(App.state.config.pageSize, 10);
      const offset = Math.max(0, (page - 1) * size);
      const offsetClause = offset > 0 ? ` | offset ${offset}` : '';
      return `${buildFilterClause()} | sort by (_time) desc${offsetClause} | limit ${size}`;
    },
    buildCountQuery() {
      return `${buildFilterClause()} | stats count() as c`;
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
