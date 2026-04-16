(function () {
  const App = window.Aerolog;
  const { dom } = App;

  function progressBar() {
    return dom.byId('conn-progress');
  }

  function cancelProgressAnimation() {
    const { polling } = App.state.runtime;
    if (polling.animation) {
      polling.animation.cancel();
      polling.animation = null;
    }
  }

  function resetProgressBar() {
    cancelProgressAnimation();
    const bar = progressBar();
    if (!bar) return;
    bar.style.transform = 'scaleX(0)';
  }

  function playProgressBar(startAt, endAt) {
    const bar = progressBar();
    if (!bar) return;
    cancelProgressAnimation();
    const totalMs = App.derive.pollIntervalMs();
    const remainingMs = Math.max(0, endAt - Date.now());
    if (!totalMs || !remainingMs) {
      bar.style.transform = 'scaleX(1)';
      return;
    }
    const initialScale = Math.max(0, Math.min(1, 1 - (remainingMs / totalMs)));
    bar.style.transform = `scaleX(${initialScale})`;
    App.state.runtime.polling.animation = bar.animate([
      { transform: `scaleX(${initialScale})` },
      { transform: 'scaleX(1)' },
    ], {
      duration: remainingMs,
      easing: 'linear',
      fill: 'forwards',
    });
  }

  function clearScheduledPoll() {
    const { polling } = App.state.runtime;
    polling.scheduleToken += 1;
    if (polling.timerId) {
      clearTimeout(polling.timerId);
      polling.timerId = null;
    }
  }

  function pauseScheduler(clearSchedule = true) {
    if (clearSchedule) clearScheduledPoll();
    App.state.runtime.polling.nextPollAt = 0;
    resetProgressBar();
    App.render.renderConnectionPill();
  }

  function scheduleFrom(startAt) {
    clearScheduledPoll();
    if (!App.derive.canAutoPoll()) {
      pauseScheduler(false);
      return;
    }
    const token = App.state.runtime.polling.scheduleToken;
    const intervalMs = App.derive.pollIntervalMs();
    const nextPollAt = startAt + intervalMs;
    App.state.runtime.polling.nextPollAt = nextPollAt;
    App.render.renderConnectionPill();
    playProgressBar(startAt, nextPollAt);
    const delayMs = Math.max(0, nextPollAt - Date.now());
    App.state.runtime.polling.timerId = setTimeout(async () => {
      App.state.runtime.polling.timerId = null;
      if (token !== App.state.runtime.polling.scheduleToken) return;
      if (!App.derive.canAutoPoll()) return;
      const result = await App.api.dispatchRefresh('poll');
      if (result && result.reason === 'busy') {
        scheduleFrom(Date.now());
      }
    }, delayMs);
  }

  function pauseForNavigation() {
    App.state.runtime.polling.pausedForNavigation = true;
    pauseScheduler();
  }

  function clearNavigationPause() {
    App.state.runtime.polling.pausedForNavigation = false;
  }

  function pauseForExpansion() {
    App.state.runtime.polling.pausedForExpansion = true;
    pauseScheduler();
  }

  function clearExpansionPause() {
    App.state.runtime.polling.pausedForExpansion = false;
  }

  function pauseForServerChange() {
    App.state.runtime.polling.pausedForServerChange = true;
    pauseScheduler();
  }

  function clearServerChangePause() {
    App.state.runtime.polling.pausedForServerChange = false;
  }

  function syncVisualState() {
    const bar = dom.byId('conn-progress');
    if (bar) bar.style.display = App.derive.showProgressBar() ? '' : 'none';
    if (App.derive.canAutoPoll() && App.state.runtime.polling.nextPollAt) {
      playProgressBar(App.state.runtime.polling.nextPollAt - App.derive.pollIntervalMs(), App.state.runtime.polling.nextPollAt);
    } else {
      resetProgressBar();
    }
    App.render.renderConnectionPill();
  }

  function onRefreshDispatched(cause, startAt) {
    if (App.derive.canAutoPoll()) {
      scheduleFrom(startAt);
    } else {
      pauseScheduler();
    }
    App.render.renderConnectionPill();
  }

  function onRefreshCompleted(_cause, result) {
    if (result.aborted) return;
    App.render.renderConnectionPill();
  }

  function applyPolling(cause = 'manual') {
    if (!App.derive.canAutoPoll()) {
      pauseScheduler();
    }
    App.render.renderConnectionPill();
    return App.api.dispatchRefresh(cause);
  }

  if (document && typeof document.addEventListener === 'function') {
    document.addEventListener('visibilitychange', () => {
      if (document.hidden) {
        pauseScheduler();
        return;
      }
      if (App.derive.canAutoPoll()) {
        scheduleFrom(Date.now());
      } else {
        syncVisualState();
      }
    });
  }

  App.polling = {
    applyPolling,
    scheduleFrom,
    clearScheduledPoll,
    pauseForNavigation,
    clearNavigationPause,
    pauseForExpansion,
    clearExpansionPause,
    pauseForServerChange,
    clearServerChangePause,
    syncVisualState,
    onRefreshDispatched,
    onRefreshCompleted,
    resetProgressBar,
  };
})();
