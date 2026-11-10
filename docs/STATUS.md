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
- [x] Token sesi dan cache profil pengguna disimpan dalam `sessionStorage` (dibatasi pada tab browser aktif).
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
- [x] Workflow validasi dan deployment untuk commit `88204eeab52125546aeb1d5547629d3d6e7547b9` berakhir dengan conclusion success; build dan deploy GitHub Pages selesai.
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
- [x] Jika terjadi kesalahan engine/storage tak terduga di tengah replay, item milik akun aktif yang tertinggal berstatus `SYNCING` dicoba dikembalikan ke `PENDING` dan disimpan kembali agar dapat dijadwalkan retry; pemulihan dibatasi pada identitas dan token sesi yang sama.

 
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


## Implementasi terbaru (9 November 2026)

- [x] Endpoint readiness memeriksa keberadaan seluruh sheet wajib dan keberadaan setiap header wajib berdasarkan nama kolom.
- [x] Pemeriksaan skema readiness bersifat read-only dan mengizinkan kolom tambahan/legacy agar kompatibel dengan migrasi.
- [x] Respons readiness hanya menampilkan status agregat dan jumlah sheet yang hilang atau memiliki skema tidak valid; tidak mengembalikan nama sheet, nama kolom, ID Spreadsheet, atau kredensial.
- [x] Test readiness mencakup konfigurasi lengkap, header wajib hilang, sheet hilang, dan kebijakan pendaftaran CGG yang belum dikonfigurasi.
- [x] Pemulihan database non-destruktif: backup HDOS yang tervalidasi dapat disalin ke Spreadsheet baru; fungsi memverifikasi folder sumber, tipe file, sheet/header wajib, mencatat hasil, dan tidak mengubah ID database aktif.
- [x] Test keamanan pemulihan memastikan fungsi tidak melakukan overwrite atau mengganti konfigurasi database aktif.
- [ ] Jalankan uji backup dan recovery copy pada project Apps Script serta periksa isi data hasil pemulihan.
- [x] Validasi GitHub Actions dan deployment GitHub Pages lulus pada commit `0cdc148`.
- [ ] Deploy versi GAS terbaru ke project Apps Script dan verifikasi readiness terhadap Spreadsheet uji.
- [ ] Uji restore backup, termasuk verifikasi isi dan konsistensi data setelah pemulihan.
- [ ] UAT lintas role dan tenant pada akun/perangkat uji dengan data operasional representatif.


## Penguatan sesi browser (9 November 2026)

- [x] Token API HDOS dipindahkan dari `localStorage` ke `sessionStorage`; token tidak dipertahankan sebagai kredensial browser setelah sesi tab berakhir.
- [x] Cache profil pengguna dipindahkan ke `sessionStorage` agar profil lama tidak otomatis muncul kembali pada sesi browser baru tanpa autentikasi ulang.
- [x] Uji regresi memastikan token dan cache profil tidak lagi ditulis/dibaca dari `localStorage`.
- [ ] Uji manual lintas tab, refresh, tutup-buka browser, logout, dan kedaluwarsa token pada browser nyata.


## Penguatan rate limit autentikasi (9 November 2026)

- [x] Pemeriksaan dan pencatatan percobaan login digabung menjadi satu reservasi atomik di bawah Script Lock.
- [x] Batas 10 percobaan per alamat email dalam jendela cache 5 menit diterapkan sebelum verifikasi kredensial.
- [x] Login berhasil menghapus penghitung kegagalan; percobaan paralel tidak lagi dapat lolos hanya karena pemeriksaan dan increment berjalan terpisah.
- [ ] Uji beban dan verifikasi perilaku pada deployment Apps Script aktual.

