// MAIN world: observe only responses belonging to sdWindow.document's preview.
(function () {
  const utils = window.SDUtils;
  let documentId = '';
  let metadata = null;
  let version = 0;
  let routeVersion = 0;
  let buffer = null;
  let activeRead = null;
  let exporting = false;
  let state = 'waiting';
  let error = '';

  function emitStatus() {
    window.dispatchEvent(new CustomEvent('sd-pdf-status', {
      detail: JSON.stringify({ ...metadata, documentId, state, error, size: buffer?.byteLength || 0 })
    }));
  }

  function setStatus(nextState, message = '') {
    state = nextState;
    error = message;
    emitStatus();
  }

  function syncDocument() {
    const nextId = utils.getDocumentId(location.href);
    const next = utils.getDocumentMetadata(window.sdWindow?.document, location.href);
    if (nextId !== documentId || next?.sourceUrl !== metadata?.sourceUrl || next?.filename !== metadata?.filename) {
      if (nextId !== documentId) routeVersion++;
      documentId = nextId;
      metadata = next;
      version++;
      buffer = null;
      if (activeRead) {
        activeRead.cancelled = true;
        activeRead.reader?.cancel().catch(() => console.warn('[SD] Could not cancel the old PDF capture.'));
        activeRead = null;
      }
      setStatus('waiting');
    }
  }

  function requestContext(url) {
    syncDocument();
    return { url, routeVersion, version, sourceUrl: metadata?.sourceUrl || '' };
  }

  function matchesRequest(request) {
    syncDocument();
    return metadata && !buffer && request.routeVersion === routeVersion &&
      (!request.sourceUrl || request.version === version) &&
      utils.normalizeSourceUrl(request.url) === metadata.sourceUrl;
  }

  function requestFailed(request) {
    if (request && matchesRequest(request) && !activeRead) {
      console.warn('[SD] The PDF preview request did not complete.');
      setStatus('error', 'The PDF preview request did not complete. Reload the document to try again.');
    }
  }

  function beginCapture(request, status, headers) {
    if (!matchesRequest(request) || activeRead) return null;
    if (status === 206 || headers('content-range')) {
      setStatus('error', 'Only part of the PDF was loaded. A complete preview response is required.');
      return null;
    }
    if (status !== 200) {
      setStatus('error', `The preview request failed (HTTP ${status}). Reload the document to try again.`);
      return null;
    }
    if (Number(headers('content-length')) > utils.MAX_PDF_BYTES) {
      setStatus('error', 'The PDF exceeds the 40 MiB download limit.');
      return null;
    }
    activeRead = { version, cancelled: false, reader: null };
    setStatus('loading');
    return activeRead;
  }

  function isCurrent(ticket) {
    syncDocument();
    return !ticket.cancelled && ticket.version === version;
  }

  function rememberPdf(bytes, ticket) {
    if (!isCurrent(ticket)) return;
    if (bytes.byteLength > utils.MAX_PDF_BYTES) throw new Error('The PDF exceeds the 40 MiB download limit.');
    if (!utils.isCompletePdf(bytes)) throw new Error('The preview did not contain a complete PDF. Reload the document to try again.');
    buffer = bytes;
    setStatus('ready');
  }

  function captureFailed(ticket, failure) {
    if (isCurrent(ticket)) {
      console.warn('[SD] PDF capture failed:', failure.message);
      setStatus('error', failure.message || 'Could not read the PDF preview. Reload the document to try again.');
    }
  }

  async function readResponse(response, ticket) {
    try {
      if (!response.body) throw new Error('The preview response has no readable body.');
      const reader = response.body.getReader();
      ticket.reader = reader;
      const chunks = [];
      let size = 0;
      try {
        while (isCurrent(ticket)) {
          const { done, value } = await reader.read();
          if (!isCurrent(ticket)) return;
          if (done) break;
          size += value.byteLength;
          if (size > utils.MAX_PDF_BYTES) {
            // Do not await cancellation of a clone: the page may still be reading its branch.
            reader.cancel().catch(() => console.warn('[SD] Could not stop an oversized PDF capture.'));
            throw new Error('The PDF exceeds the 40 MiB download limit.');
          }
          chunks.push(value);
        }
        if (!isCurrent(ticket)) return;
        const bytes = new Uint8Array(size);
        let offset = 0;
        for (const chunk of chunks) { bytes.set(chunk, offset); offset += chunk.byteLength; }
        chunks.length = 0;
        rememberPdf(bytes.buffer, ticket);
      } finally {
        reader.releaseLock();
      }
    } catch (failure) {
      captureFailed(ticket, failure);
    } finally {
      if (activeRead === ticket) activeRead = null;
    }
  }

  const originalFetch = window.fetch;
  window.fetch = async function (...args) {
    const request = requestContext(typeof args[0] === 'string' ? new URL(args[0], location.href).href : String(args[0]?.url || args[0]));
    let response;
    try {
      response = await originalFetch.apply(this, args);
    } catch (failure) {
      requestFailed(request);
      throw failure;
    }
    let ticket;
    try {
      ticket = beginCapture(request, response.status, name => response.headers.get(name));
      if (ticket) void readResponse(response.clone(), ticket);
    } catch (failure) {
      if (ticket) captureFailed(ticket, failure);
      else console.warn('[SD] Could not inspect the PDF preview response.');
      if (activeRead === ticket) activeRead = null;
    }
    return response;
  };

  const requests = new WeakMap();
  const listening = new WeakSet();
  const originalOpen = XMLHttpRequest.prototype.open;
  const originalSend = XMLHttpRequest.prototype.send;
  XMLHttpRequest.prototype.open = function (method, url, ...rest) {
    const result = originalOpen.call(this, method, url, ...rest);
    requests.set(this, { url: new URL(String(url), location.href).href });
    return result;
  };
  XMLHttpRequest.prototype.send = function (...args) {
    const request = requests.get(this);
    if (request) Object.assign(request, requestContext(request.url));
    if (!listening.has(this)) {
      listening.add(this);
      for (const event of ['error', 'abort', 'timeout']) {
        this.addEventListener(event, () => requestFailed(requests.get(this)));
      }
      this.addEventListener('load', () => {
        const current = requests.get(this);
        if (!current) return;
        const ticket = beginCapture(current, this.status, name => this.getResponseHeader(name));
        if (!ticket) return;
        void (async () => {
          try {
            const data = this.response;
            if (data instanceof Blob && data.size > utils.MAX_PDF_BYTES) throw new Error('The PDF exceeds the 40 MiB download limit.');
            const bytes = data instanceof Blob ? await data.arrayBuffer() : data;
            if (!(bytes instanceof ArrayBuffer)) throw new Error('The preview used an unsupported response format.');
            rememberPdf(bytes, ticket);
          } catch (failure) {
            captureFailed(ticket, failure);
          } finally {
            if (activeRead === ticket) activeRead = null;
          }
        })();
      });
    }
    return originalSend.apply(this, args);
  };

  window.addEventListener('sd-export-pdf', async event => {
    const detail = utils.parseEventDetail(event.detail);
    if (!detail || typeof detail.requestId !== 'string' || detail.requestId.length > 80) return;
    syncDocument();
    const snapshot = { ...metadata, version };
    let result;
    let ownsExport = false;
    try {
      if (!metadata || detail.documentId !== documentId || detail.sourceUrl !== metadata.sourceUrl) throw new Error('The document changed. Please try again.');
      if (!buffer) throw new Error(error || 'Wait for a complete PDF preview to load.');
      if (exporting) throw new Error('A PDF export is already in progress.');
      exporting = true;
      ownsExport = true;
      const size = buffer.byteLength;
      const base64 = await utils.arrayBufferToBase64(buffer);
      syncDocument();
      if (snapshot.version !== version) throw new Error('The document changed during export.');
      result = { documentId, sourceUrl: metadata.sourceUrl, filename: metadata.filename, base64, size };
    } catch (failure) {
      result = { error: failure.message || 'Could not prepare the PDF. Please try again.' };
    } finally {
      if (ownsExport) exporting = false;
    }
    window.dispatchEvent(new CustomEvent('sd-export-result', {
      detail: JSON.stringify({ ...result, requestId: detail.requestId })
    }));
  });

  for (const method of ['pushState', 'replaceState']) {
    const original = history[method];
    history[method] = function (...args) {
      const result = original.apply(this, args);
      syncDocument();
      return result;
    };
  }
  window.addEventListener('popstate', syncDocument);
  window.addEventListener('pageshow', syncDocument);
  window.addEventListener('sd-pdf-status-request', () => { syncDocument(); emitStatus(); });
  // StudyDrive can populate or replace sdWindow.document after the DOM has loaded.
  window.setInterval(syncDocument, 500);
  syncDocument();
})();
