# StudyDrive PDF Downloader

A small Chromium extension that saves PDF data already loaded by a StudyDrive document preview.

No build step. No dependencies. No analytics.

## Install and use

Requires Chrome 111 or newer, or a compatible Chromium browser with extension support.

1. Download or clone this repository and extract it if necessary.
2. Open `chrome://extensions`, enable **Developer mode**, and choose **Load unpacked**.
3. Select the project folder containing `manifest.json`.
4. Log in to [studydrive.net](https://www.studydrive.net) and open a document.
5. Wait until the status says **PDF ready**, then click **Download PDF**.
6. The status confirms **Download started**. Check your browser downloads for completion or interruption.

After updating or reloading the extension, reload any open StudyDrive tabs as well. There is no toolbar action; the controls appear on document pages.

## Scope and limits

- Scripts run on `https://www.studydrive.net/*` so navigation from the homepage to a document also works without reloading the tab. Controls and capture are restricted to document routes.
- The current document is identified by its numeric URL ID and `sdWindow.document.id`. The filename and exact preview URL come from that same record; unrelated PDF responses are ignored.
- Only complete HTTP 200 preview responses up to **40 MiB** are exported. Partial/range responses (`206` or `Content-Range`) are rejected, not assembled or fetched again. PDF header and end markers are sanity checks, not a full PDF parser.
- The saved file is the **loaded preview PDF**, which may have fewer pages than the original document.
- Capture covers `fetch` and binary/blob XHR responses in the top-level page. Requests made inside workers or separate frames are not captured.
- The extension makes no additional document requests, bypasses no access controls, and sends no data to external servers. Only use it for documents you are allowed to download.
- Chromium's extension messaging limit is [64 MiB](https://developer.chrome.com/docs/extensions/develop/concepts/messaging#message-size-limits). The 40 MiB raw-file cap allows for Base64 expansion and message fields.

## Troubleshooting

| Status or problem | What to do |
| --- | --- |
| Waiting for PDF | Wait for the preview. If it is already visible, reload the document so the extension can observe its request. |
| Only part of the PDF was loaded | This viewer response is unsupported. The extension does not request missing ranges. |
| PDF exceeds the limit | This in-memory download method supports at most 40 MiB. |
| Preview did not contain a complete PDF | Reload once. If it persists, the response format may be unsupported. |
| Export timed out or extension context invalidated | Reload the extension and then the StudyDrive tab. |
| No download confirmation | Check browser downloads before trying again; the request may already have started. |
| No controls on a document page | Confirm the URL is on `www.studydrive.net` with a numeric document ID. Check extension site access and reload the tab. |

Capture errors are logged in the page's developer console with the `[SD]` prefix. Filenames, PDF contents and signed preview URLs are not logged by the extension.

## Security boundary

The capture script runs in the page's `MAIN` world to observe its requests. Page scripts can alter that environment and the DOM event bridge; request IDs provide correlation, not authentication. The isolated UI requires a real mouse/keyboard activation. It validates the export before messaging the background worker, which independently checks the sender, document ID, preview origin, safe filename, size, Base64 encoding and PDF markers before calling the download API. This does not authenticate the contents of a PDF provided by the site.

Only the `downloads` API permission is requested. No additional `host_permissions` are needed for the statically declared content scripts.

## Development

Load this folder directly as an unpacked extension. For checks, use Node.js 22 or newer:

```bash
node scripts/check.js
```

This validates JavaScript syntax, manifest resources, PNG dimensions and the dependency-free regression tests. To run only tests:

```bash
node --test tests/extension.test.js
```

Runtime responsibilities stay in four files: `inject.js` observes and validates preview responses, `content.js` owns the controls and user interaction, `background.js` starts validated downloads, and `utils.js` shares the small data/validation helpers. Capture buffers are discarded on document or preview changes. Fetch copies are read independently and stopped when they exceed the cap; the page retains its original response.

### Browser fixture and release checks

For a local DOM/browser fixture without a StudyDrive login or real downloads:

```bash
python3 -m http.server 8765 --bind 127.0.0.1
```

Open `http://127.0.0.1:8765/tests/browser-fixture.html`. It executes the runtime scripts with simulated page state and extension APIs; it does not reproduce Chrome's separate extension worlds.

Before release, also load the actual unpacked extension and verify:

1. Open a document directly, and navigate to one from the StudyDrive homepage.
2. Confirm the observed metadata still uses `sdWindow.document` and that its preview URL matches the viewer request.
3. Download a supported complete preview; check the actual downloaded bytes and filename.
4. Verify waiting, partial-response and error states; errors must remain readable.
5. Navigate between two documents and back during loading/export. No previous document may be downloaded.
6. Check keyboard activation/focus, a narrow viewport, and reduced-motion preferences.
7. Interrupt a browser download; the extension must only have claimed that it started.

Automated fixtures do not replace this authenticated extension/browser check.

### Icons

`icon.svg` is the editable source. Open `scripts/generate-icons.html` in a browser and select that SVG, or open it through the local server to load the SVG automatically. Save the four generated PNGs in the project root as `icon16.png`, `icon32.png`, `icon48.png` and `icon128.png`. The generator uses the browser's SVG renderer and canvas, with no tooling dependencies. The check script verifies their dimensions.

### Packaging

Increment `manifest.json` for releases and include only `manifest.json`, `background.js`, `content.js`, `inject.js`, `utils.js`, `styles.css`, and the four PNG icons in the extension ZIP. Development scripts, tests and this README are not required at runtime.
