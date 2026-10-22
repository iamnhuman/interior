import * as THREE from 'three';

export const finishes = [
  { id: 'oak', name: 'Натуральный дуб', detail: 'Дерево · матовое', color: '#bda17a' },
  { id: 'concrete', name: 'Микроцемент', detail: 'Минеральное покрытие', color: '#b6b4ae' },
  { id: 'plaster', name: 'Тёплая штукатурка', detail: 'Стены · светлая', color: '#e4dfd2' },
  { id: 'terrazzo', name: 'Светлый терраццо', detail: 'Камень · крапчатый', color: '#d7d0c1' },
];

export function createFinishTextures() {
  const textures = new Map();
  for (const preset of finishes) {
    const canvas = document.createElement('canvas');canvas.width = canvas.height = 512;
    const ctx = canvas.getContext('2d');
    let seed = 3729;
    const rand = () => { seed = (Math.imul(1664525, seed) + 1013904223) >>> 0;return seed / 4294967296; };
    ctx.fillStyle = preset.color;ctx.fillRect(0, 0, 512, 512);
    if (preset.id === 'oak') {
      for (let x = 0; x < 512; x++) {
        const grain = Math.sin(x * 0.38 + Math.sin(x * 0.034) * 7) * 8 + rand() * 11;
        ctx.strokeStyle = `rgba(${95 + grain},${65 + grain},${30 + grain},.16)`;
        ctx.beginPath();ctx.moveTo(x, 0);
        for (let y = 0; y <= 512; y += 16) ctx.lineTo(x + Math.sin(y * 0.018 + x * 0.018) * 2, y);
        ctx.stroke();
      }
      ctx.strokeStyle = '#8f765b';ctx.lineWidth = 1.4;
      for (let x = 0; x < 512; x += 128) {ctx.beginPath();ctx.moveTo(x, 0);ctx.lineTo(x, 512);ctx.stroke();}
      for (let i = 0; i < 4; i++) {const y = (i % 2) * 256;ctx.beginPath();ctx.moveTo(i * 128, y);ctx.lineTo((i + 1) * 128, y);ctx.stroke();}
    } else {
      const image = ctx.getImageData(0, 0, 512, 512);
      for (let i = 0; i < image.data.length; i += 4) {
        const n = (rand() - 0.5) * (preset.id === 'concrete' ? 19 : 9);
        image.data[i] += n;image.data[i + 1] += n;image.data[i + 2] += n;
      }
      ctx.putImageData(image, 0, 0);
      if (preset.id === 'terrazzo') {
        for (let i = 0; i < 1300; i++) {
          const x = rand() * 512, y = rand() * 512, r = 1 + rand() * 4;
          ctx.fillStyle = ['#8b8a7c', '#b0a495', '#eee9de', '#a89684'][Math.floor(rand() * 4)];
          ctx.beginPath();ctx.moveTo(x - r, y);ctx.lineTo(x + r * 0.4, y - r);ctx.lineTo(x + r, y + r * 0.3);ctx.lineTo(x, y + r);ctx.fill();
        }
      }
    }
    const texture = new THREE.CanvasTexture(canvas);
    texture.colorSpace = THREE.SRGBColorSpace;texture.wrapS = texture.wrapT = THREE.RepeatWrapping;
    texture.anisotropy = 8;textures.set(preset.id, texture);
  }
  return textures;
}

// World-space triplanar projection also works on IFC meshes without UVs.
export function projectedMaterial(texture, tileSize = 1) {
  const mat = new THREE.MeshStandardMaterial({ map: texture, color: 0xffffff, roughness: 0.84, side: THREE.DoubleSide });
  mat.onBeforeCompile = shader => {
    shader.uniforms.textureTileSize = { value: tileSize };
    shader.vertexShader = `varying vec3 vFinishPosition;\nvarying vec3 vFinishNormal;\n${shader.vertexShader}`;
    shader.vertexShader = shader.vertexShader.replace('#include <worldpos_vertex>', `#include <worldpos_vertex>
      vFinishPosition = (modelMatrix * vec4(transformed, 1.0)).xyz;
      vFinishNormal = normalize(mat3(modelMatrix) * objectNormal);`);
    shader.fragmentShader = `varying vec3 vFinishPosition;\nvarying vec3 vFinishNormal;\nuniform float textureTileSize;\n${shader.fragmentShader}`;
    shader.fragmentShader = shader.fragmentShader.replace('#include <map_fragment>', `
      #ifdef USE_MAP
        vec3 weights = pow(abs(normalize(vFinishNormal)), vec3(6.0));
        weights /= max(weights.x + weights.y + weights.z, 0.00001);
        vec3 p = vFinishPosition / max(textureTileSize, 0.001);
        vec4 finishColor = texture2D(map, p.zy) * weights.x + texture2D(map, p.xz) * weights.y + texture2D(map, p.xy) * weights.z;
        diffuseColor *= finishColor;
      #endif`);
  };
  mat.customProgramCacheKey = () => `projected-finish-${tileSize}`;
  return mat;
}
