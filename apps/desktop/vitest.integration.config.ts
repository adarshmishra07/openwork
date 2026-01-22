import { defineConfig, mergeConfig } from 'vitest/config';
import baseConfig from './vitest.config';

/**
 * Integration test configuration - extends base config with integration-specific settings.
 * Run with: pnpm -F @accomplish/desktop test:integration
 */
export default mergeConfig(
  baseConfig,
  defineConfig({
    test: {
      name: 'integration',
      include: ['__tests__/**/*.integration.test.{ts,tsx}'],
      // Integration tests may need longer timeouts
      testTimeout: 10000,
      hookTimeout: 15000,
    },
  })
);
