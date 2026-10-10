# Google Apps Script: pendaftaran, Google Sign-In, dan sesi persisten

Frontend menyediakan login Google dan pendaftaran profil pertama kali. Pendaftaran baru harus langsung membuat akun `ACTIVE` dengan role awal `Employee`, membuat sesi login, lalu mengarahkan pengguna ke HDOS tanpa antrean persetujuan admin. Jabatan yang diketik hanya metadata profil dan tidak otomatis memberi role KTT/SPV/Foreman/PM atau Admin. Endpoint GAS wajib mendukung aturan ini; perubahan frontend saja tidak cukup.

## Backend script

Gunakan file GAS pendamping yang diserahkan bersama pekerjaan ini sebagai dasar deployment GAS. File tersebut tidak otomatis mengubah Web App GAS yang saat ini sudah ter-deploy. Jangan hanya mengubah frontend. Endpoint yang dibutuhkan:

- Pendaftaran mandiri dinonaktifkan. `POST /api/users` hanya dapat dipanggil oleh akun `Admin CGG` untuk membuat akun.
- `POST /api/auth/google` — memverifikasi ID token Google dan membuat sesi untuk akun yang sudah aktif.
- `POST /api/auth/google/onboard` — memverifikasi ID token Google, menyimpan nama lengkap, kode perusahaan, jabatan, departemen, dan bagian, membuat akun `ACTIVE` ber-role awal `Employee`, lalu mengembalikan `{ pending: false }`. Frontend kemudian login melalui `/api/auth/google`.
- `GET /api/users` — daftar akun, hanya `Admin CGG`.
- `POST /api/users` — buat akun `Admin CGG`, `Contractor`, atau `Subkon`, hanya `Admin CGG`.
- `PATCH /api/users/:id` — ubah status/relasi akun, hanya `Admin CGG`.
- `POST /api/auth/logout` — menghapus sesi server.

Versi GAS yang diperbarui menyimpan hash SHA-256 bersalt untuk password akun baru, memigrasikan password lama ke hash setelah login berhasil, dan menggunakan Script Properties untuk sesi yang bertahan melewati restart browser sampai logout atau akun dinonaktifkan. Password lama yang tersimpan dalam sheet tidak otomatis dapat dihapus sebelum pemilik memastikan migrasi dan backup aman.

## Konfigurasi Google Sign-In

1. Buat OAuth Client ID tipe **Web application** pada Google Cloud Console.
2. Tambahkan origin aplikasi yang persis, misalnya `https://hsesite.github.io`, ke Authorized JavaScript origins. Jika aplikasi dipasang pada subpath, tetap gunakan origin saja, tanpa path.
3. Simpan Client ID sebagai GitHub Actions repository secret `VITE_GOOGLE_CLIENT_ID`.
4. Pada Apps Script, buka **Project Settings → Script Properties**, lalu buat `GOOGLE_CLIENT_ID` dengan nilai Client ID yang sama.
5. Deploy ulang Apps Script sebagai Web App dengan akses sesuai kebijakan perusahaan, lalu pastikan URL deployment sama dengan `VITE_GAS_URL`.
6. Buat backup spreadsheet. Jalankan fungsi `setup()` satu kali untuk menambahkan kolom user yang diperlukan. Fungsi ini tidak membuat akun administrator demo.
7. Jika ingin membersihkan data operasional di Spreadsheet, set Script Property `CONFIRM_CLEAN_START` ke `DELETE_HDOS_OPERATIONAL_DATA`, lalu jalankan fungsi `clearOperationalDataForCleanStart()` secara manual. Fungsi ini mempertahankan sheet `users` dan `audit_logs`; jangan jalankan sebelum backup.
8. Setelah selesai, hapus Script Property konfirmasi jika belum otomatis terhapus, lalu verifikasi semua sheet dan akun.
9. Untuk akun bootstrap `admin@ptcgg.com`, pastikan baris pada sheet `users` memiliki role persis `Admin CGG` dan status `ACTIVE`. Jika akun lama masih ber-role `KTT`, buat backup lalu ubah hanya sel role menjadi `Admin CGG`; jangan mengubah password/hash atau `googleSub`. Setelah itu logout dan login kembali agar sesi diperbarui. Jangan membagikan akses edit sheet kepada seluruh karyawan.
10. Perbarui sheet `users` dengan kolom `position`, `department`, dan `section` pada kolom L–N. Jalankan fungsi `setup()` setelah backup untuk menambahkan header yang belum ada; fungsi ini tidak boleh dijalankan sebelum memahami perubahan sheet di produksi.
11. Deploy file GAS yang sudah memuat endpoint `/api/auth/google/onboard` sebagai **New version**, lalu salin URL Web App yang benar ke secret `VITE_GAS_URL`. Pastikan Script Property `GOOGLE_CLIENT_ID` sama persis dengan secret GitHub `VITE_GOOGLE_CLIENT_ID`.
12. Jalankan ulang GitHub Actions setelah secret Client ID ditambahkan.

## Catatan keamanan dan batas verifikasi

