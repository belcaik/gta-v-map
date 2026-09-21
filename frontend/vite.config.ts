import { defineConfig, loadEnv } from 'vite'
import react from '@vitejs/plugin-react'

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, '..', '')
  return {
    plugins: [react()],
    server: { host: '127.0.0.1', port: 5175, strictPort: true, proxy: {
      '/api': env.API_TARGET || 'http://127.0.0.1:3002',
      '/assets': env.API_TARGET || 'http://127.0.0.1:3002',
      '/tiles': env.API_TARGET || 'http://127.0.0.1:3002',
    } },
  }
})
