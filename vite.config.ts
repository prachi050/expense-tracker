import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
import { defineConfig } from 'vite'

export default defineConfig({
  // Relative so the built app works when Electron loads it over file://
  base: './',
  plugins: [react(), tailwindcss()],
  server: { port: 5181, strictPort: true },
  build: { outDir: 'dist', emptyOutDir: true },
})
