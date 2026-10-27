// Styles for the controls' closed shadow root, isolated from StudyDrive's CSS.
globalThis.SDStyles = `
:host {
  all: initial;
  position: fixed;
  right: 24px;
  bottom: 24px;
  z-index: 2147483647;
  display: block;
  width: min(300px, calc(100vw - 32px));
  color-scheme: light dark;
  --sd-surface: #ffffff;
  --sd-text: #183b35;
  --sd-muted: #4b635f;
  --sd-border: #d4e5e2;
  --sd-neutral: #e7efed;
  --sd-neutral-text: #2f4a45;
  --sd-accent: #008374;
  --sd-accent-hover: #006f63;
  --sd-success: #087f5b;
  --sd-error: #b42318;
  --sd-error-surface: #fef3f2;
  --sd-focus: #003d36;
}
:host([hidden]) { display: none; }

@media (prefers-color-scheme: dark) {
  :host {
    --sd-surface: #17211f;
    --sd-text: #e3f0ed;
    --sd-muted: #a7bbb7;
    --sd-border: #2e3f3c;
    --sd-neutral: #26332f;
    --sd-neutral-text: #d3e2df;
    /* Button colors keep at least 4.5:1 contrast with white text. */
    --sd-accent: #00796b;
    --sd-accent-hover: #008a7a;
    --sd-success: #087f5b;
    --sd-error: #c4321f;
    --sd-error-surface: #2a1a1a;
    --sd-focus: #7ee0d3;
  }
}

* { box-sizing: border-box; }

.card {
  display: grid;
  gap: 8px;
  padding: 10px;
  border: 1px solid var(--sd-border);
  border-radius: 10px;
  background: var(--sd-surface);
  color: var(--sd-text);
  box-shadow: 0 6px 18px rgba(15, 23, 42, 0.18);
  font: 400 13px / 1.45 -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
  overflow-wrap: anywhere;
}
.card[data-state="error"] { border-color: var(--sd-error); background: var(--sd-error-surface); }

.row { display: flex; align-items: stretch; gap: 6px; }

button {
  margin: 0;
  font: inherit;
  cursor: pointer;
}
button:focus-visible, summary:focus-visible { outline: 3px solid var(--sd-focus); outline-offset: 2px; }
button[aria-disabled="true"] { cursor: default; }

.primary {
  display: inline-flex;
  flex: 1 1 auto;
  align-items: center;
  justify-content: center;
  gap: 8px;
  min-height: 44px;
  padding: 10px 14px;
  border: 1px solid transparent;
  border-radius: 8px;
  background: var(--sd-neutral);
  color: var(--sd-neutral-text);
  font-weight: 700;
  font-size: 14px;
  text-align: center;
  transition: background-color 140ms ease, transform 140ms ease;
}
.card[data-state="ready"] .primary { background: var(--sd-accent); color: #ffffff; }
.card[data-state="ready"] .primary:hover { background: var(--sd-accent-hover); transform: translateY(-1px); }
.card[data-state="success"] .primary { background: var(--sd-success); color: #ffffff; }
.card[data-state="error"] .primary { background: var(--sd-error); color: #ffffff; }
.card[data-state="error"] .primary[aria-disabled="true"] { background: var(--sd-neutral); color: var(--sd-neutral-text); }

.card[data-state="busy"] .primary::before {
  content: "";
  width: 15px;
  height: 15px;
  flex: 0 0 15px;
  border: 2px solid currentColor;
  border-top-color: transparent;
  border-radius: 50%;
  animation: sd-spin 700ms linear infinite;
}

.hide {
  flex: 0 0 auto;
  width: 36px;
  min-height: 36px;
  padding: 0;
  border: 1px solid transparent;
  border-radius: 8px;
  background: transparent;
  color: var(--sd-muted);
  font-size: 20px;
  line-height: 1;
}
.hide:hover { background: var(--sd-neutral); color: var(--sd-text); }

.status, .meta { margin: 0; }
.meta { color: var(--sd-muted); font-size: 12px; font-variant-numeric: tabular-nums; }
.status:empty, .meta:empty, [hidden] { display: none; }

progress {
  width: 100%;
  height: 6px;
  border: 0;
  border-radius: 3px;
  background: var(--sd-neutral);
  accent-color: var(--sd-accent);
  appearance: none;
}
progress::-webkit-progress-bar { border-radius: 3px; background: var(--sd-neutral); }
progress::-webkit-progress-value { border-radius: 3px; background: var(--sd-accent); }

.secondary {
  justify-self: start;
  padding: 6px 10px;
  border: 1px solid var(--sd-border);
  border-radius: 6px;
  background: transparent;
  color: var(--sd-text);
  font-weight: 600;
}
.secondary:hover { background: var(--sd-neutral); }

details { color: var(--sd-muted); font-size: 12px; }
summary { cursor: pointer; }
code {
  display: block;
  margin-top: 4px;
  font: 12px / 1.4 ui-monospace, SFMono-Regular, Menlo, Consolas, monospace;
  white-space: pre-wrap;
}

@keyframes sd-spin { to { transform: rotate(360deg); } }

@media (max-width: 640px) {
  :host { right: 16px; bottom: 16px; }
}

@media (prefers-reduced-motion: reduce) {
  .primary { transition: none; }
  .card[data-state="ready"] .primary:hover { transform: none; }
  .card[data-state="busy"] .primary::before { animation: none; }
}

@media (forced-colors: active) {
  .card, .primary, .hide, .secondary { border-color: CanvasText; }
}
`;
