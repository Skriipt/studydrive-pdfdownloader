const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const root = path.join(__dirname, '..');
const PAGE = 'https://www.studydrive.net/de/doc/example/123';
const SOURCE = 'https://cdn.studydrive.net/d/prod/documents/123/teaser/123.pdf?token=fixture';
const PDF = '%PDF-1.7\n1 0 obj\n<<>>\nendobj\nstartxref\n0\n%%EOF\n';
const record = () => ({ id: 123, filename: 'Lecture "Part 1".pdf', file_preview: SOURCE });
const tick = () => new Promise(resolve => setImmediate(resolve));

class CustomEvent extends Event {
  constructor(type, options = {}) { super(type); this.detail = options.detail; }
}

class FileReader {
  readAsDataURL(blob) {
    blob.arrayBuffer().then(buffer => {
      this.result = `data:${blob.type};base64,${Buffer.from(buffer).toString('base64')}`;
      this.onload();
    }).catch(error => { this.error = error; this.onerror(); });
  }
}

function load(context, filename) {
  vm.runInContext(fs.readFileSync(path.join(root, filename), 'utf8'), context, { filename });
}

function environment(extra = {}) {
  const events = new EventTarget();
  class XHR extends EventTarget {
    open() {}
    send() {}
    getResponseHeader(name) { return this.headers?.[name.toLowerCase()] || null; }
  }
  const timers = new Map();
  const intervals = [];
  let timerId = 0;
  const context = {
    console: { log() {}, warn() {}, error() {} },
    ArrayBuffer, Uint8Array, Blob, Response, Request, URL, FileReader, CustomEvent,
    btoa, atob, TextEncoder, TextDecoder, ReadableStream,
    crypto: require('node:crypto').webcrypto,
    location: new URL(PAGE), sdWindow: { document: record() }, XMLHttpRequest: XHR,
    fetch: async () => new Response(PDF, { headers: { 'content-type': 'application/pdf' } }),
    setTimeout: (fn, delay) => { timers.set(++timerId, { fn, delay }); return timerId; },
    clearTimeout: id => timers.delete(id),
    setInterval: fn => { intervals.push(fn); return intervals.length; },
    clearInterval() {},
    ...extra
  };
  context.window = context;
  for (const name of ['addEventListener', 'removeEventListener', 'dispatchEvent']) {
    context[name] = events[name].bind(events);
  }
  context.history = Object.fromEntries(['pushState', 'replaceState'].map(name => [name, (_state, _title, url) => {
    if (url) context.location.href = new URL(url, context.location.href).href;
  }]));
  vm.createContext(context);
  load(context, 'utils.js');
  return { context, XHR, timers, intervals };
}

function dispatch(context, type, detail) {
  context.dispatchEvent(new CustomEvent(type, { detail: JSON.stringify(detail) }));
}

function exportPdf(context, overrides = {}) {
  return new Promise(resolve => {
    context.addEventListener('sd-export-result', event => resolve(JSON.parse(event.detail)), { once: true });
    dispatch(context, 'sd-export-pdf', { requestId: 'fixture', documentId: '123', sourceUrl: SOURCE, ...overrides });
  });
}

function status(context) {
  let result;
  context.addEventListener('sd-pdf-status', event => { result = JSON.parse(event.detail); }, { once: true });
  dispatch(context, 'sd-pdf-status-request', {});
  return result;
}

test('metadata follows the numeric document ID and keeps escaped filenames intact', () => {
  const { context: { SDUtils: utils } } = environment();
  assert.equal(utils.getDocumentId(PAGE), '123');
  assert.equal(utils.getDocumentId('https://example.org/de/doc/example/123'), '');
  assert.equal(utils.getDocumentMetadata({ ...record(), id: 456 }, PAGE), null);
  const metadata = utils.getDocumentMetadata(record(), PAGE);
  assert.equal(metadata.filename, 'Lecture -Part 1-.pdf');
  assert.equal(metadata.sourceUrl, SOURCE);
  assert.equal(utils.getDocumentMetadata({ ...record(), file_preview: 'https://evil.example/pdf' }, PAGE), null);
  assert.equal(utils.sanitizeFilename('CON.pdf'), '_CON.pdf');
  assert.equal(utils.sanitizeFilename('.pdf'), 'studydrive-document.pdf');
  assert.ok(new TextEncoder().encode(utils.sanitizeFilename('😀'.repeat(200) + '.pdf')).length <= 180);
});

