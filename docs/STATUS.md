# CGG HDOS — Status Implementasi dan Verifikasi

Dokumen ini memisahkan **implementasi yang terlihat di kode** dari **perilaku yang sudah diuji**. Checklist yang belum diuji tidak boleh dianggap lulus. Tidak ada persentase kesiapan produksi yang diberikan karena belum tersedia rangkaian uji operasional lengkap.

## Arsitektur runtime

- [x] Frontend React/TypeScript/Vite.
- [x] Workflow GitHub Actions untuk build dan deploy GitHub Pages.
- [x] Pemeriksaan TypeScript frontend dijalankan pada workflow deployment.
- [x] IndexedDB untuk penyimpanan lokal dan antrean.
- [x] Client transport GAS dengan `VITE_GAS_URL`.
- [ ] Validasi deployment GAS aktif, permission, dan semua route terhadap Spreadsheet produksi.
- [ ] Bukti end-to-end bahwa data tiap modul berhasil disimpan dan dibaca kembali dari cloud.

## Aplikasi dan penyimpanan lokal

- [x] Inisialisasi aplikasi memiliki error state dan opsi mencoba kembali.
- [x] Metadata repository disimpan secara lokal.
- [x] File asli repository disimpan sebagai Blob di IndexedDB.
- [x] Kegagalan penulisan fallback storage diteruskan sebagai error.
- [x] Upload dokumen mencoba rollback metadata jika penyimpanan file binary gagal.
- [ ] Uji browser storage quota, private browsing, upgrade schema, dan pemulihan data.
- [x] Implementasi backup terjadwal Spreadsheet pusat ke Google Drive dan log backup.
- [ ] Uji pemulihan (restore) dari backup, kebijakan retensi, dan pemulihan data lokal/cloud.
- [x] Implementasi upload file asli Repository ke Google Drive melalui GAS, metadata pusat, preview, download terotorisasi, dan penghapusan cloud.
- [ ] Uji end-to-end upload, preview, download, delete, batas ukuran, dan pemulihan Drive pada deployment GAS aktif.

## Sinkronisasi

- [x] Queue persisten di IndexedDB.
- [x] Retry dengan exponential backoff.
- [x] Pemantauan event online/offline browser.
- [x] Entity tanpa endpoint ditahan sebagai konflik, bukan di-retry tanpa batas.
- [x] Operasi DELETE yang belum didukung ditahan sebagai konflik.
- [x] UI tidak lagi menyamakan antrean kosong dengan bukti bahwa semua data telah tersinkron.
- [ ] CRUD cloud end-to-end untuk inspections, hazards, picas, incidents.
- [ ] Idempotency dan pencegahan duplikasi saat respons hilang setelah server memproses request.
- [x] Implementasi pull/refresh snapshot cloud untuk Inspection, Hazard, PICA, Incident, Repository, dan formulir terbit; merge menjaga perubahan lokal yang masih antre.
- [x] Tombol manual **Ambil Data Pusat** pada modul Sinkronisasi.
- [x] Penghapusan dokumen Repository offline disimpan sebagai antrean dan diproses saat online.
- [ ] Uji proses pull/refresh, retry, dan resolusi konflik secara end-to-end pada deployment GAS aktif.
- [ ] Uji offline → online, reload, session expiry, dan retry manual pada perangkat nyata.
- [ ] Implementasi endpoint untuk repository/contractor bila memang diperlukan.

## Authentication dan keamanan

- [x] Login frontend memanggil client API cloud.
- [x] Session token disimpan dalam sessionStorage.
- [ ] Verifikasi autentikasi dan otorisasi server-side pada deployment GAS.
- [ ] Verifikasi bahwa hak akses frontend selalu sesuai role dari server dan tidak bergantung pada pilihan role lokal.
- [ ] Hapus seluruh kredensial default/fallback dari source code dan rotasi credential jika pernah terpublikasi.
- [ ] Uji akses tidak sah, session expiry, logout, input validation, dan audit trail.
- [ ] Tinjau keamanan dependency dan kebijakan pembaruan.

## Modul HSE

