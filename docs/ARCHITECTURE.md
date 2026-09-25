# CGG HDOS v3.0 - Architecture & Integration Guide

## System Architecture

```
┌─────────────────────────────────────────────────────────────┐
│                     Frontend (React 19)                       │
│  ┌──────────────────────────────────────────────────────┐   │
│  │  App.tsx (Session Gate & Router)                     │   │
│  │  ├─ LoginScreen (Backend Auth)                       │   │
│  │  ├─ DashboardModule                                  │   │
│  │  ├─ InspectionModule (API Integration)              │   │
│  │  ├─ HazardModule (API Integration)                  │   │
│  │  ├─ PICAModule (Approval Workflow)                  │   │
│  │  ├─ IncidentModule (Investigation)                  │   │
│  │  └─ SyncModule (Offline Queue Status)               │   │
│  └──────────────────────────────────────────────────────┘   │
│                                                               │
│  ┌──────────────────────────────────────────────────────┐   │
│  │  Core Layer (TypeScript)                             │   │
│  │  ├─ api.ts (Client - Backend communication)         │   │
│  │  ├─ auth-utils.ts (Login/Logout)                    │   │
│  │  ├─ auth-state.ts (Session state management)        │   │
│  │  ├─ permissions.ts (RBAC check)                     │   │
│  │  ├─ sync-queue.ts (Offline queue engine)            │   │
│  │  ├─ api-integration.ts (Store↔API bridge)           │   │
│  │  ├─ module-actions.ts (Action dispatcher)           │   │
│  │  ├─ audit.ts (Audit logging)                        │   │
│  │  ├─ store.ts (Centralized state)                    │   │
│  │  └─ db.ts (IndexedDB cache)                         │   │
│  └──────────────────────────────────────────────────────┘   │
└─────────────────────────────────────────────────────────────┘
                           │
                    HTTP/HTTPS API
                           │
┌─────────────────────────────────────────────────────────────┐
│                Backend (Express.js + Node.js)                │
│  ┌──────────────────────────────────────────────────────┐   │
│  │  server/index.ts (Main API server)                   │   │
│  │  ├─ CORS Middleware                                  │   │
│  │  ├─ JSON body parser                                 │   │
│  │  ├─ Health endpoints (/api/health/*)                │   │
│  │  └─ Error handler                                    │   │
│  └──────────────────────────────────────────────────────┘   │
│                                                               │
│  ┌──────────────────────────────────────────────────────┐   │
│  │  server/auth.ts (Authentication & Authorization)     │   │
│  │  ├─ POST /api/auth/login                             │   │
│  │  ├─ POST /api/auth/logout                            │   │
│  │  ├─ GET /api/me (Current user)                       │   │
│  │  └─ requireAuth (Middleware)                         │   │
│  └──────────────────────────────────────────────────────┘   │
│                                                               │
│  ┌──────────────────────────────────────────────────────┐   │
│  │  server/domain/ (HSE Domain Logic - API Endpoints)   │   │
│  │  ├─ inspection.ts (CRUD inspections)                │   │
│  │  ├─ hazard.ts (CRUD hazards)                        │   │
│  │  ├─ pica.ts (CRUD & approve PICAs)                  │   │
│  │  ├─ incident.ts (CRUD incidents)                    │   │
│  │  └─ repository.ts (CRUD documents)                  │   │
│  └──────────────────────────────────────────────────────┘   │
│                                                               │
│  ┌──────────────────────────────────────────────────────┐   │
│  │  server/db.ts (Database access layer)                │   │
│  │  └─ query() - Execute SQL + return results           │   │
│  └──────────────────────────────────────────────────────┘   │
└─────────────────────────────────────────────────────────────┘
                           │
                        PostgreSQL
                           │
┌─────────────────────────────────────────────────────────────┐
│                   PostgreSQL 16+                              │
│  ┌──────────────────────────────────────────────────────┐   │
│  │  Tables:                                             │   │
│  │  ├─ users (auth)                                     │   │
│  │  ├─ roles (RBAC)                                     │   │
│  │  ├─ permissions                                       │   │
│  │  ├─ user_roles (many-to-many)                        │   │
│  │  ├─ user_sessions (tokens)                           │   │
│  │  ├─ inspections (domain entity)                      │   │
│  │  ├─ hazards (domain entity)                          │   │
│  │  ├─ picas (domain entity)                            │   │
│  │  ├─ incidents (domain entity)                        │   │
│  │  ├─ sync_operations (offline queue)                  │   │
│  │  └─ audit_logs (compliance)                          │   │
│  └──────────────────────────────────────────────────────┘   │
└─────────────────────────────────────────────────────────────┘
```

