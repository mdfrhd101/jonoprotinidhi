import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    environment: 'node',
    include: ['test/**/*.test.ts'],
    testTimeout: 30_000,
    hookTimeout: 120_000,
    pool: 'forks',
    poolOptions: { forks: { singleFork: false } },
    env: { MONGOMS_SYSTEM_BINARY: 'C:/Program Files/MongoDB/Server/8.3/bin/mongod.exe', MONGOMS_VERSION: '8.3.7' },
    coverage: { provider: 'v8', include: ['src/**/*.ts'], exclude: ['src/server.ts', 'src/seed.ts'], reporter: ['text-summary', 'text'] },
  },
});