### Penguatan sinkronisasi dan Repository (9 November 2026)
- [x] Upload Repository mengunci pemeriksaan idempotensi, pembuatan file Drive, dan commit metadata pusat dalam satu critical section; jika commit metadata gagal, file Drive baru dicoba dibersihkan.
- [x] File Repository yang dipreview, diunduh, atau dihapus harus terbukti berada pada folder Drive Repository yang dikonfigurasi; kegagalan verifikasi menolak akses.
- [x] Regression test mencakup isolasi folder Drive dan pemulihan antrean `SYNCING` setelah kesalahan engine.
- [x] Workflow validasi dan deployment GitHub Pages berhasil pada commit `ce025b9`.
- [ ] Pengujian upload Repository, kegagalan Spreadsheet, dan pemulihan antrean tetap harus dilakukan pada Apps Script/Drive staging dengan akun uji.

### Integritas database — penguatan konkurensi (9 November 2026)

- [x] Alokasi kode referensi operasional berbasis nomor baris dipindahkan ke dalam Script Lock, setelah pemeriksaan idempotensi kedua.
- [x] Pembuatan record bersamaan kini menjalankan pemeriksaan duplikasi, alokasi kode, dan append dalam satu critical section sehingga kode referensi tidak dihitung dari nomor baris yang sama oleh dua request paralel.
- [x] Regression test ditambahkan untuk memastikan alokasi kode berlangsung setelah lock diperoleh dan sebelum append.
- [x] Skenario DB-11 ditambahkan ke UAT untuk verifikasi dua perangkat membuat record secara bersamaan pada deployment GAS uji.
- [ ] Uji konkurensi aktual pada Google Apps Script dan Spreadsheet uji masih menunggu environment runtime.

### Sinkronisasi lintas tab (9 November 2026)

- [x] Replay antrean sinkronisasi pada browser yang mendukung Web Locks kini menggunakan exclusive lock per kombinasi user dan company.
- [x] Jika lock sedang dipakai tab lain, pemanggilan kedua tidak menjalankan replay paralel.
- [x] Browser tanpa Web Locks tetap menggunakan guard per instance dan perlindungan idempotensi/concurrency di backend.
- [x] Skenario SYNC-11 ditambahkan ke UAT.
- [ ] Uji dua tab, dua perangkat, browser tanpa Web Locks, dan respons jaringan terputus masih perlu dilakukan pada environment staging.


### Konsistensi formulir inspeksi dan dashboard (9 November 2026)

- [x] Rekonsiliasi formulir terbit memperlakukan respons cloud kosong sebagai snapshot sah; formulir yang sudah ditarik dari publikasi dihapus dari cache lokal agar tidak tetap dapat dipilih untuk inspeksi baru.
- [x] Dashboard tidak lagi crash ketika membaca data Hazard legacy yang belum memiliki objek `riskMatrix`; hazard tetap dihitung sebagai temuan aktif, tetapi tidak dihitung sebagai risiko kritis tanpa klasifikasi yang valid.
- [ ] Uji tarik-publikasi formulir pada dua sesi browser dan verifikasi bahwa formulir yang ditarik tidak dapat dipakai untuk membuat inspeksi.
- [ ] Uji Dashboard dengan data legacy/malformed dan bandingkan seluruh agregat terhadap register sumber.


### Pengamanan persetujuan PICA — 9 November 2026

- [x] Validasi persetujuan tahapan PICA diterapkan di backend GAS, bukan hanya pada kontrol frontend.
- [x] Foreman Safety dan SPV HSE hanya dapat menyetujui tahapan masing-masing setelah role diverifikasi.
- [x] Urutan Foreman Safety → SPV HSE ditegakkan di server; persetujuan yang melompati tahapan ditolak.
- [x] Satu request hanya dapat mengubah satu tahapan persetujuan; persetujuan yang sudah diberikan tidak dapat dibatalkan melalui pembaruan biasa.
- [x] Admin CGG maupun Admin Perusahaan tidak dapat membuat persetujuan operasional atas nama pejabat yang berwenang.
- [x] Regression test untuk role, urutan, perubahan serentak, dan pembatalan persetujuan lulus pada GitHub Actions commit `54a736d`.
- [ ] Deploy versi GAS terbaru ke project staging dan uji alur persetujuan menggunakan akun Foreman Safety dan SPV HSE yang terverifikasi.
- [x] Regression test tambahan untuk aturan penutupan PICA: kepemilikan PIC, tindakan koreksi, bukti, validasi HSE, tanggal penyelesaian, dan transisi status tidak sah; lulus pada commit `1530cff`.
- [x] CI dan deployment frontend GitHub Pages untuk commit `1530cff` berhasil.
- [x] UI PICA menghubungkan persetujuan Foreman Safety → SPV HSE, masing-masing hanya dapat dilakukan role terverifikasi yang sesuai.
- [x] Penutupan PICA diblokir backend sampai kedua tahap persetujuan selesai; pengembalian kepada PIC dibatasi sebelum persetujuan pertama.
- [ ] UAT persetujuan PICA dua tahap dengan akun Foreman Safety dan SPV HSE serta validasi file bukti di GAS/Drive staging.


