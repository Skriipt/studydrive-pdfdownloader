<div align="center">
<img src="extension/icons/icon128.png" width="64" alt="Studydrive PDF Downloader icon">

# Studydrive PDF Downloader
A lightweight Chromium extension that adds a **Download PDF** button to Studydrive documents.

**[Download the latest release (ZIP)](https://github.com/Skriipt/studydrive-pdfdownloader/releases/latest/download/studydrive-pdfdownloader.zip)**

Requires Chrome 111+ or a compatible Chromium desktop browser.
</div>

## Installation

1. Download the ZIP and extract it to a permanent folder.
2. Open `chrome://extensions` and enable **Developer mode**.
3. Choose **Load unpacked** and select the extracted folder containing `manifest.json`. From a source checkout, select `extension/`.

## Usage

Sign in to [studydrive.net](https://www.studydrive.net), open a document, wait until the PDF is ready, then click **Download PDF**.

## Limits and privacy

- Downloads only the already-loaded preview, which may have fewer pages than the original.
- Maximum file size: 40 MiB.
- No access-control bypass; use only documents you are authorized to download.
- No analytics or external transmission.
- No dependencies or build step.

## Development

For technical, security and troubleshooting details, see [docs/DEVELOPMENT.md](docs/DEVELOPMENT.md).

## Related project

[Studydrive Adblock Filters](https://github.com/Skriipt/studydrive-adblock-filters) is a filter list for uBlock Origin and uBO Lite that hides Studydrive ads, Premium prompts and anti-adblock banners. It is a separate project and not required for this extension.
