import { defineConfig } from 'vite';

export default defineConfig({
  root: 'src',
  publicDir: '../public',
  base: './',
  server: { port: 5173, strictPort: false },
  build: { outDir: '../dist', emptyOutDir: true, rollupOptions: { output: { manualChunks: { three: ['three'], 'three-addons': ['three/addons/controls/OrbitControls.js', 'three/addons/loaders/GLTFLoader.js', 'three/addons/renderers/CSS2DRenderer.js', 'three/addons/environments/RoomEnvironment.js'] } } } },
});
