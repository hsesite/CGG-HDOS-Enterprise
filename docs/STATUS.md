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


### Penyempurnaan mobile — otorisasi navigasi dan logout (10 November 2026)
- [x] Navigasi utama dan menu modul tambahan pada workspace mobile menggunakan helper otorisasi yang sama dengan desktop.
- [x] Render isi modul mobile memeriksa ulang hak akses; tab yang tidak lagi diizinkan tidak ditampilkan.
- [x] Perubahan role/verification mengembalikan tab aktif ke Dashboard bila akses modul sebelumnya dicabut.
- [x] Tombol logout tersedia pada header workspace mobile dan menggunakan handler sesi utama aplikasi.
- [x] Regression test untuk visibilitas navigasi, render modul, perubahan role, dan integrasi logout ditambahkan.
- [x] Typecheck, seluruh regression tests, production build, dan deployment GitHub Pages berhasil pada commit `c80f5bae`.
- [ ] Uji langsung pada perangkat Android/iOS, orientasi layar, safe-area, serta pergantian akun lintas tab tetap diperlukan.


### Optimasi performa — pemuatan modul bertahap (10 November 2026)
- [x] Dua belas modul operasional dipisahkan menjadi lazy-loaded chunks untuk desktop dan mobile; modul baru diunduh saat dibuka.
- [x] Window desktop dan workspace mobile menampilkan fallback pemuatan saat chunk sedang diambil.
- [x] Parser PDF, DOCX, dan XLSX dimuat sesuai format dokumen yang diproses, bukan dibundel seluruhnya saat aplikasi pertama dibuka.
- [x] Regression test memastikan pemisahan modul dan pemuatan parser sesuai kebutuhan.
- [x] Hasil build menunjukkan bundle awal turun dari sekitar 2.018 kB menjadi sekitar 339 kB (gzip sekitar 102 kB); parser PDF/XLSX dan DOCX berada di chunk terpisah.
- [x] 163 regression tests, typecheck frontend/backend, build, konfigurasi produksi, dan deployment GitHub Pages berhasil pada commit `b77232eb`.
- [ ] Pengukuran waktu muat nyata pada jaringan seluler dan perangkat Android/iOS tetap menjadi bagian UAT lapangan.


### Sinkronisasi — replay antrean memakai versi terbaru (10 November 2026)
- [x] Urutan replay tetap ditentukan oleh ID antrean yang diurutkan berdasarkan waktu dan dependensi record.
- [x] Sebelum setiap operasi dikirim, engine mengambil ulang item dari snapshot antrean terbaru; pembaruan updatedAt hasil CREATE/UPDATE sebelumnya langsung dipakai oleh UPDATE lanjutan dalam batch yang sama.
- [x] Mencegah UPDATE offline beruntun memproses referensi objek antrean yang sudah kedaluwarsa dan memicu konflik versi 409 yang dibuat oleh sinkronisasi sendiri.
- [x] Regression test ditambahkan untuk memastikan replay memakai item terbaru dan aturan antrean tetap konsisten.
- [x] 168 regression tests, typecheck frontend/backend, dan production build berhasil pada commit e6245274114d55b043740be80c22899dc13235fd.
- [ ] UAT rangkaian CREATE → beberapa UPDATE offline pada satu record, termasuk respons cloud terlambat/hilang, tetap diperlukan pada GAS/Sheets staging.


### Mobile — akses kamera bukti lapangan (10 November 2026)
- [x] Input foto pada Inspection dan Hazard menggunakan preferensi kamera belakang perangkat mobile melalui atribut capture environment.
- [x] Validasi format JPG/PNG/WEBP dan batas ukuran 5 MB tetap diberlakukan.
- [x] Regression test mencakup kedua modul dan validasi ukuran foto.
- [x] 169 regression tests, typecheck frontend/backend, dan production build berhasil pada commit 1faaf4ecd8e0366355506e4f9446e2ee63ec33c1.
- [ ] Perilaku pemanggilan kamera perlu dikonfirmasi pada perangkat Android/iOS nyata; browser dapat tetap menampilkan pilihan kamera/galeri sesuai implementasi perangkat.


