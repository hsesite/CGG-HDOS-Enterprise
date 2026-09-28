import type { Express, Request } from 'express';
import { query } from './db';
import { requireAuth } from './auth';
import { requirePermission } from './rbac';

type Entity = 'inspections' | 'hazards' | 'picas' | 'incidents';
type AuthRequest = Request & { user?: { id: string } };
const tableMap: Record<Entity, string> = { inspections: 'inspections', hazards: 'hazards', picas: 'picas', incidents: 'incidents' };
const permissions: Record<Entity, string> = { inspections: 'inspection', hazards: 'hazard', picas: 'pica', incidents: 'incident' };

function envelope(data: unknown, message = '') { return { success: true, data, message, timestamp: new Date().toISOString() }; }
function fail(message: string) { return { success: false, data: null, message, timestamp: new Date().toISOString() }; }

export function registerHseRoutes(app: Express): void {
  (Object.keys(tableMap) as Entity[]).forEach((entity) => {
    const table = tableMap[entity];
    const permission = permissions[entity];
    app.get(`/api/${entity}`, requireAuth, requirePermission(`${permission}.read`), async (req, res, next) => {
      try {
        const limit = Math.min(Math.max(Number(req.query.limit ?? 50) || 50, 1), 100);
        const offset = Math.max(Number(req.query.offset ?? 0) || 0, 0);
        const result = await query(`select * from ${table} where deleted_at is null order by created_at desc limit $1 offset $2`, [limit, offset]);
        res.json(envelope(result.rows));
      } catch (error) { next(error); }
    });

    app.get(`/api/${entity}/:id`, requireAuth, requirePermission(`${permission}.read`), async (req, res, next) => {
      try {
        const result = await query(`select * from ${table} where id = $1 and deleted_at is null`, [req.params.id]);
        if (!result.rows[0]) { res.status(404).json(fail(`${entity.slice(0, -1)} not found`)); return; }
        res.json(envelope(result.rows[0]));
      } catch (error) { next(error); }
    });

    app.post(`/api/${entity}`, requireAuth, requirePermission(`${permission}.create`), async (req: AuthRequest, res, next) => {
      try {
        const payload = req.body;
        if (!payload || typeof payload !== 'object' || Array.isArray(payload)) { res.status(400).json(fail('Request body must be an object')); return; }
        const result = await query(`insert into ${table} (payload, created_by, updated_by) values ($1::jsonb, $2, $2) returning *`, [JSON.stringify(payload), req.user!.id]);
        const row = result.rows[0];
        await query(`insert into audit_logs (actor_user_id, action, entity_type, entity_id, after_data) values ($1, 'CREATE', $2, $3, $4::jsonb)`, [req.user!.id, entity, row.id, JSON.stringify(row)]);
        res.status(201).json(envelope(row, `${entity.slice(0, -1)} created`));
      } catch (error) { next(error); }
    });

    app.patch(`/api/${entity}/:id`, requireAuth, requirePermission(`${permission}.update`), async (req: AuthRequest, res, next) => {
      try {
        const current = await query(`select * from ${table} where id = $1 and deleted_at is null`, [req.params.id]);
        if (!current.rows[0]) { res.status(404).json(fail(`${entity.slice(0, -1)} not found`)); return; }
        const result = await query(`update ${table} set payload = payload || $1::jsonb, version = version + 1, updated_by = $2, updated_at = now() where id = $3 returning *`, [JSON.stringify(req.body ?? {}), req.user!.id, req.params.id]);
        await query(`insert into audit_logs (actor_user_id, action, entity_type, entity_id, before_data, after_data) values ($1, 'UPDATE', $2, $3, $4::jsonb, $5::jsonb)`, [req.user!.id, entity, req.params.id, JSON.stringify(current.rows[0]), JSON.stringify(result.rows[0])]);
        res.json(envelope(result.rows[0], `${entity.slice(0, -1)} updated`));
      } catch (error) { next(error); }
    });
  });
}
