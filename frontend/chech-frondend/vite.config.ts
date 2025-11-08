import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { fileURLToPath, URL } from 'node:url'

// https://vite.dev/config/
export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: {
      // Map '@' to /src so imports like '@/lib/utils' work
      '@': fileURLToPath(new URL('./src', import.meta.url))
    }
  }
})
