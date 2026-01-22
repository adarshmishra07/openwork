import { defineConfig, mergeConfig } from 'vitest/config';
import baseConfig from './vitest.config';

/**
 * Unit test configuration - extends base config with unit-specific settings.
 * Run with: pnpm -F @accomplish/desktop test:unit
 */
export default mergeConfig(
  baseConfig,
  defineConfig({
    test: {
      name: 'unit',
      include: ['__tests__/**/*.unit.test.{ts,tsx}'],
      testTimeout: 5000,
      hookTimeout: 10000,
    },
  })
);
