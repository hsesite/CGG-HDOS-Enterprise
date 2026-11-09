# HDOS Production Acceptance Test (UAT)

Dokumen ini adalah lembar uji operasional. Status implementasi kode, hasil CI, dan hasil UAT lapangan harus dicatat terpisah. Jangan menandai PASS tanpa bukti dari deployment GAS dan spreadsheet uji yang benar-benar digunakan.

## Informasi pelaksanaan

| Item | Isian |
|---|---|
| Environment | TEST / PRODUCTION |
| URL frontend | |
| URL Web App GAS dan versi deployment | |
| Spreadsheet uji (nama, bukan ID rahasia) | |
| Tanggal dan waktu pengujian | |
| Penguji / perusahaan | |
| Browser dan perangkat | |
| Build / commit frontend | |
| Versi Code.gs | |

## 1. Autentikasi, sesi, dan otorisasi

| ID | Skenario | Hasil yang diharapkan | Status (PASS/FAIL/BLOCKED) | Bukti / catatan |
|---|---|---|---|---|
| AUTH-01 | Login email/password valid | Token diterbitkan dan profil berasal dari server | | |
| AUTH-02 | Login password salah | Ditolak tanpa membocorkan apakah email terdaftar | | |
| AUTH-03 | Refresh tab aktif | Sesi tab tetap valid selama token server masih berlaku | | |
| AUTH-04 | Tutup tab lalu buka tab baru | Tidak ada token sesi lama; pengguna harus login kembali | | |
| AUTH-05 | Token kedaluwarsa / dicabut | API terlindungi menolak dengan 401; login ulang diperlukan | | |
| AUTH-06 | Logout | Token dicabut di server dan cache profil sesi dibersihkan | | |
| AUTH-07 | Ubah role di master pengguna saat sesi aktif | Hak akses berikutnya mengikuti role server terbaru | | |
| AUTH-08 | Role pengawas belum terverifikasi | Tidak memperoleh hak istimewa pengawas/approval | | |
| AUTH-09 | Akun perusahaan nonaktif | Login/akses ditolak sesuai kebijakan backend | | |
| AUTH-10 | Akses endpoint tanpa token | Ditolak 401; tidak ada data terlindungi yang bocor | | |

## 2. CRUD database pusat dan integritas data

| ID | Skenario | Hasil yang diharapkan | Status | Bukti / catatan |
|---|---|---|---|---|
| DB-01 | Create Inspection, Hazard, PICA, Incident | Data tersimpan ke Spreadsheet pusat dan mendapat ID stabil | | |
| DB-02 | Read daftar dan detail | Data yang dibaca sama dengan data yang tersimpan | | |
| DB-03 | Update record | Perubahan tersimpan; updatedAt/versi server diperbarui | | |
| DB-04 | Delete record | Record hilang dari daftar sesuai cakupan tenant; retry delete idempoten | | |
| DB-05 | Kirim CREATE yang sama dua kali (ID sama) | Tidak membuat duplikasi | | |
| DB-06 | Payload tidak valid / field wajib kosong | Ditolak 400 dengan pesan yang aman dan jelas | | |
| DB-07 | Akun tenant A mencoba membaca/mengubah tenant B | Ditolak atau tidak terlihat; tidak ada kebocoran lintas tenant | | |
| DB-08 | Spreadsheet/required sheet tidak tersedia | Readiness menyatakan not-ready; aplikasi tidak mengklaim cloud siap | | |
| DB-09 | Dua pengguna mengubah data berdekatan | Konflik/versi ditangani tanpa menimpa perubahan secara diam-diam | | |
| DB-10 | Audit trail untuk create/update/delete/approval | Pelaku, aksi, objek, dan waktu tercatat | | |

## 3. Offline-first dan sinkronisasi

| ID | Skenario | Hasil yang diharapkan | Status | Bukti / catatan |
|---|---|---|---|---|
| SYNC-01 | Putus jaringan lalu buat record | Data dan antrean tersimpan bersama di IndexedDB | | |
| SYNC-02 | Reload saat masih offline | Data lokal dan antrean tetap tersedia untuk pemilik akun | | |
| SYNC-03 | Pulihkan jaringan | Antrean dikirim otomatis dengan retry/backoff | | |
| SYNC-04 | Respons server hilang setelah CREATE tersimpan | Retry tidak menggandakan record | | |
| SYNC-05 | Server 400/403/404 | Item tidak di-retry tanpa batas; tampil sebagai masalah yang perlu tindakan | | |
| SYNC-06 | Server 429/5xx atau jaringan gagal | Retry tertunda sesuai backoff | | |
| SYNC-07 | Ganti akun saat antrean masih ada | Antrean akun sebelumnya tidak dipublikasikan/dikirim oleh sesi akun baru | | |
| SYNC-08 | Ambil Data Pusat | Snapshot cloud dimuat tanpa menimpa perubahan lokal yang masih pending | | |
| SYNC-09 | Update record yang sama beberapa kali offline | Urutan perubahan dipertahankan dan konflik versi ditangani | | |
| SYNC-10 | Browser storage penuh / IndexedDB gagal | Kesalahan terlihat; aplikasi tidak menyatakan data berhasil tersimpan | | |

