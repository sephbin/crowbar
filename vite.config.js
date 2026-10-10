import { defineConfig } from 'vite';

export default defineConfig({
  root: 'src',
  // the vault editor is served under /vault/; "/" is the home page from server.js
  base: '/vault/',
  build: {
    outDir: '../dist',
    emptyOutDir: true,
  },
  server: {
    port: 5174,
    proxy: {
      '^/$': 'http://localhost:3002',
      '/api': 'http://localhost:3002',
      '/pages': 'http://localhost:3002',
      '/ws': { target: 'ws://localhost:3002', ws: true },
    },
  },
});
