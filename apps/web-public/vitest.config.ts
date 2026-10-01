import { defineConfig } from 'vitest/config';
import { fileURLToPath } from 'node:url';

export default defineConfig({
  resolve: { alias: { '@': fileURLToPath(new URL('./src', import.meta.url)) } },
  esbuild: { jsx: 'automatic' }, // tsconfig says "preserve" for Next; the component test needs it compiled
  test: { include: ['test/**/*.test.{ts,tsx}'], environment: 'node' }, // a .tsx test opts into jsdom with a docblock
});
