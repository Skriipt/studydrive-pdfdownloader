const test = require('node:test');
const assert = require('node:assert/strict');
const { readFileSync } = require('node:fs');
const { join } = require('node:path');
const vm = require('node:vm');

function loadUtils() {
  const context = { window: {}, console };
  context.globalThis = context;
  vm.createContext(context);
  vm.runInContext(readFileSync(join(__dirname, '..', 'utils.js'), 'utf8'), context);
  return context.window.SDUtils;
}

test('sanitizeFilename keeps normal PDF names', () => {
  const utils = loadUtils();
  assert.equal(utils.sanitizeFilename('Summary.pdf'), 'Summary.pdf');
});

test('sanitizeFilename removes path separators and invalid characters', () => {
  const utils = loadUtils();
  assert.equal(utils.sanitizeFilename('folder\\bad:name?.docx'), 'folder-bad-name.pdf');
});

test('sanitizeFilename falls back for empty names', () => {
  const utils = loadUtils();
  assert.equal(utils.sanitizeFilename('   '), 'studydrive-document.pdf');
});

test('arrayBufferLooksLikePdf accepts buffers with a PDF header', () => {
  const utils = loadUtils();
  const buffer = new TextEncoder().encode('prefix %PDF-1.7\ncontent').buffer;
  assert.equal(utils.arrayBufferLooksLikePdf(buffer), true);
});

test('arrayBufferLooksLikePdf rejects non-PDF buffers', () => {
  const utils = loadUtils();
  const buffer = new TextEncoder().encode('not a pdf').buffer;
  assert.equal(utils.arrayBufferLooksLikePdf(buffer), false);
});

test('parseEventDetail handles JSON strings safely', () => {
  const utils = loadUtils();
  const detail = JSON.parse(JSON.stringify(utils.parseEventDetail('{"requestId":"1","size":10}')));
  assert.deepEqual(detail, {
    requestId: '1',
    size: 10
  });
  assert.equal(utils.parseEventDetail('{bad json'), null);
});
