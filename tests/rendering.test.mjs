import test from 'node:test';
import assert from 'node:assert/strict';
import { BackSide, Box3, DirectionalLight, DoubleSide, FrontSide, Mesh, MeshStandardMaterial, PerspectiveCamera, Vector3 } from 'three';
import { rendererOptions, setModelDepthRange, stabilizeSurfaceMaterial, setSurfaceShadowPolicy, fitModelShadow } from '../src/lib/rendering.mjs';

test('nearby surfaces no longer collapse to the same 24-bit depth at room viewing distances', () => {
  const camera = new PerspectiveCamera(40, 1, 0.002, 2000);
  const quantize = depth => Math.round(depth * (2 ** 24 - 1));
  const originalDepth = distance => (new Vector3(0, 0, -distance).applyMatrix4(camera.projectionMatrix).z + 1) / 2;
  assert.equal(quantize(originalDepth(10)), quantize(originalDepth(10.00001)));
  setModelDepthRange(camera, 20);
  assert.equal(rendererOptions.logarithmicDepthBuffer, true);
  // The perspective depth encoding used by Three.js's logdepthbuf_fragment.
  const depth = distance => Math.log2(1 + distance) / Math.log2(camera.far + 1);
  assert.ok(quantize(depth(10.00001)) > quantize(depth(10)));
  assert.ok(camera.far > 20 * 12 + 20); // includes maximum orbit distance plus the model
});

test('glass stays visible from both sides but cannot write depth or receive opaque shadows', () => {
  const material = new MeshStandardMaterial({ transparent: true, opacity: 0.31, side: DoubleSide });
  stabilizeSurfaceMaterial(material);const mesh = new Mesh(undefined, material);setSurfaceShadowPolicy(mesh);
  assert.equal(material.side, DoubleSide);assert.equal(material.depthWrite, false);assert.equal(material.forceSinglePass, true);
  assert.equal(material.opacity, 0.31);assert.equal(mesh.castShadow, false);assert.equal(mesh.receiveShadow, false);
  const clone = material.clone();assert.equal(clone.depthWrite, false);assert.equal(clone.forceSinglePass, true);
});

test('opaque surfaces retain source culling and write depth while casting back-face shadows', () => {
  for (const side of [FrontSide, DoubleSide]) {
    const material = new MeshStandardMaterial({ side });stabilizeSurfaceMaterial(material);
    const mesh = new Mesh(undefined, material);setSurfaceShadowPolicy(mesh);
    assert.equal(material.side, side);assert.equal(material.depthWrite, true);assert.equal(material.shadowSide, BackSide);
    assert.equal(mesh.castShadow, true);assert.equal(mesh.receiveShadow, true);
  }
});

test('shadow camera covers all model corners without the former oversized depth range', () => {
  const bounds = new Box3(new Vector3(-7.5, 0, -7), new Vector3(7.5, 5.4, 7));
  const diagonal = bounds.getSize(new Vector3()).length(), light = new DirectionalLight();
  fitModelShadow(light, bounds, diagonal);const camera = light.shadow.camera;
  for (const x of [bounds.min.x, bounds.max.x]) for (const y of [bounds.min.y, bounds.max.y]) for (const z of [bounds.min.z, bounds.max.z]) {
    const p = new Vector3(x, y, z).applyMatrix4(camera.matrixWorldInverse).applyMatrix4(camera.projectionMatrix);
    assert.ok(Math.abs(p.x) < 1 && Math.abs(p.y) < 1 && Math.abs(p.z) < 1);
  }
  assert.ok(camera.far - camera.near < diagonal * 1.2);
  assert.ok(camera.right - camera.left < diagonal * 2);
  assert.ok(light.shadow.normalBias < 0.025);
});
