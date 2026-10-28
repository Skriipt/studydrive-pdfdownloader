// Native XHR/Worker regression coverage; no StudyDrive requests, login or downloads.
import { spawn } from 'node:child_process';
import { readFileSync, mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { once } from 'node:events';
import assert from 'node:assert/strict';

const sources = ['utils.js', 'inject.js'].map(name =>
  readFileSync(new URL('../extension/' + name, import.meta.url), 'utf8'));
const profile = mkdtempSync(join(tmpdir(), 'sd-capture-'));
const proc = spawn(process.env.CHROME_BIN || 'chromium-browser', [
  '--headless=new', '--no-sandbox', '--disable-gpu', '--disable-background-networking',
  '--remote-debugging-port=0', '--user-data-dir=' + profile, 'about:blank'
], { stdio: 'ignore' });
const pause = ms => new Promise(resolve => setTimeout(resolve, ms));
let socket;
let launchError;
let timeout;
proc.on('error', error => { launchError = error; });
try {
  let targets;
  for (let i = 0; i < 50; i++) {
    if (launchError) throw launchError;
    try {
      const port = readFileSync(join(profile, 'DevToolsActivePort'), 'utf8').split('\n')[0];
      targets = await (await fetch('http://127.0.0.1:' + port + '/json')).json();
      break;
    } catch { await pause(100); }
  }
  assert(targets, 'Chromium did not start; set CHROME_BIN to a headless Chromium executable.');
  socket = new WebSocket(targets.find(target => target.type === 'page').webSocketDebuggerUrl);
  await new Promise((resolve, reject) => { socket.onopen = resolve; socket.onerror = reject; });
  let nextId = 0;
  const pending = new Map();
  socket.onmessage = event => {
    const message = JSON.parse(event.data);
    pending.get(message.id)?.(message);
    pending.delete(message.id);
  };
  const send = (method, params) => new Promise((resolve, reject) => {
    const id = ++nextId;
    pending.set(id, message => message.error ? reject(Error(JSON.stringify(message.error))) : resolve(message.result));
    socket.send(JSON.stringify({ id, method, params }));
  });
  const exercise = async (utilsSource, injectSource) => {
    const pdf = '%PDF-1.7\n1 0 obj\n<<>>\nendobj\nstartxref\n0\n%%EOF\n';
    const source = 'https://cdn.studydrive.net/capture-fixture.pdf';
    const location = { href: 'https://www.studydrive.net/de' };
    const history = { pushState(_state, _title, url) { location.href = url; }, replaceState() {} };
    const blobUrl = URL.createObjectURL(new Blob([pdf], { type: 'application/pdf' }));
    const originalOpen = XMLHttpRequest.prototype.open;
    XMLHttpRequest.prototype.open = function (method, _url, ...rest) {
      return originalOpen.call(this, method, blobUrl, ...rest);
    };
    const workerUrl = URL.createObjectURL(new Blob(['onmessage = event => postMessage(event.data.byteLength)'], { type: 'text/javascript' }));
    const worker = new Worker(workerUrl);
    const transfer = buffer => new Promise((resolve, reject) => {
      worker.onmessage = event => resolve(event.data);
      worker.onerror = reject;
      worker.postMessage(buffer, [buffer]);
    });
    let lastStatus;
    window.addEventListener('sd-pdf-status', event => { lastStatus = JSON.parse(event.detail); });
    new Function(utilsSource)();
    new Function('location', 'history', injectSource)(location, history);
    const results = [];
    try {
      for (const [index, mode] of ['early-transfer', 'late-transfer', 'mutation'].entries()) {
        const documentId = String(index + 1);
        window.sdWindow = { document: { id: documentId, filename: 'fixture.pdf', file_preview: source } };
        history.pushState(null, '', 'https://www.studydrive.net/de/doc/fixture/' + documentId);
        const xhr = new XMLHttpRequest();
        xhr.open('GET', source);
        xhr.responseType = 'arraybuffer';
        let workerResult;
        await new Promise((resolve, reject) => {
          // Registered before send(), just like a viewer's existing load handler.
          xhr.addEventListener('load', () => {
            if (mode === 'early-transfer') workerResult = transfer(xhr.response);
            resolve();
          });
          xhr.addEventListener('error', reject);
          xhr.send();
        });
        // Native event dispatch may run promise reactions between listeners.
        // Give every load listener a turn before testing changes after capture.
        await new Promise(resolve => setTimeout(resolve, 0));
        if (mode === 'late-transfer') workerResult = transfer(xhr.response);
        if (mode === 'mutation') new Uint8Array(xhr.response).fill(0);
        const transferredSize = workerResult ? await workerResult : null;
        window.dispatchEvent(new CustomEvent('sd-pdf-status-request'));
        const exported = await new Promise(resolve => {
          window.addEventListener('sd-export-result', event => resolve(JSON.parse(event.detail)), { once: true });
          window.dispatchEvent(new CustomEvent('sd-export-pdf', { detail: JSON.stringify({
            requestId: mode, documentId, sourceUrl: source
          }) }));
        });
        results.push({ mode, transferredSize, detached: xhr.response.byteLength === 0,
          status: lastStatus.state, size: lastStatus.size, exported, expected: btoa(pdf) });
      }
      return results;
    } finally {
      worker.terminate();
      URL.revokeObjectURL(workerUrl);
      URL.revokeObjectURL(blobUrl);
    }
  };
  const result = await Promise.race([
    send('Runtime.evaluate', { expression: `(${exercise})(${sources.map(JSON.stringify).join(',')})`, awaitPromise: true, returnByValue: true }),
    new Promise((_, reject) => { timeout = setTimeout(() => reject(Error('Native XHR regression timed out.')), 10000); })
  ]);
  assert(!result.exceptionDetails, JSON.stringify(result.exceptionDetails));
  for (const item of result.result.value) {
    assert.equal(item.status, 'ready', item.mode + ': capture remains ready');
    assert.equal(item.size, 47, item.mode + ': capture retains its original size');
    assert.equal(item.exported.base64, item.expected, item.mode + ': export retains the original PDF bytes');
    assert.equal(item.exported.size, 47, item.mode + ': export reports the original size');
    if (item.mode !== 'mutation') {
      assert.equal(item.transferredSize, 47, item.mode + ': worker receives the viewer buffer');
      assert(item.detached, item.mode + ': viewer buffer was detached by transfer');
    }
  }
  console.log('PASS: native XHR capture survives earlier load handlers, Worker transfers and page buffer mutation.');
} finally {
  clearTimeout(timeout);
  socket?.close();
  if (proc.exitCode === null && proc.pid) {
    const exited = once(proc, 'exit');
    proc.kill();
    await exited;
  }
  rmSync(profile, { recursive: true, force: true, maxRetries: 5, retryDelay: 100 });
}
