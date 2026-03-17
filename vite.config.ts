import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// https://vite.dev/config/
export default defineConfig(({ mode }) => ({
  plugins: [react()],
  define: mode === 'production'
    ? { 'import.meta.env.VITE_API_BASE_URL': JSON.stringify('http://43.139.107.97:8000') }
    : {},
  server: {
    proxy: {
      // All /api/* requests from the browser are forwarded to the backend.
      // This runs server-side so there is no CORS restriction.
      '/api': {
        target: 'http://43.139.107.97:8000',
        changeOrigin: true,
      },
    },
  },
}))
