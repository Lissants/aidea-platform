import { defineConfig } from 'vitest/config';
import path from 'node:path';

export default defineConfig({
  test: {
    environment: 'node',
    include: ['tests/unit/**/*.test.ts', 'tests/integration/**/*.test.ts'],
    // Integration tests run real SQL against a disposable aidea_test
    // database (created/dropped by the global setup, reset per file), so
    // files must not run concurrently against it.
    globalSetup: ['tests/integration/global-setup.ts'],
    env: { MSSQL_DATABASE: 'aidea_test' },
    fileParallelism: false,
    testTimeout: 30_000,
    hookTimeout: 60_000,
  },
  resolve: {
    alias: {
      '@': path.resolve(__dirname, '.'),
      // See tests/mocks/server-only-stub.ts for why this is aliased.
      'server-only': path.resolve(__dirname, 'tests/mocks/server-only-stub.ts'),
    },
  },
});
