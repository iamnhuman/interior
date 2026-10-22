import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { CSS2DRenderer, CSS2DObject } from 'three/addons/renderers/CSS2DRenderer.js';
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';
import { createFinishTextures, projectedMaterial } from './textures.js';
import { rendererOptions, setModelDepthRange, stabilizeSurfaceMaterial, setSurfaceShadowPolicy, fitModelShadow } from './lib/rendering.mjs';

export const meters = n => `${n.toLocaleString('ru-RU', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} м`;
const v3 = () => new THREE.Vector3();

export class ModelViewer extends EventTarget {
  constructor(container) {
    super();this.container = container;this.elements = [];this.layers = new Map();this.selected = null;this.measurements = [];this.pendingPoint = null;this.tool = 'orbit';
    this.settings = { mode: 'original', textures: true, edges: false, dimensions: false, grid: true, section: false, sectionAxis: 'y', sectionValue: 72 };
    this.scene = new THREE.Scene();
    this.renderer = new THREE.WebGLRenderer(rendererOptions);
    this.renderer.setPixelRatio(Math.min(devicePixelRatio, 2));this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;this.renderer.toneMappingExposure = 1.18;
    this.renderer.localClippingEnabled = true;this.renderer.shadowMap.enabled = true;this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    this.renderer.domElement.setAttribute('aria-label', 'Интерактивная 3D-модель. Вращение — левая кнопка мыши, перемещение — правая, масштаб — колесо.');
    this.renderer.domElement.tabIndex = 0;container.append(this.renderer.domElement);
    this.labels = new CSS2DRenderer();this.labels.domElement.className = 'scene-labels';container.append(this.labels.domElement);
    this.scene.add(new THREE.HemisphereLight(0xf5f6ff, 0x969183, 2));
    this.keyLight = new THREE.DirectionalLight(0xfff5e4, 3.5);this.keyLight.position.set(-10, 18, 9);this.keyLight.castShadow = true;
    this.keyLight.shadow.mapSize.set(2048, 2048);this.keyLight.shadow.bias = -0.0002;this.keyLight.shadow.normalBias = 0.025;
    this.scene.add(this.keyLight, this.keyLight.target);
    const fill = new THREE.DirectionalLight(0xe3eaff, 1.3);fill.position.set(6, 10, -12);this.scene.add(fill);
    const pmrem = new THREE.PMREMGenerator(this.renderer);const room = new RoomEnvironment();
    this.environment = pmrem.fromScene(room, 0.04);this.scene.environment = this.environment.texture;this.scene.environmentIntensity = 0.25;room.dispose();pmrem.dispose();
    this.camera = new THREE.PerspectiveCamera(40, 1, 0.01, 1000);this.camera.position.set(14, 14, 14);
    this.controls = new OrbitControls(this.camera, this.renderer.domElement);this.configureControls();
    this.root = new THREE.Group();this.scene.add(this.root);
    this.measureGroup = new THREE.Group();this.dimensionGroup = new THREE.Group();this.scene.add(this.measureGroup, this.dimensionGroup);
    this.selectionBox = new THREE.Box3Helper(new THREE.Box3(), 0x2d6fdf);this.selectionBox.visible = false;this.selectionBox.material.depthTest = false;this.selectionBox.renderOrder = 5;this.scene.add(this.selectionBox);
    this.textures = createFinishTextures();this.customTextures = new Set();
    this.raycaster = new THREE.Raycaster();this.pointer = new THREE.Vector2();
    this.pointerDown = null;
    this.renderer.domElement.addEventListener('pointerdown', e => {this.pointerDown = { x: e.clientX, y: e.clientY, button: e.button };});
    this.renderer.domElement.addEventListener('pointerup', e => {
      if (!this.pointerDown || this.pointerDown.button !== 0 || Math.hypot(e.clientX - this.pointerDown.x, e.clientY - this.pointerDown.y) > 5) return;
      const hit = this.pick(e);
      if (this.tool === 'measure') {if (hit) this.measurePoint(this.snapPoint(hit, e));}
      else this.select(hit?.object.userData.element || null);
    });
    this.renderer.domElement.addEventListener('dblclick', () => {if (this.selected && this.tool === 'orbit') this.fit(this.boxFor(this.selected));});
    this.resizeObserver = new ResizeObserver(() => this.resize());this.resizeObserver.observe(container);this.resize();
    this.animate = () => {this.frame = requestAnimationFrame(this.animate);this.controls.update();this.renderer.render(this.scene, this.camera);this.labels.render(this.scene, this.camera);};this.animate();
  }

