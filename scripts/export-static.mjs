import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('../', import.meta.url));
const dist = path.join(root, 'dist');
async function listFiles(directory, prefix = '') {
  const entries = await fs.readdir(directory, { withFileTypes: true });
  const result = [];
  for (const entry of entries) {
    const relative = path.posix.join(prefix, entry.name);
    if (entry.isDirectory()) result.push(...await listFiles(path.join(directory, entry.name), relative));
    else if (entry.isFile()) result.push(relative);
  }
  return result.sort();
}
const files = await listFiles(dist);
if (!files.includes('index.html') || !files.includes('.nojekyll')) throw new Error('Static build is missing its entry point or .nojekyll.');
const allowed = file => !file.split('/').includes('..') && /^(assets\/|models\/|index\.html$|favicon\.svg$|\.nojekyll$)/.test(file);
if (!files.every(allowed)) throw new Error('Unexpected files in the static build.');
let previous = [];
try {previous = JSON.parse(await fs.readFile(path.join(root, '.static-files.json'), 'utf8')).files;} catch (error) {if (error.code !== 'ENOENT') throw error;}
if (!Array.isArray(previous) || !previous.every(allowed)) throw new Error('Invalid previous static file manifest.');
// Remove only files owned by the previous export, never application sources.
for (const file of previous) if (!files.includes(file)) await fs.rm(path.join(root, file), { force: true });
for (const file of files) {
  await fs.mkdir(path.dirname(path.join(root, file)), { recursive: true });
  await fs.copyFile(path.join(dist, file), path.join(root, file));
}
await fs.writeFile(path.join(root, '.static-files.json'), `${JSON.stringify({ files }, null, 2)}\n`);
console.log(`Exported ${files.length} static files. Repository-root index.html is ready for static hosting.`);
