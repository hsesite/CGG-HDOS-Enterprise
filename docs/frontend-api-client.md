# Frontend API client

`src/core/api.ts` is the first frontend boundary to the production API. It provides:

- server-side login/logout/session lookup
- authenticated Inspection, Hazard, PICA, and Incident requests
- one response/error contract for React modules
- session-scoped token storage (never commit a real token)

Set `VITE_API_URL` in `.env` when the API is not served from the same origin. The current legacy store remains available while each module is migrated; do not delete the IndexedDB layer until offline synchronization has been implemented and tested.

The next migration step is to replace each module's direct store mutation with `hseApi.create/update`, retaining IndexedDB as an offline cache and queue.
