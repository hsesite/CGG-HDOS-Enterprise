# Deployment Backend Google Apps Script (GAS)

Deployment GitHub Pages tidak otomatis menerapkan perubahan pada backend GAS. Ikuti prosedur ini untuk mengaktifkan backend pusat.

## 1. Siapkan Spreadsheet

1. Buat Google Spreadsheet khusus database HDOS.
2. Batasi editor hanya kepada pengelola database.
3. Salin ID Spreadsheet dari URL; jangan commit ID ke repository.

## 2. Siapkan Apps Script

1. Buka https://script.google.com/ dan buat project.
2. Salin isi `gas/Code.gs` dari repository ke file script utama.
3. Buka **Project Settings → Script Properties**.
4. Tambahkan `HDOS_SPREADSHEET_ID` dengan nilai ID Spreadsheet pusat.
5. Simpan.

## 3. Inisialisasi database

1. Pilih fungsi `setup` di editor Apps Script.
2. Jalankan satu kali menggunakan akun pengelola database.
3. Berikan izin Spreadsheet dan Google Drive yang diminta.
4. Pastikan sheet `users`, `companies`, `locations`, `forms`, `inspections`, `hazards`, `picas`, `incidents`, `audit_logs`, `backup_logs`, `contractor_reports`, dan `contractor_fleet` terbentuk.
5. Periksa header setiap sheet.

`setup()` menyiapkan struktur sheet. Fungsi ini tidak membuat akun Admin CGG otomatis. Jangan menganggapnya sebagai migrasi data produksi tanpa backup.

## 4. Aktifkan backup database otomatis

1. Pada **Project Settings**, pastikan timezone project adalah `Asia/Makassar` (WITA) atau timezone operasional yang ditetapkan perusahaan.
2. Jalankan fungsi `createDatabaseBackup()` secara manual satu kali dan berikan izin Google Drive.
3. Pastikan folder **CGG HDOS Database Backups** terbentuk di Google Drive dan sheet `backup_logs` mencatat status `SUCCESS`.
4. Setelah backup pertama berhasil, jalankan `installDailyDatabaseBackupTrigger()` satu kali.
5. Trigger membuat backup harian sekitar pukul 02:00 sesuai timezone project. Setiap backup dicatat pada `backup_logs`.
6. Batasi akses folder backup hanya kepada pengelola database. Lakukan kebijakan retensi dan uji pemulihan secara berkala; backup yang berhasil dibuat belum membuktikan proses restore sudah teruji.


## 4. Siapkan akun dan master perusahaan

1. Bootstrap akun Admin CGG pertama secara manual pada sheet `users), menggunakan format password hash/salt yang sesuai backend. Jangan menyimpan password polos.
2. Masukkan CGG dan perusahaan kontraktor/subkontraktor yang telah disetujui ke sheet `companies`.
3. Pastikan kode, status aktif, dan relasi parent perusahaan benar.
4. Uji login Admin CGG sebelum onboarding akun lain.

## 5. Deploy Web App

1. Pilih **Deploy → New deployment → Web app**.
2. **Execute as:** Me, yaitu akun pengelola yang memiliki akses ke Spreadsheet dan Drive.
3. **Who has access:** Anyone. Frontend GitHub Pages perlu mengakses endpoint GAS; data tetap dilindungi autentikasi token HDOS di backend.
4. Deploy dan salin URL Web App berakhiran `/exec`.
5. Setiap perubahan `gas/Code.gs` harus diterapkan melalui **Deploy → Manage deployments → Edit → New version → Deploy**. Menyimpan kode di editor tidak memperbarui versi Web App aktif.

Jangan menjadikan Spreadsheet publik atau membagikan token pengguna.

## 6. Hubungkan GitHub Pages

Buka repository GitHub → **Settings → Secrets and variables → Actions → Secrets**. Pastikan:

| Secret | Value |
|---|---|
| `VITE_GAS_URL` | URL Web App GAS aktif berakhiran `/exec` |
| `VITE_GOOGLE_CLIENT_ID` | OAuth Client ID aplikasi, jika login Google digunakan |

Setelah secret diperbarui, jalankan ulang workflow **Deploy HDOS to GitHub Pages**.

## 7. Uji sebelum distribusi

Gunakan akun dan data uji yang disetujui untuk memeriksa:
- Login/logout dan token kedaluwarsa.
- Pendaftaran serta verifikasi jabatan.
- Isolasi data CGG, kontraktor, dan subkontraktor.
- Inspeksi dan Hazard dengan lampiran foto.
- PICA: penugasan PIC, bukti foto, pengajuan, pengembalian, validasi HSE.
- Contractor Passport: laporan bulanan, verifikasi HSE, perbaikan laporan, dan ekspor CSV khusus CGG.
- Fleet Contractor/Subkon: nomor unit unik, status P2H, pencatat dan waktu P2H, masa berlaku SIA, serta perubahan status unit.
- Sinkronisasi offline-online, retry, dan pencegahan duplikasi.
- Repository: upload, preview, download, dan delete sesuai kewenangan.
- Audit log dan pemulihan setelah koneksi terputus.

Jangan menguji penghapusan pada data operasional aktif.

## Kriteria backend aktif

Backend baru dinyatakan aktif setelah URL GAS versi terbaru merespons, akun nyata berhasil login, data tersimpan di Spreadsheet pusat, foto tersimpan di Drive, dan uji isolasi tenant berhasil. Status build atau deployment GitHub Pages saja tidak membuktikan backend produksi aktif.
