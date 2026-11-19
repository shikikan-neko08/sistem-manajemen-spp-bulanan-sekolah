import {
  collection,
  doc,
  getDoc,
  getDocs,
  query,
  serverTimestamp,
  where,
  writeBatch,
} from 'firebase/firestore';
import { db, handleFirestoreError, OperationType } from '../lib/firebase.ts';
import { namaBulan, sanitizeId } from '../lib/format.ts';
import type {
  MetodePembayaran,
  Pembayaran,
  PembayaranDetail,
  Siswa,
  StatusTagihan,
  TagihanSpp,
} from '../types/spp.ts';
import { type AuditActor, catatLog } from './auditService.ts';

export interface AlokasiTagihanItem {
  tagihan: TagihanSpp;
  bayarNominal: number;
}

export interface ProsesPembayaranInput {
  siswa: Siswa;
  kelasNama: string;
  items: AlokasiTagihanItem[];
  metode: MetodePembayaran;
  tanggalBayar: string;
  catatan: string;
  actor: AuditActor;
}

function generateNomorKwitansi(tanggalBayar: string): string {
  const datePart = tanggalBayar.replace(/-/g, '').slice(0, 8);
  const randPart = Math.random().toString(36).substring(2, 6).toUpperCase();
  const timePart = String(Date.now()).slice(-4);
  return `KWT-${datePart}-${timePart}${randPart}`;
}

export async function prosesPembayaran(
  input: ProsesPembayaranInput
): Promise<{ pembayaran: Pembayaran; details: PembayaranDetail[] }> {
  const { siswa, kelasNama, items, metode, tanggalBayar, catatan, actor } = input;

  if (!items.length) {
    throw new Error('Pilih minimal satu tagihan bulan yang akan dibayar.');
  }
  if (!tanggalBayar) {
    throw new Error('Tanggal pembayaran wajib diisi.');
  }

  let totalBayar = 0;
  for (const item of items) {
    const nominal = Math.round(item.bayarNominal);
    if (!Number.isFinite(nominal) || nominal <= 0) {
      throw new Error(`Nominal pembayaran untuk ${namaBulan(item.tagihan.bulan)} ${item.tagihan.tahun} harus lebih dari 0.`);
    }
    if (nominal > item.tagihan.sisaTagihan) {
      throw new Error(
        `Nominal bayar untuk ${namaBulan(item.tagihan.bulan)} ${item.tagihan.tahun} melebihi sisa tagihan.`
      );
    }
    totalBayar += nominal;
  }

  const pembayaranId = sanitizeId(`pay_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 7)}`);
  const noKwitansi = generateNomorKwitansi(tanggalBayar);
  const rincianBulan = items
    .map((item) => {
      const bayar = Math.round(item.bayarNominal);
      const isLunas = bayar >= item.tagihan.sisaTagihan;
      return `${namaBulan(item.tagihan.bulan)} ${item.tagihan.tahun} (${isLunas ? 'Lunas' : 'Cicilan'})`;
    })
    .join(', ')
    .slice(0, 500);

  const pembayaranPayload = {
    noKwitansi,
    siswaId: siswa.id,
    siswaNis: siswa.nis,
    siswaNama: siswa.nama,
    kelasId: siswa.kelasId,
    kelasNama,
    tanggalBayar,
    metode,
    totalBayar,
    petugasUid: actor.uid,
    petugasNama: actor.nama,
    catatan: catatan.trim().slice(0, 300),
    status: 'sah' as const,
    alasanBatal: '',
    dibatalkanOleh: '',
    dibatalkanPada: '',
    rincianBulan,
    createdAt: serverTimestamp(),
  };

  const createdDetails: PembayaranDetail[] = [];

  try {
    const batch = writeBatch(db);
    batch.set(doc(db, 'pembayaran', pembayaranId), pembayaranPayload);

    for (const item of items) {
      const bayar = Math.round(item.bayarNominal);
      const detailId = sanitizeId(`pdet_${pembayaranId}_${item.tagihan.id}`);
      const detailPayload = {
        pembayaranId,
        tagihanId: item.tagihan.id,
        siswaId: siswa.id,
        bulan: item.tagihan.bulan,
        tahun: item.tagihan.tahun,
        nominalDialokasikan: bayar,
        status: 'sah' as const,
        createdAt: serverTimestamp(),
      };
      batch.set(doc(db, 'pembayaran_detail', detailId), detailPayload);
      createdDetails.push({ id: detailId, ...detailPayload });

      const newTotalTerbayar = item.tagihan.totalTerbayar + bayar;
      const newSisa = Math.max(0, item.tagihan.nominalTagihan - newTotalTerbayar);
      const newStatus: StatusTagihan =
        newSisa === 0 ? 'lunas' : newTotalTerbayar > 0 ? 'sebagian' : 'belum_bayar';

      batch.update(doc(db, 'tagihan_spp', item.tagihan.id), {
        totalTerbayar: newTotalTerbayar,
        sisaTagihan: newSisa,
        status: newStatus,
        updatedAt: serverTimestamp(),
      });
    }

    await batch.commit();

    await catatLog(
      actor,
      'CREATE',
      'pembayaran',
      pembayaranId,
      `Mencatat pembayaran ${noKwitansi} (${metode}) a.n. ${siswa.nama} sebesar Rp ${totalBayar.toLocaleString('id-ID')} [${rincianBulan}]`
    );

    return {
      pembayaran: { id: pembayaranId, ...pembayaranPayload },
      details: createdDetails,
    };
  } catch (error) {
    handleFirestoreError(error, OperationType.WRITE, `pembayaran/${pembayaranId}`);
  }
}

