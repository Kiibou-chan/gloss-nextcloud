import { defineConfig } from 'vitest/config'

export default defineConfig({
  test: {
    projects: [
      { test: { name: 'pure', environment: 'node', include: ['test/{domain,app,structure}/**/*.test.ts'] } },
      { test: { name: 'browser', environment: 'jsdom', include: ['test/{adapters,ui}/**/*.test.{ts,tsx}'] } },
    ],
  },
})
