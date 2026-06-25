import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { VitePWA } from 'vite-plugin-pwa';
import basicSsl from '@vitejs/plugin-basic-ssl'; // <-- 1. Import it here

export default defineConfig({
  plugins: [
    react(),
    basicSsl(), // <-- 2. Add it to the plugins list
    VitePWA({
      registerType: 'autoUpdate',
      devOptions: {
        enabled: true
      },
      manifest: {
        name: 'ExplaraX Check-In',
        short_name: 'Check-In',
        description: 'Event check-in scanner for ExplaraX',
        theme_color: '#7E57C2',
        background_color: '#0f172a',
        display: 'standalone',
        icons: [
          { src: '/icon-192.png', sizes: '192x192', type: 'image/png' },
          { src: '/icon-512.png', sizes: '512x512', type: 'image/png' }
        ]
      }
    })
  ],
});