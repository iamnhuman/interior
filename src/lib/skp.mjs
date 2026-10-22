import { buildInstancedScene, parseSkp, toInstancedGLB } from '../../vendor/openskp/index.mjs';

export function convertSkp(buffer, onProgress = () => {}) {
  const scene = buildInstancedScene(buffer, { respectEdgeVisibility: true, onProgress: p => onProgress(Math.round(p.current / Math.max(p.total, 1) * 100)) });
  if (!scene.bounds || !scene.meshResources.length) throw new Error('В SKP не найдена отображаемая геометрия.');
  const source = parseSkp(buffer);
  for (const material of scene.gltfMaterials) {
    const pbr = material.pbrMetallicRoughness;
    const image = scene.textures[pbr?.baseColorTexture?.index];
    const color = pbr?.baseColorFactor;
    const match = image ? source.materials.find(m => m.texture?.filename === image.filename) : source.materials.find(m => !m.texture && color && [m.color.r, m.color.g, m.color.b].every((v, i) => Math.abs(v / 255 - color[i]) < 0.002));
    material.name = match?.name || 'Материал SketchUp';
  }
  const glb = toInstancedGLB(scene, { textures: true });
  const view = new DataView(glb.buffer, glb.byteOffset, glb.byteLength);
  const jsonLength = view.getUint32(12, true);
  const json = JSON.parse(new TextDecoder().decode(glb.subarray(20, 20 + jsonLength)));
  let i = 0;
  function attach(node) {
    const target = json.nodes[i];
    target.extras = { elementId: `skp-${i}`, sourceName: node.name, definitionName: node.definitionName, sourceLayer: node.layer || 'Без слоя', properties: node.properties || {} };
    i++;
    node.children.forEach(attach);
  }
  attach(scene.sceneHierarchy);
  const encoded = new TextEncoder().encode(JSON.stringify(json));
  const paddedLength = (encoded.byteLength + 3) & ~3;
  const tail = glb.subarray(20 + jsonLength);
  const result = new Uint8Array(20 + paddedLength + tail.byteLength);
  const out = new DataView(result.buffer);
  out.setUint32(0, 0x46546c67, true);out.setUint32(4, 2, true);out.setUint32(8, result.length, true);
  out.setUint32(12, paddedLength, true);out.setUint32(16, 0x4e4f534a, true);
  result.fill(32, 20, 20 + paddedLength);result.set(encoded, 20);result.set(tail, 20 + paddedLength);
  return { glb: result, summary: { bounds: scene.bounds, textureCount: scene.textures.length, sourceMaterialCount: source.materials.length, materialCount: scene.gltfMaterials.length, resources: scene.meshResources.length, layers: Object.keys(scene.layerHidden) } };
}
