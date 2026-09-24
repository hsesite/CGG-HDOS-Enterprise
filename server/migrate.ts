import 'dotenv/config';
import fs from 'node:fs/promises';
import path from 'node:path';
import { query, closeDatabase } from './db';

const migrations = [
  'database/schema.sql',
  'database/002_sessions.sql',
  'database/003_hse_domain.sql',
  'database/004_seed_reference.sql',
];

async function main(): Promise<void> {
  for (const migration of migrations) {
    const filename = path.resolve(process.cwd(), migration);
    const sql = await fs.readFile(filename, 'utf8');
    console.log(`[HDOS migration] applying ${migration}`);
    await query('begin');
    try {
      await query(sql);
      await query('commit');
    } catch (error) {
      await query('rollback');
      throw error;
    }
  }
  console.log('[HDOS migration] complete');
}

main()
  .catch((error) => {
    console.error('[HDOS migration] failed', error);
    process.exitCode = 1;
  })
  .finally(() => closeDatabase());
