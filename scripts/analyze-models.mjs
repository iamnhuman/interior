import fs from 'node:fs/promises';
import { parseSkp } from '../vendor/openskp/index.mjs';

const ifc = await fs.readFile('T2_Ap.ifc', 'utf8');
const bytes = await fs.readFile('T2_Ap+.skp');
const skp = parseSkp(bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength));
const decodeIfc = s => s.replace(/\\X2\\([0-9A-Fa-f]+)\\X0\\/g, (_, hex) => {
  const b = Buffer.from(hex, 'hex');b.swap16();return b.toString('utf16le');
});
const entityCounts = {};
for (const match of ifc.matchAll(/#\d+\s*=\s*(IFC\w+)\(/g)) entityCounts[match[1]] = (entityCounts[match[1]] || 0) + 1;
const layerNames = [...ifc.matchAll(/IFCPRESENTATIONLAYERASSIGNMENT\('([^']+)'/g)].map(m => decodeIfc(m[1]));
console.log(JSON.stringify({ ifc: { fileBytes: Buffer.byteLength(ifc), schema: /FILE_SCHEMA\(\('([^']+)'/.exec(ifc)?.[1], layerNames, surfaceStyles: entityCounts.IFCSURFACESTYLE || 0, imageTextures: entityCounts.IFCIMAGETEXTURE || 0, annotationEntities: entityCounts.IFCANNOTATION || 0, entityCounts }, skp: { fileBytes: bytes.byteLength, version: skp.version, layers: skp.layers.map(l => l.name), definitions: skp.definitions.size, materials: skp.materials.map(m => ({ name: m.name, texture: m.texture ? { filename: m.texture.filename, width: m.texture.width, height: m.texture.height, bytes: m.texture.data?.byteLength || 0 } : null })) } }, null, 2));