- Google Sign-In hanya menerima token ID yang diverifikasi server terhadap Client ID dan email terverifikasi.
- Profil pertama kali diverifikasi token Google di server, lalu langsung dibuat sebagai `Employee` aktif. Untuk perusahaan kontraktor/subkon, kode harus ada di master aktif. Untuk `CGG`, domain email harus sesuai Script Property `CGG_EMAIL_DOMAINS` (default `ptcgg.com`). Jabatan yang diketik tidak menentukan role aplikasi; Admin CGG menetapkan role KTT/SPV/Foreman/Project Manager secara terpisah.
- Admin CGG menetapkan Company Admin dari Pengaturan. Company Admin membuat akun jabatan sesuai perusahaan; backend membatasi daftar akun dan operasi data berdasarkan `companyCode`/`parentCompanyCode`.
- Sesi persisten tetap dapat dicabut dengan logout atau menonaktifkan akun. Lindungi perangkat bersama dan jangan simpan sesi di komputer publik.
- Jangan menjalankan `setup()` atau deployment perubahan autentikasi di produksi sebelum membuat salinan spreadsheet dan menguji dengan akun uji.
- Keberhasilan build frontend tidak berarti deployment GAS telah diperbarui. Uji register, login password, login Google, refresh halaman, logout, penonaktifan akun, dan kontrol role pada deployment nonproduksi terlebih dahulu.

## Model akses akun perusahaan

- **Admin CGG**: mengelola master perusahaan dan menunjuk **Company Admin** untuk perusahaan yang terdaftar. Pendaftaran umum tidak dapat membuat atau memperoleh role Admin.
- **Company Admin**: mengelola akun dan data pada perusahaan sendiri. Jika perusahaan induknya Contractor, cakupan dapat mencakup Subkon yang terdaftar di bawahnya. Company Admin tidak dapat menunjuk Company Admin lain.
- **PJO, SPV HSE, Foreman Safety**: dapat melihat seluruh modul dalam cakupan perusahaan, tetapi tidak dapat membuat, menghapus, atau mengedit data. Mereka hanya dapat menutup PICA.
- **Employee kontraktor/subkon**: pendaftaran mandiri dengan memilih perusahaan aktif. Akun langsung aktif dan hanya dapat melihat data dalam cakupan perusahaan; tombol unduh/ekspor disembunyikan. **Employee CGG** juga langsung aktif, dapat melihat data dan menggunakan tombol unduh/ekspor karena company code `CGG`; jabatan KTT/SPV HSE/Foreman Safety/Project Manager tetap harus ditetapkan sebagai role oleh Admin CGG bila memerlukan hak kontrol. Akun tidak dapat mengubah role sendiri.
- **Contractor/Subkon**: role kompatibilitas untuk akun lama; akses data tetap dibatasi oleh kode perusahaan dan relasi induk dari master perusahaan.
- Data lama tanpa metadata kepemilikan akan tersembunyi dari akun Contractor/Subkon sampai metadata tersebut diverifikasi dan dilengkapi. Ini mencegah kebocoran lintas perusahaan.
- Endpoint Repository/berkas masih perlu integrasi cloud tersendiri. Dokumen yang hanya tersimpan di IndexedDB satu browser belum dapat dibagikan aman lintas perangkat atau dijadikan sumber dokumen kontraktor/subkon lintas perusahaan.


## Otomatisasi onboarding berdasarkan master perusahaan

Versi GAS onboarding terbaru memakai sheet `companies` sebagai master perusahaan. Setelah script GAS terbaru dipasang dan di-deploy, Admin CGG dapat menambah dan memperbarui master ini langsung melalui **Pengaturan → Kontraktor** di HDOS; perubahan dikirim ke server Spreadsheet, bukan hanya IndexedDB browser. Fungsi `setup()` membuat sheet dan header jika belum ada; buat backup Spreadsheet terlebih dahulu sebelum menjalankan setup di produksi.

Kolom sheet `companies` (dikelola dari Pengaturan HDOS; sheet juga dapat diaudit langsung oleh Admin):
- `companyCode`: kode unik, misalnya SLS atau VIP.
- `companyName`: nama resmi yang tampil pada pilihan perusahaan.
- `role`: `Contractor` atau `Subkon` untuk provisioning otomatis.
- `parentCompanyCode`: wajib diisi untuk Subkon dan harus menunjuk ke perusahaan Contractor induk yang aktif.
- `emailDomains`: domain email perusahaan yang sudah diverifikasi, pisahkan beberapa domain dengan koma atau titik koma.
- `autoProvision`: `TRUE` untuk mengaktifkan pembuatan akun otomatis setelah domain cocok.
- `status`: `ACTIVE` agar perusahaan tampil pada daftar pendaftaran.

Contoh konfigurasi (ganti domain dengan domain resmi yang benar-benar telah diverifikasi; pengisian dilakukan dari formulir Tambah Perusahaan di Pengaturan HDOS):
- SLS | PT Sentosa Laju Sejahtera | Contractor | [kosong] | [domain resmi SLS] | TRUE | ACTIVE
- VIP | PT Vendoura Inti Perkasa | Contractor | [domain resmi VIP] | TRUE | ACTIVE
- Kode Subkon | Nama Subkon | Subkon | SLS | [domain resmi Subkon] | TRUE | ACTIVE

