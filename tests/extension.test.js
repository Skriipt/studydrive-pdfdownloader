const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const root = path.join(__dirname, '..', 'extension');
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
    complete() {
      this.readyState = 4;
      this.dispatchEvent(new Event('readystatechange'));
      this.dispatchEvent(new Event('load'));
    }
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

test('XHR reuse has one ready-state listener; rejected Blob reads become visible errors', async () => {
  const { context, XHR } = environment();
  load(context, 'inject.js');
  const xhr = new XHR(); let added = 0;
  const add = xhr.addEventListener.bind(xhr);
  xhr.addEventListener = (...args) => { if (args[0] === 'readystatechange') added++; return add(...args); };
  xhr.status = 200; xhr.headers = { 'content-type': 'application/pdf' };
  xhr.response = new TextEncoder().encode(PDF).buffer;
  for (let i = 0; i < 3; i++) { xhr.open('GET', SOURCE); xhr.send(); xhr.complete(); }
  await tick();
  assert.equal(added, 1);
  assert.equal(status(context).state, 'ready');
  const bad = new XHR(); bad.status = 200; bad.headers = xhr.headers;
  bad.response = new Blob([PDF]); bad.response.arrayBuffer = async () => { throw new Error('fixture read error'); };
  context.history.replaceState(null, '', '/de'); context.history.replaceState(null, '', PAGE);
  bad.open('GET', SOURCE); bad.send(); bad.complete(); await tick();
  assert.equal(status(context).state, 'error');
});

test('XHR capture owns its bytes after the viewer changes or transfers the response', async () => {
  for (const change of [bytes => new Uint8Array(bytes).fill(0),
    bytes => structuredClone(bytes, { transfer: [bytes] })]) {
    const { context, XHR } = environment();
    load(context, 'inject.js');
    const xhr = new XHR();
    xhr.status = 200;
    xhr.response = new TextEncoder().encode(PDF).buffer;
    xhr.open('GET', SOURCE); xhr.send(); xhr.complete();
    assert.equal(status(context).state, 'ready');
    change(xhr.response);
    const result = await exportPdf(context);
    assert.equal(result.size, PDF.length);
    assert.equal(atob(result.base64), PDF);
  }
});

test('XHR capture waits for DONE instead of inspecting an unfinished response', () => {
  const { context, XHR } = environment();
  load(context, 'inject.js');
  const xhr = new XHR();
  xhr.open('GET', SOURCE); xhr.send();
  xhr.readyState = 3;
  xhr.dispatchEvent(new Event('readystatechange'));
  assert.equal(status(context).state, 'waiting');
  xhr.status = 200;
  xhr.response = new TextEncoder().encode(PDF).buffer;
  xhr.complete();
  assert.equal(status(context).state, 'ready');
});

test('a complete overlapping preview replaces a failed capture without consuming either viewer response', async () => {
  let controller;
  let requests = 0;
  const { context } = environment({ fetch: async () => ++requests === 1 ?
    new Response(new ReadableStream({ start(value) { controller = value; } })) : new Response(PDF) });
  load(context, 'inject.js');
  const first = await context.fetch(SOURCE);
  const second = await context.fetch(SOURCE);
  assert.equal(await second.text(), PDF);
  const truncated = '%PDF-1.7\ntruncated';
  controller.enqueue(new TextEncoder().encode(truncated)); controller.close();
  assert.equal(await first.text(), truncated);
  await tick(); await tick();
  assert.equal(status(context).state, 'ready');
  assert.equal(atob((await exportPdf(context)).base64), PDF);
});

