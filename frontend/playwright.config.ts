import { defineConfig } from '@playwright/test'

export default defineConfig({
  testDir: './tests',
  workers: 1,
  use: {
    baseURL: 'http://127.0.0.1:5176',
    viewport: { width: 1440, height: 1000 },
    launchOptions: process.env.CHROME_PATH ? { executablePath: process.env.CHROME_PATH } : {},
    screenshot: 'only-on-failure',
  },
  webServer: [
    {
      command: 'node tests/start-api.mjs',
      url: 'http://127.0.0.1:3902/api/dataset',
      reuseExistingServer: false,
      timeout: 60_000,
    },
    {
      command: 'npm run dev -- --port 5176',
      url: 'http://127.0.0.1:5176',
      env: { API_TARGET: 'http://127.0.0.1:3902' },
      reuseExistingServer: false,
    },
  ],
})
