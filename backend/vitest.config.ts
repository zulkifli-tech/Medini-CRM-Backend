import { defineConfig } from 'vitest/config';
import { resolve } from 'node:path';

export default defineConfig({
  test: {
    globals: true,
    environment: 'node',
    include: ['test/**/*.spec.ts'],
    coverage: { reporter: ['text', 'json-summary'] },
  },
  resolve: {
    alias: {
      '@shared': resolve(__dirname, 'src/shared'),
      '@modules': resolve(__dirname, 'src/modules'),
      '@config': resolve(__dirname, 'src/config'),
      '@infrastructure': resolve(__dirname, 'src/infrastructure'),
    },
  },
});
