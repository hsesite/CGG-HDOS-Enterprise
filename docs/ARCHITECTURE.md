# CGG HDOS — Arsitektur Runtime Aktual

## Jalur runtime utama

```text
Browser
  ├─ React + TypeScript + Vite (GitHub Pages)
  ├─ IndexedDB: data lokal, metadata repository, antrean sinkronisasi
  └─ hseApi: POST JSON envelope ke satu URL GAS
                         │
                         ▼
              Google Apps Script Web App
                         │
                         ▼
               Google Spreadsheet
```

Frontend di GitHub Pages bersifat statis. Ia tidak menjalankan Express atau PostgreSQL di server GitHub Pages. Direktori `server/`, dependensi Express/PostgreSQL, dan migrasi database masih ada sebagai artefak proyek, tetapi bukan bagian dari jalur runtime Pages + GAS yang dipakai oleh frontend.

## Frontend

- `src/App.tsx`: lifecycle inisialisasi, session gate, dan workspace aplikasi.
- `src/core/store.ts`: state pusat dan persistence untuk entitas lokal.
- `src/core/db.ts`: IndexedDB dengan fallback localStorage untuk data yang dapat diserialisasi. Blob dokumen harus disimpan di IndexedDB; fallback JSON tidak mempertahankan binary.
- `src/core/api.ts`: transport GAS, token sesi, dan kontrak API client.
- `src/core/sync.ts`: antrean lokal, retry, dan status konflik.
- `src/core/auth-utils.ts` / `auth-state.ts`: alur login dan cache sesi frontend.
- `src/components/modules/RepositoryModule.tsx`: kontrol dokumen dan file asli lokal.
- `src/components/mobile/IOSMobileSimulator.tsx`: simulasi UI perangkat untuk preview, bukan bukti bahwa UI sudah lolos uji di ponsel fisik.

## Kontrak transport GAS

Client mengirim POST ke `VITE_GAS_URL` dengan body JSON:

```json
{
  "method": "GET | POST | PATCH",
  "path": "/api/...",
  "token": "session-token-or-null",
  "payload": {}
}
```

Browser memakai `text/plain;charset=utf-8` agar request menjadi simple request dan mengurangi preflight CORS. Script GAS harus mengembalikan envelope yang sesuai dengan client:

```json
{
  "success": true,
  "data": {},
  "message": "OK",
  "timestamp": "ISO-8601"
}
```

Envelope ini adalah kontrak yang diharapkan frontend, bukan jaminan bahwa deployment GAS saat ini sudah mengimplementasikan semua route. Route dan struktur sheet wajib dibandingkan dengan script GAS yang benar-benar dideploy.

## Entity sync yang saat ini dipetakan

Sync engine memetakan entity berikut ke endpoint:

- `inspection` → `/api/inspections`
- `hazard` → `/api/hazards`
- `pica` → `/api/picas`
- `incident` → `/api/incidents`

Entity lain yang diketik pada antrean belum otomatis berarti sudah didukung cloud. Operasi DELETE juga ditahan sebagai konflik sampai kontrak API menyediakan dukungan yang benar. Jangan menghapus item konflik tanpa memahami payload dan memastikan data telah ditangani.

## Repository dokumen

- Metadata disimpan pada store IndexedDB `repository`.
- File asli disimpan pada store `photos` dengan key `document-file-<id>`.
- File lokal tidak otomatis menjadi file Google Drive.
- Browser storage dapat dibersihkan pengguna/browser; dokumen penting perlu strategi cloud storage dan backup teruji sebelum produksi.
- Proses unggah harus gagal dengan jelas jika file binary tidak dapat disimpan, dan metadata yang tidak memiliki file harus dihindari.

## Deployment

Workflow `.github/workflows/deploy-pages.yml` melakukan install dependency, typecheck frontend, build Vite, upload artifact, dan deploy ke GitHub Pages. Hasil build saja tidak menguji login, izin GAS, CRUD Spreadsheet, sinkronisasi offline, atau alur dokumen.

## Batasan dan prasyarat produksi

1. Pastikan `VITE_GAS_URL` tersedia pada environment build dan URL menunjuk deployment GAS yang aktif.
2. Verifikasi login/logout, expiry token, dan authorization server-side. Pemeriksaan role di frontend bukan kontrol keamanan yang cukup.
3. Uji CRUD tiap entity/action terhadap script GAS dan Spreadsheet.
4. Uji offline → online, retry, conflict, duplicate submission, dan pemulihan setelah reload.
5. Uji repository file di browser fisik, batas ukuran, storage quota, dan recovery.
6. Uji responsive pada ponsel fisik serta validasi GPS hanya menggunakan browser Geolocation API dengan izin eksplisit.
7. Siapkan backup, audit trail, pemantauan error, dan prosedur pemulihan.
8. Jangan menyatakan siap produksi sebelum semua alur penting diuji oleh pemilik proses.

