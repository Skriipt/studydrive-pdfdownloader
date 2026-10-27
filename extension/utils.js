(function () {
  const DEFAULT_FILENAME = 'studydrive-document.pdf';
  // Base64 adds a third; leave room below Chrome's 64 MiB message limit.
  const MAX_PDF_BYTES = 40 * 1024 * 1024;
  const MAX_BASE64_LENGTH = 4 * Math.ceil(MAX_PDF_BYTES / 3);

  function getDocumentId(value) {
    try {
      const url = new URL(value);
      if (url.origin !== 'https://www.studydrive.net') return '';
      return /^\/[^/]+\/doc\/(?:[^/]+\/)?(\d+)\/?$/.exec(url.pathname)?.[1] || '';
    } catch {
      return '';
    }
  }

  function normalizeSourceUrl(value) {
    if (typeof value !== 'string' || value.length > 4096) return '';
    try {
      const url = new URL(value);
      if (url.protocol !== 'https:' || url.username || url.password || url.port ||
          !(url.hostname === 'studydrive.net' || url.hostname.endsWith('.studydrive.net'))) return '';
      url.hash = '';
      return url.href;
    } catch {
      return '';
    }
  }

  function sanitizeFilename(value) {
    let stem = (typeof value === 'string' ? value : '').normalize('NFC')
      .replace(/[<>:"/\\|?*\u0000-\u001f\u007f\u202a-\u202e\u2066-\u2069]+/g, '-')
      .replace(/\s+/g, ' ').replace(/-+/g, '-').trim()
      .replace(/\.(pdf|docx?|pptx?|xlsx?|txt|rtf)$/i, '')
      .replace(/^\.+|[. ]+$/g, '').trim();
    if (!stem) return DEFAULT_FILENAME;
    if (/^(con|prn|aux|nul|com[1-9]|lpt[1-9])(?:\.|$)/i.test(stem)) stem = '_' + stem;
    // Bound UTF-8 bytes, preserving whole Unicode characters and the extension.
    let shortened = '';
    let length = 0;
    const encoder = new TextEncoder();
    for (const character of stem) {
      length += encoder.encode(character).length;
      if (length > 176) break;
      shortened += character;
    }
    return `${shortened.replace(/[. ]+$/g, '') || 'studydrive-document'}.pdf`;
  }

  function getDocumentMetadata(record, pageUrl) {
    const documentId = getDocumentId(pageUrl);
    if (!documentId || !record || String(record.id) !== documentId) return null;
    const sourceUrl = normalizeSourceUrl(record.file_preview);
    if (!sourceUrl) return null;
    return { documentId, sourceUrl, filename: sanitizeFilename(record.filename) };
  }

  function hasPdfParts(head, tail) {
    return /%PDF-\d\.\d/.test(head) && /%%EOF[\t\n\f\r \0]*$/.test(tail);
  }

  function isCompletePdf(buffer) {
    if (!(buffer instanceof ArrayBuffer) || buffer.byteLength < 12) return false;
    const bytes = new Uint8Array(buffer);
    return hasPdfParts(
      String.fromCharCode(...bytes.subarray(0, 1024)),
      String.fromCharCode(...bytes.subarray(Math.max(0, bytes.length - 1024)))
    );
  }

  function validatePdfBase64(base64, size) {
    if (!Number.isSafeInteger(size) || size < 12 || size > MAX_PDF_BYTES) return 'Invalid PDF size (limit: 40 MiB).';
    if (typeof base64 !== 'string' || base64.length > MAX_BASE64_LENGTH ||
        base64.length !== 4 * Math.ceil(size / 3) || /[^A-Za-z0-9+/=]/.test(base64)) return 'Invalid PDF encoding.';
    const padding = base64.endsWith('==') ? 2 : base64.endsWith('=') ? 1 : 0;
    const firstPadding = base64.indexOf('=');
    if ((firstPadding !== -1 && firstPadding !== base64.length - padding) ||
        base64.length / 4 * 3 - padding !== size) return 'Invalid PDF encoding.';
    try {
      if (btoa(atob(base64.slice(-4))) !== base64.slice(-4) || !hasPdfParts(
        atob(base64.slice(0, 1368)).slice(0, 1024), atob(base64.slice(-1368)).slice(-1024)
      )) return 'The captured data is not a complete PDF.';
    } catch {
      return 'Invalid PDF encoding.';
    }
    return null;
  }

  function arrayBufferToBase64(buffer) {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(reader.result.slice(reader.result.indexOf(',') + 1));
      reader.onerror = () => reject(new Error('Could not encode the PDF. Please try again.'));
      reader.readAsDataURL(new Blob([buffer], { type: 'application/pdf' }));
    });
  }

  // Decimal units, matching their labels; the 40 MiB limit is stated separately.
  function formatBytes(bytes, locale) {
    const [unit, divisor] = bytes >= 1e6 ? ['megabyte', 1e6] : bytes >= 1e3 ? ['kilobyte', 1e3] : ['byte', 1];
    try {
      return new Intl.NumberFormat(locale, { style: 'unit', unit, maximumFractionDigits: 1 }).format(bytes / divisor);
    } catch {
      return `${Math.round(bytes / divisor * 10) / 10} ${{ megabyte: 'MB', kilobyte: 'kB', byte: 'B' }[unit]}`;
    }
  }

  function parseEventDetail(detail, maxLength = 8192) {
    if (typeof detail !== 'string' || detail.length > maxLength) return null;
    try {
      const parsed = JSON.parse(detail);
      return parsed && typeof parsed === 'object' && !Array.isArray(parsed) ? parsed : null;
    } catch {
      return null;
    }
  }

  globalThis.SDUtils = Object.freeze({ MAX_PDF_BYTES, MAX_BASE64_LENGTH, getDocumentId,
    normalizeSourceUrl, getDocumentMetadata, sanitizeFilename, isCompletePdf,
    validatePdfBase64, arrayBufferToBase64, formatBytes, parseEventDetail });
})();
