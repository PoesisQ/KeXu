import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { VitePWA } from 'vite-plugin-pwa';

export default defineConfig({
  plugins: [
    react(),
    VitePWA({
      registerType: 'autoUpdate',
      includeAssets: ['icon-kexu.png'],
      manifest: {
        name: 'KeXu',
        short_name: 'KeXu',
        description: '无广告、本地优先的高自由度课表',
        theme_color: '#f4f2ec',
        background_color: '#f4f2ec',
        display: 'standalone',
        start_url: '/',
        icons: [
          { src: 'icon-kexu.png', sizes: '512x512', type: 'image/png', purpose: 'any' }
        ]
      },
      workbox: {
        globPatterns: ['**/*.{js,css,html,png,svg,woff2,wasm,bcmap,pfb,ttf}'],
        maximumFileSizeToCacheInBytes: 8 * 1024 * 1024
      }
    })
  ],
  build: { target: 'es2022' },
  test: { environment: 'node' }
});
