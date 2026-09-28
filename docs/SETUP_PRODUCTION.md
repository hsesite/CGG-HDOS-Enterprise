# CGG HDOS Enterprise v3.0 - Production Setup & Testing Guide

## Status Aplikasi

**Build:** `build-29-production-foundation`  
**Stage:** Production Foundation dengan Backend Integration  
**Database:** PostgreSQL 16+  
**Frontend:** React 19 + Vite + TypeScript  
**Backend:** Express.js + Node.js  
**State Management:** Centralized Store + API Sync Queue  

---

## Prerequisites

Instal sebelum memulai:

- **Git** (v2.40+)
- **Bun** (v1.0+) - JavaScript runtime & package manager
- **Docker Desktop** (untuk PostgreSQL)
- **Node.js** (v20+) - opsional jika tidak memakai Bun
- **VS Code** dengan extension:
  - TypeScript Vue Plugin
  - Prettier Code Formatter
  - ES Lint

Verifikasi instalasi:

```bash
git --version
bun --version
docker --version
```

---

## 1. Clone Repository & Checkout Branch

```bash
git clone https://github.com/hsesite/CGG-HDOS-Enterprise.git
cd CGG-HDOS-Enterprise
git checkout build-29-production-foundation
```

Pastikan branch aktif:

```bash
git branch -vv
```

Seharusnya menunjukkan:

```text
* build-29-production-foundation ...
```

---

## 2. Setup PostgreSQL dengan Docker

### Jalankan Container PostgreSQL

**Linux/macOS:**

```bash
docker run --name hdos-postgres \
  -e POSTGRES_USER=hdos \
  -e POSTGRES_PASSWORD=hdos-dev-password \
  -e POSTGRES_DB=hdos \
  -p 5432:5432 \
  -d postgres:16
```

**Windows PowerShell:**

```powershell
docker run --name hdos-postgres `
  -e POSTGRES_USER=hdos `
  -e POSTGRES_PASSWORD=hdos-dev-password `
  -e POSTGRES_DB=hdos `
  -p 5432:5432 `
  -d postgres:16
```

### Verifikasi Container Berjalan

```bash
docker ps
```

Seharusnya menampilkan `hdos-postgres` dengan status `Up`.

Jika container sudah ada tapi tidak jalan:

```bash
docker start hdos-postgres
```

### Connection String

```text
postgresql://hdos:hdos-dev-password@localhost:5432/hdos
```

---

## 3. Install Dependencies

Di folder root repository:

```bash
bun install
```

Ini akan install semua dependency dari `package.json` dan memperbarui `bun.lock`.

Jika ada error, coba:

```bash
bun install --force
```

### Verifikasi TypeScript Server

```bash
bun run typecheck:server
```

Seharusnya tidak ada error.

---

## 4. Setup Environment Variables

### Copy `.env.example` ke `.env`

**Linux/macOS:**

```bash
cp .env.example .env
```

**Windows PowerShell:**

```powershell
Copy-Item .env.example .env
```

### Edit `.env` dengan nilai development:

```dotenv
# Frontend
VITE_API_URL=http://localhost:4000
APP_URL=http://localhost:3000
GEMINI_API_KEY=

# Backend
API_PORT=4000
NODE_ENV=development
CORS_ORIGINS=http://localhost:3000

# Database
DATABASE_URL=postgresql://hdos:hdos-dev-password@localhost:5432/hdos
SESSION_TTL_HOURS=12

