-- HSE domain records. Business-specific fields live in payload while the envelope
-- provides ownership, optimistic versioning, soft-delete, and audit linkage.

do $$ begin
  create type hse_entity_status as enum ('DRAFT', 'OPEN', 'IN_PROGRESS', 'COMPLETED', 'CLOSED', 'CANCELLED');
exception when duplicate_object then null;
end $$;

create table if not exists inspections (
  id uuid primary key default gen_random_uuid(), payload jsonb not null default '{}'::jsonb,
  status hse_entity_status not null default 'DRAFT', version integer not null default 1,
  created_by uuid not null references users(id), updated_by uuid not null references users(id),
  created_at timestamptz not null default now(), updated_at timestamptz not null default now(), deleted_at timestamptz
);
create table if not exists hazards (like inspections including all);
create table if not exists picas (like inspections including all);
create table if not exists incidents (like inspections including all);

create index if not exists inspections_created_idx on inspections(created_at desc);
create index if not exists hazards_created_idx on hazards(created_at desc);
create index if not exists picas_created_idx on picas(created_at desc);
create index if not exists incidents_created_idx on incidents(created_at desc);
create index if not exists inspections_payload_idx on inspections using gin(payload);
create index if not exists hazards_payload_idx on hazards using gin(payload);
create index if not exists picas_payload_idx on picas using gin(payload);
create index if not exists incidents_payload_idx on incidents using gin(payload);
