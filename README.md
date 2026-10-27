<p align="center">
  <img src="assets/readme/hero-motion.gif" width="100%" alt="Studydrive PDF Downloader — a small extension to make life easier. Illustration: preview content appears, followed by the Download PDF button and PDF ready status.">
</p>

# Studydrive PDF Downloader

Keep the PDF preview you are reading on Studydrive. This small Chromium extension adds a **Download PDF** button directly to document pages.

**[Download the extension · ZIP](https://github.com/Skriipt/studydrive-pdfdownloader/releases/latest/download/studydrive-pdfdownloader.zip)** · [Install](#installation) · [Need help?](#troubleshooting)

Chrome **111+** or a compatible Chromium desktop browser · Manifest V3 · No build step

> **The loaded preview, not necessarily the full document.** Your PDF may contain fewer pages than the original. Complete preview responses only, up to **40 MiB**.

## Open. Load. Save.

1. **Open a document.** Sign in to [studydrive.net](https://www.studydrive.net) and open the document you want to save.
2. **Wait for the teal “Download PDF” button.** The extension observes the preview as the viewer loads it and shows capture progress when the size is known.
3. **Click “Download PDF” or press <kbd>Alt</kbd>+<kbd>Shift</kbd>+<kbd>D</kbd>.** The file is saved through your browser. “Download started” means the browser accepted it; check browser downloads for completion.

Hid the controls with ×? Click the extension's toolbar icon to show them again. The icon shows a **PDF** badge when a preview is ready and **!** when something needs attention. The interface is available in English and German.

The extension captures the preview the viewer already loads. It makes no additional document requests and does not fetch missing pages. The animation above illustrates this flow; it is not a site screenshot.

## Installation

1. [Download the ZIP](https://github.com/Skriipt/studydrive-pdfdownloader/releases/latest/download/studydrive-pdfdownloader.zip) and extract it to a permanent folder.
2. Open `chrome://extensions` and enable **Developer mode**.
3. Click **Load unpacked** and select the extracted folder containing `manifest.json`.
4. Reload any Studydrive tabs that were already open. A short local welcome page opens once after installation; you can reopen it from the extension's **Options**.

From source, select the repository’s `extension/` folder instead. No build is needed.

## Small scope. Local processing.

- **No analytics or external transmission.** Preview data stays in your browser and is saved through its downloads API.
- **One API permission: `downloads`.** Content scripts run on `https://www.studydrive.net/*`; controls appear on document pages.
- **No partial-response assembly.** Range responses and missing pages are unsupported.
- **No access-control bypass.** Use only documents you are authorized to download.

## Troubleshooting

**Stuck on “Waiting for preview…”?** Let the preview load. After a few seconds the controls offer **Reload page**; use it if the document is already visible so the extension can observe its request.

**Partial-preview or size error?** The viewer must supply a complete PDF within the 40 MiB limit.

**No download confirmation?** Check browser downloads before trying again; the download may already have started.

**Want the exact error?** Open **Technical details** below the message.

For other errors, site-access checks and capture limitations, see [development & troubleshooting](docs/DEVELOPMENT.md).

## Development

Load `extension/` as an unpacked extension. With Node.js 22+ and Python 3.10+, run:

```bash
node scripts/check.js
```

See [development & release packaging](docs/DEVELOPMENT.md) for the browser fixture and security boundary.

## Also for Studydrive

[Studydrive Adblock Filters](https://github.com/Skriipt/studydrive-adblock-filters) is our separate, optional project for hiding ads, Premium prompts and anti-adblock banners with uBlock Origin or uBO Lite.