## 4. Repository, Drive, dan isolasi tenant

| ID | Skenario | Hasil yang diharapkan | Status | Bukti / catatan |
|---|---|---|---|---|
| REP-01 | Upload PDF valid | File dan metadata tersimpan pada folder Drive yang ditetapkan | | |
| REP-02 | Upload DOCX/XLSX valid | Format dan signature file diverifikasi | | |
| REP-03 | Upload ekstensi tidak didukung / signature palsu | Ditolak backend | | |
| REP-04 | File melebihi batas ukuran | Ditolak sebelum proses penyimpanan | | |
| REP-05 | Preview dan download oleh pemilik yang berhak | File dapat diakses sesuai izin | | |
| REP-06 | Tenant A mengakses file tenant B | Ditolak; ID Drive internal tidak terekspos | | |
| REP-07 | Pengguna tanpa izin mencoba delete | Ditolak dan file asli tetap ada | | |
| REP-08 | Upload gagal di tengah proses | Metadata/file tidak meninggalkan data parsial yang tidak terlacak | | |
| REP-09 | File dihapus melalui aplikasi | Metadata dan file Drive konsisten dengan kebijakan retensi | | |
| REP-10 | Coba upload/preview/download/delete pada GAS deployment uji | Seluruh siklus berhasil dengan bukti audit | | |

## 5. Backup, recovery, dan kesiapan database

| ID | Skenario | Hasil yang diharapkan | Status | Bukti / catatan |
|---|---|---|---|---|
| BAK-01 | Jalankan backup manual | Salinan Spreadsheet tercipta di folder backup | | |
| BAK-02 | Verifikasi backup | MIME Google Sheets, nama, waktu, dan log backup benar | | |
| BAK-03 | Pasang trigger harian | Trigger aktif pada timezone proyek Apps Script | | |
| BAK-04 | Recovery dari backup valid | Salinan recovery terpisah tercipta dan schema tervalidasi | | |
| BAK-05 | Recovery dari file bukan backup HDOS | Ditolak tanpa mengubah database aktif | | |
| BAK-06 | Recovery dari file di luar folder backup | Ditolak | | |
| BAK-07 | Recovery dengan sheet/header tidak lengkap | Salinan gagal dibersihkan bila izin memungkinkan; database aktif tetap tidak berubah | | |
| BAK-08 | Verifikasi cutover | Hanya dilakukan setelah pemeriksaan isi data dan persetujuan administrator | | |
| BAK-09 | Kebijakan retensi backup | Retensi, akses folder, dan penghapusan backup lama disetujui dan diuji | | |

## 6. UAT modul, distribusi, dan persetujuan produksi

| ID | Skenario | Hasil yang diharapkan | Status | Bukti / catatan |
|---|---|---|---|---|
| UAT-01 | Inspection oleh role yang berwenang | Form, checklist, lampiran, dan laporan sesuai SOP | | |
| UAT-02 | Hazard report dan risk rating | Kategori, likelihood, severity, risk score, status, dan bukti konsisten | | |
| UAT-03 | PICA assignment dan approval | PIC, target, aging, bukti, dan approval sesuai matriks kewenangan | | |
| UAT-04 | Incident investigation | Kronologi, 5-Why, tindakan, review, dan penutupan tercatat | | |
| UAT-05 | Contractor Passport dan fleet/P2H | Tenant hanya mengelola data perusahaan sendiri; KPI berasal dari laporan terverifikasi | | |
| UAT-06 | Dashboard dan laporan | Angka sesuai register sumber, periode, dan freshness data | | |
| UAT-07 | User acceptance lintas role | Crew, Foreman, Foreman Safety, SPV HSE, KTT, Admin CGG, Contractor, dan Subkon diuji sesuai kewenangan | | |
| UAT-08 | Distribusi frontend | URL, build, akses, dan panduan pengguna disetujui | | |
| UAT-09 | Deployment backend GAS | Versi Web App, akses, Script Properties, OAuth, dan Spreadsheet produksi diverifikasi | | |
| UAT-10 | Go-live approval | Temuan kritis ditutup; pemilik proses, HSE, IT/admin, dan KTT menyetujui | | |

## Kriteria keputusan

- PASS hanya jika skenario dijalankan pada environment yang dicatat dan bukti dilampirkan.
- FAIL jika hasil aktual tidak sesuai hasil yang diharapkan.
- BLOCKED jika belum dapat diuji karena konfigurasi, akses, data, atau dependensi belum tersedia.
- Seluruh skenario AUTH, DB, SYNC, REP, dan BAK yang berdampak pada keamanan/integritas data harus PASS sebelum go-live.
- UAT modul harus ditandatangani pemilik proses. Deployment GitHub Pages yang sukses tidak membuktikan deployment GAS, Google Drive, atau Spreadsheet produksi telah tervalidasi.
- Jangan menggunakan data personal/medis nyata pada environment pengujian; gunakan data uji yang disetujui.

## Persetujuan

| Peran | Nama | Tanggal | Keputusan / tanda tangan |
|---|---|---|---|
| Penguji HSE | | | |
| Admin / IT | | | |
| Foreman Safety / SPV HSE | | | |
| KTT / Penanggung jawab operasional | | | |
