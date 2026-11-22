# Security Specification — SIP-SPP SMA

## 1. Data Invariants
1. **Role Isolation & No Self-Escalation**: Pengguna tidak dapat menetapkan atau menaikkan perannya sendiri (`admin`, `petugas`, `kepala_sekolah`). Hanya `admin` (atau email admin bootstrap `ardaffa2000@gmail.com`) yang dapat mengubah peran pengguna lain.
2. **Payment Immutability (No Delete)**: Dokumen pada koleksi `pembayaran` dan `pembayaran_detail` tidak boleh dihapus (`allow delete: if false`). Koreksi transaksi hanya dapat dilakukan oleh `admin` atau `petugas` dengan mengubah `status` menjadi `'dibatalkan'` disertai `alasanBatal` yang wajib diisi.
3. **Terminal Cancellation Lock**: Pembayaran yang sudah berstatus `'dibatalkan'` tidak dapat diubah kembali menjadi `'sah'` kecuali oleh `admin` untuk pemulihan darurat.
4. **Deterministic Billing Anti-Duplicate**: Setiap `tagihan_spp` terikat ke `siswaId`, `tahun`, dan `bulan` valid (`1..12`), serta nominal tervalidasi (`nominalTagihan >= 0`, `totalTerbayar >= 0`, `sisaTagihan >= 0`).
5. **Audit Trail Integrity**: Catatan `log_aktivitas` bersifat *append-only* (`allow update, delete: if false`) dan `actorUid` wajib sama dengan `request.auth.uid`.
6. **PII Protection**: Data akun (`users`) hanya dapat dibaca oleh pemilik akun sendiri atau `admin`. Data siswa, tagihan, dan pembayaran yang diakses oleh `orang_tua` dibatasi secara ketat berdasarkan `emailOrtu` yang terverifikasi pada token Auth.
7. **Parent Payment Separation**: Orang tua hanya dapat mengajukan pembayaran online pada koleksi `pembayaran_ortu` berstatus `'menunggu_verifikasi'` untuk siswa yang tertaut ke emailnya (baik konfirmasi transfer manual maupun pembayaran melalui gateway Midtrans Snap). Orang tua hanya boleh menyinkronkan metadata status Midtrans (`midtransTransactionStatus`, `midtransPaymentType`) dari server dan tidak pernah dapat mengubah `status` menjadi `'diverifikasi'`, mengubah `tagihan_spp`, atau menerbitkan `pembayaran` sah secara sepihak tanpa verifikasi `petugas`/`admin` (yang memverifikasi status settlement langsung via API server Midtrans).
8. **System & Gateway Configuration Integrity**: Dokumen pada `pengaturan_sistem` dan `pengaturan_sekolah` hanya boleh dibuat atau diubah oleh `admin`. Kunci rahasia payment gateway (`MIDTRANS_SERVER_KEY`) tidak pernah disimpan di Firestore maupun dikirim ke browser, melainkan dikelola eksklusif di server `process.env`.

## 2. The "Dirty Dozen" Payloads (Adversarial Tests)
1. **Self-Admin Escalation**: User baru mencoba `create` di `/users/{uid}` dengan `peran: 'admin'`. -> `PERMISSION_DENIED`.
2. **Role Tampering on Update**: Petugas atau Orang Tua mencoba `update` dokumen `/users/{uid}` miliknya mengubah `peran: 'admin'`. -> `PERMISSION_DENIED`.
3. **Unauthenticated Read**: Klien tanpa auth mencoba `get` `/siswa/s1`. -> `PERMISSION_DENIED`.
4. **Payment Deletion**: Admin, Petugas, atau Orang Tua mencoba `delete` `/pembayaran/p1` atau `/pembayaran_ortu/po1`. -> `PERMISSION_DENIED`.
5. **Empty Cancellation/Rejection Reason**: Petugas membatalkan pembayaran atau menolak pengajuan orang tua dengan alasan `""`. -> `PERMISSION_DENIED`.
6. **Kepsek & Parent Direct Mutation Attempt**: Kepala Sekolah atau Orang Tua mencoba membuat `/pembayaran/p1` atau mengubah `/tagihan_spp/t1`. -> `PERMISSION_DENIED`.
7. **Shadow Field Injection**: Penyerang mengirim field liar `isSuperUser: true` pada payload `siswa` atau `pembayaran_ortu`. -> `PERMISSION_DENIED`.
8. **ID Poisoning**: Penyerang mencoba menulis `/siswa/` atau `/pembayaran_ortu/` dengan ID panjang > 128 karakter atau karakter ilegal (`../admin`). -> `PERMISSION_DENIED`.
9. **Fake Timestamp**: Klien mengirim string palsu atau tanggal mundur pada `createdAt` bukannya `serverTimestamp()`. -> `PERMISSION_DENIED`.
10. **Audit Log Tampering**: Pengguna mencoba mengedit atau menghapus entri `/log_aktivitas/{id}`. -> `PERMISSION_DENIED`.
11. **Cross-Student Parent Access**: Orang Tua A mencoba membaca atau mengajukan `pembayaran_ortu` untuk `siswaId` milik Orang Tua B. -> `PERMISSION_DENIED`.
12. **Terminal State Replay**: Petugas mencoba memverifikasi ulang `/pembayaran_ortu/po1` yang sudah berstatus `'diverifikasi'` atau `'ditolak'`. -> `PERMISSION_DENIED`.
