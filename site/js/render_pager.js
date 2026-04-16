(function () {
  const App = window.Aerolog;
  const { dom } = App;

  function pageButtonCount() {
    if (App.isMobileMode()) {
      return 0;
    }
    const pager = dom.byId('pager-buttons');
    const widthSource = pager && pager.parentElement ? pager.parentElement : pager;
    const width = widthSource ? widthSource.clientWidth : 0;
    if (!width) return App.PAGE_BUTTONS;
    const gap = 5;
    const containerPadding = 48;
    const navWidth = (4 * 42) + (3 * gap);
    const digitCount = String(App.state.runtime.totalPages).length;
    const pageWidth = Math.max(42, 34 + (digitCount * 10));
    const available = width - containerPadding - navWidth;
    let count = Math.floor(available / (pageWidth + gap));
    count = Math.min(App.PAGE_BUTTONS, Math.max(0, count));
    if (count < 3) return 0;
    return count % 2 === 0 ? count - 1 : count;
  }

  function renderPagerMeta() {
    const currentPage = App.state.runtime.currentPage;
    const totalPages = App.state.runtime.totalPages;
    const logs = Number(App.state.runtime.totalCount).toLocaleString();
    const response = App.renderInternals.responseTimeText();
    const text = App.isMobileMode()
      ? `Page ${currentPage}/${totalPages} - ${logs} logs - ${response}`
      : `Page ${currentPage} of ${totalPages} - ${logs} available logs - ${response} response time`;
    dom.byId('pager-meta').textContent = text;
  }

  function renderPagination() {
    const currentPage = App.state.runtime.currentPage;
    const totalPages = App.state.runtime.totalPages;
    const visiblePageButtons = pageButtonCount();
    renderPagerMeta();
    let start = Math.max(1, currentPage - Math.floor(visiblePageButtons / 2));
    let end = Math.min(totalPages, start + visiblePageButtons - 1);
    if (end - start + 1 < visiblePageButtons) {
      start = Math.max(1, end - visiblePageButtons + 1);
    }
    const buttons = [];
    const make = (page, label, extra = '', attrs = '') => `<button class="pager-btn ${extra}" data-action="go-page" data-page="${page}" ${attrs}>${label}</button>`;
    buttons.push(make(1, '«', '', `${currentPage === 1 ? 'disabled' : ''} title="First page"`));
    buttons.push(make(currentPage - 1, '‹', '', `${currentPage === 1 ? 'disabled' : ''} title="Previous page"`));
    for (let page = start; page <= end; page += 1) {
      buttons.push(make(page, page, page === currentPage ? 'active' : '', `title="Page ${page} of ${totalPages}"`));
    }
    buttons.push(make(currentPage + 1, '›', '', `${currentPage === totalPages ? 'disabled' : ''} title="Next page"`));
    buttons.push(make(totalPages, '»', '', `${currentPage === totalPages ? 'disabled' : ''} title="Last page"`));
    dom.byId('pager-buttons').innerHTML = buttons.join('');
  }

  Object.assign(App.render, {
    pageButtonCount,
    renderPagerMeta,
    renderPagination,
  });
})();
