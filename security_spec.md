# Security Specification — SIP-SPP SMA

## 1. Data Invariants
1. **Role Isolation & No Self-Escalation**: Pengguna tidak dapat menetapkan atau menaikkan perannya sendiri (`admin`, `petugas`, `kepala_sekolah`). Hanya `admin` (atau email admin bootstrap `ardaffa2000@gmail.com`) yang dapat mengubah peran pengguna lain.
2. **Payment Immutability (No Delete)**: Dokumen pada koleksi `pembayaran` dan `pembayaran_detail` tidak boleh dihapus (`allow delete: if false`). Koreksi transaksi hanya dapat dilakukan oleh `admin` atau `petugas` dengan mengubah `status` menjadi `'dibatalkan'` disertai `alasanBatal` yang wajib diisi.
3. **Terminal Cancellation Lock**: Pembayaran yang sudah berstatus `'dibatalkan'` tidak dapat diubah kembali menjadi `'sah'` kecuali oleh `admin` untuk pemulihan darurat.
4. **Deterministic Billing Anti-Duplicate**: Setiap `tagihan_spp` terikat ke `siswaId`, `tahun`, dan `bulan` valid (`1..12`), serta nominal tervalidasi (`nominalTagihan >= 0`, `totalTerbayar >= 0`, `sisaTagihan >= 0`).
5. **Audit Trail Integrity**: Catatan `log_aktivitas` bersifat *append-only* (`allow update, delete: if false`) dan `actorUid` wajib sama dengan `request.auth.uid`.
6. **PII Protection**: Data akun (`users`) hanya dapat dibaca oleh pemilik akun sendiri atau `admin`.

## 2. The "Dirty Dozen" Payloads (Adversarial Tests)
1. **Self-Admin Escalation**: User baru mencoba `create` di `/users/{uid}` dengan `peran: 'admin'`. -> `PERMISSION_DENIED`.
2. **Role Tampering on Update**: Petugas mencoba `update` dokumen `/users/{uid}` miliknya mengubah `peran: 'admin'`. -> `PERMISSION_DENIED`.
3. **Unauthenticated Read**: Klien tanpa auth mencoba `get` `/siswa/s1`. -> `PERMISSION_DENIED`.
4. **Payment Deletion**: Admin atau Petugas mencoba `delete` `/pembayaran/p1`. -> `PERMISSION_DENIED`.
5. **Empty Cancellation Reason**: Petugas membatalkan pembayaran dengan `alasanBatal: ""`. -> `PERMISSION_DENIED`.
6. **Kepsek Mutation Attempt**: Kepala Sekolah (read-only) mencoba membuat `/pembayaran/p1` atau mengubah `/siswa/s1`. -> `PERMISSION_DENIED`.
7. **Shadow Field Injection**: Penyerang mengirim field liar `isSuperUser: true` pada payload `siswa`. -> `PERMISSION_DENIED`.
8. **ID Poisoning**: Penyerang mencoba menulis `/siswa/` dengan ID panjang > 128 karakter atau karakter ilegal (`../admin`). -> `PERMISSION_DENIED`.
9. **Fake Timestamp**: Klien mengirim string palsu atau tanggal mundur pada `createdAt` bukannya `serverTimestamp()`. -> `PERMISSION_DENIED`.
10. **Audit Log Tampering**: Pengguna mencoba mengedit atau menghapus entri `/log_aktivitas/{id}`. -> `PERMISSION_DENIED`.
11. **Log Identity Spoofing**: Pengguna mencoba menulis `/log_aktivitas/{id}` dengan `actorUid` milik orang lain. -> `PERMISSION_DENIED`.
12. **Negative Payment Amount**: Pengguna mengirim `pembayaran` dengan `totalBayar: -50000`. -> `PERMISSION_DENIED`.
