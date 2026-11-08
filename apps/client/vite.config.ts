import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { fileURLToPath } from 'node:url';

const repoRoot = fileURLToPath(new URL('../..', import.meta.url));
const serverPort = Number(process.env.SERVER_PORT ?? 3210);

export default defineConfig({
  plugins: [react()],
  // PixiJS da solo pesa ~500 kB: un unico pacchetto va bene per un gioco tra amici
  build: { chunkSizeWarningLimit: 1200 },
  resolve: {
    alias: {
      '@data': fileURLToPath(new URL('../../data', import.meta.url)),
    },
  },
  server: {
    port: 5173,
    fs: { allow: [repoRoot] },
    // in sviluppo WebSocket e mappe vanno al server di gioco (npm run dev avvia entrambi);
    // SERVER_PORT serve se la 3210 è già occupata, per esempio da `npm run serata`
    proxy: {
      '/ws': { target: `ws://localhost:${serverPort}`, ws: true },
      '/mappe': { target: `http://localhost:${serverPort}` },
    },
  },
});
