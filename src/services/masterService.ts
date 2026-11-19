import {
  collection,
  deleteDoc,
  doc,
  getDocs,
  serverTimestamp,
  setDoc,
  updateDoc,
  writeBatch,
} from 'firebase/firestore';
import { db, handleFirestoreError, OperationType } from '../lib/firebase.ts';
import { emailToKey, sanitizeId } from '../lib/format.ts';
import type {
  ActiveRole,
  AppUser,
  DiskonTipe,
  Kelas,
  PengaturanSekolah,
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
  try {
    await setDoc(doc(db, 'pengaturan_sekolah', 'default'), {
      namaSekolah: data.namaSekolah.trim(),
      alamat: data.alamat.trim(),
      telepon: data.telepon.trim(),
      email: data.email.trim(),
      kota: data.kota.trim(),
      namaKepalaSekolah: data.namaKepalaSekolah.trim(),
      updatedAt: serverTimestamp(),
    });
    await catatLog(actor, 'UPDATE', 'pengaturan_sekolah', 'default', `Memperbarui profil sekolah: ${data.namaSekolah}`);
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
  diskonTipe: DiskonTipe;
  diskonNilai: number;
  keteranganDiskon: string;
}

export async function simpanSiswa(
  input: SiswaInput,
  semuaSiswa: Siswa[],
  actor: AuditActor
): Promise<string> {
  const nis = input.nis.trim();
  const nama = input.nama.trim();
  const noHpOrtu = input.noHpOrtu.trim();
  const keteranganDiskon = input.keteranganDiskon.trim();

  if (nis.length < 3) throw new Error('NIS minimal 3 karakter.');
  if (nama.length < 2) throw new Error('Nama siswa minimal 2 karakter.');
  if (!input.kelasId) throw new Error('Kelas wajib dipilih.');
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
    diskonTipe: input.diskonTipe,
    diskonNilai: input.diskonTipe === 'none' ? 0 : Math.round(input.diskonNilai),
    keteranganDiskon: input.diskonTipe === 'none' ? '' : keteranganDiskon,
    updatedAt: serverTimestamp(),
  };

  try {
    if (isEdit) {
      await updateDoc(doc(db, 'siswa', id), payload);
      await catatLog(actor, 'UPDATE', 'siswa', id, `Mengubah data siswa ${nama} (NIS: ${nis})`);
    } else {
      await setDoc(doc(db, 'siswa', id), {
        ...payload,
        createdAt: serverTimestamp(),
      });
      await catatLog(actor, 'CREATE', 'siswa', id, `Menambah siswa baru ${nama} (NIS: ${nis})`);
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

export async function ubahPeranPengguna(
  targetUser: AppUser,
  peranBaru: ActiveRole | 'pending',
  aktif: boolean,
  actor: AuditActor
): Promise<void> {
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