test('unsupported overlapping responses leave an active complete preview capture alone', async () => {
  for (const [httpStatus, headers] of [[206, { 'content-range': 'bytes 0-10/20' }], [403, {}],
    [200, { 'content-length': String(41 * 1024 * 1024) }]]) {
    let controller;
    let requests = 0;
    const { context } = environment({ fetch: async () => ++requests === 1 ?
      new Response(new ReadableStream({ start(value) { controller = value; } })) :
      new Response(PDF, { status: httpStatus, headers }) });
    load(context, 'inject.js');
    const first = await context.fetch(SOURCE);
    await context.fetch(SOURCE);
    assert.equal(status(context).state, 'loading');
    controller.enqueue(new TextEncoder().encode(PDF)); controller.close();
    assert.equal(await first.text(), PDF);
    await tick(); await tick();
    assert.equal(atob((await exportPdf(context)).base64), PDF);
  }
});

function events() {
  const listeners = [];
  return { listeners, addListener: fn => listeners.push(fn), fire: (...args) => listeners.map(fn => fn(...args)) };
}

// Mirrors chrome.i18n placeholder handling for the extension's own message files.
function i18n(lang = 'en') {
  const messages = JSON.parse(fs.readFileSync(path.join(root, '_locales', lang, 'messages.json'), 'utf8'));
  return {
    getUILanguage: () => lang,
    getMessage(key, substitutions = []) {
      const entry = messages[key];
      if (!entry) return '';
      const values = [].concat(substitutions).map(String);
      return entry.message.replace(/\$([A-Za-z0-9_]+)\$/g, (_, name) =>
        (entry.placeholders?.[name.toLowerCase()]?.content || '').replace(/\$(\d)/g, (_match, n) => values[n - 1] ?? ''));
    }
  };
}

function background({ receiver } = {}) {
  const calls = [];
  const badges = [];
  const tabMessages = [];
  let options = 0;
  let handler;
  const record = name => details => { badges.push({ name, ...details }); return Promise.resolve(); };
  const commands = events();
  const clicks = events();
  const installed = events();
  const chrome = {
    i18n: i18n(),
    runtime: { id: 'fixture-extension', lastError: undefined, getManifest: () => ({ version: '9.9.9' }),
      openOptionsPage: () => { options++; },
      onMessage: { addListener: fn => { handler = fn; } }, onInstalled: installed },
    downloads: { download: (options, callback) => { calls.push(options); callback(7); } },
    action: { setBadgeText: record('text'), setBadgeBackgroundColor: record('color'), setTitle: record('title'),
      onClicked: clicks },
    commands: { onCommand: commands },
    tabs: { sendMessage: (tabId, message, target, callback) => {
      tabMessages.push({ tabId, message, target });
      if (receiver) callback(receiver(message));
      else { chrome.runtime.lastError = { message: 'Receiving end does not exist.' }; callback(); chrome.runtime.lastError = undefined; }
    } }
  };
  const { context } = environment({ chrome });
  context.importScripts = filename => load(context, filename);
  load(context, 'background.js');
  const sender = { id: chrome.runtime.id, frameId: 0, tab: { id: 42 }, url: PAGE };
  const message = { action: 'download', base64: btoa(PDF), size: PDF.length,
    filename: 'Lecture.pdf', documentId: '123', sourceUrl: SOURCE };
  return { calls, chrome, badges, tabMessages, commands, clicks, installed, options: () => options,
    send: (change = {}, from = sender) => new Promise(resolve => handler({ ...message, ...change }, from, resolve)),
    status: (state, from = sender) => handler({ action: 'status', state }, from, () => assert.fail('no response expected')),
    sender };
}

