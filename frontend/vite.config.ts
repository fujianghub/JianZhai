/// <reference types="vitest/config" />
import path from 'node:path';
import http from 'node:http';
import { defineConfig, loadEnv, type PluginOption } from 'vite';
import react from '@vitejs/plugin-react';
import basicSsl from '@vitejs/plugin-basic-ssl';

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), '');
  // JZ_API_PROXY_TARGET：仅改 dev 代理上游、不暴露给客户端（非 VITE_ 前缀）。
  // 用于并行验证实例把 /api 指到第二个后端，客户端仍走同源相对路径。
  const apiBase =
    env.JZ_API_PROXY_TARGET ?? env.VITE_API_BASE_URL ?? 'http://localhost:8002/api/v1';
  const apiOrigin = new URL(apiBase).origin;
  // Opt-in HTTPS for LAN access: Chrome treats LAN-IP HTTP origins as
  // insecure context and pops the "this file may have been tampered with"
  // warning on **every** download (PDF / HTML / ZIP / …) regardless of MIME
  // type. Localhost is exempt by browser policy. Run ``pnpm dev:https`` (sets
  // ``VITE_HTTPS=1``) to serve a self-signed cert — first visit needs a
  // one-time "Advanced → Proceed" click per browser/device, after which all
  // downloads are warning-free. Backend stays HTTP; the Vite proxy bridges.
  const httpsEnabled = env.VITE_HTTPS === '1' || env.VITE_HTTPS === 'true';
  const plugins: PluginOption[] = [react()];
  if (httpsEnabled) plugins.push(basicSsl());

  // Force every proxied request to use a fresh TCP connection. With
  // keep-alive ON (the http-proxy default), an aborted upstream stream — e.g.
  // pdf.js / iframe load racing against React StrictMode unmount — can leave
  // the pooled socket half-drained, and the very next request reuses it and
  // resolves to an empty/204 body. The throughput hit is negligible for a
  // dev server, while the bug it removes is otherwise hard to track down.
  const freshSocketAgent = new http.Agent({ keepAlive: false });

  return {
    plugins,
    resolve: {
      alias: {
        '@': path.resolve(__dirname, 'src'),
        '@dev-guide': path.resolve(__dirname, '../docs/dev-guide'),
      },
    },
    server: {
      // Dual-stack: browsers often resolve localhost → ::1; 0.0.0.0 alone skips IPv6 loopback.
      host: '::',
      port: 3001,
      strictPort: true,
      // basicSsl() owns the actual cert; we just flip the flag so server.https
      // is non-falsy and Vite spins up the TLS listener.
      https: httpsEnabled ? {} : undefined,
      proxy: {
        '/api': { target: apiOrigin, changeOrigin: true, agent: freshSocketAgent },
        '/media': { target: apiOrigin, changeOrigin: true, agent: freshSocketAgent },
        '/feed.xml': { target: apiOrigin, changeOrigin: true, agent: freshSocketAgent },
        '/sitemap.xml': { target: apiOrigin, changeOrigin: true, agent: freshSocketAgent },
      },
    },
    build: {
      rollupOptions: {
        output: {
          /**
           * 编辑器双内核各自独立 chunk：CodeMirror（MD 源码模式）与
           * Tiptap/ProseMirror（富文本）都只被懒加载的编辑页用到，
           * 拆出去保证 main bundle 不回胖、两内核互不牵连缓存失效。
           */
          manualChunks(id: string) {
            // 只归并 CM 核心；@codemirror/lang-* 与各 @lezer 语法包由
            // language-data 动态 import 按需加载，不能合进来（否则一次性
            // 拖入全部语言 ≈ 1.5MB）。
            const CM_CORE = [
              '@codemirror/state',
              '@codemirror/view',
              '@codemirror/commands',
              '@codemirror/language-data',
              '@codemirror/language',
              '@codemirror/lang-markdown',
              '@lezer/common',
              '@lezer/highlight',
              '@lezer/lr',
              '@lezer/markdown',
              'style-mod',
              'w3c-keyname',
              'crelt',
            ];
            if (CM_CORE.some((p) => id.includes(p))) return 'codemirror';
            if (id.includes('@tiptap') || id.includes('prosemirror')) return 'tiptap';
            return undefined;
          },
        },
      },
    },
    test: {
      environment: 'node',
    },
  };
});