### PICA — penyelarasan persetujuan dua tahap (9 November 2026)
- [x] Model PICA frontend dan default store hanya menggunakan tahap Foreman Safety dan SPV HSE.
- [x] Tombol validasi & close frontend hanya bergantung pada dua persetujuan tersebut; tidak lagi menunggu flag KTT.
- [x] Parser backend tetap kompatibel dengan kolom legacy `kttApproval` pada sheet, tetapi tidak memetakan nilai tersebut sebagai tahap persetujuan operasional.
- [x] Regression test memastikan UI, store, dan parser menggunakan kontrak persetujuan dua tahap.
- [ ] UAT UI PICA dengan dua akun role terverifikasi dan deploy GAS staging tetap diperlukan.


### P2H — perlindungan pengiriman ulang (9 November 2026)
- [x] Form P2H menggunakan request ID stabil selama percobaan pengiriman yang sama, dan mempertahankannya ketika respons gagal/terputus.
- [x] Backend memeriksa ID permintaan di bawah Script Lock sebelum membuat riwayat baru; replay untuk unit/perusahaan yang sama mengembalikan record tersimpan, bukan membuat duplikasi.
- [x] Pemakaian ulang ID untuk unit/perusahaan berbeda ditolak dengan konflik.
- [x] Regression test memverifikasi alur idempotensi frontend dan backend.
- [ ] Uji simulasi respons hilang setelah commit pada GAS/Spreadsheet staging, termasuk pengecekan hanya ada satu baris riwayat P2H.


### Contractor Passport — isolasi dokumen SIA (9 November 2026)
- [x] Preview dokumen SIA hanya mengirim berkas yang terbukti berada di folder Drive khusus perusahaan pemilik unit.
- [x] Penghapusan berkas SIA lama setelah penggantian hanya dilakukan jika kepemilikan folder berhasil diverifikasi; referensi file yang tidak dapat dibuktikan tidak disentuh.
- [x] Verifikasi folder gagal secara tertutup (fail closed) bila metadata Drive atau konfigurasi folder tidak tersedia.
- [x] Regression test ditambahkan untuk preview dan cleanup lintas folder perusahaan.
- [ ] UAT akses preview/penggantian SIA dengan dua tenant berbeda pada Drive staging.


### P2H — validasi konsistensi replay (9 November 2026)
- [x] Replay request ID yang sama hanya mengembalikan record lama jika seluruh payload pemeriksaan cocok, termasuk unit, tanggal, status, hour meter, operator, temuan, tindakan koreksi, dan referensi foto.
- [x] Penggunaan ulang request ID dengan payload berbeda ditolak sebagai konflik HTTP 409.
- [x] Referensi foto hasil upload dipertahankan pada percobaan ulang form yang sama agar retry tidak mengunggah foto duplikat dan tetap cocok dengan request ID.
- [ ] Uji replay dengan respons hilang, perubahan payload, serta penggantian foto di GAS/Drive staging.


