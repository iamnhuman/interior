import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { pageAssetUrl } from '../src/lib/urls.mjs';

test('model URLs remain inside GitHub Pages project directory for both index URLs', () => {
  for (const base of ['https://iamnhuman.github.io/interior/', 'https://iamnhuman.github.io/interior/index.html']) {
    assert.equal(pageAssetUrl('models/T2_Ap.ifc.json', base), 'https://iamnhuman.github.io/interior/models/T2_Ap.ifc.json');
    assert.equal(pageAssetUrl('models/T2_Ap-skp.glb', base), 'https://iamnhuman.github.io/interior/models/T2_Ap-skp.glb');
  }
  assert.equal(pageAssetUrl('models/T2_Ap.ifc.bin', 'http://localhost:5173/'), 'http://localhost:5173/models/T2_Ap.ifc.bin');
});

test('repository-root index is prebuilt and loads its local assets with relative URLs', () => {
  const html = fs.readFileSync('index.html', 'utf8');
  assert.doesNotMatch(html, /\/src\/|@vite\/client/);
  const modules = [...html.matchAll(/<script[^>]*src="([^"]+)"/g)].map(m => m[1]);
  assert.ok(modules.length);
  for (const module of modules) {assert.match(module, /^\.\/assets\/.+\.js$/);assert.ok(fs.existsSync(module));}
  assert.ok(fs.existsSync('.nojekyll'));
});
