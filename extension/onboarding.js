// Local help page shown once after installation and as the extension's options page.
(function () {
  const message = (key, substitutions) => chrome.i18n.getMessage(key, substitutions);
  document.documentElement.lang = chrome.i18n.getUILanguage();
  for (const node of document.querySelectorAll('[data-i18n]')) node.textContent = message(node.dataset.i18n);
  // Users can rebind or clear the command; replace the suggested default with the actual binding.
  const step = document.getElementById('shortcut-step');
  const [before, after = ''] = message('onboardingStepDownload', ['\u0000']).split('\u0000');
  const key = document.createElement('kbd');
  key.textContent = 'Alt+Shift+D';
  step.append(before, key, after);
  chrome.commands.getAll(commands => {
    const command = commands.find(item => item.name === 'download-pdf');
    if (command) key.textContent = command.shortcut || message('onboardingShortcutUnset');
  });
  document.getElementById('version').textContent = message('onboardingVersion', [chrome.runtime.getManifest().version]);
})();
