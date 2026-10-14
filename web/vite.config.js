import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: { '@registry': path.resolve(__dirname, '../registry') },
  },
  server: { proxy: { '/api': 'http://127.0.0.1:4177' } },
  build: { outDir: 'dist', emptyOutDir: true },
});