test('PDF validation requires a complete tail and valid bounded Base64', () => {
  const { context: { SDUtils: utils } } = environment();
  assert.equal(utils.isCompletePdf(new TextEncoder().encode(PDF).buffer), true);
  assert.equal(utils.isCompletePdf(new TextEncoder().encode('%PDF-1.7\npartial').buffer), false);
  const base64 = btoa(PDF);
  assert.equal(utils.validatePdfBase64(base64, PDF.length), null);
  assert.ok(utils.validatePdfBase64(base64, PDF.length + 1));
  assert.ok(utils.validatePdfBase64('not-base64!', 10));
  assert.ok(utils.validatePdfBase64(btoa('not a PDF'), 9));
  assert.ok(utils.MAX_BASE64_LENGTH + 8192 < 64 * 1024 * 1024);
  assert.equal(utils.parseEventDetail('[]'), null);
});

test('fetch returns before capture completes and exports the same complete bytes', async () => {
  let controller;
  const response = new Response(new ReadableStream({ start(value) { controller = value; } }), {
    headers: { 'content-type': 'application/pdf' }
  });
  const { context } = environment({ fetch: async () => response });
  load(context, 'inject.js');
  assert.equal(await context.fetch(SOURCE), response);
  assert.notEqual(status(context).state, 'ready');
  controller.enqueue(new TextEncoder().encode(PDF)); controller.close();
  assert.equal(await response.text(), PDF);
  await tick(); await tick();
  const result = await exportPdf(context);
  assert.equal(atob(result.base64), PDF);
  assert.equal(result.filename, 'Lecture -Part 1-.pdf');
});

test('partial responses, unrelated files and stale document requests never become downloadable', async () => {
  const { context } = environment({ fetch: async () => new Response(PDF, {
    status: 206, headers: { 'content-type': 'application/pdf', 'content-range': 'bytes 0-50/100' }
  }) });
  load(context, 'inject.js');
  await context.fetch(SOURCE); await tick();
  assert.equal(status(context).state, 'error');
  assert.ok((await exportPdf(context)).error);

  let release;
  const stale = environment({ fetch: () => new Promise(resolve => { release = resolve; }) });
  load(stale.context, 'inject.js');
  const pending = stale.context.fetch(SOURCE);
  stale.context.history.pushState(null, '', '/de/doc/other/456');
  stale.context.sdWindow.document = { ...record(), id: 456, file_preview: SOURCE.replaceAll('123', '456') };
  release(new Response(PDF, { headers: { 'content-type': 'application/pdf' } }));
  await pending; await tick();
  assert.notEqual(status(stale.context).state, 'ready');
  assert.ok((await exportPdf(stale.context, { documentId: '456' })).error);
});

test('an unrelated PDF does not replace the current capture', async () => {
  const { context } = environment(); load(context, 'inject.js');
  await context.fetch(SOURCE); await tick(); await tick();
  await context.fetch('https://cdn.studydrive.net/other.pdf'); await tick();
  assert.equal((await exportPdf(context)).sourceUrl, SOURCE);
  assert.equal(status(context).state, 'ready');
});

test('HTTP failures and oversized declared bodies are rejected before cloning', async () => {
  for (const [httpStatus, headers] of [[403, {}], [200, { 'content-length': String(41 * 1024 * 1024) }]]) {
    let clones = 0;
    const response = new Response(PDF, { status: httpStatus, headers });
    const original = response.clone.bind(response);
    response.clone = () => { clones++; return original(); };
    const { context } = environment({ fetch: async () => response });
    load(context, 'inject.js');
    assert.equal(await context.fetch(SOURCE), response);
    assert.equal(status(context).state, 'error');
    assert.equal(clones, 0);
    assert.equal(await response.text(), PDF);
  }
});

test('network failures remain visible without changing the page fetch rejection', async () => {
  const failure = new Error('fixture network failure');
  const { context, XHR } = environment({ fetch: async () => { throw failure; } });
  load(context, 'inject.js');
  await assert.rejects(context.fetch(SOURCE), error => error === failure);
  assert.equal(status(context).state, 'error');
  context.history.replaceState(null, '', '/de'); context.history.replaceState(null, '', PAGE);
  const xhr = new XHR(); xhr.open('GET', SOURCE); xhr.send();
  xhr.dispatchEvent(new Event('timeout'));
  assert.equal(status(context).state, 'error');
});