### Penyimpanan foto operasional — retry unggah idempoten (10 November 2026)
- [x] Endpoint `/api/photos` menerima `uploadKey` unik yang tervalidasi dan menandai file Drive dengan kunci tersebut.
- [x] Jika permintaan unggah diulang dengan kunci yang sama, backend mencari dan mengembalikan file foto yang sudah tersimpan, alih-alih membuat salinan baru.
- [x] Modul Inspection, Hazard, PICA, dan P2H telah diselaraskan untuk mengirim `uploadKey`.
- [x] Regression test, typecheck frontend/backend, dan production build berhasil pada commit `0b1aeb05e14aa1ceeea1892d2702c928e6142629`.
- [ ] Kunci saat ini dibuat per aksi unggah; persistensi kunci yang sama lintas percobaan ulang pengguna dan alur foto offline masih perlu diselesaikan.
- [ ] Deployment frontend masih menunggu konfirmasi workflow; perubahan Apps Script tetap memerlukan deployment GAS versi terbaru dan uji unggah nyata.


### Offline-first — foto bukti Inspection dan Hazard (10 November 2026)
- [x] Foto Inspection/Hazard disimpan sebagai Blob di IndexedDB sebelum record dan antrean CREATE dibuat; laporan tidak lagi menunggu unggah Drive saat form disubmit.
- [x] Sync engine mengunggah foto ketika koneksi tersedia, menggunakan uploadKey stabil dari ID foto agar retry setelah respons hilang memakai berkas Drive yang sama.
- [x] Referensi foto Drive disimpan pada antrean dan record lokal sebelum CREATE cloud; pointer lokal tidak dikirim ke API. Foto lokal dihapus hanya setelah CREATE berhasil.
- [x] Pemeriksaan pemilik akun/perusahaan mencegah foto tenant atau akun lain ikut tersinkronisasi.
- [x] Backup mengenkode Blob, restore mendekode kembali, dan foto dibatasi ke akun pembuat yang sama. IndexedDB diwajibkan untuk mencegah fallback localStorage merusak data binary.
- [x] Regression coverage ditambahkan untuk penyimpanan lokal, upload queue replay, idempotensi dan cakupan backup.
- [ ] Uji end-to-end pada perangkat nyata masih diperlukan: buat laporan offline, tutup browser/app, buka kembali, online-kan perangkat, verifikasi satu file Drive dan satu record cloud.
- [ ] Deploy GAS versi terbaru dan uji kapasitas/quota IndexedDB serta restore backup foto pada Android/iOS staging masih pending.

### Backup database — verifikasi kesetaraan struktur salinan (10 November 2026)
- [x] Backup Google Drive memvalidasi seluruh sheet dan skema kanonis sebelum dicatat berhasil.
- [x] Backup membandingkan jumlah baris, jumlah kolom, dan header seluruh sheet wajib terhadap database sumber; salinan yang berbeda tidak dinyatakan valid.
- [x] Salinan pemulihan non-destruktif dibandingkan kembali dengan backup asal sebelum status `RECOVERY_COPY_VERIFIED` dicatat.
- [x] Kegagalan verifikasi menyebabkan salinan pemulihan dibersihkan; database aktif tidak diubah.
- [x] Regression test mencakup perbedaan jumlah baris dan header.
- [x] 185 regression tests, typecheck, dan production build berhasil pada commit `c4606580930a10ce8b7b0d987754aac14746ac4b`; deployment GitHub Pages berhasil.
- [ ] Uji restore aktual dari file backup pada project Apps Script nonproduksi tetap diperlukan. Pemeriksaan ini memvalidasi struktur/dimensi, bukan checksum seluruh isi sel.
- [ ] Deployment perubahan Apps Script ke project GAS aktif dan uji Drive/Spreadsheet masih merupakan langkah terpisah dari deployment GitHub Pages.

### Backup lokal — validasi metadata dan identitas record arsip (10 November 2026)
- [x] Restore memvalidasi kelengkapan metadata pemilik arsip, timestamp pembuatan, dan format checksum SHA-256 sebelum memproses record.
- [x] Nama store yang tidak dikenal ditolak; arsip tidak dapat menyisipkan modul penyimpanan di luar daftar store HDOS.
- [x] ID record duplikat dalam satu modul ditolak agar tidak terjadi penimpaan diam-diam saat rekonsiliasi.
- [x] Restore tetap merge-only dan multi-store write tetap atomik pada IndexedDB.
- [x] 188 regression tests, typecheck frontend/backend, dan production build berhasil pada commit `620c389a3ab4b4660f50b2d1f249c564ebe1e9eb`.
- [ ] Uji restore aktual dengan arsip foto/Blob, file rusak, dan data tenant berbeda pada perangkat serta GAS staging masih diperlukan.
- [ ] Deployment GitHub Pages untuk commit ini masih menunggu workflow; perubahan GAS tidak termasuk dalam deployment frontend.

