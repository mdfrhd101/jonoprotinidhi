import mongoose from 'mongoose';
import { loadConfig } from './config.js';
import { buildDeps } from './bootstrap.js';
import { createApp } from './app.js';
import { logger } from './lib/logger.js';
import { Domain, Tenant, User, Membership, Post, Complaint, PromiseItem } from './models/index.js';

/* Boot order: env guard (crashes on a bad secret) -> Mongo -> indexes -> listen -> background jobs. */

async function main() {
  const config = loadConfig();
  if (config.isProd && !config.TURNSTILE_SECRET) throw new Error('TURNSTILE_SECRET is required in production');
  const deps = buildDeps(config);
  await mongoose.connect(config.MONGODB_URI);
  await Promise.all([Domain, Tenant, User, Membership, Post, Complaint, PromiseItem].map((m) => m.init()));
  const { app, services } = createApp(deps);
  const server = app.listen(config.PORT, () => logger.info({ port: config.PORT }, 'api listening'));

  // scheduled publishing every minute; PII retention purge every hour (re-entrancy guarded)
  let publishing = false, purging = false;
  const t1 = setInterval(async () => { if (publishing) return; publishing = true; try { await services.posts.publishDue(); } catch (e) { logger.error({ err: (e as Error).message }, 'publishDue failed'); } finally { publishing = false; } }, 60_000);
  const t2 = setInterval(async () => { if (purging) return; purging = true; try { await services.complaints.purgeExpiredPii(); } catch (e) { logger.error({ err: (e as Error).message }, 'purge failed'); } finally { purging = false; } }, 3_600_000);

  const shutdown = () => { clearInterval(t1); clearInterval(t2); server.close(() => mongoose.connection.close().then(() => process.exit(0))); };
  process.on('SIGTERM', shutdown); process.on('SIGINT', shutdown);
  process.on('unhandledRejection', (e) => logger.error({ err: String(e) }, 'unhandledRejection'));
}

main().catch((e) => { console.error(e instanceof Error ? e.message : e); process.exit(1); });