test('the privileged download boundary rejects forged data, paths, sizes and senders', async () => {
  const bg = background();
  for (const change of [{ base64: btoa('not a PDF'), size: 9 }, { filename: '../escape.pdf' },
    { size: PDF.length + 1 }, { documentId: '456' }, { sourceUrl: 'https://evil.example/file.pdf' }]) {
    const result = await bg.send(change);
    assert.ok(result.error);
    assert.equal(result.errorCode, 'rejected');
  }
  assert.ok((await bg.send({}, { ...bg.sender, url: 'https://example.org/' })).error);
  assert.ok((await bg.send({}, { ...bg.sender, id: 'another-extension' })).error);
  assert.ok((await bg.send({}, { ...bg.sender, frameId: 1 })).error);
  assert.ok((await bg.send({}, { ...bg.sender, tab: undefined })).error);
  assert.equal(bg.calls.length, 0);
  const result = await bg.send();
  assert.equal(result.started, true);
  assert.equal(bg.calls.length, 1);
  assert.equal(bg.calls[0].url, `data:application/pdf;base64,${btoa(PDF)}`);
  bg.chrome.downloads.download = () => { throw new Error('fixture API failure'); };
  const failure = await bg.send();
  assert.match(failure.error, /failure/);
  assert.equal(failure.errorCode, 'downloadFailed');
});

test('badge status is accepted only from the top frame of a StudyDrive document tab', () => {
  const bg = background();
  bg.badges.length = 0;
  bg.status('ready', { ...bg.sender, frameId: 1 });
  bg.status('ready', { ...bg.sender, id: 'another-extension' });
  bg.status('ready', { ...bg.sender, url: 'https://www.studydrive.net/de' });
  bg.status('ready', { ...bg.sender, tab: undefined });
  bg.status('downloading');
  assert.equal(bg.badges.length, 0);
  bg.status('ready');
  assert.deepEqual(bg.badges.find(call => call.name === 'text'), { name: 'text', tabId: 42, text: 'PDF' });
  assert.match(bg.badges.find(call => call.name === 'title').title, /ready.*9\.9\.9/);
  bg.badges.length = 0;
  bg.status('error');
  assert.equal(bg.badges.find(call => call.name === 'text').text, '!');
  bg.badges.length = 0;
  bg.status('idle', { ...bg.sender, url: 'https://www.studydrive.net/de' });
  assert.equal(bg.badges.find(call => call.name === 'text').text, '');
});

test('keyboard command and toolbar click are forwarded only to the top frame of the active tab', () => {
  const bg = background({ receiver: () => ({ handled: true }) });
  bg.commands.fire('something-else', { id: 5 });
  bg.commands.fire('download-pdf', undefined);
  assert.equal(bg.tabMessages.length, 0);
  bg.commands.fire('download-pdf', { id: 5 });
  bg.clicks.fire({ id: 6 });
  assert.deepEqual(JSON.parse(JSON.stringify(bg.tabMessages)), [
    { tabId: 5, message: { action: 'shortcut' }, target: { frameId: 0 } },
    { tabId: 6, message: { action: 'reveal' }, target: { frameId: 0 } }
  ]);
  assert.equal(bg.options(), 0);

  // Without controls in the tab, a toolbar click opens local help; the shortcut does nothing visible.
  const outside = background();
  outside.commands.fire('download-pdf', { id: 5 });
  assert.equal(outside.options(), 0);
  outside.clicks.fire({ id: 5 });
  assert.equal(outside.options(), 1);
});

test('local onboarding opens on first install only', () => {
  const bg = background();
  bg.installed.fire({ reason: 'update' });
  bg.installed.fire({ reason: 'chrome_update' });
  assert.equal(bg.options(), 0);
  bg.installed.fire({ reason: 'install' });
  assert.equal(bg.options(), 1);
});

class Element {
  constructor(tag) {
    this.tagName = tag.toUpperCase(); this.children = []; this.dataset = {}; this.listeners = {};
    this.attributes = {}; this.textContent = ''; this.hidden = false; this.title = '';
  }
  setAttribute(name, value) { this.attributes[name] = String(value); }
  getAttribute(name) { return this.attributes[name] ?? null; }
  removeAttribute(name) { delete this.attributes[name]; if (name === 'value') delete this.value; }
  append(...nodes) { for (const node of nodes) { this.children.push(node); node.parentNode = this; } }
  appendChild(node) { this.append(node); return node; }
  addEventListener(name, fn) { this.listeners[name] = fn; }
  attachShadow(options) { this.shadowMode = options.mode; this.shadow = new Element('#shadow-root'); return this.shadow; }
  focus() { Element.focused = this; }
  remove() { this.parentNode.children = this.parentNode.children.filter(child => child !== this); this.parentNode = null; }
  find(predicate) {
    for (const child of [...this.children, ...(this.shadow ? [this.shadow] : [])]) {
      if (predicate(child)) return child;
      const nested = child.find(predicate); if (nested) return nested;
    }
    return null;
  }
}