### Sinkronisasi — penghapusan bukti lokal dan acknowledgement antrean atomik (10 November 2026)
- [x] Setelah operasi cloud berhasil, penghapusan queue item dan Blob bukti lokal dilakukan dalam satu transaksi multi-store IndexedDB.
- [x] Browser yang tertutup paksa atau kegagalan transaksi tidak lagi meninggalkan kondisi setengah bersih antara antrean dan berkas bukti lokal.
- [x] Pemulihan akibat gangguan internal menghapus `syncStartedAt` saat item dikembalikan ke status `PENDING`.
- [x] Regression tests ditambahkan untuk transaksi cleanup atomik dan pelepasan lease sinkronisasi.
- [ ] UAT crash/reload tepat setelah respons cloud diterima tetap diperlukan pada browser/perangkat nyata dan GAS/Sheets staging.
- [x] 191 regression tests, typecheck frontend/backend, production build, dan deployment GitHub Pages berhasil pada commit `47bb4daa819395262a6088362afa6cd6c867740b`.

### Backend — idempotensi CREATE dengan pemeriksaan kesamaan payload (10 November 2026)
- [x] Retry CREATE dengan ID dan payload yang sama mengembalikan record yang telah tersimpan tanpa membuat duplikat.
- [x] Penggunaan ulang ID yang sama dengan payload berbeda ditolak sebagai HTTP 409 agar perubahan data tidak hilang diam-diam.
- [x] Objek nested dibandingkan secara kanonis tanpa terpengaruh urutan key JSON; pemeriksaan diulang di dalam Script Lock untuk menutup race antarperangkat.
- [x] Jalur upload Repository tetap memakai pemeriksaan ID/tenant yang sudah ada dan tidak ikut menerima payload operasional.
- [x] 192 regression tests, typecheck frontend/backend, dan production build berhasil; deployment GitHub Pages berhasil pada commit `154dff3cfa798fb7f2ddfbd964fbf7bfd50ff31d`.
- [ ] Perubahan `gas/Code.gs` harus dideploy ke project Apps Script staging/aktif secara terpisah, lalu diuji retry CREATE dengan respons hilang dan payload berbeda pada Spreadsheet nonproduksi.

### Backup lokal — isolasi tenant Contractor dan Subkon (10 November 2026)
- [x] Pencocokan backup mengikuti cakupan store lokal: Subkon hanya mengekspor record milik perusahaan sendiri.
- [x] Relasi parent tidak lagi dipakai sebagai izin tambahan bagi Subkon untuk mengambil record milik kontraktor induk atau sibling Subkon.
- [x] Contractor root tetap dapat mengekspor record sendiri dan record Subkon yang terhubung melalui relasi parent.
- [x] Record global tanpa metadata tenant tetap dipertahankan untuk kebutuhan master yang memang tidak memiliki pemilik perusahaan.
- [x] Regression suite: 194 tests lulus, 0 gagal; typecheck frontend/backend dan production build berhasil pada commit `e63c8fa921f468fd4d0539c42e9a379d8f52c49c`.
- [ ] Uji backup/restore menggunakan akun Contractor dan dua akun Subkon sibling pada Spreadsheet staging tetap diperlukan untuk mengonfirmasi cakupan data aktual.

### Sinkronisasi offline — klaim antrean atomik lintas-tab (10 November 2026)
- [x] Queue item hanya dapat diklaim jika masih `PENDING` dan identitas user/tenant cocok; pembacaan status dan perubahan menjadi `SYNCING` berlangsung dalam satu transaksi readwrite IndexedDB.
- [x] Browser yang memiliki IndexedDB tetapi tidak mendukung Web Locks tetap mencegah dua tab memproses queue item yang sama secara bersamaan.
- [x] Jika klaim gagal karena tab lain telah mengambil item, tab pemanggil membaca ulang status terbaru dan melewati item tersebut.
- [x] Pemulihan setelah error engine hanya melepas lease yang benar-benar diklaim oleh proses sinkronisasi tersebut dan timestamp lease masih sama; lease tab lain tidak ikut direset.
- [x] Regression suite: 195 tests lulus, 0 gagal; typecheck frontend/backend dan production build berhasil. Deployment GitHub Pages berhasil pada commit `5200e735232a5f0f4ad0fed4ef607bae8143670a`.
- [ ] UAT multi-tab pada browser Android/iOS, browser tanpa Web Locks, dan jaringan terputus ketika request sedang berlangsung tetap diperlukan.

