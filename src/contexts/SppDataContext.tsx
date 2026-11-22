import React, { createContext, useContext, useEffect, useMemo, useRef, useState } from 'react';
import { collection, onSnapshot, orderBy, query, where } from 'firebase/firestore';
import { db, handleFirestoreError, OperationType } from '../lib/firebase.ts';
import { generateTagihanBulanan } from '../services/tagihanService.ts';
import type {
  AppUser,
  Kelas,
  LogAktivitas,
  Pembayaran,
  PembayaranOrtu,
  PengaturanSekolah,
  RoleInvite,
  Siswa,
  TagihanSpp,
  TahunAjaran,
  TarifSpp,
} from '../types/spp.ts';
import { useAuth } from './AuthContext.tsx';

interface SppDataContextValue {
  sekolah: PengaturanSekolah | null;
  tahunAjaranList: TahunAjaran[];
  tahunAjaranAktif: TahunAjaran | null;
  kelasList: Kelas[];
  tarifList: TarifSpp[];
  siswaList: Siswa[];
  tagihanList: TagihanSpp[];
  pembayaranList: Pembayaran[];
  pembayaranOrtuList: PembayaranOrtu[];
  logList: LogAktivitas[];
  usersList: AppUser[];
  roleInvites: RoleInvite[];
  loadingData: boolean;
  autoGenerateNotice: string | null;
  dismissAutoGenerateNotice: () => void;
}

const SppDataContext = createContext<SppDataContextValue | null>(null);

function tsToMillis(ts: unknown): number {
  if (!ts) return 0;
  try {
    const maybe = ts as { toMillis?: () => number; seconds?: number };
    if (typeof maybe.toMillis === 'function') return maybe.toMillis();
    if (typeof maybe.seconds === 'number') return maybe.seconds * 1000;
  } catch {
    return 0;
  }
  return 0;
}