- [ ] Inspection: pembuatan, validasi checklist, penyimpanan, foto/GPS nyata, dan pelaporan.
- [ ] Hazard: risk matrix, alur investigasi, bukti, dan penutupan.
- [ ] PICA: assignment PIC, target date, approval, aging, dan efektivitas.
- [ ] Incident: investigasi 5-Why, root cause, tindakan, dan alur review.
- [ ] Repository: revisi, persetujuan, distribusi, akses dokumen, dan backup.
- [ ] Contractor: data kontraktor dan KPI terhubung ke sumber data yang valid.
- [ ] Dashboard: angka agregat bersumber dari data nyata dan menampilkan freshness/asal data.
- [ ] GIS: koordinat yang ditampilkan berasal dari data terverifikasi; lokasi demo diberi label.
- [ ] AI: output ditandai sebagai rekomendasi, bukan pengganti keputusan personel berwenang.

## Implementasi terbaru (4 November 2026)

- [x] Inisialisasi workspace memuat antrean akun aktif terlebih dahulu, kemudian mengambil snapshot database pusat.
- [x] Empat register operasional direkonsiliasi dengan cache IndexedDB tanpa menimpa record yang masih memiliki operasi pending.
- [x] Metadata Repository dan formulir yang telah dipublikasikan dimuat dari database pusat.
- [x] Status `cloudStored` ditampilkan tanpa mengekspos ID file Google Drive.
- [x] Upload Repository memperbarui metadata lokal dengan respons pusat; penghapusan online meminta konfirmasi backend, sedangkan penghapusan offline masuk antrean.
- [x] Refresh cloud tersedia manual pada modul Sinkronisasi.
- [x] Status koneksi modul Sinkronisasi memakai status jaringan perangkat aktual, bukan tombol simulasi.
- [x] Pemanggilan snapshot cloud duplikat pada modul operasional dihapus; satu store pusat mengelola proses pemuatan.
- [x] Dashboard membandingkan perusahaan dari master terdaftar, bukan daftar kode statis.
- [x] Tren harian 7/14/30 hari dihitung dari tanggal aktual Inspection, Hazard, Incident, dan PICA.
- [x] KPI overdue PICA dihitung dari target date; Hazard kritis hanya menghitung temuan yang masih terbuka.
- [x] Contractor Passport menghitung PICA aktif dari register operasional dalam cakupan perusahaan; manpower, MCU, dan KPI tanpa sumber tetap ditampilkan sebagai belum tersedia.
- [x] Modul GIS menampilkan plot koordinat relatif dari latitude/longitude valid pada master area dan daftar status lokasi; bukan basemap atau citra satelit.
- [x] Backend menyediakan backup Spreadsheet pusat ke Google Drive, log hasil backup, dan pemasangan trigger harian pukul 02:00 sesuai timezone Apps Script.
- [x] Audit trail pusat dapat dibaca melalui endpoint khusus Admin CGG dan ditampilkan pada Pengaturan → Audit Trail (maksimal 500 aktivitas terbaru).

## Pengujian dan deployment

- [x] Workflow deployment menjalankan typecheck frontend sebelum build.
- [x] Build Vite berhasil pada workflow untuk commit yang diperiksa sebelum perubahan dokumentasi terakhir.
- [ ] Workflow terakhir setelah seluruh perubahan berakhir dengan conclusion success.
- [ ] Unit test untuk perhitungan risiko, validasi, dan utilitas.
- [ ] Test integrasi transport GAS dengan environment nonproduksi.
- [ ] End-to-end test alur HSE utama.
- [ ] Uji responsive di desktop dan ponsel fisik.
- [ ] Uji aksesibilitas dasar, error boundary, dan kondisi jaringan buruk.

## Cara verifikasi

1. Buka tab **Actions** pada repository dan periksa run terbaru, bukan hanya status commit.
2. Uji aplikasi di browser bersih dan di ponsel fisik.
3. Uji dengan data nonproduksi dan akun per role.
4. Periksa langsung perubahan pada Spreadsheet setelah operasi cloud.
5. Catat error console/network dan bandingkan jumlah record sebelum/sesudah sinkronisasi.
6. Lakukan backup sebelum pengujian yang mengubah atau menghapus data.

**Penting:** keberhasilan typecheck/build membuktikan kualitas kompilasi frontend saja. Ia tidak membuktikan keamanan, kepatuhan SMKP, kebenaran data, atau kesiapan operasional.
