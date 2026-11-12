import { readFileSync } from 'node:fs'
import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// The version shown in the sidebar comes from package.json, so a release bump
// is one edit (apps/admin/package.json) and never drifts from the API's.
const pkg = JSON.parse(readFileSync(new URL('./package.json', import.meta.url), 'utf8')) as { version: string }

// https://vite.dev/config/
export default defineConfig({
  plugins: [react()],
  define: {
    __APP_VERSION__: JSON.stringify(pkg.version),
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
