import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// https://vite.dev/config/
export default defineConfig({
  plugins: [react()],
  server: {
    // same-origin /api locally, as the Netlify rewrite gives in production
    proxy: { '/api': 'http://localhost:3000' },
  },
})
