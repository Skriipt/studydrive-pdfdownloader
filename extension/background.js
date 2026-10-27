importScripts('utils.js');

const BADGES = {
  idle: { text: '', title: 'actionTitle' },
  ready: { text: 'PDF', color: '#008374', title: 'actionTitleReady' },
  error: { text: '!', color: '#b42318', title: 'actionTitleError' }
};

function actionTitle(key) {
  return chrome.i18n.getMessage('actionTitleWithVersion', [chrome.i18n.getMessage(key), chrome.runtime.getManifest().version]);
}

// Badge calls fail harmlessly when the tab has already closed.
function ignore(result) {
  result?.catch?.(() => {});
}

function isTopDocumentFrame(sender) {
  return sender.id === chrome.runtime.id && sender.frameId === 0 && Number.isInteger(sender.tab?.id);
}

function setBadge(tabId, state) {
  const badge = BADGES[state];
  ignore(chrome.action.setBadgeText({ tabId, text: badge.text }));
  if (badge.color) ignore(chrome.action.setBadgeBackgroundColor({ tabId, color: badge.color }));
  ignore(chrome.action.setTitle({ tabId, title: actionTitle(badge.title) }));
}

// Toolbar clicks and the keyboard command are browser-level user input. Forward them only to the
// tab's top frame; the content script accepts these messages only from this extension's worker.
function notifyTab(tab, action, fallback) {
  if (!Number.isInteger(tab?.id)) return;
  try {
    chrome.tabs.sendMessage(tab.id, { action }, { frameId: 0 }, response => {
      if ((chrome.runtime.lastError || !response?.handled) && fallback) fallback();
    });
  } catch {
    fallback?.();
  }
}

chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
  if (!msg) return false;
  const utils = globalThis.SDUtils;
  if (msg.action === 'status') {
    if (isTopDocumentFrame(sender) && Object.hasOwn(BADGES, msg.state) &&
        (msg.state === 'idle' || utils.getDocumentId(sender.url))) setBadge(sender.tab.id, msg.state);
    return false;
  }
  if (msg.action !== 'download') return false;
  const documentId = utils.getDocumentId(sender.url);
  let error = '';
  if (!isTopDocumentFrame(sender) || !documentId || msg.documentId !== documentId) {
    error = 'The download request did not come from the current StudyDrive document.';
  } else if (!utils.normalizeSourceUrl(msg.sourceUrl) || utils.normalizeSourceUrl(msg.sourceUrl) !== msg.sourceUrl) {
    error = 'Invalid preview source.';
  } else if (typeof msg.filename !== 'string' || msg.filename.length > 180 || utils.sanitizeFilename(msg.filename) !== msg.filename) {
    error = 'Invalid PDF filename.';
  } else {
    error = utils.validatePdfBase64(msg.base64, msg.size);
  }
  if (error) {
    sendResponse({ error, errorCode: 'rejected' });
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
      sendResponse(failure ? { error: failure.message, errorCode: 'downloadFailed' } :
        Number.isInteger(downloadId) ? { started: true, downloadId } :
          { error: 'Chrome did not start the download.', errorCode: 'downloadFailed' });
    });
  } catch (failure) {
    sendResponse({ error: failure.message || 'Could not start the download.', errorCode: 'downloadFailed' });
    return false;
  }
  return true;
});

chrome.commands.onCommand.addListener((command, tab) => {
  if (command === 'download-pdf') notifyTab(tab, 'shortcut');
});

// Outside a StudyDrive document, the toolbar icon opens the local help page.
chrome.action.onClicked.addListener(tab => notifyTab(tab, 'reveal', () => chrome.runtime.openOptionsPage()));

chrome.runtime.onInstalled.addListener(({ reason }) => {
  if (reason === 'install') chrome.runtime.openOptionsPage();
});

ignore(chrome.action.setTitle({ title: actionTitle('actionTitle') }));
