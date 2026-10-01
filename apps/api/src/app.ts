import express, { type ErrorRequestHandler, type Express } from 'express';
import helmet from 'helmet';
import cors from 'cors';
import cookieParser from 'cookie-parser';
import { randomUUID } from 'node:crypto';
import mongoose from 'mongoose';
import { ZodError } from 'zod';
import type { Deps } from './deps.js';
import { createServices, type Services } from './services/index.js';
import { ApiError } from './errors.js';
import { als } from './context.js';
import { logger } from './lib/logger.js';
import { stripOperators } from './lib/sanitize.js';
import { isIP } from 'node:net';
import { safeEqual } from './lib/crypto.js';
import { TenantScopeError } from './plugins/tenantScoped.js';
import { authRoutes } from './routes/auth.js';
import { superRoutes } from './routes/super.js';
import { adminRoutes } from './routes/admin.js';
import { publicRoutes, mediaFileRoute, isPublicComplaintSubmit } from './routes/public.js';

export function createApp(d: Deps, now: () => number = Date.now): { app: Express; services: Services } {
  const app = express();
  const services = createServices(d, now);
  app.disable('x-powered-by');
  app.set('trust proxy', 1);
  app.use(helmet());
  app.use(cors({ origin: (origin, cb) => cb(null, !origin || d.config.corsOrigins.includes(origin)), credentials: true, allowedHeaders: ['Content-Type', 'Authorization', 'X-CSRF'] }));
  // The public complaint submission (attachments) is the one large body; its own parser runs inside the public router,
  // after host resolution and a rate limit (BUG-2026-031). Everything else keeps the 1 MB limit.
  const json = express.json({ limit: '1mb' });
  app.use((req, res, next) => (isPublicComplaintSubmit(req) ? next() : json(req, res, next)));
  app.use(cookieParser());
  // NoSQL operator injection guard, applied before any route sees the body/query
  app.use((req, _res, next) => { if (req.body) req.body = stripOperators(req.body); for (const k of Object.keys(req.query)) if (k.startsWith('$') || k.includes('.')) delete (req.query as Record<string, unknown>)[k]; next(); });
  // Our own public-site server may name the visitor (BUG-2026-020). Without the shared token the header is ignored, so nobody
  // else can pick an IP to dodge rate limits. The token header is removed so it never reaches logs or handlers.
  app.use((req, _res, next) => {
    const tok = req.headers['x-site-token'];
    delete req.headers['x-site-token'];
    const claimed = String(req.headers['x-client-ip'] ?? '').trim();
    delete req.headers['x-client-ip'];
    if (d.config.SITE_SERVER_TOKEN && typeof tok === 'string' && safeEqual(tok, d.config.SITE_SERVER_TOKEN) && isIP(claimed)) {
      Object.defineProperty(req, 'ip', { value: claimed, configurable: true });
    }
    next();
  });
  // request context: every async continuation of this request sees the same store (tenant, actor, ip)
  app.use((req, res, next) => {
    const requestId = String(req.headers['x-request-id'] ?? randomUUID()).slice(0, 64);
    res.setHeader('X-Request-Id', requestId);
    als.run({ requestId, ip: req.ip, userAgent: String(req.headers['user-agent'] ?? '') }, next);
  });

  app.get('/api/health', (_req, res) => {
    const up = mongoose.connection.readyState === 1;
    res.status(up ? 200 : 503).json({ status: up ? 'ok' : 'degraded' });
  });

  app.use('/api/v1/auth', authRoutes(d, services.auth));
  app.use('/api/v1/super', superRoutes(d, services.tenants));
  app.use('/api/v1/admin/tenants/:tenantId', adminRoutes(d, services));
  app.use('/api/v1/public', mediaFileRoute(d, services)); // before the Host-resolving router: image URLs carry the tenant id
  app.use('/api/v1/public', publicRoutes(d, services));

  app.use('/api', (_req, res) => { res.status(404).json({ error: { code: 'NOT_FOUND', message: 'পাওয়া যায়নি' } }); });
  app.use(errorHandler);
  return { app, services };
}

const errorHandler: ErrorRequestHandler = (err, req, res, _next) => {
  if (res.headersSent) return;
  if (err instanceof ApiError) {
    const body: Record<string, unknown> = { code: err.code, message: err.message };
    if (err.details !== undefined) body.details = err.details;
    return void res.status(err.status).json({ error: body });
  }
  if (err instanceof ZodError) return void res.status(400).json({ error: { code: 'VALIDATION_FAILED', message: 'ইনপুট সঠিক নয়', details: err.flatten() } });
  if (err?.type === 'entity.parse.failed') return void res.status(400).json({ error: { code: 'BAD_JSON', message: 'অনুরোধের ফরম্যাট সঠিক নয়' } });
  if (err?.type === 'entity.too.large') return void res.status(413).json({ error: { code: 'TOO_LARGE', message: 'অনুরোধ অনেক বড়' } });
  if (err?.code === 11000) return void res.status(409).json({ error: { code: 'DUPLICATE', message: 'এই তথ্য আগে থেকেই আছে' } });
  if (err?.name === 'CastError') return void res.status(404).json({ error: { code: 'NOT_FOUND', message: 'পাওয়া যায়নি' } });
  // BUG-2026-030: a document the model refuses is bad input, not a server fault (no field values echoed back)
  if (err instanceof mongoose.Error.ValidationError) return void res.status(400).json({ error: { code: 'VALIDATION_FAILED', message: 'ইনপুট সঠিক নয়', details: { fieldErrors: Object.fromEntries(Object.keys(err.errors).map((k) => [k, ['সঠিক নয়']])), formErrors: [] } } });
  if (err instanceof TenantScopeError) logger.error({ err: err.message, path: req.path }, 'TENANT SCOPE VIOLATION');
  else logger.error({ err: err?.message, stack: err?.stack, path: req.path }, 'unhandled error');
  res.status(500).json({ error: { code: 'INTERNAL', message: 'সার্ভারে সমস্যা হয়েছে' } });
};