# Seed Admin
SEED_ADMIN_EMAIL=admin@ptcgg.com
SEED_ADMIN_PASSWORD=GantiDenganPasswordKuat123!
SEED_ADMIN_NAME=HDOS System Administrator
```

**PENTING:** Jangan commit `.env` ke Git.

---

## 5. Jalankan Database Migration

### Terapkan Schema

```bash
bun run db:migrate
```

Output yang diharapkan:

```text
[HDOS migration] applying database/schema.sql
[HDOS migration] applying database/002_sessions.sql
[HDOS migration] applying database/003_hse_domain.sql
[HDOS migration] applying database/004_seed_reference.sql
[HDOS migration] complete
```

Jika muncul error koneksi:

```bash
docker ps
```

Pastikan container `hdos-postgres` status `Up`.

### Cek Database

```bash
docker exec -it hdos-postgres psql -U hdos -d hdos
```

Di dalam PostgreSQL CLI:

```sql
\dt
```

Seharusnya menampilkan tabel-tabel yang baru dibuat.

Keluar:

```sql
\q
```

---

## 6. Seed Admin User

```bash
bun run db:seed
```

Output:

```text
[HDOS seed] creating admin user: admin@ptcgg.com
[HDOS seed] complete
```

Admin credentials:

```text
Email: admin@ptcgg.com
Password: GantiDenganPasswordKuat123!
Role: KTT
```

---

## 7. Jalankan Backend (Terminal 1)

```bash
bun run server:dev
```

Output yang diharapkan:

```text
[CGG HDOS Enterprise] Booting Master Blueprint v3.0 Core Layer...
[HDOS API] listening on http://localhost:4000
```

### Test Backend Health

Buka terminal baru dan test:

```bash
curl http://localhost:4000/api/health/live
```

Seharusnya return:

```json
{
  "success": true,
  "data": { "status": "live" },
  "message": "",
  "timestamp": "2026-09-25T20:45:30.123Z"
}
```

Test database connection:

```bash
curl http://localhost:4000/api/health/ready
```

Seharusnya:

```json
{
  "success": true,
  "data": {
    "status": "ready",
    "databaseConfigured": true
  },
  "message": "",
  "timestamp": "2026-09-25T20:45:35.456Z"
}
```

**Backend tetap jalan di terminal ini.**

---

## 8. Uji Login API (Terminal 2)

### Login Request

**Linux/macOS:**

```bash
curl -X POST http://localhost:4000/api/auth/login \
  -H "Content-Type: application/json" \
  -d '{"email":"admin@ptcgg.com","password":"GantiDenganPasswordKuat123!"}'
```

**Windows PowerShell:**

```powershell
$body = @{
  email = "admin@ptcgg.com"
  password = "GantiDenganPasswordKuat123!"
} | ConvertTo-Json

Invoke-RestMethod -Method Post `
  -Uri http://localhost:4000/api/auth/login `
  -ContentType "application/json" `
  -Body $body
```

### Response yang Diharapkan

```json
{
  "success": true,
  "data": {
    "token": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...",
    "user": {
      "id": "uuid-admin",
      "email": "admin@ptcgg.com",
      "displayName": "HDOS System Administrator",
      "roles": ["KTT"]
    }
  },
  "message": "Login successful",
  "timestamp": "2026-09-25T20:46:00.789Z"
}
```

**Simpan token untuk test berikutnya.**

---

## 9. Jalankan Frontend (Terminal 3)

```bash
bun run dev
```

Output:

```text
  VITE v8.3.0 ready in 123 ms

  ➜  Local:   http://localhost:3000/
  ➜  press h to show help
```

Buka browser ke `http://localhost:3000`.

---

## 10. Test Login UI

1. Buka `http://localhost:3000` di browser
2. Anda akan melihat login screen "CGG HDOS Enterprise Access"
3. Masukkan:
   - Email: `admin@ptcgg.com`
   - Password: `GantiDenganPasswordKuat123!`
4. Klik "Masuk ke HDOS"
5. Jika login berhasil, dashboard akan terbuka
6. Top menu bar akan menampilkan nama user dan tombol logout

### Troubleshooting Login

Jika login gagal:

- Pastikan backend berjalan (lihat Terminal 1)
- Pastikan database sehat: `bun run db:migrate` & `bun run db:seed` ulang
- Buka DevTools (F12) → Console untuk melihat error
- Periksa Network tab untuk response API

---

## 11. Test Create Inspection via API

Gunakan token dari login step 8:

**Linux/macOS:**

```bash
TOKEN="token-dari-login-response"

curl -X POST http://localhost:4000/api/inspections \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer $TOKEN" \
  -d '{
    "title": "Inspeksi Workshop Test",
    "templateType": "WORKSHOP",
    "location": "Workshop",
    "inspectorName": "Ahmad Fauzi",
    "inspectorRole": "SPV HSE",
    "date": "2026-09-25",
    "smkpElement": "Elemen II: Perencanaan",
    "scorePercent": 95,
    "items": [
      {
        "question": "Apakah area sudah dibersihkan dari limbah?",
        "standardRef": "CGG-HSE-SOP-001",
        "result": "PASS"
      }
    ],
    "gpsCoordinates": { "lat": -2.9395, "lng": 121.9618, "utm": "51S 385100 mE 9674800 mN" }
  }'
```

**Windows PowerShell:**

