import tailwindcss from '@tailwindcss/vite';
import react from '@vitejs/plugin-react';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { defineConfig } from 'vite';

// The TV: a standalone static build of the Microfixd OS frontend.
// Point it at any running Microfixd backend with VITE_API_BASE_URL,
// e.g. VITE_API_BASE_URL=https://microfixd-full-ai.onrender.com npm run build
export default defineConfig(() => {
  return {
    plugins: [react(), tailwindcss()],
    resolve: { alias: { '@': path.resolve(path.dirname(fileURLToPath(import.meta.url)), '.') } },
  };
});
