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
- [x] Idempotency CREATE berbasis ID klien dengan pemeriksaan ulang di dalam Script Lock; retry setelah respons hilang tidak membuat record kedua.
- [x] Respons cloud kosong/tidak valid atau gagal dibaca diklasifikasikan sebagai gangguan gateway/transien agar request dapat di-retry secara aman; respons HTTP gagal tetap mengikuti status dan pesan backend.
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
- [x] Dashboard menampilkan waktu snapshot cloud terakhir dan sumber yang gagal dimuat agar data lokal tidak disalahartikan sebagai data pusat terbaru.
- [x] Form investigasi insiden menyediakan lima tingkat pertanyaan Why dan tidak lagi mengisi akar penyebab/tindakan dengan asumsi otomatis.
- [x] Waktu kejadian diwajibkan diisi; timeline awal hanya mencatat laporan yang benar-benar dibuat.
- [x] Alur investigasi insiden: Foreman Safety/SPV HSE terverifikasi dapat memperbarui 5-Why, akar penyebab, dan tindakan koreksi; KTT/SPT/SPV terverifikasi dapat mereview; penutupan hanya KTT terverifikasi atau Admin CGG.
- [x] Status review/penutupan dicatat bersama nama dan waktu, dengan audit trail dan perlindungan idempotensi saat respons jaringan hilang.
- [x] Sinkronisasi UPDATE meneruskan versi `updatedAt` dari server ke record lokal dan antrean lanjutan agar rangkaian perubahan offline pada record yang sama tidak saling menolak.
- [x] Sinkronisasi CREATE juga meneruskan versi pertama dari server ke UPDATE yang sudah antre untuk record baru.
- [x] Kode referensi Inspection, Hazard, Incident, dan PICA menggunakan tahun berjalan serta potongan ID unik, bukan nomor urut lokal yang dapat bentrok antarperangkat.
- [x] Status koneksi modul Sinkronisasi memakai status jaringan perangkat aktual, bukan tombol simulasi.
- [x] Pemanggilan snapshot cloud duplikat pada modul operasional dihapus; satu store pusat mengelola proses pemuatan.
- [x] Dashboard membandingkan perusahaan dari master terdaftar, bukan daftar kode statis.
- [x] Tren harian 7/14/30 hari dihitung dari tanggal aktual Inspection, Hazard, Incident, dan PICA.
- [x] KPI overdue PICA dihitung dari target date; Hazard kritis hanya menghitung temuan yang masih terbuka.
- [x] Contractor Passport menghitung PICA aktif dari register operasional dalam cakupan perusahaan; manpower, MCU, dan KPI tanpa sumber tetap ditampilkan sebagai belum tersedia.
- [x] Modul GIS menampilkan plot koordinat relatif dari latitude/longitude valid pada master area dan daftar status lokasi; bukan basemap atau citra satelit.
- [x] Backend menyediakan backup Spreadsheet pusat ke Google Drive, log hasil backup, dan pemasangan trigger harian pukul 02:00 sesuai timezone Apps Script.
- [x] Audit trail pusat dapat dibaca melalui endpoint khusus Admin CGG dan ditampilkan pada Pengaturan → Audit Trail (maksimal 500 aktivitas terbaru).

### Pengembangan lanjutan Contractor Passport (4 November 2026)

