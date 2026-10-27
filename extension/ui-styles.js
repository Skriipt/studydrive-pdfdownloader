// Styles for the controls' closed shadow root, isolated from StudyDrive's CSS.
globalThis.SDStyles = `
:host {
  all: initial;
  position: fixed;
  right: 20px;
  bottom: 18px;
  z-index: 2147483647;
  display: block;
  width: max-content;
  max-width: calc(100vw - 32px);
  color-scheme: light dark;
  --sd-surface: #ffffff;
  --sd-text: #45605b;
  --sd-muted: #637d78;
  --sd-border: #d4e5e2;
  --sd-accent: #008374;
  --sd-accent-hover: #006f63;
  --sd-success: #087f5b;
  --sd-error: #b42318;
  --sd-error-border: #f1c4bf;
  --sd-error-text: #3b1512;
  --sd-focus: #003d36;
}
:host([hidden]) { display: none; }
@media (prefers-color-scheme: dark) {
  :host {
    --sd-surface: #17211f;
    --sd-text: #e3f0ed;
    --sd-muted: #a7bbb7;
    --sd-border: #3f5650;
    --sd-error-border: #80453e;
    --sd-error-text: #ffe6e2;
    --sd-focus: #7ee0d3;
  }
}
* { box-sizing: border-box; }
.card {
  display: grid;
  grid-template-columns: minmax(0, auto) auto 28px;
  align-items: center;
  gap: 0 8px;
  padding: 0 6px 0 14px;
  min-height: 44px;
  border: 1px solid var(--sd-border);
  border-radius: 999px;
  background: var(--sd-surface);
  color: var(--sd-text);
  box-shadow: 0 4px 14px rgba(15, 23, 42, .16);
  font: 500 14px / 1.35 system-ui, sans-serif;
}
.row { display: contents; }
button { margin: 0; font: inherit; cursor: pointer; }
button:focus-visible, summary:focus-visible { outline: 3px solid var(--sd-focus); outline-offset: 2px; }
button[aria-disabled="true"] { cursor: default; }
.primary {
  grid-column: 1;
  grid-row: 1;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  gap: 8px;
  min-width: 0;
  min-height: 42px;
  padding: 8px 0;
  border: 0;
  border-radius: 999px;
  background: transparent;
  color: inherit;
  font-weight: 700;
  text-align: left;
}
.primary::before { flex: 0 0 auto; }
.hide {
  grid-column: 3;
  grid-row: 1;
  width: 28px;
  height: 28px;
  padding: 0;
  border: 0;
  border-radius: 50%;
  background: transparent;
  color: inherit;
  opacity: .7;
  font-size: 18px;
  line-height: 1;
}
.hide:hover { opacity: 1; background: rgb(127 127 127 / .15); }
.status, .meta { margin: 0; }
.card[data-state="ready"] { background: var(--sd-accent); color: #fff; border-color: transparent; }
.card[data-state="ready"]:has(.primary:hover) { background: var(--sd-accent-hover); }
.card[data-state="ready"] .primary::before { content: '⤓'; }
.card[data-state="ready"] .status {
  grid-column: 2;
  grid-row: 1;
  white-space: nowrap;
  opacity: .9;
  font-weight: 500;
  font-variant-numeric: tabular-nums;
}
.card[data-state="success"] { background: var(--sd-success); color: #fff; border-color: transparent; padding-right: 14px; }
.card[data-state="success"] .primary::before { content: '✓'; }
.card[data-state="success"] .primary { grid-column: 1 / -1; }
.card[data-state="success"] .hide { display: none; }
.card[data-state="waiting"] .primary,
.card[data-state="busy"] .primary { grid-column: 1 / 3; }
.card[data-state="waiting"] .primary::before,
.card[data-state="busy"] .primary::before {
  content: '';
  width: 16px;
  height: 16px;
  border: 2px solid var(--sd-border);
  border-top-color: var(--sd-accent);
  border-radius: 50%;
  animation: sd-spin 700ms linear infinite;
}
/* Keep live announcements without adding a second visible line to compact states. */
.card:not([data-state="ready"]):not([data-state="error"]):not([data-expanded="true"]) .status {
  position: absolute;
  width: 1px;
  height: 1px;
  padding: 0;
  overflow: hidden;
  clip-path: inset(50%);
  white-space: nowrap;
}
.card[data-expanded="true"] { border-radius: 18px; max-width: 300px; padding-bottom: 10px; }
.card[data-expanded="true"] .status,
.meta, progress, .secondary { grid-column: 1 / -1; }
.card[data-expanded="true"] .status { margin-bottom: 8px; }
.meta { color: var(--sd-muted); font-size: 12px; padding-top: 6px; font-variant-numeric: tabular-nums; }
progress { width: 100%; height: 4px; border: 0; border-radius: 3px; accent-color: var(--sd-accent); }
progress::-webkit-progress-bar { border-radius: 3px; background: var(--sd-border); }
progress::-webkit-progress-value { border-radius: 3px; background: var(--sd-accent); }
.secondary {
  justify-self: start;
  padding: 6px 10px;
  border: 1px solid var(--sd-border);
  border-radius: 7px;
  background: var(--sd-surface);
  color: var(--sd-text);
  font-weight: 600;
}
.error-title { display: none; margin: 0; font-weight: 700; }
.card[data-state="error"] {
  width: 290px;
  max-width: 100%;
  grid-template-columns: auto minmax(0, 1fr) 28px;
  align-items: start;
  gap: 4px 8px;
  padding: 10px 12px;
  border-radius: 10px;
  border-color: var(--sd-error-border);
  border-left: 4px solid var(--sd-error);
  color: var(--sd-error-text);
  overflow-wrap: anywhere;
}
.card[data-state="error"] .error-title { display: block; grid-column: 1 / 3; grid-row: 1; }
.card[data-state="error"] .status { grid-column: 1 / -1; grid-row: 2; margin-bottom: 4px; }
.card[data-state="error"] .primary {
  grid-column: 1;
  grid-row: 3;
  min-height: 32px;
  padding: 6px 10px;
  border-radius: 7px;
  background: var(--sd-error);
  color: #fff;
  font-size: 13px;
  font-weight: 600;
}
.card[data-state="error"] .primary[aria-disabled="true"] { background: transparent; color: var(--sd-text); padding-left: 0; }
.card[data-state="error"] .hide { margin: -6px -8px 0 0; }
details { grid-column: 2 / -1; grid-row: 3; color: var(--sd-text); font-size: 13px; }
summary { width: max-content; padding: 6px 10px; border: 1px solid var(--sd-border); border-radius: 7px; cursor: pointer; list-style: none; }
summary::-webkit-details-marker { display: none; }
details[open] { grid-column: 1 / -1; grid-row: 4; }
code { display: block; margin-top: 6px; font: 12px / 1.4 ui-monospace, monospace; white-space: pre-wrap; }
.status:empty, .meta:empty, [hidden] { display: none; }
@keyframes sd-spin { to { transform: rotate(360deg); } }
@media (max-width: 640px) { :host { right: 16px; bottom: 18px; } }
@media (prefers-reduced-motion: reduce) { .primary::before { animation: none !important; } }
@media (forced-colors: active) { .card, .primary, .hide, .secondary, summary { border: 1px solid CanvasText; } }
`;