function ui({ lang = 'en', respond = () => ({ started: true, downloadId: 7 }) } = {}) {
  const body = new Element('body');
  const document = { body, readyState: 'complete', createElement: tag => new Element(tag) };
  const messages = [];
  const onMessage = events();
  let reloads = 0;
  const chrome = { i18n: i18n(lang), runtime: { id: 'fixture-extension', onMessage, sendMessage: (payload, callback) => {
    messages.push(payload);
    const response = payload.action === 'download' ? respond(payload) : undefined;
    if (response !== null) callback(response);
  } } };
  const { context, timers } = environment({ document, chrome });
  context.location.reload = () => { reloads++; };
  load(context, 'ui-styles.js');
  load(context, 'content.js');
  const statusEvent = (change = {}) => dispatch(context, 'sd-pdf-status', { state: 'ready', documentId: '123', sourceUrl: SOURCE,
    filename: 'Lecture.pdf', size: PDF.length, ...change });
  const byClass = name => body.find(node => node.className === name);
  const host = () => body.find(node => node.tagName === 'SD-PDF-DOWNLOADER');
  const button = () => byClass('primary');
  const extension = { id: chrome.runtime.id, url: 'chrome-extension://fixture-extension/background.js' };
  return {
    context, timers, messages, body, host, button, statusEvent, byClass,
    ready: () => statusEvent(),
    message: () => byClass('status').textContent,
    tone: () => byClass('card').dataset.state,
    disabled: () => button().getAttribute('aria-disabled') === 'true',
    downloads: () => messages.filter(message => message.action === 'download'),
    badges: () => messages.filter(message => message.action === 'status').map(message => message.state),
    reloads: () => reloads,
    command: (action, sender = extension) => {
      let response;
      onMessage.fire({ action }, sender, value => { response = { ...value }; });
      return response;
    },
    respondWithPdf: () => context.addEventListener('sd-export-pdf', event => {
      const detail = JSON.parse(event.detail);
      dispatch(context, 'sd-export-result', { ...detail, base64: btoa(PDF), size: PDF.length, filename: 'Lecture.pdf' });
    })
  };
}

const timer = (view, delay) => [...view.timers.values()].find(entry => entry.delay === delay);
// Runs a pending fake timer like the browser would: once, after removing it.
function fire(view, delay) {
  const [id, entry] = [...view.timers.entries()].find(([, value]) => value.delay === delay);
  view.timers.delete(id);
  entry.fn();
}
function visibleText(node) {
  if (node.hidden || node.tagName === 'STYLE') return [];
  return [...(node.textContent ? [node.textContent] : []), ...node.children.flatMap(visibleText),
    ...(node.shadow ? visibleText(node.shadow) : [])];
}

test('controls live in a closed shadow root and stay focusable while unavailable', () => {
  const view = ui();
  assert.equal(view.host().shadowMode, 'closed');
  assert.match(view.host().shadow.find(node => node.tagName === 'STYLE').textContent, /prefers-color-scheme: dark/);
  assert.equal(view.button().disabled, undefined);
  assert.equal(view.disabled(), true);
  assert.equal(view.tone(), 'waiting');
  assert.equal(view.button().textContent, 'Waiting for preview…');
  assert.equal(view.byClass('status').getAttribute('role'), 'status');
});

