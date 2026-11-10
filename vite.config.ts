import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

/**
 * Binds to 0.0.0.0 so the editor is reachable from other devices on the LAN
 * (phone, tablet, another laptop). Use `npm run dev:local` to stay on loopback.
 */
export default defineConfig({
  plugins: [react()],
  server: {
    port: 5273,
    host: true,
    strictPort: true,
  },
  preview: {
    port: 4173,
    host: true,
    strictPort: true,
  },
})
