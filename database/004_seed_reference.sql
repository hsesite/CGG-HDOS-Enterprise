-- Seed roles, permissions, and an initial administrator.
-- Set SEED_ADMIN_PASSWORD before running this file through the seed script.

insert into roles(name) values
  ('KTT'), ('Project Manager'), ('SPV HSE'), ('Foreman Safety'),
  ('Safety Officer'), ('Paramedis'), ('Contractor PIC'), ('Employee')
on conflict (name) do nothing;

insert into permissions(key) values
  ('admin.permissions.read'),
  ('inspection.read'), ('inspection.create'), ('inspection.update'),
  ('hazard.read'), ('hazard.create'), ('hazard.update'),
  ('pica.read'), ('pica.create'), ('pica.update'),
  ('incident.read'), ('incident.create'), ('incident.update')
on conflict (key) do nothing;

insert into role_permissions(role_id, permission_id)
select r.id, p.id from roles r cross join permissions p
where r.name in ('KTT', 'SPV HSE')
on conflict do nothing;

insert into role_permissions(role_id, permission_id)
select r.id, p.id from roles r
join permissions p on p.key in ('inspection.read', 'inspection.create', 'inspection.update', 'hazard.read', 'hazard.create', 'hazard.update')
where r.name in ('Foreman Safety', 'Safety Officer')
on conflict do nothing;

insert into role_permissions(role_id, permission_id)
select r.id, p.id from roles r
join permissions p on p.key in ('hazard.read', 'hazard.create')
where r.name in ('Contractor PIC', 'Employee')
on conflict do nothing;
