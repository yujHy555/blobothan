import { defineConfig } from 'vite';

export default defineConfig({
  server: {
    port: 3000,
    host: true,
  },
  build: {
    outDir: 'dist',
    sourcemap: true,
  },
  optimizeDeps: {
    include: ['babylonjs', 'babylonjs-gui', 'babylonjs-loaders', 'babylonjs-materials'],
  },
});