---

## Data Flow

### User Login Flow

```
1. User masuk email & password di LoginScreen
   ↓
2. Frontend call hseApi.login() → POST /api/auth/login
   ↓
3. Backend verify credentials (PBKDF2 hash)
   ↓
4. Backend create session token & store di user_sessions
   ↓
5. Frontend receive token + user data
   ↓
6. Frontend save ke sessionStorage & AuthState
   ↓
7. App.tsx render dashboard
```

### Create Inspection Flow

```
1. User submit form di InspectionModule
   ↓
2. Frontend call createInspectionAction()
   ↓
3. Store.addInspection() → create locally + IndexedDB
   ↓
4. apiIntegration.createInspection() → call hseApi.create()
   ↓
5. API call: POST /api/inspections (with auth token)
   ↓
6. Backend validateInspection() → query DB → insert
   ↓
7. If success: remove from sync queue
   If error: add to sync queue for retry
   ↓
8. Frontend show success toast
```

### Offline Create Inspection Flow

```
1. User submit form (browser offline)
   ↓
2. Store.addInspection() → create locally + IndexedDB ✓
   ↓
3. apiIntegration.createInspection() → API call fails
   ↓
4. apiSyncQueue.enqueue() → add to queue (localStorage)
   ↓
5. User see toast: "Offline - akan sync saat online"
   ↓
6. Data tersimpan di IndexedDB (dapat diakses offline)
   ↓
[When network back online]
   ↓
7. window 'online' event fired
   ↓
8. apiSyncQueue.processQueue() → retry all pending items
   ↓
9. POST /api/inspections untuk setiap item
   ↓
10. Jika sukses: remove dari queue
    Jika gagal: increment retryCount (max 3x)
```

### RBAC Permission Check Flow

```
1. User login → backend return user.roles = ['SPV HSE']
   ↓
2. Frontend save ke AuthState.saveUser()
   ↓
3. At module level: usePermission('inspection.create')
   ↓
4. Check: does SPV HSE have permission 'inspection.create'?
   (lookup in permissions.ts roleMap)
   ↓
5. If yes: render form
   If no: render "Permission Denied" message
   ↓
6. On submit: API juga check permission (server-side)
   Backend query roles → permissions join → verify
   ↓
7. If fail: return 403 Forbidden
```

---

## Module Integration Pattern

Setiap module (Inspection, Hazard, PICA, Incident) mengikuti pattern:

### 1. Import Actions & Permissions

```typescript
import { createInspectionAction, getSyncQueueStatus } from '../core/module-actions';
import { usePermission } from '../core/permissions';
```

### 2. Check Permission

```typescript
const canCreate = usePermission('inspection.create');

if (!canCreate) {
  return <div>Anda tidak punya akses membuat inspection</div>;
}
```

### 3. Handle Create

```typescript
async function handleCreateInspection(data: InspectionData) {
  try {
    const created = await createInspectionAction(data);
    // Data automatically saved to IndexedDB + API
    // If offline: queued for sync
    showSuccess('Inspection dibuat');
  } catch (error) {
    showError(error.message);
  }
}
```

### 4. Load Data

```typescript
// From local store (IndexedDB + memory)
const { inspections } = useHDOSStore();

// For fresh data from API:
const data = await hseApi.list('inspections');
```

### 5. Monitor Sync Status