```powershell
$TOKEN = "token-dari-login-response"

$body = @{
  title = "Inspeksi Workshop Test"
  templateType = "WORKSHOP"
  location = "Workshop"
  inspectorName = "Ahmad Fauzi"
  inspectorRole = "SPV HSE"
  date = "2026-09-25"
  smkpElement = "Elemen II: Perencanaan"
  scorePercent = 95
  items = @(
    @{
      question = "Apakah area sudah dibersihkan dari limbah?"
      standardRef = "CGG-HSE-SOP-001"
      result = "PASS"
    }
  )
  gpsCoordinates = @{
    lat = -2.9395
    lng = 121.9618
    utm = "51S 385100 mE 9674800 mN"
  }
} | ConvertTo-Json

Invoke-RestMethod -Method Post `
  -Uri http://localhost:4000/api/inspections `
  -ContentType "application/json" `
  -Headers @{ "Authorization" = "Bearer $TOKEN" } `
  -Body $body
```

### Response yang Diharapkan

```json
{
  "success": true,
  "data": {
    "id": "ins_1726...",
    "code": "INS-2026-001",
    "title": "Inspeksi Workshop Test",
    "status": "COMPLETED",
    "scorePercent": 95,
    "createdAt": "2026-09-25 20:50:15"
  },
  "message": "",
  "timestamp": "2026-09-25T20:50:15.234Z"
}
```

---

## 12. Test Create Hazard via API

```bash
TOKEN="token-dari-login"

curl -X POST http://localhost:4000/api/hazards \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer $TOKEN" \
  -d '{
    "title": "Peralatan tidak tersertifikasi di pit",
    "category": "Unsafe Condition",
    "location": "Pit Jaja KM10",
    "specificLocation": "Area loader timur",
    "riskMatrix": {
      "severity": 4,
      "likelihood": 3,
      "score": 12,
      "level": "HIGH"
    },
    "reporter": "Ahmad Fauzi",
    "reporterRole": "SPV HSE",
    "status": "OPEN",
    "actionTaken": "Segera pengecekan sertifikat alat"
  }'
```

Response:

```json
{
  "success": true,
  "data": {
    "id": "haz_1726...",
    "code": "HAZ-2026-001",
    "title": "Peralatan tidak tersertifikasi di pit",
    "status": "PICA_ISSUED",
    "riskMatrix": { "level": "HIGH" },
    "createdAt": "2026-09-25 20:51:00"
  },
  "message": "",
  "timestamp": "2026-09-25T20:51:00.567Z"
}
```

Hazard dengan level HIGH atau CRITICAL otomatis membuat PICA.

---

## 13. Test RBAC - Permission Denied

### Buat User dengan Role Terbatas

Dalam PostgreSQL:

```bash
docker exec -it hdos-postgres psql -U hdos -d hdos
```

```sql
-- Insert role Employee
INSERT INTO roles (id, name) VALUES (gen_random_uuid(), 'Employee')
ON CONFLICT DO NOTHING;

-- Insert user test
INSERT INTO users (id, email, display_name, password_hash, status)
VALUES (
  gen_random_uuid(),
  'employee@ptcgg.com',
  'Joko Purnomo',
  'pbkdf2$210000$salt$hash',
  'ACTIVE'
);
```

Untuk generate hash password, gunakan tool online atau:

```bash
node -e "console.log(require('crypto').pbkdf2Sync('password123', 'salt', 210000, 32, 'sha256').toString('hex'))"
```

### Test Login sebagai Employee

Employee seharusnya bisa create hazard tapi TIDAK bisa create inspection.

```bash
TOKEN_EMPLOYEE="token-dari-login-employee"

# Ini seharusnya berhasil
curl -X POST http://localhost:4000/api/hazards \
  -H "Authorization: Bearer $TOKEN_EMPLOYEE" \
  -H "Content-Type: application/json" \
  -d '{...}'

# Ini seharusnya return 403
curl -X POST http://localhost:4000/api/inspections \
  -H "Authorization: Bearer $TOKEN_EMPLOYEE" \
  -H "Content-Type: application/json" \
  -d '{...}'