### Mobile PWA — instalasi dan pembukaan ulang app shell offline (10 November 2026)
- [x] Manifest PWA menetapkan nama HDOS, scope relatif GitHub Pages, tampilan standalone, tema, dan ikon aplikasi.
- [x] Metadata HTML mendukung instalasi layar utama Android dan iOS.
- [x] Service worker mendaftarkan dirinya relatif terhadap `BASE_URL`, sehingga tidak mengasumsikan hosting pada domain root.
- [x] App shell, entry JS/CSS, manifest, dan ikon dicache; navigasi memakai network-first dengan fallback ke app shell lokal.
- [x] Hanya GET same-origin dalam scope aplikasi yang ditangani; request API lintas origin dan operasi non-GET tidak dicache.
- [x] Panduan instalasi Android/iOS dan batas kemampuan offline ditambahkan ke README.
- [x] 201 regression tests lulus, 0 gagal; typecheck frontend/backend dan production build berhasil pada commit `a822d35dcc8c415111ba52fe954c85d69a370ada`.
- [ ] Uji instalasi, pembukaan ulang offline, update service worker, dan ikon pada perangkat Android/iOS nyata tetap diperlukan.

### PWA offline — precache seluruh modul lazy-loaded (10 November 2026)
- [x] Build Vite menghasilkan `manifest.json` pada root hasil build agar daftar aset produksi dapat diakses melalui GitHub Pages tanpa bergantung pada direktori tersembunyi.
- [x] Service worker membaca manifest build dan melakukan precache terhadap seluruh entry JS, CSS, serta aset yang dirujuk, termasuk chunk modul operasional yang belum pernah dibuka.
- [x] Jika manifest build tidak tersedia, worker tetap memiliki fallback untuk aset entry yang tertaut dari HTML.
- [x] Regression suite: 202 tests lulus, 0 gagal; typecheck frontend/backend dan production build berhasil pada commit `5ad88375b02f3b7003322f0958ed00bd5c42a692`.
- [ ] Verifikasi ukuran cache, penggunaan storage, pembukaan setiap modul saat offline, dan update antarversi pada Android/iOS nyata masih diperlukan.

### Batas autentikasi offline PWA (10 November 2026)
- [x] Boot aplikasi mempertahankan profil lokal saat token sesi masih tersedia tetapi verifikasi server gagal karena gangguan jaringan.
- [x] Jika token sesi tidak ada atau server mengembalikan 401, profil lokal tidak dipakai untuk membuka data tenant; login ulang tetap diwajibkan.
- [x] README menjelaskan bahwa PWA meng-cache shell/aset, bukan API atau autentikasi, dan ketersediaan sesi setelah aplikasi ditutup bergantung pada penyimpanan sesi browser.
- [ ] UAT pembukaan ulang offline setelah menutup penuh PWA pada Android/iOS perlu memastikan perilaku sessionStorage pada browser target; akses offline lintas sesi belum dijanjikan.

### PWA — migrasi cache aplikasi (10 November 2026)
- [x] Cache shell diberi versi baru agar service worker dapat membersihkan cache HDOS versi sebelumnya ketika aktivasi.
- [x] Regression test memverifikasi versi cache dan pembersihan cache lama.
- [x] 203 regression tests lulus, 0 gagal; typecheck frontend/backend dan production build berhasil pada commit `261b1d0081e235d1be1715163e80d4c95d278460`.
- [ ] Pemeriksaan storage quota dan update cache pada perangkat fisik tetap bagian dari UAT.

