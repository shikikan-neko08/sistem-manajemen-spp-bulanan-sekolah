# SIP-SPP SMA — Sistem Informasi Pendataan SPP Sekolah

Aplikasi web administrasi keuangan sekolah (tingkat SMA) untuk pengelolaan data siswa, tarif SPP per kelas, beasiswa/diskon, penagihan bulanan otomatis dan manual, pembayaran cicilan maupun multi-bulan, pencetakan kwitansi PDF, pemantauan tunggakan, serta laporan pemasukan yang dapat diekspor ke Excel dan PDF.

Antarmuka dibuat dalam **Bahasa Indonesia** dan dirancang responsif agar nyaman digunakan di komputer tata usaha maupun perangkat seluler (HP).

---

## Fitur Utama

1. **Autentikasi & Hak Akses 3 Peran (RBAC)**
   - Mendukung masuk menggunakan **Akun Google** serta **Email & Kata Sandi** (termasuk pendaftaran akun baru dengan verifikasi email dan fitur lupa kata sandi).
   - **Admin:** Akses penuh seluruh modul (data master, tarif, siswa, tagihan, pembayaran, pembatalan, laporan, log aktivitas, manajemen peran pengguna, serta pengalih *Pratinjau Peran*).
   - **Petugas / Bendahara:** Generate dan tambah tagihan, input pembayaran, batalkan transaksi beralasan, cetak/unduh kwitansi, lihat daftar tunggakan dan laporan.
   - **Kepala Sekolah:** Akses baca (*read-only*) untuk memantau Dashboard, Daftar Tunggakan, Laporan Keuangan, dan Log Aktivitas.

2. **Data Master & Seeder (±204 Siswa)**
   - Pengelolaan **Siswa** (NIS unik, nama, kelas, status aktif/lulus/pindah/nonaktif, nomor HP orang tua, serta diskon/beasiswa dalam nominal Rupiah atau persentase).
   - Pengelolaan **Kelas & Tahun Ajaran**, **Tarif SPP per Kelas**, **Profil Sekolah** (untuk kop kwitansi dan laporan), serta **Undangan Peran Pengguna**.
   - Dilengkapi tombol **Isi Data Contoh (204 Siswa)** untuk menghasilkan 6 kelas (`X IPA 1` s.d. `XII IPS 1`), tarif SPP, 204 siswa, tagihan 3 bulan terakhir, dan sampel transaksi pembayaran.

3. **Tagihan Bulanan (Otomatis & Manual Anti-Duplikat)**
   - Pemeriksaan dan pembuatan tagihan otomatis setiap awal bulan untuk seluruh siswa aktif saat Admin/Petugas membuka aplikasi.
   - Tersedia tombol **Generate Massal** serta **Tambah Tagihan** per siswa secara manual.
   - Menggunakan ID deterministik (`{siswaId}_{tahun}_{bulan}`) untuk mencegah terjadinya tagihan ganda.

4. **Pembayaran (Tunai/Transfer, Cicilan, Multi-Bulan, Pembatalan Beralasan)**
   - Mendukung pembayaran **Tunai** maupun **Transfer Bank**.
   - Mendukung pembayaran **sebagian (cicilan)** serta pembayaran **beberapa bulan sekaligus** dalam satu transaksi.
   - Status tagihan otomatis diperbarui menjadi `Belum Bayar`, `Sebagian`, atau `Lunas`.
   - Transaksi pembayaran yang sudah dicatat **tidak dapat dihapus**; koreksi hanya dilakukan lewat fitur **Batalkan** dengan alasan wajib (minimal 5 karakter) yang otomatis mengembalikan sisa tagihan dan tercatat di audit log.

5. **Kwitansi Resmi (Cetak & Unduh PDF)**
   - Nomor kwitansi unik otomatis (`KWT-YYYYMMDD-...`).
   - Memuat kop sekolah, identitas siswa, rincian bulan yang dibayar, metode pembayaran, tanggal, status (`Sah` / `Dibatalkan`), dan nama petugas.
   - Dapat langsung dicetak lewat browser atau diunduh sebagai file `.pdf`.