Pendaftaran umum tidak memerlukan domain perusahaan. Pengguna hanya dapat memilih perusahaan aktif dari master dan akan mendapat role `Employee` dengan akses terbatas. Domain email tidak digunakan untuk memberikan hak admin. Role Company Admin hanya dapat ditetapkan oleh Admin CGG.

Endpoint publik `GET /api/public/companies` menyediakan pilihan perusahaan aktif untuk formulir Google Sign-In. Setelah mengubah GAS, deploy sebagai versi baru. Isi master perusahaan hanya dengan kode dan domain yang telah diverifikasi.


## Pendaftaran langsung CGG dan kontrol unduhan

- Tambahkan Script Property `CGG_EMAIL_DOMAINS` dengan domain email resmi CGG, misalnya `ptcgg.com` (tanpa `@`; beberapa domain dipisahkan koma atau titik koma). Jika tidak diisi, script memakai `ptcgg.com` sebagai default.
- Akun yang memilih `CGG` hanya diterima jika email Google terverifikasi memakai domain yang diizinkan. Akun langsung berstatus `ACTIVE`, tetapi role awal tetap `Employee`.
- Posisi `KTT`, `SPV HSE`, `Foreman Safety`, dan `Project Manager` disimpan sebagai metadata profil. Admin CGG perlu menetapkan role aplikasi secara eksplisit untuk memberikan kewenangan persetujuan/kontrol. Jangan mengubah role otomatis hanya berdasarkan teks jabatan.
- Frontend hanya menampilkan unduh/ekspor untuk `companyCode=CGG` atau `Admin CGG`. Akun kontraktor/subkon tetap dapat membuka pratinjau file tetapi tidak melihat tombol unduh/ekspor.
- Setelah mengganti `Code.gs`, simpan perubahan dan deploy Apps Script sebagai **New version**. Perubahan file di Library atau GitHub tidak memperbarui deployment GAS secara otomatis.


## Kebijakan verifikasi jabatan tinggi dan akses modul (HDOS)

Frontend memakai field `roleVerified` dari respons pengguna. Untuk memastikan kebijakan ini benar-benar aman, deployment GAS yang aktif wajib mengimplementasikan kontrak berikut sebelum fitur dipakai di produksi:

- `GET /api/me` dan `GET /api/users` harus mengembalikan `roleVerified: true|false` dari data tersimpan server. Field yang kosong/null dianggap **belum diverifikasi**.
- `PATCH /api/users/:id` menerima `roleVerified` hanya dari **Admin CGG**. Pengguna tidak boleh mengubah field ini lewat onboarding, profil, atau payload akun sendiri.
- `POST /api/users` tetap hanya untuk Admin CGG / kewenangan pengelolaan akun yang sudah ditetapkan. Admin CGG dapat menetapkan role KTT, Project Manager, SPV HSE, Foreman Safety, dan PJO; pembuatan akun tidak otomatis menandai role terverifikasi.
- Jabatan tinggi yang belum terverifikasi hanya mendapat 4 modul Crew: **Dashboard, Repository, Inspeksi, dan Hazard**. Setelah diverifikasi oleh Admin CGG, akses modul mengikuti matriks role yang ditetapkan.
- Jika verifikasi dicabut, akses tambahan harus langsung ditutup pada request berikutnya.
- Akun perusahaan kontraktor/Subkon tetap tidak boleh mengunduh/mengekspor dokumen. Akun CGG dan Admin CGG boleh mengunduh sesuai kewenangan. Kontrol ini harus ditegakkan di endpoint/penyimpanan file, bukan hanya menyembunyikan tombol frontend.
- Semua perubahan role, verifikasi, status akun, dan cakupan perusahaan harus dicatat di audit log dengan aktor dan waktu.

### Uji penerimaan wajib

1. Akun Foreman Safety/SPV HSE/KTT/Project Manager/PJO dengan `roleVerified=false` atau field kosong hanya dapat membuka Dashboard, Repository, Inspeksi, dan Hazard.
2. Akun tersebut tidak dapat membuka modul tambahan lewat URL langsung, shortcut, state lama, atau request API.
3. Setelah Admin CGG mengubah `roleVerified=true`, modul yang sesuai role dapat dibuka.
4. Setelah verifikasi dicabut, akses tambahan langsung ditolak.
5. Kontraktor dan Subkon dapat melihat dokumen dalam cakupan perusahaan tetapi tidak dapat mengunduh file dengan menebak URL atau memanggil endpoint langsung.
6. Akun CGG dapat mengunduh dokumen sesuai kewenangannya.
7. Pendaftaran profil tetap langsung aktif dan masuk; posisi yang diketik tidak memberikan role atau status verifikasi dengan sendirinya.

**Status integrasi:** kode GAS deployment aktif tidak berada di repository ini. Perubahan frontend tidak memperbarui deployment GAS secara otomatis. Jangan tandai fitur ini siap produksi sebelum endpoint GAS menerapkan dan lulus uji di atas.
