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
- [ ] Strategi backup dan pemulihan data lokal/cloud yang sudah diuji.
- [ ] Upload file asli ke Google Drive atau penyimpanan cloud terkelola. Fitur ini tidak boleh diasumsikan tersedia hanya karena file bisa diunggah ke browser.

## Sinkronisasi

- [x] Queue persisten di IndexedDB.
- [x] Retry dengan exponential backoff.
- [x] Pemantauan event online/offline browser.
- [x] Entity tanpa endpoint ditahan sebagai konflik, bukan di-retry tanpa batas.
- [x] Operasi DELETE yang belum didukung ditahan sebagai konflik.
- [x] UI tidak lagi menyamakan antrean kosong dengan bukti bahwa semua data telah tersinkron.
- [ ] CRUD cloud end-to-end untuk inspections, hazards, picas, incidents.
- [ ] Idempotency dan pencegahan duplikasi saat respons hilang setelah server memproses request.
- [ ] Proses pull/refresh data cloud dan resolusi konflik yang eksplisit.
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
