# StudyDrive PDF Downloader

Chromium extension that adds a simple `Download PDF` button to StudyDrive document pages.

The extension is intentionally small: no build step, no dependencies, no analytics and no external servers.

## Important

Only use this extension for documents you are authorized to download. The extension does not bypass StudyDrive access controls.

## Installation

1. Download or clone this repository.
2. Open `chrome://extensions` in Chrome or another Chromium-based browser.
3. Enable **Developer mode**.
4. Click **Load unpacked**.
5. Select this project folder.

## Usage

1. Log in to [studydrive.net](https://www.studydrive.net).
2. Open a StudyDrive document page.
3. Wait until the document preview has loaded.
4. Click **Download PDF** in the bottom-right corner.

## Files

- `manifest.json` - Chrome extension manifest.
- `background.js` - Starts the browser download.
- `inject.js` - Captures PDF data loaded by the StudyDrive preview.
- `content.js` - Adds and controls the download button.
- `utils.js` - Shared helper functions.
- `styles.css` - Button styling.
- `icon*.png` - Extension icons.
- `icon.svg` - Editable icon source.
- `PRIVACY.md` - Privacy policy draft for GitHub and Chrome Web Store.

## Manual QA

Before publishing a new version:

1. Load the extension unpacked.
2. Open a StudyDrive document page on `www.studydrive.net`.
3. Confirm the button appears only on document pages.
4. Confirm the button matches the page visually and does not cover important UI.
5. Download a PDF and confirm the saved file opens correctly.
6. Test a title with special characters and confirm the filename is valid.

## Chrome Web Store

For a store upload, zip only the runtime files:

- `manifest.json`
- `background.js`
- `content.js`
- `inject.js`
- `utils.js`
- `styles.css`
- `icon16.png`
- `icon32.png`
- `icon48.png`
- `icon128.png`

Also prepare screenshots, a support URL and the privacy text from `PRIVACY.md`.