### Backup enterprise — cakupan Admin CGG dan isolasi bukti lokal (10 November 2026)
- [x] Backup Admin CGG mencakup seluruh tenant yang dapat diakses oleh akun pengelola pusat, bukan hanya record berkode CGG.
- [x] Backup Admin CGG ditolak saat dipulihkan oleh akun non-Admin CGG; identitas Admin CGG juga harus konsisten dengan companyCode CGG.
- [x] Queue dan Blob lampiran tetap dibatasi pada user serta tenant yang membuatnya, termasuk ketika backup dilakukan Admin CGG.
- [x] Arsip versi lama tanpa metadata `isAdminCGG` tetap dapat dibaca sebagai arsip dengan cakupan tenant biasa.
- [x] 204 regression tests lulus, 0 gagal; typecheck frontend/backend dan production build berhasil pada commit `14c8071b11f17a4f054cfdb33c1a104668fa505d`.
- [ ] UAT backup Admin CGG lintas Contractor/Subkon dan restore pada perangkat staging tetap diperlukan.

### PWA — lokasi manifest build kompatibel GitHub Pages (10 November 2026)
- [x] Manifest aset Vite ditempatkan pada `dist/manifest.json`, bukan direktori tersembunyi, agar dapat diambil oleh service worker setelah deployment GitHub Pages.
- [x] Service worker mengambil manifest dari path relatif terhadap scope aplikasi; seluruh aset tetap dibatasi pada origin dan scope HDOS.
- [x] 204 regression tests lulus, 0 gagal; typecheck frontend/backend dan production build berhasil pada commit `5e5bbe3ed97652717d9a1da01bdf9db30e74bd4c`.
- [ ] Verifikasi manifest dan precache pada URL GitHub Pages aktif serta perangkat fisik masih diperlukan setelah deployment terbaru.

### CI — verifikasi artefak PWA hasil build sebelum deployment (10 November 2026)
- [x] Script `scripts/validate-pwa-build.mjs` memeriksa app shell, manifest, service worker, ikon, entry JavaScript, dan seluruh file yang direferensikan manifest Vite.
- [x] Validasi PWA dijalankan pada workflow CI dan workflow deployment sebelum artefak diunggah ke GitHub Pages.
- [x] Build terakhir memvalidasi 5 file shell dan 33 aset manifest; 205 regression tests lulus, 0 gagal; typecheck frontend/backend dan production build berhasil pada commit `a570f6447af5bf04175574641b14afeeae2657ee`.
- [ ] Uji instalasi PWA dan pembukaan ulang offline pada perangkat Android/iOS fisik tetap diperlukan.


### Backend — fingerprint CREATE tetap stabil setelah UPDATE (10 November 2026)
- [x] Record operasional baru menyimpan fingerprint SHA-256 dari payload CREATE asli sebagai metadata internal.
- [x] Retry CREATE dengan ID dan payload awal yang sama tetap dikenali sebagai replay sah meskipun record telah berubah melalui UPDATE setelah CREATE pertama berhasil.
- [x] Retry dengan ID sama tetapi payload awal berbeda tetap ditolak HTTP 409; fingerprint tidak berubah ketika field operasional diperbarui.
- [x] Record lama tanpa fingerprint tetap memakai pemeriksaan kesamaan field untuk menjaga kompatibilitas arsip/data yang sudah ada.
- [x] 206 regression tests lulus, 0 gagal; typecheck frontend/backend, production build, dan validasi artefak PWA berhasil pada commit `536d8e6a4cd3c7ed4d19add0add2409c45df0e11`.
- [ ] Karena perubahan berada di `gas/Code.gs`, deploy ke Apps Script staging tetap terpisah dari GitHub Pages dan wajib diuji dengan skenario respons CREATE hilang, UPDATE sesudahnya, lalu retry CREATE.


### Backend — metadata idempotensi CREATE dilindungi dari UPDATE klien (10 November 2026)
- [x] Fingerprint SHA-256 CREATE tersimpan di kolom JSON payload kanonis Spreadsheet sehingga tetap terbaca walaupun tidak menjadi kolom sheet terpisah.
- [x] UPDATE mempertahankan fingerprint yang dibaca dari record lama dan mengabaikan nilai fingerprint yang mungkin dikirim klien.
- [x] Regression test melakukan round-trip build row → parse row untuk membuktikan fingerprint tetap tersimpan, serta memeriksa perlindungan metadata pada jalur UPDATE.
- [x] 208 regression tests lulus, 0 gagal; typecheck frontend/backend, production build, dan validasi artefak PWA berhasil pada commit `b00056b2bb07718254d33a2de64aa9de29bedcae`.
- [ ] Skenario retry CREATE setelah UPDATE perlu tetap dijalankan pada Spreadsheet staging ketika integrasi GAS dimulai.


