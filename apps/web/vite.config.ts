import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { VitePWA } from 'vite-plugin-pwa'

// https://vite.dev/config/
export default defineConfig({
  plugins: [
    react(),
    VitePWA({
      strategies: 'injectManifest',
      srcDir: 'src',
      filename: 'sw.ts',
      injectRegister: 'script-defer',
      // the PNG icons are only needed at install
      includeManifestIcons: false,
      injectManifest: {
        // fonts are cached as they are used, because most of the subsets never are
        globPatterns: ['index.html', 'assets/*.{js,css}', '*.svg'],
      },
      manifest: {
        name: 'FEDSA',
        short_name: 'FEDSA',
        description:
          'Food Excess Distribution South Africa. Donors post surplus food and recipient organisations claim it.',
        lang: 'en',
        start_url: '/',
        scope: '/',
        display: 'standalone',
        // --c-ink, the header, and --c-bg from tokens.css
        theme_color: '#2e2a26',
        background_color: '#faf6f0',
        icons: [
          { src: '/pwa-192.png', sizes: '192x192', type: 'image/png' },
          { src: '/pwa-512.png', sizes: '512x512', type: 'image/png' },
        ],
      },
    }),
  ],
  server: {
    // same-origin /api locally, as the Netlify rewrite gives in production
    proxy: { '/api': 'http://localhost:3000' },
  },
})
