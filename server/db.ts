import pg from 'pg';
import { config } from './config';

const { Pool } = pg;
let pool: pg.Pool | undefined;

export function getPool(): pg.Pool {
  if (!pool) {
    pool = new Pool({
      connectionString: config.requireDatabase(),
      max: 10,
      idleTimeoutMillis: 30_000,
      connectionTimeoutMillis: 5_000,
      ssl: config.isProduction ? { rejectUnauthorized: true } : undefined,
    });
  }
  return pool;
}

export async function query<T extends pg.QueryResultRow = pg.QueryResultRow>(text: string, values: unknown[] = []): Promise<pg.QueryResult<T>> {
  return getPool().query<T>(text, values);
}

export async function closeDatabase(): Promise<void> {
  if (pool) await pool.end();
  pool = undefined;
}

export async function checkDatabase(): Promise<boolean> {
  try {
    await query('select 1');
    return true;
  } catch (error) {
    console.error('[HDOS DB] readiness check failed', error);
    return false;
  }
}