- [x] Daftar perusahaan pada Contractor Passport mengikuti master perusahaan terdaftar, tidak lagi dibatasi kode SLS/VIP di frontend.
- [x] Hubungan Contractor–Subkon disimpan pada model passport dan ditampilkan pada kartu perusahaan.
- [x] Akun Contractor/Company Admin dapat melihat perusahaan sendiri dan subkontraktor terdaftar di bawahnya pada lingkup data yang diizinkan.
- [x] Personel pengawas CGG yang telah diverifikasi dapat membaca master perusahaan secara lintas kontraktor; field domain email dan auto-provision tidak dikirim pada respons baca-saja.
- [x] Akun Contractor, Subkon, dan Contractor PIC dapat membaca passport perusahaannya; Contractor induk juga dapat membaca subkon terdaftar di bawahnya tanpa melihat konfigurasi domain atau auto-provision.
- [x] Lingkup data pengawas backend mengikuti seluruh Contractor aktif beserta Subkon aktif yang terdaftar di bawahnya.
- [x] Project Manager CGG terverifikasi dapat membaca dashboard, master passport, laporan kepatuhan, dan PICA lintas perusahaan sesuai cakupan pengawasan; kewenangan review/verifikasi tetap dibatasi pada peran HSE yang ditetapkan.
- [x] Contractor Passport mengikuti pembaruan master secara asinkron sehingga tidak tertahan pada pilihan awal yang kosong.
- [x] Status perusahaan ditampilkan sesuai status aktual; masa berlaku Safety Passport menampilkan sisa hari atau kondisi kedaluwarsa.
- [x] Register PICA per perusahaan menampilkan nomor, sumber temuan, PIC, target, dan status overdue berdasarkan tanggal target.
- [x] Backend menyediakan register laporan kepatuhan bulanan pada Spreadsheet pusat dengan satu laporan per perusahaan/periode.
- [x] Laporan bulanan menyimpan agregat manpower, jumlah fleet, cakupan dan hasil MCU, cakupan dan penyelesaian induksi, Safe Hours kumulatif, serta LTI periode.
- [x] Perusahaan Contractor/Subkon mengirim laporan; Foreman Safety/SPV HSE terverifikasi atau Admin CGG dapat memverifikasi atau mengembalikan dengan catatan.
- [x] Laporan yang dikembalikan dapat diperbaiki dan dikirim ulang oleh perusahaan pemilik.
- [x] KPI MCU, induksi, Safe Hours, manpower, dan fleet pada Passport mengambil data dari laporan terakhir yang sudah diverifikasi; data yang belum diverifikasi tidak dipakai sebagai KPI.
- [x] Ekspor CSV laporan Contractor Passport hanya tersedia untuk akun internal CGG; akun Contractor/Subkon tetap tidak mendapatkan fungsi unduh.
- [x] Data MCU dibatasi pada agregat; tidak ada kolom diagnosis atau data medis individu pada laporan ini.
- [x] Register rinci fleet terpusat pada sheet `contractor_fleet`: nomor lambung unik per perusahaan, jenis unit, merek/model, kepemilikan, status P2H, masa berlaku SIA, status aktif/nonaktif, dan audit trail; Contractor/Subkon hanya mengelola unit milik perusahaannya sendiri.
- [x] Ekspor CSV laporan kepatuhan dan register fleet dibatasi untuk akun internal CGG; akun Contractor/Subkon tidak memperoleh fungsi unduh.
- [x] Backend riwayat P2H append-only per unit: tanggal pemeriksaan, status laik/tidak laik, hour meter, nama operator, temuan, tindakan koreksi, pemeriksa, dan audit trail; hasil terbaru memperbarui status P2H pada register fleet.
- [x] Setup database memasukkan `contractor_p2h_history` ke proses rekonsiliasi header sehingga sheet baru maupun sheet lama diproses dengan schema kanonis.
- [x] Penulisan riwayat P2H dan pembaruan status terakhir fleet memiliki mekanisme rollback untuk mencegah data parsial jika salah satu operasi Spreadsheet gagal.
- [x] UI Contractor Passport menyediakan panel riwayat P2H per unit dan form pencatatan untuk perusahaan pemilik; catatan lama tetap ditampilkan dan tidak dapat ditimpa.
- [x] Form P2H mendukung upload bukti foto JPG/PNG/WEBP maksimal 5 MB ke Google Drive; backend memvalidasi folder penyimpanan sesuai perusahaan pemilik unit dan endpoint pratinjau memeriksa cakupan akses.
- [x] Register fleet menyediakan unggah/ganti dan pratinjau dokumen SIA PDF/JPG/PNG maksimal 10 MB, disimpan di Google Drive per perusahaan dan ditautkan ke unit.
- [x] Penggantian dokumen SIA menyimpan referensi Drive baru ke register fleet dan melakukan flush sebelum file lama dipindahkan ke sampah; kegagalan penulisan mencoba memulihkan baris sebelumnya dan membersihkan file baru.
- [ ] Endpoint dan UI bukti P2H/SIA belum dinyatakan teruji pada deployment GAS aktif; validasi hak akses, rollback Spreadsheet, dan siklus penggantian file harus masuk uji menyeluruh.
- [ ] Bukti dokumen pendukung laporan, verifikasi sumber data, dan laporan tren historis masih perlu dilengkapi.

## Pengujian dan deployment

- [x] Workflow deployment menjalankan typecheck frontend sebelum build.
- [x] Build Vite berhasil pada workflow untuk commit yang diperiksa sebelum perubahan dokumentasi terakhir.
- [ ] Workflow terakhir setelah seluruh perubahan berakhir dengan conclusion success.
- [ ] Validasi build, typecheck, dan pengujian end-to-end untuk endpoint riwayat P2H dijadwalkan pada tahap pengujian menyeluruh setelah implementasi modul selesai.
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