### PWA — fallback aset ketika offline (10 November 2026)
- [x] Request aset same-origin yang tidak ada di cache dan gagal di jaringan sekarang mengembalikan respons HTTP 503 dengan pesan koneksi yang jelas, bukan hasil kosong yang dapat memicu kegagalan Service Worker.
- [x] Regression test memastikan fallback offline eksplisit.
- [x] 209 regression tests lulus, 0 gagal; typecheck frontend/backend, production build, dan validasi artefak PWA berhasil pada commit `2b6283d0cdd8a566d4459ee69f9c6751d85fc01c`.
- [ ] Pembukaan semua modul saat offline tetap harus diuji pada perangkat Android/iOS fisik; precache berhasil pada build tidak membuktikan setiap browser menyimpan seluruh aset di kondisi storage nyata.


### AI Assist, Inspection GPS, GIS, dan batas tenant Dashboard (10 November 2026)
- [x] AI Photo Scanner dan Document Parser diberi penandaan eksplisit sebagai simulasi/contoh statis; hasil simulasi tidak dapat diterbitkan sebagai Hazard operasional.
- [x] Arahan AI terkait PICA diselaraskan dengan alur Foreman Safety → SPV HSE; saran terkait lereng tidak lagi menyajikan angka Faktor Keamanan generik sebagai pengganti kajian geoteknik.
- [x] Form Inspection lama tidak lagi mengirim koordinat GPS contoh tetap; koordinat hanya dicatat jika perangkat berhasil memberikan lokasi aktual.
- [x] Master GIS menolak koordinat kosong/null yang sebelumnya dapat terkonversi menjadi angka nol saat rendering peta.
- [x] Dashboard Owner CGG mensyaratkan identitas tenant CGG sekaligus role Admin CGG sebelum mengaktifkan agregasi lintas perusahaan.
- [x] Regression suite terakhir yang selesai: 215 tes lulus, 0 gagal; typecheck frontend/backend, production build, dan validasi 5 file shell + 33 aset PWA berhasil pada commit `9e752a1a5d0baa5a86df4279f1b87093c34e60ce`.
- [ ] Integrasi AI vision/parser aktual belum tersedia; fitur tersebut tetap simulasi dan tidak boleh dipakai sebagai bukti inspeksi atau dasar keputusan risiko.
- [ ] Verifikasi GPS, koordinat GIS terhadap master survey, dan batas dashboard seluruh role/tenant tetap harus masuk UAT.


### Penguatan otorisasi penutupan PICA (10 November 2026)

- Penutupan PICA dibatasi pada akun SPV HSE dengan role terverifikasi.
- Validasi akhir mensyaratkan status `WAITING_HSE` serta persetujuan berurutan Foreman Safety dan SPV HSE.
- Foreman Safety tetap menjadi pemberi persetujuan tahap pertama, bukan pejabat penutup.
- Tidak ada tahap persetujuan KTT pada alur PICA.
- Pengamanan diterapkan pada UI dan lapisan store agar pemanggilan langsung tidak melewati pembatasan.
- Regression suite: 217 tes lulus, 0 gagal pada commit `20592561b95255bf54333a4ca55b19cc67cdb5a9`; typecheck, production build, dan validasi aset PWA berhasil.
- UAT lintas role dan tenant serta verifikasi sinkronisasi terhadap Apps Script aktif tetap wajib dilakukan sebelum distribusi produksi.

### Incident report — perlindungan double-submit dan reset form (11 November 2026)
- [x] Form laporan insiden memakai guard berbasis ref untuk mencegah dua event submit dalam satu proses berjalan menghasilkan dua record.
- [x] Field laporan baru dibersihkan hanya setelah record berhasil masuk ke antrean offline; ketika penyimpanan gagal, isi form tetap tersedia agar pelapor dapat mencoba kembali.
- [x] Status busy dan guard selalu dilepas pada blok `finally`, termasuk ketika penyimpanan gagal.
- [x] Regression test ditambahkan untuk mengunci perilaku double-submit dan reset setelah sukses.
- [ ] UAT pada perangkat Android/iOS perlu memeriksa submit berulang, kondisi offline, dan pemulihan setelah aplikasi dibuka ulang.


