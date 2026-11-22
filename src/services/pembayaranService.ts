import {
  collection,
  doc,
  getDoc,
  getDocs,
  query,
  serverTimestamp,
  setDoc,
  updateDoc,
  where,
  writeBatch,
} from 'firebase/firestore';
import { db, handleFirestoreError, OperationType } from '../lib/firebase.ts';
import { labelKanalOrtu, namaBulan, sanitizeId } from '../lib/format.ts';
import type {
  KanalPembayaranOrtu,
  MetodePembayaran,
  Pembayaran,
  PembayaranDetail,
  PembayaranOrtu,
  PembayaranOrtuItem,
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
  prefixKwitansi?: string;
  actor: AuditActor;
}

function generateNomorKwitansi(tanggalBayar: string, prefix = 'KWT'): string {
  const cleanPrefix =
    prefix
      .trim()
      .toUpperCase()
      .replace(/[^A-Z0-9_-]/g, '')
      .slice(0, 10) || 'KWT';
  const datePart = tanggalBayar.replace(/-/g, '').slice(0, 8);
  const randPart = Math.random().toString(36).substring(2, 6).toUpperCase();
  const timePart = String(Date.now()).slice(-4);
  return `${cleanPrefix}-${datePart}-${timePart}${randPart}`;
}

export async function prosesPembayaran(
  input: ProsesPembayaranInput
): Promise<{ pembayaran: Pembayaran; details: PembayaranDetail[] }> {
  const { siswa, kelasNama, items, metode, tanggalBayar, catatan, prefixKwitansi, actor } = input;

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
  const noKwitansi = generateNomorKwitansi(tanggalBayar, prefixKwitansi);
  const rincianBulan = items
    .map((item) => {
      const bayar = Math.round(item.bayarNominal);
      const isLunas = bayar >= item.tagihan.sisaTagihan;
      return `${namaBulan(item.tagihan.bulan)} ${item.tagihan.tahun} (${isLunas ? 'Lunas' : 'Cicilan'})`;
    })
    .join(', ')
    .slice(0, 500);

  const emailOrtu = (siswa.emailOrtu || '').trim().toLowerCase().slice(0, 160);

  const pembayaranPayload = {
    noKwitansi,
    siswaId: siswa.id,
    siswaNis: siswa.nis,
    siswaNama: siswa.nama,
    kelasId: siswa.kelasId,
    kelasNama,
    emailOrtu,
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
        emailOrtu,
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

export async function ambilDetailPembayaran(
  pembayaranId: string,
  emailOrtu?: string
): Promise<PembayaranDetail[]> {
  const path = 'pembayaran_detail';
  try {
    const cleanEmail = (emailOrtu || '').trim().toLowerCase();
    const q = cleanEmail
      ? query(
          collection(db, path),
          where('pembayaranId', '==', pembayaranId),
          where('emailOrtu', '==', cleanEmail)
        )
      : query(collection(db, path), where('pembayaranId', '==', pembayaranId));
    const snap = await getDocs(q);
    return snap.docs.map((d) => ({ id: d.id, ...(d.data() as Omit<PembayaranDetail, 'id'>) }));
  } catch (error) {
    handleFirestoreError(error, OperationType.LIST, path);
  }
}

export interface KirimPembayaranOrtuInput {
  siswa: Siswa;
  kelasNama: string;
  items: AlokasiTagihanItem[];
  kanal: KanalPembayaranOrtu;
  tanggalTransfer: string;
  namaPengirim: string;
  referensiTransfer: string;
  catatan: string;
  prefixPengajuanOrtu?: string;
  actor: AuditActor & { email: string };
}

export async function kirimPembayaranOrtu(
  input: KirimPembayaranOrtuInput
): Promise<PembayaranOrtu> {
  const {
    siswa,
    kelasNama,
    items,
    kanal,
    tanggalTransfer,
    namaPengirim,
    referensiTransfer,
    catatan,
    prefixPengajuanOrtu,
    actor,
  } = input;

  if (!items.length) {
    throw new Error('Pilih minimal satu tagihan bulan yang akan dibayar.');
  }
  if (items.length > 12) {
    throw new Error('Maksimal 12 tagihan dalam satu pengajuan pembayaran online.');
  }
  if (!tanggalTransfer) {
    throw new Error('Tanggal transfer wajib diisi.');
  }
  const cleanPengirim = namaPengirim.trim();
  if (cleanPengirim.length < 2) {
    throw new Error('Nama pengirim / pemilik rekening minimal 2 karakter.');
  }

  let totalBayar = 0;
  const normalizedItems: PembayaranOrtuItem[] = [];
  for (const item of items) {
    const nominal = Math.round(item.bayarNominal);
    if (!Number.isFinite(nominal) || nominal <= 0) {
      throw new Error(
        `Nominal pembayaran untuk ${namaBulan(item.tagihan.bulan)} ${item.tagihan.tahun} harus lebih dari 0.`
      );
    }
    if (nominal > item.tagihan.sisaTagihan) {
      throw new Error(
        `Nominal bayar untuk ${namaBulan(item.tagihan.bulan)} ${item.tagihan.tahun} melebihi sisa tagihan.`
      );
    }
    totalBayar += nominal;
    normalizedItems.push({
      tagihanId: item.tagihan.id,
      bulan: item.tagihan.bulan,
      tahun: item.tagihan.tahun,
      bayarNominal: nominal,
    });
  }

  const emailOrtu = (siswa.emailOrtu || actor.email || '').trim().toLowerCase().slice(0, 160);
  if (emailOrtu.length < 3) {
    throw new Error('Email akun orang tua belum tertaut pada data siswa.');
  }

  const pengajuanId = sanitizeId(
    `po_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 7)}`
  );
  const datePart = tanggalTransfer.replace(/-/g, '').slice(0, 8);
  const randPart = Math.random().toString(36).substring(2, 6).toUpperCase();
  const timePart = String(Date.now()).slice(-4);
  const cleanPrefix =
    (prefixPengajuanOrtu || 'ONL')
      .trim()
      .toUpperCase()
      .replace(/[^A-Z0-9_-]/g, '')
      .slice(0, 10) || 'ONL';
  const kodePengajuan = `${cleanPrefix}-${datePart}-${timePart}${randPart}`;

  const rincianBulan = items
    .map((item) => {
      const bayar = Math.round(item.bayarNominal);
      const isLunas = bayar >= item.tagihan.sisaTagihan;
      return `${namaBulan(item.tagihan.bulan)} ${item.tagihan.tahun} (${isLunas ? 'Lunas' : 'Cicilan'})`;
    })
    .join(', ')
    .slice(0, 500);

  const payload = {
    kodePengajuan,
    siswaId: siswa.id,
    siswaNis: siswa.nis.slice(0, 30),
    siswaNama: siswa.nama.slice(0, 120),
    kelasId: siswa.kelasId,
    kelasNama: kelasNama.slice(0, 60),
    orangTuaUid: actor.uid,
    orangTuaNama: (actor.nama || cleanPengirim).slice(0, 120),
    emailOrtu,
    tanggalTransfer: tanggalTransfer.slice(0, 30),
    kanal,
    namaPengirim: cleanPengirim.slice(0, 120),
    referensiTransfer: referensiTransfer.trim().slice(0, 100),
    catatan: catatan.trim().slice(0, 300),
    totalBayar,
    rincianBulan,
    items: normalizedItems,
    status: 'menunggu_verifikasi' as const,
    pembayaranId: '',
    noKwitansi: '',
    diprosesOleh: '',
    diprosesPada: '',
    alasanTolak: '',
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
  };

  try {
    await setDoc(doc(db, 'pembayaran_ortu', pengajuanId), payload);
    await catatLog(
      actor,
      'CREATE',
      'pembayaran_ortu',
      pengajuanId,
      `Orang tua mengajukan konfirmasi pembayaran ${kodePengajuan} (${labelKanalOrtu(kanal)}) a.n. ${siswa.nama} sebesar Rp ${totalBayar.toLocaleString('id-ID')}`
    );
    return { id: pengajuanId, ...payload };
  } catch (error) {
    handleFirestoreError(error, OperationType.CREATE, `pembayaran_ortu/${pengajuanId}`);
  }
}

export interface SimpanPengajuanMidtransInput {
  siswa: Siswa;
  kelasNama: string;
  items: AlokasiTagihanItem[];
  orderId: string;
  snapToken: string;
  redirectUrl: string;
  actor: AuditActor & { email: string };
}

export async function simpanPengajuanMidtransOrtu(
  input: SimpanPengajuanMidtransInput
): Promise<PembayaranOrtu> {
  const { siswa, kelasNama, items, orderId, snapToken, redirectUrl, actor } = input;
  let totalBayar = 0;
  const normalizedItems: PembayaranOrtuItem[] = [];
  for (const item of items) {
    const nominal = Math.round(item.bayarNominal);
    if (!Number.isFinite(nominal) || nominal <= 0 || nominal > item.tagihan.sisaTagihan) {
      throw new Error(
        `Nominal tagihan ${namaBulan(item.tagihan.bulan)} ${item.tagihan.tahun} tidak valid.`
      );
    }
    totalBayar += nominal;
    normalizedItems.push({
      tagihanId: item.tagihan.id,
      bulan: item.tagihan.bulan,
      tahun: item.tagihan.tahun,
      bayarNominal: nominal,
    });
  }

  const emailOrtu = (siswa.emailOrtu || actor.email || '').trim().toLowerCase().slice(0, 160);
  if (emailOrtu.length < 3) {
    throw new Error('Email akun orang tua belum tertaut pada data siswa.');
  }

  const pengajuanId = sanitizeId(
    `po_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 7)}`
  );
  const today = new Date().toISOString().slice(0, 10);
  const rincianBulan = items
    .map((item) => {
      const bayar = Math.round(item.bayarNominal);
      const isLunas = bayar >= item.tagihan.sisaTagihan;
      return `${namaBulan(item.tagihan.bulan)} ${item.tagihan.tahun} (${isLunas ? 'Lunas' : 'Cicilan'})`;
    })
    .join(', ')
    .slice(0, 500);

  const safePengirim = (actor.nama || siswa.nama || 'Orang Tua').trim().slice(0, 120);
  const payload = {
    kodePengajuan: orderId.slice(0, 60),
    siswaId: siswa.id,
    siswaNis: siswa.nis.slice(0, 30),
    siswaNama: siswa.nama.slice(0, 120),
    kelasId: siswa.kelasId,
    kelasNama: kelasNama.slice(0, 60),
    orangTuaUid: actor.uid,
    orangTuaNama: safePengirim,
    emailOrtu,
    tanggalTransfer: today,
    kanal: 'midtrans' as const,
    namaPengirim: safePengirim.length >= 2 ? safePengirim : 'Wali Murid',
    referensiTransfer: orderId.slice(0, 100),
    catatan: 'Pembayaran online via Midtrans Snap',
    totalBayar,
    rincianBulan,
    items: normalizedItems,
    status: 'menunggu_verifikasi' as const,
    pembayaranId: '',
    noKwitansi: '',
    diprosesOleh: '',
    diprosesPada: '',
    alasanTolak: '',
    midtransOrderId: orderId.slice(0, 80),
    midtransSnapToken: snapToken.slice(0, 160),
    midtransRedirectUrl: redirectUrl.slice(0, 300),
    midtransTransactionStatus: 'pending',
    midtransPaymentType: '',
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
  };

  try {
    await setDoc(doc(db, 'pembayaran_ortu', pengajuanId), payload);
    await catatLog(
      actor,
      'CREATE',
      'pembayaran_ortu',
      pengajuanId,
      `Memulai transaksi Midtrans ${orderId} a.n. ${siswa.nama} sebesar Rp ${totalBayar.toLocaleString('id-ID')}`
    );
    return { id: pengajuanId, ...payload };
  } catch (error) {
    handleFirestoreError(error, OperationType.CREATE, `pembayaran_ortu/${pengajuanId}`);
  }
}

export async function sinkronStatusMidtransOrtu(params: {
  pengajuanId: string;
  transactionStatus: string;
  paymentType: string;
}): Promise<void> {
  const path = `pembayaran_ortu/${params.pengajuanId}`;
  try {
    await updateDoc(doc(db, 'pembayaran_ortu', params.pengajuanId), {
      midtransTransactionStatus: params.transactionStatus.trim().slice(0, 40),
      midtransPaymentType: params.paymentType.trim().slice(0, 60),
      updatedAt: serverTimestamp(),
    });
  } catch (error) {
    handleFirestoreError(error, OperationType.UPDATE, path);
  }
}

export async function verifikasiPembayaranOrtu(params: {
  pengajuan: PembayaranOrtu;
  tagihanList: TagihanSpp[];
  actor: AuditActor;
  prefixKwitansi?: string;
  midtransStatus?: { transactionStatus: string; paymentType: string };
}): Promise<{ pembayaran: Pembayaran; details: PembayaranDetail[] }> {
  const { pengajuan, tagihanList, actor, prefixKwitansi, midtransStatus } = params;
  if (pengajuan.status !== 'menunggu_verifikasi') {
    throw new Error('Pengajuan pembayaran ini sudah diproses sebelumnya.');
  }

  const tagihanMap = new Map(tagihanList.map((t) => [t.id, t]));
  const items: AlokasiTagihanItem[] = [];

  for (const item of pengajuan.items) {
    const liveTagihan = tagihanMap.get(item.tagihanId);
    if (!liveTagihan) {
      throw new Error(`Tagihan ${namaBulan(item.bulan)} ${item.tahun} tidak ditemukan.`);
    }
    if (item.bayarNominal > liveTagihan.sisaTagihan) {
      throw new Error(
        `Sisa tagihan ${namaBulan(item.bulan)} ${item.tahun} saat ini (${liveTagihan.sisaTagihan.toLocaleString('id-ID')}) lebih kecil dari nominal ajuan (${item.bayarNominal.toLocaleString('id-ID')}). Tolak ajuan ini atau periksa tagihan.`
      );
    }
    items.push({ tagihan: liveTagihan, bayarNominal: item.bayarNominal });
  }

  const pembayaranId = sanitizeId(
    `pay_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 7)}`
  );
  const noKwitansi = generateNomorKwitansi(pengajuan.tanggalTransfer, prefixKwitansi);
  const paymentType = midtransStatus?.paymentType || pengajuan.midtransPaymentType || '';
  const noteParts = [
    pengajuan.kanal === 'midtrans'
      ? `Midtrans (${pengajuan.midtransOrderId || pengajuan.kodePengajuan})`
      : `Portal Ortu (${pengajuan.kodePengajuan})`,
    pengajuan.kanal === 'midtrans'
      ? paymentType
        ? `Metode: ${paymentType}`
        : 'Midtrans Snap'
      : `${labelKanalOrtu(pengajuan.kanal)} - Pengirim: ${pengajuan.namaPengirim}`,
    pengajuan.kanal !== 'midtrans' && pengajuan.referensiTransfer
      ? `Ref: ${pengajuan.referensiTransfer}`
      : '',
    pengajuan.kanal !== 'midtrans' && pengajuan.catatan ? pengajuan.catatan : '',
  ]
    .filter(Boolean)
    .join(' · ')
    .slice(0, 300);

  const emailOrtu = pengajuan.emailOrtu.trim().toLowerCase().slice(0, 160);
  const pembayaranPayload = {
    noKwitansi,
    siswaId: pengajuan.siswaId,
    siswaNis: pengajuan.siswaNis,
    siswaNama: pengajuan.siswaNama,
    kelasId: pengajuan.kelasId,
    kelasNama: pengajuan.kelasNama,
    emailOrtu,
    tanggalBayar: pengajuan.tanggalTransfer,
    metode: 'transfer' as const,
    totalBayar: pengajuan.totalBayar,
    petugasUid: actor.uid,
    petugasNama: actor.nama.slice(0, 120),
    catatan: noteParts,
    status: 'sah' as const,
    alasanBatal: '',
    dibatalkanOleh: '',
    dibatalkanPada: '',
    rincianBulan: pengajuan.rincianBulan,
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
        siswaId: pengajuan.siswaId,
        emailOrtu,
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

    const pengajuanUpdate: Record<string, unknown> = {
      status: 'diverifikasi',
      pembayaranId,
      noKwitansi,
      diprosesOleh: actor.nama.slice(0, 120),
      diprosesPada: new Date().toISOString(),
      alasanTolak: '',
      updatedAt: serverTimestamp(),
    };
    if (midtransStatus) {
      pengajuanUpdate.midtransTransactionStatus = midtransStatus.transactionStatus.slice(0, 40);
      pengajuanUpdate.midtransPaymentType = midtransStatus.paymentType.slice(0, 60);
    }
    batch.update(doc(db, 'pembayaran_ortu', pengajuan.id), pengajuanUpdate);

    await batch.commit();

    await catatLog(
      actor,
      'UPDATE',
      'pembayaran_ortu',
      pengajuan.id,
      `Memverifikasi pembayaran orang tua ${pengajuan.kodePengajuan} a.n. ${pengajuan.siswaNama} (Rp ${pengajuan.totalBayar.toLocaleString('id-ID')}) → Kwitansi ${noKwitansi}`
    );

    return {
      pembayaran: { id: pembayaranId, ...pembayaranPayload },
      details: createdDetails,
    };
  } catch (error) {
    handleFirestoreError(error, OperationType.WRITE, `pembayaran_ortu/${pengajuan.id}`);
  }
}

export async function tolakPembayaranOrtu(params: {
  pengajuan: PembayaranOrtu;
  alasanTolak: string;
  actor: AuditActor;
}): Promise<void> {
  const { pengajuan, alasanTolak, actor } = params;
  const alasan = alasanTolak.trim();
  if (alasan.length < 5) {
    throw new Error('Alasan penolakan wajib diisi minimal 5 karakter.');
  }
  if (pengajuan.status !== 'menunggu_verifikasi') {
    throw new Error('Pengajuan pembayaran ini sudah diproses sebelumnya.');
  }

  const path = `pembayaran_ortu/${pengajuan.id}`;
  try {
    await updateDoc(doc(db, 'pembayaran_ortu', pengajuan.id), {
      status: 'ditolak',
      alasanTolak: alasan.slice(0, 300),
      diprosesOleh: actor.nama.slice(0, 120),
      diprosesPada: new Date().toISOString(),
      updatedAt: serverTimestamp(),
    });

    await catatLog(
      actor,
      'CANCEL',
      'pembayaran_ortu',
      pengajuan.id,
      `Menolak konfirmasi pembayaran ${pengajuan.kodePengajuan} (${pengajuan.siswaNama}) — Alasan: ${alasan}`
    );
  } catch (error) {
    handleFirestoreError(error, OperationType.UPDATE, path);
  }
}
