# Production foundation setup

The repository changes are already applied to `build-29-production-foundation`; no manual code copying is required.

## One-command database setup

After creating `.env` and ensuring PostgreSQL is reachable:

```bash
bun install
bun run db:migrate
bun run db:seed
bun run typecheck:server
bun run server:dev
```

`db:migrate` applies the checked-in SQL files in order inside a transaction per file. It is intended for a new development database. Before applying it to an existing production database, take a backup and use a migration history table/tool.

## Admin seed

Set these values in `.env` before running `bun run db:seed`:

```dotenv
SEED_ADMIN_EMAIL=admin@ptcgg.com
SEED_ADMIN_PASSWORD=use-a-unique-password-at-least-12-characters
SEED_ADMIN_NAME=HDOS System Administrator
```

Do not commit `.env`, real passwords, database URLs, or API keys.

## Current status

The API and database are production foundations. The application is not yet approved for live HSE operations until domain validation, frontend API integration, attachment storage, offline synchronization, automated tests, backups, and deployment hardening are completed.
