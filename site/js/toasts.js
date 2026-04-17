(function () {
  const App = window.Aerolog;
  const { dom } = App;

  const DEFAULT_DURATION_MS = 2000;
  const ERROR_DURATION_MS = 5000;
  const SUCCESS_COLOR = 'var(--green, #7fd962)';
  const ERROR_COLOR = 'var(--accent, #e8433a)';

  function show(message, options = {}) {
    const toast = dom.byId('toast');
    if (!toast) {
      window.alert(message);
      return;
    }
    const kind = options.kind || 'success';
    const isError = kind === 'error';
    const duration = Number.isFinite(options.duration)
      ? options.duration
      : (isError ? ERROR_DURATION_MS : DEFAULT_DURATION_MS);
    const color = isError ? ERROR_COLOR : SUCCESS_COLOR;
    toast.textContent = message;
    toast.classList.remove('error');
    if (isError) toast.classList.add('error');
    toast.style.color = color;
    toast.style.borderColor = color;
    toast.classList.add('show');
    clearTimeout(show.timerId);
    show.timerId = setTimeout(() => toast.classList.remove('show'), duration);
  }

  function success(message, options = {}) {
    show(message, { ...options, kind: 'success' });
  }

  function error(message, options = {}) {
    show(message, { ...options, kind: 'error' });
  }

  App.toasts = {
    DEFAULT_DURATION_MS,
    ERROR_DURATION_MS,
    show,
    success,
    error,
  };
})();
