// ISOLATED world: user interaction and the boundary to privileged extension APIs.
(function () {
  const utils = window.SDUtils;
  let documentId = '';
  let metadata = null;
  let ready = false;
  let size = 0;
  let busy = false;
  let operation = 0;
  let cancelExport = null;
  let container;
  let button;
  let status;

  function render(state, message) {
    if (!container) return;
    button.dataset.state = state;
    button.disabled = busy || !ready;
    button.textContent = busy ? 'Preparing...' : ready ? 'Download PDF' : 'Waiting for PDF';
    button.setAttribute('aria-busy', String(busy));
    status.textContent = message;
  }

  function cancelOperation() {
    operation++;
    cancelExport?.();
    busy = false;
  }

  function syncPage() {
    const nextId = utils.getDocumentId(location.href);
    if (nextId !== documentId) {
      cancelOperation();
      documentId = nextId;
      metadata = null;
      ready = false;
      size = 0;
      container?.remove();
      container = null;
    }
    if (!documentId || !document.body) return false;
    if (!container) {
      container = document.createElement('div');
      container.className = 'sd-pdf-download';
      button = document.createElement('button');
      button.className = 'sd-pdf-download-btn';
      button.type = 'button';
      button.setAttribute('aria-describedby', 'sd-pdf-download-status');
      status = document.createElement('p');
      status.className = 'sd-pdf-status';
      status.id = 'sd-pdf-download-status';
      status.setAttribute('role', 'status');
      status.setAttribute('aria-live', 'polite');
      status.setAttribute('aria-atomic', 'true');
      container.append(button, status);
      document.body.appendChild(container);
      button.addEventListener('click', download);
      render('waiting', 'Waiting for a complete PDF preview.');
    }
    return true;
  }

  function requestPdfExport(snapshot) {
    const requestId = crypto.randomUUID();
    return new Promise(resolve => {
      const timeout = window.setTimeout(() => finish({ error: 'Export timed out. Reload the document to try again.' }), 15000);
      function finish(result) {
        window.clearTimeout(timeout);
        window.removeEventListener('sd-export-result', handler);
        cancelExport = null;
        resolve(result);
      }
      function handler(event) {
        const detail = utils.parseEventDetail(event.detail, utils.MAX_BASE64_LENGTH + 8192);
        if (!detail || detail.requestId !== requestId) return;
        if (typeof detail.error === 'string') { finish({ error: detail.error.slice(0, 512) }); return; }
        if (detail.documentId !== snapshot.documentId || detail.sourceUrl !== snapshot.sourceUrl ||
            detail.filename !== snapshot.filename || detail.size !== snapshot.size) {
          finish({ error: 'The PDF no longer matches this document. Reload the document to try again.' });
          return;
        }
        const error = utils.validatePdfBase64(detail.base64, detail.size);
        finish(error ? { error } : detail);
      }
      cancelExport = () => finish({ error: 'The document changed.' });
      window.addEventListener('sd-export-result', handler);
      window.dispatchEvent(new CustomEvent('sd-export-pdf', {
        detail: JSON.stringify({ requestId, documentId: snapshot.documentId, sourceUrl: snapshot.sourceUrl })
      }));
    });
  }

  function sendDownloadMessage(payload) {
    return new Promise(resolve => {
      const timeout = window.setTimeout(() => resolve({ error: 'No download confirmation. Check browser downloads before trying again.' }), 30000);
      try {
        chrome.runtime.sendMessage(payload, response => {
          window.clearTimeout(timeout);
          const failure = chrome.runtime.lastError;
          resolve(failure ? { error: failure.message } : response || { error: 'No response from the extension.' });
        });
      } catch (failure) {
        window.clearTimeout(timeout);
        resolve({ error: failure.message || 'Reload the page after updating the extension.' });
      }
    });
  }

  async function download(event) {
    if (!event.isTrusted || !syncPage() || !ready || busy || !metadata) return;
    const attempt = ++operation;
    const snapshot = { ...metadata, size };
    busy = true;
    render('loading', 'Preparing the PDF...');
    try {
      const exported = await requestPdfExport(snapshot);
      if (!syncPage() || attempt !== operation) return;
      if (exported.error) {
        render('error', exported.error);
        return;
      }
      const result = await sendDownloadMessage({ action: 'download', ...snapshot, base64: exported.base64 });
      if (!syncPage() || attempt !== operation) return;
      render(result.started ? 'success' : 'error', result.started ?
        'Download started. Check your browser downloads for completion.' : result.error || 'Could not start the download.');
    } catch {
      if (attempt === operation) render('error', 'Could not prepare the PDF. Reload the document to try again.');
    } finally {
      if (attempt === operation) {
        busy = false;
        if (container) {
          button.disabled = !ready;
          button.textContent = ready ? 'Download PDF' : 'Waiting for PDF';
          button.setAttribute('aria-busy', 'false');
        }
      }
    }
  }

  window.addEventListener('sd-pdf-status', event => {
    const detail = utils.parseEventDetail(event.detail);
    if (!detail || !syncPage() || detail.documentId !== documentId ||
        !['waiting', 'loading', 'ready', 'error'].includes(detail.state)) return;
    const next = utils.getDocumentMetadata({ id: detail.documentId, filename: detail.filename, file_preview: detail.sourceUrl }, location.href);
    if (next?.sourceUrl !== metadata?.sourceUrl || next?.filename !== metadata?.filename) cancelOperation();
    metadata = next;
    size = detail.size;
    ready = Boolean(metadata && detail.state === 'ready' && Number.isSafeInteger(size) && size >= 12 && size <= utils.MAX_PDF_BYTES);
    if (!busy) render(detail.state, detail.state === 'error' ?
      (typeof detail.error === 'string' ? detail.error.slice(0, 512) : 'Could not read the PDF preview.') :
      ready ? 'PDF ready.' : detail.state === 'loading' ? 'Loading the PDF preview...' : 'Waiting for a complete PDF preview.');
  });

  function refresh() {
    syncPage();
    window.dispatchEvent(new CustomEvent('sd-pdf-status-request'));
  }
  window.addEventListener('popstate', refresh);
  window.addEventListener('pageshow', refresh);
  window.addEventListener('pagehide', cancelOperation);
  refresh();
})();
