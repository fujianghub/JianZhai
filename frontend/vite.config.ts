/// <reference types="vitest/config" />
import path from 'node:path';
import http from 'node:http';
import { defineConfig, loadEnv } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), '');
  const apiBase = env.VITE_API_BASE_URL ?? 'http://localhost:8002/api/v1';
  const apiOrigin = new URL(apiBase).origin;

  // Force every proxied request to use a fresh TCP connection. With
  // keep-alive ON (the http-proxy default), an aborted upstream stream — e.g.
  // pdf.js / iframe load racing against React StrictMode unmount — can leave
  // the pooled socket half-drained, and the very next request reuses it and
  // resolves to an empty/204 body. The throughput hit is negligible for a
  // dev server, while the bug it removes is otherwise hard to track down.
  const freshSocketAgent = new http.Agent({ keepAlive: false });

  return {
    plugins: [react()],
    resolve: {
      alias: {
        '@': path.resolve(__dirname, 'src'),
        '@dev-guide': path.resolve(__dirname, '../docs/dev-guide'),
      },
    },
    server: {
      host: '0.0.0.0',
      port: 3001,
      strictPort: true,
      proxy: {
        '/api': { target: apiOrigin, changeOrigin: true, agent: freshSocketAgent },
        '/media': { target: apiOrigin, changeOrigin: true, agent: freshSocketAgent },
        '/feed.xml': { target: apiOrigin, changeOrigin: true, agent: freshSocketAgent },
      },
    },
    test: {
      environment: 'node',
    },
  };
});
