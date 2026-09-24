import { query } from './db';
import { hashPassword } from './auth';

async function main(): Promise<void> {
  const email = (process.env.SEED_ADMIN_EMAIL ?? 'admin@ptcgg.com').trim().toLowerCase();
  const password = process.env.SEED_ADMIN_PASSWORD;
  if (!password || password.length < 12) throw new Error('SEED_ADMIN_PASSWORD must be at least 12 characters');
  const displayName = process.env.SEED_ADMIN_NAME ?? 'HDOS System Administrator';
  const user = await query<{ id: string }>(
    `insert into users(email, display_name, password_hash, status) values ($1, $2, $3, 'ACTIVE')
     on conflict (email) do update set display_name = excluded.display_name, password_hash = excluded.password_hash, status = 'ACTIVE'
     returning id`, [email, displayName, hashPassword(password)],
  );
  await query(`insert into user_roles(user_id, role_id) select $1, id from roles where name = 'KTT' on conflict do nothing`, [user.rows[0].id]);
  console.log(`Seeded active administrator: ${email}`);
}

main().catch((error) => { console.error('[HDOS seed] failed', error); process.exitCode = 1; });
