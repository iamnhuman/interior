import test from 'node:test';
import assert from 'node:assert/strict';
import { Box3, Box3Helper, BoxGeometry, DoubleSide, Group, Mesh, MeshStandardMaterial, OrthographicCamera, PerspectiveCamera, Raycaster, Vector2, Vector3 } from 'three';
import { FreeFlyControls, forwardTarget, orbitFromCamera, perspectiveForFlight } from '../src/lib/free-fly.mjs';
import { ModelViewer } from '../src/viewer.js';

const close = (a, b, epsilon = 1e-8) => assert.ok(Math.abs(a - b) < epsilon, `${a} != ${b}`);

test('flight follows the viewing direction at the same speed at 30 and 120 frames per second', () => {
  const result = fps => {
    const camera = new PerspectiveCamera();camera.rotation.y = Math.PI / 2;
    const fly = new FreeFlyControls(camera);fly.movementSpeed = 2;fly.keys.add('KeyW');
    for (let i = 0; i < fps; i++) fly.update(1 / fps);
    return camera.position;
  };
  const a = result(30), b = result(120);close(a.distanceTo(b), 0);close(a.x, -2);close(a.z, 0);
});

test('diagonal flight is normalized, Shift accelerates, and height is world-vertical', () => {
  const camera = new PerspectiveCamera(), fly = new FreeFlyControls(camera);fly.movementSpeed = 2;
  fly.keys.add('KeyW');fly.keys.add('KeyD');fly.update(0.05);close(camera.position.length(), 0.1);
  camera.position.set(0, 0, 0);fly.keys.add('ShiftLeft');fly.update(0.05);close(camera.position.length(), 0.4);
  camera.position.set(0, 0, 0);camera.rotation.set(1, 0.5, 0.3);fly.reset();fly.setMotion('up', true);fly.update(0.05);
  close(camera.position.x, 0);close(camera.position.y, 0.1);close(camera.position.z, 0);
});

test('pausing a tab cannot cause a large flight jump and resetting stops held movement', () => {
  const camera = new PerspectiveCamera(), fly = new FreeFlyControls(camera);fly.movementSpeed = 2;fly.keys.add('KeyW');
  fly.update(30);close(camera.position.length(), 0.1);
  const position = camera.position.clone();fly.reset();fly.update(0.05);close(camera.position.distanceTo(position), 0);
});

test('mouse look changes aim without orbiting the camera and returning to orbit retains position and roll', () => {
  const camera = new PerspectiveCamera();camera.position.set(2, 1.6, 4);
  const fly = new FreeFlyControls(camera), position = camera.position.clone();fly.look(140, -60);
  close(camera.position.distanceTo(position), 0);assert.ok(Math.abs(camera.quaternion.y) > 0.1);
  fly.keys.add('KeyZ');fly.update(0.05);const quaternion = camera.quaternion.clone();
  const controls = orbitFromCamera(camera, 3);controls.update();
  close(camera.position.distanceTo(position), 0);close(Math.abs(camera.quaternion.dot(quaternion)), 1);
  close(controls.target.distanceTo(forwardTarget(camera, 3)), 0);
});

test('flight can start from an orthographic plan while keeping its framing and direction', () => {
  const old = new OrthographicCamera(-8, 8, 6, -6, 0.02, 500);old.zoom = 2;old.position.set(0, 20, 0);old.lookAt(0, 0, 0);old.updateProjectionMatrix();
  const camera = perspectiveForFlight(old, new Vector3(), 4 / 3);
  assert.ok(camera.isPerspectiveCamera);close(Math.abs(camera.quaternion.dot(old.quaternion)), 1);
  const distance = camera.position.length();close(distance * 2 * Math.tan(camera.fov * Math.PI / 360), 6);
});

test('flight ignores form focus, stops on blur, and removes keyboard listeners when disposed', () => {
  const window = new EventTarget(), document = new EventTarget();document.defaultView = window;document.hidden = false;
  const canvas = new EventTarget();canvas.ownerDocument = document;canvas.focus = () => {document.activeElement = canvas;};
  canvas.hasPointerCapture = () => false;const camera = new PerspectiveCamera(), fly = new FreeFlyControls(camera, canvas);
  const key = () => Object.assign(new Event('keydown', { cancelable: true }), { code: 'KeyW' });
  document.activeElement = { tagName: 'INPUT' };window.dispatchEvent(key());fly.update(0.05);close(camera.position.length(), 0);
  canvas.focus();window.dispatchEvent(key());fly.update(0.05);assert.ok(camera.position.length() > 0);
  const position = camera.position.clone();window.dispatchEvent(new Event('blur'));fly.update(0.05);close(camera.position.distanceTo(position), 0);
  fly.dispose();window.dispatchEvent(key());fly.update(0.05);close(camera.position.distanceTo(position), 0);
});

