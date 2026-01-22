import { defineConfig } from 'vitest/config';
import react from '@vitejs/plugin-react';
import path from 'path';

/**
 * Base Vitest configuration shared across all test types.
 * Use vitest.unit.config.ts or vitest.integration.config.ts for specific test runs.
 */
export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: {
      '@': path.resolve(__dirname, 'src/renderer'),
      '@main': path.resolve(__dirname, 'src/main'),
      '@renderer': path.resolve(__dirname, 'src/renderer'),
      '@shared': path.resolve(__dirname, '../../packages/shared/src'),
    },
  },
  test: {
    globals: true,
    root: __dirname,
    include: ['__tests__/**/*.test.ts', '__tests__/**/*.test.tsx'],
    exclude: ['**/node_modules/**', '**/dist/**', '**/dist-electron/**', '**/release/**'],
    setupFiles: ['__tests__/setup.ts'],
    environment: 'node',
    environmentMatchGlobs: [
      ['__tests__/**/*.renderer.*.test.{ts,tsx}', 'jsdom'],
      ['__tests__/**/renderer/**/*.test.{ts,tsx}', 'jsdom'],
    ],
    coverage: {
      provider: 'v8',
      enabled: false,
      reporter: ['text', 'html', 'lcov', 'json'],
      reportsDirectory: './coverage',
      include: ['src/**/*.{ts,tsx}'],
      exclude: [
        'src/**/*.d.ts',
        'src/**/index.ts',
        'src/vite-env.d.ts',
        'src/renderer/main.tsx',
        '**/node_modules/**',
        // Thin UI wrappers (Radix components with only styling)
        'src/renderer/components/ui/avatar.tsx',
        'src/renderer/components/ui/badge.tsx',
        'src/renderer/components/ui/card.tsx',
        'src/renderer/components/ui/dialog.tsx',
        'src/renderer/components/ui/dropdown-menu.tsx',
        'src/renderer/components/ui/label.tsx',
        'src/renderer/components/ui/separator.tsx',
        'src/renderer/components/ui/skeleton.tsx',
        'src/renderer/components/ui/textarea.tsx',
        'src/renderer/components/ui/tooltip.tsx',
        'src/renderer/components/ui/popover.tsx',
        'src/renderer/components/ui/select.tsx',
        // Simple page wrappers
        'src/renderer/pages/History.tsx',
        // Infrastructure code
        'src/main/permission-api.ts',
        'src/main/store/freshInstallCleanup.ts',
        'src/main/test-utils/**',
      ],
      thresholds: {
        statements: 80,
        branches: 70,
        functions: 80,
        lines: 80,
      },
    },
    testTimeout: 5000,
    hookTimeout: 10000,
    retry: 0,
    reporters: ['default'],
    watch: false,
  },
});
