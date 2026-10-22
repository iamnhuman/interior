import { IfcAPI, LogLevel } from 'web-ifc';
import wasmURL from 'web-ifc/web-ifc.wasm?url';
import { extractIfc } from './lib/ifc.mjs';
import { convertSkp } from './lib/skp.mjs';

self.onmessage = async ({ data: { buffer, format } }) => {
  const progress = value => self.postMessage({ progress: value });
  try {
    if (format === 'ifc') {
      const api = new IfcAPI();
      await api.Init(() => wasmURL, true);api.SetLogLevel(LogLevel.LOG_LEVEL_OFF);
      const result = extractIfc(api, new Uint8Array(buffer), progress);
      const transfer = result.geometries.flatMap(g => [g.vertices.buffer, g.indices.buffer]);
      self.postMessage({ result }, transfer);
    } else {
      const result = convertSkp(buffer, progress);
      self.postMessage({ result }, [result.glb.buffer]);
    }
  } catch (error) { self.postMessage({ error: error.message }); }
};
