importScripts('utils.js');

chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
  if (!msg || msg.action !== 'download') return false;
  const utils = globalThis.SDUtils;
  const documentId = utils.getDocumentId(sender.url);
  let error = '';
  if (sender.id !== chrome.runtime.id || sender.frameId !== 0 || !Number.isInteger(sender.tab?.id) ||
      !documentId || msg.documentId !== documentId) {
    error = 'The download request did not come from the current StudyDrive document.';
  } else if (!utils.normalizeSourceUrl(msg.sourceUrl) || utils.normalizeSourceUrl(msg.sourceUrl) !== msg.sourceUrl) {
    error = 'Invalid preview source.';
  } else if (typeof msg.filename !== 'string' || msg.filename.length > 180 || utils.sanitizeFilename(msg.filename) !== msg.filename) {
    error = 'Invalid PDF filename.';
  } else {
    error = utils.validatePdfBase64(msg.base64, msg.size);
  }
  if (error) {
    sendResponse({ error });
    return false;
  }
  try {
    chrome.downloads.download({
      url: `data:application/pdf;base64,${msg.base64}`,
      filename: msg.filename,
      conflictAction: 'uniquify',
      saveAs: false
    }, downloadId => {
      const failure = chrome.runtime.lastError;
      sendResponse(failure ? { error: failure.message } :
        Number.isInteger(downloadId) ? { started: true, downloadId } : { error: 'Chrome did not start the download.' });
    });
  } catch (failure) {
    sendResponse({ error: failure.message || 'Could not start the download.' });
    return false;
  }
  return true;
});
