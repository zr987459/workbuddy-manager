import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';

// 开发时把 /m/api 代理到本机 BFF（python mobile/main.py --port 8796 ...）
export default defineConfig({
  plugins: [react(), tailwindcss()],
  base: '/',
  build: { outDir: 'dist', assetsDir: 'assets', sourcemap: false, target: 'es2022' },
  server: {
    port: 5173,
    proxy: { '/m/api': { target: 'http://127.0.0.1:8796', changeOrigin: false } },
  },
});
