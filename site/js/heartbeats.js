(function () {
  const App = window.Aerolog;
  const { dom } = App;
  let controller = null;
  const TIME_NS = 1e15;
  const TIME_MS = 1e12;
  const TIME_SECONDS = 1e9;

  function closeHeartbeatsModal() {
    if (controller) {
      controller.abort();
      controller = null;
    }
    App.modals.closeModal('heartbeats-modal');
  }

  function parseLogTime(value) {
    if (value == null || value === '') return null;
    const number = Number(value);
    if (Number.isFinite(number)) {
      if (number > TIME_NS) return new Date(number / 1e6);
      if (number > TIME_MS) return new Date(number);
      if (number > TIME_SECONDS) return new Date(number * 1000);
    }
    const date = new Date(value);
    return Number.isNaN(date.getTime()) ? null : date;
  }

  function formatLastSeen(value) {
    const date = parseLogTime(value);
    if (!date) return { text: '-', title: '' };
    const elapsedSeconds = Math.max(0, Math.floor((Date.now() - date.getTime()) / 1000));
    const title = App.utils.formatTime(date);
    if (elapsedSeconds < 60) return { text: '< 1m', title };
    if (elapsedSeconds < 3600) return { text: `${Math.floor(elapsedSeconds / 60)}m`, title };
    if (elapsedSeconds < 86400) return { text: `${Math.floor(elapsedSeconds / 3600)}h`, title };
    if (elapsedSeconds < 2592000) return { text: `${Math.floor(elapsedSeconds / 86400)}d`, title };
    if (elapsedSeconds < 31536000) return { text: `${Math.floor(elapsedSeconds / 2592000)}mo`, title };
    return { text: `${Math.floor(elapsedSeconds / 31536000)}y`, title };
  }

  function renderHeartbeatsRows(rows) {
    const body = dom.byId('heartbeats-body');
    if (!rows.length) {
      body.innerHTML = '<tr><td colspan="3" class="empty">No host activity in this time range</td></tr>';
      return;
    }
    body.innerHTML = rows.map((row) => {
      const rawHost = row.hostname || '-';
      const displayHost = App.query.displayHostname(rawHost);
      const title = displayHost !== rawHost ? ` title="${App.utils.escapeHtml(rawHost)}"` : '';
      const messages = Number(row.messages || 0);
      const lastSeen = formatLastSeen(row.last_seen);
      const lastSeenTitle = lastSeen.title ? ` title="${App.utils.escapeHtml(lastSeen.title)}"` : '';
      return `
        <tr>
          <td${title}>${App.utils.escapeHtml(displayHost)}</td>
          <td>${Number.isFinite(messages) ? messages.toLocaleString() : App.utils.escapeHtml(row.messages || '-')}</td>
          <td${lastSeenTitle}>${App.utils.escapeHtml(lastSeen.text)}</td>
        </tr>
      `;
    }).join('');
  }

  async function openHeartbeatsModal() {
    App.modals.openModal('heartbeats-modal');
    dom.byId('heartbeats-range').textContent = App.derive.displayTimeRange();
    dom.byId('heartbeats-body').innerHTML = '<tr><td colspan="3" class="empty">Loading heartbeats...</td></tr>';
    if (controller) controller.abort();
    const activeController = new AbortController();
    controller = activeController;
    try {
      const rows = await App.api.runQuery(App.query.buildHeartbeatsQuery(), activeController.signal);
      renderHeartbeatsRows(rows);
    } catch (err) {
      if (err && err.name === 'AbortError') return;
      dom.byId('heartbeats-body').innerHTML = `<tr><td colspan="3" class="error-row">${App.utils.escapeHtml(err.message || 'Heartbeats query failed')}</td></tr>`;
    } finally {
      if (controller === activeController) controller = null;
    }
  }

  App.heartbeats = {
    openHeartbeatsModal,
    closeHeartbeatsModal,
  };
})();
