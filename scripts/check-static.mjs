import fs from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const root = fileURLToPath(new URL('../', import.meta.url));
const { files } = JSON.parse(await fs.readFile(path.join(root, '.static-files.json'), 'utf8'));
for (const file of files) await fs.access(path.join(root, file));
const html = await fs.readFile(path.join(root, 'index.html'), 'utf8');
if (/\/src\/|@vite\/client|src="\/|href="\/(?!\/)/.test(html)) throw new Error('Entry point still contains development or origin-absolute paths.');
const assets = [...html.matchAll(/(?:src|href)="([^"#]+)"/g)].map(m => m[1]).filter(url => !/^(https?:|data:)/.test(url) && url !== './');
for (const base of ['https://example.test/', 'https://iamnhuman.github.io/interior/', 'https://iamnhuman.github.io/interior/index.html']) {
  const page = new URL(base);
  const directory = new URL('./', page);
  for (const asset of assets) {
    const url = new URL(asset, page);
    if (!url.href.startsWith(directory.href)) throw new Error(`Asset escaped its deployed directory: ${asset}`);
    await fs.access(path.join(root, decodeURIComponent(url.pathname.slice(directory.pathname.length))));
  }
}
const worker = files.find(file => /^assets\/model\.worker-.+\.js$/.test(file));
const wasm = files.find(file => /^assets\/web-ifc-.+\.wasm$/.test(file));
if (!worker || !wasm) throw new Error('Worker or IFC WebAssembly is missing.');
const code = await fs.readFile(path.join(root, worker), 'utf8');
if (!code.includes(path.basename(wasm)) || code.includes('"/assets/') || code.includes('"/models/')) throw new Error('Worker has invalid static asset paths.');
for (const file of files.filter(file => file.endsWith('.js'))) {
  const source = await fs.readFile(path.join(root, file), 'utf8');
  if (/["']\/(?:models|assets)\//.test(source)) throw new Error(`Origin-absolute URL in ${file}`);
}
console.log(`Static entry, ${files.length} files, worker and WebAssembly verified for / and /interior/.`);