- [x] Upload foto operasional dan pencatatan P2H tidak lagi mengembalikan kegagalan hanya karena audit log gagal setelah data/file utama tersimpan; hal ini mencegah retry klien membuat file foto atau catatan P2H duplikat pada kegagalan audit saja.
- [x] Retry manual hanya mengaktifkan ulang item milik akun/perusahaan yang sedang aktif dan memiliki endpoint cloud; item entity yang belum didukung tetap ditahan sebagai konflik konfigurasi, bukan dikirim berulang.
- [x] `triggerSync()` memeriksa ulang identitas pengguna, token sesi, dan scope antrean setelah inisialisasi IndexedDB asinkron; sinkronisasi dibatalkan jika akun berubah selama pembacaan antrean.
- [x] Modul Contractor Passport mengosongkan laporan kepatuhan, register fleet, riwayat P2H, dan pratinjau dokumen ketika identitas/perusahaan/status verifikasi/peran akun berubah; respons asinkron dari sesi sebelumnya diabaikan agar data tenant lama tidak tertampil setelah pergantian akun.
- [x] Inisialisasi antrean sinkronisasi memeriksa ulang identitas dan scope akun setelah proses pemulihan item asinkron selesai, tepat sebelum snapshot antrean dipublikasikan; pergantian akun di tengah pemulihan membatalkan publikasi snapshot lama.
- [x] Permintaan asinkron untuk refresh register fleet dan pembacaan riwayat P2H memvalidasi ulang session scope sebelum memperbarui state; hasil dari sesi/tenant sebelumnya diabaikan.
- [x] Pratinjau dokumen SIA, bukti foto P2H, dan refresh laporan kepatuhan memvalidasi ulang session scope setelah respons API diterima; respons atau pesan error dari sesi sebelumnya tidak dapat mengubah tampilan tenant aktif.

- [x] Operasi tulis Contractor Passport (unggah SIA, pencatatan P2H, tambah/perbarui fleet, kirim/revisi laporan, dan review) menangkap session scope; hasil, pesan error, serta flag busy dari request sesi lama tidak mengubah tampilan tenant aktif. Pencatatan P2H juga menghentikan rangkaian upload foto → pembuatan record bila sesi berubah sebelum record dikirim.

- [x] Retry manual antrean sinkronisasi memvalidasi ulang pemilik dan scope setelah penulisan IndexedDB asinkron sebelum memperbarui snapshot antrean aktif; item tenant lama tetap tersimpan pada owner key-nya dan tidak dipublikasikan ke tampilan tenant baru.

 
### Stabilitas repository dan pipeline (9 November 2026)

- [x] Pemeriksaan riwayat Actions membedakan kegagalan kode dari gangguan runner: HTTP 504 saat mengunduh Bun terjadi pada tahap setup, sebelum dependency, typecheck, test, atau build dijalankan.
- [x] Kesalahan sintaks TypeScript pada assertion test authorization sebelumnya telah diperbaiki; workflow validasi berikutnya lulus sampai tahap typecheck frontend/backend, authorization tests, dan production build.
- [x] Pipeline deployment untuk commit terbaru telah berhasil; run deployment yang dibatalkan merupakan run commit perantara yang digantikan oleh commit lebih baru karena concurrency deployment, bukan kegagalan build pada HEAD final.
- [x] Versi Bun dipatok ke 1.4.4 pada workflow CI, PR, dan deployment; instalasi deployment/PR memakai frozen lockfile agar dependency yang diuji sama dengan dependency yang dibangun.
- [x] Checkout GitHub Actions dinaikkan ke actions/checkout@v5 untuk menghindari ketergantungan pada runtime Node 20 yang sudah deprecated pada runner.
- [ ] Validasi integrasi runtime Google Apps Script, Spreadsheet, Drive, kredensial deployment, dan akun per role tetap membutuhkan pengujian end-to-end pada environment nonproduksi/produksi yang diizinkan.
- [ ] Branch fitur lama belum dihapus. Branch tersebut tidak menghambat pipeline main selama tidak digabung; sebelum cleanup perlu pemeriksaan perbedaan commit dan konfirmasi pemilik.


### Hardening akses dan onboarding (9 November 2026)
- [x] Frontend module access diarahkan ke satu policy bersama agar navigasi dan kontrol akses modul tidak berbeda aturan.
- [x] Kontrol persetujuan PICA di frontend mensyaratkan role server yang telah diverifikasi; Admin CGG tetap memiliki kewenangan administratif.
- [x] Pendaftaran mandiri dengan pilihan perusahaan CGG dibatasi pada domain korporat yang diizinkan (default `ptcgg.com`) atau alamat persis di `CGG_ALLOWED_EMAILS`; email publik seperti Gmail/Yahoo tidak otomatis memperoleh akun internal CGG.
- [x] Test regresi GAS diperbarui untuk menguji domain default, domain tambahan, allowlist email persis, dan penolakan email publik untuk CGG.
- [ ] Perubahan `gas/Code.gs` harus dipasang sebagai versi baru pada deployment Apps Script staging/produksi secara terpisah; commit GitHub tidak memperbarui deployment GAS.
- [ ] Jalankan UAT lintas role dan lintas tenant pada Spreadsheet/Drive staging sebelum go-live.
