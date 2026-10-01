import { defineConfig } from 'vitest/config';

// Local mongod for mongodb-memory-server: MONGOMS_SYSTEM_BINARY wins; Windows falls back to the default install path;
// elsewhere, with neither set, mongodb-memory-server downloads MONGOMS_VERSION itself.
const mongod = process.env.MONGOMS_SYSTEM_BINARY
  ?? (process.platform === 'win32' ? 'C:/Program Files/MongoDB/Server/8.3/bin/mongod.exe' : undefined);

export default defineConfig({
  test: {
    environment: 'node',
    include: ['test/**/*.test.ts'],
    testTimeout: 30_000,
    hookTimeout: 120_000,
    pool: 'forks',
    poolOptions: { forks: { singleFork: false } },
    env: { ...(mongod ? { MONGOMS_SYSTEM_BINARY: mongod } : {}), MONGOMS_VERSION: '8.3.7' },
    coverage: { provider: 'v8', include: ['src/**/*.ts'], exclude: ['src/server.ts', 'src/seed.ts'], reporter: ['text-summary', 'text'] },
  },
});
