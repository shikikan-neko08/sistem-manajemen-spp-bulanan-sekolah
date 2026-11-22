import {
  collection,
  deleteDoc,
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
import { BOOTSTRAPPED_ADMIN_EMAIL, db, handleFirestoreError, OperationType } from '../lib/firebase.ts';
import { DEFAULT_PENGATURAN_SISTEM, emailToKey, sanitizeId } from '../lib/format.ts';
import type {
  ActiveRole,
  AppUser,
  DiskonTipe,
  HakAksesKhusus,
  Kelas,
  PengaturanSekolah,
  PengaturanSistem,
  Siswa,
  StatusSiswa,
  TahunAjaran,
  TarifSpp,
  TingkatKelas,
} from '../types/spp.ts';
import { type AuditActor, catatLog } from './auditService.ts';

export async function simpanPengaturanSekolah(
  data: Omit<PengaturanSekolah, 'id' | 'updatedAt'>,
  actor: AuditActor
): Promise<void> {
  const path = 'pengaturan_sekolah/default';
  const cleanNama = data.namaSekolah.trim().slice(0, 160);
  const cleanKota = data.kota.trim().slice(0, 80);
  if (cleanNama.length < 2) throw new Error('Nama sekolah minimal 2 karakter.');
  if (cleanKota.length < 1) throw new Error('Kota wajib diisi.');
  const cleanPrefixVa = (data.prefixVaSiswa || '88102').replace(/[^0-9]/g, '').slice(0, 12);

  try {
    await setDoc(doc(db, 'pengaturan_sekolah', 'default'), {
      namaSekolah: cleanNama,
      npsn: (data.npsn || '').trim().slice(0, 30),
      alamat: data.alamat.trim().slice(0, 300),
      telepon: data.telepon.trim().slice(0, 40),
      email: data.email.trim().slice(0, 120),
      kota: cleanKota,
      namaKepalaSekolah: data.namaKepalaSekolah.trim().slice(0, 120),
      nipKepalaSekolah: (data.nipKepalaSekolah || '').trim().slice(0, 40),
      namaBank: (data.namaBank || '').trim().slice(0, 80),
      noRekening: (data.noRekening || '').trim().slice(0, 60),
      atasNamaRekening: (data.atasNamaRekening || '').trim().slice(0, 120),
      prefixVaSiswa: cleanPrefixVa,
      updatedAt: serverTimestamp(),
    });
    await catatLog(actor, 'UPDATE', 'pengaturan_sekolah', 'default', `Memperbarui profil & rekening sekolah: ${cleanNama}`);
  } catch (error) {
    handleFirestoreError(error, OperationType.WRITE, path);
  }
}

export async function simpanPengaturanSistem(
  data: Omit<PengaturanSistem, 'id' | 'updatedAt'>,
  actor: AuditActor,
  ringkasanLog?: string
): Promise<void> {
  const path = 'pengaturan_sistem/default';
  const orderPrefix = (data.midtransOrderPrefix || DEFAULT_PENGATURAN_SISTEM.midtransOrderPrefix)
    .trim()
    .toUpperCase()
    .replace(/[^A-Z0-9_-]/g, '')
    .slice(0, 10);
  const kwitansiPrefix = (data.prefixKwitansi || DEFAULT_PENGATURAN_SISTEM.prefixKwitansi)
    .trim()
    .toUpperCase()
    .replace(/[^A-Z0-9_-]/g, '')
    .slice(0, 10);
  const pengajuanPrefix = (data.prefixPengajuanOrtu || DEFAULT_PENGATURAN_SISTEM.prefixPengajuanOrtu)
    .trim()
    .toUpperCase()
    .replace(/[^A-Z0-9_-]/g, '')
    .slice(0, 10);

  if (orderPrefix.length < 2) throw new Error('Prefiks Order ID Midtrans minimal 2 karakter.');
  if (kwitansiPrefix.length < 2) throw new Error('Prefiks nomor kwitansi minimal 2 karakter.');
  if (pengajuanPrefix.length < 2) throw new Error('Prefiks kode pengajuan portal minimal 2 karakter.');

  const expiry = Math.min(10080, Math.max(15, Math.round(Number(data.midtransExpiryMenit) || 1440)));
  const jatuhTempo = Math.min(28, Math.max(1, Math.round(Number(data.tanggalJatuhTempo) || 10)));
  const enabledPayments = Array.from(
    new Set(
      (data.midtransEnabledPayments || [])
        .map((c) => c.trim().slice(0, 40))
        .filter(Boolean)
    )
  ).slice(0, 15);

  try {
    await setDoc(doc(db, 'pengaturan_sistem', 'default'), {
      midtransProductionMode: Boolean(data.midtransProductionMode),
      midtransAktif: Boolean(data.midtransAktif),
      transferManualAktif: Boolean(data.transferManualAktif),
      midtransEnabledPayments: enabledPayments,
      midtransOrderPrefix: orderPrefix,
      midtransExpiryMenit: expiry,
      portalOrtuAktif: Boolean(data.portalOrtuAktif),
      pesanPemeliharaanPortal: (data.pesanPemeliharaanPortal || '').trim().slice(0, 300),
      petugasBolehBatalkanPembayaran: Boolean(data.petugasBolehBatalkanPembayaran),
      petugasBolehGenerateTagihan: Boolean(data.petugasBolehGenerateTagihan),
      petugasBolehLihatMaster: Boolean(data.petugasBolehLihatMaster),
      kepsekBolehLihatAudit: Boolean(data.kepsekBolehLihatAudit),
      ortuBolehCicilan: Boolean(data.ortuBolehCicilan),
      autoGenerateTagihan: Boolean(data.autoGenerateTagihan),
      tanggalJatuhTempo: jatuhTempo,
      prefixKwitansi: kwitansiPrefix,
      prefixPengajuanOrtu: pengajuanPrefix,
      catatanKakiKwitansi: (data.catatanKakiKwitansi || '').trim().slice(0, 300),
      tampilkanNipKepsekDiKwitansi: Boolean(data.tampilkanNipKepsekDiKwitansi),
      templateWaTunggakan: (data.templateWaTunggakan || '').trim().slice(0, 600),
      updatedAt: serverTimestamp(),
    });
    await catatLog(
      actor,
      'UPDATE',
      'pengaturan_sistem',
      'default',
      (ringkasanLog || `Memperbarui pengaturan sistem (Midtrans=${data.midtransProductionMode ? 'Production' : 'Sandbox'})`).slice(0, 400)
    );
  } catch (error) {
    handleFirestoreError(error, OperationType.WRITE, path);
  }
}

export async function tambahTahunAjaran(
  nama: string,
  aktif: boolean,
  semuaTa: TahunAjaran[],
  actor: AuditActor
): Promise<void> {
  const trimmed = nama.trim();
  if (trimmed.length < 4) throw new Error('Nama tahun ajaran minimal 4 karakter.');
  const id = sanitizeId(`ta_${trimmed}`);
  const path = `tahun_ajaran/${id}`;
  try {
    const batch = writeBatch(db);
    if (aktif) {
      for (const ta of semuaTa) {
        if (ta.aktif && ta.id !== id) {
          batch.update(doc(db, 'tahun_ajaran', ta.id), { aktif: false });
        }
      }
    }
    batch.set(doc(db, 'tahun_ajaran', id), {
      nama: trimmed,
      aktif,
      createdAt: serverTimestamp(),
    });
    await batch.commit();
    await catatLog(actor, 'CREATE', 'tahun_ajaran', id, `Menambah tahun ajaran ${trimmed}${aktif ? ' (Aktif)' : ''}`);
  } catch (error) {
    handleFirestoreError(error, OperationType.CREATE, path);
  }
}

export async function setTahunAjaranAktif(
  targetId: string,
  semuaTa: TahunAjaran[],
  actor: AuditActor
): Promise<void> {
  const path = `tahun_ajaran/${targetId}`;
  try {
    const batch = writeBatch(db);
    for (const ta of semuaTa) {
      batch.update(doc(db, 'tahun_ajaran', ta.id), { aktif: ta.id === targetId });
    }
    await batch.commit();
    const target = semuaTa.find((t) => t.id === targetId);
    await catatLog(actor, 'UPDATE', 'tahun_ajaran', targetId, `Mengaktifkan tahun ajaran ${target?.nama || targetId}`);
  } catch (error) {
    handleFirestoreError(error, OperationType.UPDATE, path);
  }
}

export async function simpanKelas(
  input: { id?: string; nama: string; tingkat: TingkatKelas; tahunAjaranId: string },
  actor: AuditActor
): Promise<string> {
  const nama = input.nama.trim();
  if (nama.length < 2) throw new Error('Nama kelas minimal 2 karakter.');
  const isEdit = Boolean(input.id);
  const id = input.id || sanitizeId(`kls_${input.tahunAjaranId}_${nama}_${Date.now().toString(36)}`);
  const path = `kelas/${id}`;
  try {
    if (isEdit) {
      await updateDoc(doc(db, 'kelas', id), {
        nama,
        tingkat: input.tingkat,
        tahunAjaranId: input.tahunAjaranId,
      });
      await catatLog(actor, 'UPDATE', 'kelas', id, `Mengubah data kelas ${nama}`);
    } else {
      await setDoc(doc(db, 'kelas', id), {
        nama,
        tingkat: input.tingkat,
        tahunAjaranId: input.tahunAjaranId,
        createdAt: serverTimestamp(),
      });
      await catatLog(actor, 'CREATE', 'kelas', id, `Menambah kelas baru ${nama}`);
    }
    return id;
  } catch (error) {
    handleFirestoreError(error, isEdit ? OperationType.UPDATE : OperationType.CREATE, path);
  }
}

export async function hapusKelas(kelas: Kelas, actor: AuditActor): Promise<void> {
  const path = `kelas/${kelas.id}`;
  try {
    await deleteDoc(doc(db, 'kelas', kelas.id));
    await catatLog(actor, 'DELETE', 'kelas', kelas.id, `Menghapus kelas ${kelas.nama}`);
  } catch (error) {
    handleFirestoreError(error, OperationType.DELETE, path);
  }
}

export async function simpanTarifSpp(
  input: { kelasId: string; tahunAjaranId: string; nominal: number },
  kelasNama: string,
  actor: AuditActor
): Promise<void> {
  if (!Number.isFinite(input.nominal) || input.nominal < 0) {
    throw new Error('Nominal tarif SPP tidak valid.');
  }
  const id = sanitizeId(`tarif_${input.tahunAjaranId}_${input.kelasId}`);
  const path = `tarif_spp/${id}`;
  try {
    await setDoc(doc(db, 'tarif_spp', id), {
      kelasId: input.kelasId,
      tahunAjaranId: input.tahunAjaranId,
      nominal: Math.round(input.nominal),
      updatedAt: serverTimestamp(),
    });
    await catatLog(
      actor,
      'UPDATE',
      'tarif_spp',
      id,
      `Menetapkan tarif SPP kelas ${kelasNama} sebesar Rp ${Math.round(input.nominal).toLocaleString('id-ID')}`
    );
  } catch (error) {
    handleFirestoreError(error, OperationType.WRITE, path);
  }
}

export interface SiswaInput {
  id?: string;
  nis: string;
  nama: string;
  kelasId: string;
  statusAktif: StatusSiswa;
  noHpOrtu: string;
  emailOrtu?: string;
  diskonTipe: DiskonTipe;
  diskonNilai: number;
  keteranganDiskon: string;
}

async function syncEmailOrtuPadaTransaksi(siswaId: string, emailOrtu: string): Promise<void> {
  const targets = ['tagihan_spp', 'pembayaran', 'pembayaran_detail'] as const;
  const ops: Array<{ col: string; id: string; data: Record<string, unknown> }> = [];

  for (const colName of targets) {
    const snap = await getDocs(query(collection(db, colName), where('siswaId', '==', siswaId)));
    for (const d of snap.docs) {
      const currentEmail = String((d.data() as { emailOrtu?: string }).emailOrtu || '').toLowerCase();
      if (currentEmail !== emailOrtu) {
        const updateData: Record<string, unknown> = { emailOrtu };
        if (colName === 'tagihan_spp') {
          updateData.updatedAt = serverTimestamp();
        }
        ops.push({ col: colName, id: d.id, data: updateData });
      }
    }
  }

  const CHUNK = 400;
  for (let i = 0; i < ops.length; i += CHUNK) {
    const batch = writeBatch(db);
    for (const op of ops.slice(i, i + CHUNK)) {
      batch.update(doc(db, op.col, op.id), op.data);
    }
    await batch.commit();
  }
}

export async function simpanSiswa(
  input: SiswaInput,
  semuaSiswa: Siswa[],
  actor: AuditActor
): Promise<string> {
  const nis = input.nis.trim();
  const nama = input.nama.trim();
  const noHpOrtu = input.noHpOrtu.trim();
  const emailOrtu = (input.emailOrtu || '').trim().toLowerCase();
  const keteranganDiskon = input.keteranganDiskon.trim();

  if (nis.length < 3) throw new Error('NIS minimal 3 karakter.');
  if (nama.length < 2) throw new Error('Nama siswa minimal 2 karakter.');
  if (!input.kelasId) throw new Error('Kelas wajib dipilih.');
  if (emailOrtu && (!emailOrtu.includes('@') || !emailOrtu.includes('.'))) {
    throw new Error('Format email orang tua tidak valid.');
  }
  if (input.diskonTipe === 'persen' && (input.diskonNilai < 0 || input.diskonNilai > 100)) {
    throw new Error('Persentase diskon harus antara 0% sampai 100%.');
  }
  if (input.diskonTipe === 'nominal' && input.diskonNilai < 0) {
    throw new Error('Nominal diskon tidak boleh negatif.');
  }

  const duplikatNis = semuaSiswa.find(
    (s) => s.nis.toLowerCase() === nis.toLowerCase() && s.id !== input.id
  );
  if (duplikatNis) {
    throw new Error(`NIS ${nis} sudah terdaftar atas nama ${duplikatNis.nama}.`);
  }

  const isEdit = Boolean(input.id);
  const id = input.id || sanitizeId(`sis_${nis}_${Date.now().toString(36)}`);
  const path = `siswa/${id}`;

  const payload = {
    nis,
    nama,
    kelasId: input.kelasId,
    statusAktif: input.statusAktif,
    noHpOrtu,
    emailOrtu: emailOrtu.slice(0, 160),
    diskonTipe: input.diskonTipe,
    diskonNilai: input.diskonTipe === 'none' ? 0 : Math.round(input.diskonNilai),
    keteranganDiskon: input.diskonTipe === 'none' ? '' : keteranganDiskon,
    updatedAt: serverTimestamp(),
  };

  try {
    if (isEdit) {
      await updateDoc(doc(db, 'siswa', id), payload);
      await syncEmailOrtuPadaTransaksi(id, emailOrtu);
      await catatLog(actor, 'UPDATE', 'siswa', id, `Mengubah data siswa ${nama} (NIS: ${nis})`);
    } else {
      await setDoc(doc(db, 'siswa', id), {
        ...payload,
        createdAt: serverTimestamp(),
      });
      await catatLog(actor, 'CREATE', 'siswa', id, `Menambah siswa baru ${nama} (NIS: ${nis})`);
    }

    if (emailOrtu) {
      const inviteId = emailToKey(emailOrtu);
      const inviteRef = doc(db, 'role_invites', inviteId);
      const inviteSnap = await getDoc(inviteRef);
      if (!inviteSnap.exists()) {
        await setDoc(inviteRef, {
          email: emailOrtu.slice(0, 160),
          nama: `Orang Tua ${nama}`.slice(0, 120),
          peran: 'orang_tua',
          createdBy: actor.uid,
          createdAt: serverTimestamp(),
        });
      }
    }

    return id;
  } catch (error) {
    handleFirestoreError(error, isEdit ? OperationType.UPDATE : OperationType.CREATE, path);
  }
}

export async function hapusSiswa(siswa: Siswa, actor: AuditActor): Promise<void> {
  const path = `siswa/${siswa.id}`;
  try {
    await deleteDoc(doc(db, 'siswa', siswa.id));
    await catatLog(actor, 'DELETE', 'siswa', siswa.id, `Menghapus data siswa ${siswa.nama} (NIS: ${siswa.nis})`);
  } catch (error) {
    handleFirestoreError(error, OperationType.DELETE, path);
  }
}

export async function undangPenggunaPeran(
  email: string,
  nama: string,
  peran: ActiveRole,
  actor: AuditActor
): Promise<void> {
  const cleanEmail = email.trim().toLowerCase();
  if (!cleanEmail.includes('@')) throw new Error('Format email tidak valid.');
  if (nama.trim().length < 2) throw new Error('Nama pengguna minimal 2 karakter.');
  const inviteId = emailToKey(cleanEmail);
  const path = `role_invites/${inviteId}`;
  try {
    await setDoc(doc(db, 'role_invites', inviteId), {
      email: cleanEmail,
      nama: nama.trim(),
      peran,
      createdBy: actor.uid,
      createdAt: serverTimestamp(),
    });
    await catatLog(actor, 'CREATE', 'role_invites', inviteId, `Menetapkan undangan peran ${peran} untuk ${cleanEmail}`);
  } catch (error) {
    handleFirestoreError(error, OperationType.WRITE, path);
  }
}

export async function hapusUndanganPeran(inviteId: string, email: string, actor: AuditActor): Promise<void> {
  const path = `role_invites/${inviteId}`;
  try {
    await deleteDoc(doc(db, 'role_invites', inviteId));
    await catatLog(actor, 'DELETE', 'role_invites', inviteId, `Menghapus undangan peran untuk ${email}`);
  } catch (error) {
    handleFirestoreError(error, OperationType.DELETE, path);
  }
}

function assertUserAccessChangeAllowed(
  targetUser: AppUser,
  peranBaru: ActiveRole | 'pending',
  aktif: boolean,
  actor: AuditActor
): void {
  const targetEmail = (targetUser.email || '').trim().toLowerCase();
  if (targetEmail === BOOTSTRAPPED_ADMIN_EMAIL && (peranBaru !== 'admin' || !aktif)) {
    throw new Error('Akun Admin utama sistem tidak dapat diturunkan perannya atau dinonaktifkan.');
  }
  if (targetUser.uid === actor.uid && (peranBaru !== 'admin' || !aktif)) {
    throw new Error('Anda tidak dapat menurunkan peran atau menonaktifkan akun Anda sendiri.');
  }
}

export async function ubahPeranPengguna(
  targetUser: AppUser,
  peranBaru: ActiveRole | 'pending',
  aktif: boolean,
  actor: AuditActor
): Promise<void> {
  assertUserAccessChangeAllowed(targetUser, peranBaru, aktif, actor);
  const path = `users/${targetUser.id}`;
  try {
    await updateDoc(doc(db, 'users', targetUser.id), {
      peran: peranBaru,
      aktif,
      updatedAt: serverTimestamp(),
    });
    await catatLog(
      actor,
      'UPDATE',
      'users',
      targetUser.id,
      `Mengubah akses ${targetUser.email} menjadi peran=${peranBaru}, aktif=${aktif}`
    );
  } catch (error) {
    handleFirestoreError(error, OperationType.UPDATE, path);
  }
}

export async function simpanAksesPengguna(
  targetUser: AppUser,
  updates: {
    nama: string;
    peran: ActiveRole | 'pending';
    aktif: boolean;
    catatanAkses?: string;
    hakAksesKhusus?: HakAksesKhusus;
  },
  actor: AuditActor
): Promise<void> {
  const cleanNama = updates.nama.trim().slice(0, 120);
  if (cleanNama.length < 1) {
    throw new Error('Nama pengguna wajib diisi.');
  }
  assertUserAccessChangeAllowed(targetUser, updates.peran, updates.aktif, actor);

  const sanitizedOverrides: HakAksesKhusus = {};
  if (updates.hakAksesKhusus) {
    if (typeof updates.hakAksesKhusus.bolehBatalkanPembayaran === 'boolean') {
      sanitizedOverrides.bolehBatalkanPembayaran = updates.hakAksesKhusus.bolehBatalkanPembayaran;
    }
    if (typeof updates.hakAksesKhusus.bolehGenerateTagihan === 'boolean') {
      sanitizedOverrides.bolehGenerateTagihan = updates.hakAksesKhusus.bolehGenerateTagihan;
    }
    if (typeof updates.hakAksesKhusus.bolehLihatMaster === 'boolean') {
      sanitizedOverrides.bolehLihatMaster = updates.hakAksesKhusus.bolehLihatMaster;
    }
    if (typeof updates.hakAksesKhusus.bolehLihatAudit === 'boolean') {
      sanitizedOverrides.bolehLihatAudit = updates.hakAksesKhusus.bolehLihatAudit;
    }
  }

  const path = `users/${targetUser.id}`;
  try {
    await updateDoc(doc(db, 'users', targetUser.id), {
      nama: cleanNama,
      peran: updates.peran,
      aktif: Boolean(updates.aktif),
      catatanAkses: (updates.catatanAkses || '').trim().slice(0, 160),
      hakAksesKhusus: sanitizedOverrides,
      updatedAt: serverTimestamp(),
    });
    await catatLog(
      actor,
      'UPDATE',
      'users',
      targetUser.id,
      `Memperbarui hak akses & profil ${targetUser.email} (peran=${updates.peran}, aktif=${Boolean(updates.aktif)})`
    );
  } catch (error) {
    handleFirestoreError(error, OperationType.UPDATE, path);
  }
}

export async function cekJumlahSiswa(): Promise<number> {
  try {
    const snap = await getDocs(collection(db, 'siswa'));
    return snap.size;
  } catch {
    return 0;
  }
}

export function hitungNominalTarifMap(tarifs: TarifSpp[]): Map<string, number> {
  const map = new Map<string, number>();
  for (const t of tarifs) {
    map.set(`${t.tahunAjaranId}__${t.kelasId}`, t.nominal);
  }
  return map;
}