export async function batalkanPembayaran(
  pembayaran: Pembayaran,
  alasanBatal: string,
  actor: AuditActor
): Promise<void> {
  const alasan = alasanBatal.trim();
  if (alasan.length < 5) {
    throw new Error('Alasan pembatalan wajib diisi minimal 5 karakter.');
  }
  if (pembayaran.status === 'dibatalkan') {
    throw new Error('Pembayaran ini sudah berstatus dibatalkan.');
  }

  try {
    const detailsQuery = query(
      collection(db, 'pembayaran_detail'),
      where('pembayaranId', '==', pembayaran.id)
    );
    const detailSnap = await getDocs(detailsQuery);

    const batch = writeBatch(db);
    const nowIso = new Date().toISOString();

    batch.update(doc(db, 'pembayaran', pembayaran.id), {
      status: 'dibatalkan',
      alasanBatal: alasan.slice(0, 300),
      dibatalkanOleh: actor.nama.slice(0, 120),
      dibatalkanPada: nowIso,
    });

    for (const d of detailSnap.docs) {
      const detail = d.data() as PembayaranDetail;
      batch.update(doc(db, 'pembayaran_detail', d.id), {
        status: 'dibatalkan',
      });

      const tagihanRef = doc(db, 'tagihan_spp', detail.tagihanId);
      const tagihanSnap = await getDoc(tagihanRef);
      if (tagihanSnap.exists()) {
        const tagihan = tagihanSnap.data() as TagihanSpp;
        const newTotalTerbayar = Math.max(0, tagihan.totalTerbayar - detail.nominalDialokasikan);
        const newSisa = Math.max(0, tagihan.nominalTagihan - newTotalTerbayar);
        const newStatus: StatusTagihan =
          newSisa === 0 && tagihan.nominalTagihan === 0
            ? 'lunas'
            : newTotalTerbayar === 0
            ? 'belum_bayar'
            : newSisa === 0
            ? 'lunas'
            : 'sebagian';

        batch.update(tagihanRef, {
          totalTerbayar: newTotalTerbayar,
          sisaTagihan: newSisa,
          status: newStatus,
          updatedAt: serverTimestamp(),
        });
      }
    }

    await batch.commit();

    await catatLog(
      actor,
      'CANCEL',
      'pembayaran',
      pembayaran.id,
      `Membatalkan kwitansi ${pembayaran.noKwitansi} (${pembayaran.siswaNama}, Rp ${pembayaran.totalBayar.toLocaleString('id-ID')}) — Alasan: ${alasan}`
    );
  } catch (error) {
    handleFirestoreError(error, OperationType.UPDATE, `pembayaran/${pembayaran.id}`);
  }
}

export async function ambilDetailPembayaran(pembayaranId: string): Promise<PembayaranDetail[]> {
  const path = 'pembayaran_detail';
  try {
    const q = query(collection(db, path), where('pembayaranId', '==', pembayaranId));
    const snap = await getDocs(q);
    return snap.docs.map((d) => ({ id: d.id, ...(d.data() as Omit<PembayaranDetail, 'id'>) }));
  } catch (error) {
    handleFirestoreError(error, OperationType.LIST, path);
  }
}