test('ready shows only the download label and size; synthetic clicks are ignored', async () => {
  const view = ui(); view.ready();
  assert.equal(view.tone(), 'ready');
  assert.equal(view.disabled(), false);
  assert.equal(view.button().textContent, 'Download PDF');
  assert.equal(view.message(), '47 byte');
  assert.equal(view.byClass('status').title, '');
  assert.deepEqual(visibleText(view.body), ['Download PDF', '×', '47 byte']);
  view.statusEvent({ size: 2_500_000 });
  assert.equal(view.message(), '2.5 MB');
  view.ready();
  await view.button().listeners.click({ isTrusted: false });
  assert.equal(view.downloads().length, 0);
});

test('a started download shows success briefly, blocks duplicates, then returns to ready', async () => {
  const view = ui(); view.ready(); view.respondWithPdf();
  await view.button().listeners.click({ isTrusted: true });
  assert.equal(view.downloads().length, 1);
  assert.equal(view.tone(), 'success');
  assert.match(view.button().textContent, /started/i);
  assert.doesNotMatch(view.message(), /downloaded|complete/i);
  assert.equal(view.disabled(), true);
  await view.button().listeners.click({ isTrusted: true });
  assert.equal(view.downloads().length, 1);
  assert.deepEqual(view.command('shortcut'), { handled: true });
  await tick();
  assert.equal(view.downloads().length, 1);
  assert.equal(view.timers.size, 1);
  fire(view, 4000);
  assert.equal(view.tone(), 'ready');
  assert.equal(view.button().textContent, 'Download PDF');
  assert.equal(view.disabled(), false);
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
  assert.equal(view.downloads().length, 0);
  assert.equal(view.host(), null);
  assert.equal(view.timers.size, 0);
  assert.equal(view.badges().at(-1), 'idle');
});

test('a document change discovered only after an export result still prevents downloading', async () => {
  const view = ui(); view.ready();
  let request;
  view.context.addEventListener('sd-export-pdf', event => { request = JSON.parse(event.detail); });
  const pending = view.button().listeners.click({ isTrusted: true });
  view.context.location.href = 'https://www.studydrive.net/de/doc/other/456';
  dispatch(view.context, 'sd-export-result', { ...request, base64: btoa(PDF), size: PDF.length, filename: 'Lecture.pdf' });
  await pending;
  assert.equal(view.downloads().length, 0);
  assert.equal(view.disabled(), true);
  assert.equal(view.tone(), 'waiting');
});

test('UI rejects forged non-PDF results and supports retry after timeout without stale timers', async () => {
  const view = ui(); view.ready();
  let request;
  view.context.addEventListener('sd-export-pdf', event => { request = JSON.parse(event.detail); });
  let pending = view.button().listeners.click({ isTrusted: true });
  dispatch(view.context, 'sd-export-result', { ...request, base64: btoa('not a PDF'), size: PDF.length, filename: 'Lecture.pdf' });
  await pending;
  assert.equal(view.downloads().length, 0);
  assert.equal(view.tone(), 'error');
  assert.equal(view.button().textContent, 'Try again');
  assert.equal(view.disabled(), false);
  pending = view.button().listeners.click({ isTrusted: true });
  fire(view, 15000); await pending;
  assert.equal(view.timers.size, 0);
  assert.equal(view.disabled(), false);
  assert.match(view.message(), /timed out/i);
  pending = view.button().listeners.click({ isTrusted: true });
  assert.equal(view.disabled(), true);
  dispatch(view.context, 'sd-export-result', { ...request, base64: btoa(PDF), size: PDF.length, filename: 'Lecture.pdf' });
  await pending;
  assert.equal(view.downloads().length, 1);
  assert.deepEqual([...view.timers.values()].map(entry => entry.delay), [4000]);
});

