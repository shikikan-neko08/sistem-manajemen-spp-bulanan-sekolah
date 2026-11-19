import { collection, doc, getDocs, serverTimestamp, writeBatch } from 'firebase/firestore';
import { db, handleFirestoreError, OperationType } from '../lib/firebase.ts';
import { hitungDiskon, namaBulan } from '../lib/format.ts';
import type { DiskonTipe, StatusSiswa, TingkatKelas } from '../types/spp.ts';
import { type AuditActor, catatLog } from './auditService.ts';

const NAMA_DEPAN = [
  'Aditya', 'Aisyah', 'Alif', 'Amira', 'Andhika', 'Anisa', 'Arif', 'Aulia',
  'Bagas', 'Bintang', 'Cahya', 'Citra', 'Daffa', 'Danang', 'Dewi', 'Dimas',
  'Dina', 'Eka', 'Fajar', 'Farah', 'Farel', 'Fauzan', 'Fitri', 'Galih',
  'Gita', 'Hafiz', 'Hana', 'Ilham', 'Indah', 'Intan', 'Iqbal', 'Jihan',
  'Kartika', 'Keisha', 'Kevin', 'Laila', 'Laras', 'Mahesa', 'Maya', 'Mutiara',
  'Nabila', 'Nadia', 'Naufal', 'Nisa', 'Pramudya', 'Putri', 'Rafi', 'Rahma',
  'Raka', 'Rania', 'Rayhan', 'Rendy', 'Reza', 'Rina', 'Rizky', 'Sabila',
  'Salma', 'Salsabila', 'Satria', 'Siti', 'Syifa', 'Tari', 'Tiara', 'Vina',
  'Wahyu', 'Wulan', 'Yuda', 'Zahra', 'Zaki', 'Zulfikar',
];

const NAMA_BELAKANG = [
  'Pratama', 'Putri', 'Wijaya', 'Kusuma', 'Saputra', 'Ramadhan', 'Hidayat', 'Nugroho',
  'Santoso', 'Permata', 'Lestari', 'Puspita', 'Maulana', 'Firdaus', 'Kurniawan', 'Sari',
  'Utami', 'Wibowo', 'Setiawan', 'Rahmawati', 'Hakim', 'Syahputra', 'Azzahra', 'Anggraini',
  'Budiman', 'Cahyono', 'Damayanti', 'Efendi', 'Febrianti', 'Gunawan',
];

interface KelasSeed {
  id: string;
  nama: string;
  tingkat: TingkatKelas;
  tarif: number;
}

const KELAS_LIST: KelasSeed[] = [
  { id: 'kls_x_ipa_1', nama: 'X IPA 1', tingkat: '10', tarif: 350000 },
  { id: 'kls_x_ips_1', nama: 'X IPS 1', tingkat: '10', tarif: 350000 },
  { id: 'kls_xi_ipa_1', nama: 'XI IPA 1', tingkat: '11', tarif: 375000 },
  { id: 'kls_xi_ips_1', nama: 'XI IPS 1', tingkat: '11', tarif: 375000 },
  { id: 'kls_xii_ipa_1', nama: 'XII IPA 1', tingkat: '12', tarif: 400000 },
  { id: 'kls_xii_ips_1', nama: 'XII IPS 1', tingkat: '12', tarif: 400000 },
];

async function commitBatches(ops: Array<{ col: string; id: string; data: Record<string, unknown> }>) {
  const CHUNK = 400;
  for (let i = 0; i < ops.length; i += CHUNK) {
    const batch = writeBatch(db);
    for (const op of ops.slice(i, i + CHUNK)) {
      batch.set(doc(db, op.col, op.id), op.data);
    }
    await batch.commit();
  }
}

