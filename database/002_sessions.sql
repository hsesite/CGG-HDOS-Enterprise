-- Additions for server-side sessions. Run after schema.sql.

create table if not exists user_sessions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references users(id) on delete cascade,
  token_hash text not null unique,
  expires_at timestamptz not null,
  created_at timestamptz not null default now()
);
create index if not exists user_sessions_token_idx on user_sessions(token_hash);
create index if not exists user_sessions_expiry_idx on user_sessions(expires_at);