### Sinkronisasi antrean — isolasi pemilik saat propagasi versi (9 November 2026)
- [x] Pembaruan `updatedAt` untuk antrean UPDATE lanjutan setelah CREATE/UPDATE berhasil kini hanya menyentuh item milik user dan companyCode pemilik transaksi.
- [x] Snapshot antrean di memori hanya diperbarui jika sesi dan queue scope masih sama setelah operasi IndexedDB selesai.
- [x] Regression test memastikan propagasi versi tidak menulis antrean lintas user/tenant.
- [ ] UAT multi-akun dan multi-tenant pada browser berbeda, termasuk simulasi perubahan sesi ketika request cloud sedang berlangsung.


### Idempotensi UPDATE untuk payload nested parsial (9 November 2026)
- [x] Replay UPDATE yang respons pertamanya hilang kini dikenali sebagai transaksi yang sudah diterapkan meskipun payload nested hanya mengirim sebagian properti.
- [x] Perbandingan tetap ketat terhadap seluruh properti yang dikirim; nilai nested yang berbeda atau properti tambahan yang tidak cocok tidak dianggap replay sukses.
- [x] Regression test mencakup nested subset yang cocok, nilai berbeda, dan payload dengan properti tambahan yang belum cocok.
- [ ] UAT GAS/Sheets untuk retry UPDATE hazard dan PICA dengan perubahan nested parsial tetap diperlukan.


### Pemulihan antrean sinkronisasi lintas-tab (9 November 2026)
- [x] Pemulihan item `SYNCING` kini menggunakan Web Locks dengan nama lock per user dan tenant; tab baru tidak mereset request aktif dari tab lain.
- [x] Setiap percobaan sinkronisasi mencatat `syncStartedAt` dan menghapus lease saat item dipulihkan.
- [x] Browser tanpa Web Locks hanya memulihkan lease yang lebih tua dari dua menit; item tanpa timestamp tidak otomatis direset agar tidak mengganggu proses aktif.
- [x] Regression test memeriksa penggunaan lock eksklusif, batas lease, dan timestamp percobaan.
- [ ] UAT multi-tab dan browser tanpa Web Locks tetap diperlukan untuk memverifikasi perilaku runtime pada browser target.


### Konsistensi versi server dan antrean offline (9 November 2026)
- [x] Setelah CREATE berhasil, versi `updatedAt` dari server untuk record lokal dan seluruh UPDATE lanjutan milik tenant yang sama disimpan melalui satu transaksi IndexedDB.
- [x] Setelah UPDATE berhasil, pembaruan versi record lokal dan payload UPDATE berikutnya juga disimpan secara atomik.
- [x] Snapshot antrean dalam memori baru diperbarui setelah transaksi IndexedDB berhasil dan identitas tenant masih cocok.
- [x] Timestamp lease sinkronisasi dibersihkan ketika request gagal dan item kembali ke PENDING/CONFLICT.
- [x] Regression test memastikan propagasi versi CREATE/UPDATE memakai transaksi bundle, bukan serangkaian write terpisah.
- [ ] UAT browser ditutup paksa saat propagasi versi berlangsung, lalu verifikasi konsistensi IndexedDB dan Google Sheets pada staging.


### Rekonsiliasi cloud — perlindungan refresh bersamaan (9 November 2026)
- [x] Setiap entitas operasional memiliki generation counter untuk refresh cloud; snapshot yang lebih lama dibatalkan ketika refresh baru dimulai.
- [x] Pemeriksaan generation dan identitas user/tenant dilakukan sebelum penghapusan cache, sebelum setiap penulisan record, dan sebelum publikasi ke workspace.
- [x] Data lokal yang masih memiliki antrean sinkronisasi tetap diprioritaskan sesuai kebijakan queue-aware merge yang sudah ada.
- [x] Regression test ditambahkan untuk memastikan snapshot yang sudah kedaluwarsa tidak memutasi cache atau dipublikasikan ke workspace.
- [ ] UAT refresh paralel pada dua tab/perangkat dengan perubahan cloud bersamaan tetap diperlukan untuk memverifikasi urutan respons dan konsistensi IndexedDB.


