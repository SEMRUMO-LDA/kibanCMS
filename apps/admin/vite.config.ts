import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import path from 'path'

// https://vite.dev/config/
export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: {
      '@addons': path.resolve(__dirname, '../../packages/addons/src'),
    },
  },
  server: {
    port: 5173,
    host: true,
    strictPort: false,
    hmr: {
      overlay: true,
    },
  },
  envPrefix: 'VITE_',
})
