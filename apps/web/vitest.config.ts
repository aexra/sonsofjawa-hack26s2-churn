import { mergeConfig } from 'vite';
import { defineConfig } from 'vitest/config';

import viteConfig from './vite.config.ts';

export default mergeConfig(
  viteConfig,
  defineConfig({
    test: {
      environment: 'jsdom',
      maxWorkers: 4,
      setupFiles: ['src/test/setup.ts'],
      include: ['src/**/*.test.{ts,tsx}', 'scripts/**/*.test.mjs'],
    },
  }),
);