test('oversized streams are cancelled without consuming or breaking the page response', async () => {
  const body = PDF.repeat(3);
  const { context } = environment({ fetch: async () => new Response(body, { headers: { 'content-type': 'application/pdf' } }) });
  context.SDUtils = { ...context.SDUtils, MAX_PDF_BYTES: PDF.length };
  load(context, 'inject.js');
  const response = await context.fetch(SOURCE);
  assert.equal(await response.text(), body);
  await tick(); await tick();
  assert.equal(status(context).state, 'error');
  assert.match(status(context).error, /large|limit/i);
});

test('late metadata becomes ready and navigation clears it, including navigation back', async () => {
  const { context, intervals } = environment({ sdWindow: {} });
  load(context, 'inject.js');
  assert.equal(status(context).state, 'waiting');
  context.sdWindow.document = record(); intervals[0]();
  await context.fetch(SOURCE); await tick(); await tick();
  assert.equal(status(context).state, 'ready');
  context.history.pushState(null, '', '/de');
  assert.equal(status(context).documentId, '');
  context.history.pushState(null, '', PAGE);
  assert.notEqual(status(context).state, 'ready');
});

test('XHR reuse has one load listener; rejected Blob reads become visible errors', async () => {
  const { context, XHR } = environment();
  load(context, 'inject.js');
  const xhr = new XHR(); let added = 0;
  const add = xhr.addEventListener.bind(xhr);
  xhr.addEventListener = (...args) => { if (args[0] === 'load') added++; return add(...args); };
  xhr.status = 200; xhr.headers = { 'content-type': 'application/pdf' };
  xhr.response = new TextEncoder().encode(PDF).buffer;
  for (let i = 0; i < 3; i++) { xhr.open('GET', SOURCE); xhr.send(); xhr.dispatchEvent(new Event('load')); }
  await tick();
  assert.equal(added, 1);
  assert.equal(status(context).state, 'ready');
  const bad = new XHR(); bad.status = 200; bad.headers = xhr.headers;
  bad.response = new Blob([PDF]); bad.response.arrayBuffer = async () => { throw new Error('fixture read error'); };
  context.history.replaceState(null, '', '/de'); context.history.replaceState(null, '', PAGE);
  bad.open('GET', SOURCE); bad.send(); bad.dispatchEvent(new Event('load')); await tick();
  assert.equal(status(context).state, 'error');
});

function background() {
  const calls = [];
  let handler;
  const chrome = {
    runtime: { id: 'fixture-extension', onMessage: { addListener: fn => { handler = fn; } } },
    downloads: { download: (options, callback) => { calls.push(options); callback(7); } }
  };
  const { context } = environment({ chrome });
  context.importScripts = filename => load(context, filename);
  load(context, 'background.js');
  const sender = { id: chrome.runtime.id, frameId: 0, tab: { id: 42 }, url: PAGE };
  const message = { action: 'download', base64: btoa(PDF), size: PDF.length,
    filename: 'Lecture.pdf', documentId: '123', sourceUrl: SOURCE };
  return { calls, chrome, send: (change = {}, from = sender) => new Promise(resolve => handler({ ...message, ...change }, from, resolve)), sender };
}

test('the privileged download boundary rejects forged data, paths, sizes and senders', async () => {
  const bg = background();
  for (const change of [{ base64: btoa('not a PDF'), size: 9 }, { filename: '../escape.pdf' },
    { size: PDF.length + 1 }, { documentId: '456' }, { sourceUrl: 'https://evil.example/file.pdf' }]) {
    assert.ok((await bg.send(change)).error);
  }
  assert.ok((await bg.send({}, { ...bg.sender, url: 'https://example.org/' })).error);
  assert.ok((await bg.send({}, { ...bg.sender, id: 'another-extension' })).error);
  assert.ok((await bg.send({}, { ...bg.sender, frameId: 1 })).error);
  assert.equal(bg.calls.length, 0);
  const result = await bg.send();
  assert.equal(result.started, true);
  assert.equal(bg.calls.length, 1);
  assert.equal(bg.calls[0].url, `data:application/pdf;base64,${btoa(PDF)}`);
  bg.chrome.downloads.download = () => { throw new Error('fixture API failure'); };
  assert.match((await bg.send()).error, /failure/);
});

class Element {
  constructor(tag) { this.tagName = tag.toUpperCase(); this.children = []; this.dataset = {}; this.listeners = {}; this.attributes = {}; }
  setAttribute(name, value) { this.attributes[name] = String(value); }
  append(...nodes) { for (const node of nodes) { this.children.push(node); node.parentNode = this; } }
  appendChild(node) { this.append(node); return node; }
  addEventListener(name, fn) { this.listeners[name] = fn; }
  remove() { this.parentNode.children = this.parentNode.children.filter(child => child !== this); this.parentNode = null; }
  querySelector(selector) {
    for (const child of this.children) {
      if (selector === '.' + child.className || selector.toUpperCase() === child.tagName) return child;
      const nested = child.querySelector(selector); if (nested) return nested;
    }
    return null;
  }
}

