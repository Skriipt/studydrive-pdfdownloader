# StudyDrive PDF Downloader

Chromium extension that adds a compact PDF download button to StudyDrive document pages.

## Disclaimer

This tool is intended for users who have legitimate download access to documents on StudyDrive, for example through the rewards system or a premium subscription. Only use this extension to download documents you are authorized to download. The extension does not bypass StudyDrive access controls.

## What changed

- Uses Manifest V3 and runs only on `https://www.studydrive.net/*/doc/*`.
- Adds a StudyDrive-styled floating `Download PDF` button.
- Ships a modern icon set in 16, 32, 48 and 128 px.
- Validates captured data before downloading by checking for a PDF header.
- Sanitizes filenames before passing them to the browser download API.
- Handles loading, success, error and timeout states in the button UI.
- Includes dependency-free syntax checks and unit tests for core helpers.

## Download

1. Click the green **Code** button on the repository page.
2. Select **Download ZIP**.
3. Extract the ZIP file to a folder on your computer.

## Installation

1. Open `chrome://extensions` in your browser, or `edge://extensions`, `brave://extensions`, etc.
2. Enable **Developer mode**.
3. Click **Load unpacked**.
4. Select the extracted folder, the one containing `manifest.json`.
5. The extension icon should appear in your toolbar.

## Usage

1. Log in to [studydrive.net](https://www.studydrive.net) with your account.
2. Navigate to a document page, for example `https://www.studydrive.net/.../doc/...`.
3. Wait for the PDF preview to finish rendering.
4. Click the **Download PDF** button in the bottom-right corner.
5. The PDF will be saved to your downloads folder with the document filename.

## Troubleshooting

- **Button does not appear:** Make sure the URL contains `/doc/` and the StudyDrive preview data exists on the page.
- **No PDF captured yet:** Wait for the preview to finish loading, then try again.
- **Export timed out:** Reload the page and wait until the preview is visible before clicking again.
- **PDF too large:** The extension currently protects the browser from very large in-memory downloads.
- **Download failed:** Check browser download permissions and try reloading the extension from `chrome://extensions`.

## Development

The extension has no build step. The source folder can be loaded directly as an unpacked Chromium extension.

See `CONTRIBUTING.md` for the maintenance workflow and `PRIVACY.md` for the privacy policy draft.

Useful checks:

```bash
npm run icons
npm run lint
npm test
npm run check
```

`icon.svg` is the editable source for the extension icon. Run `npm run icons` after changing the icon to regenerate the PNG files used by Chromium.

## Manual QA

Before release, verify:

1. Load the unpacked extension in a Chromium browser.
2. Open a StudyDrive document page on `www.studydrive.net`.
3. Confirm the button appears only on supported document pages.
4. Click before the preview is fully loaded and confirm a useful error appears.
5. Wait for the preview to load, click again and confirm a PDF download starts.
6. Verify duplicate filenames are handled by the browser with a unique suffix.
7. Test a document with special characters in the title and confirm the saved filename is valid.
8. Test mobile-sized viewport placement and keyboard focus on the button.

## Release checklist

1. Run `npm run check`.
2. Increment the version in `manifest.json` and `package.json`.
3. Load the unpacked extension and complete manual QA.
4. Run `npm run icons` if `icon.svg` or `scripts/generate-icons.ps1` changed.
5. Zip only the extension files needed by Chromium: `manifest.json`, `background.js`, `content.js`, `inject.js`, `utils.js`, `styles.css`, `icon16.png`, `icon32.png`, `icon48.png` and `icon128.png`.

## GitHub maintenance

- Keep changes small and reviewable.
- Require `npm run check` before merging changes.
- Keep `README.md` aligned with the actual extension behavior.
- Track StudyDrive page changes as issues when the button or PDF capture stops working.
- Use semantic versioning for releases: patch for fixes, minor for UX or compatibility improvements, major for behavior changes.

## Chrome Web Store preparation

Before submitting to the Chrome Web Store, prepare:

- A clear single-purpose description.
- Screenshots showing the button on a StudyDrive document page.
- A privacy policy that states the extension runs only on StudyDrive document pages and does not sell or transmit user data.
- A tested ZIP package containing only runtime extension files.
- A support URL, preferably the GitHub issues page.
- Store listing text that clearly says users must have legitimate access to the documents they download.
