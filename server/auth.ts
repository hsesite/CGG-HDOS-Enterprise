import crypto from 'node:crypto';
import type { NextFunction, Request, Response } from 'express';
import { query } from './db';

const ITERATIONS = 210_000;
const KEY_LENGTH = 32;
const DIGEST = 'sha256';

export type AuthUser = { id: string; email: string; displayName: string; roles: string[] };

type SessionRequest = Request & { user?: AuthUser; requestId?: string };

function hashPassword(password: string, salt = crypto.randomBytes(16).toString('hex')): string {
  const derived = crypto.pbkdf2Sync(password, salt, ITERATIONS, KEY_LENGTH, DIGEST).toString('hex');
  return `pbkdf2$${ITERATIONS}$${salt}$${derived}`;
}

function verifyPassword(password: string, encoded: string): boolean {
  const [, iterations, salt, expected] = encoded.split('$');
  if (!iterations || !salt || !expected) return false;
  const actual = crypto.pbkdf2Sync(password, salt, Number(iterations), KEY_LENGTH, DIGEST).toString('hex');
  return actual.length === expected.length && crypto.timingSafeEqual(Buffer.from(actual), Buffer.from(expected));
}

function tokenHash(token: string): string {
  return crypto.createHash('sha256').update(token).digest('hex');
}

export function registerAuthRoutes(app: import('express').Express): void {
  app.post('/api/auth/login', async (req, res, next) => {
    try {
      const email = typeof req.body?.email === 'string' ? req.body.email.trim().toLowerCase() : '';
      const password = typeof req.body?.password === 'string' ? req.body.password : '';
      if (!email || password.length < 8) {
        res.status(400).json({ success: false, data: null, message: 'Email and password are required', timestamp: new Date().toISOString() });
        return;
      }
      const result = await query<{ id: string; email: string; display_name: string; password_hash: string; roles: string[] }>(
        `select u.id, u.email, u.display_name, u.password_hash, coalesce(array_agg(r.name) filter (where r.name is not null), '{}') as roles
         from users u left join user_roles ur on ur.user_id = u.id left join roles r on r.id = ur.role_id
         where lower(u.email) = $1 and u.status = 'ACTIVE'
         group by u.id`, [email],
      );
      const user = result.rows[0];
      if (!user || !verifyPassword(password, user.password_hash)) {
        res.status(401).json({ success: false, data: null, message: 'Invalid credentials', timestamp: new Date().toISOString() });
        return;
      }
      const rawToken = crypto.randomBytes(32).toString('base64url');
      const ttlHours = Number(process.env.SESSION_TTL_HOURS ?? 12);
      await query(`insert into user_sessions (user_id, token_hash, expires_at) values ($1, $2, now() + ($3 * interval '1 hour'))`, [user.id, tokenHash(rawToken), ttlHours]);
      res.json({ success: true, data: { token: rawToken, user: { id: user.id, email: user.email, displayName: user.display_name, roles: user.roles } }, message: 'Login successful', timestamp: new Date().toISOString() });
    } catch (error) { next(error); }
  });

  app.post('/api/auth/logout', requireAuth, async (req: SessionRequest, res, next) => {
    try {
      const token = bearerToken(req);
      if (token) await query('delete from user_sessions where token_hash = $1', [tokenHash(token)]);
      res.json({ success: true, data: null, message: 'Logout successful', timestamp: new Date().toISOString() });
    } catch (error) { next(error); }
  });

  app.get('/api/me', requireAuth, (req: SessionRequest, res) => {
    res.json({ success: true, data: req.user, message: '', timestamp: new Date().toISOString() });
  });
}

function bearerToken(req: Request): string | null {
  const header = req.header('authorization');
  return header?.startsWith('Bearer ') ? header.slice(7) : null;
}

export async function requireAuth(req: SessionRequest, res: Response, next: NextFunction): Promise<void> {
  try {
    const token = bearerToken(req);
    if (!token) { res.status(401).json({ success: false, data: null, message: 'Authentication required', timestamp: new Date().toISOString() }); return; }
    const result = await query<{ id: string; email: string; display_name: string; roles: string[] }>(
      `select u.id, u.email, u.display_name, coalesce(array_agg(r.name) filter (where r.name is not null), '{}') as roles
       from user_sessions s join users u on u.id = s.user_id left join user_roles ur on ur.user_id = u.id left join roles r on r.id = ur.role_id
       where s.token_hash = $1 and s.expires_at > now() and u.status = 'ACTIVE'
       group by u.id`, [tokenHash(token)],
    );
    const user = result.rows[0];
    if (!user) { res.status(401).json({ success: false, data: null, message: 'Session expired or invalid', timestamp: new Date().toISOString() }); return; }
    req.user = { id: user.id, email: user.email, displayName: user.display_name, roles: user.roles };
    next();
  } catch (error) { next(error); }
}

export { hashPassword };
