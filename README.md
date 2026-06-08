# StudyDrive PDF Downloader

A small Chromium extension that adds a `Download PDF` button to StudyDrive document pages.

No build step. No dependencies. No analytics.

## Install

1. Download or clone this repository.
2. Open `chrome://extensions`.
3. Enable **Developer mode**.
4. Click **Load unpacked**.
5. Select the project folder.

## Use

1. Log in to [studydrive.net](https://www.studydrive.net).
2. Open a document page.
3. Wait for the preview to load.
4. Click **Download PDF**.

## Scope

- Runs only on `https://www.studydrive.net/*/doc/*`.
- Downloads PDF data already loaded by the document preview.
- Does not send data to external servers.
- Does not bypass StudyDrive access controls.

Only use this for documents you are allowed to download.

## Project Files

- `manifest.json` - extension config
- `background.js` - download handler
- `inject.js` - PDF capture hook
- `content.js` - button logic
- `utils.js` - shared helpers
- `styles.css` - button styling
- `icon*.png` - extension icons
- `icon.svg` - editable icon source

## Release

For a Chrome extension ZIP, include only:

```text
manifest.json
background.js
content.js
inject.js
utils.js
styles.css
icon16.png
icon32.png
icon48.png
icon128.png
```