test('background rejections and lost confirmations show friendly errors with technical details', async () => {
  const view = ui({ respond: () => ({ error: 'Invalid PDF filename.', errorCode: 'rejected' }) });
  view.ready(); view.respondWithPdf();
  await view.button().listeners.click({ isTrusted: true });
  assert.equal(view.tone(), 'error');
  assert.match(view.message(), /rejected/i);
  const details = view.body.find(node => node.tagName === 'DETAILS');
  assert.equal(details.hidden, false);
  assert.equal(details.find(node => node.tagName === 'CODE').textContent, 'Invalid PDF filename.');
  assert.equal(view.badges().at(-1), 'error');

  const lost = ui({ respond: () => null });
  lost.ready(); lost.respondWithPdf();
  const pending = lost.button().listeners.click({ isTrusted: true });
  await tick();
  assert.equal(lost.tone(), 'busy');
  fire(lost, 30000); await pending;
  assert.match(lost.message(), /Check your browser downloads/);
  assert.equal(lost.button().textContent, 'Try again');
  assert.equal(lost.timers.size, 0);
});

test('waiting is neutral and offers a reload hint after a delay without claiming failure', async () => {
  const view = ui();
  assert.doesNotMatch(view.message(), /reload/i);
  assert.equal(view.byClass('secondary').hidden, true);
  assert.equal(timer(view, 9000) !== undefined, true);
  fire(view, 9000);
  assert.equal(view.tone(), 'waiting');
  assert.match(view.message(), /reload/i);
  assert.doesNotMatch(view.message(), /error|fail|broken/i);
  assert.equal(view.byClass('secondary').hidden, false);
  view.byClass('secondary').listeners.click({ isTrusted: false });
  assert.equal(view.reloads(), 0);
  view.byClass('secondary').listeners.click({ isTrusted: true });
  assert.equal(view.reloads(), 1);
  view.statusEvent({ state: 'loading', size: 0 });
  assert.equal(view.byClass('secondary').hidden, true);
  assert.equal(view.timers.size, 0);
  view.statusEvent({ state: 'waiting', size: 0 });
  assert.equal(view.timers.size, 1);
  view.ready();
  assert.equal(view.timers.size, 0);
});

test('capture errors are actionable: reload when it may help, unavailable when it cannot', async () => {
  const view = ui();
  view.statusEvent({ state: 'error', size: 0, errorCode: 'incomplete', error: 'The preview did not contain a complete PDF.' });
  assert.equal(view.tone(), 'error');
  assert.equal(view.button().textContent, 'Reload page');
  assert.equal(view.disabled(), false);
  assert.match(view.message(), /complete PDF/);
  assert.equal(view.body.find(node => node.tagName === 'CODE').textContent, 'The preview did not contain a complete PDF.');
  await view.button().listeners.click({ isTrusted: false });
  assert.equal(view.reloads(), 0);
  await view.button().listeners.click({ isTrusted: true });
  assert.equal(view.reloads(), 1);
  assert.equal(view.downloads().length, 0);

  view.statusEvent({ state: 'error', size: 0, errorCode: 'partial', error: 'Only part of the PDF was loaded.' });
  assert.equal(view.button().textContent, 'Download unavailable');
  assert.equal(view.disabled(), true);
  await view.button().listeners.click({ isTrusted: true });
  assert.equal(view.reloads(), 1);

  view.statusEvent({ state: 'error', size: 0, errorCode: 'toString', error: 'x'.repeat(2000) });
  assert.match(view.message(), /could not be read/i);
  assert.equal(view.body.find(node => node.tagName === 'CODE').textContent.length, 512);
});

test('capture progress is truthful about known and unknown totals', () => {
  const view = ui();
  view.statusEvent({ state: 'loading', size: 0, received: 500_000, total: 1_000_000 });
  assert.equal(view.tone(), 'busy');
  assert.equal(view.byClass('meta').textContent, '50% · 500 kB of 1 MB');
  const bar = view.body.find(node => node.tagName === 'PROGRESS');
  assert.equal(bar.hidden, false);
  assert.equal(bar.value, 500_000);
  assert.equal(bar.max, 1_000_000);
  // Compressed transfers can deliver more bytes than Content-Length; no percentage then.
  view.statusEvent({ state: 'loading', size: 0, received: 1_500_000, total: 1_000_000 });
  assert.equal(view.byClass('meta').textContent, '1.5 MB received');
  assert.equal(bar.value, undefined);
  view.statusEvent({ state: 'loading', size: 0, received: -5, total: 'x' });
  assert.equal(view.byClass('meta').textContent, '');
  view.ready();
  assert.equal(bar.hidden, true);
  assert.equal(view.byClass('meta').textContent, '');
});

