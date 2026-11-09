import { defineConfig } from 'vite';
import vue from '@vitejs/plugin-vue';
import tailwindcss from '@tailwindcss/vite';
import { fileURLToPath, URL } from 'node:url';

export default defineConfig({
  plugins: [vue(), tailwindcss()],
  resolve: {
    alias: {
      '@': fileURLToPath(new URL('./src', import.meta.url)),
    },
  },
  server: {
    port: 5173,
    proxy: {
      // En desarrollo, el frontend (5173) delega el API en Bun (3000).
      '/api': 'http://localhost:3000',
    },
  },
  build: {
    target: 'es2022',
    // Salida directa al directorio público que sirve Hono (apps/api/public).
    outDir: '../api/public',
    emptyOutDir: true,
  },
});
