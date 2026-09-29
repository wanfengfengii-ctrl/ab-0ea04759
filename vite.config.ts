import { defineConfig, type PluginOption } from 'vitest/config';
import react from '@vitejs/plugin-react';

/** 开发服务器健康检查端点 /healthz；生产构建由 public/healthz 提供 */
function healthzPlugin(): PluginOption {
  return {
    name: 'dev-healthz',
    configureServer(server) {
      server.middlewares.use((req, res, next) => {
        if (req.url === '/healthz') {
          res.statusCode = 200;
          res.setHeader('Content-Type', 'text/plain; charset=utf-8');
          res.end('ok');
          return;
        }
        next();
      });
    },
  };
}

export default defineConfig({
  plugins: [react(), healthzPlugin()],
  server: {
    port: 8080,
  },
  preview: {
    port: 8080,
  },
  test: {
    setupFiles: ['./src/test-setup.ts'],
  },
});
