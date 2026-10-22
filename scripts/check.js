const assert = require('node:assert/strict');
const { execFileSync } = require('node:child_process');
const { readFileSync, readdirSync, existsSync } = require('node:fs');
const { join } = require('node:path');

const root = join(__dirname, '..');
function checkSyntax(dir) {
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    if (['.git', 'node_modules'].includes(entry.name)) continue;
    const path = join(dir, entry.name);
    if (entry.isDirectory()) checkSyntax(path);
    else if (entry.name.endsWith('.js')) execFileSync(process.execPath, ['--check', path], { stdio: 'inherit' });
  }
}

const manifest = JSON.parse(readFileSync(join(root, 'manifest.json'), 'utf8'));
const files = [manifest.background.service_worker, ...Object.values(manifest.icons),
  ...manifest.content_scripts.flatMap(script => [...script.js, ...(script.css || [])])];
for (const file of files) assert.ok(existsSync(join(root, file)), `Missing manifest resource: ${file}`);
for (const [size, filename] of Object.entries(manifest.icons)) {
  const png = readFileSync(join(root, filename));
  assert.equal(png.subarray(0, 8).toString('hex'), '89504e470d0a1a0a', `${filename}: not a PNG`);
  assert.equal(png.readUInt32BE(16), Number(size), `${filename}: wrong width`);
  assert.equal(png.readUInt32BE(20), Number(size), `${filename}: wrong height`);
}
checkSyntax(root);
console.log('JavaScript syntax, manifest resources and icon dimensions passed.');
execFileSync(process.execPath, ['--test', join(root, 'tests', 'extension.test.js')], { stdio: 'inherit' });
