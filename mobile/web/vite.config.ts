import {defineConfig} from 'vite';
import react from '@vitejs/plugin-react';

// 开发：npm run dev（5173）→ /m/api 代理到本地 BFF（python mobile/main.py）
export default defineConfig({
  plugins: [react()],
  base: '/',
  build: {outDir: 'dist', target: 'es2022', sourcemap: false, chunkSizeWarningLimit: 400},
  server: {
    port: 5173,
    host: true,
    proxy: {'/m/api': {target: process.env.BFF_URL || 'http://127.0.0.1:8796', changeOrigin: true}},
  },
});
