chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
  if (!msg || msg.action !== 'download') {
    return false;
  }

  if (!msg.base64 || !msg.filename) {
    sendResponse({ error: 'Missing PDF data or filename.' });
    return false;
  }

  console.log('[SD bg] Download request, base64 length:', msg.base64.length, 'filename:', msg.filename);
  const dataUrl = `data:application/pdf;base64,${msg.base64}`;

  chrome.downloads.download({
    url: dataUrl,
    filename: msg.filename,
    conflictAction: 'uniquify',
    saveAs: false
  }, (downloadId) => {
    if (chrome.runtime.lastError) {
      console.error('[SD bg] Download error:', chrome.runtime.lastError.message);
      sendResponse({ error: chrome.runtime.lastError.message });
      return;
    }

    console.log('[SD bg] Download started, id:', downloadId);
    sendResponse({ success: true, downloadId });
  });

  return true;
});
