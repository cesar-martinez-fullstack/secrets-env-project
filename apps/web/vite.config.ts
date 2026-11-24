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
      '/api': {
        target: process.env.SV_API_URL ?? 'http://localhost:3000',
        // El API compara Origin con Host (anti CSRF): el proxy debe conservar el Host del navegador.
        changeOrigin: false,
      },
    },
  },
  build: {
    target: 'es2022',
    // Salida directa al directorio público que sirve Hono (apps/api/public).
    outDir: '../api/public',
    emptyOutDir: true,
  },
});