```

Response 403:

```json
{
  "success": false,
  "data": null,
  "message": "Permission denied",
  "timestamp": "2026-09-25T20:55:00.123Z"
}
```

---

## 14. Test Offline Sync

### Scenario: Create Data Offline

1. Buka DevTools (F12) → Network tab
2. Aktifkan **Offline** mode
3. Buka Inspection module di dashboard
4. Buat inspection baru
5. Data akan tersimpan di IndexedDB lokal
6. Buka tab **Application** → **IndexedDB** → **CGG_HDOS_DB**
7. Periksa data ada di tabel inspection
8. Buka tab **Sync** di dashboard untuk melihat queue

### Scenario: Reconnect & Sync

1. Kembalikan Network ke **Online**
2. Aplikasi otomatis akan sync queue ke backend
3. Periksa di tab **Sync** apakah status berubah ke "synced"
4. Data seharusnya sekarang ada di PostgreSQL

### Verifikasi di Database

```bash
docker exec -it hdos-postgres psql -U hdos -d hdos
```

```sql
SELECT id, code, title, status FROM inspections ORDER BY created_at DESC LIMIT 1;
SELECT id, code, title, status FROM hazards ORDER BY created_at DESC LIMIT 1;
```

---

## 15. Test Permission di UI

Jika login sebagai user dengan role terbatas, module yang tidak diizinkan akan:

- Dock icon tidak aktif (disabled)
- Jika dipaksa buka, form akan show "Permission Denied"
- Submit button akan disabled

---

## Common Issues & Troubleshooting

### Backend tidak mau connect ke database

```bash
# Restart PostgreSQL container
docker restart hdos-postgres

# Atau buat baru
docker rm -f hdos-postgres
# Jalankan lagi dari step 2
```

### "Address already in use" port 4000 atau 3000

```bash
# macOS/Linux - cari proses
lsof -i :4000
lsof -i :3000

# Kill proses
kill -9 <PID>

# Windows PowerShell
Get-Process | Where-Object { $_.Port -eq 4000 }
Stop-Process -Id <PID> -Force
```

### Login gagal tapi API health OK

- Periksa database seed berhasil: `bun run db:seed`
- Restart backend: Ctrl+C di Terminal 1, jalankan `bun run server:dev` lagi
- Periksa password benar di `.env`
- Lihat server logs untuk error detail

### Module tidak muncul atau error "Permission denied"

- Logout & login ulang
- Clear localStorage: DevTools → Application → Local Storage → Delete
- Clear session storage juga
- Reload page (Ctrl+R atau Cmd+R)

### Sync queue stuck atau tidak sync

- Periksa Network tab apakah request terkirim
- Buka Console untuk melihat error message
- Jika offline mode aktif, kembalikan ke online
- Cek API response status code (bukan 2xx = error)

---

## Production Deployment Checklist

Sebelum go live:

- [ ] PostgreSQL managed (RDS, Cloud SQL, atau self-hosted dengan backup)
- [ ] Backend dijalankan di production environment (Cloud Run, EC2, Heroku)
- [ ] Frontend di-build dan serve static (Vercel, Netlify, S3 + CloudFront)
- [ ] Environment variables ter-set dengan value production
- [ ] Database password strong (minimal 16 karakter random)
- [ ] HTTPS enabled (SSL certificate dari Let's Encrypt atau DigiCert)
- [ ] CORS configured ke domain production saja
- [ ] Backup database otomatis setiap hari
- [ ] Monitoring & alerting setup (Sentry, DataDog, CloudWatch)
- [ ] Load balancing & auto-scaling configured
- [ ] Rate limiting & DDoS protection
- [ ] UAT testing selesai & signed off
- [ ] Rollback plan tersedia
- [ ] Team sudah trained

---

## Stopkan Aplikasi

Untuk development:

**Terminal 1 (Backend):**
```bash
Ctrl+C
```

**Terminal 2:**
```bash
Ctrl+C
```

**Terminal 3 (Frontend):**
```bash
Ctrl+C
```

**Stop PostgreSQL (opsional):**
```bash
docker stop hdos-postgres
```

**Hapus container PostgreSQL (full reset):**
```bash
docker rm -f hdos-postgres
```

---

## Next Steps

1. ✅ Setup lokal selesai
2. ✅ Database & API berjalan
3. ✅ Login & basic CRUD tested
4. Next: Integrasi modul Inspection & Hazard ke API production
5. Next: Implementasi approval workflow PICA
6. Next: Upload foto & document management
7. Next: Export & reporting
8. Next: Mobile responsive testing
9. Next: Performance optimization & caching
10. Next: Deployment ke staging server

---

## Support

Jika ada issue:

1. Baca **Troubleshooting** section di atas
2. Periksa **GitHub Issues** di repo
3. Lihat console error di DevTools (F12)
4. Check server logs di Terminal 1 & 3
5. Query database langsung untuk verify data

---

**Last Updated:** 2026-09-25
