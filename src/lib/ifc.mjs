// The same extractor runs in a browser worker and in the preparation script.
export function extractIfc(api, data, progress = () => {}) {
  const modelID = api.OpenModel(data, { COORDINATE_TO_ORIGIN: true });
  if (modelID < 0) throw new Error('Не удалось открыть IFC. Проверьте формат файла.');
  const byType = name => {
    const code = api.GetTypeCodeFromName(name);
    const ids = api.GetLineIDsWithType(modelID, code);
    const lines = [];
    for (let i = 0; i < ids.size(); i++) lines.push(api.GetLine(modelID, ids.get(i)));
    return lines;
  };
  try {
    const assignedLayers = new Map();
    const layers = byType('IFCPRESENTATIONLAYERASSIGNMENT').map(l => {
      const name = l.Name?.value || 'Без слоя';
      for (const ref of l.AssignedItems || []) assignedLayers.set(ref.value, name);
      return name;
    });
    const stores = byType('IFCBUILDINGSTOREY');
    const storeyOf = new Map();
    for (const rel of byType('IFCRELCONTAINEDINSPATIALSTRUCTURE')) {
      const storey = stores.find(s => s.expressID === rel.RelatingStructure?.value)?.Name?.value;
      for (const ref of rel.RelatedElements || []) storeyOf.set(ref.value, storey);
    }
    const parents = new Map();
    for (const rel of byType('IFCRELAGGREGATES')) {
      for (const ref of rel.RelatedObjects || []) parents.set(ref.value, rel.RelatingObject.value);
    }
    const styles = [];
    for (const s of byType('IFCSURFACESTYLE')) {
      for (const ref of s.Styles || []) {
        const render = api.GetLine(modelID, ref.value);
        if (!render.SurfaceColour) continue;
        const rgb = api.GetLine(modelID, render.SurfaceColour.value);
        styles.push({ name: s.Name?.value || 'Материал', color: [rgb.Red.value, rgb.Green.value, rgb.Blue.value], opacity: 1 - (render.Transparency?.value || 0) });
      }
    }
    function layerOf(line) {
      if (!line) return null;
      if (assignedLayers.has(line.expressID)) return assignedLayers.get(line.expressID);
      if (line.Representation) return layerOf(api.GetLine(modelID, line.Representation.value));
      for (const ref of [...(line.Representations || []), ...(line.Items || [])]) {
        if (assignedLayers.has(ref.value)) return assignedLayers.get(ref.value);
      }
      for (const ref of line.Representations || []) {
        const found = layerOf(api.GetLine(modelID, ref.value));
        if (found) return found;
      }
      return null;
    }
    const geometries = [];
    const geomIndex = new Map();
    const elements = [];
    const skipped = [];
    api.StreamAllMeshes(modelID, (flat, index, total) => {
      const line = api.GetLine(modelID, flat.expressID);
      let layer = layerOf(line);
      let ancestor = parents.get(flat.expressID);
      const visited = new Set();
      let storey = storeyOf.get(flat.expressID);
      while (ancestor && !visited.has(ancestor)) {
        visited.add(ancestor);
        layer ||= layerOf(api.GetLine(modelID, ancestor));
        storey ||= storeyOf.get(ancestor);
        ancestor = parents.get(ancestor);
      }
      layer ||= 'Без слоя';
      const parts = [];
      for (let i = 0; i < flat.geometries.size(); i++) {
        const placed = flat.geometries.get(i);
        let geometry = geomIndex.get(placed.geometryExpressID);
        if (geometry === undefined) {
          const g = api.GetGeometry(modelID, placed.geometryExpressID);
          try {
            const vertices = api.GetVertexArray(g.GetVertexData(), g.GetVertexDataSize()).slice();
            const indices = api.GetIndexArray(g.GetIndexData(), g.GetIndexDataSize()).slice();
            if (!indices.length || !vertices.length) continue;
            geometry = geometries.length;
            geometries.push({ vertices, indices });
            geomIndex.set(placed.geometryExpressID, geometry);
          } finally { g.delete(); }
        }
        const color = [placed.color.x, placed.color.y, placed.color.z];
        const style = styles.find(s => s.color.every((v, j) => Math.abs(v - color[j]) < 0.0001));
        parts.push({ geometry, matrix: [...placed.flatTransformation], color, opacity: placed.color.w, materialName: style?.name || 'Материал IFC' });
      }
      if (!parts.length) skipped.push(flat.expressID);
      else elements.push({ id: String(flat.expressID), name: line.Name?.value || `Элемент ${flat.expressID}`, type: api.GetNameFromTypeCode(line.type), guid: line.GlobalId?.value || '', layer, storey: storey || '', doorWidth: line.OverallWidth?.value, doorHeight: line.OverallHeight?.value, parts });
      if (index % 15 === 0) progress(Math.round(100 * (index + 1) / total));
    });
    if (!elements.length) throw new Error('В IFC не найдена отображаемая геометрия.');
    return { format: 'IFC', schema: api.GetModelSchema(modelID), units: 'm', elements, geometries, layers: [...new Set([...layers, ...elements.map(e => e.layer)])], styles, storeys: stores.map(s => s.Name?.value || ''), skipped };
  } finally { api.CloseModel(modelID); }
}

export function packIfc(model) {
  let offset = 0;
  const descriptors = model.geometries.map(g => {
    const vertexOffset = offset;
    offset += g.vertices.byteLength;
    const indexOffset = offset;
    offset += g.indices.byteLength;
    return { vertexOffset, vertexCount: g.vertices.length, indexOffset, indexCount: g.indices.length };
  });
  const binary = new Uint8Array(offset);
  model.geometries.forEach((g, i) => {
    binary.set(new Uint8Array(g.vertices.buffer, g.vertices.byteOffset, g.vertices.byteLength), descriptors[i].vertexOffset);
    binary.set(new Uint8Array(g.indices.buffer, g.indices.byteOffset, g.indices.byteLength), descriptors[i].indexOffset);
  });
  return { manifest: { ...model, geometries: descriptors }, binary };
}

export function unpackIfc(manifest, buffer) {
  return { ...manifest, geometries: manifest.geometries.map(g => ({ vertices: new Float32Array(buffer, g.vertexOffset, g.vertexCount), indices: new Uint32Array(buffer, g.indexOffset, g.indexCount) })) };
}
