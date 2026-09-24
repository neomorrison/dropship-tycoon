import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// Served from https://neomorrison.github.io/dropship-tycoon/ in production.
export default defineConfig(({ command }) => ({
  base: command === 'build' ? '/dropship-tycoon/' : '/',
  plugins: [react()],
  server: { port: 5317 },
}))
