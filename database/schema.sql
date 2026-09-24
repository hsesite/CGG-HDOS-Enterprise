-- CGG HDOS production foundation schema
-- PostgreSQL 16+; apply through a migration tool in deployment.

create extension if not exists pgcrypto;

create type user_status as enum ('ACTIVE', 'SUSPENDED', 'INVITED');
create type record_status as enum ('DRAFT', 'OPEN', 'IN_PROGRESS', 'COMPLETED', 'CLOSED', 'CANCELLED');

create table if not exists users (
  id uuid primary key default gen_random_uuid(),
  email text not null unique,
  display_name text not null,
  password_hash text not null,
  status user_status not null default 'INVITED',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists roles (
  id uuid primary key default gen_random_uuid(),
  name text not null unique,
  created_at timestamptz not null default now()
);

create table if not exists permissions (
  id uuid primary key default gen_random_uuid(),
  key text not null unique
);

create table if not exists user_roles (
  user_id uuid not null references users(id) on delete cascade,
  role_id uuid not null references roles(id) on delete cascade,
  primary key (user_id, role_id)
);

create table if not exists role_permissions (
  role_id uuid not null references roles(id) on delete cascade,
  permission_id uuid not null references permissions(id) on delete cascade,
  primary key (role_id, permission_id)
);

create table if not exists audit_logs (
  id uuid primary key default gen_random_uuid(),
  actor_user_id uuid references users(id),
  action text not null,
  entity_type text not null,
  entity_id uuid,
  before_data jsonb,
  after_data jsonb,
  request_id text,
  created_at timestamptz not null default now()
);

create index if not exists audit_logs_entity_idx on audit_logs(entity_type, entity_id);
create index if not exists audit_logs_created_at_idx on audit_logs(created_at);

create table if not exists sync_operations (
  id uuid primary key default gen_random_uuid(),
  client_operation_id text not null unique,
  entity_type text not null,
  entity_id uuid not null,
  operation text not null check (operation in ('CREATE', 'UPDATE', 'DELETE')),
  payload jsonb not null,
  base_version integer,
  status text not null default 'PENDING',
  error_message text,
  created_by uuid references users(id),
  created_at timestamptz not null default now(),
  processed_at timestamptz
);

create index if not exists sync_operations_status_idx on sync_operations(status, created_at);
