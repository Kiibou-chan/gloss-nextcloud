import { defineConfig } from 'vitest/config'

const pureTests = ['test/{domain,app,structure}/**/*.{test,spec}.{ts,tsx,js,jsx,mts,mjs,cts,cjs}']

export default defineConfig({
  test: {
    projects: [
      { test: { name: 'pure', environment: 'node', include: pureTests } },
      { test: {
        name: 'browser',
        environment: 'jsdom',
        include: ['test/**/*.{test,spec}.{ts,tsx,js,jsx,mts,mjs,cts,cjs}'],
        exclude: pureTests,
      } },
    ],
  },
})
