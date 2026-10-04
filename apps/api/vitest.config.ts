import { fileURLToPath } from 'node:url';
import { defineConfig } from 'vitest/config';

export default defineConfig({
  resolve: {
    alias: {
      // read the contract from source, so tests need no build step and never see a stale dist
      '@fedsa/contract': fileURLToPath(
        new URL('../../packages/contract/src/index.ts', import.meta.url),
      ),
    },
  },
});
