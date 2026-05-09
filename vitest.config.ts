import { defineConfig } from 'vitest/config'
import path from 'node:path'

export default defineConfig({
  oxc: {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any -- oxc jsx 'automatic' is valid at runtime but not in stable typings
    jsx: 'automatic' as any,
  },
  test: {
    environment: 'jsdom',
    globals: true,
    setupFiles: ['./vitest.setup.ts'],
    css: false,
    include: ['**/*.test.{ts,tsx}'],
    exclude: [
      '**/node_modules/**',
      '**/.next/**',
      '**/e2e/**',
      '**/pipeline/**',
      '**/*.integration.test.{ts,tsx}',
    ],
    coverage: {
      provider: 'v8',
      reporter: ['text', 'html', 'lcov'],
      include: [
        'lib/**/*.ts',
        'components/**/*.{ts,tsx}',
        'app/api/**/*.ts',
        'middleware.ts',
      ],
      exclude: [
        '**/*.test.*',
        '**/*.integration.test.*',
        'lib/types.ts',
        'lib/site-config.ts',
      ],
    },
  },
  resolve: {
    alias: {
      '@': path.resolve(__dirname, '.'),
    },
  },
})