### Sinkronisasi — snapshot pembanding saat konflik versi (9 November 2026)
- [x] Konflik optimistic concurrency HTTP 409 pada UPDATE operasional mencoba mengambil snapshot record terbaru dari API pusat.
- [x] Snapshot server disimpan terpisah pada queue item; payload lokal tetap dipertahankan dan tidak diganti otomatis.
- [x] Pengambilan snapshot hanya diterima jika ID record cocok, sesi token masih sama, serta user dan tenant pemilik transaksi belum berubah.
- [x] Jika snapshot server gagal diambil, konflik asli dan payload lokal tetap dipertahankan.
- [x] Modul Sinkronisasi menampilkan versi server untuk dibandingkan secara eksplisit sebelum tindak lanjut manual.
- [x] Regression test ditambahkan untuk perlindungan payload lokal, validasi identitas, penyimpanan snapshot server, dan tampilan pembanding.
- [ ] UAT konflik dua pengguna pada data operasional di GAS/Sheets staging tetap diperlukan; belum ada auto-merge atau auto-overwrite.


### Sinkronisasi — pengambilan snapshot konflik terarah (9 November 2026)
- [x] Saat UPDATE ditolak dengan HTTP 409, klien meminta satu record berdasarkan ID melalui route GET detail, bukan mengunduh seluruh register entitas.
- [x] Permintaan snapshot memakai token sesi sinkronisasi yang sama; pemeriksaan identitas user, tenant, dan token tetap dilakukan setelah respons diterima.
- [x] Regression test diperbarui untuk memastikan lookup terarah digunakan.
- [x] Snapshot konflik hanya diterima jika ID pada respons detail sama persis dengan ID queue item yang ditolak; respons detail yang tidak cocok diabaikan.
- [ ] UAT konflik lintas pengguna/tenant dan pemeriksaan izin route detail tetap diperlukan pada GAS/Sheets staging.


### Manual conflict resolution with retained audit record
- Sync UI now provides an explicit JSON revision editor for UPDATE conflicts when a verified server snapshot is available.
- Draft starts from the server snapshot; local payload remains separately visible and must be manually reviewed/copied by the operator. No automatic merge is performed.
- Resolution validates current user/tenant ownership, conflict status, exact record ID, and server `updatedAt` before queueing a new UPDATE.
- Record ID, version token, and tenant ownership fields are protected from client edits and are taken from the server snapshot.
- Original conflict item is retained as `RESOLVED` with actor, timestamp, base server version, and the new queue item ID. A separate pending UPDATE is created atomically in IndexedDB.
- Follow-up UPDATE items that were automatically held behind this exact conflict are reactivated atomically without changing their local payloads. The resolved revision is ordered first; normal server-version propagation advances the follow-up updates after the revision succeeds.
- Resolved audit items are skipped by queue replay and do not block subsequent writes; server-side authorization, workflow, and optimistic concurrency checks remain authoritative.
- Regression source tests cover owner checks, protected fields, retained audit metadata, atomic queue persistence, and UI action.
- End-to-end UAT with GAS/Sheets, multi-user tenant sessions, and PICA lifecycle remains required before production sign-off.


### Sinkronisasi — resolusi konflik manual dan pemulihan antrean lanjutan (10 November 2026)
- [x] Operator dapat meninjau snapshot server dan payload lokal, lalu menyusun revisi UPDATE secara manual; sistem tidak melakukan auto-merge.
- [x] Resolusi mengikat sesi/token, pemilik user, tenant, entity, ID record, dan versi `updatedAt` dari server sebelum membuat antrean baru.
- [x] ID record, versi dasar, dan identitas tenant diproteksi menggunakan nilai dari snapshot server.
- [x] Konflik lama dipertahankan sebagai `RESOLVED` dengan identitas operator, waktu, versi dasar, dan tautan ke queue item revisi.
- [x] Queue item revisi dan status audit konflik disimpan atomik; perubahan lanjutan yang tertahan karena konflik yang sama diaktifkan kembali tanpa mengubah payload lokal.
- [x] Revisi diprioritaskan sebelum UPDATE lanjutan pada record yang sama; versi server berikutnya dipropagasikan setelah revisi berhasil.
- [x] Regression tests, typecheck, dan production build berhasil; workflow deployment untuk commit tersebut juga berhasil.
- [ ] UAT dua pengguna/tenant, perubahan beruntun offline, session expiry, dan konflik nyata pada GAS/Sheets staging masih wajib sebelum sign-off produksi.


