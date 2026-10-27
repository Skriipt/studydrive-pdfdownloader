// ISOLATED world: user interaction and the boundary to privileged extension APIs.
(function () {
  const utils = window.SDUtils;
  const WAITING_HINT_MS = 9000;
  const SUCCESS_MS = 4000;
  // Capture errors a reload may fix. Other capture errors are final for this preview.
  const RELOADABLE = new Set(['requestFailed', 'http', 'incomplete', 'readFailed']);
  const ERROR_MESSAGES = {
    requestFailed: 'errorRequestFailed', http: 'errorHttp', partial: 'errorPartial', tooLarge: 'errorTooLarge',
    incomplete: 'errorIncomplete', unsupported: 'errorUnsupported', readFailed: 'errorReadFailed',
    changed: 'errorChanged', busy: 'errorBusy', notReady: 'errorNotReady', timeout: 'errorTimeout',
    invalidData: 'errorInvalidData', noConfirmation: 'errorNoConfirmation',
    extensionUnavailable: 'errorExtensionUnavailable', rejected: 'errorRejected', downloadFailed: 'errorDownloadFailed'
  };
  const locale = attempt(() => chrome.i18n.getUILanguage(), undefined);
  let documentId = '';
  let metadata = null;
  let capture = 'waiting';
  let captureError = null;
  let ready = false;
  let size = 0;
  let progress = { received: 0, total: 0 };
  // `busy` covers preparing and the brief success state, so repeated activations are ignored.
  let busy = false;
  let outcome = null;
  let operation = 0;
  let cancelExport = null;
  let waitingTimer = 0;
  let waitingLong = false;
  let successTimer = 0;
  let dismissed = false;
  let reportedBadge = '';
  let ui = null;

  function attempt(fn, fallback) {
    try { return fn(); } catch { return fallback; }
  }

  function t(key, substitutions) {
    return attempt(() => chrome.i18n.getMessage(key, substitutions), '') || key;
  }

  // Codes come from the page world or the background; only known codes select a message.
  function errorInfo(code, detail, fallback = 'readFailed') {
    return { code: Object.hasOwn(ERROR_MESSAGES, code) ? code : fallback,
      detail: typeof detail === 'string' ? detail.slice(0, 512) : '' };
  }

  function count(value) {
    return Number.isSafeInteger(value) && value > 0 ? value : 0;
  }

  function element(tag, className) {
    const node = document.createElement(tag);
    if (className) node.className = className;
    return node;
  }

  function trusted(handler) {
    return event => event.isTrusted ? handler() : undefined;
  }

  function createUi() {
    const host = element('sd-pdf-downloader');
    const root = host.attachShadow({ mode: 'closed' });
    try {
      const sheet = new CSSStyleSheet();
      sheet.replaceSync(window.SDStyles);
      root.adoptedStyleSheets = [sheet];
    } catch {
      const style = element('style');
      style.textContent = window.SDStyles;
      root.append(style);
    }
    const card = element('div', 'card');
    card.setAttribute('role', 'region');
    card.setAttribute('aria-label', t('extName'));
    const row = element('div', 'row');
    const primary = element('button', 'primary');
    primary.type = 'button';
    primary.setAttribute('aria-describedby', 'sd-status sd-meta');
    const hide = element('button', 'hide');
    hide.type = 'button';
    hide.textContent = '×';
    hide.title = t('hideTitle');
    hide.setAttribute('aria-label', t('hideLabel'));
    row.append(primary, hide);
    const status = element('p', 'status');
    status.id = 'sd-status';
    status.setAttribute('role', 'status');
    status.setAttribute('aria-live', 'polite');
    status.setAttribute('aria-atomic', 'true');
    const bar = element('progress');
    bar.setAttribute('aria-label', t('progressLabel'));
    const meta = element('p', 'meta');
    meta.id = 'sd-meta';
    const secondary = element('button', 'secondary');
    secondary.type = 'button';
    secondary.textContent = t('primaryReload');
    const details = element('details');
    const summary = element('summary');
    summary.textContent = t('technicalDetails');
    const code = element('code');
    details.append(summary, code);
    card.append(row, status, bar, meta, secondary, details);
    root.append(card);
    // Disabled-looking controls stay focusable; activation is guarded instead.
    primary.addEventListener('click', trusted(activatePrimary));
    secondary.addEventListener('click', trusted(reloadPage));
    hide.addEventListener('click', trusted(() => { dismissed = true; render(); }));
    document.body.appendChild(host);
    return { host, card, primary, status, bar, meta, secondary, details, code };
  }

  function describe() {
    if (busy && outcome === 'success') return { tone: 'success', label: t('primarySuccess'), status: t('statusSuccess') };
    if (busy) return { tone: 'busy', label: t('primaryPreparing'), status: t('statusPreparing') };
    if (outcome && ready) {
      return { tone: 'error', label: t('primaryRetry'), action: 'download', status: t(ERROR_MESSAGES[outcome.code]), detail: outcome.detail };
    }
    if (capture === 'error') {
      const reload = RELOADABLE.has(captureError.code);
      return { tone: 'error', label: t(reload ? 'primaryReload' : 'primaryUnavailable'), action: reload ? 'reload' : '',
        status: t(ERROR_MESSAGES[captureError.code]), detail: captureError.detail };
    }
    if (ready) {
      return { tone: 'ready', label: t('primaryDownload'), action: 'download', status: utils.formatBytes(size, locale) };
    }
    if (capture === 'loading') return { tone: 'busy', label: t('primaryLoading'), status: t('statusLoading'), progress: true };
    return { tone: 'waiting', label: t('primaryWaiting'), status: t(waitingLong ? 'statusWaitingLong' : 'statusWaiting'),
      reloadHint: waitingLong };
  }

  function setText(node, text) {
    if (node.textContent !== text) node.textContent = text;
  }

  function describeProgress() {
    const { received, total } = progress;
    if (!received) return '';
    // Content-Length may describe compressed bytes; never show a percentage beyond it.
    if (total && received <= total) {
      const percent = attempt(() => new Intl.NumberFormat(locale, { style: 'percent' }).format(received / total),
        `${Math.floor(received / total * 100)}%`);
      return t('progressKnown', [percent, utils.formatBytes(received, locale), utils.formatBytes(total, locale)]);
    }
    return t('progressUnknown', [utils.formatBytes(received, locale)]);
  }

  function scheduleWaitingHint() {
    if (ui && capture === 'waiting') {
      if (!waitingTimer && !waitingLong) {
        waitingTimer = window.setTimeout(() => { waitingTimer = 0; waitingLong = true; render(); }, WAITING_HINT_MS);
      }
      return;
    }
    window.clearTimeout(waitingTimer);
    waitingTimer = 0;
    waitingLong = false;
  }

  function render() {
    scheduleWaitingHint();
    reportBadge(!documentId ? 'idle' : outcome?.code || capture === 'error' ? 'error' : ready ? 'ready' : 'idle');
    if (!ui) return;
    const view = describe();
    ui.host.hidden = dismissed;
    ui.card.dataset.state = view.tone;
    ui.primary.dataset.action = view.action || '';
    ui.primary.setAttribute('aria-disabled', String(!view.action));
    ui.primary.setAttribute('aria-busy', String(view.tone === 'busy'));
    setText(ui.primary, view.label);
    setText(ui.status, view.status);
    const progressText = view.progress ? describeProgress() : '';
    setText(ui.meta, progressText);
    ui.bar.hidden = !view.progress;
    if (view.progress && progress.total && progress.received <= progress.total) {
      ui.bar.max = progress.total;
      ui.bar.value = progress.received;
    } else {
      ui.bar.removeAttribute('value');
    }
    ui.secondary.hidden = !view.reloadHint;
    ui.details.hidden = !view.detail;
    setText(ui.code, view.detail || '');
  }

  function reportBadge(state) {
    if (state === reportedBadge) return;
    reportedBadge = state;
    try {
      chrome.runtime.sendMessage({ action: 'status', state }, () => void chrome.runtime.lastError);
    } catch {
      // The extension was reloaded; the page shows its own state without the badge.
    }
  }

  function clearTimers() {
    window.clearTimeout(waitingTimer);
    window.clearTimeout(successTimer);
    waitingTimer = successTimer = 0;
    waitingLong = false;
  }

  function cancelOperation() {
    operation++;
    cancelExport?.();
    window.clearTimeout(successTimer);
    successTimer = 0;
    busy = false;
    outcome = null;
  }

  function syncPage() {
    const nextId = utils.getDocumentId(location.href);
    if (nextId !== documentId) {
      cancelOperation();
      clearTimers();
      documentId = nextId;
      metadata = null;
      capture = 'waiting';
      captureError = null;
      ready = false;
      size = 0;
      progress = { received: 0, total: 0 };
      ui?.host.remove();
      ui = null;
      if (!documentId) render();
    }
    if (!documentId || !document.body) return false;
    if (!ui) {
      ui = createUi();
      render();
    }
    return true;
  }

  function requestPdfExport(snapshot) {
    const requestId = crypto.randomUUID();
    return new Promise(resolve => {
      const timeout = window.setTimeout(() => finish(errorInfo('timeout', 'Export timed out.')), 15000);
      function finish(result) {
        window.clearTimeout(timeout);
        window.removeEventListener('sd-export-result', handler);
        cancelExport = null;
        resolve(result);
      }
      function handler(event) {
        const detail = utils.parseEventDetail(event.detail, utils.MAX_BASE64_LENGTH + 8192);
        if (!detail || detail.requestId !== requestId) return;
        if (typeof detail.error === 'string') { finish(errorInfo(detail.errorCode, detail.error)); return; }
        if (detail.documentId !== snapshot.documentId || detail.sourceUrl !== snapshot.sourceUrl ||
            detail.filename !== snapshot.filename || detail.size !== snapshot.size) {
          finish(errorInfo('changed', 'The exported PDF no longer matches this document.'));
          return;
        }
        const error = utils.validatePdfBase64(detail.base64, detail.size);
        finish(error ? errorInfo('invalidData', error) : detail);
      }
      cancelExport = () => finish(errorInfo('changed', 'The document changed.'));
      window.addEventListener('sd-export-result', handler);
      window.dispatchEvent(new CustomEvent('sd-export-pdf', {
        detail: JSON.stringify({ requestId, documentId: snapshot.documentId, sourceUrl: snapshot.sourceUrl })
      }));
    });
  }

  function sendDownloadMessage(payload) {
    return new Promise(resolve => {
      const timeout = window.setTimeout(() => resolve(errorInfo('noConfirmation', 'No download confirmation within 30 seconds.')), 30000);
      try {
        chrome.runtime.sendMessage(payload, response => {
          window.clearTimeout(timeout);
          const failure = chrome.runtime.lastError;
          if (failure) resolve(errorInfo('extensionUnavailable', failure.message));
          else if (response?.started) resolve(response);
          else resolve(errorInfo(response?.errorCode, response?.error || 'No response from the extension.', 'downloadFailed'));
        });
      } catch (failure) {
        window.clearTimeout(timeout);
        resolve(errorInfo('extensionUnavailable', failure.message));
      }
    });
  }

  async function exportAndDownload(snapshot, attempt) {
    const exported = await requestPdfExport(snapshot);
    if (!syncPage() || attempt !== operation) return null;
    if (exported.code) return exported;
    const result = await sendDownloadMessage({ action: 'download', ...snapshot, base64: exported.base64 });
    return !syncPage() || attempt !== operation ? null : result;
  }

  // Callers must only reach this from a trusted click or the extension's own command message.
  async function startDownload() {
    if (!syncPage() || !ready || busy || !metadata) return;
    const attempt = ++operation;
    const snapshot = { ...metadata, size };
    busy = true;
    outcome = null;
    render();
    let result;
    try {
      result = await exportAndDownload(snapshot, attempt);
    } catch {
      result = attempt === operation ? errorInfo('readFailed', 'Could not prepare the PDF.') : null;
    }
    if (!result || attempt !== operation) return;
    if (result.started) {
      outcome = 'success';
      successTimer = window.setTimeout(() => {
        successTimer = 0;
        busy = false;
        outcome = null;
        render();
      }, SUCCESS_MS);
    } else {
      busy = false;
      outcome = result;
    }
    render();
  }

  function activatePrimary() {
    const action = ui?.primary.dataset.action;
    if (action === 'reload') return reloadPage();
    if (action === 'download') return startDownload();
  }

  function reloadPage() {
    location.reload();
  }

  function reveal() {
    if (!syncPage()) return false;
    dismissed = false;
    render();
    ui.primary.focus();
    return true;
  }

  window.addEventListener('sd-pdf-status', event => {
    const detail = utils.parseEventDetail(event.detail);
    if (!detail || !syncPage() || detail.documentId !== documentId ||
        !['waiting', 'loading', 'ready', 'error'].includes(detail.state)) return;
    const next = utils.getDocumentMetadata({ id: detail.documentId, filename: detail.filename, file_preview: detail.sourceUrl }, location.href);
    if (next?.sourceUrl !== metadata?.sourceUrl || next?.filename !== metadata?.filename) cancelOperation();
    metadata = next;
    size = detail.size;
    capture = detail.state;
    captureError = capture === 'error' ? errorInfo(detail.errorCode, detail.error) : null;
    progress = capture === 'loading' ? { received: count(detail.received), total: count(detail.total) } : { received: 0, total: 0 };
    ready = Boolean(metadata && detail.state === 'ready' && Number.isSafeInteger(size) && size >= 12 && size <= utils.MAX_PDF_BYTES);
    render();
  });

  // Only this extension's background (no sender tab) can ask to reveal or download. It sends
  // these for a toolbar click or the registered keyboard command, both real user input.
  chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
    if (sender?.id !== chrome.runtime.id || sender.tab || !message || !['reveal', 'shortcut'].includes(message.action)) return false;
    const handled = reveal();
    if (handled && message.action === 'shortcut') void startDownload();
    sendResponse({ handled });
    return false;
  });

  function refresh() {
    syncPage();
    window.dispatchEvent(new CustomEvent('sd-pdf-status-request'));
  }
  window.addEventListener('popstate', refresh);
  window.addEventListener('pageshow', () => { reportedBadge = ''; refresh(); render(); });
  window.addEventListener('pagehide', () => {
    cancelOperation();
    clearTimers();
    reportBadge('idle');
  });
  refresh();
})();
