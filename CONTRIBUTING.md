# Contributing

This extension is intentionally small and should stay easy to audit.

## Development

1. Make focused changes.
2. Run `npm run check`.
3. Load the folder as an unpacked Chromium extension.
4. Test on a StudyDrive document page with an account that has legitimate document access.

## Icons

`icon.svg` is the editable icon source. Run this after changing it:

```bash
npm run icons
```

Commit the regenerated `icon16.png`, `icon32.png`, `icon48.png` and `icon128.png`.

## Release

1. Update `manifest.json` and `package.json` to the same version.
2. Run `npm run check`.
3. Complete the manual QA checklist in `README.md`.
4. Create a ZIP containing only runtime extension files.
5. Draft GitHub release notes from the merged changes.

## Review focus

- Keep permissions narrow.
- Do not add analytics or external data transmission.
- Keep the button unobtrusive and aligned with StudyDrive's UI.
- Prefer robust parsing and explicit errors over silent failure.
