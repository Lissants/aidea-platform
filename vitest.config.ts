import { defineConfig } from 'vitest/config';
import path from 'node:path';

export default defineConfig({
  test: {
    environment: 'node',
    include: ['tests/unit/**/*.test.ts', 'tests/integration/**/*.test.ts'],
  },
  resolve: {
    alias: {
      '@': path.resolve(__dirname, '.'),
      // See tests/mocks/server-only-stub.ts for why this is aliased.
      'server-only': path.resolve(__dirname, 'tests/mocks/server-only-stub.ts'),
    },
  },
});
