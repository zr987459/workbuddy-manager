import { defineConfig } from 'vite'
import preact from '@preact/preset-vite'
import tailwindcss from '@tailwindcss/vite'

// 开发：npm run dev（5173）→ /m/api 代理到本机 BFF（默认 8796）
const BFF = process.env.WBM_DEV_BFF || 'http://127.0.0.1:8796'

export default defineConfig({
  base: '/m/',
  plugins: [preact(), tailwindcss()],
  server: {
    host: true,
    proxy: { '/m/api': { target: BFF, changeOrigin: false } },
  },
  build: {
    outDir: 'dist',
    emptyOutDir: true,
    target: 'es2020',
    cssMinify: true,
    assetsInlineLimit: 0,
    rollupOptions: {
      output: { manualChunks: { md: ['marked', 'dompurify'] } },
    },
  },
})