export function SppDataProvider({ children }: { children: React.ReactNode }) {
  const { profile, firebaseUser } = useAuth();
  const isActiveVerified =
    Boolean(firebaseUser) &&
    Boolean(profile) &&
    profile?.aktif === true &&
    profile?.peran !== 'pending';
  const isParentAccount = isActiveVerified && profile?.peran === 'orang_tua';
  const isStaffAccount = isActiveVerified && !isParentAccount;
  const isAdmin = profile?.peran === 'admin';
  const canSeeAudit = profile?.peran === 'admin' || profile?.peran === 'kepala_sekolah';
  const parentEmail = (firebaseUser?.email || profile?.email || '').trim().toLowerCase();

  const [sekolah, setSekolah] = useState<PengaturanSekolah | null>(null);
  const [tahunAjaranList, setTahunAjaranList] = useState<TahunAjaran[]>([]);
  const [kelasList, setKelasList] = useState<Kelas[]>([]);
  const [tarifList, setTarifList] = useState<TarifSpp[]>([]);
  const [siswaList, setSiswaList] = useState<Siswa[]>([]);
  const [tagihanList, setTagihanList] = useState<TagihanSpp[]>([]);
  const [pembayaranList, setPembayaranList] = useState<Pembayaran[]>([]);
  const [pembayaranOrtuList, setPembayaranOrtuList] = useState<PembayaranOrtu[]>([]);
  const [logList, setLogList] = useState<LogAktivitas[]>([]);
  const [usersList, setUsersList] = useState<AppUser[]>([]);
  const [roleInvites, setRoleInvites] = useState<RoleInvite[]>([]);
  const [loadingData, setLoadingData] = useState(true);
  const [autoGenerateNotice, setAutoGenerateNotice] = useState<string | null>(null);

  const autoGenAttemptedRef = useRef(false);

  useEffect(() => {
    if (!isActiveVerified) {
      setSekolah(null);
      setTahunAjaranList([]);
      setKelasList([]);
      setTarifList([]);
      setSiswaList([]);
      setTagihanList([]);
      setPembayaranList([]);
      setPembayaranOrtuList([]);
      setLogList([]);
      setUsersList([]);
      setRoleInvites([]);
      setLoadingData(false);
      return;
    }

    setLoadingData(true);
    let loadedFlags = 0;
    const expectedFlags = isParentAccount ? 5 : 6;
    const markLoaded = () => {
      loadedFlags += 1;
      if (loadedFlags >= expectedFlags) {
        setLoadingData(false);
      }
    };

    const unsubs: Array<() => void> = [];

    unsubs.push(
      onSnapshot(
        collection(db, 'pengaturan_sekolah'),
        (snap) => {
          const first = snap.docs[0];
          setSekolah(first ? { id: first.id, ...(first.data() as Omit<PengaturanSekolah, 'id'>) } : null);
          markLoaded();
        },
        (err) => handleFirestoreError(err, OperationType.LIST, 'pengaturan_sekolah')
      )
    );

    unsubs.push(
      onSnapshot(
        collection(db, 'tahun_ajaran'),
        (snap) => {
          setTahunAjaranList(
            snap.docs.map((d) => ({ id: d.id, ...(d.data() as Omit<TahunAjaran, 'id'>) }))
          );
          markLoaded();
        },
        (err) => handleFirestoreError(err, OperationType.LIST, 'tahun_ajaran')
      )
    );

    unsubs.push(
      onSnapshot(
        query(collection(db, 'kelas'), orderBy('nama')),
        (snap) => {
          setKelasList(snap.docs.map((d) => ({ id: d.id, ...(d.data() as Omit<Kelas, 'id'>) })));
          markLoaded();
        },
        (err) => handleFirestoreError(err, OperationType.LIST, 'kelas')
      )
    );

    if (isParentAccount) {
      setTarifList([]);
      setLogList([]);
      setUsersList([]);
      setRoleInvites([]);

      if (!parentEmail) {
        setSiswaList([]);
        setTagihanList([]);
        setPembayaranList([]);
        setPembayaranOrtuList([]);
        setLoadingData(false);
      } else {
        unsubs.push(
          onSnapshot(
            query(collection(db, 'siswa'), where('emailOrtu', '==', parentEmail)),
            (snap) => {
              const list = snap.docs
                .map((d) => ({ id: d.id, ...(d.data() as Omit<Siswa, 'id'>) }))
                .sort((a, b) => a.nama.localeCompare(b.nama, 'id'));
              setSiswaList(list);
              markLoaded();
            },
            (err) => handleFirestoreError(err, OperationType.LIST, 'siswa')
          )
        );

        unsubs.push(
          onSnapshot(
            query(collection(db, 'tagihan_spp'), where('emailOrtu', '==', parentEmail)),
            (snap) => {
              setTagihanList(
                snap.docs.map((d) => ({ id: d.id, ...(d.data() as Omit<TagihanSpp, 'id'>) }))
              );
              markLoaded();
            },
            (err) => handleFirestoreError(err, OperationType.LIST, 'tagihan_spp')
          )
        );

        unsubs.push(
          onSnapshot(
            query(collection(db, 'pembayaran'), where('emailOrtu', '==', parentEmail)),
            (snap) => {
              const list = snap.docs
                .map((d) => ({ id: d.id, ...(d.data() as Omit<Pembayaran, 'id'>) }))
                .sort((a, b) => tsToMillis(b.createdAt) - tsToMillis(a.createdAt));
              setPembayaranList(list);
            },
            (err) => handleFirestoreError(err, OperationType.LIST, 'pembayaran')
          )
        );

        unsubs.push(
          onSnapshot(
            query(collection(db, 'pembayaran_ortu'), where('emailOrtu', '==', parentEmail)),
            (snap) => {
              const list = snap.docs
                .map((d) => ({ id: d.id, ...(d.data() as Omit<PembayaranOrtu, 'id'>) }))
                .sort((a, b) => tsToMillis(b.createdAt) - tsToMillis(a.createdAt));
              setPembayaranOrtuList(list);
            },
            (err) => handleFirestoreError(err, OperationType.LIST, 'pembayaran_ortu')
          )
        );
      }
    } else if (isStaffAccount) {
      unsubs.push(
        onSnapshot(
          collection(db, 'tarif_spp'),
          (snap) => {
            setTarifList(snap.docs.map((d) => ({ id: d.id, ...(d.data() as Omit<TarifSpp, 'id'>) })));
            markLoaded();
          },
          (err) => handleFirestoreError(err, OperationType.LIST, 'tarif_spp')
        )
      );

      unsubs.push(
        onSnapshot(
          query(collection(db, 'siswa'), orderBy('nama')),
          (snap) => {
            setSiswaList(snap.docs.map((d) => ({ id: d.id, ...(d.data() as Omit<Siswa, 'id'>) })));
            markLoaded();
          },
          (err) => handleFirestoreError(err, OperationType.LIST, 'siswa')
        )
      );

      unsubs.push(
        onSnapshot(
          collection(db, 'tagihan_spp'),
          (snap) => {
            setTagihanList(
              snap.docs.map((d) => ({ id: d.id, ...(d.data() as Omit<TagihanSpp, 'id'>) }))
            );
            markLoaded();
          },
          (err) => handleFirestoreError(err, OperationType.LIST, 'tagihan_spp')
        )
      );

      unsubs.push(
        onSnapshot(
          query(collection(db, 'pembayaran'), orderBy('createdAt', 'desc')),
          (snap) => {
            setPembayaranList(
              snap.docs.map((d) => ({ id: d.id, ...(d.data() as Omit<Pembayaran, 'id'>) }))
            );
          },
          (err) => handleFirestoreError(err, OperationType.LIST, 'pembayaran')
        )
      );

      unsubs.push(
        onSnapshot(
          query(collection(db, 'pembayaran_ortu'), orderBy('createdAt', 'desc')),
          (snap) => {
            setPembayaranOrtuList(
              snap.docs.map((d) => ({ id: d.id, ...(d.data() as Omit<PembayaranOrtu, 'id'>) }))
            );
          },
          (err) => handleFirestoreError(err, OperationType.LIST, 'pembayaran_ortu')
        )
      );

      if (canSeeAudit) {
        unsubs.push(
          onSnapshot(
            query(collection(db, 'log_aktivitas'), orderBy('createdAt', 'desc')),
            (snap) => {
              setLogList(
                snap.docs.map((d) => ({ id: d.id, ...(d.data() as Omit<LogAktivitas, 'id'>) }))
              );
            },
            (err) => handleFirestoreError(err, OperationType.LIST, 'log_aktivitas')
          )
        );
      }

      if (isAdmin) {
        unsubs.push(
          onSnapshot(
            collection(db, 'users'),
            (snap) => {
              setUsersList(snap.docs.map((d) => ({ id: d.id, ...(d.data() as Omit<AppUser, 'id'>) })));
            },
            (err) => handleFirestoreError(err, OperationType.LIST, 'users')
          )
        );
        unsubs.push(
          onSnapshot(
            collection(db, 'role_invites'),
            (snap) => {
              setRoleInvites(
                snap.docs.map((d) => ({ id: d.id, ...(d.data() as Omit<RoleInvite, 'id'>) }))
              );
            },
            (err) => handleFirestoreError(err, OperationType.LIST, 'role_invites')
          )
        );
      }
    }

    return () => {
      unsubs.forEach((u) => u());
    };
  }, [isActiveVerified, isParentAccount, isStaffAccount, isAdmin, canSeeAudit, parentEmail]);

  const tahunAjaranAktif = useMemo(
    () => tahunAjaranList.find((t) => t.aktif) || tahunAjaranList[0] || null,
    [tahunAjaranList]
  );

  // Otomatis generate tagihan bulan berjalan untuk siswa aktif jika belum dibuat
  useEffect(() => {
    if (
      loadingData ||
      autoGenAttemptedRef.current ||
      !profile ||
      (profile.peran !== 'admin' && profile.peran !== 'petugas') ||
      !tahunAjaranAktif ||
      siswaList.length === 0 ||
      tarifList.length === 0
    ) {
      return;
    }

    const now = new Date();
    const bulan = now.getMonth() + 1;
    const tahun = now.getFullYear();

    const activeSiswa = siswaList.filter((s) => s.statusAktif === 'aktif');
    const existingForCurrentMonth = new Set(
      tagihanList.filter((t) => t.bulan === bulan && t.tahun === tahun).map((t) => t.siswaId)
    );
    const hasMissing = activeSiswa.some((s) => !existingForCurrentMonth.has(s.id));

    autoGenAttemptedRef.current = true;
    if (!hasMissing) return;

    void generateTagihanBulanan({
      bulan,
      tahun,
      tahunAjaranId: tahunAjaranAktif.id,
      siswaList,
      kelasList,
      tarifList,
      existingTagihan: tagihanList,
      actor: { uid: profile.uid, nama: profile.nama, peran: profile.peran },
    }).then((res) => {
      if (res.createdCount > 0) {
        setAutoGenerateNotice(
          `Tagihan otomatis bulan ini dibuat untuk ${res.createdCount} siswa aktif.`
        );
      }
    });
  }, [loadingData, profile, tahunAjaranAktif, siswaList, kelasList, tarifList, tagihanList]);

  return (
    <SppDataContext.Provider
      value={{
        sekolah,
        tahunAjaranList,
        tahunAjaranAktif,
        kelasList,
        tarifList,
        siswaList,
        tagihanList,
        pembayaranList,
        pembayaranOrtuList,
        logList,
        usersList,
        roleInvites,
        loadingData,
        autoGenerateNotice,
        dismissAutoGenerateNotice: () => setAutoGenerateNotice(null),
      }}
    >
      {children}
    </SppDataContext.Provider>
  );
}

export function useSppData(): SppDataContextValue {
  const ctx = useContext(SppDataContext);
  if (!ctx) throw new Error('useSppData harus digunakan di dalam SppDataProvider');
  return ctx;
}
