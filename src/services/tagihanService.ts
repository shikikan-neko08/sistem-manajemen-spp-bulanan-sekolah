import { doc, getDoc, serverTimestamp, setDoc, writeBatch } from 'firebase/firestore';
import { db, handleFirestoreError, OperationType } from '../lib/firebase.ts';
import { hitungDiskon, namaBulan, sanitizeId } from '../lib/format.ts';
import type { Kelas, Siswa, TagihanSpp, TarifSpp } from '../types/spp.ts';
import { type AuditActor, catatLog } from './auditService.ts';

export interface GenerateTagihanParams {
  bulan: number;
  tahun: number;
  tahunAjaranId: string;
  siswaList: Siswa[];
  kelasList: Kelas[];
  tarifList: TarifSpp[];
  existingTagihan: TagihanSpp[];
  actor: AuditActor;
}

export interface GenerateTagihanResult {
  createdCount: number;
  skippedCount: number;
  missingTarifCount: number;
}

export async function generateTagihanBulanan(
  params: GenerateTagihanParams
): Promise<GenerateTagihanResult> {
  const { bulan, tahun, tahunAjaranId, siswaList, kelasList, tarifList, existingTagihan, actor } = params;

  if (bulan < 1 || bulan > 12) throw new Error('Bulan harus antara 1 sampai 12.');
  if (tahun < 2020 || tahun > 2100) throw new Error('Tahun tidak valid.');
  if (!tahunAjaranId) throw new Error('Tahun ajaran aktif belum dipilih.');

  const existingIds = new Set(existingTagihan.map((t) => t.id));
  const kelasMap = new Map(kelasList.map((k) => [k.id, k]));
  const tarifMap = new Map<string, number>();
  for (const t of tarifList) {
    if (t.tahunAjaranId === tahunAjaranId) {
      tarifMap.set(t.kelasId, t.nominal);
    }
  }

  const activeStudents = siswaList.filter((s) => s.statusAktif === 'aktif');
  const jatuhTempo = `${tahun}-${String(bulan).padStart(2, '0')}-10`;

  let createdCount = 0;
  let skippedCount = 0;
  let missingTarifCount = 0;

  const pendingWrites: Array<{ id: string; data: Record<string, unknown> }> = [];

  for (const siswa of activeStudents) {
    const tagihanId = sanitizeId(`${siswa.id}_${tahun}_${bulan}`);
    if (existingIds.has(tagihanId)) {
      skippedCount += 1;
      continue;
    }

    const kelas = kelasMap.get(siswa.kelasId);
    const tarifNominal = tarifMap.get(siswa.kelasId);
    if (!kelas || tarifNominal === undefined) {
      missingTarifCount += 1;
      continue;
    }

    const { nominalDiskon, nominalTagihan } = hitungDiskon(
      tarifNominal,
      siswa.diskonTipe,
      siswa.diskonNilai
    );

    const isFree = nominalTagihan === 0;

    pendingWrites.push({
      id: tagihanId,
      data: {
        siswaId: siswa.id,
        kelasId: siswa.kelasId,
        tahunAjaranId,
        emailOrtu: (siswa.emailOrtu || '').trim().toLowerCase(),
        bulan,
        tahun,
        nominalTarif: tarifNominal,
        nominalDiskon,
        nominalTagihan,
        totalTerbayar: 0,
        sisaTagihan: nominalTagihan,
        status: isFree ? 'lunas' : 'belum_bayar',
        jatuhTempo,
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      },
    });
    createdCount += 1;
  }

  try {
    const CHUNK = 400;
    for (let i = 0; i < pendingWrites.length; i += CHUNK) {
      const batch = writeBatch(db);
      const slice = pendingWrites.slice(i, i + CHUNK);
      for (const item of slice) {
        batch.set(doc(db, 'tagihan_spp', item.id), item.data);
      }
      await batch.commit();
    }

    if (createdCount > 0) {
      await catatLog(
        actor,
        'GENERATE',
        'tagihan_spp',
        `${tahun}_${bulan}`,
        `Generate ${createdCount} tagihan SPP ${namaBulan(bulan)} ${tahun} (dilewati ${skippedCount} sudah ada)`
      );
    }

    return { createdCount, skippedCount, missingTarifCount };
  } catch (error) {
    handleFirestoreError(error, OperationType.WRITE, 'tagihan_spp');
  }
}

export interface TambahTagihanManualInput {
  siswa: Siswa;
  tahunAjaranId: string;
  bulan: number;
  tahun: number;
  nominalTarif: number;
  nominalDiskon: number;
  jatuhTempo: string;
  actor: AuditActor;
}

export async function tambahTagihanManual(input: TambahTagihanManualInput): Promise<string> {
  const { siswa, tahunAjaranId, bulan, tahun, nominalTarif, nominalDiskon, jatuhTempo, actor } = input;

  if (bulan < 1 || bulan > 12) throw new Error('Bulan harus antara 1 sampai 12.');
  if (tahun < 2020 || tahun > 2100) throw new Error('Tahun tidak valid.');
  if (!tahunAjaranId) throw new Error('Tahun ajaran aktif belum tersedia.');
  if (!Number.isFinite(nominalTarif) || nominalTarif < 0) {
    throw new Error('Nominal tarif tidak boleh negatif.');
  }
  if (!Number.isFinite(nominalDiskon) || nominalDiskon < 0) {
    throw new Error('Nominal diskon tidak boleh negatif.');
  }

  const tarif = Math.round(nominalTarif);
  const diskon = Math.min(tarif, Math.round(nominalDiskon));
  const nominalTagihan = Math.max(0, tarif - diskon);
  const tagihanId = sanitizeId(`${siswa.id}_${tahun}_${bulan}`);
  const path = `tagihan_spp/${tagihanId}`;

  try {
    const existingSnap = await getDoc(doc(db, 'tagihan_spp', tagihanId));
    if (existingSnap.exists()) {
      throw new Error(
        `Tagihan untuk ${siswa.nama} pada ${namaBulan(bulan)} ${tahun} sudah terdaftar (anti-duplikat).`
      );
    }

    await setDoc(doc(db, 'tagihan_spp', tagihanId), {
      siswaId: siswa.id,
      kelasId: siswa.kelasId,
      tahunAjaranId,
      emailOrtu: (siswa.emailOrtu || '').trim().toLowerCase(),
      bulan,
      tahun,
      nominalTarif: tarif,
      nominalDiskon: diskon,
      nominalTagihan,
      totalTerbayar: 0,
      sisaTagihan: nominalTagihan,
      status: nominalTagihan === 0 ? 'lunas' : 'belum_bayar',
      jatuhTempo: jatuhTempo || `${tahun}-${String(bulan).padStart(2, '0')}-10`,
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
    });

    await catatLog(
      actor,
      'CREATE',
      'tagihan_spp',
      tagihanId,
      `Menambah tagihan manual ${namaBulan(bulan)} ${tahun} untuk ${siswa.nama} (Rp ${nominalTagihan.toLocaleString('id-ID')})`
    );

    return tagihanId;
  } catch (error) {
    if (error instanceof Error && error.message.includes('sudah terdaftar')) {
      throw error;
    }
    handleFirestoreError(error, OperationType.CREATE, path);
  }
}