### Penguatan submit operasional (11 November 2026)

- [x] Form pelaporan Hazard memakai synchronous ref lock untuk mencegah double-submit selama foto dan record disimpan ke IndexedDB/queue; lock selalu dilepas pada blok `finally`.
- [x] Form inspeksi berbasis Repository memakai synchronous ref lock yang sama agar klik berulang tidak membuat lebih dari satu record selama proses penyimpanan.
- [x] Regression test mencakup kedua lifecycle submit; validasi CI tetap menjadi bukti otomatis, sedangkan uji perangkat nyata dan sinkronisasi GAS tetap menunggu UAT.

- [x] Penyelarasan otorisasi PICA: backend kini hanya mengizinkan SPV HSE terverifikasi melakukan penutupan akhir setelah approval Foreman Safety dan SPV HSE lengkap. Foreman Safety tetap dapat memberi approval tahap pertama dan mengembalikan PICA sebelum approval dimulai.

## Penguatan idempotensi unggah foto operasional (11 November 2026)

- [x] Proses pencarian dan pembuatan file bukti foto pada Google Drive diserialisasi dengan Script Lock agar retry bersamaan tidak membuat file duplikat.
- [x] Nama objek cloud diturunkan dari upload key yang stabil, bukan nama file dari perangkat.
- [x] Metadata idempotensi mengikat upload key pada identitas akun pemilik dan SHA-256 isi foto; penggunaan ulang key dengan pemilik atau isi berbeda ditolak.
- [x] Retry dapat menemukan dan memulihkan file yang sudah dibuat sebelum proses penulisan metadata atau respons sebelumnya terputus.
- [x] Regression test memeriksa urutan lock, pencarian, validasi hash, penolakan konflik key, dan pelepasan lock.
- [x] CI validation dan deployment GitHub Pages untuk commit `4159a679b1b93fbba4c5de9c8efb8d69940636d1` berakhir dengan success.
- [ ] Perubahan backend GAS masih memerlukan deployment ke project Apps Script aktif serta uji unggah/retry bersamaan pada folder Drive per perusahaan; keberhasilan GitHub Pages tidak membuktikan deployment GAS.


## Penguatan pengiriman P2H Contractor (11 November 2026)

- [x] Submit P2H memakai synchronous ref lock untuk menahan double-submit sebelum React menyelesaikan render.
- [x] Request ID idempotensi disimpan ke draft lokal sebelum antrean dibuat, sehingga percobaan ulang setelah gangguan penyimpanan menggunakan ID yang sama.
- [x] Draft dan bukti foto tetap terikat pada pemilik akun/perusahaan; backend tetap memverifikasi request ID terhadap isi permintaan dan mengembalikan konflik jika payload berubah.
- [ ] Uji offline → online dan retry setelah respons server hilang pada perangkat nyata serta deployment GAS aktif.


## Penguatan dokumen SIA Contractor (11 November 2026)

- [x] Folder SIA memvalidasi nama folder dan marker tenant dari Script Properties sebelum menerima dokumen.
- [x] Kunci unggah SIA diikat pada fleet, perusahaan, dan SHA-256 isi dokumen.
- [x] Retry dengan file identik memakai kembali file Drive yang sudah ada; penggunaan kunci yang sama untuk isi atau tipe berbeda ditolak.
- [x] Marker lama dari unggahan sebelumnya dapat diverifikasi berdasarkan hash dan dinaikkan ke format marker baru.
- [ ] Uji preview, penggantian dokumen, rollback, dan pemulihan SIA pada deployment GAS aktif.


### Contractor Fleet — validasi kelayakan SIA pada P2H (11 November 2026)

