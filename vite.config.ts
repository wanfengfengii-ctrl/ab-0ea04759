import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// 仅本机使用的开发/预览服务器；生产由容器内 nginx 托管静态构建产物。
export default defineConfig({
  plugins: [react()],
  server: {
    host: true,
    port: 5173,
  },
  preview: {
    host: true,
    port: 4173,
  },
});
