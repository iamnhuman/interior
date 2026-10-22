import { EventDispatcher, PerspectiveCamera, Quaternion, Vector3 } from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';

const WORLD_UP = new Vector3(0, 1, 0);
const FLIGHT_KEYS = new Set(['KeyW', 'KeyA', 'KeyS', 'KeyD', 'KeyQ', 'KeyE', 'KeyZ', 'KeyC', 'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'ShiftLeft', 'ShiftRight']);

export function forwardTarget(camera, distance) {
  return camera.getWorldDirection(new Vector3()).multiplyScalar(Math.max(0.1, distance)).add(camera.position);
}

export function perspectiveForFlight(camera, target, aspect) {
  if (camera.isPerspectiveCamera) return camera;
  const next = new PerspectiveCamera(40, aspect, camera.near, camera.far);
  next.quaternion.copy(camera.quaternion);next.up.copy(camera.up);
  const distance = (camera.top - camera.bottom) / camera.zoom / (2 * Math.tan(next.fov * Math.PI / 360));
  next.position.copy(target).addScaledVector(camera.getWorldDirection(new Vector3()), -distance);
  return next;
}

export function orbitFromCamera(camera, distance, element = null) {
  const position = camera.position.clone(), quaternion = camera.quaternion.clone();
  const target = forwardTarget(camera, distance);
  camera.up.set(0, 1, 0).applyQuaternion(quaternion);
  const controls = new OrbitControls(camera, element);
  // OrbitControls initializes against the origin. Restore the fly pose and use
  // a point in front of it so returning to orbit does not jump or lose roll.
  camera.position.copy(position);camera.quaternion.copy(quaternion);controls.target.copy(target);controls.update();
  return controls;
}

// Drag-to-look leaves the cursor available for inspecting and selecting objects.
export class FreeFlyControls extends EventDispatcher {
  constructor(camera, element = null) {
    super();this.camera = camera;this.element = element;this.enabled = true;this.movementSpeed = 1.5;this.lookSensitivity = 0.003;
    this.keys = new Set();this.motion = new Set();this.drag = null;
    this.direction = new Vector3();this.forward = new Vector3();this.right = new Vector3();this.rotation = new Quaternion();
    this.listeners = [];
    if (element) this.connect();
  }
  listen(target, name, handler, options) {target.addEventListener(name, handler, options);this.listeners.push(() => target.removeEventListener(name, handler, options));}
  connect() {
    const element = this.element, document = element.ownerDocument, window = document.defaultView;
    this.listen(window, 'keydown', e => {
      if (!this.enabled || document.activeElement !== element || e.altKey || e.ctrlKey || e.metaKey) return;
      if (FLIGHT_KEYS.has(e.code)) {e.preventDefault();this.keys.add(e.code);}
    });
    this.listen(window, 'keyup', e => this.keys.delete(e.code));
    this.listen(window, 'blur', () => this.reset());
    this.listen(document, 'visibilitychange', () => {if (document.hidden) this.reset();});
    this.listen(element, 'blur', () => this.reset());
    this.listen(element, 'contextmenu', e => {if (this.enabled) e.preventDefault();});
    this.listen(element, 'pointerdown', e => {
      if (!this.enabled) return;
      element.focus({ preventScroll: true });
      if (e.button !== 2 && e.pointerType !== 'touch') return;
      e.preventDefault();this.drag = { id: e.pointerId, x: e.clientX, y: e.clientY };
      element.setPointerCapture(e.pointerId);
    });
    this.listen(element, 'pointermove', e => {
      if (!this.enabled || this.drag?.id !== e.pointerId) return;
      this.look(e.clientX - this.drag.x, e.clientY - this.drag.y);
      this.drag.x = e.clientX;this.drag.y = e.clientY;
    });
    const release = e => {
      if (this.drag?.id !== e.pointerId) return;
      this.drag = null;
      if (element.hasPointerCapture(e.pointerId)) element.releasePointerCapture(e.pointerId);
    };
    this.listen(element, 'pointerup', release);this.listen(element, 'pointercancel', release);this.listen(element, 'lostpointercapture', release);
    this.listen(element, 'wheel', e => {
      if (!this.enabled) return;
      e.preventDefault();element.focus({ preventScroll: true });
      const pixels = e.deltaY * (e.deltaMode === 1 ? 16 : e.deltaMode === 2 ? element.clientHeight : 1);
      this.camera.getWorldDirection(this.forward);
      this.camera.position.addScaledVector(this.forward, Math.max(-1, Math.min(1, -pixels * 0.0025)) * this.movementSpeed);
      this.changed();
    }, { passive: false });
  }
  changed() {this.camera.updateMatrixWorld();this.dispatchEvent({ type: 'change' });}
  look(dx, dy) {
    if (!dx && !dy) return;
    this.rotation.setFromAxisAngle(WORLD_UP, -dx * this.lookSensitivity);this.camera.quaternion.premultiply(this.rotation);
    this.camera.rotateX(-dy * this.lookSensitivity);this.camera.quaternion.normalize();this.changed();
  }
  setMotion(direction, active) {if (active) this.motion.add(direction);else this.motion.delete(direction);}
  reset() {
    this.keys.clear();this.motion.clear();
    const id = this.drag?.id;this.drag = null;
    if (id !== undefined && this.element?.hasPointerCapture(id)) this.element.releasePointerCapture(id);
  }
  update(delta) {
    if (!this.enabled) {this.reset();return false;}
    // Clear held keys if focus moved to a dialog, slider, or another app.
    if (this.element && this.element.ownerDocument.activeElement !== this.element) this.keys.clear();
    const dt = Math.max(0, Math.min(delta, 0.05));if (!dt) return false;
    const down = key => this.keys.has(key);
    const amount = (direction, key) => Number(this.motion.has(direction) || down(key));
    const x = amount('right', 'KeyD') - amount('left', 'KeyA');
    const y = amount('up', 'KeyE') - amount('down', 'KeyQ');
    const z = amount('forward', 'KeyW') - amount('back', 'KeyS');
    this.camera.getWorldDirection(this.forward);this.right.set(1, 0, 0).applyQuaternion(this.camera.quaternion);
    this.direction.copy(this.forward).multiplyScalar(z).addScaledVector(this.right, x).addScaledVector(WORLD_UP, y);
    const boost = down('ShiftLeft') || down('ShiftRight') ? 4 : 1;
    if (this.direction.lengthSq()) this.camera.position.addScaledVector(this.direction.normalize(), dt * this.movementSpeed * boost);
    const yaw = Number(down('ArrowLeft')) - Number(down('ArrowRight'));
    const pitch = Number(down('ArrowUp')) - Number(down('ArrowDown'));
    const roll = Number(down('KeyZ')) - Number(down('KeyC'));
    if (yaw) this.camera.rotateOnWorldAxis(WORLD_UP, yaw * dt);
    if (pitch) this.camera.rotateX(pitch * dt);
    if (roll) this.camera.rotateZ(roll * dt);
    const moved = !!(x || y || z || yaw || pitch || roll);
    if (moved) this.changed();return moved;
  }
  dispose() {this.reset();for (const remove of this.listeners) remove();this.listeners = [];}
}
