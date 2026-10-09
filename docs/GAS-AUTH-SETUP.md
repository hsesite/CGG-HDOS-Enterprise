# Google Apps Script: pendaftaran, Google Sign-In, dan sesi persisten

Frontend telah menyediakan formulir daftar, login Google, dan kontrol akun KTT. Endpoint server wajib diperbarui juga; frontend saja tidak dapat memverifikasi password atau token Google dengan aman.

## Backend script

Gunakan versi backend yang disertakan bersama perubahan ini sebagai dasar untuk deployment GAS. Jangan hanya mengubah frontend. Endpoint yang dibutuhkan:

- `POST /api/auth/register` — nama, email, password; role awal selalu `Employee`.
- `POST /api/auth/google` — memverifikasi ID token Google di server dan membuat/mencari akun.
- `GET /api/users` — daftar akun, KTT saja.
- `PATCH /api/users/:id` — ubah role/status akun, KTT saja.
- `POST /api/auth/logout` — menghapus sesi server.

Versi GAS yang diperbarui menyimpan hash SHA-256 bersalt untuk password akun baru, memigrasikan password lama ke hash setelah login berhasil, dan menggunakan Script Properties untuk sesi yang bertahan melewati restart browser sampai logout atau akun dinonaktifkan. Password lama yang tersimpan dalam sheet tidak otomatis dapat dihapus sebelum pemilik memastikan migrasi dan backup aman.

## Konfigurasi Google Sign-In

1. Buat OAuth Client ID tipe **Web application** pada Google Cloud Console.
2. Tambahkan origin aplikasi yang persis, misalnya `https://hsesite.github.io`, ke Authorized JavaScript origins.
3. Simpan Client ID sebagai GitHub Actions repository secret `VITE_GOOGLE_CLIENT_ID`.
4. Pada Apps Script, buka **Project Settings → Script Properties**, lalu buat `GOOGLE_CLIENT_ID` dengan nilai Client ID yang sama.
5. Deploy ulang Apps Script sebagai Web App dengan akses sesuai kebijakan perusahaan, lalu pastikan URL deployment sama dengan `VITE_GAS_URL`.
6. Jalankan fungsi `setup()` satu kali untuk menambahkan kolom user yang diperlukan. Fungsi ini tidak membuat akun administrator demo.
7. Buat/pertahankan akun KTT pertama melalui sheet `users` yang dilindungi, dengan role `KTT` dan status `ACTIVE`. Jangan membagikan akses edit sheet kepada seluruh karyawan.
8. Jalankan ulang GitHub Actions setelah secret Client ID ditambahkan.

## Catatan keamanan dan batas verifikasi

- Google Sign-In hanya menerima token ID yang diverifikasi server terhadap Client ID dan email terverifikasi.
- Pendaftaran publik memberikan role `Employee`; perubahan role administratif hanya lewat endpoint KTT.
- Sesi persisten tetap dapat dicabut dengan logout atau menonaktifkan akun. Lindungi perangkat bersama dan jangan simpan sesi di komputer publik.
- Jangan menjalankan `setup()` atau deployment perubahan autentikasi di produksi sebelum membuat salinan spreadsheet dan menguji dengan akun uji.
- Keberhasilan build frontend tidak berarti deployment GAS telah diperbarui. Uji register, login password, login Google, refresh halaman, logout, penonaktifan akun, dan kontrol role pada deployment nonproduksi terlebih dahulu.
