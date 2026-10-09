# Google Apps Script: pendaftaran, Google Sign-In, dan sesi persisten

Frontend telah menyediakan formulir daftar, login Google, dan kontrol akun KTT. Endpoint server wajib diperbarui juga; frontend saja tidak dapat memverifikasi password atau token Google dengan aman.

## Backend script

Gunakan file GAS pendamping yang diserahkan bersama pekerjaan ini sebagai dasar deployment GAS. File tersebut tidak otomatis mengubah Web App GAS yang saat ini sudah ter-deploy. Jangan hanya mengubah frontend. Endpoint yang dibutuhkan:

- Pendaftaran mandiri dinonaktifkan. `POST /api/users` hanya dapat dipanggil oleh akun `Admin CGG` untuk membuat akun.
- `POST /api/auth/google` — memverifikasi ID token Google di server dan membuat/mencari akun.
- `GET /api/users` — daftar akun, hanya `Admin CGG`.
- `POST /api/users` — buat akun `Admin CGG`, `Contractor`, atau `Subkon`, hanya `Admin CGG`.
- `PATCH /api/users/:id` — ubah status/relasi akun, hanya `Admin CGG`.
- `POST /api/auth/logout` — menghapus sesi server.

Versi GAS yang diperbarui menyimpan hash SHA-256 bersalt untuk password akun baru, memigrasikan password lama ke hash setelah login berhasil, dan menggunakan Script Properties untuk sesi yang bertahan melewati restart browser sampai logout atau akun dinonaktifkan. Password lama yang tersimpan dalam sheet tidak otomatis dapat dihapus sebelum pemilik memastikan migrasi dan backup aman.

## Konfigurasi Google Sign-In

1. Buat OAuth Client ID tipe **Web application** pada Google Cloud Console.
2. Tambahkan origin aplikasi yang persis, misalnya `https://hsesite.github.io`, ke Authorized JavaScript origins.
3. Simpan Client ID sebagai GitHub Actions repository secret `VITE_GOOGLE_CLIENT_ID`.
4. Pada Apps Script, buka **Project Settings → Script Properties**, lalu buat `GOOGLE_CLIENT_ID` dengan nilai Client ID yang sama.
5. Deploy ulang Apps Script sebagai Web App dengan akses sesuai kebijakan perusahaan, lalu pastikan URL deployment sama dengan `VITE_GAS_URL`.
6. Buat backup spreadsheet. Jalankan fungsi `setup()` satu kali untuk menambahkan kolom user yang diperlukan. Fungsi ini tidak membuat akun administrator demo.
7. Jika ingin membersihkan data operasional di Spreadsheet, set Script Property `CONFIRM_CLEAN_START` ke `DELETE_HDOS_OPERATIONAL_DATA`, lalu jalankan fungsi `clearOperationalDataForCleanStart()` secara manual. Fungsi ini mempertahankan sheet `users` dan `audit_logs`; jangan jalankan sebelum backup.
8. Setelah selesai, hapus Script Property konfirmasi jika belum otomatis terhapus, lalu verifikasi semua sheet dan akun.
9. Buat/pertahankan akun KTT pertama melalui sheet `users` yang dilindungi, dengan role `KTT` dan status `ACTIVE`. Jangan membagikan akses edit sheet kepada seluruh karyawan.
10. Jalankan ulang GitHub Actions setelah secret Client ID ditambahkan.

## Catatan keamanan dan batas verifikasi

- Google Sign-In hanya menerima token ID yang diverifikasi server terhadap Client ID dan email terverifikasi.
- Pendaftaran publik memberikan role `Employee`; perubahan role administratif hanya lewat endpoint KTT.
- Sesi persisten tetap dapat dicabut dengan logout atau menonaktifkan akun. Lindungi perangkat bersama dan jangan simpan sesi di komputer publik.
- Jangan menjalankan `setup()` atau deployment perubahan autentikasi di produksi sebelum membuat salinan spreadsheet dan menguji dengan akun uji.
- Keberhasilan build frontend tidak berarti deployment GAS telah diperbarui. Uji register, login password, login Google, refresh halaman, logout, penonaktifan akun, dan kontrol role pada deployment nonproduksi terlebih dahulu.

## Model akses akun perusahaan

- **Admin CGG**: satu-satunya role yang boleh membuat akun, melihat daftar akun, mengaktifkan/menonaktifkan akun, dan mengakses semua data yang tersedia di endpoint GAS.
- **Contractor**: akun ditautkan ke `companyCode`; dapat membaca data milik perusahaan tersebut dan data Subkon yang mempunyai `parentCompanyCode` sama dengan kode kontraktor.
- **Subkon**: akun ditautkan ke `companyCode` unik dan `parentCompanyCode` wajib menunjuk akun Contractor aktif; hanya dapat membaca data yang company/subkon code-nya sendiri.
- Email Google harus terlebih dahulu didaftarkan Admin CGG. Google Sign-In tidak lagi membuat akun baru secara otomatis.
- Data lama tanpa metadata kepemilikan akan tersembunyi dari akun Contractor/Subkon sampai metadata tersebut diverifikasi dan dilengkapi. Ini mencegah kebocoran lintas perusahaan.
- Endpoint Repository/berkas masih perlu integrasi cloud tersendiri. Dokumen yang hanya tersimpan di IndexedDB satu browser belum dapat dibagikan aman lintas perangkat atau dijadikan sumber dokumen kontraktor/subkon lintas perusahaan.
