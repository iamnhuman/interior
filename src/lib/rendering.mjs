import { BackSide, Vector3 } from 'three';

export const rendererOptions = { antialias: true, alpha: true, logarithmicDepthBuffer: true };

// Avoid losing millimetre details when the camera is close to an architectural model.
export function setModelDepthRange(camera, diagonal) {
  camera.near = Math.max(0.005, Math.min(0.03, diagonal * 0.001));
  camera.far = Math.max(diagonal * 24, camera.near * 100);
  camera.updateProjectionMatrix();
}

export function stabilizeSurfaceMaterial(material) {
  // Closed CAD solids are drawn double-sided for interior navigation. Their
  // shadow pass must use back faces, otherwise the front surface shadows itself.
  material.shadowSide = BackSide;
  if (material.transparent) {
    // A pane must not occlude other panes in the depth buffer. Drawing both
    // sides in separate passes also doubles opacity on the imported glass.
    material.depthWrite = false;
    material.forceSinglePass = true;
  }
  return material;
}

export function setSurfaceShadowPolicy(mesh) {
  const transparent = mesh.material.transparent;
  mesh.castShadow = !transparent;
  mesh.receiveShadow = !transparent;
}

// Fit once to the model, not to the moving view camera: stable, higher-resolution shadows.
export function fitModelShadow(light, bounds, diagonal) {
  const center = bounds.getCenter(new Vector3());
  light.target.position.copy(center);
  light.position.copy(center).add(new Vector3(-0.5, 1.4, 0.7).multiplyScalar(diagonal));
  light.updateMatrixWorld(true);light.target.updateMatrixWorld(true);
  light.shadow.updateMatrices(light);
  const camera = light.shadow.camera;
  let minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity, minZ = Infinity, maxZ = -Infinity;
  const p = new Vector3();
  for (const x of [bounds.min.x, bounds.max.x]) for (const y of [bounds.min.y, bounds.max.y]) for (const z of [bounds.min.z, bounds.max.z]) {
    p.set(x, y, z).applyMatrix4(camera.matrixWorldInverse);
    minX = Math.min(minX, p.x);maxX = Math.max(maxX, p.x);
    minY = Math.min(minY, p.y);maxY = Math.max(maxY, p.y);
    minZ = Math.min(minZ, p.z);maxZ = Math.max(maxZ, p.z);
  }
  const margin = Math.max(diagonal * 0.04, 0.02);
  Object.assign(camera, { left: minX - margin, right: maxX + margin, bottom: minY - margin, top: maxY + margin, near: Math.max(0.01, -maxZ - margin), far: -minZ + margin });
  camera.updateProjectionMatrix();
  light.shadow.bias = -0.0002;
  light.shadow.normalBias = Math.max(0.002, Math.min(diagonal * 0.0005, 0.02));
  light.shadow.needsUpdate = true;
}