- [x] Backend memvalidasi unit aktif, lampiran dokumen SIA, tanggal kalender SIA, dan masa berlaku SIA terhadap tanggal pemeriksaan P2H sebelum menerima hasil **READY / Laik operasi**.
- [x] Masa berlaku dihitung inklusif pada tanggal kedaluwarsa yang tercetak; perbandingan menggunakan format tanggal ISO sehingga tidak bergeser akibat zona waktu browser.
- [x] Hasil **NOT_READY / Tidak laik operasi** tetap dapat dicatat meskipun SIA tidak lengkap/kedaluwarsa agar temuan keselamatan dan tindakan pengendalian tetap terdokumentasi.
- [x] Form P2H menonaktifkan pilihan Laik operasi dan menampilkan alasan persyaratan ketika SIA belum memenuhi syarat; backend tetap menjadi validasi final.
- [ ] Validasi dokumen fisik terhadap nomor SIA/jenis alat dan uji P2H pada Spreadsheet + Drive Apps Script staging masih diperlukan.

### Integrasi status kesiapan backend GAS pada workspace sinkronisasi (11 November 2026)

- [x] Frontend memeriksa endpoint read-only `/api/health/ready` melalui transport GAS yang sama dengan API operasional.
- [x] Workspace sinkronisasi memisahkan status jaringan perangkat dari kesiapan backend Spreadsheet; perangkat Online tidak lagi menjadi indikasi bahwa backend sudah siap.
- [x] Status menampilkan hasil akses Spreadsheet, kelengkapan schema, konfigurasi Google OAuth, dan kebijakan registrasi email CGG; kegagalan pemeriksaan ditampilkan sebagai unavailable/not ready.
- [x] Catatan UI menegaskan bahwa status READY bukan pengganti UAT login, CRUD, Drive, isolasi tenant, backup, dan sinkronisasi.
- [x] Regression test ditambahkan untuk kontrak endpoint dan tampilan status kesiapan.
- [ ] Verifikasi pada deployment GAS aktif dan build frontend produksi tetap diperlukan; hasil health check belum membuktikan seluruh alur operasional.

### Ketahanan replay setelah cloud commit (11 November 2026)

- [x] Engine menandai operasi ketika GAS sudah mengonfirmasi mutasi cloud berhasil (CREATE, UPDATE, DELETE, P2H, laporan kepatuhan, dan upload SIA).
- [x] Jika penulisan versi lokal, penghapusan antrean, atau cleanup bukti lokal gagal setelah cloud commit, item dikembalikan ke jalur retry sementara selama batas percobaan belum tercapai; tidak langsung dikunci sebagai konflik permanen.
- [x] Payload antrean dipertahankan untuk replay. Perlindungan idempotensi backend tetap menjadi syarat agar pengulangan setelah respons/ack lokal gagal tidak membuat record ganda.
- [x] Regression test ditambahkan untuk memastikan status retryable mengikuti cloud commit yang sudah terkonfirmasi.
- [ ] Uji fault-injection pada browser dan GAS staging: cloud commit sukses lalu IndexedDB gagal saat propagasi versi/acknowledgement; pastikan hanya satu record cloud dan antrean lokal akhirnya bersih.

## Implementasi terbaru (11 November 2026) — backup dan pemulihan perangkat

- [x] Backup lokal mengambil snapshot seluruh store non-config dari satu transaksi baca IndexedDB.
- [x] Data Blob dan ArrayBuffer, termasuk foto operasional dan dokumen SIA offline, diserialisasi dengan metadata MIME dan dipulihkan sebagai binary.
- [x] Backup memeriksa SHA-256, versi format, nama store, ID duplikat, batas ukuran, dan validitas metadata lampiran.
- [x] Backup dan restore dibatasi pada identitas akun serta cakupan perusahaan; restore menolak backup dari akun pengguna berbeda walaupun tenant sama.
- [x] Restore bersifat add-only: ID lokal yang sudah ada tidak ditimpa; pemeriksaan ID dan penyisipan dilakukan atomik lintas-store pada IndexedDB.
- [x] Antrean yang tertinggal pada status `SYNCING` dikembalikan ke `PENDING` saat dibuat/dipulihkan dari backup.
- [ ] Uji fault-injection pemulihan ketika transaksi IndexedDB gagal, storage quota habis, browser ditutup, dan backup berisi lampiran besar.
- [ ] Uji backup/restore lintas perangkat dengan akun yang sama serta penolakan akun berbeda pada browser/perangkat nyata.
- [ ] Uji bahwa foto dan dokumen SIA hasil restore dapat diunggah ulang dan direferensikan oleh record operasional setelah sinkronisasi.
- [ ] Verifikasi perilaku pemulihan saat beberapa tab aktif dan saat sesi akun berganti di perangkat yang sama.
