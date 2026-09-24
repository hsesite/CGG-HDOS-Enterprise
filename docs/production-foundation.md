# HDOS production foundation

This branch starts the production migration without changing `main`.

## Current implementation

- Express API bootstrap with liveness/readiness endpoints.
- Request IDs and baseline security response headers.
- Strict JSON body limit and CORS allowlist configuration.
- PostgreSQL foundation schema for users, RBAC, audit logs, and sync operations.
- Graceful API shutdown handling.

## Run locally

```bash
cp .env.example .env
bun run server:dev
```

The API listens on `http://localhost:4000` by default.

- `GET /api/health/live`
- `GET /api/health/ready`

## Important

This is the first production foundation slice, not a claim that the application is production-ready yet. Authentication, migrations, domain APIs, object storage, and real sync must be implemented before production use.
