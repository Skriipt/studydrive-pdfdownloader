# Development and troubleshooting

For installation and usage, see the [README](../README.md).

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
| Waiting for preview… | Wait for the preview. After 9 seconds the controls offer **Reload page**; use it if the document is already visible so the extension can observe its request. |
| Only part of the PDF was loaded (**Download unavailable**) | This viewer response is unsupported. The extension does not request missing ranges. |
| PDF is larger than the 40 MiB limit (**Download unavailable**) | This in-memory download method supports at most 40 MiB. |
| Preview was not a complete PDF (**Reload page**) | Reload once. If it persists, the response format may be unsupported. |
| Preparing timed out (**Try again**) or extension was updated or reloaded | Try again; otherwise reload the extension and then the StudyDrive tab. |
| No download confirmation | Check browser downloads before trying again; the request may already have started. |
| No controls on a document page | Confirm the URL is on `www.studydrive.net` with a numeric document ID. Check extension site access and reload the tab. If you hid the controls, click the toolbar icon. |
| Shortcut does nothing | Check or assign it at `chrome://extensions/shortcuts`. It only acts on StudyDrive document tabs. |

Friendly messages are localized (English and German, following the browser language). **Technical details** below an error shows the original technical message. Capture errors are logged in the page's developer console with the `[SD]` prefix. Filenames, PDF contents and signed preview URLs are not logged by the extension.

## Security boundary

The capture script runs in the page's `MAIN` world to observe its requests. Page scripts can alter that environment and the DOM event bridge; request IDs provide correlation, not authentication. Error codes and progress from that world only select whitelisted messages and are displayed as text. The isolated UI lives in a closed shadow root and requires a real mouse/keyboard activation (`isTrusted`); unavailable controls stay focusable with `aria-disabled` and ignore activation.

The keyboard command (default <kbd>Alt</kbd>+<kbd>Shift</kbd>+<kbd>D</kbd>) and toolbar clicks are browser-level user input received by the background worker, which forwards them with `tabs.sendMessage` to the active tab's top frame only. The content script accepts these messages only from this extension without a sender tab, so pages and content scripts cannot trigger them. The resulting download then takes the same validated export and download path as a click. Badge updates from the content script are accepted only from the extension's top frame on a document route, and they change only the badge and title. It validates the export before messaging the background worker, which independently checks the sender, document ID, preview origin, safe filename, size, Base64 encoding and PDF markers before calling the download API. This does not authenticate the contents of a PDF provided by the site.

Only the `downloads` API permission is requested. No additional `host_permissions` are needed for the statically declared content scripts.

## Development

Load `extension/` as an unpacked extension. Development checks require Node.js 22+ and Python 3.10+:

```bash
node scripts/check.js
```

This validates JavaScript syntax, manifest resources, PNG dimensions, regression behavior and the reproducible release archive. To run only the JavaScript regression tests:

```bash
node --test tests/extension.test.js
```

The runtime files live in `extension/`: `inject.js` observes and validates preview responses, `content.js` owns the controls and user interaction, `ui-styles.js` holds the controls' shadow-root CSS (including dark mode, focus, narrow-screen and reduced-motion rules), `background.js` starts validated downloads and handles the badge, command, toolbar click and first-install help page, and `utils.js` shares the small data/validation helpers. `onboarding.html`/`onboarding.js` is the local welcome and options page. User-facing strings live in `_locales/en` and `_locales/de`; the tests require both to have the same keys and placeholders. Capture buffers are discarded on document or preview changes. Fetch copies are read independently and stopped when they exceed the cap; the page retains its original response.

### Browser fixture and release checks

For a local DOM/browser fixture without a StudyDrive login or real downloads:

```bash
python3 -m http.server 8765 --bind 127.0.0.1
```

Open `http://127.0.0.1:8765/tests/browser-fixture.html` (add `?lang=de` for German). It executes the runtime scripts with simulated page state and extension APIs, including slow loading with progress, a missing preview, the keyboard command and toolbar click; the badge appears in the tab title. It does not reproduce Chrome's separate extension worlds.

Before release, also load the actual unpacked extension and verify:

1. Open a document directly, and navigate to one from the StudyDrive homepage.
2. Confirm the observed metadata still uses `sdWindow.document` and that its preview URL matches the viewer request.
3. Download a supported complete preview; check the actual downloaded bytes and filename.
4. Verify waiting, partial-response and error states; errors must remain readable.
5. Navigate between two documents and back during loading/export. No previous document may be downloaded.
6. Check keyboard activation/focus, a narrow viewport, dark mode, German UI and reduced-motion preferences.
7. Interrupt a browser download; the extension must only have claimed that it started.
8. Use <kbd>Alt</kbd>+<kbd>Shift</kbd>+<kbd>D</kbd>, hide the controls and restore them with the toolbar icon, and confirm the badge on ready and error. On a fresh install, the local welcome page opens once.

Automated fixtures do not replace this authenticated extension/browser check.

The compact mockup layout also has an optional headless Chromium check (Node.js 22+):

```bash
CHROME_BIN=/path/to/chromium node tests/browser-layout.mjs
```

It checks actual computed geometry for inline file size, compact pill states and narrow viewports, without a web server or StudyDrive requests. Set `LAYOUT_SCREENSHOT_DIR` to an existing directory to save screenshots.

### Icons

`extension/icons/icon.svg` is the editable source. Open `scripts/generate-icons.html` from the repository root in a browser and select that SVG, or open it through the local server to load the SVG automatically. Save the four generated PNGs in `extension/icons/` as `icon16.png`, `icon32.png`, `icon48.png` and `icon128.png`. The generator uses the browser's SVG renderer and canvas, with no tooling dependencies. The check script verifies their dimensions.

### Packaging and releases

From the repository root:

```bash
node scripts/check.js
python3 scripts/package.py
```

The ZIP is written to `dist/studydrive-pdfdownloader.zip`. It contains `manifest.json` at its root and only the required runtime files, locale messages, the local welcome page and PNG icons. Source SVGs, documentation, tests and scripts are excluded. Archive ordering, timestamps and permissions are fixed so repeat builds with the same toolchain produce identical bytes.

For a release, update `extension/manifest.json` if needed, run the checks, integrate the changes into `main`, and create a matching `v<version>` tag. Publish a GitHub release with `dist/studydrive-pdfdownloader.zip` attached under that exact filename. The README's latest-release link then points to the newest package automatically. Keep the release notes honest about whether the authenticated browser check above has been completed.

The release ZIP requires no build tools to install: extract it to a permanent folder and load the folder containing `manifest.json` through Chrome's extension developer mode.