### Otorisasi PICA frontend — penyelarasan peran approver (10 November 2026)
- [x] Helper `canApprovePICA()` hanya mengizinkan Foreman Safety atau SPV HSE yang telah diverifikasi, sesuai pemeriksaan tahapan di backend.
- [x] KTT, Project Manager, PJO, dan Admin CGG tidak memperoleh kewenangan menyetujui tahapan PICA hanya karena kewenangan pengawasan atau administrasi.
- [x] Regression test memastikan daftar peran helper frontend tetap sama dengan aturan server.
- [x] Typecheck, 115 regression tests, dan production build berhasil pada commit `dd8d3fcdc28a2637b3de3ab6213c134a6474bc03`.
- [x] Workflow deploy GitHub Pages untuk commit tersebut selesai dengan conclusion success.

### Penyelarasan otorisasi baca PICA (10 November 2026)
- [x] Daftar PICA (GET seluruh register) dan detail PICA (GET per ID) kini menggunakan cakupan pengawas yang konsisten: Admin CGG/Admin Perusahaan atau Foreman Safety/SPV HSE dengan role terverifikasi; pengguna lain hanya melihat PICA yang ditugaskan kepadanya.
- [x] KTT dan Project Manager tidak lagi memperoleh akses pengawasan lintas-register PICA hanya karena jabatannya; kewenangan persetujuan/penutupan PICA tetap mengikuti alur Foreman Safety → SPV HSE.
- [x] Regression test ditambahkan untuk memastikan aturan GET ALL dan GET ONE tetap selaras.
- [ ] Hasil workflow test setelah perubahan dan UAT dengan akun role berbeda masih harus diverifikasi sebelum sign-off.

### Konsolidasi otorisasi baca PICA (10 November 2026)
- [x] Aturan pemantau PICA dipusatkan pada helper backend `canMonitorPicas_` agar cakupan GET register dan GET detail memakai aturan yang sama.
- [x] Foreman Safety dan SPV HSE hanya memperoleh akses pemantauan jika role telah diverifikasi; Admin CGG dan Admin Perusahaan tetap mengikuti kewenangan administratif yang sudah ditetapkan.
- [x] Regression test mencakup role HSE terverifikasi/tidak terverifikasi, KTT, Project Manager, Admin Perusahaan, Admin CGG, serta pemakaian helper pada kedua route baca.
- [ ] Hasil test lokal/GitHub Actions untuk perubahan ini belum terkonfirmasi; UAT lintas role dan tenant tetap diperlukan.

### Sinkronisasi — pemisahan antrean aktif dan riwayat (10 November 2026)
- [x] Modul Sinkronisasi memisahkan jumlah operasi aktif dari item audit berstatus `RESOLVED`; riwayat resolusi tidak lagi dihitung sebagai pekerjaan yang menunggu.
- [x] Tombol sinkronisasi manual hanya aktif jika terdapat operasi yang belum berstatus `RESOLVED`.
- [x] Kegagalan pemicu sinkronisasi manual ditampilkan pada log aktivitas dan status antrean disegarkan kembali.
- [x] Regression test untuk antrean aktif/arsip dan umpan balik kegagalan sinkronisasi ditambahkan.
- [x] Typecheck frontend/backend, seluruh regression tests, validasi konfigurasi produksi, build, dan deployment GitHub Pages berhasil pada commit `7a182764`.
- [ ] Uji sinkronisasi online/offline, antrean RESOLVED, dan pemulihan konflik pada ponsel fisik serta akun staging tetap diperlukan.
