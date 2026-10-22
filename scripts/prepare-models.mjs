import fs from 'node:fs/promises';
import { IfcAPI, LogLevel } from 'web-ifc';
import { extractIfc, packIfc } from '../src/lib/ifc.mjs';
import { convertSkp } from '../src/lib/skp.mjs';

await fs.mkdir('public/models', { recursive: true });
const api = new IfcAPI();await api.Init();api.SetLogLevel(LogLevel.LOG_LEVEL_OFF);
const start = Date.now();
const ifc = extractIfc(api, new Uint8Array(await fs.readFile('T2_Ap.ifc')));
const { manifest, binary } = packIfc(ifc);
await fs.writeFile('public/models/T2_Ap.ifc.json', JSON.stringify(manifest));
await fs.writeFile('public/models/T2_Ap.ifc.bin', binary);
const skp = await fs.readFile('T2_Ap+.skp');
const converted = convertSkp(skp.buffer.slice(skp.byteOffset, skp.byteOffset + skp.byteLength));
await fs.writeFile('public/models/T2_Ap-skp.glb', converted.glb);
const report = { generatedAt: new Date().toISOString(), ifc: { elements: ifc.elements.length, parts: ifc.elements.reduce((n, e) => n + e.parts.length, 0), triangles: ifc.elements.reduce((n, e) => n + e.parts.reduce((s, p) => s + ifc.geometries[p.geometry].indices.length / 3, 0), 0), layers: ifc.layers.map(name => ({ name, count: ifc.elements.filter(e => e.layer === name).length })), materials: ifc.styles, skipped: ifc.skipped }, skp: converted.summary };
await fs.writeFile('public/models/report.json', JSON.stringify(report, null, 2));
console.log(JSON.stringify({ seconds: (Date.now() - start) / 1000, ...report }, null, 2));