  emit(type, detail) { this.dispatchEvent(new CustomEvent(type, { detail })); }
  configureControls() {this.controls.enableDamping = true;this.controls.dampingFactor = 0.09;this.controls.maxPolarAngle = Math.PI * 0.97;this.controls.screenSpacePanning = true;}
  resize() {
    const { width, height } = this.container.getBoundingClientRect();if (!width || !height) return;
    this.renderer.setSize(width, height);this.labels.setSize(width, height);
    if (this.camera.isPerspectiveCamera) this.camera.aspect = width / height;
    else {const span = (this.camera.top - this.camera.bottom) / 2;this.camera.left = -span * width / height;this.camera.right = span * width / height;}
    this.camera.updateProjectionMatrix();
  }
  clearModel() {
    this.select(null);this.clearMeasurements();
    const geometries = new Set(), materials = new Set(), maps = new Set();
    this.root.traverse(o => {if (o.geometry) geometries.add(o.geometry);if (o.material) for (const m of Array.isArray(o.material) ? o.material : [o.material]) materials.add(m);if (o.userData.baseMaterial) materials.add(o.userData.baseMaterial);});
    materials.forEach(m => {if (m.map && ![...this.textures.values()].includes(m.map) && !this.customTextures.has(m.map)) maps.add(m.map);m.dispose();});geometries.forEach(g => g.dispose());maps.forEach(t => t.dispose());
    this.scene.remove(this.root);this.root = new THREE.Group();this.scene.add(this.root);this.elements = [];this.layers.clear();
  }
  loadIfc(model) {
    this.clearModel();
    const geometries = model.geometries.map(g => {
      const geo = new THREE.BufferGeometry();const data = new THREE.InterleavedBuffer(g.vertices, 6);
      geo.setAttribute('position', new THREE.InterleavedBufferAttribute(data, 3, 0));geo.setAttribute('normal', new THREE.InterleavedBufferAttribute(data, 3, 3));geo.setIndex(new THREE.BufferAttribute(g.indices, 1));geo.computeBoundingBox();return geo;
    });
    for (const source of model.elements) {
      const element = { ...source, meshes: [], override: null };
      for (const part of source.parts) {
        const base = new THREE.MeshStandardMaterial({ color: new THREE.Color().setRGB(...part.color, THREE.SRGBColorSpace), opacity: part.opacity, transparent: part.opacity < 0.99, depthWrite: part.opacity >= 0.99, roughness: /металл/i.test(part.materialName) ? 0.4 : 0.82, metalness: /металл/i.test(part.materialName) ? 0.48 : 0, side: THREE.DoubleSide });
        base.name = part.materialName;stabilizeSurfaceMaterial(base);
        const mesh = new THREE.Mesh(geometries[part.geometry], base);mesh.applyMatrix4(new THREE.Matrix4().fromArray(part.matrix));
        mesh.userData.baseMaterial = base;mesh.userData.element = element;setSurfaceShadowPolicy(mesh);element.meshes.push(mesh);this.root.add(mesh);
      }
      this.elements.push(element);
    }
    this.finishLoad('IFC');
  }
  async loadGlb(buffer) {
    // Parse before clearing the current model so an invalid file leaves it usable.
    const result = await new GLTFLoader().parseAsync(buffer, '');
    let meshCount = 0;result.scene.traverse(o => {if (o.isMesh) meshCount++;});
    const sourceBounds = new THREE.Box3().setFromObject(result.scene);
    if (!meshCount || sourceBounds.isEmpty() || !Number.isFinite(sourceBounds.max.x)) throw new Error('GLB не содержит корректной геометрии.');
    this.clearModel();this.root.add(result.scene);const grouped = new Map();
    result.scene.updateMatrixWorld(true);
    result.scene.traverse(object => {
      if (!object.isMesh) return;
      let owner = object;
      while (owner.parent && !owner.userData.elementId && !owner.userData.sourceLayer) owner = owner.parent;
      const meta = owner.userData || {};
      const id = meta.elementId || object.uuid;
      if (!grouped.has(id)) grouped.set(id, { id, name: meta.sourceName || object.name || 'Элемент модели', type: meta.definitionName || 'Mesh', layer: meta.sourceLayer || 'Модель', guid: '', properties: meta.properties || {}, meshes: [], override: null });
      const element = grouped.get(id);
      // glTF primitives are individual THREE.Mesh instances with one material.
      const base = Array.isArray(object.material) ? object.material[0] : object.material;
      base.roughness = Math.max(base.roughness ?? 0.75, 0.32);stabilizeSurfaceMaterial(base);
      object.userData.baseMaterial = base;object.userData.element = element;setSurfaceShadowPolicy(object);element.meshes.push(object);
    });
    this.elements = [...grouped.values()];this.finishLoad('GLB');
  }
  finishLoad(format) {
    this.root.updateMatrixWorld(true);const bounds = new THREE.Box3().setFromObject(this.root);
    if (bounds.isEmpty() || !Number.isFinite(bounds.max.x)) throw new Error('Модель не содержит корректной геометрии.');
    const center = bounds.getCenter(v3());this.root.position.set(-center.x, -bounds.min.y, -center.z);this.root.updateMatrixWorld(true);
    this.bounds = new THREE.Box3().setFromObject(this.root);this.size = this.bounds.getSize(v3());this.diagonal = this.size.length();
    for (const e of this.elements) {
      if (!this.layers.has(e.layer)) this.layers.set(e.layer, { name: e.layer, visible: !/потолок/i.test(e.layer), count: 0 });
      this.layers.get(e.layer).count++;
    }
    this.elements.forEach(e => e.meshes.forEach(m => {m.visible = this.layers.get(e.layer).visible;}));
    if (this.ground) {this.scene.remove(this.ground);this.ground.geometry.dispose();this.ground.material.dispose();}
    this.ground = new THREE.Mesh(new THREE.PlaneGeometry(this.diagonal * 6, this.diagonal * 6), new THREE.ShadowMaterial({ color: 0x596161, opacity: 0.16 }));
    this.ground.rotation.x = -Math.PI / 2;this.ground.position.y = -0.025;this.ground.receiveShadow = true;this.scene.add(this.ground);
    if (this.grid) {this.scene.remove(this.grid);this.grid.geometry.dispose();this.grid.material.dispose();}
    const span = Math.ceil(this.diagonal * 2 / 10) * 10;
    this.grid = new THREE.GridHelper(span, span, 0xc3cdca, 0xd2d9d6);this.grid.position.y = -0.02;this.grid.material.transparent = true;this.grid.material.opacity = 0.55;this.scene.add(this.grid);
    fitModelShadow(this.keyLight, this.bounds, this.diagonal);
    this.controls.minDistance = this.diagonal * 0.025;this.controls.maxDistance = this.diagonal * 12;
    this.updateStyle();this.setView('iso');this.updateDimensions();
    let triangles = 0;this.elements.forEach(e => e.meshes.forEach(m => {triangles += (m.geometry.index?.count || m.geometry.attributes.position.count) / 3;}));
    this.emit('loaded', { format, elements: this.elements.length, triangles: Math.round(triangles), layers: [...this.layers.values()], size: this.size.toArray() });
  }
  boxFor(element) {const box = new THREE.Box3();element.meshes.forEach(m => box.expandByObject(m));return box;}
  visibleBox() {const box = new THREE.Box3();this.elements.forEach(e => {if (this.layers.get(e.layer)?.visible) e.meshes.forEach(m => box.expandByObject(m));});return box;}
  select(element) {this.selected = element;this.selectionBox.visible = !!element;if (element) this.selectionBox.box.copy(this.boxFor(element));this.emit('select', element);this.updateDimensions();}
  setLayer(name, visible) {const layer = this.layers.get(name);if (!layer) return;layer.visible = visible;this.elements.filter(e => e.layer === name).forEach(e => e.meshes.forEach(m => {m.visible = visible;}));if (this.selected?.layer === name && !visible) this.select(null);this.updateDimensions();this.emit('layers', [...this.layers.values()]);}
  setSetting(key, value) {this.settings[key] = value;if (['section', 'sectionAxis', 'sectionValue'].includes(key)) this.updateSection();else if (key === 'dimensions') this.updateDimensions();else this.updateStyle();}
  updateStyle() {
    const { mode, textures, edges, grid } = this.settings;
    for (const e of this.elements) for (const mesh of e.meshes) {
      if (mesh.material !== mesh.userData.baseMaterial) mesh.material.dispose();
      const base = mesh.userData.baseMaterial;
      if (mode === 'white' || mode === 'technical') {
        mesh.material = new THREE.MeshStandardMaterial({ color: 0xf0efea, roughness: 0.9, side: base.side, transparent: base.transparent, opacity: base.transparent ? 0.24 : 1, depthWrite: !base.transparent });
      } else if (mode === 'finish' && e.override) {
        const texture = typeof e.override.texture === 'string' ? this.textures.get(e.override.texture) : e.override.texture;
        mesh.material = textures ? projectedMaterial(texture, e.override.scale) : new THREE.MeshStandardMaterial({ color: e.override.color || '#d8cec0', roughness: 0.84, side: THREE.DoubleSide });
      } else {
        mesh.material = base.clone();if (!textures) mesh.material.map = null;
      }
      mesh.material.side = base.side;stabilizeSurfaceMaterial(mesh.material);setSurfaceShadowPolicy(mesh);
      const showEdges = edges || mode === 'technical';
      if (showEdges && !mesh.userData.edgeObject) {
        const line = new THREE.LineSegments(new THREE.EdgesGeometry(mesh.geometry, 28), new THREE.LineBasicMaterial({ color: 0x666f71, transparent: true, opacity: 0.42 }));
        mesh.userData.edgeObject = line;mesh.add(line);
      }
      if (mesh.userData.edgeObject) mesh.userData.edgeObject.visible = showEdges;
    }
    if (this.grid) this.grid.visible = grid;this.updateSection();
  }
  applyFinish(preset, scope = 'element', scale = 1) {
    if (!this.selected) return false;
    const targets = scope === 'layer' ? this.elements.filter(e => e.layer === this.selected.layer) : [this.selected];
    targets.forEach(e => {e.override = { texture: preset.texture || preset.id, color: preset.color, name: preset.name, scale };});
    this.settings.mode = 'finish';this.updateStyle();this.emit('select', this.selected);return targets.length;
  }
  resetFinish(scope = 'element') {
    if (!this.selected) return;
    (scope === 'layer' ? this.elements.filter(e => e.layer === this.selected.layer) : [this.selected]).forEach(e => {e.override = null;});this.updateStyle();this.emit('select', this.selected);
  }
  setTextureScale(scale, scope = 'element') {
    if (!this.selected) return;
    (scope === 'layer' ? this.elements.filter(e => e.layer === this.selected.layer) : [this.selected]).forEach(e => {if (e.override) e.override.scale = scale;});this.updateStyle();
  }
  applyPalette() {
    for (const e of this.elements) {
      const id = /перекрыт/i.test(e.layer) ? 'oak' : /стен/i.test(e.layer) ? 'plaster' : /колонн/i.test(e.layer) ? 'concrete' : null;
      if (id) e.override = { texture: id, name: { oak: 'Натуральный дуб', plaster: 'Тёплая штукатурка', concrete: 'Микроцемент' }[id], scale: id === 'oak' ? 2 : 1 };
    }
    this.settings.mode = 'finish';this.updateStyle();if (this.selected) this.emit('select', this.selected);
  }
  updateSection() {
    this.renderer.clippingPlanes = [];
    if (this.settings.section && this.bounds) {
      const axis = this.settings.sectionAxis;const height = THREE.MathUtils.lerp(this.bounds.min[axis], this.bounds.max[axis], this.settings.sectionValue / 100);
      const normal = v3();normal[axis] = -1;this.renderer.clippingPlanes = [new THREE.Plane(normal, height)];
      this.emit('section', { height, axis });
    }
  }
  fit(box = this.visibleBox()) {
    if (box.isEmpty()) return;
    const center = box.getCenter(v3()), size = box.getSize(v3());const aspect = this.container.clientWidth / this.container.clientHeight;
    const direction = this.camera.position.clone().sub(this.controls.target).normalize();
    if (this.camera.isPerspectiveCamera) {
      const halfFov = Math.min(THREE.MathUtils.degToRad(this.camera.fov / 2), Math.atan(Math.tan(THREE.MathUtils.degToRad(this.camera.fov / 2)) * aspect));
      this.camera.position.copy(center).addScaledVector(direction, size.length() * 0.5 / Math.sin(halfFov) * 1.12);
    } else {
      const span = Math.max(size.x, size.y, size.z, 0.1) * 0.67 * Math.max(1, 1 / aspect);
      this.camera.left = -span * aspect;this.camera.right = span * aspect;this.camera.top = span;this.camera.bottom = -span;this.camera.zoom = 1;
      this.camera.position.copy(center).addScaledVector(direction, this.diagonal * 2);
    }
    setModelDepthRange(this.camera, this.diagonal);this.controls.target.copy(center);this.controls.update();
  }
  setView(view) {
    if (!this.bounds) return;
    const target = this.visibleBox().isEmpty() ? this.bounds.getCenter(v3()) : this.visibleBox().getCenter(v3());
    const oldControls = this.controls;oldControls.dispose();
    this.camera = view === 'iso' ? new THREE.PerspectiveCamera(40, 1, 0.01, 1000) : new THREE.OrthographicCamera(-10, 10, 10, -10, 0.01, 1000);
    const directions = { iso: [1, 1.05, 1], top: [0, 1, 0.00001], front: [0, 0.02, 1], side: [1, 0.02, 0] };
    this.camera.position.copy(target).addScaledVector(new THREE.Vector3(...directions[view]).normalize(), this.diagonal * 2);
    this.controls = new OrbitControls(this.camera, this.renderer.domElement);this.configureControls();this.controls.target.copy(target);this.controls.minDistance = this.diagonal * 0.025;this.controls.maxDistance = this.diagonal * 12;
    this.resize();this.fit();this.emit('view', view);
  }
  pick(event) {
    const rect = this.renderer.domElement.getBoundingClientRect();this.pointer.set((event.clientX - rect.left) / rect.width * 2 - 1, -(event.clientY - rect.top) / rect.height * 2 + 1);
    this.raycaster.setFromCamera(this.pointer, this.camera);
    const meshes = this.elements.flatMap(e => e.meshes.filter(m => m.visible));
    return this.raycaster.intersectObjects(meshes, false).find(hit => this.renderer.clippingPlanes.every(p => p.distanceToPoint(hit.point) >= 0));
  }
  snapPoint(hit, event) {
    const rect = this.container.getBoundingClientRect();let result = hit.point.clone(), closest = 12;
    if (!hit.face) return result;
    for (const index of [hit.face.a, hit.face.b, hit.face.c]) {
      const world = v3().fromBufferAttribute(hit.object.geometry.attributes.position, index).applyMatrix4(hit.object.matrixWorld);const p = world.clone().project(this.camera);
      const distance = Math.hypot((p.x + 1) / 2 * rect.width + rect.left - event.clientX, (1 - p.y) / 2 * rect.height + rect.top - event.clientY);
      if (distance < closest) {closest = distance;result = world;}
    }
    return result;
  }
  setTool(tool) {this.tool = tool;this.cancelMeasurement();this.renderer.domElement.style.cursor = tool === 'measure' ? 'crosshair' : 'grab';this.emit('tool', tool);}
  label(text, point, className = 'dimension-label') {const div = document.createElement('div');div.className = className;div.textContent = text;const object = new CSS2DObject(div);object.position.copy(point);return object;}
  line(points, color = 0x3c79d6, group = this.measureGroup) {const geo = new THREE.BufferGeometry().setFromPoints(points);const line = new THREE.Line(geo, new THREE.LineBasicMaterial({ color, depthTest: false, transparent: true, opacity: 0.9 }));line.renderOrder = 4;group.add(line);return line;}
  marker(point) {const marker = new THREE.Mesh(new THREE.SphereGeometry(this.diagonal / 700, 12, 8), new THREE.MeshBasicMaterial({ color: 0x2f75dd, depthTest: false }));marker.position.copy(point);marker.renderOrder = 5;this.measureGroup.add(marker);return marker;}
  measurePoint(point) {
    if (!this.pendingPoint) {this.pendingPoint = point;this.pendingMarker = this.marker(point);this.emit('measure', { step: 1, count: this.measurements.length });return;}
    if (point.distanceTo(this.pendingPoint) < 0.00001) return;
    const a = this.pendingPoint.clone(), b = point.clone(), distance = a.distanceTo(b);
    this.marker(b);this.line([a, b]);this.measureGroup.add(this.label(meters(distance), a.clone().lerp(b, 0.5), 'measurement-label'));
    this.measurements.push({ a: a.toArray(), b: b.toArray(), meters: distance });this.pendingPoint = null;this.pendingMarker = null;
    this.emit('measure', { step: 0, count: this.measurements.length, distance });
  }
  cancelMeasurement() {if (this.pendingMarker) {this.measureGroup.remove(this.pendingMarker);this.pendingMarker.geometry.dispose();this.pendingMarker.material.dispose();}this.pendingMarker = null;this.pendingPoint = null;}
  clearGroup(group) {group.traverse(o => {o.geometry?.dispose();o.material?.dispose();if (o.isCSS2DObject) o.element.remove();});group.clear();}
  clearMeasurements() {this.pendingPoint = null;this.pendingMarker = null;this.measurements = [];this.clearGroup(this.measureGroup);this.emit('measure', { step: 0, count: 0 });}
  updateDimensions() {
    this.clearGroup(this.dimensionGroup);if (!this.settings.dimensions || !this.bounds) return;
    const box = this.selected ? this.boxFor(this.selected) : this.visibleBox();if (box.isEmpty()) return;
    const { min, max } = box, size = box.getSize(v3()), gap = Math.max(size.length() * 0.07, 0.15), tick = gap * 0.15;
    const dimensions = [
      [new THREE.Vector3(min.x, min.y, max.z + gap), new THREE.Vector3(max.x, min.y, max.z + gap), size.x, new THREE.Vector3(0, 0, tick)],
      [new THREE.Vector3(max.x + gap, min.y, min.z), new THREE.Vector3(max.x + gap, min.y, max.z), size.z, new THREE.Vector3(tick, 0, 0)],
      [new THREE.Vector3(min.x - gap, min.y, min.z), new THREE.Vector3(min.x - gap, max.y, min.z), size.y, new THREE.Vector3(tick, 0, 0)],
    ];
    for (const [a, b, length, direction] of dimensions) {
      this.line([a, b], 0x4c6168, this.dimensionGroup);for (const point of [a, b]) this.line([point.clone().sub(direction), point.clone().add(direction)], 0x4c6168, this.dimensionGroup);
      this.dimensionGroup.add(this.label(meters(length), a.clone().lerp(b, 0.5)));
    }
  }
}
