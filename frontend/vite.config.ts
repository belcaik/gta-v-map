import { defineConfig, loadEnv } from 'vite'
import react from '@vitejs/plugin-react'

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, '..', '')
  const host = process.env.WEB_HOST || env.WEB_HOST || '127.0.0.1'
  const port = Number(process.env.WEB_PORT || env.WEB_PORT || 5175)
  const apiTarget = process.env.API_TARGET || env.API_TARGET || 'http://127.0.0.1:3002'
  return {
    plugins: [react()],
    server: { host, port, strictPort: true, proxy: {
      '/api': apiTarget,
      '/assets': apiTarget,
      '/tiles': apiTarget,
    } },
  }
})