function ui() {
  const body = new Element('body');
  const document = { body, readyState: 'complete', createElement: tag => new Element(tag), querySelector: selector => body.querySelector(selector) };
  const messages = [];
  const { context, timers } = environment({ document, chrome: { runtime: { sendMessage: (payload, callback) => {
    messages.push(payload); callback({ started: true, downloadId: 7 });
  } } } });
  load(context, 'content.js');
  const ready = () => dispatch(context, 'sd-pdf-status', { state: 'ready', documentId: '123', sourceUrl: SOURCE,
    filename: 'Lecture.pdf', size: PDF.length });
  const button = () => body.querySelector('.sd-pdf-download-btn');
  const message = () => body.querySelector('.sd-pdf-status').textContent;
  return { context, timers, messages, body, button, message, ready };
}

test('UI waits for capture, blocks synthetic clicks, validates results and reports only download start', async () => {
  const view = ui(); assert.equal(view.button().disabled, true);
  view.ready(); assert.equal(view.button().disabled, false);
  await view.button().listeners.click({ isTrusted: false }); assert.equal(view.messages.length, 0);
  view.context.addEventListener('sd-export-pdf', event => {
    const detail = JSON.parse(event.detail);
    dispatch(view.context, 'sd-export-result', { ...detail, base64: btoa(PDF), size: PDF.length, filename: 'Lecture.pdf' });
  });
  await view.button().listeners.click({ isTrusted: true });
  assert.equal(view.messages.length, 1);
  assert.match(view.message(), /started/i);
  assert.doesNotMatch(view.message(), /downloaded/i);
  assert.equal(view.button().disabled, false);
  assert.equal(view.timers.size, 0);
});

test('an outstanding export is cancelled on navigation and cannot trigger an old download', async () => {
  const view = ui(); view.ready();
  let request;
  view.context.addEventListener('sd-export-pdf', event => { request = JSON.parse(event.detail); });
  const pending = view.button().listeners.click({ isTrusted: true });
  view.context.location.href = 'https://www.studydrive.net/de';
  dispatch(view.context, 'sd-pdf-status', { documentId: '', state: 'waiting' });
  dispatch(view.context, 'sd-export-result', { ...request, base64: btoa(PDF), size: PDF.length });
  await pending;
  assert.equal(view.messages.length, 0);
  assert.equal(view.button(), null);
  assert.equal(view.timers.size, 0);
});

test('a document change discovered only after an export result still prevents downloading', async () => {
  const view = ui(); view.ready();
  let request;
  view.context.addEventListener('sd-export-pdf', event => { request = JSON.parse(event.detail); });
  const pending = view.button().listeners.click({ isTrusted: true });
  view.context.location.href = 'https://www.studydrive.net/de/doc/other/456';
  dispatch(view.context, 'sd-export-result', { ...request, base64: btoa(PDF), size: PDF.length, filename: 'Lecture.pdf' });
  await pending;
  assert.equal(view.messages.length, 0);
  assert.equal(view.button().disabled, true);
});

test('UI rejects forged non-PDF results and supports retry after timeout without stale timers', async () => {
  const view = ui(); view.ready();
  let request;
  view.context.addEventListener('sd-export-pdf', event => { request = JSON.parse(event.detail); });
  let pending = view.button().listeners.click({ isTrusted: true });
  dispatch(view.context, 'sd-export-result', { ...request, base64: btoa('not a PDF'), size: PDF.length, filename: 'Lecture.pdf' });
  await pending;
  assert.equal(view.messages.length, 0);
  assert.equal(view.button().disabled, false);
  pending = view.button().listeners.click({ isTrusted: true });
  const timeout = [...view.timers.values()].find(timer => timer.delay === 15000);
  timeout.fn(); await pending;
  assert.equal(view.timers.size, 0);
  assert.equal(view.button().disabled, false);
  assert.match(view.message(), /timed out/i);
  pending = view.button().listeners.click({ isTrusted: true });
  assert.equal(view.button().disabled, true);
  dispatch(view.context, 'sd-export-result', { ...request, base64: btoa(PDF), size: PDF.length, filename: 'Lecture.pdf' });
  await pending;
  assert.equal(view.messages.length, 1);
  assert.equal(view.timers.size, 0);
});