6. **Daftar Tunggakan & Laporan Keuangan (Ekspor Excel & PDF)**
   - **Daftar Tunggakan:** Filter per kelas, bulan, tahun, dan pencarian NIS/nama, lengkap dengan total tunggakan serta tombol cepat **Bayar**.
   - **Laporan Keuangan:** Rekap **Harian**, **Bulanan**, dan **Per Kelas** (hanya menghitung transaksi berstatus `Sah`), dilengkapi ekspor **Excel (`.xlsx`)** dan **PDF**.

7. **Dashboard & Log Aktivitas**
   - Ringkasan total pemasukan bulan berjalan, jumlah siswa lunas vs menunggak, total tunggakan aktif, grafik pemasukan per bulan, dan rincian tunggakan per kelas.
   - **Log Aktivitas:** Catatan audit *append-only* untuk setiap penambahan, perubahan, penghapusan, generate tagihan, dan pembatalan transaksi.

---

## Teknologi yang Digunakan

- **Frontend:** React 19, TypeScript, Vite 8, Tailwind CSS v4, Lucide React
- **Backend & Database:** Firebase Authentication & Cloud Firestore
- **Ekspor Dokumen:** `jspdf` & `jspdf-autotable` (PDF), `xlsx` (Excel)
- **Keamanan Firestore:** `firestore.rules` tervalidasi dengan `@firebase/eslint-plugin-security-rules`

---

## Struktur Proyek

```text
/
├── firebase-blueprint.json        # Skema entitas & koleksi Firestore
├── firestore.rules                # Aturan keamanan RBAC & validasi payload Firestore
├── security_spec.md               # Spesifikasi keamanan dan skenario uji aturan
├── eslint.config.js               # Konfigurasi ESLint untuk security rules
├── index.html                     # Entry HTML & font (Plus Jakarta Sans, JetBrains Mono)
├── package.json
└── src/
    ├── App.tsx                    # Root aplikasi, routing halaman, dan ErrorBoundary
    ├── index.css                  # Konfigurasi Tailwind CSS & gaya cetak (@media print)
    ├── main.tsx
    ├── lib/
    │   ├── firebase.ts            # Inisialisasi Firebase Auth & Firestore + error handler
    │   └── format.ts              # Formatter Rupiah, tanggal Indonesia, bulan, perhitungan diskon
    ├── types/
    │   └── spp.ts                 # Definisi tipe TypeScript seluruh entitas
    ├── contexts/
    │   ├── AuthContext.tsx        # Autentikasi (Google & Email/Password), verifikasi, & RBAC
    │   └── SppDataContext.tsx     # Sinkronisasi data real-time Firestore & auto-generate tagihan
    ├── services/
    │   ├── auditService.ts        # Pencatatan log aktivitas
    │   ├── masterService.ts       # CRUD siswa, kelas, tahun ajaran, tarif, profil, pengguna
    │   ├── tagihanService.ts      # Generate tagihan massal & tambah tagihan manual
    │   ├── pembayaranService.ts   # Proses pembayaran cicilan/multi-bulan & pembatalan
    │   ├── exportService.ts       # Generator kwitansi PDF & ekspor laporan Excel/PDF
    │   └── seeder.ts              # Generator data contoh (204 siswa)
    ├── components/
    │   ├── Layout.tsx             # Shell navigasi responsif (sidebar desktop & drawer HP)
    │   ├── SiswaFormModal.tsx     # Modal tambah/ubah data siswa
    │   ├── KwitansiPrintModal.tsx # Pratinjau, cetak, & unduh PDF kwitansi
    │   ├── StatusBadge.tsx        # Label status tagihan, pembayaran, & siswa
    │   └── ErrorBoundary.tsx      # Penanganan error runtime & Firestore
    └── pages/
        ├── LoginPage.tsx          # Halaman masuk, daftar akun email, reset sandi, & verifikasi
        ├── DashboardPage.tsx      # Ringkasan keuangan, grafik bulanan, & transaksi terbaru
        ├── MasterDataPage.tsx     # Kelola Siswa, Kelas & TA, Tarif SPP, Profil, & Peran
        ├── TagihanPage.tsx        # Daftar, generate massal, & tambah tagihan manual
        ├── PembayaranPage.tsx     # Input pembayaran, riwayat transaksi, & pembatalan
        ├── TunggakanPage.tsx      # Daftar tunggakan siswa per kelas/bulan
        ├── LaporanPage.tsx        # Rekap harian, bulanan, per kelas + ekspor Excel/PDF
        └── LogAktivitasPage.tsx   # Riwayat audit aktivitas sistem
```

