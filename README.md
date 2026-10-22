# Studydrive PDF Downloader

A small Chromium extension that adds a **Download PDF** button to Studydrive documents.

**[Download the latest release (ZIP)](https://github.com/Skriipt/studydrive-pdfdownloader/releases/latest/download/studydrive-pdfdownloader.zip)**

## Install

Requires Chrome 111+ or a compatible Chromium desktop browser.

1. Download the ZIP and extract it to a permanent folder.
2. Open `chrome://extensions` and enable **Developer mode**.
3. Click **Load unpacked** and select the extracted folder containing `manifest.json`.

Installing from a source checkout? Select the `extension/` folder instead.

## Use

1. Log in to www.studydrive.net and open a document.
2. Wait until the PDF is ready.
3. Click **Download PDF**.

## Good to know

- Only the already-loaded preview PDF is downloaded. It may have fewer pages than the original.
- Maximum file size is 40 MiB.
- Access controls are not bypassed. Only download documents you are allowed to download.
- No dependencies, build step, analytics or external data transmission.

## Development

See [docs/DEVELOPMENT.md](docs/DEVELOPMENT.md) for developer, security and troubleshooting details.
