import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { Matrix4, Box3, Vector3 } from 'three';
import validator from 'gltf-validator';
import { packIfc, unpackIfc } from '../src/lib/ifc.mjs';

const manifest = JSON.parse(fs.readFileSync('public/models/T2_Ap.ifc.json', 'utf8'));
const raw = fs.readFileSync('public/models/T2_Ap.ifc.bin');
const buffer = raw.buffer.slice(raw.byteOffset, raw.byteOffset + raw.byteLength);
const model = unpackIfc(manifest, buffer);
const glb = fs.readFileSync('public/models/T2_Ap-skp.glb');
const gltf = JSON.parse(glb.subarray(20, 20 + glb.readUInt32LE(12)).toString());

test('IFC caches retain all 186 elements and their six source layers', () => {
  assert.equal(model.elements.length, 186);assert.equal(model.layers.length, 6);assert.equal(model.units, 'm');
  assert.equal(new Set(model.elements.map(e => e.id)).size, 186);
  for (const element of model.elements) {
    assert.ok(model.layers.includes(element.layer));assert.ok(element.guid);assert.ok(element.parts.length);
    for (const part of element.parts) {assert.ok(model.geometries[part.geometry]);assert.equal(part.matrix.length, 16);assert.ok(part.matrix.every(Number.isFinite));}
  }
});

test('IFC triangle indices reference finite vertices without corrupt buffer offsets', () => {
  for (const geometry of model.geometries) {
    assert.equal(geometry.vertices.length % 6, 0);assert.equal(geometry.indices.length % 3, 0);assert.ok(geometry.vertices.every(Number.isFinite));
    const vertexCount = geometry.vertices.length / 6;
    for (const index of geometry.indices) assert.ok(index < vertexCount);
  }
  const packed = packIfc(model);assert.deepEqual(packed.binary, new Uint8Array(buffer));assert.deepEqual(packed.manifest, manifest);
});

test('IFC transforms preserve real metre scale (5.4 m total height)', () => {
  const box = new Box3(), point = new Vector3();
  for (const element of model.elements) for (const part of element.parts) {
    const matrix = new Matrix4().fromArray(part.matrix), vertices = model.geometries[part.geometry].vertices;
    for (let i = 0; i < vertices.length; i += 6) box.expandByPoint(point.set(vertices[i], vertices[i + 1], vertices[i + 2]).applyMatrix4(matrix));
  }
  assert.ok(Math.abs(box.getSize(new Vector3()).y - 5.4) < 0.00001);
  const triangles = model.elements.reduce((n, e) => n + e.parts.reduce((s, p) => s + model.geometries[p.geometry].indices.length / 3, 0), 0);
  assert.equal(triangles, 133320);
});

test('SketchUp GLB includes both original texture images and layer metadata', () => {
  assert.equal(glb.readUInt32LE(0), 0x46546c67);assert.equal(glb.readUInt32LE(4), 2);assert.equal(glb.readUInt32LE(8), glb.length);
  assert.equal(gltf.images.length, 2);assert.equal(gltf.textures.length, 2);assert.equal(gltf.nodes.length, 567);
  const rendered = gltf.nodes.filter(n => n.mesh !== undefined);assert.ok(rendered.length >= 490);
  for (const node of rendered) {assert.ok(node.extras.sourceLayer);assert.ok(node.extras.elementId);}
  assert.ok(gltf.materials.every(m => m.name));
  for (const image of gltf.images) {assert.ok(image.bufferView !== undefined);assert.ok(['image/png', 'image/jpeg'].includes(image.mimeType));}
});

test('SketchUp GLB passes the official Khronos validator with no errors', async () => {
  const result = await validator.validateBytes(new Uint8Array(glb), { maxIssues: 0 });
  assert.equal(result.issues.truncated, false);
  assert.equal(result.issues.numErrors, 0, JSON.stringify(result.issues.messages, null, 2));
  assert.equal(result.issues.numWarnings, 0);
});