---

## Koleksi Firestore

- `users` — Profil akun pengguna dan peran (`admin`, `petugas`, `kepala_sekolah`, `pending`).
- `role_invites` — Undangan penetapan peran otomatis berdasarkan email staf.
- `pengaturan_sekolah` — Identitas sekolah untuk kop kwitansi dan laporan.
- `tahun_ajaran` — Daftar tahun ajaran dan status aktif.
- `kelas` — Daftar kelas SMA beserta tingkat (`10`, `11`, `12`).
- `tarif_spp` — Tarif SPP bulanan per kelas dan tahun ajaran.
- `siswa` — Data induk siswa, kontak orang tua, status, dan diskon/beasiswa.
- `tagihan_spp` — Tagihan SPP bulanan per siswa.
- `pembayaran` — Header transaksi pembayaran dan nomor kwitansi (tidak dapat dihapus).
- `pembayaran_detail` — Alokasi nominal pembayaran ke satu atau beberapa tagihan bulanan.
- `log_aktivitas` — Riwayat audit perubahan data (*append-only*).

---

## Panduan Instalasi & Menjalankan Secara Lokal

### 1. Prasyarat
- **Node.js** versi 20 atau lebih baru.
- Proyek Firebase dengan **Cloud Firestore** dan **Firebase Authentication** aktif.

### 2. Instalasi Dependensi
```bash
npm install
```

### 3. Konfigurasi Firebase Authentication
Pastikan di **Firebase Console → Build → Authentication → Sign-in method**, metode berikut sudah diaktifkan:
- **Google** (untuk login akun Google).
- **Email/Password** (aktifkan *Enable* agar fitur daftar akun, login email, verifikasi email, dan reset kata sandi berfungsi).

Konfigurasi koneksi proyek Firebase dibaca dari file `firebase-applet-config.json` di root proyek.

### 4. Menjalankan Mode Pengembangan
```bash
npm run dev
```
Aplikasi akan berjalan di `http://localhost:3000`.

### 5. Perintah Pemeriksaan & Build
- Cek tipe TypeScript:
  ```bash
  npm run lint
  ```
- Validasi aturan keamanan Firestore:
  ```bash
  npx eslint firestore.rules
  ```
- Build untuk produksi:
  ```bash
  npm run build
  ```

---

## Panduan Deploy

1. **Deploy Aturan Keamanan Firestore** (menggunakan Firebase CLI):
   ```bash
   npm install -g firebase-tools
   firebase login
   firebase deploy --only firestore:rules
   ```
2. **Deploy Aplikasi Frontend:**
   - Jalankan `npm run build` untuk menghasilkan berkas statis di folder `dist/`.
   - Unggah folder `dist/` ke **Firebase Hosting** (`firebase init hosting` → arahkan *public directory* ke `dist` dan aktifkan *single-page app rewrite* ke `/index.html`, lalu `firebase deploy --only hosting`), atau ke layanan hosting statis seperti Vercel / Netlify / Cloud Run.
