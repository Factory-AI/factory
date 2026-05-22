import mdx from '@mdx-js/rollup';
import { defineConfig } from 'vitest/config';

export default defineConfig({
  plugins: [mdx()],
  test: {
    environment: 'node',
  },
});