```typescript
const syncQueue = getSyncQueueStatus();
const pendingCount = syncQueue.length;

return (
  <div>
    {pendingCount > 0 && (
      <Alert>Ada {pendingCount} data menunggu sync</Alert>
    )}
  </div>
);
```

---

## API Contract

### Request/Response Format

**Success (2xx):**
```json
{
  "success": true,
  "data": { /* actual response data */ },
  "message": "",
  "timestamp": "2026-09-25T20:00:00.000Z"
}
```

**Error (4xx, 5xx):**
```json
{
  "success": false,
  "data": null,
  "message": "Error description",
  "timestamp": "2026-09-25T20:00:00.000Z"
}
```

### Authentication

Semua request (kecuali `/api/auth/login`) harus include:

```
Authorization: Bearer <token>
```

Token disimpan di `sessionStorage` setelah login.

### CORS

Backend accept requests dari:
- `http://localhost:3000` (development)
- Value dari `CORS_ORIGINS` di `.env` (production)

---

## State Management

### Frontend State Layers

1. **SessionStorage (AuthState)**
   - Current user data
   - Session token
   - Persists across page refresh
   - Cleared on logout

2. **IndexedDB (hdosDB)**
   - Inspection, Hazard, PICA, Incident records
   - Persists offline
   - Synced to backend when online

3. **Memory (HDOSCentralStore)**
   - Real-time UI state
   - Window positions & focus
   - Temporary UI state
   - Reset on page reload

4. **LocalStorage (Sync Queue)**
   - Offline operations queue
   - Persists across sessions
   - Replayed when online

### Store Pattern

```typescript
// Read
const { inspections, hazards } = useHDOSStore();

// Write (via actions, not direct)
await createInspectionAction(data);

// Subscribe to changes
const unsubscribe = hdosStore.subscribe(() => {
  console.log('Store changed');
});
```

---

## Security Considerations

### Frontend
- ✅ Token stored in sessionStorage (cleared on browser close)
- ✅ RBAC check before rendering sensitive components
- ✅ XSS protection via React
- ⚠️ CSRF - ensure CORS + SameSite cookies configured

### Backend
- ✅ PBKDF2 password hashing (210k iterations)
- ✅ Timing-safe comparison for password verify
- ✅ Session token validation on every request
- ✅ RBAC middleware checks permission
- ✅ Audit logs for compliance
- ⚠️ Rate limiting not yet implemented
- ⚠️ Input validation incomplete

### Database
- ✅ SQL injection prevention (parameterized queries)
- ✅ Foreign key constraints
- ✅ Timestamps for audit
- ⚠️ Backup strategy needs documentation

---

## Performance Optimization

### Current
- IndexedDB caching (offline support)
- localStorage for sync queue
- In-memory store (no server request for UI)

### TODO
- Implement API response caching (SWR pattern)
- Lazy load modules
- Pagination for large lists
- Image compression & lazy load
- Service worker for offline
- Backend query optimization (indexes)

---

## Testing Strategy

### Unit Tests (TODO)
```bash
bun test
```

### API Integration Tests (TODO)
- Test auth flow
- Test RBAC deny
- Test offline queue
- Test conflict resolution

### E2E Tests (TODO)
- Login → Create Inspection → Verify in DB
- Offline create → Online sync → Verify
- Permission deny on module

---

## Deployment

### Development
```bash
bun run dev           # Frontend on 3000
bun run server:dev    # Backend on 4000
```

### Production Build
```bash
bun run build         # Build frontend
NODE_ENV=production bun run server:start  # Start backend
```

### Environment

**Development (.env)**
```
NODE_ENV=development
DATABASE_URL=postgresql://user:pass@localhost/hdos
CORS_ORIGINS=http://localhost:3000
```

**Production (.env.production)**
```
NODE_ENV=production
DATABASE_URL=postgresql://user:strong-pass@prod-db:5432/hdos
CORS_ORIGINS=https://hdos.ptcgg.com
SESSION_TTL_HOURS=8
```

---

**Last Updated:** 2026-09-25