test('German UI strings are used when the browser language is German', () => {
  const view = ui({ lang: 'de' });
  assert.equal(view.button().textContent, 'Warte auf Vorschau…');
  view.ready();
  assert.equal(view.button().textContent, 'PDF herunterladen');
  assert.equal(view.message(), '47 Byte');
  view.statusEvent({ state: 'error', size: 0, errorCode: 'http', error: 'HTTP 403' });
  assert.equal(view.button().textContent, 'Seite neu laden');
});

test('hidden controls are recoverable only through messages from the extension itself', async () => {
  const view = ui(); view.ready(); view.respondWithPdf();
  view.byClass('hide').listeners.click({ isTrusted: false });
  assert.equal(view.host().hidden, false);
  view.byClass('hide').listeners.click({ isTrusted: true });
  assert.equal(view.host().hidden, true);
  // Content scripts (with a sender tab) and other extensions cannot trigger reveal or download.
  for (const sender of [{ id: 'fixture-extension', tab: { id: 1 }, frameId: 0 }, { id: 'another-extension' }, null]) {
    assert.equal(view.command('shortcut', sender), undefined);
    assert.equal(view.command('reveal', sender), undefined);
  }
  assert.equal(view.command('download'), undefined);
  await tick();
  assert.equal(view.host().hidden, true);
  assert.equal(view.downloads().length, 0);
  assert.deepEqual(view.command('reveal'), { handled: true });
  assert.equal(view.host().hidden, false);
  assert.equal(Element.focused, view.button());
  await tick(); await tick();
  assert.equal(view.downloads().length, 0, 'reveal alone never downloads');
  assert.deepEqual(view.command('shortcut'), { handled: true });
  await tick(); await tick();
  assert.equal(view.downloads().length, 1);
  assert.equal(view.tone(), 'success');
});

test('the shortcut does nothing while waiting and reports unhandled outside documents', async () => {
  const view = ui(); view.respondWithPdf();
  assert.deepEqual(view.command('shortcut'), { handled: true });
  await tick();
  assert.equal(view.downloads().length, 0);
  view.context.location.href = 'https://www.studydrive.net/de';
  assert.deepEqual(view.command('reveal'), { handled: false });
});

test('the toolbar badge follows ready and error states without repeated messages', () => {
  const view = ui();
  assert.deepEqual(view.badges(), ['idle']);
  view.ready(); view.ready();
  view.statusEvent({ state: 'loading', size: 0, received: 10, total: 100 });
  view.statusEvent({ state: 'error', size: 0, errorCode: 'http', error: 'HTTP 500' });
  assert.deepEqual(view.badges(), ['idle', 'ready', 'idle', 'error']);
  view.context.dispatchEvent(new Event('pagehide'));
  assert.equal(view.badges().at(-1), 'idle');
  assert.equal(view.timers.size, 0);
});

