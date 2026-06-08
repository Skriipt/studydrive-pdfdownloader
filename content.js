// Runs in ISOLATED world - handles the StudyDrive-facing UI and extension messaging.
(function () {
  const utils = window.SDUtils;
  const BUTTON_CLASS = 'sd-pdf-download-btn';
  const EXPORT_TIMEOUT_MS = 15000;
  const RESET_DELAY_MS = 2400;

  function getPageScriptText() {
    return Array.from(document.querySelectorAll('script'))
      .map(script => script.textContent || '')
      .join('');
  }

  function isSupportedDocumentPage(scriptText) {
    return location.hostname === 'www.studydrive.net' &&
      location.pathname.includes('/doc/') &&
      utils.hasPreviewMarker(scriptText);
  }

  function setButtonState(button, state, label, disabled) {
    button.dataset.state = state;
    button.disabled = Boolean(disabled);
    button.textContent = label;
    button.setAttribute('aria-label', label);
  }

  function sendDownloadMessage(payload) {
    return new Promise(resolve => {
      chrome.runtime.sendMessage(payload, response => {
        if (chrome.runtime.lastError) {
          resolve({ error: chrome.runtime.lastError.message });
          return;
        }

        resolve(response || { error: 'No response from extension background.' });
      });
    });
  }

  function requestPdfExport() {
    const requestId = utils.createRequestId();

    return new Promise(resolve => {
      const timeoutId = window.setTimeout(() => {
        window.removeEventListener('sd-export-result', handler);
        resolve({ error: 'Export timed out. Reload the page and try again.', requestId });
      }, EXPORT_TIMEOUT_MS);

      function handler(event) {
        const detail = utils.parseEventDetail(event.detail);
        if (!detail || detail.requestId !== requestId) return;

        window.clearTimeout(timeoutId);
        window.removeEventListener('sd-export-result', handler);
        resolve(detail);
      }

      window.addEventListener('sd-export-result', handler);
      window.dispatchEvent(new CustomEvent('sd-export-pdf', {
        detail: JSON.stringify({ requestId })
      }));
    });
  }

  function createButton(filename) {
    const button = document.createElement('button');
    button.className = BUTTON_CLASS;
    button.type = 'button';
    button.setAttribute('aria-live', 'polite');
    button.title = 'Download PDF';
    setButtonState(button, 'ready', 'Download PDF', false);

    button.addEventListener('click', async () => {
      setButtonState(button, 'loading', 'Preparing...', true);
      console.log('[SD] Requesting PDF export');

      const exportResult = await requestPdfExport();
      console.log('[SD] Export result:', exportResult.error || `${exportResult.size} bytes`);

      if (exportResult.error) {
        setButtonState(button, 'error', exportResult.error, false);
        window.setTimeout(() => setButtonState(button, 'ready', 'Download PDF', false), RESET_DELAY_MS + 1200);
        return;
      }

      const downloadResult = await sendDownloadMessage({
        action: 'download',
        base64: exportResult.base64,
        filename
      });

      if (downloadResult.success) {
        setButtonState(button, 'success', 'Downloaded', true);
      } else {
        setButtonState(button, 'error', downloadResult.error || 'Download failed', false);
      }

      window.setTimeout(() => setButtonState(button, 'ready', 'Download PDF', false), RESET_DELAY_MS);
    });

    return button;
  }

  function init() {
    if (document.querySelector(`.${BUTTON_CLASS}`)) return;

    const scriptText = getPageScriptText();
    if (!isSupportedDocumentPage(scriptText)) {
      console.log('[SD] No StudyDrive PDF preview found on this page.');
      return;
    }

    const filename = utils.extractFilenameFromScripts(scriptText);
    console.log('[SD] Filename:', filename);

    document.body.appendChild(createButton(filename));
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init, { once: true });
  } else {
    init();
  }
})();
