# CGG HDOS Enterprise

**Health & Safety Digital Operations System** — aplikasi digital untuk mendukung pencatatan dan pemantauan kegiatan HSE pertambangan.

## Arsitektur runtime yang digunakan

- **Frontend:** React, TypeScript, dan Vite.
- **Hosting frontend:** GitHub Pages melalui workflow GitHub Actions.
- **Penyimpanan lokal:** IndexedDB untuk data/cache lokal dan antrean offline.
- **Integrasi cloud:** Google Apps Script (GAS) melalui satu URL endpoint yang dikonfigurasi sebagai `VITE_GAS_URL`.
- **Spreadsheet:** sumber data cloud yang diakses melalui implementasi GAS yang sesuai.

> Folder `server/`, dependensi Express/PostgreSQL, dan skrip migrasi yang masih ada di repositori bukan bukti bahwa layanan tersebut dipakai oleh runtime GitHub Pages. Jangan menganggap fitur cloud aktif sebelum URL GAS, deployment GAS, izin, dan struktur spreadsheet sudah dikonfigurasi serta diuji.

## Menjalankan frontend secara lokal

Persyaratan: Node.js yang kompatibel dengan versi Vite pada `package.json`, npm, dan Git.

```bash
git clone https://github.com/hsesite/CGG-HDOS-Enterprise.git
cd CGG-HDOS-Enterprise
git checkout main
npm install
npm run dev
```

Vite menampilkan alamat lokal di terminal. Untuk memeriksa build produksi frontend:

```bash
npm run build
```

Untuk menjalankan pemeriksaan TypeScript yang disediakan:

```bash
npm run lint
```

Perintah `lint` saat ini menjalankan pemeriksaan TypeScript frontend dan konfigurasi TypeScript server. Jika salah satu gagal, catat error aktual sebelum menyatakan build siap.

## Master data dan autentikasi

- Data operasional lokal dimulai kosong; migrasi sekali jalan membersihkan data demo lama dari IndexedDB dan localStorage fallback browser.
- Area kerja dan kontraktor ditambahkan melalui modul **Pengaturan** dan langsung dibaca modul terkait di browser yang sama.
- Form inspeksi bawaan yang berisi contoh data dinonaktifkan; formulir inspeksi dipilih dari dokumen Repository yang benar-benar diterbitkan.
- Login dan akun saat ini menggunakan endpoint GAS. UI daftar akun, Google Sign-In, sesi persisten, dan kontrol akun memerlukan versi GAS yang sesuai serta konfigurasi OAuth. Ikuti [panduan GAS dan Google OAuth](docs/GAS-AUTH-SETUP.md).
- Pengaturan area/kontraktor saat ini tersimpan di browser (IndexedDB), belum menjadi master data lintas perangkat/cloud sampai endpoint master data GAS disediakan dan diuji.

## Konfigurasi cloud

1. Deploy Google Apps Script sebagai Web App sesuai kode GAS yang benar-benar digunakan.
2. Atur repository secret/variable `VITE_GAS_URL` sesuai workflow dan kebutuhan build.
3. Pastikan endpoint GAS menangani envelope request yang dikirim client: `{ method, path, token, payload }`.
4. Verifikasi otorisasi, izin Spreadsheet, skema sheet, dan operasi CRUD dari aplikasi.
5. Uji dengan data nonproduksi sebelum digunakan dalam kegiatan operasional.

Jika `VITE_GAS_URL` belum dikonfigurasi atau GAS belum menyediakan route yang diperlukan, operasi cloud tidak dapat dianggap aktif. Penyimpanan IndexedDB lokal tidak otomatis berarti data telah tersinkron ke Spreadsheet.

## Status fitur dan batasan yang diketahui

Status di bawah adalah catatan teknis, bukan sertifikasi kesiapan produksi.

- **Inisialisasi aplikasi:** memiliki penanganan error dan opsi mencoba kembali.
- **Penyimpanan lokal:** IndexedDB digunakan untuk data lokal.
- **Sinkronisasi:** antrean dan retry tersedia, tetapi cakupan entity/action yang didukung harus diverifikasi terhadap API GAS yang sedang ter-deploy. Operasi yang belum memiliki endpoint tidak akan tersinkron.
- **Repository dokumen:** metadata dan berkas lokal dapat disimpan di browser. Penyimpanan lokal tidak sama dengan upload ke Google Drive; integrasi Drive perlu diimplementasikan dan diuji terpisah.
- **Mobile:** simulator perangkat di dalam UI bukan pengganti pengujian responsive pada ponsel fisik.
- **Keamanan:** konfigurasi credential, akses role, validasi input, dan izin cloud wajib diuji sebelum produksi.
- **Pengujian:** build yang berhasil hanya membuktikan proses bundling berhasil, bukan semua alur aplikasi berfungsi.

## Kriteria sebelum menyatakan siap produksi

- [ ] Login dan otorisasi diverifikasi dengan akun/role yang benar.
- [ ] CRUD tiap modul diuji melalui GAS dan Spreadsheet.
- [ ] Offline, online kembali, retry, konflik, dan duplikasi sinkronisasi diuji.
- [ ] Upload, buka, unduh, dan hapus dokumen diuji; lokasi penyimpanannya jelas.
- [ ] Uji responsive di desktop dan ponsel fisik.
- [ ] Tidak ada credential default atau rahasia di repository.
- [ ] Build, typecheck, serta pengujian fungsional lulus.
- [ ] Backup, pemulihan, audit log, dan prosedur penanganan kegagalan terdokumentasi.

## Repository dan deployment

- Source: https://github.com/hsesite/CGG-HDOS-Enterprise
- Branch deployment: `main`
- Workflow: `.github/workflows/deploy-pages.yml`

Periksa tab **Actions** untuk hasil terbaru workflow dan **Settings → Pages** untuk konfigurasi hosting. Jangan menyatakan deployment sukses hanya berdasarkan commit atau build lokal.

---

**Catatan:** aplikasi ini merupakan alat bantu pencatatan dan pemantauan HSE. Kesesuaian terhadap SMKP, peraturan pertambangan, dan prosedur perusahaan tetap perlu diverifikasi melalui tinjauan pemilik proses serta pengujian operasional.
