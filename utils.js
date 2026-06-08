(function () {
  const DEFAULT_FILENAME = 'studydrive-document.pdf';
  const MAX_PDF_BYTES = 60 * 1024 * 1024;
  const PDF_HEADER_SCAN_BYTES = 1024;
  const INVALID_FILENAME_CHARS = /[<>:"/\\|?*\u0000-\u001f]+/g;
  const TRAILING_DOTS_OR_SPACES = /[. ]+$/g;

  function decodeEscapedJsonValue(value) {
    if (typeof value !== 'string') return '';

    try {
      return JSON.parse(`"${value.replace(/"/g, '\\"')}"`);
    } catch (error) {
      return value.replace(/\\\//g, '/');
    }
  }

  function sanitizeFilename(value) {
    let filename = typeof value === 'string' ? value.trim() : '';

    filename = filename
      .replace(INVALID_FILENAME_CHARS, '-')
      .replace(/\s+/g, ' ')
      .replace(/-+/g, '-')
      .replace(/-\./g, '.')
      .replace(TRAILING_DOTS_OR_SPACES, '')
      .trim();

    if (!filename) return DEFAULT_FILENAME;

    if (!/\.pdf$/i.test(filename)) {
      filename = filename.replace(/\.[^.]+$/, '');
      filename = `${filename || 'studydrive-document'}.pdf`;
    }

    return filename;
  }

  function extractFilenameFromScripts(scriptText) {
    if (typeof scriptText !== 'string') return DEFAULT_FILENAME;

    const match = /"filename"\s*:\s*"([^"]+)"/.exec(scriptText);
    return sanitizeFilename(match ? decodeEscapedJsonValue(match[1]) : DEFAULT_FILENAME);
  }

  function hasPreviewMarker(scriptText) {
    return typeof scriptText === 'string' && /"file_preview"\s*:\s*"[^"]+"/.test(scriptText);
  }

  function arrayBufferLooksLikePdf(buffer) {
    if (!buffer || typeof buffer.byteLength !== 'number' || buffer.byteLength < 5) return false;

    const view = new Uint8Array(buffer, 0, Math.min(buffer.byteLength, PDF_HEADER_SCAN_BYTES));
    const header = [37, 80, 68, 70, 45]; // %PDF-

    for (let offset = 0; offset <= view.length - header.length; offset += 1) {
      let matches = true;
      for (let i = 0; i < header.length; i += 1) {
        if (view[offset + i] !== header[i]) {
          matches = false;
          break;
        }
      }
      if (matches) return true;
    }

    return false;
  }

  function shouldInspectResponse(url, contentType) {
    const normalizedUrl = typeof url === 'string' ? url : '';
    const normalizedType = typeof contentType === 'string' ? contentType.toLowerCase() : '';

    return (
      normalizedType.includes('application/pdf') ||
      normalizedType.includes('application/octet-stream') ||
      normalizedUrl.includes('file-preview')
    );
  }

  function arrayBufferToBase64(buffer) {
    const bytes = new Uint8Array(buffer);
    const chunks = [];
    const chunkSize = 0x8000;

    for (let i = 0; i < bytes.length; i += chunkSize) {
      let chunk = '';
      const slice = bytes.subarray(i, i + chunkSize);
      for (let j = 0; j < slice.length; j += 1) {
        chunk += String.fromCharCode(slice[j]);
      }
      chunks.push(chunk);
    }

    return btoa(chunks.join(''));
  }

  function parseEventDetail(detail) {
    if (typeof detail !== 'string') return null;

    try {
      const parsed = JSON.parse(detail);
      return parsed && typeof parsed === 'object' ? parsed : null;
    } catch (error) {
      return null;
    }
  }

  function createRequestId() {
    if (globalThis.crypto && typeof globalThis.crypto.randomUUID === 'function') {
      return globalThis.crypto.randomUUID();
    }

    return `${Date.now()}-${Math.random().toString(16).slice(2)}`;
  }

  const api = {
    DEFAULT_FILENAME,
    MAX_PDF_BYTES,
    arrayBufferLooksLikePdf,
    arrayBufferToBase64,
    createRequestId,
    extractFilenameFromScripts,
    hasPreviewMarker,
    parseEventDetail,
    sanitizeFilename,
    shouldInspectResponse
  };

  globalThis.SDUtils = api;
  if (globalThis.window) {
    globalThis.window.SDUtils = api;
  }
})();