test('capture status carries progress and stable error codes from the page world', async () => {
  let controller;
  const total = 300 * 1024;
  const response = new Response(new ReadableStream({ start(value) { controller = value; } }), {
    headers: { 'content-type': 'application/pdf', 'content-length': String(total) }
  });
  const { context } = environment({ fetch: async () => response });
  load(context, 'inject.js');
  const updates = [];
  context.addEventListener('sd-pdf-status', event => updates.push(JSON.parse(event.detail)));
  await context.fetch(SOURCE);
  assert.equal(updates.at(-1).state, 'loading');
  assert.equal(updates.at(-1).total, total);
  controller.enqueue(new Uint8Array(150 * 1024)); await tick(); await tick();
  assert.equal(updates.at(-1).received, 150 * 1024);
  const count = updates.length;
  controller.enqueue(new Uint8Array(1024)); await tick(); await tick();
  assert.equal(updates.length, count, 'small chunks are throttled');
  controller.close(); await tick(); await tick();
  assert.equal(updates.at(-1).state, 'error');
  assert.equal(updates.at(-1).errorCode, 'incomplete');

  for (const [httpStatus, headers, code] of [[206, { 'content-range': 'bytes 0-1/2' }, 'partial'], [403, {}, 'http'],
    [200, { 'content-length': String(41 * 1024 * 1024) }, 'tooLarge']]) {
    const env = environment({ fetch: async () => new Response(PDF, { status: httpStatus, headers }) });
    load(env.context, 'inject.js');
    await env.context.fetch(SOURCE);
    assert.equal(status(env.context).errorCode, code);
    assert.equal((await exportPdf(env.context)).errorCode, code);
  }
  const changed = environment(); load(changed.context, 'inject.js');
  assert.equal((await exportPdf(changed.context, { documentId: '999' })).errorCode, 'changed');
});

const locales = Object.fromEntries(['en', 'de'].map(lang =>
  [lang, JSON.parse(fs.readFileSync(path.join(root, '_locales', lang, 'messages.json'), 'utf8'))]));
const source = name => fs.readFileSync(path.join(root, name), 'utf8');

test('English and German messages are complete, matched and use proper ellipses', () => {
  assert.deepEqual(Object.keys(locales.de).sort(), Object.keys(locales.en).sort());
  for (const [key, entry] of Object.entries(locales.en)) {
    const german = locales.de[key];
    assert.deepEqual(Object.keys(german.placeholders || {}), Object.keys(entry.placeholders || {}), key);
    for (const message of [entry.message, german.message]) {
      assert.ok(message.trim(), key);
      assert.doesNotMatch(message, /\.\.\./, key);
      for (const [, name] of message.matchAll(/\$([A-Za-z0-9_]+)\$/g)) assert.ok(entry.placeholders?.[name.toLowerCase()], `${key}: ${name}`);
    }
  }
});

test('every message key used at runtime exists', () => {
  const used = new Set();
  const content = source('content.js');
  for (const [, key] of content.matchAll(/\bt\('(\w+)'/g)) used.add(key);
  for (const [, key] of content.matchAll(/: '(error[A-Z]\w+)'/g)) used.add(key);
  for (const [, key] of source('background.js').matchAll(/(?:title: |actionTitle\(|getMessage\()'(\w+)'/g)) used.add(key);
  for (const [, key] of source('onboarding.js').matchAll(/message\('(\w+)'/g)) used.add(key);
  for (const [, key] of source('onboarding.html').matchAll(/data-i18n="(\w+)"/g)) used.add(key);
  for (const [, key] of source('manifest.json').matchAll(/__MSG_(\w+)__/g)) used.add(key);
  assert.ok(used.size > 40);
  for (const key of used) assert.ok(locales.en[key], `missing message: ${key}`);
});

test('the manifest stays minimal: downloads only, local help, Alt+Shift+D command', () => {
  const manifest = JSON.parse(source('manifest.json'));
  assert.deepEqual(manifest.permissions, ['downloads']);
  assert.equal(manifest.host_permissions, undefined);
  assert.equal(manifest.web_accessible_resources, undefined);
  assert.equal(manifest.commands['download-pdf'].suggested_key.default, 'Alt+Shift+D');
  assert.equal(manifest.default_locale, 'en');
  assert.equal(manifest.action.default_popup, undefined, 'a popup would disable action.onClicked');
  for (const name of ['background.js', 'content.js', 'onboarding.js', 'onboarding.html']) {
    assert.doesNotMatch(source(name), /\bfetch\(|XMLHttpRequest|https?:\/\/(?!www\.studydrive)/, name);
  }
});
