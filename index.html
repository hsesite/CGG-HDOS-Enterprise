import express, { type NextFunction, type Request, type Response } from 'express';
import crypto from 'node:crypto';
import { config } from './config';

const app = express();

app.disable('x-powered-by');
app.use(express.json({ limit: '1mb' }));
app.use((req, res, next) => {
  const requestId = req.header('x-request-id') || crypto.randomUUID();
  res.setHeader('x-request-id', requestId);
  res.setHeader('x-content-type-options', 'nosniff');
  res.setHeader('x-frame-options', 'DENY');
  res.setHeader('referrer-policy', 'no-referrer');
  next();
});
app.use((req, res, next) => {
  const origin = req.header('origin');
  if (origin && config.corsOrigins.includes(origin)) {
    res.setHeader('access-control-allow-origin', origin);
    res.setHeader('vary', 'Origin');
    res.setHeader('access-control-allow-credentials', 'true');
  }
  if (req.method === 'OPTIONS') {
    res.setHeader('access-control-allow-methods', 'GET,POST,PATCH,PUT,DELETE,OPTIONS');
    res.setHeader('access-control-allow-headers', 'content-type,authorization,x-request-id');
    return res.status(204).end();
  }
  next();
});

app.get('/api/health/live', (_req, res) => {
  res.json({ success: true, data: { status: 'live' }, message: '', timestamp: new Date().toISOString() });
});

app.get('/api/health/ready', (_req, res) => {
  // Database readiness will be added before enabling production traffic.
  res.json({
    success: true,
    data: { status: 'ready', databaseConfigured: Boolean(config.databaseUrl) },
    message: '',
    timestamp: new Date().toISOString(),
  });
});

app.use((_req, res) => {
  res.status(404).json({ success: false, data: null, message: 'Route not found', timestamp: new Date().toISOString() });
});

app.use((error: unknown, _req: Request, res: Response, _next: NextFunction) => {
  console.error('[HDOS API] Unhandled error', error);
  res.status(500).json({
    success: false,
    data: null,
    message: config.isProduction ? 'Internal server error' : String(error),
    timestamp: new Date().toISOString(),
  });
});

const server = app.listen(config.port, '0.0.0.0', () => {
  console.log(`[HDOS API] listening on http://localhost:${config.port}`);
});

function shutdown(signal: string): void {
  console.log(`[HDOS API] ${signal} received; shutting down`);
  server.close((error) => {
    if (error) {
      console.error('[HDOS API] shutdown failed', error);
      process.exitCode = 1;
    }
    process.exit();
  });
}

process.once('SIGINT', () => shutdown('SIGINT'));
process.once('SIGTERM', () => shutdown('SIGTERM'));

export { app };
