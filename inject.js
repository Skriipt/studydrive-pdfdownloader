// Runs in MAIN world at document_start
// Intercepts fetch/XHR to capture PDF data as PSPDFKit loads it
(function () {
  const utils = window.SDUtils;
  let capturedPdfBuffer = null;
  let capturedMeta = null;

  function rememberPdf(buffer, meta) {
    if (!utils.arrayBufferLooksLikePdf(buffer)) {
      console.warn('[SD inject] Ignored non-PDF response:', meta.url || meta.contentType || 'unknown source');
      return;
    }

    capturedPdfBuffer = buffer;
    capturedMeta = {
      contentType: meta.contentType || '',
      size: buffer.byteLength,
      source: meta.source || 'unknown',
      url: meta.url || ''
    };

    console.log('[SD inject] Captured PDF:', capturedMeta.size, 'bytes via', capturedMeta.source);
  }

  async function inspectBuffer(buffer, meta) {
    if (!buffer || typeof buffer.byteLength !== 'number' || buffer.byteLength === 0) return;
    rememberPdf(buffer, meta);
  }

  // Intercept fetch
  const origFetch = window.fetch;
  window.fetch = async function (...args) {
    const response = await origFetch.apply(this, args);
    try {
      const url = (typeof args[0] === 'string') ? args[0] : args[0]?.url || '';
      const ct = response.headers.get('content-type') || '';
      if (utils.shouldInspectResponse(url, ct)) {
        const clone = response.clone();
        const buffer = await clone.arrayBuffer();
        await inspectBuffer(buffer, { contentType: ct, source: 'fetch', url });
      }
    } catch (e) {
      // Don't break page if our interception fails
    }
    return response;
  };

  // Intercept XHR
  const origXHROpen = XMLHttpRequest.prototype.open;
  const origXHRSend = XMLHttpRequest.prototype.send;
  XMLHttpRequest.prototype.open = function (method, url, ...rest) {
    this._sd_url = url;
    return origXHROpen.call(this, method, url, ...rest);
  };
  XMLHttpRequest.prototype.send = function (...args) {
    this.addEventListener('load', function () {
      try {
        const ct = this.getResponseHeader('content-type') || '';
        const url = typeof this._sd_url === 'string' ? this._sd_url : '';
        if (utils.shouldInspectResponse(url, ct) && this.response) {
          let buffer;
          if (this.response instanceof ArrayBuffer) {
            buffer = this.response;
          } else if (this.response instanceof Blob) {
            this.response.arrayBuffer().then(buf => {
              inspectBuffer(buf, { contentType: ct, source: 'xhr-blob', url });
            });
            return;
          }
          inspectBuffer(buffer, { contentType: ct, source: 'xhr', url });
        }
      } catch (e) {}
    });
    return origXHRSend.apply(this, args);
  };

  console.log('[SD inject] Fetch/XHR interceptors installed');

  // Listen for export request from content script
  window.addEventListener('sd-export-pdf', (event) => {
    const detail = utils.parseEventDetail(event.detail) || {};
    const requestId = detail.requestId || '';
    console.log('[SD inject] Export requested, have buffer:', !!capturedPdfBuffer, 'size:', capturedPdfBuffer?.byteLength);

    if (!capturedPdfBuffer) {
      window.dispatchEvent(new CustomEvent('sd-export-result', {
        detail: JSON.stringify({
          error: 'No PDF captured yet. Wait for the preview to finish loading.',
          requestId
        })
      }));
      return;
    }

    if (capturedPdfBuffer.byteLength > utils.MAX_PDF_BYTES) {
      window.dispatchEvent(new CustomEvent('sd-export-result', {
        detail: JSON.stringify({
          error: 'The captured PDF is too large for this download method.',
          requestId,
          size: capturedPdfBuffer.byteLength
        })
      }));
      return;
    }

    const base64 = utils.arrayBufferToBase64(capturedPdfBuffer);
    window.dispatchEvent(new CustomEvent('sd-export-result', {
      detail: JSON.stringify({
        base64,
        meta: capturedMeta,
        requestId,
        size: capturedPdfBuffer.byteLength
      })
    }));
  });
})();