export async function seedContohData(actor: AuditActor): Promise<{ siswaCount: number; tagihanCount: number; pembayaranCount: number }> {
  try {
    const existingSiswa = await getDocs(collection(db, 'siswa'));
    if (existingSiswa.size >= 50) {
      throw new Error(`Data contoh tidak dijalankan karena sudah terdapat ${existingSiswa.size} siswa di database.`);
    }

    const taId = 'ta_2025_2026';
    const baseOps: Array<{ col: string; id: string; data: Record<string, unknown> }> = [
      {
        col: 'pengaturan_sekolah',
        id: 'default',
        data: {
          namaSekolah: 'SMA Negeri 1 Nusantara',
          alamat: 'Jl. Pendidikan Merdeka No. 45, Kec. Coblong',
          telepon: '(022) 420-8812',
          email: 'tatausaha@sman1nusantara.sch.id',
          kota: 'Bandung',
          namaKepalaSekolah: 'Drs. Hendra Wijaya, M.Pd.',
          updatedAt: serverTimestamp(),
        },
      },
      {
        col: 'tahun_ajaran',
        id: taId,
        data: {
          nama: '2025/2026',
          aktif: true,
          createdAt: serverTimestamp(),
        },
      },
    ];

    for (const k of KELAS_LIST) {
      baseOps.push({
        col: 'kelas',
        id: k.id,
        data: {
          nama: k.nama,
          tingkat: k.tingkat,
          tahunAjaranId: taId,
          createdAt: serverTimestamp(),
        },
      });
      baseOps.push({
        col: 'tarif_spp',
        id: `tarif_${taId}_${k.id}`,
        data: {
          kelasId: k.id,
          tahunAjaranId: taId,
          nominal: k.tarif,
          updatedAt: serverTimestamp(),
        },
      });
    }

    await commitBatches(baseOps);

    // 204 Siswa (34 siswa per kelas x 6 kelas)
    const siswaRecords: Array<{
      id: string;
      nis: string;
      nama: string;
      kelasId: string;
      kelasNama: string;
      tarif: number;
      statusAktif: StatusSiswa;
      diskonTipe: DiskonTipe;
      diskonNilai: number;
      keteranganDiskon: string;
    }> = [];

    const siswaOps: Array<{ col: string; id: string; data: Record<string, unknown> }> = [];
    let counter = 1;

    for (let kIdx = 0; kIdx < KELAS_LIST.length; kIdx++) {
      const k = KELAS_LIST[kIdx];
      for (let i = 0; i < 34; i++) {
        const idx = counter++;
        const depan = NAMA_DEPAN[(idx * 7 + i) % NAMA_DEPAN.length];
        const tengah = NAMA_BELAKANG[(idx * 3 + kIdx) % NAMA_BELAKANG.length];
        const ujung = idx % 5 === 0 ? ` ${NAMA_BELAKANG[(idx * 11) % NAMA_BELAKANG.length]}` : '';
        const nama = `${depan} ${tengah}${ujung}`;
        const nis = `2526${k.tingkat}${String(idx).padStart(4, '0')}`;
        const id = `sis_${nis}`;

        let statusAktif: StatusSiswa = 'aktif';
        if (idx === 198 || idx === 199) statusAktif = 'pindah';
        if (idx === 200) statusAktif = 'nonaktif';

        let diskonTipe: DiskonTipe = 'none';
        let diskonNilai = 0;
        let keteranganDiskon = '';

        if (idx % 17 === 0) {
          diskonTipe = 'persen';
          diskonNilai = 100;
          keteranganDiskon = 'Beasiswa Yatim / Kurang Mampu (100%)';
        } else if (idx % 13 === 0) {
          diskonTipe = 'persen';
          diskonNilai = 50;
          keteranganDiskon = 'Beasiswa Prestasi Akademik (50%)';
        } else if (idx % 19 === 0) {
          diskonTipe = 'nominal';
          diskonNilai = 100000;
          keteranganDiskon = 'Keringanan Saudara Kandung';
        }

        const noHpOrtu = `0812${String(34000000 + idx * 7919).slice(0, 8)}`;

        siswaRecords.push({
          id,
          nis,
          nama,
          kelasId: k.id,
          kelasNama: k.nama,
          tarif: k.tarif,
          statusAktif,
          diskonTipe,
          diskonNilai,
          keteranganDiskon,
        });

        siswaOps.push({
          col: 'siswa',
          id,
          data: {
            nis,
            nama,
            kelasId: k.id,
            statusAktif,
            noHpOrtu,
            diskonTipe,
            diskonNilai,
            keteranganDiskon,
            createdAt: serverTimestamp(),
            updatedAt: serverTimestamp(),
          },
        });
      }
    }

    await commitBatches(siswaOps);

    // 3 bulan terakhir (termasuk bulan berjalan)
    const now = new Date();
    const monthsToSeed: Array<{ bulan: number; tahun: number }> = [];
    for (let offset = 2; offset >= 0; offset--) {
      const d = new Date(now.getFullYear(), now.getMonth() - offset, 1);
      monthsToSeed.push({ bulan: d.getMonth() + 1, tahun: d.getFullYear() });
    }

    const tagihanOps: Array<{ col: string; id: string; data: Record<string, unknown> }> = [];
    const pembayaranOps: Array<{ col: string; id: string; data: Record<string, unknown> }> = [];
    const detailOps: Array<{ col: string; id: string; data: Record<string, unknown> }> = [];

    let kwCounter = 1;

    for (let sIdx = 0; sIdx < siswaRecords.length; sIdx++) {
      const s = siswaRecords[sIdx];
      if (s.statusAktif !== 'aktif') continue;

      const { nominalDiskon, nominalTagihan } = hitungDiskon(s.tarif, s.diskonTipe, s.diskonNilai);

      for (let mIdx = 0; mIdx < monthsToSeed.length; mIdx++) {
        const { bulan, tahun } = monthsToSeed[mIdx];
        const tagihanId = `${s.id}_${tahun}_${bulan}`;
        const jatuhTempo = `${tahun}-${String(bulan).padStart(2, '0')}-10`;

        if (nominalTagihan === 0) {
          tagihanOps.push({
            col: 'tagihan_spp',
            id: tagihanId,
            data: {
              siswaId: s.id,
              kelasId: s.kelasId,
              tahunAjaranId: taId,
              bulan,
              tahun,
              nominalTarif: s.tarif,
              nominalDiskon,
              nominalTagihan: 0,
              totalTerbayar: 0,
              sisaTagihan: 0,
              status: 'lunas',
              jatuhTempo,
              createdAt: serverTimestamp(),
              updatedAt: serverTimestamp(),
            },
          });
          continue;
        }

        // Pola realistis:
        // Bulan ke-0 (2 bulan lalu): 90% lunas, 5% sebagian, 5% belum bayar
        // Bulan ke-1 (bulan lalu): 80% lunas, 8% sebagian, 12% belum bayar
        // Bulan ke-2 (bulan berjalan): 62% lunas, 10% sebagian, 28% belum bayar
        const mod = (sIdx * 7 + mIdx * 3) % 20;
        let totalTerbayar = 0;
        if (mIdx === 0) {
          if (mod < 18) totalTerbayar = nominalTagihan;
          else if (mod === 18) totalTerbayar = Math.round(nominalTagihan / 2);
        } else if (mIdx === 1) {
          if (mod < 16) totalTerbayar = nominalTagihan;
          else if (mod === 16 || mod === 17) totalTerbayar = Math.round(nominalTagihan * 0.5);
        } else {
          if (mod < 12) totalTerbayar = nominalTagihan;
          else if (mod === 12 || mod === 13) totalTerbayar = 150000;
        }

        totalTerbayar = Math.min(nominalTagihan, totalTerbayar);
        const sisaTagihan = Math.max(0, nominalTagihan - totalTerbayar);
        const status =
          sisaTagihan === 0 ? 'lunas' : totalTerbayar > 0 ? 'sebagian' : 'belum_bayar';

        tagihanOps.push({
          col: 'tagihan_spp',
          id: tagihanId,
          data: {
            siswaId: s.id,
            kelasId: s.kelasId,
            tahunAjaranId: taId,
            bulan,
            tahun,
            nominalTarif: s.tarif,
            nominalDiskon,
            nominalTagihan,
            totalTerbayar,
            sisaTagihan,
            status,
            jatuhTempo,
            createdAt: serverTimestamp(),
            updatedAt: serverTimestamp(),
          },
        });

        if (totalTerbayar > 0) {
          const day = String(3 + ((sIdx + mIdx) % 18)).padStart(2, '0');
          const tanggalBayar = `${tahun}-${String(bulan).padStart(2, '0')}-${day}`;
          const pembayaranId = `pay_seed_${tahun}_${bulan}_${s.id}`;
          const noKwitansi = `KWT-${tahun}${String(bulan).padStart(2, '0')}-${String(kwCounter++).padStart(4, '0')}`;
          const metode = sIdx % 3 === 0 ? 'transfer' : 'tunai';
          const ket = sisaTagihan === 0 ? 'Lunas' : 'Cicilan';

          pembayaranOps.push({
            col: 'pembayaran',
            id: pembayaranId,
            data: {
              noKwitansi,
              siswaId: s.id,
              siswaNis: s.nis,
              siswaNama: s.nama,
              kelasId: s.kelasId,
              kelasNama: s.kelasNama,
              tanggalBayar,
              metode,
              totalBayar: totalTerbayar,
              petugasUid: actor.uid,
              petugasNama: actor.nama,
              catatan: 'Pembayaran SPP reguler',
              status: 'sah',
              alasanBatal: '',
              dibatalkanOleh: '',
              dibatalkanPada: '',
              rincianBulan: `${namaBulan(bulan)} ${tahun} (${ket})`,
              createdAt: serverTimestamp(),
            },
          });

          detailOps.push({
            col: 'pembayaran_detail',
            id: `pdet_seed_${tahun}_${bulan}_${s.id}`,
            data: {
              pembayaranId,
              tagihanId,
              siswaId: s.id,
              bulan,
              tahun,
              nominalDialokasikan: totalTerbayar,
              status: 'sah',
              createdAt: serverTimestamp(),
            },
          });
        }
      }
    }

    await commitBatches(tagihanOps);
    await commitBatches(pembayaranOps);
    await commitBatches(detailOps);

    await catatLog(
      actor,
      'SEED',
      'sistem',
      'seeder_204',
      `Mengisi data contoh: 6 kelas, ${siswaRecords.length} siswa, ${tagihanOps.length} tagihan, ${pembayaranOps.length} transaksi pembayaran`
    );

    return {
      siswaCount: siswaRecords.length,
      tagihanCount: tagihanOps.length,
      pembayaranCount: pembayaranOps.length,
    };
  } catch (error) {
    if (error instanceof Error && error.message.includes('sudah terdapat')) {
      throw error;
    }
    handleFirestoreError(error, OperationType.WRITE, 'seeder');
  }
}
