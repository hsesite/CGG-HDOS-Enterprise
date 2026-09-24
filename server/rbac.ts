import type { Express, Request, Response, NextFunction } from 'express';
import { query } from './db';
import { requireAuth, type AuthUser } from './auth';

type AuthenticatedRequest = Request & { user?: AuthUser };

export function requirePermission(permission: string) {
  return async (req: AuthenticatedRequest, res: Response, next: NextFunction): Promise<void> => {
    try {
      if (!req.user) { res.status(401).json({ success: false, data: null, message: 'Authentication required', timestamp: new Date().toISOString() }); return; }
      const result = await query<{ allowed: boolean }>(
        `select exists (
          select 1 from user_roles ur
          join role_permissions rp on rp.role_id = ur.role_id
          join permissions p on p.id = rp.permission_id
          where ur.user_id = $1 and p.key = $2
        ) as allowed`, [req.user.id, permission],
      );
      if (!result.rows[0]?.allowed) { res.status(403).json({ success: false, data: null, message: 'Permission denied', timestamp: new Date().toISOString() }); return; }
      next();
    } catch (error) { next(error); }
  };
}

export function registerRbacRoutes(app: Express): void {
  app.get('/api/admin/permissions', requireAuth, requirePermission('admin.permissions.read'), async (_req, res, next) => {
    try {
      const result = await query('select key from permissions order by key');
      res.json({ success: true, data: result.rows, message: '', timestamp: new Date().toISOString() });
    } catch (error) { next(error); }
  });
}