function hoverScene() {
  const viewer = Object.create(ModelViewer.prototype);
  viewer.settings = { dimensions: true };viewer.hovered = null;viewer.selected = null;viewer.pointerDown = null;viewer.hoverDirty = true;
  viewer.bounds = new Box3(new Vector3(-5, -5, -5), new Vector3(5, 5, 5));viewer.dimensionGroup = new Group();viewer.measureGroup = new Group();
  viewer.hoverBox = new Box3Helper(new Box3());viewer.selectionBox = new Box3Helper(new Box3());viewer.events = [];viewer.emit = (type, detail) => viewer.events.push({ type, detail });
  viewer.label = (text, point) => {const label = new Group();label.userData.label = text;label.position.copy(point);return label;};
  const make = (id, size, z) => {
    const mesh = new Mesh(new BoxGeometry(...size), new MeshStandardMaterial({ side: DoubleSide }));mesh.position.z = z;mesh.updateMatrixWorld();
    const element = { id, name: id, layer: id, meshes: [mesh] };mesh.userData.element = element;return element;
  };
  viewer.elements = [make('A', [1, 2, 1], 0), make('B', [2, 3, 4], -4)];
  viewer.layers = new Map(viewer.elements.map(e => [e.layer, { visible: true }]));viewer.pickableMeshes = viewer.elements.flatMap(e => e.meshes);
  viewer.camera = new PerspectiveCamera(40, 1, 0.01, 100);viewer.camera.position.set(0, 0, 5);viewer.camera.lookAt(0, 0, 0);
  viewer.renderer = { domElement: { getBoundingClientRect: () => ({ left: 0, top: 0, width: 100, height: 100 }) }, clippingPlanes: [] };
  viewer.container = { getBoundingClientRect: () => ({ left: 0, top: 0, width: 100, height: 100 }) };
  viewer.raycaster = new Raycaster();viewer.pointer = new Vector2();viewer.hoverPoint = { clientX: 50, clientY: 50 };
  return viewer;
}
const labels = viewer => viewer.dimensionGroup.children.map(o => o.userData.label).filter(Boolean);

test('hover dimensions follow the pointed object without changing the material selection', () => {
  const viewer = hoverScene(), [a, b] = viewer.elements;viewer.select(a);viewer.setHovered(b);
  assert.equal(viewer.selected, a);assert.deepEqual(labels(viewer), ['2,00 м', '4,00 м', '3,00 м']);
  viewer.setHovered(null);assert.deepEqual(labels(viewer), ['1,00 м', '1,00 м', '2,00 м']);
  viewer.setHovered(b);viewer.setSetting('dimensions', false);assert.equal(viewer.hovered, null);assert.equal(viewer.hoverBox.visible, false);assert.equal(viewer.dimensionGroup.children.length, 0);
});

test('hover picking skips hidden and clipped objects and is throttled during camera movement', () => {
  const viewer = hoverScene(), [a, b] = viewer.elements;viewer.updateHover(100);assert.equal(viewer.hovered, a);
  viewer.setLayer('A', false);assert.equal(viewer.hovered, null);viewer.updateHover(120);assert.equal(viewer.hovered, null);
  viewer.updateHover(171);assert.equal(viewer.hovered, b);
  viewer.setLayer('A', true);viewer.renderer.clippingPlanes = [{ distanceToPoint: point => -point.z - 1.1 }];viewer.updateHover(250);assert.equal(viewer.hovered, b);
});

test('object bounds exclude child objects that belong to another element', () => {
  const viewer = hoverScene(), mesh = viewer.elements[0].meshes[0];
  const child = new Mesh(new BoxGeometry(10, 10, 10));child.position.x = 50;mesh.add(child);mesh.updateMatrixWorld(true);
  const size = viewer.boxFor(viewer.elements[0]).getSize(new Vector3());assert.deepEqual(size.toArray(), [1, 2, 1]);
});
